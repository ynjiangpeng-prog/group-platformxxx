import json
import logging
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system.agent_models import AgentMemory, AgentUserProfile

logger = logging.getLogger(__name__)


async def save_memory(
    db: AsyncSession,
    company_id: str,
    user_id: str,
    category: str,
    key: str,
    value: dict,
    source: str = "user_explicit",
    confidence: float = 1.0,
) -> AgentMemory:
    existing = (await db.execute(
        select(AgentMemory).where(
            AgentMemory.company_id == company_id,
            AgentMemory.user_id == user_id,
            AgentMemory.key == key,
            AgentMemory.is_deleted == False,
        )
    )).scalar_one_or_none()

    if existing:
        existing.value = value
        existing.confidence = confidence
        existing.access_count = (existing.access_count or 0) + 1
        await db.flush()
        return existing

    memory = AgentMemory(
        user_id=user_id,
        category=category,
        key=key,
        value=value,
        confidence=confidence,
        source=source,
        company_id=company_id,
        created_by=user_id,
    )
    db.add(memory)
    await db.flush()
    return memory


async def recall_memories(
    db: AsyncSession,
    company_id: str,
    user_id: str,
    category: str | None = None,
    limit: int = 20,
) -> list[AgentMemory]:
    q = select(AgentMemory).where(
        AgentMemory.company_id == company_id,
        AgentMemory.user_id == user_id,
        AgentMemory.is_deleted == False,
    )
    if category:
        q = q.where(AgentMemory.category == category)
    q = q.order_by(AgentMemory.access_count.desc(), AgentMemory.created_at.desc()).limit(limit)
    result = await db.execute(q)
    memories = result.scalars().all()

    for m in memories:
        m.access_count = (m.access_count or 0) + 1
    await db.flush()

    return list(memories)


async def build_context_for_user(
    db: AsyncSession,
    company_id: str,
    user_id: str,
) -> dict:
    profile = await get_or_create_profile(db, company_id, user_id)
    memories = await recall_memories(db, company_id, user_id, limit=10)

    return {
        "profile": {
            "common_actions": profile.common_actions or [],
            "preferred_views": profile.preferred_views or {},
            "preferences": profile.preferences or {},
        },
        "recent_memories": [
            {"category": m.category, "key": m.key, "value": m.value}
            for m in memories
        ],
    }


async def get_or_create_profile(
    db: AsyncSession,
    company_id: str,
    user_id: str,
) -> AgentUserProfile:
    profile = (await db.execute(
        select(AgentUserProfile).where(
            AgentUserProfile.user_id == user_id,
            AgentUserProfile.company_id == company_id,
            AgentUserProfile.is_deleted == False,
        )
    )).scalar_one_or_none()

    if not profile:
        profile = AgentUserProfile(
            user_id=user_id,
            company_id=company_id,
            created_by=user_id,
        )
        db.add(profile)
        await db.flush()

    return profile


async def record_action(
    db: AsyncSession,
    company_id: str,
    user_id: str,
    action: str,
    context: dict | None = None,
):
    from sqlalchemy.orm.attributes import flag_modified

    profile = await get_or_create_profile(db, company_id, user_id)
    actions = list(profile.common_actions or [])
    found = False
    for a in actions:
        if isinstance(a, dict) and a.get("action") == action:
            a["count"] = a.get("count", 0) + 1
            a["last_used"] = datetime.now().isoformat()
            found = True
            break
    if not found:
        actions.append({"action": action, "count": 1, "last_used": datetime.now().isoformat()})
    actions.sort(key=lambda x: x.get("count", 0), reverse=True)
    profile.common_actions = actions[:50]
    flag_modified(profile, "common_actions")

    if context:
        profile.last_active_context = context

    await db.flush()


async def parse_memory_command(text: str) -> dict | None:
    if not text.startswith("记住"):
        return None

    content = text[2:].strip()
    if not content:
        return None

    parts = content.split("：", 1)
    if len(parts) == 2:
        return {"category": "preference", "key": parts[0].strip(), "value": {"content": parts[1].strip()}}
    return {"category": "context", "key": "user_note", "value": {"content": content}}


async def get_personalized_suggestions(
    db: AsyncSession,
    company_id: str,
    user_id: str,
) -> list[dict]:
    profile = await get_or_create_profile(db, company_id, user_id)
    actions = profile.common_actions or []
    preferences = profile.preferences or {}

    suggestions = []
    for action in actions[:10]:
        if action.get("count", 0) >= 3:
            suggestions.append({
                "type": "skill_candidate",
                "action": action["action"],
                "count": action["count"],
                "label": f"可自动化: {action['action']} (已执行{action['count']}次)",
                "suggestion": f"你已执行'{action['action']}' {action['count']}次，建议创建为技能以实现一键执行",
            })

    if preferences:
        for key, value in (preferences if isinstance(preferences, list) else [preferences]):
            if isinstance(value, dict) and value.get("content"):
                suggestions.append({
                    "type": "preference",
                    "key": key,
                    "label": f"偏好: {value['content'][:50]}",
                })

    return suggestions
