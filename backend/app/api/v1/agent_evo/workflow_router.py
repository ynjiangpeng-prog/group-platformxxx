"""Agent自进化 — 工作流路由

提供工作流模板管理、执行、自动生成、进化的API端点。
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.models.agent_evolution.models import EvoWorkflowTemplate, EvoWorkflowInstance, EvoNodeExecution
from app.services.agent_evo.workflow.engine import workflow_engine
from app.services.agent_evo.workflow.auto_generator import workflow_auto_generator
from app.services.agent_evo.workflow.evolver import workflow_evolver

router = APIRouter(prefix="/agent-evo/workflows", tags=["工作流引擎"])


class CreateWorkflowBody(BaseModel):
    name: str = Field(..., max_length=100)
    description: str | None = None
    graph_config: dict  # {nodes: [...], edges: [...]}
    category: str | None = None


class ExecuteWorkflowBody(BaseModel):
    input_data: dict | None = None


class UpdateWorkflowBody(BaseModel):
    name: str | None = None
    description: str | None = None
    graph_config: dict | None = None
    status: str | None = None


class AutoGenerateBody(BaseModel):
    description: str
    name: str | None = None


@router.get("/templates")
async def list_templates(
    status: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """列出工作流模板"""
    templates = await workflow_engine.list_templates(db, current_user.company_id, status=status)
    return {
        "items": [
            {
                "id": str(t.id),
                "name": t.name,
                "description": t.description,
                "status": t.status,
                "version": t.version,
                "fitness_score": t.fitness_score,
                "category": t.category,
                "node_count": len((t.graph_config or {}).get("nodes", [])),
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in templates
        ],
        "total": len(templates),
    }


@router.post("/templates")
async def create_template(
    body: CreateWorkflowBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建工作流模板"""
    try:
        t = await workflow_engine.create_template(
            db, current_user.company_id, str(current_user.id),
            name=body.name, description=body.description,
            graph_config=body.graph_config, category=body.category,
        )
        return {"id": str(t.id), "name": t.name, "status": t.status}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/templates/{template_id}")
async def get_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取工作流模板详情"""
    t = await workflow_engine.get_template(db, template_id)
    if not t:
        raise HTTPException(404, "工作流模板不存在")
    return {
        "id": str(t.id),
        "name": t.name,
        "description": t.description,
        "graph_config": t.graph_config,
        "status": t.status,
        "version": t.version,
        "fitness_score": t.fitness_score,
        "category": t.category,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


@router.put("/templates/{template_id}")
async def update_template(
    template_id: str,
    body: UpdateWorkflowBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新工作流模板（编辑器保存）"""
    t = await workflow_engine.get_template(db, template_id)
    if not t:
        raise HTTPException(404, "工作流模板不存在")
    if body.name is not None:
        t.name = body.name
    if body.description is not None:
        t.description = body.description
    if body.graph_config is not None:
        t.graph_config = body.graph_config
    if body.status is not None:
        t.status = body.status
    await db.flush()
    return {"id": str(t.id), "name": t.name, "status": t.status}


@router.post("/templates/{template_id}/execute")
async def execute_workflow(
    template_id: str,
    body: ExecuteWorkflowBody | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """执行工作流"""
    try:
        result = await workflow_engine.execute(
            db, template_id, current_user.company_id, str(current_user.id),
            input_data=body.input_data if body else None,
        )
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/auto-generate")
async def auto_generate_workflow(
    body: AutoGenerateBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """根据自然语言描述自动生成工作流"""
    try:
        t = await workflow_auto_generator.generate(
            db, current_user.company_id, str(current_user.id),
            description=body.description, name=body.name,
        )
        return {"id": str(t.id), "name": t.name, "graph_config": t.graph_config}
    except Exception as e:
        raise HTTPException(400, str(e))


@router.get("/instances")
async def list_instances(
    template_id: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """列出工作流执行实例"""
    instances = await workflow_engine.list_instances(
        db, template_id=template_id, company_id=current_user.company_id, limit=limit,
    )
    return {
        "items": [
            {
                "id": str(i.id),
                "template_id": str(i.template_id),
                "status": i.status,
                "duration_ms": i.duration_ms,
                "started_at": i.started_at.isoformat() if i.started_at else None,
                "completed_at": i.completed_at.isoformat() if i.completed_at else None,
                "error_message": i.error_message,
            }
            for i in instances
        ],
    }


@router.get("/instances/{instance_id}/nodes")
async def get_instance_nodes(
    instance_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取工作流实例的节点执行详情"""
    nodes = (await db.execute(
        select(EvoNodeExecution).where(
            EvoNodeExecution.workflow_instance_id == instance_id,
            EvoNodeExecution.is_deleted == False,
        ).order_by(EvoNodeExecution.started_at)
    )).scalars().all()

    return {
        "items": [
            {
                "id": str(n.id),
                "node_id": n.node_id,
                "agent_id": str(n.agent_id) if n.agent_id else None,
                "status": n.status,
                "duration_ms": n.duration_ms,
                "error_message": n.error_message,
                "started_at": n.started_at.isoformat() if n.started_at else None,
                "completed_at": n.completed_at.isoformat() if n.completed_at else None,
            }
            for n in nodes
        ]
    }


@router.get("/fitness/{template_id}")
async def get_workflow_fitness(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取工作流适应度"""
    return await workflow_evolver.evaluate_fitness(db, template_id, current_user.company_id)


@router.post("/evolve/{template_id}")
async def evolve_workflow(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """进化工作流拓扑"""
    variants = await workflow_evolver.evolve_workflow(
        db, template_id, current_user.company_id, str(current_user.id),
    )
    return {"variants": variants}


@router.post("/evolution/apply-workflow/{history_id}")
async def apply_workflow_evolution(
    history_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """应用工作流进化结果"""
    return await workflow_evolver.apply_workflow_evolution(db, history_id, str(current_user.id))


@router.post("/init-presets")
async def init_preset_workflows(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """初始化预置工作流模板"""
    count = await workflow_engine.init_preset_workflows(
        db, current_user.company_id, str(current_user.id),
    )
    return {"created": count}
