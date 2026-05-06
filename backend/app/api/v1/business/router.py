import io
import json
import uuid
from datetime import date

import openpyxl
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import generate_no, get_current_user, get_db
from app.models.business.models import (
    DailyExpense,
    EmployeeDailyPlan,
    FixedExpense,
    ProjectDailyFeedback,
    ProjectDailyPlan,
    ProjectPermit,
    ProjectWeeklyPlan,
    SiteDecision,
    WorkHourRecord,
)
from app.models.charging import ChargingDevice, ChargingOrder, ChargingStation, StationFinancialMonthly
from app.models.organization import User
from app.core.security_utils import safe_update

router = APIRouter(tags=["业务管理"])


class SiteDecisionCreate(BaseModel):
    site_id: str
    decision_type: str = Field(..., max_length=20)
    decision_date: date
    decision_reason: str | None = None
    investment_amount: float | None = None
    expected_roi_months: int | None = None
    cooperate_partner: str | None = None
    cooperate_ratio: float | None = None
    approved_by: str | None = None
    status: str = "pending"


class SiteDecisionUpdate(BaseModel):
    decision_type: str | None = None
    decision_date: date | None = None
    decision_reason: str | None = None
    investment_amount: float | None = None
    expected_roi_months: int | None = None
    cooperate_partner: str | None = None
    cooperate_ratio: float | None = None
    approved_by: str | None = None
    status: str | None = None


