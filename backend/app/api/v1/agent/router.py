import json
import logging
import time as _time
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.models.system.agent_models import AgentSkill, AgentTask, AgentMemory, AgentUserProfile
from app.services.agent.skill_engine import execute_skill, create_template_skills
from app.services.agent.task_engine import delegate_task
from app.services.agent.memory_service import (
    save_memory, recall_memories, build_context_for_user,
    get_or_create_profile, record_action, parse_memory_command,
    get_personalized_suggestions,
)
from app.services.agent.event_bus import AgentEvent, TimedEvent
from app.services.agent.prompt_orchestrator import build_role_prompt, detect_user_role
from app.services.agent.feature_flags import is_enabled, list_flags, set_flag
from app.services.agent.context_compressor import get_project_summary

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agent", tags=["Agent智能"])


# ── Schemas ──

class SkillCreate(BaseModel):
    name: str
    description: str = ""
    trigger_type: str = "manual"
    trigger_config: dict = {}
    steps: list[dict] = []
    parameters: dict = {}
    category: str | None = None
    icon: str | None = None

class SkillUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    trigger_type: str | None = None
    trigger_config: dict | None = None
    steps: list[dict] | None = None
    parameters: dict | None = None
    category: str | None = None
    icon: str | None = None

class SkillExecute(BaseModel):
    parameters: dict = {}

class TaskDelegate(BaseModel):
    title: str
    subtasks: list[dict]
    agent_model: str | None = None

class MemorySave(BaseModel):
    category: str
    key: str
    value: dict
    source: str = "user_explicit"
    confidence: float = 1.0

class NLCommand(BaseModel):
    text: str

class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []

class FlagUpdate(BaseModel):
    flag_name: str
    enabled: bool


# ── Skills ──

