"""Agent自进化 — 主路由

提供Agent管理、进化操作、Hook管理的API端点。
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.services.agent_evo.registry import agent_registry
from app.services.agent_evo.hooks import hook_manager
from app.services.agent_evo.evolution.prompt_evolver import prompt_evolver
from app.services.agent_evo.evolution.learning_loop import learning_loop
from app.services.agent_evo.evolution.dataset_builder import dataset_builder
from app.services.agent_evo.lifecycle import agent_lifecycle

router = APIRouter(prefix="/agent-evo", tags=["智能进化"])


# ─── Agent管理 ───

class CreateAgentBody(BaseModel):
    name: str = Field(..., max_length=100)
    description: str | None = None
    capabilities: dict | None = None
    system_prompt: str | None = None
    tools: list | None = None
    input_schema: dict | None = None
    output_schema: dict | None = None
    config: dict | None = None


@router.get("/agents")
async def list_agents(
    status: str | None = None,
    keyword: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """列出所有Agent"""
    agents = await agent_registry.list_agents(
        db, current_user.company_id, status=status, keyword=keyword,
    )
    return {
        "items": [
            {
                "id": str(a.id),
                "name": a.name,
                "description": a.description,
                "status": a.status,
                "version": a.version,
                "quality_score": a.quality_score,
                "execution_count": a.execution_count,
                "success_count": a.success_count,
                "capabilities": a.capabilities,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in agents
        ],
        "total": len(agents),
    }


@router.post("/agents")
async def create_agent(
    body: CreateAgentBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建新Agent"""
    agent = await agent_registry.register(
        db, current_user.company_id, str(current_user.id),
        name=body.name,
        description=body.description,
        capabilities=body.capabilities,
        system_prompt=body.system_prompt,
        tools=body.tools,
        input_schema=body.input_schema,
        output_schema=body.output_schema,
        config=body.config,
    )
    return {"id": str(agent.id), "name": agent.name, "status": agent.status}


