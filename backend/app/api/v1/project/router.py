import time
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import generate_no, get_current_user, get_db
from app.models.organization import User
from app.models.project import (
    ConstructionLog, InspectionRecord, Project, ProjectAcceptance, ProjectDailyBudget,
    ProjectDailyLabor, ProjectDailyTarget, ProjectDocument, ProjectMilestone,
    ProjectProcurementApproval, SafetyInspection, ServiceTicket,
    Warehouse, InventoryItem, InventoryTransaction, FixedAsset, AssetAssignment,
    MODULE_TEMPLATES, PROJECT_MODULES, TargetCost,
)
from app.services.number_generator import generate_number
from app.core.security_utils import safe_update

router = APIRouter(prefix="/project", tags=["项目管理"])


@router.get("/construction-logs/next-number")
async def next_construction_log_number(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    number = await generate_number(db, ConstructionLog, None, "construction_log", current_user.company_id)
    return {"number": number}


@router.get("/service-tickets/next-number")
async def next_service_ticket_number(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    number = await generate_number(db, ServiceTicket, "ticket_no", "ticket", current_user.company_id)
    return {"number": number}


@router.get("/inspections/next-number")
async def next_inspection_number(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    number = await generate_number(db, InspectionRecord, None, "inspection", current_user.company_id)
    return {"number": number}


class ProjectCreate(BaseModel):
    project_code: str | None = Field(None, max_length=30)
    name: str = Field(..., max_length=200)
    project_type: str
    priority: int = 2
    customer_id: str | None = None
    contract_id: str | None = None
    counterparty_company: str | None = None
    execution_unit_id: str | None = None
    partner_id: str | None = None
    enabled_modules: list[str] | None = None
    total_budget: float | None = None
    budget_items: list[dict] | None = None
    start_date: date | None = None
    end_date: date | None = None
    province: str | None = None
    city: str | None = None
    address: str | None = None
    longitude: float | None = None
    latitude: float | None = None
    description: str | None = None
    project_manager_id: str | None = None
    status: str = "draft"


class ProjectUpdate(BaseModel):
    name: str | None = None
    project_type: str | None = None
    status: str | None = None
    priority: int | None = None
    counterparty_company: str | None = None
    execution_unit_id: str | None = None
    partner_id: str | None = None
    enabled_modules: list[str] | None = None
    total_budget: float | None = None
    budget_items: list[dict] | None = None
    start_date: date | None = None
    end_date: date | None = None
    province: str | None = None
    city: str | None = None
    address: str | None = None
    longitude: float | None = None
    latitude: float | None = None
    description: str | None = None
    project_manager_id: str | None = None
    progress: int | None = None


class ProjectOut(BaseModel):
    id: uuid.UUID
    project_code: str
    name: str
    project_type: str
    status: str
    priority: int
    progress: int
    counterparty_company: str | None = None
    execution_unit_id: uuid.UUID | None = None
    partner_id: uuid.UUID | None = None
    enabled_modules: dict | list | None = None
    total_budget: float | None
    budget_items: list | None
    actual_cost: float | None
    province: str | None
    city: str | None
    address: str | None
    longitude: float | None = None
    latitude: float | None = None
    start_date: date | None
    end_date: date | None
    customer_id: uuid.UUID | None = None
    contract_id: uuid.UUID | None = None
    description: str | None = None
    project_manager_id: uuid.UUID | None = None
    actual_start_date: date | None = None
    actual_end_date: date | None = None
    created_at: str | None = None
    model_config = {"from_attributes": True}


def _project_to_dict(p: Project) -> dict:
    return {
        "id": str(p.id),
        "project_code": p.project_code,
        "name": p.name,
        "project_type": p.project_type,
        "status": p.status,
        "priority": p.priority,
        "progress": p.progress,
        "counterparty_company": p.counterparty_company,
        "execution_unit_id": str(p.execution_unit_id) if p.execution_unit_id else None,
        "partner_id": str(p.partner_id) if p.partner_id else None,
        "enabled_modules": p.enabled_modules,
        "total_budget": float(p.total_budget) if p.total_budget else None,
        "budget_items": p.budget_items if p.budget_items else None,
        "actual_cost": float(p.actual_cost) if p.actual_cost else 0,
        "province": p.province,
        "city": p.city,
        "address": p.address,
        "longitude": float(p.longitude) if p.longitude else None,
        "latitude": float(p.latitude) if p.latitude else None,
        "start_date": str(p.start_date) if p.start_date else None,
        "end_date": str(p.end_date) if p.end_date else None,
        "customer_id": str(p.customer_id) if p.customer_id else None,
        "contract_id": str(p.contract_id) if p.contract_id else None,
        "description": p.description,
        "project_manager_id": str(p.project_manager_id) if p.project_manager_id else None,
        "actual_start_date": str(p.actual_start_date) if p.actual_start_date else None,
        "actual_end_date": str(p.actual_end_date) if p.actual_end_date else None,
        "entity_id": str(p.entity_id) if p.entity_id else None,
        "operation_entity_id": str(p.operation_entity_id) if p.operation_entity_id else None,
        "created_at": str(p.created_at) if p.created_at else None,
    }


@router.get("/project-modules")
async def get_project_modules():
    return {"modules": PROJECT_MODULES, "templates": MODULE_TEMPLATES}


@router.get("/projects")
async def list_projects(
    status: str | None = None,
    keyword: str | None = None,
    project_type: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Project).where(Project.is_deleted == False, Project.company_id == current_user.company_id)
    if status:
        query = query.where(Project.status == status)
    if project_type:
        query = query.where(Project.project_type == project_type)
    if keyword:
        query = query.where((Project.name.ilike(f"%{keyword}%")) | (Project.project_code.ilike(f"%{keyword}%")))
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(Project.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": [_project_to_dict(p) for p in result.scalars().all()], "total": total, "page": page, "page_size": page_size}


@router.post("/projects")
async def create_project(body: ProjectCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    data = body.model_dump()
    
    # Auto-generate project_code if not provided
    if not data.get("project_code"):
        from app.services.number_generator import generate_number
        data["project_code"] = await generate_number(db, Project, "project_code", "project", current_user.company_id)
    
    if body.enabled_modules:
        data["enabled_modules"] = {m: True for m in body.enabled_modules}
    try:
        from app.services.entity_resolver import resolve_project_entities
        entities = await resolve_project_entities(db, current_user.company_id, body.project_type)
        data.setdefault("entity_id", entities["entity_id"])
        data.setdefault("operation_entity_id", entities["operation_entity_id"])
    except Exception as exc:
        import logging
        logging.exception("entity_resolver failed: %s", exc)
    project = Project(**data, company_id=current_user.company_id, created_by=current_user.id)
    db.add(project)
    await db.flush()
    await db.refresh(project)

    if project.total_budget and float(project.total_budget) > 0:
        try:
            from app.models.finance.models import Budget
            budget = Budget(
                name=f"{project.name}-项目预算",
                period_type="annual",
                period=str(date.today().year),
                project_id=str(project.id),
                items=project.budget_items if project.budget_items else None,
                total_budget=project.total_budget,
                status="approved",
                source="project",
                company_id=current_user.company_id,
                created_by=current_user.id,
            )
            db.add(budget)
            await db.flush()
        except Exception:
            import logging
            logging.getLogger(__name__).exception("同步创建财务预算失败")

    return _project_to_dict(project)


@router.get("/projects/{project_id}")
async def get_project(project_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id, Project.is_deleted == False, Project.company_id == current_user.company_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return _project_to_dict(project)


@router.put("/projects/{project_id}")
async def update_project(project_id: str, body: ProjectUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id, Project.is_deleted == False, Project.company_id == current_user.company_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    update_data = body.model_dump(exclude_unset=True)
    if "enabled_modules" in update_data and isinstance(update_data["enabled_modules"], list):
        update_data["enabled_modules"] = {m: True for m in update_data["enabled_modules"]}
    safe_update(project, update_data)
    project.updated_by = current_user.id
    await db.flush()
    if update_data.get("status") == "completed" and project.project_type in ("self_invest_build", "cooperative_build", "charging_epc"):
        try:
            from app.services.linkage import project_completed_update_station
            await project_completed_update_station(project_id, db)
        except Exception as exc:
            import logging
            logging.exception("联动-工程竣工转运营失败: %s", exc)
        try:
            from app.services.entity_resolver import _get_entity_by_code
            op_entity = await _get_entity_by_code(db, current_user.company_id, "YCNE")
            if op_entity and not project.operation_entity_id:
                project.operation_entity_id = op_entity
                project.updated_by = current_user.id
        except Exception:
            pass
        await db.flush()
    await db.refresh(project)
    return _project_to_dict(project)


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.company_id == current_user.company_id,
            Project.is_deleted == False,
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "项目不存在")

    project.is_deleted = True
    project.updated_by = current_user.id

    cascade_models = [
        ProjectMilestone, ProjectDailyTarget, ProjectDailyBudget, ProjectDailyLabor,
        ProjectProcurementApproval, ConstructionLog, SafetyInspection, ProjectAcceptance,
        ServiceTicket, InspectionRecord, TargetCost,
    ]
    from app.models.business.models import (
        SiteDecision, ProjectPermit, ProjectWeeklyPlan, ProjectDailyPlan,
        ProjectDailyFeedback, DailyExpense, FixedExpense, WorkHourRecord,
        TravelProjectAllocation,
    )
    from app.models.project.models import ProjectLine, ProjectLocation
    from app.models.workflow.models import WorkflowInstance
    cascade_models += [
        SiteDecision, ProjectPermit, ProjectWeeklyPlan, ProjectDailyPlan,
        ProjectDailyFeedback, WorkHourRecord, ProjectLine, ProjectLocation,
        WorkflowInstance,
    ]

    cid = current_user.company_id
    for model in cascade_models:
        if not hasattr(model, 'project_id'):
            continue
        await db.execute(
            update(model).where(
                model.project_id == project_id,
                model.is_deleted == False,
                model.company_id == cid,
            ).values(is_deleted=True)
        )

    await db.execute(
        update(DailyExpense).where(
            DailyExpense.project_id == project_id,
            DailyExpense.is_deleted == False,
            DailyExpense.company_id == cid,
        ).values(is_deleted=True)
    )
    await db.execute(
        update(FixedExpense).where(
            FixedExpense.project_id == project_id,
            FixedExpense.is_deleted == False,
            FixedExpense.company_id == cid,
        ).values(is_deleted=True)
    )

    await db.flush()
    return {"message": "删除成功"}


@router.put("/projects/{project_id}/progress")
async def update_progress(project_id: str, progress: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(Project).where(Project.id == project_id, Project.company_id == current_user.company_id).values(progress=progress))
    return {"message": "进度更新成功"}


class MilestoneCreate(BaseModel):
    name: str = Field(..., max_length=100)
    planned_date: date | None = None
    actual_date: date | None = None
    status: str = "pending"
    description: str | None = None
    sort_order: int = 0


class MilestoneUpdate(BaseModel):
    name: str | None = None
    planned_date: date | None = None
    actual_date: date | None = None
    status: str | None = None
    description: str | None = None
    sort_order: int | None = None


class MilestoneOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    planned_date: date | None
    actual_date: date | None
    status: str
    sort_order: int
    model_config = {"from_attributes": True}


@router.get("/projects/{project_id}/milestones")
async def list_milestones(project_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ProjectMilestone).where(ProjectMilestone.is_deleted == False, ProjectMilestone.project_id == project_id)
        .order_by(ProjectMilestone.sort_order)
    )
    return result.scalars().all()


@router.post("/projects/{project_id}/milestones", response_model=MilestoneOut)
async def create_milestone(project_id: str, body: MilestoneCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ms = ProjectMilestone(**body.model_dump(), project_id=project_id, company_id=current_user.company_id, created_by=current_user.id)
    db.add(ms)
    await db.flush()
    await db.refresh(ms)
    return ms


@router.put("/milestones/{ms_id}", response_model=MilestoneOut)
async def update_milestone(ms_id: str, body: MilestoneUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ProjectMilestone).where(ProjectMilestone.id == ms_id, ProjectMilestone.is_deleted == False, ProjectMilestone.company_id == current_user.company_id))
    ms = result.scalar_one_or_none()
    if not ms:
        raise HTTPException(status_code=404, detail="里程碑不存在")
    update_data = body.model_dump(exclude_unset=True)
    safe_update(ms, update_data)
    ms.updated_by = current_user.id
    await db.flush()
    if update_data.get("status") == "completed":
        try:
            from app.services.linkage import milestone_to_revenue_voucher
            await milestone_to_revenue_voucher(ms_id, db)
        except Exception as exc:
            import logging
            logging.exception("联动-里程碑凭证失败: %s", exc)
        try:
            from app.services.notification_service import broadcast_notification
            users = (await db.execute(select(User.id).where(User.company_id == current_user.company_id, User.is_deleted == False))).scalars().all()
            await broadcast_notification(db, current_user.company_id, [str(u) for u in users], "finance", "里程碑已完成", "里程碑已完成，已自动生成收入凭证", None, str(current_user.id))
        except Exception as exc:
            import logging
            logging.exception("通知推送失败: %s", exc)
        await db.flush()
    await db.refresh(ms)
    return ms


@router.delete("/milestones/{ms_id}")
async def delete_milestone(ms_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(ProjectMilestone).where(ProjectMilestone.id == ms_id, ProjectMilestone.company_id == current_user.company_id).values(is_deleted=True))
    return {"message": "删除成功"}


class DailyTargetCreate(BaseModel):
    project_id: str
    target_date: date
    target_content: str | None = None
    target_items: dict | None = None
    weather: str | None = None
    temperature: str | None = None


class DailyTargetUpdate(BaseModel):
    target_content: str | None = None
    target_items: dict | None = None
    completion_content: str | None = None
    completion_items: dict | None = None
    overall_completion_rate: int | None = None
    deviation_analysis: str | None = None
    corrective_action: str | None = None
    weather: str | None = None
    temperature: str | None = None
    status: str | None = None


class DailyTargetOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    target_date: date
    target_content: str | None
    overall_completion_rate: int
    status: str
    model_config = {"from_attributes": True}


@router.get("/daily-targets")
async def list_daily_targets(
    project_id: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ProjectDailyTarget).where(ProjectDailyTarget.is_deleted == False, ProjectDailyTarget.company_id == current_user.company_id)
    if project_id:
        query = query.where(ProjectDailyTarget.project_id == project_id)
    if start_date:
        query = query.where(ProjectDailyTarget.target_date >= start_date)
    if end_date:
        query = query.where(ProjectDailyTarget.target_date <= end_date)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(ProjectDailyTarget.target_date.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/daily-targets", response_model=DailyTargetOut)
async def create_daily_target(body: DailyTargetCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    target = ProjectDailyTarget(**body.model_dump(), company_id=current_user.company_id, recorder_id=current_user.id, created_by=current_user.id)
    db.add(target)
    await db.flush()
    await db.refresh(target)
    return target


@router.get("/daily-targets/{target_id}", response_model=DailyTargetOut)
async def get_daily_target(target_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ProjectDailyTarget).where(ProjectDailyTarget.id == target_id, ProjectDailyTarget.is_deleted == False))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="不存在")
    return target


@router.put("/daily-targets/{target_id}", response_model=DailyTargetOut)
async def update_daily_target(target_id: str, body: DailyTargetUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ProjectDailyTarget).where(ProjectDailyTarget.id == target_id, ProjectDailyTarget.is_deleted == False))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="不存在")
    safe_update(target, body)
    target.updated_by = current_user.id
    await db.flush()
    await db.refresh(target)
    return target


@router.delete("/daily-targets/{target_id}")
async def delete_daily_target(target_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(ProjectDailyTarget).where(ProjectDailyTarget.id == target_id).values(is_deleted=True))
    return {"message": "删除成功"}


class DailyBudgetCreate(BaseModel):
    project_id: str
    budget_date: date
    category: str
    planned_amount: float | None = None
    actual_amount: float | None = None
    items: dict | None = None


class DailyBudgetUpdate(BaseModel):
    category: str | None = None
    planned_amount: float | None = None
    actual_amount: float | None = None
    items: dict | None = None
    variance_reason: str | None = None
    status: str | None = None


class DailyBudgetOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    budget_date: date
    category: str
    planned_amount: float | None
    actual_amount: float | None
    status: str
    model_config = {"from_attributes": True}


@router.get("/daily-budgets")
async def list_daily_budgets(
    project_id: str | None = None,
    category: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ProjectDailyBudget).where(ProjectDailyBudget.is_deleted == False, ProjectDailyBudget.company_id == current_user.company_id)
    if project_id:
        query = query.where(ProjectDailyBudget.project_id == project_id)
    if category:
        query = query.where(ProjectDailyBudget.category == category)
    if start_date:
        query = query.where(ProjectDailyBudget.budget_date >= start_date)
    if end_date:
        query = query.where(ProjectDailyBudget.budget_date <= end_date)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(ProjectDailyBudget.budget_date.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/daily-budgets", response_model=DailyBudgetOut)
async def create_daily_budget(body: DailyBudgetCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    budget = ProjectDailyBudget(**body.model_dump(), company_id=current_user.company_id, recorder_id=current_user.id, created_by=current_user.id)
    db.add(budget)
    await db.flush()
    await db.refresh(budget)
    return budget


@router.get("/daily-budgets/{budget_id}", response_model=DailyBudgetOut)
async def get_daily_budget(budget_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ProjectDailyBudget).where(ProjectDailyBudget.id == budget_id, ProjectDailyBudget.is_deleted == False))
    budget = result.scalar_one_or_none()
    if not budget:
        raise HTTPException(status_code=404, detail="不存在")
    return budget


@router.put("/daily-budgets/{budget_id}", response_model=DailyBudgetOut)
async def update_daily_budget(budget_id: str, body: DailyBudgetUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ProjectDailyBudget).where(ProjectDailyBudget.id == budget_id, ProjectDailyBudget.is_deleted == False))
    budget = result.scalar_one_or_none()
    if not budget:
        raise HTTPException(status_code=404, detail="不存在")
    safe_update(budget, body)
    budget.updated_by = current_user.id
    await db.flush()
    await db.refresh(budget)
    return budget


@router.delete("/daily-budgets/{budget_id}")
async def delete_daily_budget(budget_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(ProjectDailyBudget).where(ProjectDailyBudget.id == budget_id).values(is_deleted=True))
    return {"message": "删除成功"}


class DailyLaborCreate(BaseModel):
    project_id: str
    labor_date: date
    records: dict | None = None


class DailyLaborUpdate(BaseModel):
    records: dict | None = None
    total_workers: int | None = None
    total_regular_hours: float | None = None
    total_overtime_hours: float | None = None
    total_labor_cost: float | None = None
    status: str | None = None


class DailyLaborOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    labor_date: date
    total_workers: int
    total_regular_hours: float | None
    total_overtime_hours: float | None
    total_labor_cost: float | None
    status: str
    model_config = {"from_attributes": True}


@router.get("/daily-labor")
async def list_daily_labor(
    project_id: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ProjectDailyLabor).where(ProjectDailyLabor.is_deleted == False, ProjectDailyLabor.company_id == current_user.company_id)
    if project_id:
        query = query.where(ProjectDailyLabor.project_id == project_id)
    if start_date:
        query = query.where(ProjectDailyLabor.labor_date >= start_date)
    if end_date:
        query = query.where(ProjectDailyLabor.labor_date <= end_date)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(ProjectDailyLabor.labor_date.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/daily-labor", response_model=DailyLaborOut)
async def create_daily_labor(body: DailyLaborCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    labor = ProjectDailyLabor(**body.model_dump(), company_id=current_user.company_id, recorder_id=current_user.id, created_by=current_user.id)
    db.add(labor)
    await db.flush()
    await db.refresh(labor)
    return labor


@router.get("/daily-labor/{labor_id}", response_model=DailyLaborOut)
async def get_daily_labor(labor_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ProjectDailyLabor).where(ProjectDailyLabor.id == labor_id, ProjectDailyLabor.is_deleted == False))
    labor = result.scalar_one_or_none()
    if not labor:
        raise HTTPException(status_code=404, detail="不存在")
    return labor


@router.put("/daily-labor/{labor_id}", response_model=DailyLaborOut)
async def update_daily_labor(labor_id: str, body: DailyLaborUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ProjectDailyLabor).where(ProjectDailyLabor.id == labor_id, ProjectDailyLabor.is_deleted == False))
    labor = result.scalar_one_or_none()
    if not labor:
        raise HTTPException(status_code=404, detail="不存在")
    safe_update(labor, body)
    labor.updated_by = current_user.id
    await db.flush()
    await db.refresh(labor)
    return labor


@router.delete("/daily-labor/{labor_id}")
async def delete_daily_labor(labor_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(ProjectDailyLabor).where(ProjectDailyLabor.id == labor_id).values(is_deleted=True))
    return {"message": "删除成功"}


class ProcurementCreate(BaseModel):
    project_id: str
    procurement_type: str
    title: str
    description: str | None = None
    items: dict | None = None
    total_amount: float | None = None
    urgency: str = "normal"
    expected_date: date | None = None


class ProcurementUpdate(BaseModel):
    procurement_type: str | None = None
    title: str | None = None
    description: str | None = None
    items: dict | None = None
    total_amount: float | None = None
    urgency: str | None = None
    expected_date: date | None = None
    status: str | None = None


class ProcurementOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    approval_no: str
    procurement_type: str
    title: str
    total_amount: float | None
    urgency: str
    status: str
    model_config = {"from_attributes": True}


@router.get("/procurement-approvals")
async def list_procurement_approvals(
    project_id: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ProjectProcurementApproval).where(ProjectProcurementApproval.is_deleted == False, ProjectProcurementApproval.company_id == current_user.company_id)
    if project_id:
        query = query.where(ProjectProcurementApproval.project_id == project_id)
    if status:
        query = query.where(ProjectProcurementApproval.status == status)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(ProjectProcurementApproval.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/procurement-approvals", response_model=ProcurementOut)
async def create_procurement_approval(body: ProcurementCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    approval = ProjectProcurementApproval(
        **body.model_dump(), approval_no=generate_no("PA"),
        company_id=current_user.company_id, created_by=current_user.id,
    )
    db.add(approval)
    await db.flush()
    await db.refresh(approval)
    return approval


@router.get("/procurement-approvals/{approval_id}", response_model=ProcurementOut)
async def get_procurement_approval(approval_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ProjectProcurementApproval).where(ProjectProcurementApproval.id == approval_id, ProjectProcurementApproval.is_deleted == False))
    approval = result.scalar_one_or_none()
    if not approval:
        raise HTTPException(status_code=404, detail="不存在")
    return approval


@router.put("/procurement-approvals/{approval_id}", response_model=ProcurementOut)
async def update_procurement_approval(approval_id: str, body: ProcurementUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ProjectProcurementApproval).where(ProjectProcurementApproval.id == approval_id, ProjectProcurementApproval.is_deleted == False))
    approval = result.scalar_one_or_none()
    if not approval:
        raise HTTPException(status_code=404, detail="不存在")
    safe_update(approval, body)
    approval.updated_by = current_user.id
    await db.flush()
    await db.refresh(approval)
    return approval


@router.delete("/procurement-approvals/{approval_id}")
async def delete_procurement_approval(approval_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(ProjectProcurementApproval).where(ProjectProcurementApproval.id == approval_id).values(is_deleted=True))
    return {"message": "删除成功"}


class ConstructionLogCreate(BaseModel):
    project_id: str
    log_date: date
    weather: str | None = None
    temperature: str | None = None
    work_content: str | None = None
    worker_count: int = 0
    equipment_used: str | None = None
    materials_used: str | None = None
    safety_status: str = "normal"
    quality_issues: str | None = None
    photos: list[dict] | None = None
    execution_unit: str | None = None
    feedback: str | None = None
    related_modules: list | None = None
    related_contracts: list | None = None


class ConstructionLogUpdate(BaseModel):
    weather: str | None = None
    temperature: str | None = None
    work_content: str | None = None
    worker_count: int | None = None
    equipment_used: str | None = None
    materials_used: str | None = None
    safety_status: str | None = None
    quality_issues: str | None = None
    photos: list[dict] | None = None
    execution_unit: str | None = None
    feedback: str | None = None
    related_modules: list | None = None
    related_contracts: list | None = None


class ConstructionLogOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    log_date: date
    weather: str | None
    worker_count: int
    safety_status: str
    execution_unit: str | None = None
    feedback: str | None = None
    work_content: str | None = None
    related_modules: list | None = None
    related_contracts: list | None = None
    model_config = {"from_attributes": True}


@router.get("/construction-logs")
async def list_construction_logs(
    project_id: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ConstructionLog).where(ConstructionLog.is_deleted == False, ConstructionLog.company_id == current_user.company_id)
    if project_id:
        query = query.where(ConstructionLog.project_id == project_id)
    if start_date:
        query = query.where(ConstructionLog.log_date >= start_date)
    if end_date:
        query = query.where(ConstructionLog.log_date <= end_date)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(ConstructionLog.log_date.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


MODULE_KEYWORDS: dict[str, list[str]] = {
    "hv_construction": ["高压", "高压安装", "高压施工"],
    "lv_construction": ["低压", "低压安装", "低压施工"],
    "civil_construction": ["土建", "基础施工", "浇筑", "混凝土"],
    "ancillary_construction": ["附属", "围栏", "雨棚", "监控"],
    "transformer_purchase": ["变压器", "变压器安装", "变压器采购"],
    "cable_purchase": ["电缆", "电缆敷设", "电缆采购"],
    "charging_pile_purchase": ["充电桩", "充电桩安装", "充电桩采购"],
    "electrical_material_purchase": ["电气材料", "配电箱", "线缆"],
    "land_lease": ["租地", "场地"],
}

MODULE_TO_CONTRACT_TYPE: dict[str, list[str]] = {
    "hv_construction": ["hv_construction"],
    "lv_construction": ["lv_construction"],
    "civil_construction": ["civil_construction"],
    "ancillary_construction": ["ancillary_construction"],
    "transformer_purchase": ["transformer_purchase"],
    "cable_purchase": ["cable_purchase"],
    "charging_pile_purchase": ["charging_pile_purchase"],
    "electrical_material_purchase": ["electrical_material_purchase"],
    "land_lease": ["land_lease"],
}


async def _auto_link_construction_log(db: AsyncSession, company_id: str, project_id: str, work_content: str) -> tuple[list[str], list[str]]:
    if not work_content:
        return [], []
    matched_modules = []
    for module, keywords in MODULE_KEYWORDS.items():
        if any(kw in work_content for kw in keywords):
            matched_modules.append(module)
    if not matched_modules:
        return [], []
    contract_types = []
    for m in matched_modules:
        contract_types.extend(MODULE_TO_CONTRACT_TYPE.get(m, []))
    from app.models.erp.models import Contract
    result = await db.execute(
        select(Contract.id).where(
            Contract.company_id == company_id,
            Contract.project_id == project_id,
            Contract.is_deleted == False,
            Contract.contract_type.in_(contract_types),
        )
    )
    matched_contract_ids = [str(r[0]) for r in result.fetchall()]
    return matched_modules, matched_contract_ids


@router.post("/construction-logs", response_model=ConstructionLogOut)
async def create_construction_log(body: ConstructionLogCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    data = body.model_dump()
    if body.work_content and body.related_modules is None:
        modules, contracts = await _auto_link_construction_log(db, current_user.company_id, body.project_id, body.work_content)
        data["related_modules"] = modules
        data["related_contracts"] = contracts
    log = ConstructionLog(**data, company_id=current_user.company_id, recorder_id=current_user.id, created_by=current_user.id)
    db.add(log)
    await db.flush()
    await db.refresh(log)
    return log


@router.get("/construction-logs/{log_id}", response_model=ConstructionLogOut)
async def get_construction_log(log_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ConstructionLog).where(ConstructionLog.id == log_id, ConstructionLog.is_deleted == False))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="不存在")
    return log


@router.put("/construction-logs/{log_id}", response_model=ConstructionLogOut)
async def update_construction_log(log_id: str, body: ConstructionLogUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ConstructionLog).where(ConstructionLog.id == log_id, ConstructionLog.is_deleted == False))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="不存在")
    update_data = body.model_dump(exclude_unset=True)
    if "work_content" in update_data and "related_modules" not in update_data:
        modules, contracts = await _auto_link_construction_log(db, current_user.company_id, str(log.project_id), update_data["work_content"])
        update_data["related_modules"] = modules
        update_data["related_contracts"] = contracts
    safe_update(log, update_data)
    log.updated_by = current_user.id
    await db.flush()
    await db.refresh(log)
    return log


@router.delete("/construction-logs/{log_id}")
async def delete_construction_log(log_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(ConstructionLog).where(ConstructionLog.id == log_id, ConstructionLog.company_id == current_user.company_id).values(is_deleted=True))
    return {"message": "删除成功"}


class SafetyInspectionCreate(BaseModel):
    project_id: str
    inspection_date: date
    inspector_id: str | None = None
    inspection_type: str
    hazards: list[dict] | None = None
    overall_level: str = "good"
    photos: list[dict] | None = None
    rectification_deadline: str | None = None
    remark: str | None = None


class SafetyInspectionUpdate(BaseModel):
    inspection_type: str | None = None
    hazards: list[dict] | None = None
    overall_level: str | None = None
    photos: list[dict] | None = None
    rectification_deadline: str | None = None
    rectification_status: str | None = None
    remark: str | None = None


class SafetyInspectionOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    inspection_date: date
    inspection_type: str
    overall_level: str
    rectification_status: str
    model_config = {"from_attributes": True}


@router.get("/safety-inspections")
async def list_safety_inspections(
    project_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(SafetyInspection).where(SafetyInspection.is_deleted == False, SafetyInspection.company_id == current_user.company_id)
    if project_id:
        query = query.where(SafetyInspection.project_id == project_id)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(SafetyInspection.inspection_date.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/safety-inspections", response_model=SafetyInspectionOut)
async def create_safety_inspection(body: SafetyInspectionCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    insp = SafetyInspection(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(insp)
    await db.flush()
    await db.refresh(insp)
    return insp


@router.get("/safety-inspections/{insp_id}", response_model=SafetyInspectionOut)
async def get_safety_inspection(insp_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SafetyInspection).where(SafetyInspection.id == insp_id, SafetyInspection.is_deleted == False))
    insp = result.scalar_one_or_none()
    if not insp:
        raise HTTPException(status_code=404, detail="不存在")
    return insp


@router.put("/safety-inspections/{insp_id}", response_model=SafetyInspectionOut)
async def update_safety_inspection(insp_id: str, body: SafetyInspectionUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SafetyInspection).where(SafetyInspection.id == insp_id, SafetyInspection.is_deleted == False))
    insp = result.scalar_one_or_none()
    if not insp:
        raise HTTPException(status_code=404, detail="不存在")
    safe_update(insp, body)
    insp.updated_by = current_user.id
    await db.flush()
    await db.refresh(insp)
    return insp


@router.delete("/safety-inspections/{insp_id}")
async def delete_safety_inspection(insp_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(SafetyInspection).where(SafetyInspection.id == insp_id).values(is_deleted=True))
    return {"message": "删除成功"}


class AcceptanceCreate(BaseModel):
    project_id: str
    acceptance_type: str
    acceptance_date: date
    acceptance_unit: str | None = None
    result: str = "passed"
    issues: str | None = None
    sign_off_photos: list[dict] | None = None
    handover_docs: list[dict] | None = None


class AcceptanceUpdate(BaseModel):
    acceptance_type: str | None = None
    acceptance_date: date | None = None
    acceptance_unit: str | None = None
    result: str | None = None
    issues: str | None = None
    sign_off_photos: list[dict] | None = None
    handover_docs: list[dict] | None = None


class AcceptanceOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    acceptance_type: str
    acceptance_date: date
    result: str
    model_config = {"from_attributes": True}


@router.get("/acceptances")
async def list_acceptances(
    project_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ProjectAcceptance).where(ProjectAcceptance.is_deleted == False, ProjectAcceptance.company_id == current_user.company_id)
    if project_id:
        query = query.where(ProjectAcceptance.project_id == project_id)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(ProjectAcceptance.acceptance_date.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/acceptances", response_model=AcceptanceOut)
async def create_acceptance(body: AcceptanceCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    acc = ProjectAcceptance(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(acc)
    await db.flush()
    await db.refresh(acc)
    return acc


@router.get("/acceptances/{acc_id}", response_model=AcceptanceOut)
async def get_acceptance(acc_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ProjectAcceptance).where(ProjectAcceptance.id == acc_id, ProjectAcceptance.is_deleted == False))
    acc = result.scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="不存在")
    return acc


@router.put("/acceptances/{acc_id}", response_model=AcceptanceOut)
async def update_acceptance(acc_id: str, body: AcceptanceUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ProjectAcceptance).where(ProjectAcceptance.id == acc_id, ProjectAcceptance.is_deleted == False))
    acc = result.scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="不存在")
    safe_update(acc, body)
    acc.updated_by = current_user.id
    await db.flush()
    await db.refresh(acc)
    return acc


@router.delete("/acceptances/{acc_id}")
async def delete_acceptance(acc_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(ProjectAcceptance).where(ProjectAcceptance.id == acc_id).values(is_deleted=True))
    return {"message": "删除成功"}


class ServiceTicketCreate(BaseModel):
    project_id: str | None = None
    service_type: str = Field(...)
    title: str = Field(..., max_length=200)
    description: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    customer_company: str | None = None
    priority: int = 2
    assigned_to: str | None = None
    warranty_start: date | None = None
    warranty_end: date | None = None


class ServiceTicketUpdate(BaseModel):
    project_id: str | None = None
    service_type: str | None = None
    title: str | None = None
    description: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    customer_company: str | None = None
    priority: int | None = None
    status: str | None = None
    assigned_to: str | None = None
    handling_records: dict | None = None
    resolution: str | None = None
    completed_at: str | None = None
    customer_rating: int | None = None
    customer_feedback: str | None = None
    warranty_start: date | None = None
    warranty_end: date | None = None


@router.get("/service-tickets")
async def list_service_tickets(
    project_id: str | None = None,
    service_type: str | None = None,
    status: str | None = None,
    keyword: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ServiceTicket).where(ServiceTicket.is_deleted == False, ServiceTicket.company_id == current_user.company_id)
    if project_id:
        query = query.where(ServiceTicket.project_id == project_id)
    if service_type:
        query = query.where(ServiceTicket.service_type == service_type)
    if status:
        query = query.where(ServiceTicket.status == status)
    if keyword:
        query = query.where(ServiceTicket.title.ilike(f"%{keyword}%"))
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar()
    query = query.order_by(ServiceTicket.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/service-tickets")
async def create_service_ticket(body: ServiceTicketCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ticket_no = generate_no("SV")
    obj = ServiceTicket(
        **body.model_dump(), ticket_no=ticket_no,
        company_id=current_user.company_id, created_by=current_user.id,
        assigned_at=date.today() if body.assigned_to else None,
    )
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.get("/service-tickets/{ticket_id}")
async def get_service_ticket(ticket_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ServiceTicket).where(ServiceTicket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="不存在")
    return ticket


@router.put("/service-tickets/{ticket_id}")
async def update_service_ticket(ticket_id: str, body: ServiceTicketUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ServiceTicket).where(ServiceTicket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="不存在")
    data = body.model_dump(exclude_unset=True)
    if data.get("assigned_to") and not ticket.assigned_to:
        data["assigned_at"] = date.today()
    if data.get("status") == "completed":
        data["completed_at"] = date.today()
    safe_update(ticket, data)
    ticket.updated_by = current_user.id
    await db.flush()
    await db.refresh(ticket)
    return ticket


@router.delete("/service-tickets/{ticket_id}")
async def delete_service_ticket(ticket_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(ServiceTicket).where(ServiceTicket.id == ticket_id).values(is_deleted=True))
    return {"message": "删除成功"}


class InspectionCreate(BaseModel):
    project_id: str = Field(...)
    ticket_id: str | None = None
    inspection_type: str = Field(...)
    inspection_date: date = Field(...)
    inspector_id: str | None = None
    items: dict | None = None
    overall_result: str = "normal"
    issues_found: str | None = None
    rectification_required: bool = False
    rectification_deadline: str | None = None
    remark: str | None = None


class InspectionUpdate(BaseModel):
    inspection_type: str | None = None
    inspection_date: date | None = None
    inspector_id: str | None = None
    items: dict | None = None
    overall_result: str | None = None
    issues_found: str | None = None
    rectification_required: bool | None = None
    rectification_deadline: str | None = None
    rectification_status: str | None = None
    remark: str | None = None


@router.get("/inspections")
async def list_inspections(
    project_id: str | None = None,
    ticket_id: str | None = None,
    inspection_type: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(InspectionRecord).where(InspectionRecord.is_deleted == False, InspectionRecord.company_id == current_user.company_id)
    if project_id:
        query = query.where(InspectionRecord.project_id == project_id)
    if ticket_id:
        query = query.where(InspectionRecord.ticket_id == ticket_id)
    if inspection_type:
        query = query.where(InspectionRecord.inspection_type == inspection_type)
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar()
    query = query.order_by(InspectionRecord.inspection_date.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/inspections")
async def create_inspection(body: InspectionCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obj = InspectionRecord(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    if body.rectification_required:
        obj.rectification_status = "pending"
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.put("/inspections/{insp_id}")
async def update_inspection(insp_id: str, body: InspectionUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InspectionRecord).where(InspectionRecord.id == insp_id))
    insp = result.scalar_one_or_none()
    if not insp:
        raise HTTPException(status_code=404, detail="不存在")
    safe_update(insp, body)
    insp.updated_by = current_user.id
    await db.flush()
    await db.refresh(insp)
    return insp


@router.delete("/inspections/{insp_id}")
async def delete_inspection(insp_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(InspectionRecord).where(InspectionRecord.id == insp_id).values(is_deleted=True))
    return {"message": "删除成功"}


class TargetCostCreate(BaseModel):
    project_id: str | None = None
    category: str = Field(..., max_length=50)
    module_code: str | None = None
    target_amount: float = Field(..., gt=0)
    remark: str | None = None


class TargetCostUpdate(BaseModel):
    category: str | None = None
    module_code: str | None = None
    target_amount: float | None = None
    actual_amount: float | None = None
    status: str | None = None
    remark: str | None = None


@router.get("/projects/{project_id}/target-costs")
async def list_target_costs(project_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(TargetCost).where(
        TargetCost.project_id == project_id, TargetCost.is_deleted == False,
        TargetCost.company_id == current_user.company_id,
    ).order_by(TargetCost.category))).scalars().all()
    items = []
    for r in rows:
        v = float(r.target_amount) - float(r.actual_amount)
        items.append({
            "id": str(r.id), "project_id": str(r.project_id),
            "category": r.category, "module_code": r.module_code,
            "target_amount": float(r.target_amount), "actual_amount": float(r.actual_amount),
            "variance_amount": v,
            "varariance_rate": round((v / float(r.target_amount) * 100) if float(r.target_amount) > 0 else 0, 2),
            "status": r.status, "remark": r.remark,
        })
    return {"items": items}


@router.post("/projects/{project_id}/target-costs")
async def create_target_cost(project_id: str, body: TargetCostCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obj = TargetCost(
        project_id=project_id, category=body.category, module_code=body.module_code,
        target_amount=body.target_amount, actual_amount=0, variance_amount=body.target_amount,
        remark=body.remark, company_id=current_user.company_id, created_by=current_user.id,
    )
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return {"id": str(obj.id), "category": obj.category, "target_amount": float(obj.target_amount)}


@router.put("/target-costs/{cost_id}")
async def update_target_cost(cost_id: str, body: TargetCostUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obj = (await db.execute(select(TargetCost).where(TargetCost.id == cost_id, TargetCost.is_deleted == False))).scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "目标成本不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(obj, data)
    obj.variance_amount = float(obj.target_amount) - float(obj.actual_amount)
    obj.updated_by = current_user.id
    await db.flush()
    return {"id": str(obj.id)}


@router.delete("/target-costs/{cost_id}")
async def delete_target_cost(cost_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(TargetCost).where(TargetCost.id == cost_id).values(is_deleted=True))
    return {"message": "删除成功"}


# ─── 预算明细 ───
@router.put("/{project_id}/budget-items")
async def update_budget_items(
    project_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == project_id, Project.is_deleted == False))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "项目不存在")
    items = body.get("items", [])
    total = sum(float(it.get("amount", 0)) for it in items)
    p.budget_items = items
    p.total_budget = total
    p.updated_by = current_user.id
    await db.flush()

    try:
        from app.models.finance.models import Budget
        existing_budget = (await db.execute(
            select(Budget).where(
                Budget.project_id == project_id,
                Budget.is_deleted == False,
                Budget.company_id == current_user.company_id,
            )
        )).scalar_one_or_none()
        if existing_budget:
            existing_budget.items = items
            existing_budget.total_budget = total
            existing_budget.updated_by = current_user.id
        elif total > 0:
            budget = Budget(
                name=f"{p.name}-项目预算",
                period_type="annual",
                period=str(date.today().year),
                project_id=project_id,
                items=items if items else None,
                total_budget=total,
                status="approved",
                source="project",
                company_id=current_user.company_id,
                created_by=current_user.id,
            )
            db.add(budget)
        await db.flush()
    except Exception:
        import logging
        logging.getLogger(__name__).exception("同步更新财务预算失败")

    return {"total_budget": total, "items": items}


# ─── 项目文档 ───
class ProjectDocCreate(BaseModel):
    project_id: str
    module_code: str
    doc_type: str
    name: str
    files: list[dict] | None = None
    remark: str | None = None

class ProjectDocUpdate(BaseModel):
    name: str | None = None
    files: list[dict] | None = None
    remark: str | None = None

@router.get("/{project_id}/documents")
async def list_project_docs(project_id: str, module_code: str | None = None, doc_type: str | None = None, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    query = select(ProjectDocument).where(ProjectDocument.project_id == project_id, ProjectDocument.is_deleted == False)
    if module_code: query = query.where(ProjectDocument.module_code == module_code)
    if doc_type: query = query.where(ProjectDocument.doc_type == doc_type)
    query = query.order_by(ProjectDocument.created_at.desc())
    result = await db.execute(query)
    docs = result.scalars().all()
    return [{"id": str(d.id), "module_code": d.module_code, "doc_type": d.doc_type, "name": d.name, "files": d.files, "remark": d.remark, "status": d.status, "created_at": str(d.created_at)} for d in docs]

@router.post("/{project_id}/documents")
async def create_project_doc(body: ProjectDocCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    doc = ProjectDocument(company_id=current_user.company_id, created_by=current_user.id, **body.model_dump())
    db.add(doc)
    await db.flush()
    return {"id": str(doc.id), "message": "已创建"}

@router.put("/documents/{doc_id}")
async def update_project_doc(doc_id: str, body: ProjectDocUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ProjectDocument).where(ProjectDocument.id == doc_id, ProjectDocument.is_deleted == False))
    doc = result.scalar_one_or_none()
    if not doc: raise HTTPException(404, "文档不存在")
    safe_update(doc, body)
    doc.updated_by = current_user.id
    await db.flush()
    return {"id": str(doc.id)}

@router.delete("/documents/{doc_id}")
async def delete_project_doc(doc_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(ProjectDocument).where(ProjectDocument.id == doc_id).values(is_deleted=True))
    return {"message": "已删除"}


# ─── 仓库管理 ───
class WarehouseCreate(BaseModel):
    name: str
    wh_type: str = "internal"
    location: str | None = None
    manager_id: str | None = None

class WarehouseUpdate(BaseModel):
    name: str | None = None
    wh_type: str | None = None
    location: str | None = None
    manager_id: str | None = None
    status: str | None = None

@router.get("/warehouses/list")
async def list_warehouses(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Warehouse).where(Warehouse.company_id == current_user.company_id, Warehouse.is_deleted == False).order_by(Warehouse.name))
    rows = result.scalars().all()
    return [{"id": str(w.id), "name": w.name, "wh_type": w.wh_type, "location": w.location, "manager_id": str(w.manager_id) if w.manager_id else None, "status": w.status} for w in rows]

@router.post("/warehouses/create")
async def create_warehouse(body: WarehouseCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    w = Warehouse(company_id=current_user.company_id, created_by=current_user.id, **body.model_dump())
    db.add(w)
    await db.flush()
    return {"id": str(w.id)}

@router.put("/warehouses/{wh_id}")
async def update_warehouse(wh_id: str, body: WarehouseUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Warehouse).where(Warehouse.id == wh_id, Warehouse.is_deleted == False))
    w = result.scalar_one_or_none()
    if not w: raise HTTPException(404, "仓库不存在")
    safe_update(w, body)
    w.updated_by = current_user.id
    await db.flush()
    return {"id": str(w.id)}

@router.delete("/warehouses/{wh_id}")
async def delete_warehouse(wh_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(Warehouse).where(Warehouse.id == wh_id).values(is_deleted=True))
    return {"message": "已删除"}


# ─── 库存物料 ───
class InventoryItemCreate(BaseModel):
    warehouse_id: str
    project_id: str | None = None
    category: str | None = None
    name: str
    model_spec: str | None = None
    unit: str = "个"
    quantity: float = 0
    unit_price: float = 0
    source_type: str | None = None
    source_id: str | None = None
    min_quantity: float = 0

class InventoryItemUpdate(BaseModel):
    category: str | None = None
    model_spec: str | None = None
    unit: str | None = None
    quantity: float | None = None
    unit_price: float | None = None
    min_quantity: float | None = None
    status: str | None = None

@router.get("/inventory/list")
async def list_inventory(warehouse_id: str | None = None, project_id: str | None = None, category: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=500), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    query = select(InventoryItem).where(InventoryItem.company_id == current_user.company_id, InventoryItem.is_deleted == False)
    if warehouse_id: query = query.where(InventoryItem.warehouse_id == warehouse_id)
    if project_id: query = query.where(InventoryItem.project_id == project_id)
    if category: query = query.where(InventoryItem.category == category)
    total_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(total_q)).scalar() or 0
    query = query.order_by(InventoryItem.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    rows = result.scalars().all()
    items = [{"id": str(r.id), "warehouse_id": str(r.warehouse_id), "project_id": str(r.project_id) if r.project_id else None, "category": r.category, "name": r.name, "model_spec": r.model_spec, "unit": r.unit, "quantity": float(r.quantity), "unit_price": float(r.unit_price), "total_value": float(r.total_value), "source_type": r.source_type, "min_quantity": float(r.min_quantity), "status": r.status} for r in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size}

@router.post("/inventory/create")
async def create_inventory_item(body: InventoryItemCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    total_value = float(body.quantity) * float(body.unit_price)
    item = InventoryItem(company_id=current_user.company_id, created_by=current_user.id, **body.model_dump(), total_value=total_value)
    db.add(item)
    await db.flush()
    return {"id": str(item.id)}

@router.put("/inventory/{item_id}")
async def update_inventory_item(item_id: str, body: InventoryItemUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InventoryItem).where(InventoryItem.id == item_id, InventoryItem.is_deleted == False))
    item = result.scalar_one_or_none()
    if not item: raise HTTPException(404, "物料不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(item, data)
    item.total_value = float(item.quantity) * float(item.unit_price)
    item.updated_by = current_user.id
    await db.flush()
    return {"id": str(item.id)}

@router.delete("/inventory/{item_id}")
async def delete_inventory_item(item_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(InventoryItem).where(InventoryItem.id == item_id).values(is_deleted=True))
    return {"message": "已删除"}


# ─── 库存出入库 ───
class InventoryTxCreate(BaseModel):
    item_id: str
    tx_type: str
    quantity: float
    unit_price: float | None = None
    from_warehouse_id: str | None = None
    to_warehouse_id: str | None = None
    project_id: str | None = None
    remark: str | None = None

@router.post("/inventory/transaction")
async def create_inventory_tx(body: InventoryTxCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InventoryItem).where(InventoryItem.id == body.item_id, InventoryItem.is_deleted == False))
    item = result.scalar_one_or_none()
    if not item: raise HTTPException(404, "物料不存在")
    qty = float(body.quantity)
    if body.tx_type in ("out", "project_apply") and float(item.quantity) < qty:
        raise HTTPException(400, "库存不足")
    tx = InventoryTransaction(company_id=current_user.company_id, created_by=current_user.id, operator_id=current_user.id, **body.model_dump())
    db.add(tx)
    if body.tx_type == "in":
        item.quantity = float(item.quantity) + qty
    elif body.tx_type in ("out", "project_apply"):
        item.quantity = float(item.quantity) - qty
    elif body.tx_type == "transfer":
        item.warehouse_id = body.to_warehouse_id or item.warehouse_id
    if body.to_warehouse_id and body.tx_type == "in":
        item.warehouse_id = body.to_warehouse_id
    item.total_value = float(item.quantity) * float(item.unit_price)
    if body.tx_type == "project_apply" and body.project_id:
        item.project_id = body.project_id
    await db.flush()
    return {"id": str(tx.id), "message": "操作成功"}

@router.get("/inventory/{item_id}/transactions")
async def list_item_transactions(item_id: str, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=500), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    query = select(InventoryTransaction).where(InventoryTransaction.item_id == item_id, InventoryTransaction.is_deleted == False).order_by(InventoryTransaction.created_at.desc())
    total_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(total_q)).scalar() or 0
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    rows = result.scalars().all()
    return {"items": [{"id": str(r.id), "tx_type": r.tx_type, "quantity": float(r.quantity), "unit_price": float(r.unit_price) if r.unit_price else None, "from_warehouse_id": str(r.from_warehouse_id) if r.from_warehouse_id else None, "to_warehouse_id": str(r.to_warehouse_id) if r.to_warehouse_id else None, "project_id": str(r.project_id) if r.project_id else None, "remark": r.remark, "created_at": str(r.created_at)} for r in rows], "total": total}


@router.post("/inventory/scan-lookup")
async def scan_lookup_inventory(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    barcode = body.get("barcode", "").strip()
    if not barcode:
        raise HTTPException(400, "条码不能为空")
    item = (await db.execute(
        select(InventoryItem).where(
            InventoryItem.barcode == barcode,
            InventoryItem.is_deleted == False,
            InventoryItem.company_id == current_user.company_id,
        )
    )).scalar_one_or_none()
    if not item:
        return {"found": False, "item": None}
    return {
        "found": True,
        "item": {
            "id": str(item.id),
            "name": item.name,
            "category": item.category,
            "model_spec": item.model_spec,
            "unit": item.unit,
            "quantity": float(item.quantity) if item.quantity else 0,
            "unit_price": float(item.unit_price) if item.unit_price else None,
            "warehouse_id": str(item.warehouse_id) if item.warehouse_id else None,
            "barcode": item.barcode,
            "status": item.status,
        },
    }


# ─── 固定资产 ───
class FixedAssetCreate(BaseModel):
    name: str
    category: str | None = None
    model_spec: str | None = None
    serial_no: str | None = None
    purchase_date: date | None = None
    original_value: float = 0
    current_value: float = 0
    depreciation_rate: float | None = None
    warehouse_id: str | None = None
    project_id: str | None = None
    remark: str | None = None
    attachments: list[dict] | None = None

class FixedAssetUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    model_spec: str | None = None
    serial_no: str | None = None
    purchase_date: date | None = None
    original_value: float | None = None
    current_value: float | None = None
    depreciation_rate: float | None = None
    warehouse_id: str | None = None
    project_id: str | None = None
    status: str | None = None
    remark: str | None = None
    attachments: list[dict] | None = None

class AssetAssignCreate(BaseModel):
    asset_id: str
    assignee_type: str
    assignee_id: str
    assign_date: date
    expected_return_date: date | None = None
    remark: str | None = None

class AssetReturnBody(BaseModel):
    actual_return_date: date

@router.get("/fixed-assets/list")
async def list_fixed_assets(status: str | None = None, category: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=500), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    query = select(FixedAsset).where(FixedAsset.company_id == current_user.company_id, FixedAsset.is_deleted == False)
    if status: query = query.where(FixedAsset.status == status)
    if category: query = query.where(FixedAsset.category == category)
    total_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(total_q)).scalar() or 0
    query = query.order_by(FixedAsset.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    rows = result.scalars().all()
    items = [{"id": str(r.id), "name": r.name, "category": r.category, "model_spec": r.model_spec, "serial_no": r.serial_no, "purchase_date": str(r.purchase_date) if r.purchase_date else None, "original_value": float(r.original_value), "current_value": float(r.current_value), "depreciation_rate": float(r.depreciation_rate) if r.depreciation_rate else None, "warehouse_id": str(r.warehouse_id) if r.warehouse_id else None, "project_id": str(r.project_id) if r.project_id else None, "assignee_type": r.assignee_type, "assignee_id": str(r.assignee_id) if r.assignee_id else None, "assign_date": str(r.assign_date) if r.assign_date else None, "status": r.status, "remark": r.remark, "attachments": r.attachments} for r in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size}

@router.post("/fixed-assets/create")
async def create_fixed_asset(body: FixedAssetCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    asset = FixedAsset(company_id=current_user.company_id, created_by=current_user.id, **body.model_dump())
    db.add(asset)
    await db.flush()
    return {"id": str(asset.id)}

@router.put("/fixed-assets/{asset_id}")
async def update_fixed_asset(asset_id: str, body: FixedAssetUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FixedAsset).where(FixedAsset.id == asset_id, FixedAsset.is_deleted == False))
    asset = result.scalar_one_or_none()
    if not asset: raise HTTPException(404, "资产不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(asset, data)
    asset.updated_by = current_user.id
    await db.flush()
    return {"id": str(asset.id)}

@router.delete("/fixed-assets/{asset_id}")
async def delete_fixed_asset(asset_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(FixedAsset).where(FixedAsset.id == asset_id).values(is_deleted=True))
    return {"message": "已删除"}

@router.post("/fixed-assets/{asset_id}/assign")
async def assign_fixed_asset(asset_id: str, body: AssetAssignCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FixedAsset).where(FixedAsset.id == asset_id, FixedAsset.is_deleted == False))
    asset = result.scalar_one_or_none()
    if not asset: raise HTTPException(404, "资产不存在")
    if asset.status == "assigned": raise HTTPException(400, "资产已领用")
    assignment = AssetAssignment(company_id=current_user.company_id, created_by=current_user.id, **body.model_dump())
    db.add(assignment)
    asset.assignee_type = body.assignee_type
    asset.assignee_id = body.assignee_id
    asset.assign_date = body.assign_date
    asset.status = "assigned"
    asset.updated_by = current_user.id
    await db.flush()
    return {"id": str(assignment.id), "message": "领用成功"}

@router.post("/fixed-assets/{asset_id}/return")
async def return_fixed_asset(asset_id: str, body: AssetReturnBody, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FixedAsset).where(FixedAsset.id == asset_id, FixedAsset.is_deleted == False))
    asset = result.scalar_one_or_none()
    if not asset: raise HTTPException(404, "资产不存在")
    result2 = await db.execute(select(AssetAssignment).where(AssetAssignment.asset_id == asset_id, AssetAssignment.status == "active", AssetAssignment.is_deleted == False).order_by(AssetAssignment.created_at.desc()).limit(1))
    asgn = result2.scalar_one_or_none()
    if asgn:
        asgn.actual_return_date = body.actual_return_date
        asgn.status = "returned"
        asgn.updated_by = current_user.id
    asset.assignee_type = None
    asset.assignee_id = None
    asset.assign_date = None
    asset.status = "in_stock"
    asset.updated_by = current_user.id
    await db.flush()
    return {"message": "归还成功"}

@router.get("/fixed-assets/{asset_id}/assignments")
async def list_asset_assignments(asset_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AssetAssignment).where(AssetAssignment.asset_id == asset_id, AssetAssignment.is_deleted == False).order_by(AssetAssignment.created_at.desc()))
    rows = result.scalars().all()
    return [{"id": str(r.id), "assignee_type": r.assignee_type, "assignee_id": str(r.assignee_id), "assign_date": str(r.assign_date), "expected_return_date": str(r.expected_return_date) if r.expected_return_date else None, "actual_return_date": str(r.actual_return_date) if r.actual_return_date else None, "status": r.status, "remark": r.remark} for r in rows]


@router.get("/{project_id}/investment-roi")
async def get_investment_roi(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.charging import ChargingStation
    from app.models.charging.models import StationFinancialMonthly
    from app.models.erp.models import Contract

    project = (await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.is_deleted == False,
            Project.company_id == current_user.company_id,
        )
    )).scalar_one_or_none()
    if not project:
        raise HTTPException(404, "项目不存在")

    total_investment = float(project.actual_cost) if project.actual_cost else 0
    if not total_investment and project.total_budget:
        total_investment = float(project.total_budget)

    station_ids = (await db.execute(
        select(ChargingStation.id).where(
            ChargingStation.project_id == project_id,
            ChargingStation.is_deleted == False,
        )
    )).scalars().all()

    total_revenue = 0.0
    monthly_trend = []
    if station_ids:
        monthly_rows = (await db.execute(
            select(
                StationFinancialMonthly.month,
                func.coalesce(func.sum(StationFinancialMonthly.total_revenue), 0),
            ).where(
                StationFinancialMonthly.station_id.in_(station_ids),
                StationFinancialMonthly.is_deleted == False,
            ).group_by(StationFinancialMonthly.month).order_by(StationFinancialMonthly.month)
        )).all()
        for m, rev in monthly_rows:
            monthly_trend.append({"month": m, "revenue": float(rev)})
            total_revenue += float(rev)

    from app.models.finance.models import ArApRecord

    contract_total = 0.0
    ar_total = (await db.execute(
        select(func.coalesce(func.sum(ArApRecord.total_amount), 0)).where(
            ArApRecord.project_id == project_id,
            ArApRecord.type == "ar",
            ArApRecord.is_deleted == False,
            ArApRecord.company_id == current_user.company_id,
        )
    )).scalar()
    if ar_total:
        contract_total = float(ar_total)

    ap_total = 0.0
    ap_rows = (await db.execute(
        select(func.coalesce(func.sum(ArApRecord.total_amount), 0)).where(
            ArApRecord.project_id == project_id,
            ArApRecord.type == "ap",
            ArApRecord.is_deleted == False,
            ArApRecord.company_id == current_user.company_id,
        )
    )).scalar()
    if ap_rows:
        ap_total = float(ap_rows)

    line_total = 0.0
    line_rows = (await db.execute(
        select(func.coalesce(func.sum(ProjectLine.amount), 0)).where(
            ProjectLine.project_id == project_id,
            ProjectLine.is_deleted == False,
            ProjectLine.company_id == current_user.company_id,
        )
    )).scalar()
    if line_rows:
        line_total = float(line_rows)

    total_revenue_combined = total_revenue + contract_total + line_total
    net_profit = total_revenue_combined - total_investment
    roi_pct = round((net_profit / total_investment * 100) if total_investment > 0 else 0, 2)

    payback_months = None
    if total_revenue > 0 and total_investment > 0:
        months_in_operation = len(monthly_trend) or 1
        avg_monthly = total_revenue / months_in_operation
        if avg_monthly > 0:
            payback_months = round(total_investment / avg_monthly, 1)

    return {
        "total_investment": total_investment,
        "total_revenue": total_revenue_combined,
        "revenue_from_operations": total_revenue,
        "revenue_from_contracts": contract_total,
        "total_payable": ap_total,
        "revenue_from_lines": line_total,
        "net_profit": round(net_profit, 2),
        "roi_percentage": roi_pct,
        "payback_months": payback_months,
        "monthly_revenue_trend": monthly_trend,
    }
