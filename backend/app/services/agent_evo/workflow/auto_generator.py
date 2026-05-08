"""工作流自动生成器 — 根据自然语言描述自动生成工作流DAG

流程：
1. 用户输入自然语言描述
2. LLM分解为子任务
3. 查询AgentRegistry找到能处理每个子任务的agent
4. 自动构建WorkflowGraph
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_evolution.models import EvoAgent, EvoWorkflowTemplate

logger = logging.getLogger(__name__)


class WorkflowAutoGenerator:
    """工作流自动生成器"""

    async def generate(
        self,
        db: AsyncSession,
        company_id: str,
        user_id: str,
        description: str,
        name: str | None = None,
    ) -> EvoWorkflowTemplate:
        """根据描述自动生成工作流模板"""
        from app.services.ai_gateway import ai_gateway

        # 获取可用agents
        agents = (await db.execute(
            select(EvoAgent).where(
                EvoAgent.company_id == company_id,
                EvoAgent.status == "active",
                EvoAgent.is_deleted == False,
            )
        )).scalars().all()

        agent_list = [
            {"id": str(a.id), "name": a.name, "capabilities": a.capabilities}
            for a in agents
        ]

        prompt = (
            f"根据以下描述，自动设计一个多步骤工作流。\n\n"
            f"用户描述：{description}\n\n"
            f"可用的Agent列表：\n"
        )
        for a in agent_list:
            prompt += f"- {a['name']} (ID: {a['id']}): {a.get('capabilities', {})}\n"

        prompt += (
            f"\n请设计工作流的DAG结构，返回JSON：\n"
            f"{{\n"
            f'  "name": "工作流名称",\n'
            f'  "description": "描述",\n'
            f'  "nodes": [\n'
            f'    {{"id": "step_1", "name": "步骤名", "agent_id": "agent的ID或null", "params": {{}}}}\n'
            f'  ],\n'
            f'  "edges": [\n'
            f'    {{"source": "step_1", "target": "step_2", "field_mapping": {{}}}}\n'
            f'  ]\n'
            f"}}\n\n"
            f"要求：\n"
            f"1. 步骤要合理分解，不要太多或太少（3-7步）\n"
            f"2. 尽量使用现有agent，如果找不到合适的agent_id设为null\n"
            f"3. 数据流向要合理，上游的输出作为下游的输入\n"
            f"4. 直接输出JSON，不要其他文字"
        )

        try:
            result = await ai_gateway.routed_chat(
                [{"role": "user", "content": prompt}],
                task="evolution_generate",
            )
            parsed = ai_gateway.parse_json_response(result)
        except Exception as e:
            logger.exception("工作流自动生成失败: %s", e)
            parsed = {
                "name": name or "自动生成工作流",
                "description": description,
                "nodes": [{"id": "step_1", "name": "处理", "agent_id": None}],
                "edges": [],
            }

        graph_config = {
            "nodes": parsed.get("nodes", []),
            "edges": parsed.get("edges", []),
        }

        name = name or parsed.get("name", "自动生成工作流")

        # 通过engine创建模板（带DAG校验）
        from app.services.agent_evo.workflow.engine import workflow_engine
        template = await workflow_engine.create_template(
            db, company_id, user_id,
            name=name,
            description=parsed.get("description", description),
            graph_config=graph_config,
            category="auto_generated",
        )
        return template


# 全局单例
workflow_auto_generator = WorkflowAutoGenerator()
