"""Agent注册表

管理agent的注册、发现、启用/禁用、版本管理。
每个agent声明：名称、能力、输入/输出schema、依赖。"""

import json
import logging
from datetime import datetime
from uuid import uuid4

from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_evolution.models import EvoAgent

logger = logging.getLogger(__name__)

# 预置agent模板（系统初始化时注册）
BUILTIN_AGENTS = [
    {
        "name": "智能报告生成",
        "description": "根据数据和需求自动生成经营分析报告、周报、月报",
        "capabilities": {"category": "report", "tags": ["报告", "分析", "汇总"]},
        "system_prompt": (
            "你是集团管理平台的智能报告分析师。根据提供的数据，生成结构清晰、有洞察力的报告。\n"
            "要求：\n1. 数据先行，用具体数字说话\n2. 发现趋势和异常\n3. 给出可操作建议\n4. 格式使用Markdown"
        ),
        "tools": [{"name": "query_data", "description": "查询业务数据"}],
        "input_schema": {"type": "object", "properties": {"report_type": {"type": "string"}, "params": {"type": "object"}}},
        "output_schema": {"type": "object", "properties": {"report": {"type": "string"}, "charts": {"type": "array"}}},
        "config": {"model": "glm-5.1", "temperature": 0.5},
    },
    {
        "name": "风险预警",
        "description": "监控项目、财务、运营数据，自动识别风险并发出预警",
        "capabilities": {"category": "monitoring", "tags": ["风险", "预警", "监控"]},
        "system_prompt": (
            "你是集团管理平台的风险监控专家。根据数据变化，识别潜在风险并分级预警。\n"
            "风险等级：critical(严重)/warning(警告)/info(提示)\n"
            "要求：\n1. 对比历史数据和阈值\n2. 分析根本原因\n3. 提出应对措施"
        ),
        "tools": [{"name": "check_threshold", "description": "检查阈值配置"}],
        "input_schema": {"type": "object", "properties": {"data_type": {"type": "string"}, "values": {"type": "object"}}},
        "output_schema": {"type": "object", "properties": {"alerts": {"type": "array"}, "summary": {"type": "string"}}},
        "config": {"model": "glm-5.1", "temperature": 0.3},
    },
    {
        "name": "数据分析",
        "description": "对业务数据进行深度分析，发现模式和洞察",
        "capabilities": {"category": "analytics", "tags": ["数据", "分析", "趋势"]},
        "system_prompt": (
            "你是集团管理平台的数据分析师。对提供的业务数据进行深度分析。\n"
            "要求：\n1. 描述性统计（总量、均值、趋势）\n2. 异常点识别\n3. 相关性分析\n4. 预测建议"
        ),
        "tools": [{"name": "query_data", "description": "查询业务数据"}],
        "input_schema": {"type": "object", "properties": {"question": {"type": "string"}, "context": {"type": "object"}}},
        "output_schema": {"type": "object", "properties": {"analysis": {"type": "string"}, "data_points": {"type": "array"}}},
        "config": {"model": "glm-5.1", "temperature": 0.4},
    },
    {
        "name": "工单路由",
        "description": "根据工单内容自动识别类型、评估优先级、路由到合适的处理人",
        "capabilities": {"category": "workflow", "tags": ["工单", "路由", "派发"]},
        "system_prompt": (
            "你是集团管理平台的智能调度员。根据工单描述，自动分类和路由。\n"
            "工单类型：设备故障/客户投诉/施工问题/财务异常/其他\n"
            "优先级：urgent/high/medium/low\n"
            "要求分析工单内容，给出类型、优先级和建议处理部门。"
        ),
        "tools": [],
        "input_schema": {"type": "object", "properties": {"ticket_content": {"type": "string"}}},
        "output_schema": {"type": "object", "properties": {"category": {"type": "string"}, "priority": {"type": "string"}, "assign_to": {"type": "string"}}},
        "config": {"model": "glm-5.1", "temperature": 0.2},
    },
    {
        "name": "知识问答",
        "description": "回答关于公司业务、流程、制度的自然语言问题",
        "capabilities": {"category": "qa", "tags": ["问答", "知识", "咨询"]},
        "system_prompt": (
            "你是集团管理平台的知识助手。回答关于充电桩运营、电力工程、项目管理的问题。\n"
            "要求：\n1. 回答准确、有依据\n2. 不确定的要说明\n3. 给出相关建议"
        ),
        "tools": [{"name": "search_knowledge", "description": "搜索知识库"}],
        "input_schema": {"type": "object", "properties": {"question": {"type": "string"}}},
        "output_schema": {"type": "object", "properties": {"answer": {"type": "string"}, "references": {"type": "array"}}},
        "config": {"model": "glm-5.1", "temperature": 0.5},
    },
]


