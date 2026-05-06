import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.models.project import WorkflowDefinition
from app.core.security_utils import safe_update

router = APIRouter(prefix="/system/workflows", tags=["工作流定义"])


class WorkflowCreate(BaseModel):
    name: str = Field(..., max_length=100)
    business_type: str = Field(..., max_length=50)
    steps: list[dict] | dict


class WorkflowUpdate(BaseModel):
    name: str | None = None
    business_type: str | None = None
    steps: list[dict] | dict | None = None
    status: str | None = None


@router.get("/list")
async def list_workflows(
    business_type: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(WorkflowDefinition).where(
        WorkflowDefinition.is_deleted == False,
        WorkflowDefinition.company_id == current_user.company_id,
    )
    if business_type:
        query = query.where(WorkflowDefinition.business_type == business_type)
    if status:
        query = query.where(WorkflowDefinition.status == status)
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar()
    query = query.order_by(WorkflowDefinition.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    rows = result.scalars().all()
    items = [
        {
            "id": str(r.id), "name": r.name, "business_type": r.business_type,
            "steps": r.steps, "status": r.status, "created_at": str(r.created_at),
        }
        for r in rows
    ]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/create")
async def create_workflow(
    body: WorkflowCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wf = WorkflowDefinition(
        name=body.name, business_type=body.business_type, steps=body.steps,
        company_id=current_user.company_id, created_by=current_user.id,
    )
    db.add(wf)
    await db.flush()
    return {"id": str(wf.id), "name": wf.name}


@router.put("/{wf_id}")
async def update_workflow(
    wf_id: str,
    body: WorkflowUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wf = (await db.execute(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == wf_id,
            WorkflowDefinition.is_deleted == False,
            WorkflowDefinition.company_id == current_user.company_id,
        )
    )).scalar_one_or_none()
    if not wf:
        raise HTTPException(404, "工作流不存在")
    safe_update(wf, body)
    wf.updated_by = current_user.id
    await db.flush()
    return {"id": str(wf.id)}


@router.delete("/{wf_id}")
async def delete_workflow(
    wf_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(WorkflowDefinition).where(
            WorkflowDefinition.id == wf_id,
            WorkflowDefinition.company_id == current_user.company_id,
        ).values(is_deleted=True)
    )
    return {"message": "删除成功"}
