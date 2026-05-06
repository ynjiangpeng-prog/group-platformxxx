import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system.models import SystemConfigKV

logger = logging.getLogger(__name__)

DEFAULT_FLAGS = {
    "agent_proactive_suggestions": True,
    "agent_auto_skill_creation": False,
    "agent_parallel_analysis": True,
    "agent_predictive_maintenance": False,
    "command_palette_ai": True,
    "agent_context_compression": True,
    "agent_event_recording": True,
    "agent_role_prompts": True,
}


async def is_enabled(db: AsyncSession, company_id: str, flag_name: str, default: bool = False) -> bool:
    result = await db.execute(
        select(SystemConfigKV.value).where(
            SystemConfigKV.key == f"flag.{company_id}.{flag_name}",
            SystemConfigKV.category == "feature_flag",
        )
    )
    val = result.scalar_one_or_none()
    if val is not None:
        return val.lower() in ("true", "1", "yes")

    result = await db.execute(
        select(SystemConfigKV.value).where(
            SystemConfigKV.key == f"flag.global.{flag_name}",
            SystemConfigKV.category == "feature_flag",
        )
    )
    val = result.scalar_one_or_none()
    if val is not None:
        return val.lower() in ("true", "1", "yes")

    return DEFAULT_FLAGS.get(flag_name, default)


async def set_flag(db: AsyncSession, company_id: str, flag_name: str, enabled: bool):
    key = f"flag.{company_id}.{flag_name}"
    existing = (await db.execute(
        select(SystemConfigKV).where(SystemConfigKV.key == key)
    )).scalar_one_or_none()
    if existing:
        existing.value = str(enabled).lower()
    else:
        db.add(SystemConfigKV(
            key=key,
            value=str(enabled).lower(),
            category="feature_flag",
        ))
    await db.flush()


async def list_flags(db: AsyncSession, company_id: str) -> list[dict]:
    flags = []
    for name, default_val in DEFAULT_FLAGS.items():
        enabled = await is_enabled(db, company_id, name, default_val)
        flags.append({"name": name, "enabled": enabled, "default": default_val})
    return flags


async def init_default_flags(db: AsyncSession):
    for name, default_val in DEFAULT_FLAGS.items():
        existing = (await db.execute(
            select(SystemConfigKV).where(
                SystemConfigKV.key == f"flag.global.{name}",
                SystemConfigKV.category == "feature_flag",
            )
        )).scalar_one_or_none()
        if not existing:
            db.add(SystemConfigKV(
                key=f"flag.global.{name}",
                value=str(default_val).lower(),
                category="feature_flag",
            ))
    await db.flush()