class AgentRegistry:
    """Agent注册表 — 管理agent的生命周期和元数据"""

    async def register(
        self,
        db: AsyncSession,
        company_id: str,
        user_id: str,
        name: str,
        description: str | None = None,
        capabilities: dict | None = None,
        system_prompt: str | None = None,
        tools: list | None = None,
        input_schema: dict | None = None,
        output_schema: dict | None = None,
        config: dict | None = None,
    ) -> EvoAgent:
        """注册新agent"""
        agent = EvoAgent(
            company_id=company_id,
            created_by=user_id,
            name=name,
            description=description,
            capabilities=capabilities or {},
            status="active",
            version=1,
            system_prompt=system_prompt,
            tools=tools or [],
            input_schema=input_schema,
            output_schema=output_schema,
            config=config or {},
        )
        db.add(agent)
        await db.flush()
        await db.refresh(agent)
        return agent

    async def get(self, db: AsyncSession, agent_id: str) -> EvoAgent | None:
        """获取agent"""
        return (await db.execute(
            select(EvoAgent).where(EvoAgent.id == agent_id, EvoAgent.is_deleted == False)
        )).scalar_one_or_none()

    async def list_agents(
        self,
        db: AsyncSession,
        company_id: str,
        status: str | None = None,
        category: str | None = None,
        keyword: str | None = None,
    ) -> list[EvoAgent]:
        """列出公司下的所有agent"""
        stmt = select(EvoAgent).where(
            EvoAgent.company_id == company_id,
            EvoAgent.is_deleted == False,
        )
        if status:
            stmt = stmt.where(EvoAgent.status == status)
        if keyword:
            stmt = stmt.where(
                or_(
                    EvoAgent.name.ilike(f"%{keyword}%"),
                    EvoAgent.description.ilike(f"%{keyword}%"),
                )
            )
        return (await db.execute(stmt.order_by(EvoAgent.created_at.desc()))).scalars().all()

    async def update_agent(self, db: AsyncSession, agent_id: str, **kwargs) -> EvoAgent | None:
        """更新agent配置"""
        agent = await self.get(db, agent_id)
        if not agent:
            return None
        for k, v in kwargs.items():
            if hasattr(agent, k) and v is not None:
                setattr(agent, k, v)
        await db.flush()
        await db.refresh(agent)
        return agent

    async def toggle_status(self, db: AsyncSession, agent_id: str, status: str) -> EvoAgent | None:
        """切换agent状态"""
        return await self.update_agent(db, agent_id, status=status)

    async def delete(self, db: AsyncSession, agent_id: str) -> bool:
        """软删除agent"""
        agent = await self.get(db, agent_id)
        if not agent:
            return False
        agent.is_deleted = True
        await db.flush()
        return True

    async def init_builtins(self, db: AsyncSession, company_id: str, user_id: str) -> int:
        """初始化预置agent模板"""
        count = 0
        for tpl in BUILTIN_AGENTS:
            existing = (await db.execute(
                select(EvoAgent).where(
                    EvoAgent.company_id == company_id,
                    EvoAgent.name == tpl["name"],
                    EvoAgent.is_deleted == False,
                )
            )).scalar_one_or_none()
            if existing:
                continue
            await self.register(db, company_id, user_id, **tpl)
            count += 1
        return count

    async def get_stats(self, db: AsyncSession, company_id: str) -> dict:
        """获取agent统计信息"""
        agents = await self.list_agents(db, company_id)
        total = len(agents)
        active = sum(1 for a in agents if a.status == "active")
        avg_quality = (
            sum(a.quality_score for a in agents if a.quality_score) /
            max(1, sum(1 for a in agents if a.quality_score))
        )
        total_executions = sum(a.execution_count or 0 for a in agents)
        return {
            "total": total,
            "active": active,
            "disabled": total - active,
            "avg_quality": round(avg_quality, 2),
            "total_executions": total_executions,
        }


# 全局单例
agent_registry = AgentRegistry()
