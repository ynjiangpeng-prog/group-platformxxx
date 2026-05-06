import json
import logging

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.agent.memory_service import save_memory
from app.services.ai_gateway import ai_gateway

logger = logging.getLogger(__name__)

MAX_EVENT_CONTEXT = 50


async def compress_project_context(
    db: AsyncSession,
    company_id: str,
    user_id: str,
    project_id: str,
) -> dict | None:
    from sqlalchemy import text
    rows = await db.execute(
        text("""
            SELECT event_type, entity_type, data, result, created_at
            FROM agent_events
            WHERE company_id = :cid AND entity_id = :pid
            ORDER BY created_at DESC LIMIT 100
        """),
        {"cid": company_id, "pid": project_id},
    )
    events = rows.fetchall()
    if len(events) < 10:
        return None

    event_summaries = []
    for r in events[:50]:
        event_summaries.append({
            "type": r[0], "entity": r[1],
            "data": r[2] if isinstance(r[2], dict) else {},
            "result": r[3] if isinstance(r[3], dict) else {},
            "time": str(r[4]),
        })

    try:
        prompt = (
            f"请分析以下项目事件历史，生成一个结构化摘要。保留关键决策、待办事项、里程碑和风险点。\n"
            f"事件列表：\n{json.dumps(event_summaries, ensure_ascii=False, default=str)}\n"
            "返回JSON格式：\n"
            '{"summary":"整体摘要","key_decisions":["决策1"],"pending_items":["待办1"],'
            '"milestones":["里程碑1"],"risks":["风险1"],"metrics":{"budget_used_pct":0,"progress_pct":0}}\n'
            "【重要】直接输出JSON对象，不要输出任何解释。"
        )
        result = await ai_gateway.provider.chat(
            [{"role": "user", "content": prompt}],
            model="glm-4-flash",
        )
        compressed = ai_gateway._parse_json(result)

        await save_memory(
            db, company_id, user_id,
            category="context",
            key=f"project_summary_{project_id}",
            value={"compressed": True, "event_count": len(events), "summary": compressed},
            source="system",
            confidence=0.8,
        )
        return compressed
    except Exception as e:
        logger.exception("上下文压缩失败: %s", e)
        return None


async def get_project_summary(
    db: AsyncSession,
    company_id: str,
    user_id: str,
    project_id: str,
) -> dict | None:
    from app.models.system.agent_models import AgentMemory
    mem = (await db.execute(
        select(AgentMemory).where(
            AgentMemory.company_id == company_id,
            AgentMemory.user_id == user_id,
            AgentMemory.key == f"project_summary_{project_id}",
            AgentMemory.is_deleted == False,
        )
    )).scalar_one_or_none()

    if mem and mem.value:
        data = mem.value if isinstance(mem.value, dict) else {}
        if data.get("compressed"):
            return data.get("summary")

    return await compress_project_context(db, company_id, user_id, project_id)