@router.get("/site-decisions")
async def list_site_decisions(
    site_id: str | None = None,
    decision_type: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(SiteDecision).where(
        SiteDecision.is_deleted == False,
        SiteDecision.company_id == current_user.company_id,
    )
    if site_id:
        query = query.where(SiteDecision.site_id == site_id)
    if decision_type:
        query = query.where(SiteDecision.decision_type == decision_type)
    if status:
        query = query.where(SiteDecision.status == status)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(SiteDecision.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/site-decisions")
async def create_site_decision(
    body: SiteDecisionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = SiteDecision(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.get("/site-decisions/{decision_id}")
async def get_site_decision(
    decision_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SiteDecision).where(
            SiteDecision.id == decision_id,
            SiteDecision.is_deleted == False,
            SiteDecision.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="站点决策不存在")
    return obj


@router.put("/site-decisions/{decision_id}")
async def update_site_decision(
    decision_id: str,
    body: SiteDecisionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SiteDecision).where(
            SiteDecision.id == decision_id,
            SiteDecision.is_deleted == False,
            SiteDecision.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="站点决策不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(obj, data)
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/site-decisions/{decision_id}")
async def delete_site_decision(
    decision_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(SiteDecision)
        .where(
            SiteDecision.id == decision_id,
            SiteDecision.is_deleted == False,
            SiteDecision.company_id == current_user.company_id,
        )
        .values(is_deleted=True)
    )
    return {"message": "删除成功"}


class ProjectPermitCreate(BaseModel):
    project_id: str
    permit_type: str = Field(..., max_length=30)
    permit_name: str = Field(..., max_length=200)
    issuing_authority: str | None = None
    apply_date: date | None = None
    expire_date: date | None = None
    status: str = "pending"
    attachments: list | dict | None = None
    remark: str | None = None


class ProjectPermitUpdate(BaseModel):
    permit_type: str | None = None
    permit_name: str | None = None
    issuing_authority: str | None = None
    apply_date: date | None = None
    approve_date: date | None = None
    expire_date: date | None = None
    status: str | None = None
    attachments: list | dict | None = None
    remark: str | None = None


@router.get("/project-permits")
async def list_project_permits(
    project_id: str | None = None,
    permit_type: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ProjectPermit).where(
        ProjectPermit.is_deleted == False,
        ProjectPermit.company_id == current_user.company_id,
    )
    if project_id:
        query = query.where(ProjectPermit.project_id == project_id)
    if permit_type:
        query = query.where(ProjectPermit.permit_type == permit_type)
    if status:
        query = query.where(ProjectPermit.status == status)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(ProjectPermit.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/project-permits")
async def create_project_permit(
    body: ProjectPermitCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = ProjectPermit(
        **body.model_dump(),
        permit_no=generate_no("PM"),
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.get("/project-permits/{permit_id}")
async def get_project_permit(
    permit_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectPermit).where(
            ProjectPermit.id == permit_id,
            ProjectPermit.is_deleted == False,
            ProjectPermit.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="项目许可证不存在")
    return obj


@router.put("/project-permits/{permit_id}")
async def update_project_permit(
    permit_id: str,
    body: ProjectPermitUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectPermit).where(
            ProjectPermit.id == permit_id,
            ProjectPermit.is_deleted == False,
            ProjectPermit.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="项目许可证不存在")
    update_data = body.model_dump(exclude_unset=True)
    if update_data.get("status") == "approved" and not obj.approve_date:
        update_data["approve_date"] = date.today()
    safe_update(obj, update_data)
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/project-permits/{permit_id}")
async def delete_project_permit(
    permit_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(ProjectPermit)
        .where(
            ProjectPermit.id == permit_id,
            ProjectPermit.is_deleted == False,
            ProjectPermit.company_id == current_user.company_id,
        )
        .values(is_deleted=True)
    )
    return {"message": "删除成功"}


class WeeklyPlanCreate(BaseModel):
    project_id: str
    week_start: date
    week_end: date
    week_no: int
    objectives: str | None = None
    key_tasks: list | dict | None = None
    resource_plan: list | dict | None = None
    risk_assessment: str | None = None
    status: str = "draft"
    reviewer_id: str | None = None


class WeeklyPlanUpdate(BaseModel):
    week_start: date | None = None
    week_end: date | None = None
    week_no: int | None = None
    objectives: str | None = None
    key_tasks: list | dict | None = None
    resource_plan: list | dict | None = None
    risk_assessment: str | None = None
    status: str | None = None
    reviewer_id: str | None = None
    feedback: str | None = None


@router.get("/weekly-plans")
async def list_weekly_plans(
    project_id: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ProjectWeeklyPlan).where(
        ProjectWeeklyPlan.is_deleted == False,
        ProjectWeeklyPlan.company_id == current_user.company_id,
    )
    if project_id:
        query = query.where(ProjectWeeklyPlan.project_id == project_id)
    if status:
        query = query.where(ProjectWeeklyPlan.status == status)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(ProjectWeeklyPlan.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/weekly-plans")
async def create_weekly_plan(
    body: WeeklyPlanCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = ProjectWeeklyPlan(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.get("/weekly-plans/{plan_id}")
async def get_weekly_plan(
    plan_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectWeeklyPlan).where(
            ProjectWeeklyPlan.id == plan_id,
            ProjectWeeklyPlan.is_deleted == False,
            ProjectWeeklyPlan.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="周计划不存在")
    return obj


@router.put("/weekly-plans/{plan_id}")
async def update_weekly_plan(
    plan_id: str,
    body: WeeklyPlanUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectWeeklyPlan).where(
            ProjectWeeklyPlan.id == plan_id,
            ProjectWeeklyPlan.is_deleted == False,
            ProjectWeeklyPlan.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="周计划不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(obj, data)
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/weekly-plans/{plan_id}")
async def delete_weekly_plan(
    plan_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(ProjectWeeklyPlan)
        .where(
            ProjectWeeklyPlan.id == plan_id,
            ProjectWeeklyPlan.is_deleted == False,
            ProjectWeeklyPlan.company_id == current_user.company_id,
        )
        .values(is_deleted=True)
    )
    return {"message": "删除成功"}


class DailyPlanCreate(BaseModel):
    project_id: str
    weekly_plan_id: str | None = None
    plan_date: date
    tasks: list | dict | None = None
    materials: list | dict | None = None
    weather: str | None = None
    temperature: str | None = None
    estimated_hours: float | None = None
    assigned_to: str | None = None
    status: str = "planned"


class DailyPlanUpdate(BaseModel):
    weekly_plan_id: str | None = None
    plan_date: date | None = None
    tasks: list | dict | None = None
    materials: list | dict | None = None
    weather: str | None = None
    temperature: str | None = None
    estimated_hours: float | None = None
    assigned_to: str | None = None
    status: str | None = None


@router.get("/daily-plans")
async def list_daily_plans(
    project_id: str | None = None,
    weekly_plan_id: str | None = None,
    plan_date_start: date | None = None,
    plan_date_end: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ProjectDailyPlan).where(
        ProjectDailyPlan.is_deleted == False,
        ProjectDailyPlan.company_id == current_user.company_id,
    )
    if project_id:
        query = query.where(ProjectDailyPlan.project_id == project_id)
    if weekly_plan_id:
        query = query.where(ProjectDailyPlan.weekly_plan_id == weekly_plan_id)
    if plan_date_start:
        query = query.where(ProjectDailyPlan.plan_date >= plan_date_start)
    if plan_date_end:
        query = query.where(ProjectDailyPlan.plan_date <= plan_date_end)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(ProjectDailyPlan.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/daily-plans")
async def create_daily_plan(
    body: DailyPlanCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = ProjectDailyPlan(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.get("/daily-plans/{plan_id}")
async def get_daily_plan(
    plan_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectDailyPlan).where(
            ProjectDailyPlan.id == plan_id,
            ProjectDailyPlan.is_deleted == False,
            ProjectDailyPlan.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="日计划不存在")
    return obj


@router.put("/daily-plans/{plan_id}")
async def update_daily_plan(
    plan_id: str,
    body: DailyPlanUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectDailyPlan).where(
            ProjectDailyPlan.id == plan_id,
            ProjectDailyPlan.is_deleted == False,
            ProjectDailyPlan.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="日计划不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(obj, data)
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/daily-plans/{plan_id}")
async def delete_daily_plan(
    plan_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(ProjectDailyPlan)
        .where(
            ProjectDailyPlan.id == plan_id,
            ProjectDailyPlan.is_deleted == False,
            ProjectDailyPlan.company_id == current_user.company_id,
        )
        .values(is_deleted=True)
    )
    return {"message": "删除成功"}


class DailyFeedbackCreate(BaseModel):
    project_id: str
    daily_plan_id: str
    feedback_date: date
    completed_tasks: list | dict | None = None
    issues: str | None = None
    photos: list | dict | None = None
    actual_hours: float | None = None
    worker_count: int = 0
    completion_rate: int | None = None
    status: str = "draft"


class DailyFeedbackUpdate(BaseModel):
    completed_tasks: list | dict | None = None
    issues: str | None = None
    photos: list | dict | None = None
    actual_hours: float | None = None
    worker_count: int | None = None
    completion_rate: int | None = None
    status: str | None = None


@router.get("/daily-feedbacks")
async def list_daily_feedbacks(
    project_id: str | None = None,
    daily_plan_id: str | None = None,
    feedback_date: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ProjectDailyFeedback).where(
        ProjectDailyFeedback.is_deleted == False,
        ProjectDailyFeedback.company_id == current_user.company_id,
    )
    if project_id:
        query = query.where(ProjectDailyFeedback.project_id == project_id)
    if daily_plan_id:
        query = query.where(ProjectDailyFeedback.daily_plan_id == daily_plan_id)
    if feedback_date:
        query = query.where(ProjectDailyFeedback.feedback_date == feedback_date)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(ProjectDailyFeedback.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/daily-feedbacks")
async def create_daily_feedback(
    body: DailyFeedbackCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan_result = await db.execute(
        select(ProjectDailyPlan).where(
            ProjectDailyPlan.id == body.daily_plan_id,
            ProjectDailyPlan.is_deleted == False,
            ProjectDailyPlan.company_id == current_user.company_id,
        )
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="日计划不存在")
    obj = ProjectDailyFeedback(
        **body.model_dump(),
        recorder_id=current_user.id,
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(obj)
    if body.status == "submitted":
        plan.status = "in_progress"
        plan.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.get("/daily-feedbacks/{feedback_id}")
async def get_daily_feedback(
    feedback_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectDailyFeedback).where(
            ProjectDailyFeedback.id == feedback_id,
            ProjectDailyFeedback.is_deleted == False,
            ProjectDailyFeedback.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="日反馈不存在")
    return obj


@router.put("/daily-feedbacks/{feedback_id}")
async def update_daily_feedback(
    feedback_id: str,
    body: DailyFeedbackUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectDailyFeedback).where(
            ProjectDailyFeedback.id == feedback_id,
            ProjectDailyFeedback.is_deleted == False,
            ProjectDailyFeedback.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="日反馈不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(obj, data)
    obj.updated_by = current_user.id
    if body.status == "submitted" and obj.daily_plan_id:
        plan_result = await db.execute(
            select(ProjectDailyPlan).where(ProjectDailyPlan.id == obj.daily_plan_id)
        )
        plan = plan_result.scalar_one_or_none()
        if plan and plan.status != "in_progress":
            plan.status = "in_progress"
            plan.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/daily-feedbacks/{feedback_id}")
async def delete_daily_feedback(
    feedback_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(ProjectDailyFeedback)
        .where(
            ProjectDailyFeedback.id == feedback_id,
            ProjectDailyFeedback.is_deleted == False,
            ProjectDailyFeedback.company_id == current_user.company_id,
        )
        .values(is_deleted=True)
    )
    return {"message": "删除成功"}


class DailyExpenseCreate(BaseModel):
    expense_date: date
    category: str = Field(..., max_length=30)
    amount: float
    description: str | None = None
    payer_type: str = Field(..., max_length=10)
    payer_id: str | None = None
    payer_name: str | None = None
    project_id: str | None = None
    station_id: str | None = None
    receipt_photos: list | dict | None = None


class DailyExpenseUpdate(BaseModel):
    expense_date: date | None = None
    category: str | None = None
    amount: float | None = None
    description: str | None = None
    payer_type: str | None = None
    payer_id: str | None = None
    payer_name: str | None = None
    project_id: str | None = None
    station_id: str | None = None
    receipt_photos: list | dict | None = None


@router.get("/daily-expenses/summary")
async def daily_expense_summary(
    start_date: date | None = None,
    end_date: date | None = None,
    project_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(DailyExpense).where(
        DailyExpense.is_deleted == False,
        DailyExpense.company_id == current_user.company_id,
    )
    if start_date:
        query = query.where(DailyExpense.expense_date >= start_date)
    if end_date:
        query = query.where(DailyExpense.expense_date <= end_date)
    if project_id:
        query = query.where(DailyExpense.project_id == project_id)

    cat_q = select(DailyExpense.category, func.sum(DailyExpense.amount)).where(
        DailyExpense.is_deleted == False,
        DailyExpense.company_id == current_user.company_id,
    )
    payer_q = select(DailyExpense.payer_type, func.sum(DailyExpense.amount)).where(
        DailyExpense.is_deleted == False,
        DailyExpense.company_id == current_user.company_id,
    )
    total_q = select(func.sum(DailyExpense.amount)).where(
        DailyExpense.is_deleted == False,
        DailyExpense.company_id == current_user.company_id,
    )
    if start_date:
        cat_q = cat_q.where(DailyExpense.expense_date >= start_date)
        payer_q = payer_q.where(DailyExpense.expense_date >= start_date)
        total_q = total_q.where(DailyExpense.expense_date >= start_date)
    if end_date:
        cat_q = cat_q.where(DailyExpense.expense_date <= end_date)
        payer_q = payer_q.where(DailyExpense.expense_date <= end_date)
        total_q = total_q.where(DailyExpense.expense_date <= end_date)
    if project_id:
        cat_q = cat_q.where(DailyExpense.project_id == project_id)
        payer_q = payer_q.where(DailyExpense.project_id == project_id)
        total_q = total_q.where(DailyExpense.project_id == project_id)

    cat_q = cat_q.group_by(DailyExpense.category)
    payer_q = payer_q.group_by(DailyExpense.payer_type)

    cat_result = (await db.execute(cat_q)).all()
    payer_result = (await db.execute(payer_q)).all()
    total = (await db.execute(total_q)).scalar() or 0

    return {
        "by_category": [{"category": r[0], "amount": float(r[1])} for r in cat_result],
        "by_payer": [{"payer_type": r[0], "amount": float(r[1])} for r in payer_result],
        "total": float(total),
    }


@router.get("/daily-expenses")
async def list_daily_expenses(
    expense_date_start: date | None = None,
    expense_date_end: date | None = None,
    category: str | None = None,
    payer_type: str | None = None,
    project_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(DailyExpense).where(
        DailyExpense.is_deleted == False,
        DailyExpense.company_id == current_user.company_id,
    )
    if expense_date_start:
        query = query.where(DailyExpense.expense_date >= expense_date_start)
    if expense_date_end:
        query = query.where(DailyExpense.expense_date <= expense_date_end)
    if category:
        query = query.where(DailyExpense.category == category)
    if payer_type:
        query = query.where(DailyExpense.payer_type == payer_type)
    if project_id:
        query = query.where(DailyExpense.project_id == project_id)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(DailyExpense.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/daily-expenses")
async def create_daily_expense(
    body: DailyExpenseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    dump = body.model_dump()
    if not dump.get("project_id"):
        try:
            from app.services.auto_link import apply_auto_link
            link = await apply_auto_link(db, current_user.company_id, "expense", "", dump, str(current_user.id))
            if link.get("project_id") and link["confidence"] >= 0.8:
                dump["project_id"] = link["project_id"]
        except Exception:
            pass
    obj = DailyExpense(**dump, company_id=current_user.company_id, created_by=current_user.id)
    db.add(obj)
    await db.flush()

    if dump.get("project_id"):
        try:
            from app.services.project_cost import ProjectCostService
            await ProjectCostService.allocate_cost(
                project_id=body.project_id,
                line_type="daily_expense",
                amount=body.amount,
                source_id=str(obj.id),
                source_type="DailyExpense",
                source_no=None,
                db=db,
                company_id=current_user.company_id,
                user_id=current_user.id,
                record_date=body.expense_date,
                description=body.description,
            )
        except Exception:
            pass

    await db.refresh(obj)
    return obj


@router.get("/daily-expenses/{expense_id}")
async def get_daily_expense(
    expense_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DailyExpense).where(
            DailyExpense.id == expense_id,
            DailyExpense.is_deleted == False,
            DailyExpense.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="日常费用不存在")
    return obj


@router.put("/daily-expenses/{expense_id}")
async def update_daily_expense(
    expense_id: str,
    body: DailyExpenseUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DailyExpense).where(
            DailyExpense.id == expense_id,
            DailyExpense.is_deleted == False,
            DailyExpense.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="日常费用不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(obj, data)
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/daily-expenses/{expense_id}")
async def delete_daily_expense(
    expense_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DailyExpense).where(
            DailyExpense.id == expense_id,
            DailyExpense.is_deleted == False,
            DailyExpense.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="日常费用不存在")

    obj.is_deleted = True
    obj.updated_by = current_user.id

    if obj.project_id:
        try:
            from app.services.project_cost import ProjectCostService
            await ProjectCostService.allocate_cost(
                project_id=str(obj.project_id),
                line_type="daily_expense",
                amount=-float(obj.amount or 0),
                source_id=str(obj.id),
                source_type="DailyExpense",
                source_no=None,
                db=db,
                company_id=current_user.company_id,
                user_id=current_user.id,
                record_date=obj.expense_date,
                description=f"删除日费用回退: {obj.description or ''}",
            )
        except Exception:
            pass

    await db.flush()
    return {"message": "删除成功"}


class FixedExpenseCreate(BaseModel):
    name: str = Field(..., max_length=200)
    category: str = Field(..., max_length=30)
    amount: float
    frequency: str = Field(..., max_length=10)
    start_date: date
    end_date: date | None = None
    next_due_date: date | None = None
    payee: str | None = None
    auto_record: bool = False
    status: str = "active"
    project_id: str | None = None
    station_id: str | None = None


class FixedExpenseUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    amount: float | None = None
    frequency: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    next_due_date: date | None = None
    payee: str | None = None
    auto_record: bool | None = None
    status: str | None = None
    project_id: str | None = None
    station_id: str | None = None


@router.get("/fixed-expenses")
async def list_fixed_expenses(
    category: str | None = None,
    frequency: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(FixedExpense).where(
        FixedExpense.is_deleted == False,
        FixedExpense.company_id == current_user.company_id,
    )
    if category:
        query = query.where(FixedExpense.category == category)
    if frequency:
        query = query.where(FixedExpense.frequency == frequency)
    if status:
        query = query.where(FixedExpense.status == status)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(FixedExpense.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/fixed-expenses")
async def create_fixed_expense(
    body: FixedExpenseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = FixedExpense(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.get("/fixed-expenses/{expense_id}")
async def get_fixed_expense(
    expense_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FixedExpense).where(
            FixedExpense.id == expense_id,
            FixedExpense.is_deleted == False,
            FixedExpense.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="固定费用不存在")
    return obj


@router.put("/fixed-expenses/{expense_id}")
async def update_fixed_expense(
    expense_id: str,
    body: FixedExpenseUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FixedExpense).where(
            FixedExpense.id == expense_id,
            FixedExpense.is_deleted == False,
            FixedExpense.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="固定费用不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(obj, data)
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/fixed-expenses/{expense_id}")
async def delete_fixed_expense(
    expense_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(FixedExpense)
        .where(
            FixedExpense.id == expense_id,
            FixedExpense.is_deleted == False,
            FixedExpense.company_id == current_user.company_id,
        )
        .values(is_deleted=True)
    )
    return {"message": "删除成功"}


class EmployeePlanCreate(BaseModel):
    employee_id: str
    plan_date: date
    tasks: list | dict
    status: str = "pending"


class EmployeePlanUpdate(BaseModel):
    tasks: list | dict | None = None
    status: str | None = None
    completion_note: str | None = None


@router.get("/employee-plans/my-plan")
async def get_my_plan(
    plan_date: date | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    target_date = plan_date or date.today()
    result = await db.execute(
        select(EmployeeDailyPlan).where(
            EmployeeDailyPlan.employee_id == current_user.id,
            EmployeeDailyPlan.plan_date == target_date,
            EmployeeDailyPlan.is_deleted == False,
            EmployeeDailyPlan.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        return {"plan_date": str(target_date), "items": [], "status": "none"}
    return obj


@router.get("/employee-plans")
async def list_employee_plans(
    employee_id: str | None = None,
    plan_date_start: date | None = None,
    plan_date_end: date | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(EmployeeDailyPlan).where(
        EmployeeDailyPlan.is_deleted == False,
        EmployeeDailyPlan.company_id == current_user.company_id,
    )
    if employee_id:
        query = query.where(EmployeeDailyPlan.employee_id == employee_id)
    if plan_date_start:
        query = query.where(EmployeeDailyPlan.plan_date >= plan_date_start)
    if plan_date_end:
        query = query.where(EmployeeDailyPlan.plan_date <= plan_date_end)
    if status:
        query = query.where(EmployeeDailyPlan.status == status)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(EmployeeDailyPlan.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/employee-plans")
async def create_employee_plan(
    body: EmployeePlanCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = EmployeeDailyPlan(
        **body.model_dump(),
        created_by_admin=True,
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.get("/employee-plans/{plan_id}")
async def get_employee_plan(
    plan_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmployeeDailyPlan).where(
            EmployeeDailyPlan.id == plan_id,
            EmployeeDailyPlan.is_deleted == False,
            EmployeeDailyPlan.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="员工日计划不存在")
    return obj


@router.put("/employee-plans/{plan_id}")
async def update_employee_plan(
    plan_id: str,
    body: EmployeePlanUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmployeeDailyPlan).where(
            EmployeeDailyPlan.id == plan_id,
            EmployeeDailyPlan.is_deleted == False,
            EmployeeDailyPlan.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="员工日计划不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(obj, data)
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


class CompleteNote(BaseModel):
    completion_note: str


@router.put("/employee-plans/{plan_id}/complete")
async def complete_employee_plan(
    plan_id: str,
    body: CompleteNote,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmployeeDailyPlan).where(
            EmployeeDailyPlan.id == plan_id,
            EmployeeDailyPlan.is_deleted == False,
            EmployeeDailyPlan.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="员工日计划不存在")
    obj.status = "completed"
    obj.completion_note = body.completion_note
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/employee-plans/{plan_id}")
async def delete_employee_plan(
    plan_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(EmployeeDailyPlan)
        .where(
            EmployeeDailyPlan.id == plan_id,
            EmployeeDailyPlan.is_deleted == False,
            EmployeeDailyPlan.company_id == current_user.company_id,
        )
        .values(is_deleted=True)
    )
    return {"message": "删除成功"}


class WorkHourCreate(BaseModel):
    project_id: str
    employee_id: str | None = None
    work_date: date
    hours: float
    work_type: str | None = None
    description: str | None = None
    overtime_hours: float = 0
    status: str = "submitted"


class WorkHourUpdate(BaseModel):
    hours: float | None = None
    work_type: str | None = None
    description: str | None = None
    overtime_hours: float | None = None
    status: str | None = None


@router.get("/work-hours/summary")
async def work_hour_summary(
    start_date: date | None = None,
    end_date: date | None = None,
    project_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(
        WorkHourRecord.employee_id,
        func.sum(WorkHourRecord.hours).label("total_hours"),
        func.sum(WorkHourRecord.overtime_hours).label("total_overtime"),
        func.count().label("record_count"),
    ).where(
        WorkHourRecord.is_deleted == False,
        WorkHourRecord.company_id == current_user.company_id,
    )
    if start_date:
        query = query.where(WorkHourRecord.work_date >= start_date)
    if end_date:
        query = query.where(WorkHourRecord.work_date <= end_date)
    if project_id:
        query = query.where(WorkHourRecord.project_id == project_id)
    query = query.group_by(WorkHourRecord.employee_id)
    result = (await db.execute(query)).all()
    return {
        "items": [
            {
                "employee_id": str(r[0]),
                "total_hours": float(r[1] or 0),
                "total_overtime": float(r[2] or 0),
                "record_count": r[3],
            }
            for r in result
        ]
    }


@router.get("/work-hours")
async def list_work_hours(
    project_id: str | None = None,
    employee_id: str | None = None,
    work_date_start: date | None = None,
    work_date_end: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(WorkHourRecord).where(
        WorkHourRecord.is_deleted == False,
        WorkHourRecord.company_id == current_user.company_id,
    )
    if project_id:
        query = query.where(WorkHourRecord.project_id == project_id)
    if employee_id:
        query = query.where(WorkHourRecord.employee_id == employee_id)
    if work_date_start:
        query = query.where(WorkHourRecord.work_date >= work_date_start)
    if work_date_end:
        query = query.where(WorkHourRecord.work_date <= work_date_end)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(WorkHourRecord.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/work-hours")
async def create_work_hour(
    body: WorkHourCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump()
    if not data.get("employee_id"):
        data["employee_id"] = str(current_user.id)
    obj = WorkHourRecord(**data, company_id=current_user.company_id, created_by=current_user.id)
    db.add(obj)
    await db.flush()

    try:
        from app.services.project_cost import ProjectCostService
        hourly_rate = 0.0
        if body.work_type == "management":
            hourly_rate = 80.0
        elif body.work_type == "technical":
            hourly_rate = 100.0
        elif body.work_type == "labor":
            hourly_rate = 50.0
        else:
            hourly_rate = 60.0
        cost = body.hours * hourly_rate
        if cost > 0:
            await ProjectCostService.allocate_cost(
                project_id=body.project_id,
                line_type="salary",
                amount=cost,
                source_id=str(obj.id),
                source_type="WorkHourRecord",
                source_no=None,
                db=db,
                company_id=current_user.company_id,
                user_id=current_user.id,
                record_date=body.work_date,
                description=f"{body.work_type or 'work'} {body.hours}h x {hourly_rate}/h",
            )
    except Exception:
        pass

    await db.refresh(obj)
    return obj


@router.get("/work-hours/{record_id}")
async def get_work_hour(
    record_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkHourRecord).where(
            WorkHourRecord.id == record_id,
            WorkHourRecord.is_deleted == False,
            WorkHourRecord.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="工时记录不存在")
    return obj


@router.put("/work-hours/{record_id}")
async def update_work_hour(
    record_id: str,
    body: WorkHourUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkHourRecord).where(
            WorkHourRecord.id == record_id,
            WorkHourRecord.is_deleted == False,
            WorkHourRecord.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="工时记录不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(obj, data)
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/work-hours/{record_id}")
async def delete_work_hour(
    record_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkHourRecord).where(
            WorkHourRecord.id == record_id,
            WorkHourRecord.is_deleted == False,
            WorkHourRecord.company_id == current_user.company_id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="工时记录不存在")

    record.is_deleted = True
    record.updated_by = current_user.id

    try:
        from app.services.project_cost import ProjectCostService
        hourly_rate = {"management": 80.0, "technical": 100.0, "labor": 50.0}.get(record.work_type, 60.0)
        cost = float(record.hours) * hourly_rate
        if cost > 0 and record.project_id:
            await ProjectCostService.allocate_cost(
                project_id=str(record.project_id),
                line_type="salary",
                amount=-cost,
                source_id=str(record.id),
                source_type="WorkHourRecord",
                source_no=None,
                db=db,
                company_id=current_user.company_id,
                user_id=current_user.id,
                record_date=record.work_date,
                description=f"删除工时回退: {record.work_type} {record.hours}h",
            )
    except Exception:
        pass

    await db.flush()
    return {"message": "删除成功"}


@router.post("/charging-orders/import")
async def import_charging_orders(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename or not file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="仅支持.xlsx格式文件")

    content = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(content))
    ws = wb.active

    station_result = await db.execute(
        select(ChargingStation).where(
            ChargingStation.is_deleted == False,
            ChargingStation.company_id == current_user.company_id,
        )
    )
    stations = station_result.scalars().all()
    station_map = {}
    for s in stations:
        station_map[s.name] = s
        station_map[s.station_code] = s

    device_result = await db.execute(
        select(ChargingDevice).where(
            ChargingDevice.is_deleted == False,
            ChargingDevice.company_id == current_user.company_id,
        )
    )
    devices = device_result.scalars().all()
    device_map = {d.device_code: d for d in devices}

    imported = 0
    errors = []
    rows = list(ws.iter_rows(min_row=2, values_only=True))

    for idx, row in enumerate(rows, start=2):
        try:
            if not row or len(row) < 9:
                errors.append({"row": idx, "error": "数据列不足"})
                continue

            order_no = str(row[0]).strip() if row[0] else None
            station_key = str(row[1]).strip() if row[1] else None
            device_code = str(row[2]).strip() if row[2] else None
            charging_kwh = float(row[3]) if row[3] else None
            energy_price = float(row[4]) if row[4] else None
            service_price = float(row[5]) if row[5] else None
            total_amount = float(row[6]) if row[6] else None
            pay_method = str(row[7]).strip() if row[7] else None
            pay_status = str(row[8]).strip() if row[8] else "unpaid"

            if not order_no or not station_key:
                errors.append({"row": idx, "error": "订单号或站点信息缺失"})
                continue

            station = station_map.get(station_key)
            if not station:
                errors.append({"row": idx, "error": f"未找到站点: {station_key}"})
                continue

            device = None
            if device_code:
                device = device_map.get(device_code)
                if not device:
                    errors.append({"row": idx, "error": f"未找到设备: {device_code}"})
                    continue

            order = ChargingOrder(
                order_no=order_no,
                station_id=station.id,
                device_id=device.id if device else station.id,
                charging_kwh=charging_kwh,
                energy_price=energy_price,
                service_price=service_price,
                total_amount=total_amount,
                pay_amount=total_amount,
                pay_method=pay_method,
                pay_status=pay_status,
                status="completed" if pay_status == "paid" else "charging",
                company_id=current_user.company_id,
                created_by=current_user.id,
            )
            db.add(order)
            imported += 1
        except Exception as e:
            errors.append({"row": idx, "error": str(e)})

    await db.flush()
    return {"imported": imported, "errors": errors}


@router.get("/ai/pricing-suggestion")
async def pricing_suggestion(
    station_id: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    station_result = await db.execute(
        select(ChargingStation).where(
            ChargingStation.id == station_id,
            ChargingStation.is_deleted == False,
            ChargingStation.company_id == current_user.company_id,
        )
    )
    station = station_result.scalar_one_or_none()
    if not station:
        raise HTTPException(status_code=404, detail="站点不存在")

    financial_result = await db.execute(
        select(StationFinancialMonthly).where(
            StationFinancialMonthly.station_id == station_id,
            StationFinancialMonthly.is_deleted == False,
            StationFinancialMonthly.company_id == current_user.company_id,
        ).order_by(StationFinancialMonthly.month.desc()).limit(6)
    )
    finances = financial_result.scalars().all()

    similar_result = await db.execute(
        select(ChargingStation).where(
            ChargingStation.is_deleted == False,
            ChargingStation.company_id == current_user.company_id,
            ChargingStation.city == station.city,
            ChargingStation.id != station_id,
        ).limit(10)
    )
    similar_stations = similar_result.scalars().all()

    similar_finances = []
    if similar_stations:
        similar_ids = [s.id for s in similar_stations]
        sf_result = await db.execute(
            select(StationFinancialMonthly).where(
                StationFinancialMonthly.station_id.in_(similar_ids),
                StationFinancialMonthly.is_deleted == False,
                StationFinancialMonthly.company_id == current_user.company_id,
            ).order_by(StationFinancialMonthly.month.desc()).limit(30)
        )
        similar_finances = sf_result.scalars().all()

    current_pricing = {}
    if finances:
        latest = finances[0]
        avg_kwh_price = None
        if latest.total_kwh and float(latest.total_kwh) > 0:
            avg_kwh_price = round(float(latest.total_revenue or 0) / float(latest.total_kwh), 4)
        current_pricing = {
            "station_name": station.name,
            "latest_month": latest.month,
            "total_orders": latest.total_orders,
            "total_kwh": float(latest.total_kwh or 0),
            "total_revenue": float(latest.total_revenue or 0),
            "electricity_cost": float(latest.electricity_cost or 0),
            "gross_margin": float(latest.gross_margin or 0),
            "avg_kwh_price": avg_kwh_price,
        }

    similar_avg_margin = 0
    similar_avg_kwh_revenue = 0
    if similar_finances:
        margins = [float(f.gross_margin or 0) for f in similar_finances]
        kwh_revenues = []
        for f in similar_finances:
            if f.total_kwh and float(f.total_kwh) > 0:
                kwh_revenues.append(float(f.total_revenue or 0) / float(f.total_kwh))
        similar_avg_margin = round(sum(margins) / len(margins), 2) if margins else 0
        similar_avg_kwh_revenue = round(sum(kwh_revenues) / len(kwh_revenues), 4) if kwh_revenues else 0

    suggestion = {}
    reasoning_parts = []

    if finances:
        latest = finances[0]
        latest_margin = float(latest.gross_margin or 0)
        avg_energy_price = None
        avg_service_price = None
        if latest.total_kwh and float(latest.total_kwh) > 0:
            avg_energy_price = round(float(latest.total_energy_revenue or 0) / float(latest.total_kwh), 4)
            avg_service_price = round(float(latest.total_service_revenue or 0) / float(latest.total_kwh), 4)

        suggested_energy = avg_energy_price
        suggested_service = avg_service_price

        if latest_margin < 20:
            if similar_avg_margin > latest_margin and similar_avg_kwh_revenue > 0:
                target_kwh_revenue = similar_avg_kwh_revenue
                cost_per_kwh = float(latest.electricity_cost or 0) / max(float(latest.total_kwh or 1), 1)
                suggested_total = cost_per_kwh / (1 - 0.25)
                if suggested_total > (avg_energy_price or 0) + (avg_service_price or 0):
                    suggested_energy = round(suggested_total * 0.6, 4)
                    suggested_service = round(suggested_total * 0.4, 4)
            reasoning_parts.append(f"当前毛利率{latest_margin}%偏低，建议适当提高定价以改善盈利")
        elif latest_margin > 60:
            reasoning_parts.append(f"当前毛利率{latest_margin}%较高，定价具备竞争力，可维持或微调")
        else:
            reasoning_parts.append(f"当前毛利率{latest_margin}%处于合理区间")

        if similar_avg_kwh_revenue > 0:
            reasoning_parts.append(f"同区域站点平均度电收入{similar_avg_kwh_revenue}元")

        suggestion = {
            "suggested_energy_price": suggested_energy,
            "suggested_service_price": suggested_service,
            "suggested_total_per_kwh": round((suggested_energy or 0) + (suggested_service or 0), 4),
            "target_gross_margin": 30 if latest_margin < 20 else latest_margin,
        }
    else:
        reasoning_parts.append("暂无历史财务数据，无法生成定价建议")
        suggestion = {
            "suggested_energy_price": None,
            "suggested_service_price": None,
            "suggested_total_per_kwh": None,
            "target_gross_margin": None,
        }

    reasoning = "；".join(reasoning_parts) if reasoning_parts else "数据不足"

    return {
        "current_pricing": current_pricing,
        "suggestion": suggestion,
        "reasoning": reasoning,
    }