@router.post("/agents/init-builtin")
async def init_builtin_agents(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """初始化预置Agent模板"""
    count = await agent_registry.init_builtins(db, current_user.company_id, str(current_user.id))
    # 同时初始化默认hooks
    hook_count = await hook_manager.init_default_hooks(db, current_user.company_id, str(current_user.id))
    return {"agents_created": count, "hooks_created": hook_count}


@router.get("/agents/{agent_id}")
async def get_agent(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取Agent详情"""
    agent = await agent_registry.get(db, agent_id)
    if not agent:
        raise HTTPException(404, "Agent不存在")
    return {
        "id": str(agent.id),
        "name": agent.name,
        "description": agent.description,
        "capabilities": agent.capabilities,
        "status": agent.status,
        "version": agent.version,
        "system_prompt": agent.system_prompt,
        "tools": agent.tools,
        "input_schema": agent.input_schema,
        "output_schema": agent.output_schema,
        "config": agent.config,
        "quality_score": agent.quality_score,
        "execution_count": agent.execution_count,
        "success_count": agent.success_count,
        "created_at": agent.created_at.isoformat() if agent.created_at else None,
    }


@router.put("/agents/{agent_id}")
async def update_agent(
    agent_id: str,
    body: CreateAgentBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新Agent配置"""
    agent = await agent_registry.update_agent(
        db, agent_id,
        name=body.name,
        description=body.description,
        capabilities=body.capabilities,
        system_prompt=body.system_prompt,
        tools=body.tools,
        input_schema=body.input_schema,
        output_schema=body.output_schema,
        config=body.config,
    )
    if not agent:
        raise HTTPException(404, "Agent不存在")
    return {"id": str(agent.id), "updated": True}


@router.put("/agents/{agent_id}/toggle")
async def toggle_agent_status(
    agent_id: str,
    status: str = Query(..., enum=["active", "disabled", "evolving"]),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """切换Agent状态"""
    agent = await agent_registry.toggle_status(db, agent_id, status)
    if not agent:
        raise HTTPException(404, "Agent不存在")
    return {"id": str(agent.id), "status": agent.status}


@router.delete("/agents/{agent_id}")
async def delete_agent(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除Agent"""
    ok = await agent_registry.delete(db, agent_id)
    if not ok:
        raise HTTPException(404, "Agent不存在")
    return {"deleted": True}


@router.get("/agents/stats/overview")
async def agent_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Agent统计概览"""
    return await agent_registry.get_stats(db, current_user.company_id)


# ─── Agent执行 ───

class ExecuteAgentBody(BaseModel):
    agent_id: str
    input_data: dict
    task_type: str | None = None


@router.post("/execute")
async def execute_agent(
    body: ExecuteAgentBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """执行Agent（走完整生命周期）"""
    result = await agent_lifecycle.execute_agent(
        db, body.agent_id, current_user.company_id, str(current_user.id),
        input_data=body.input_data,
        task_type=body.task_type,
    )
    return result


# ─── Hook管理 ───

@router.get("/hooks")
async def list_hooks(
    hook_type: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """列出所有Hooks"""
    hooks = await hook_manager.list_hooks(db, current_user.company_id, hook_type=hook_type)
    return {
        "items": [
            {
                "id": str(h.id),
                "agent_id": str(h.agent_id) if h.agent_id else None,
                "hook_type": h.hook_type,
                "name": h.name,
                "handler_type": h.handler_type,
                "priority": h.priority,
                "enabled": h.enabled,
            }
            for h in hooks
        ]
    }


# ─── 进化操作 ───

@router.get("/evolution/targets")
async def list_evolution_targets(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """识别需要进化的Agent"""
    return {"targets": await prompt_evolver.identify_targets(db, current_user.company_id)}


@router.post("/evolution/evolve/{agent_id}")
async def evolve_agent(
    agent_id: str,
    level: int = Query(3, ge=1, le=4),
    num_variants: int = Query(3, ge=1, le=5),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """对Agent执行进化"""
    variants = await prompt_evolver.evolve(
        db, agent_id, current_user.company_id, str(current_user.id),
        level=level, num_variants=num_variants,
    )
    return {"variants": variants}


@router.post("/evolution/apply/{history_id}")
async def apply_evolution(
    history_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """应用进化结果"""
    return await prompt_evolver.apply_evolution(db, history_id, str(current_user.id))


@router.post("/evolution/rollback/{history_id}")
async def rollback_evolution(
    history_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """回滚进化"""
    return await prompt_evolver.rollback(db, history_id, str(current_user.id))


@router.get("/evolution/history/{agent_id}")
async def evolution_history(
    agent_id: str,
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取Agent的进化历史"""
    return {"items": await learning_loop.get_evolution_history(db, agent_id, current_user.company_id, limit)}


@router.get("/evolution/list")
async def list_evolution(
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """列出进化历史（支持状态过滤，用于审批页）"""
    from app.models.agent_evolution.models import EvoHistory

    stmt = select(EvoHistory).where(
        EvoHistory.company_id == current_user.company_id,
        EvoHistory.is_deleted == False,
    )
    if status:
        stmt = stmt.where(EvoHistory.status == status)
    stmt = stmt.order_by(EvoHistory.created_at.desc()).limit(limit)

    rows = (await db.execute(stmt)).scalars().all()
    items = []
    for h in rows:
        items.append({
            "id": str(h.id),
            "agent_id": str(h.agent_id) if h.agent_id else None,
            "level": h.level,
            "evolution_type": h.evolution_type,
            "score_before": h.score_before,
            "score_after": h.score_after,
            "delta": (h.score_after or 0) - (h.score_before or 0),
            "status": h.status,
            "diff_summary": h.diff_summary,
            "created_at": h.created_at.isoformat() if h.created_at else None,
            "approved_at": h.approved_at.isoformat() if h.approved_at else None,
        })
    return {"items": items}


# ─── 质量趋势 ───

@router.get("/quality/trend/{agent_id}")
async def quality_trend(
    agent_id: str,
    days: int = Query(30, ge=7, le=90),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取Agent质量趋势"""
    return {"data": await learning_loop.get_quality_trend(db, agent_id, current_user.company_id, days)}


# ─── 反馈 ───

class FeedbackBody(BaseModel):
    execution_id: str
    agent_id: str
    rating: str = Field(..., pattern="^(positive|negative)$")
    comment: str | None = None


@router.post("/feedback")
async def submit_feedback(
    body: FeedbackBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """提交用户反馈"""
    return await learning_loop.process_feedback(
        db, body.execution_id, body.agent_id,
        current_user.company_id, str(current_user.id),
        body.rating, body.comment,
    )


# ─── 评估数据集 ───

@router.post("/datasets/build-from-executions/{agent_id}")
async def build_dataset_from_executions(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """从执行历史构建评估集"""
    ds = await dataset_builder.build_from_executions(
        db, agent_id, current_user.company_id, str(current_user.id),
    )
    if not ds:
        return {"message": "执行历史不足，无法构建"}
    return {"id": str(ds.id), "name": ds.name, "case_count": ds.case_count}


@router.post("/datasets/build-from-llm/{agent_id}")
async def build_dataset_from_llm(
    agent_id: str,
    num_cases: int = Query(20, ge=5, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """用LLM合成评估集"""
    ds = await dataset_builder.build_from_llm(
        db, agent_id, current_user.company_id, str(current_user.id),
        num_cases=num_cases,
    )
    return {"id": str(ds.id), "name": ds.name, "case_count": ds.case_count}
