"""工作流进化器 — 进化工作流拓扑结构

进化操作（参考EvoAgentX）：
1. 节点增删：插入新agent或移除冗余agent
2. 连接变更：改变数据流向
3. 参数调优：调整节点配置
4. 并行化：发现可并行的串行节点

fitness = α×成功率 + β×速度 + γ×用户满意度
"""

import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_evolution.models import (
    EvoAgent, EvoWorkflowTemplate, EvoWorkflowInstance, EvoHistory,
)

logger = logging.getLogger(__name__)


class WorkflowEvolver:
    """工作流进化器"""

    async def evaluate_fitness(
        self, db: AsyncSession, template_id: str, company_id: str,
    ) -> dict:
        """评估工作流的适应度"""
        instances = (await db.execute(
            select(EvoWorkflowInstance).where(
                EvoWorkflowInstance.template_id == template_id,
                EvoWorkflowInstance.company_id == company_id,
                EvoWorkflowInstance.is_deleted == False,
            ).order_by(EvoWorkflowInstance.created_at.desc()).limit(50)
        )).scalars().all()

        if not instances:
            return {"fitness": 0, "success_rate": 0, "avg_duration": 0, "count": 0}

        total = len(instances)
        completed = sum(1 for i in instances if i.status == "completed")
        durations = [i.duration_ms for i in instances if i.duration_ms]

        success_rate = completed / total
        avg_duration = sum(durations) / max(1, len(durations)) if durations else 0

        # fitness计算
        alpha, beta, gamma = 0.5, 0.3, 0.2
        speed_score = max(0, 1 - (avg_duration / 60000))  # 60秒以内满分
        fitness = alpha * success_rate + beta * speed_score + gamma * 0.5  # 用户满意度暂用0.5

        return {
            "fitness": round(fitness, 3),
            "success_rate": round(success_rate, 3),
            "avg_duration_ms": round(avg_duration),
            "total_runs": total,
        }

    async def evolve_workflow(
        self,
        db: AsyncSession,
        template_id: str,
        company_id: str,
        user_id: str,
    ) -> list[dict]:
        """进化工作流拓扑"""
        from app.services.ai_gateway import ai_gateway

        template = (await db.execute(
            select(EvoWorkflowTemplate).where(EvoWorkflowTemplate.id == template_id)
        )).scalar_one_or_none()
        if not template:
            raise ValueError("工作流模板不存在")

        current_fitness = await self.evaluate_fitness(db, template_id, company_id)
        graph = template.graph_config or {}

        # 获取可用agents
        agents = (await db.execute(
            select(EvoAgent).where(
                EvoAgent.company_id == company_id,
                EvoAgent.status == "active",
                EvoAgent.is_deleted == False,
            )
        )).scalars().all()

        agent_list = [{"id": str(a.id), "name": a.name} for a in agents]

        prompt = (
            f"你是一个工作流优化专家。请优化以下工作流的DAG结构。\n\n"
            f"当前工作流：{template.name}\n"
            f"当前适应度：{current_fitness}\n"
            f"当前DAG：\n节点={graph.get('nodes', [])}\n边={graph.get('edges', [])}\n\n"
            f"可用Agent：{agent_list}\n\n"
            f"优化策略：\n"
            f"1. 是否有冗余节点可以删除？\n"
            f"2. 是否缺少必要的处理步骤？\n"
            f"3. 是否有可以并行执行的节点？\n"
            f"4. 数据流向是否可以优化？\n\n"
            f"生成2个优化变体，每个返回完整的新DAG：\n"
            f'[{{"nodes": [...], "edges": [...], "reason": "优化原因"}}]\n'
            f"直接输出JSON数组。"
        )

        try:
            result = await ai_gateway.routed_chat(
                [{"role": "user", "content": prompt}],
                task="evolution_generate",
            )
            parsed = ai_gateway.parse_json_response(result)
            if not isinstance(parsed, list):
                parsed = [parsed]
        except Exception as e:
            logger.exception("工作流进化失败: %s", e)
            return []

        variants = []
        for v in parsed[:2]:
            new_graph = {"nodes": v.get("nodes", graph.get("nodes", [])), "edges": v.get("edges", graph.get("edges", []))}
            reason = v.get("reason", "LLM优化")

            # 记录进化历史
            history = EvoHistory(
                company_id=company_id,
                created_by=user_id,
                workflow_id=template_id,
                level=2,
                evolution_type="workflow_restructure",
                old_content=str(graph),
                new_content=str(new_graph),
                diff_summary=reason,
                score_before=current_fitness.get("fitness", 0),
                status="pending",
            )
            db.add(history)
            await db.flush()
            await db.refresh(history)

            variants.append({
                "history_id": str(history.id),
                "graph_config": new_graph,
                "reason": reason,
                "status": "pending",
            })

        return variants

    async def apply_workflow_evolution(
        self,
        db: AsyncSession,
        history_id: str,
        approved_by: str,
    ) -> dict:
        """应用工作流进化结果"""
        history = (await db.execute(
            select(EvoHistory).where(EvoHistory.id == history_id)
        )).scalar_one_or_none()
        if not history:
            raise ValueError("进化记录不存在")

        template = (await db.execute(
            select(EvoWorkflowTemplate).where(EvoWorkflowTemplate.id == history.workflow_id)
        )).scalar_one_or_none()
        if not template:
            raise ValueError("工作流模板不存在")

        import json
        new_graph = json.loads(history.new_content) if isinstance(history.new_content, str) else history.new_content
        template.graph_config = new_graph
        template.version = (template.version or 1) + 1

        history.status = "approved"
        history.approved_by = approved_by
        history.approved_at = datetime.now()

        await db.flush()
        return {"template_id": str(template.id), "version": template.version}


# 全局单例
workflow_evolver = WorkflowEvolver()
