import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.models.workflow import ApprovalRecord, WorkflowInstance, WorkflowTemplate
from app.core.security_utils import safe_update

router = APIRouter(prefix="/workflow", tags=["审批流程"])


class TemplateCreate(BaseModel):
    name: str = Field(..., max_length=100)
    code: str = Field(..., max_length=50)
    business_type: str = Field(..., max_length=50)
    description: str | None = None
    version: int = 1
    node_config: dict | None = None


class TemplateUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    description: str | None = None
    version: int | None = None
    node_config: dict | None = None
    status: int | None = None


class TemplateOut(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    business_type: str
    version: int
    status: int
    model_config = {"from_attributes": True}


@router.get("/templates")
async def list_templates(
    business_type: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(WorkflowTemplate).where(WorkflowTemplate.is_deleted == False, WorkflowTemplate.company_id == current_user.company_id)
    if business_type:
        query = query.where(WorkflowTemplate.business_type == business_type)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(WorkflowTemplate.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/templates", response_model=TemplateOut)
async def create_template(body: TemplateCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obj = WorkflowTemplate(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.get("/templates/{template_id}", response_model=TemplateOut)
async def get_template(template_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(WorkflowTemplate).where(WorkflowTemplate.id == template_id, WorkflowTemplate.company_id == current_user.company_id, WorkflowTemplate.is_deleted == False))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="模板不存在")
    return obj


@router.put("/templates/{template_id}", response_model=TemplateOut)
async def update_template(template_id: str, body: TemplateUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(WorkflowTemplate).where(WorkflowTemplate.id == template_id, WorkflowTemplate.company_id == current_user.company_id, WorkflowTemplate.is_deleted == False))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="模板不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(obj, data)
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(WorkflowTemplate).where(WorkflowTemplate.id == template_id, WorkflowTemplate.company_id == current_user.company_id).values(is_deleted=True))
    return {"message": "删除成功"}


class InstanceCreate(BaseModel):
    template_id: str
    title: str
    business_type: str
    business_id: str | None = None
    urgency: int = 1
    form_data: dict | None = None


class InstanceOut(BaseModel):
    id: uuid.UUID
    template_id: uuid.UUID
    title: str
    business_type: str
    business_id: uuid.UUID | None
    initiator_id: uuid.UUID
    current_step: int
    status: str
    urgency: int
    model_config = {"from_attributes": True}


@router.get("/instances")
async def list_instances(
    status: str | None = None,
    business_type: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(WorkflowInstance).where(WorkflowInstance.is_deleted == False, WorkflowInstance.company_id == current_user.company_id)
    if status:
        query = query.where(WorkflowInstance.status == status)
    if business_type:
        query = query.where(WorkflowInstance.business_type == business_type)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(WorkflowInstance.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/instances", response_model=InstanceOut)
async def create_instance(body: InstanceCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obj = WorkflowInstance(
        **body.model_dump(), initiator_id=current_user.id,
        company_id=current_user.company_id, created_by=current_user.id,
    )
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.get("/instances/pending")
async def list_pending_instances(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(WorkflowInstance).where(
        WorkflowInstance.is_deleted == False,
        WorkflowInstance.company_id == current_user.company_id,
        WorkflowInstance.status == "pending",
    )
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(WorkflowInstance.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.get("/instances/{instance_id}", response_model=InstanceOut)
async def get_instance(instance_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(WorkflowInstance).where(WorkflowInstance.id == instance_id, WorkflowInstance.is_deleted == False))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="审批实例不存在")
    return obj


class ApproveAction(BaseModel):
    action: str = Field(..., pattern="^(approve|reject)$")
    comment: str | None = None


@router.post("/instances/{instance_id}/approve")
async def approve_instance(instance_id: str, body: ApproveAction, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(WorkflowInstance).where(WorkflowInstance.id == instance_id, WorkflowInstance.company_id == current_user.company_id, WorkflowInstance.is_deleted == False))
    instance = result.scalar_one_or_none()
    if not instance:
        raise HTTPException(status_code=404, detail="审批实例不存在")
    if instance.status != "pending":
        raise HTTPException(status_code=400, detail="该实例不在审批中")
    template_result = await db.execute(select(WorkflowTemplate).where(WorkflowTemplate.id == instance.template_id))
    template = template_result.scalar_one_or_none()
    node_config = template.node_config if template else {}
    total_steps = len(node_config.get("steps", [])) if isinstance(node_config, dict) else 0
    if total_steps > 0:
        current_node = node_config["steps"][instance.current_step] if instance.current_step < total_steps else None
        if current_node and current_node.get("approver_ids"):
            if str(current_user.id) not in [str(aid) for aid in current_node["approver_ids"]]:
                raise HTTPException(status_code=403, detail="您不是当前步骤的审批人")
    record = ApprovalRecord(
        instance_id=instance_id, step=instance.current_step,
        approver_id=current_user.id, action=body.action, comment=body.comment,
        company_id=current_user.company_id, created_by=current_user.id,
    )
    db.add(record)
    if body.action == "approve":
        instance.current_step += 1
        if total_steps > 0 and instance.current_step >= total_steps:
            instance.status = "completed"
    elif body.action == "reject":
        instance.status = "rejected"
    instance.updated_by = current_user.id
    await db.flush()
    await db.refresh(instance)
    return {"message": "操作成功", "status": instance.status}


@router.post("/instances/{instance_id}/cancel")
async def cancel_instance(instance_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(WorkflowInstance).where(WorkflowInstance.id == instance_id, WorkflowInstance.company_id == current_user.company_id, WorkflowInstance.is_deleted == False))
    instance = result.scalar_one_or_none()
    if not instance:
        raise HTTPException(status_code=404, detail="审批实例不存在")
    if str(instance.initiator_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="只有发起人可以取消")
    if instance.status not in ("pending",):
        raise HTTPException(status_code=400, detail="只有审批中的实例可以取消")
    instance.status = "cancelled"
    instance.updated_by = current_user.id
    await db.flush()
    return {"message": "已取消"}