@router.get("/skills")
async def list_skills(
    category: str | None = None,
    trigger_type: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(AgentSkill).where(
        AgentSkill.company_id == current_user.company_id,
        AgentSkill.is_deleted == False,
    )
    if category:
        q = q.where(AgentSkill.category == category)
    if trigger_type:
        q = q.where(AgentSkill.trigger_type == trigger_type)
    q = q.order_by(AgentSkill.created_at.desc())
    result = await db.execute(q)
    skills = result.scalars().all()
    return {"items": [
        {
            "id": str(s.id), "name": s.name, "description": s.description,
            "trigger_type": s.trigger_type, "trigger_config": s.trigger_config,
            "steps": s.steps, "parameters": s.parameters,
            "usage_count": s.usage_count, "success_count": s.success_count,
            "success_rate": round((s.success_count or 0) / max(s.usage_count or 1, 1) * 100, 1),
            "last_used_at": str(s.last_used_at) if s.last_used_at else None,
            "created_from": s.created_from, "is_template": s.is_template,
            "icon": s.icon, "category": s.category,
        }
        for s in skills
    ]}


@router.post("/skills")
async def create_skill(
    body: SkillCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    skill = AgentSkill(
        name=body.name,
        description=body.description,
        trigger_type=body.trigger_type,
        trigger_config=body.trigger_config,
        steps=body.steps,
        parameters=body.parameters,
        category=body.category,
        icon=body.icon,
        created_from="manual",
        company_id=current_user.company_id,
        created_by=str(current_user.id),
    )
    db.add(skill)
    await db.flush()
    return {"id": str(skill.id), "name": skill.name}


@router.get("/skills/{skill_id}")
async def get_skill(
    skill_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    skill = await db.get(AgentSkill, skill_id)
    if not skill or skill.is_deleted or skill.company_id != current_user.company_id:
        raise HTTPException(404, "技能不存在")
    return {
        "id": str(skill.id), "name": skill.name, "description": skill.description,
        "trigger_type": skill.trigger_type, "trigger_config": skill.trigger_config,
        "steps": skill.steps, "parameters": skill.parameters,
        "usage_count": skill.usage_count, "success_count": skill.success_count,
        "last_used_at": str(skill.last_used_at) if skill.last_used_at else None,
        "created_from": skill.created_from, "is_template": skill.is_template,
        "icon": skill.icon, "category": skill.category,
    }


@router.put("/skills/{skill_id}")
async def update_skill(
    skill_id: str,
    body: SkillUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    skill = await db.get(AgentSkill, skill_id)
    if not skill or skill.is_deleted or skill.company_id != current_user.company_id:
        raise HTTPException(404, "技能不存在")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(skill, field, value)
    skill.updated_by = str(current_user.id)
    await db.flush()
    return {"id": str(skill.id)}


@router.delete("/skills/{skill_id}")
async def delete_skill(
    skill_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    skill = await db.get(AgentSkill, skill_id)
    if not skill or skill.is_deleted or skill.company_id != current_user.company_id:
        raise HTTPException(404, "技能不存在")
    skill.is_deleted = True
    await db.flush()
    return {"ok": True}


@router.post("/skills/{skill_id}/execute")
async def execute_skill_endpoint(
    skill_id: str,
    body: SkillExecute,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    skill = await db.get(AgentSkill, skill_id)
    if not skill or skill.is_deleted or skill.company_id != current_user.company_id:
        raise HTTPException(404, "技能不存在")

    bus = AgentEvent(db, current_user.company_id, str(current_user.id))
    timed = TimedEvent(bus, "skill.executed", entity_type="skill", entity_id=skill_id)

    await record_action(db, current_user.company_id, str(current_user.id),
                        f"skill.execute:{skill.name}", {"skill_id": skill_id})

    try:
        task = await execute_skill(db, skill, body.parameters, str(current_user.id), current_user.company_id)
        await timed.complete({"task_id": str(task.id), "status": task.status})
        return {
            "task_id": str(task.id), "status": task.status,
            "output": task.output, "error": task.error_message,
        }
    except Exception as e:
        await timed.fail(str(e))
        raise


@router.post("/skills/init-templates")
async def init_templates(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    created = await create_template_skills(db, current_user.company_id, str(current_user.id))
    return {"created": created, "count": len(created)}


# ── Tasks ──

@router.get("/tasks")
async def list_tasks(
    parent_id: str | None = None,
    status: str | None = None,
    limit: int = Query(20, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(AgentTask).where(
        AgentTask.company_id == current_user.company_id,
        AgentTask.is_deleted == False,
    )
    if parent_id:
        q = q.where(AgentTask.parent_id == parent_id)
    elif status:
        q = q.where(AgentTask.status == status)
    q = q.order_by(AgentTask.created_at.desc()).limit(limit)
    result = await db.execute(q)
    tasks = result.scalars().all()
    return {"items": [
        {
            "id": str(t.id), "parent_id": str(t.parent_id) if t.parent_id else None,
            "skill_id": str(t.skill_id) if t.skill_id else None,
            "task_type": t.task_type, "status": t.status, "title": t.title,
            "input": t.input, "output": t.output, "error_message": t.error_message,
            "progress": t.progress, "started_at": str(t.started_at) if t.started_at else None,
            "completed_at": str(t.completed_at) if t.completed_at else None,
            "created_at": str(t.created_at),
        }
        for t in tasks
    ]}


@router.post("/tasks/delegate")
async def delegate_task_endpoint(
    body: TaskDelegate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await delegate_task(
        db, current_user.company_id, str(current_user.id),
        body.title, body.subtasks, body.agent_model,
    )
    return {"task_id": str(task.id), "status": task.status, "title": task.title}


@router.get("/tasks/{task_id}")
async def get_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(AgentTask, task_id)
    if not task or task.is_deleted or task.company_id != current_user.company_id:
        raise HTTPException(404, "任务不存在")

    children = []
    if task.task_type == "delegation":
        result = await db.execute(
            select(AgentTask).where(
                AgentTask.parent_id == task_id,
                AgentTask.is_deleted == False,
            ).order_by(AgentTask.created_at)
        )
        children = [
            {
                "id": str(t.id), "task_type": t.task_type, "status": t.status,
                "title": t.title, "progress": t.progress, "error_message": t.error_message,
                "started_at": str(t.started_at) if t.started_at else None,
                "completed_at": str(t.completed_at) if t.completed_at else None,
            }
            for t in result.scalars().all()
        ]

    return {
        "id": str(task.id), "parent_id": str(task.parent_id) if task.parent_id else None,
        "task_type": task.task_type, "status": task.status, "title": task.title,
        "input": task.input, "output": task.output, "error_message": task.error_message,
        "progress": task.progress, "children": children,
        "started_at": str(task.started_at) if task.started_at else None,
        "completed_at": str(task.completed_at) if task.completed_at else None,
        "created_at": str(task.created_at),
    }


# ── Memory ──

@router.get("/memories")
async def list_memories(
    category: str | None = None,
    limit: int = Query(20, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    memories = await recall_memories(db, current_user.company_id, str(current_user.id), category, limit)
    return {"items": [
        {
            "id": str(m.id), "category": m.category, "key": m.key,
            "value": m.value, "confidence": m.confidence,
            "access_count": m.access_count, "source": m.source,
            "created_at": str(m.created_at),
        }
        for m in memories
    ]}


@router.post("/memories")
async def create_memory(
    body: MemorySave,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    memory = await save_memory(
        db, current_user.company_id, str(current_user.id),
        body.category, body.key, body.value, body.source, body.confidence,
    )
    return {"id": str(memory.id), "key": memory.key}


@router.delete("/memories/{memory_id}")
async def delete_memory(
    memory_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    memory = await db.get(AgentMemory, memory_id)
    if not memory or memory.is_deleted or memory.company_id != current_user.company_id:
        raise HTTPException(404, "记忆不存在")
    memory.is_deleted = True
    await db.flush()
    return {"ok": True}


@router.get("/profile")
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await get_or_create_profile(db, current_user.company_id, str(current_user.id))
    return {
        "user_id": str(profile.user_id),
        "role_model": profile.role_model,
        "common_actions": profile.common_actions,
        "preferred_views": profile.preferred_views,
        "preferences": profile.preferences,
        "last_active_context": profile.last_active_context,
    }


@router.get("/suggestions")
async def get_suggestions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    suggestions = await get_personalized_suggestions(db, current_user.company_id, str(current_user.id))
    return {"suggestions": suggestions}


@router.get("/context")
async def get_context(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    context = await build_context_for_user(db, current_user.company_id, str(current_user.id))
    return context


# ── Natural Language Command ──

@router.post("/command")
async def execute_command(
    body: NLCommand,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    text = body.text.strip()

    mem = await parse_memory_command(text)
    if mem:
        memory = await save_memory(
            db, current_user.company_id, str(current_user.id),
            mem["category"], mem["key"], mem["value"], source="user_explicit",
        )
        return {"type": "memory_saved", "key": mem["key"]}

    from app.services.ai_gateway import ai_gateway

    context = await build_context_for_user(db, current_user.company_id, str(current_user.id))

    system_prompt = (
        "你是一个企业智能助手，管理充电站建设运营全流程。"
        "根据用户的自然语言指令，判断意图并返回结构化JSON。\n"
        f"用户上下文：{json.dumps(context.get('recent_memories', []), ensure_ascii=False)}\n"
        "返回格式：\n"
        '{"intent": "query|action|navigate|analyze", '
        '"action": "具体操作名", "params": {}, '
        '"response": "自然语言回复"}\n'
        "支持的action: query_revenue, query_costs, query_orders, list_projects, "
        "fleet_bill_generate, station_report, project_cost_report, overdue_check\n"
        "【重要】直接输出JSON对象，不要输出任何解释。"
    )

    try:
        result = await ai_gateway.provider.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ], model="glm-4-flash")

        parsed = ai_gateway._parse_json(result)

        bus = AgentEvent(db, current_user.company_id, str(current_user.id))
        await bus.emit("command.parsed", entity_type="command", data={"text": text}, result=parsed)

        return {"type": "ai_command", "parsed": parsed, "raw": result}
    except Exception as e:
        logger.exception("AI命令解析失败: %s", e)
        return {"type": "error", "message": str(e)}


# ── Role-based Chat ──

@router.post("/chat")
async def agent_chat(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bus = AgentEvent(db, current_user.company_id, str(current_user.id))
    timed = TimedEvent(bus, "chat.message", entity_type="user", entity_id=str(current_user.id))

    try:
        await record_action(db, current_user.company_id, str(current_user.id),
                            "agent.chat", {"message": body.message[:100]})

        role_prompt = await build_role_prompt(db, current_user.company_id, str(current_user.id), current_user)

        messages = [{"role": "system", "content": role_prompt}]
        for h in body.history[-10:]:
            messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
        messages.append({"role": "user", "content": body.message})

        from app.services.ai_gateway import ai_gateway
        answer = await ai_gateway.provider.chat(messages, model="glm-4-flash")

        await timed.complete({"message": body.message, "response_length": len(answer)})

        skill_suggestion = await _check_auto_skill(db, current_user.company_id, str(current_user.id), body.message)

        response = {"answer": answer, "role": detect_user_role(current_user)}
        if skill_suggestion:
            response["skill_suggestion"] = skill_suggestion

        return response
    except Exception as e:
        await timed.fail(str(e))
        return {"answer": f"AI服务暂不可用: {str(e)}", "role": "error"}


# ── Events Timeline ──

@router.get("/events")
async def list_events(
    entity_type: str | None = None,
    entity_id: str | None = None,
    event_type: str | None = None,
    limit: int = Query(30, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bus = AgentEvent(db, current_user.company_id, str(current_user.id))
    events = await bus.query_events(entity_type, entity_id, event_type, limit)
    return {"items": events}


# ── Feature Flags ──

@router.get("/flags")
async def get_flags(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    flags = await list_flags(db, current_user.company_id)
    return {"flags": flags}


@router.put("/flags")
async def update_flag(
    body: FlagUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.is_super_admin:
        raise HTTPException(403, "需要管理员权限")
    await set_flag(db, current_user.company_id, body.flag_name, body.enabled)
    return {"flag": body.flag_name, "enabled": body.enabled}


# ── Health Check ──

@router.get("/health")
async def agent_health(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import time
    from sqlalchemy import text as sql_text

    result: dict = {}

    # AI Service
    try:
        from app.services.ai_gateway import ai_gateway
        start = time.monotonic()
        test_msg = [{"role": "user", "content": "ping"}]
        await ai_gateway.provider.chat(test_msg, model="glm-4-flash")
        latency = int((time.monotonic() - start) * 1000)
        result["ai_service"] = {"status": "ok", "latency_ms": latency, "model": "glm-4-flash"}
    except Exception as e:
        result["ai_service"] = {"status": "error", "error": str(e)[:100]}

    # Event Bus
    try:
        total = (await db.execute(sql_text("SELECT COUNT(*) FROM agent_events WHERE company_id=:cid"), {"cid": current_user.company_id})).scalar()
        recent = (await db.execute(sql_text("SELECT COUNT(*) FROM agent_events WHERE company_id=:cid AND created_at > now() - interval '24 hours'"), {"cid": current_user.company_id})).scalar()
        result["event_bus"] = {"status": "ok", "total_events": total, "recent_24h": recent}
    except Exception as e:
        result["event_bus"] = {"status": "error", "error": str(e)[:100]}

    # Memory
    try:
        mem_count = (await db.execute(sql_text("SELECT COUNT(*) FROM agent_memories WHERE company_id=:cid AND is_deleted=false"), {"cid": current_user.company_id})).scalar()
        profile = await get_or_create_profile(db, current_user.company_id, str(current_user.id))
        action_count = len(profile.common_actions or [])
        result["memory"] = {"status": "ok", "total_memories": mem_count, "tracked_actions": action_count}
    except Exception as e:
        result["memory"] = {"status": "error", "error": str(e)[:100]}

    # Auto Evolution
    try:
        flag_enabled = await is_enabled(db, current_user.company_id, "agent_auto_skill_creation")
        auto_skills = (await db.execute(
            select(func.count()).select_from(AgentSkill).where(
                AgentSkill.company_id == current_user.company_id,
                AgentSkill.created_from == "ai_observed",
                AgentSkill.is_deleted == False,
            )
        )).scalar()
        result["auto_evolution"] = {"status": "ok" if flag_enabled else "disabled", "feature_flag": flag_enabled, "auto_created_skills": auto_skills}
    except Exception as e:
        result["auto_evolution"] = {"status": "error", "error": str(e)[:100]}

    # Skills
    try:
        total_skills = (await db.execute(
            select(func.count()).select_from(AgentSkill).where(
                AgentSkill.company_id == current_user.company_id, AgentSkill.is_deleted == False,
            )
        )).scalar()
        template_skills = (await db.execute(
            select(func.count()).select_from(AgentSkill).where(
                AgentSkill.company_id == current_user.company_id, AgentSkill.is_template == True, AgentSkill.is_deleted == False,
            )
        )).scalar()
        result["skills"] = {"status": "ok", "total": total_skills, "template": template_skills, "custom": total_skills - template_skills}
    except Exception as e:
        result["skills"] = {"status": "error", "error": str(e)[:100]}

    return result


# ── Context Compression ──

@router.get("/project-summary/{project_id}")
async def project_summary(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    summary = await get_project_summary(db, current_user.company_id, str(current_user.id), project_id)
    return {"project_id": project_id, "summary": summary}


# ── Auto Evolution Engine ──

ACTION_PATTERNS = {
    "fleet_billing": {"keywords": ["车队", "账单", "月结", "生成账单"], "skill_name": "月度车队账单生成", "action": "fleet_billing.generate_all"},
    "station_report": {"keywords": ["充电站", "运营", "报告", "月度报告"], "skill_name": "充电站月度运营报告", "action": "data_query.station_financial"},
    "overdue_ar": {"keywords": ["应收", "逾期", "催收", "欠款"], "skill_name": "逾期应收催收提醒", "action": "data_query.overdue_ar"},
    "project_costs": {"keywords": ["项目成本", "成本归集", "项目费用"], "skill_name": "项目成本归集汇总", "action": "data_query.project_costs"},
    "contract_expiry": {"keywords": ["合同到期", "即将到期", "合同预警"], "skill_name": "合同到期预警", "action": "data_query.contract_expiry"},
    "revenue_check": {"keywords": ["收入", "营收", "本月收入", "充电收入"], "skill_name": "月度收入快速查看", "action": "data_query.revenue"},
}


async def _check_auto_skill(
    db: AsyncSession,
    company_id: str,
    user_id: str,
    message: str,
) -> dict | None:
    if not await is_enabled(db, company_id, "agent_auto_skill_creation"):
        return None

    profile = await get_or_create_profile(db, company_id, user_id)
    actions = profile.common_actions or []

    matched_pattern = None
    for pattern_key, pattern in ACTION_PATTERNS.items():
        if any(kw in message for kw in pattern["keywords"]):
            matched_pattern = pattern
            break

    if not matched_pattern:
        return None

    pattern_action_key = f"pattern:{matched_pattern['action']}"
    await record_action(db, company_id, user_id, pattern_action_key)

    actions = list(profile.common_actions or [])
    count = 0
    for a in actions:
        if isinstance(a, dict) and a.get("action") == pattern_action_key:
            count = a.get("count", 0)
            break

    if count < 3:
        return None

    existing = (await db.execute(
        select(AgentSkill).where(
            AgentSkill.company_id == company_id,
            AgentSkill.name == matched_pattern["skill_name"],
            AgentSkill.is_deleted == False,
        )
    )).scalar_one_or_none()

    if existing:
        return None

    skill = AgentSkill(
        name=matched_pattern["skill_name"],
        description=f"基于用户{count}次相似操作自动创建",
        trigger_type="manual",
        trigger_config={"type": "manual"},
        steps=[{"action": matched_pattern["action"], "params": {}}],
        parameters={},
        created_from="ai_observed",
        is_template=False,
        icon="Sparkles",
        category="auto_created",
        company_id=company_id,
        created_by=user_id,
    )
    db.add(skill)
    await db.flush()

    bus = AgentEvent(db, company_id, user_id)
    await bus.emit("skill.auto_created", entity_type="skill", entity_id=str(skill.id),
                   data={"name": skill.name, "trigger_count": count, "pattern_message": message[:50]})

    return {
        "id": str(skill.id),
        "name": skill.name,
        "reason": f"检测到你已{count}次查询相关数据，已自动创建技能",
        "action": "auto_created",
    }
