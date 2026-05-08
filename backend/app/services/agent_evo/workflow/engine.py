"""工作流引擎 — 基于DAG的多智能体工作流

核心数据结构：
- WorkflowGraph: 有向无环图
  - 节点 = Agent调用（agent_id + 输入映射）
  - 边 = 数据流（上游输出 → 下游输入的字段映射）

执行逻辑：
1. 拓扑排序确定执行顺序
2. 无依赖的节点并行执行
3. 每个节点执行完后映射数据到下游
4. 支持条件分支
"""

import asyncio
import logging
import time
from collections import defaultdict
from datetime import datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_evolution.models import (
    EvoAgent, EvoWorkflowTemplate, EvoWorkflowInstance, EvoNodeExecution,
)
from app.services.agent_evo.lifecycle import agent_lifecycle

logger = logging.getLogger(__name__)


class WorkflowEngine:
    """工作流引擎 — 执行DAG工作流"""

    async def create_template(
        self,
        db: AsyncSession,
        company_id: str,
        user_id: str,
        name: str,
        description: str | None = None,
        graph_config: dict | None = None,
        category: str | None = None,
    ) -> EvoWorkflowTemplate:
        """创建工作流模板"""
        self._validate_graph(graph_config or {})
        template = EvoWorkflowTemplate(
            company_id=company_id,
            created_by=user_id,
            name=name,
            description=description,
            graph_config=graph_config,
            status="draft",
            version=1,
            category=category,
        )
        db.add(template)
        await db.flush()
        await db.refresh(template)
        return template

    async def execute(
        self,
        db: AsyncSession,
        template_id: str,
        company_id: str,
        user_id: str,
        input_data: dict | None = None,
    ) -> dict:
        """执行工作流"""
        template = (await db.execute(
            select(EvoWorkflowTemplate).where(
                EvoWorkflowTemplate.id == template_id,
                EvoWorkflowTemplate.company_id == company_id,
                EvoWorkflowTemplate.is_deleted == False,
            )
        )).scalar_one_or_none()
        if not template:
            raise ValueError("工作流模板不存在")

        graph = template.graph_config or {}
        nodes = graph.get("nodes", [])
        edges = graph.get("edges", [])

        if not nodes:
            raise ValueError("工作流没有节点")

        # 创建实例
        instance_id = uuid4()
        instance = EvoWorkflowInstance(
            id=instance_id,
            company_id=company_id,
            created_by=user_id,
            template_id=template_id,
            input_data=input_data,
            status="running",
            started_at=datetime.now(),
        )
        db.add(instance)

        # 初始化节点执行记录
        node_exec_map: dict[str, str] = {}
        for node in nodes:
            ne = EvoNodeExecution(
                company_id=company_id,
                created_by=user_id,
                workflow_instance_id=instance_id,
                node_id=node["id"],
                agent_id=node.get("agent_id"),
                status="pending",
            )
            db.add(ne)
            await db.flush()
            await db.refresh(ne)
            node_exec_map[node["id"]] = str(ne.id)

        await db.flush()

        # 拓扑排序
        execution_order = self._topological_sort(nodes, edges)

        # 执行
        t0 = time.monotonic()
        node_outputs: dict[str, dict] = {}
        all_success = True

        try:
            for layer in execution_order:
                # 同层节点无依赖，可以并行执行
                async def _run_node(nid: str) -> tuple[str, dict | None, bool]:
                    node = next((n for n in nodes if n["id"] == nid), None)
                    if not node:
                        return nid, None, False

                    ne_id = node_exec_map[nid]
                    ne = (await db.execute(
                        select(EvoNodeExecution).where(EvoNodeExecution.id == ne_id)
                    )).scalar_one()

                    node_input = self._prepare_node_input(
                        node, edges, node_outputs, input_data or {}
                    )

                    ne.status = "running"
                    ne.input_data = node_input
                    ne.started_at = datetime.now()
                    await db.flush()

                    try:
                        agent_id = node.get("agent_id")
                        if agent_id:
                            result = await agent_lifecycle.execute_agent(
                                db, agent_id, company_id, user_id,
                                input_data=node_input,
                                task_type="workflow_node",
                                workflow_instance_id=instance_id,
                            )
                            output = result.get("output", {})
                        else:
                            output = node_input

                        ne.output_data = output
                        ne.status = "completed"
                        ne.completed_at = datetime.now()
                        await db.flush()
                        return nid, output, False

                    except Exception as e:
                        ne.status = "failed"
                        ne.error_message = str(e)
                        ne.completed_at = datetime.now()
                        await db.flush()
                        logger.exception("节点执行失败: %s", nid)
                        return nid, None, not node.get("continue_on_error", False)

                if len(layer) == 1:
                    nid, out, should_stop = await _run_node(layer[0])
                    if out is not None:
                        node_outputs[nid] = out
                    if should_stop:
                        all_success = False
                        break
                else:
                    results = await asyncio.gather(*[_run_node(nid) for nid in layer])
                    stop_all = False
                    for nid, out, should_stop in results:
                        if out is not None:
                            node_outputs[nid] = out
                        if should_stop:
                            all_success = False
                            stop_all = True
                    if stop_all:
                        break

            # 更新实例
            duration_ms = int((time.monotonic() - t0) * 1000)
            instance.status = "completed" if all_success else "failed"
            instance.completed_at = datetime.now()
            instance.duration_ms = duration_ms
            instance.output_data = node_outputs

            # 收集最终输出 — 取DAG的sink节点（无出边的节点）
            sink_node_ids = set(n["id"] for n in nodes)
            for edge in edges:
                sink_node_ids.discard(edge["source"])
            final_output = {}
            for sink_id in sink_node_ids:
                if sink_id in node_outputs:
                    final_output.update(node_outputs[sink_id])
            if not final_output:
                final_output = node_outputs

            await db.flush()

            return {
                "instance_id": instance_id,
                "status": instance.status,
                "duration_ms": duration_ms,
                "output": final_output,
                "node_count": len(nodes),
                "success_count": sum(1 for n in nodes if node_outputs.get(n["id"]) is not None),
            }

        except Exception as e:
            instance.status = "failed"
            instance.error_message = str(e)
            instance.completed_at = datetime.now()
            instance.duration_ms = int((time.monotonic() - t0) * 1000)
            await db.flush()
            raise

    async def list_templates(
        self, db: AsyncSession, company_id: str, status: str | None = None,
    ) -> list[EvoWorkflowTemplate]:
        """列出工作流模板"""
        stmt = select(EvoWorkflowTemplate).where(
            EvoWorkflowTemplate.company_id == company_id,
            EvoWorkflowTemplate.is_deleted == False,
        )
        if status:
            stmt = stmt.where(EvoWorkflowTemplate.status == status)
        return (await db.execute(stmt.order_by(EvoWorkflowTemplate.created_at.desc()))).scalars().all()

    async def get_template(self, db: AsyncSession, template_id: str) -> EvoWorkflowTemplate | None:
        """获取模板"""
        return (await db.execute(
            select(EvoWorkflowTemplate).where(EvoWorkflowTemplate.id == template_id)
        )).scalar_one_or_none()

    async def list_instances(
        self, db: AsyncSession, template_id: str | None = None, company_id: str | None = None, limit: int = 20,
    ) -> list[EvoWorkflowInstance]:
        """列出工作流实例"""
        stmt = select(EvoWorkflowInstance).where(
            EvoWorkflowInstance.is_deleted == False,
        )
        if company_id:
            stmt = stmt.where(EvoWorkflowInstance.company_id == company_id)
        if template_id:
            stmt = stmt.where(EvoWorkflowInstance.template_id == template_id)
        return (await db.execute(stmt.order_by(EvoWorkflowInstance.created_at.desc()).limit(limit))).scalars().all()

    async def init_preset_workflows(
        self, db: AsyncSession, company_id: str, user_id: str,
    ) -> int:
        """初始化预置工作流模板（幂等）"""
        from app.services.agent_evo.workflow.presets import ALL_PRESETS

        count = 0
        for preset in ALL_PRESETS:
            existing = (await db.execute(
                select(EvoWorkflowTemplate).where(
                    EvoWorkflowTemplate.company_id == company_id,
                    EvoWorkflowTemplate.name == preset["name"],
                    EvoWorkflowTemplate.is_deleted == False,
                )
            )).scalar_one_or_none()
            if existing:
                continue

            self._validate_graph(preset.get("graph_config", {}))
            template = EvoWorkflowTemplate(
                company_id=company_id,
                created_by=user_id,
                name=preset["name"],
                description=preset["description"],
                graph_config=preset["graph_config"],
                status="active",
                version=1,
                category=preset.get("category"),
            )
            db.add(template)
            count += 1

        await db.flush()
        return count

    def _validate_graph(self, graph: dict):
        """校验DAG合法性"""
        nodes = graph.get("nodes", [])
        edges = graph.get("edges", [])
        node_ids = {n["id"] for n in nodes}

        for edge in edges:
            if edge.get("source") not in node_ids:
                raise ValueError(f"边引用了不存在的节点: {edge.get('source')}")
            if edge.get("target") not in node_ids:
                raise ValueError(f"边引用了不存在的节点: {edge.get('target')}")

        # 检查环
        adj: dict[str, list[str]] = defaultdict(list)
        for edge in edges:
            adj[edge["source"]].append(edge["target"])

        visited: set[str] = set()
        in_stack: set[str] = set()

        def has_cycle(node_id: str) -> bool:
            visited.add(node_id)
            in_stack.add(node_id)
            for neighbor in adj.get(node_id, []):
                if neighbor in in_stack:
                    return True
                if neighbor not in visited and has_cycle(neighbor):
                    return True
            in_stack.discard(node_id)
            return False

        for nid in node_ids:
            if nid not in visited:
                if has_cycle(nid):
                    raise ValueError("工作流包含环，不是有效的DAG")

    def _topological_sort(self, nodes: list[dict], edges: list[dict]) -> list[list[str]]:
        """拓扑排序 — 返回按层分组的执行顺序"""
        node_ids = [n["id"] for n in nodes]
        in_degree: dict[str, int] = {nid: 0 for nid in node_ids}
        adj: dict[str, list[str]] = defaultdict(list)

        for edge in edges:
            src, tgt = edge["source"], edge["target"]
            adj[src].append(tgt)
            in_degree[tgt] += 1

        layers = []
        remaining = set(node_ids)

        while remaining:
            # 找出所有入度为0的节点
            ready = [nid for nid in remaining if in_degree[nid] == 0]
            if not ready:
                raise ValueError("检测到环，无法拓扑排序")
            layers.append(ready)
            for nid in ready:
                remaining.discard(nid)
                for neighbor in adj.get(nid, []):
                    in_degree[neighbor] -= 1

        return layers

    def _prepare_node_input(
        self,
        node: dict,
        edges: list[dict],
        node_outputs: dict[str, dict],
        global_input: dict,
    ) -> dict:
        """准备节点输入 — 从上游输出和全局输入映射"""
        node_input = {}
        node_id = node["id"]

        # 全局输入映射
        input_mapping = node.get("input_mapping", {})
        if input_mapping:
            for target_key, source_path in input_mapping.items():
                if source_path.startswith("$global."):
                    key = source_path.replace("$global.", "")
                    node_input[target_key] = global_input.get(key)
                elif source_path.startswith("$input."):
                    key = source_path.replace("$input.", "")
                    node_input[target_key] = global_input.get(key)
        else:
            # 默认：收集所有上游输出 + 全局输入
            for edge in edges:
                if edge["target"] == node_id:
                    source_output = node_outputs.get(edge["source"], {})
                    field_map = edge.get("field_mapping", {})
                    if field_map:
                        for target_key, source_key in field_map.items():
                            node_input[target_key] = source_output.get(source_key)
                    else:
                        node_input.update(source_output)

            if not node_input:
                node_input = global_input.copy()

        # 节点自身的固定参数
        params = node.get("params", {})
        if params:
            node_input.update(params)

        return node_input


# 全局单例
workflow_engine = WorkflowEngine()
