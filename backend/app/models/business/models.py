from sqlalchemy import Boolean, Date, DateTime, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TenantBase


class SiteDecision(TenantBase):
    __tablename__ = "site_decisions"
    site_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    decision_type: Mapped[str] = mapped_column(String(20), nullable=False)
    decision_date: Mapped[str] = mapped_column(Date, nullable=False)
    decision_reason: Mapped[str | None] = mapped_column(Text)
    investment_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    expected_roi_months: Mapped[int | None] = mapped_column(Integer)
    cooperate_partner: Mapped[str | None] = mapped_column(String(200))
    cooperate_ratio: Mapped[float | None] = mapped_column(Numeric(5, 2))
    approved_by: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    status: Mapped[str] = mapped_column(String(20), default="pending")


class ProjectPermit(TenantBase):
    __tablename__ = "project_permits"
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    permit_type: Mapped[str] = mapped_column(String(30), nullable=False)
    permit_no: Mapped[str | None] = mapped_column(String(50))
    permit_name: Mapped[str] = mapped_column(String(200), nullable=False)
    issuing_authority: Mapped[str | None] = mapped_column(String(200))
    apply_date: Mapped[str | None] = mapped_column(Date)
    approve_date: Mapped[str | None] = mapped_column(Date)
    expire_date: Mapped[str | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    attachments: Mapped[dict | None] = mapped_column(JSONB)
    remark: Mapped[str | None] = mapped_column(Text)


class ProjectWeeklyPlan(TenantBase):
    __tablename__ = "project_weekly_plans"
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    week_start: Mapped[str] = mapped_column(Date, nullable=False)
    week_end: Mapped[str] = mapped_column(Date, nullable=False)
    week_no: Mapped[int] = mapped_column(Integer, nullable=False)
    objectives: Mapped[str | None] = mapped_column(Text)
    key_tasks: Mapped[dict | None] = mapped_column(JSONB)
    resource_plan: Mapped[dict | None] = mapped_column(JSONB)
    risk_assessment: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    reviewer_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    feedback: Mapped[str | None] = mapped_column(Text)
    feedback_at: Mapped[str | None] = mapped_column(DateTime(timezone=True))


class ProjectDailyPlan(TenantBase):
    __tablename__ = "project_daily_plans"
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    weekly_plan_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    plan_date: Mapped[str] = mapped_column(Date, nullable=False)
    plan_category: Mapped[str] = mapped_column(String(20), default="engineering")
    tasks: Mapped[dict | None] = mapped_column(JSONB)
    materials: Mapped[dict | None] = mapped_column(JSONB)
    weather: Mapped[str | None] = mapped_column(String(20))
    temperature: Mapped[str | None] = mapped_column(String(20))
    estimated_hours: Mapped[float | None] = mapped_column(Numeric(5, 2))
    assigned_to: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    status: Mapped[str] = mapped_column(String(20), default="planned")


class ProjectDailyFeedback(TenantBase):
    __tablename__ = "project_daily_feedbacks"
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    daily_plan_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    feedback_date: Mapped[str] = mapped_column(Date, nullable=False)
    completed_tasks: Mapped[dict | None] = mapped_column(JSONB)
    issues: Mapped[str | None] = mapped_column(Text)
    photos: Mapped[dict | None] = mapped_column(JSONB)
    actual_hours: Mapped[float | None] = mapped_column(Numeric(8, 2))
    worker_count: Mapped[int] = mapped_column(Integer, default=0)
    recorder_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    completion_rate: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="draft")


class DailyExpense(TenantBase):
    __tablename__ = "daily_expenses"
    expense_date: Mapped[str] = mapped_column(Date, nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    payer_type: Mapped[str] = mapped_column(String(10), nullable=False)
    payer_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    payer_name: Mapped[str | None] = mapped_column(String(50))
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    station_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    receipt_photos: Mapped[dict | None] = mapped_column(JSONB)


class FixedExpense(TenantBase):
    __tablename__ = "fixed_expenses"
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    frequency: Mapped[str] = mapped_column(String(10), nullable=False)
    start_date: Mapped[str] = mapped_column(Date, nullable=False)
    end_date: Mapped[str | None] = mapped_column(Date)
    next_due_date: Mapped[str | None] = mapped_column(Date)
    payee: Mapped[str | None] = mapped_column(String(200))
    auto_record: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(10), default="active")
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    station_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))


class EmployeeDailyPlan(TenantBase):
    __tablename__ = "employee_daily_plans"
    plan_date: Mapped[str] = mapped_column(Date, nullable=False, index=True)
    employee_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    tasks: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_by_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(10), default="pending")
    completion_note: Mapped[str | None] = mapped_column(Text)


class WorkHourRecord(TenantBase):
    __tablename__ = "work_hour_records"
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    employee_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    work_date: Mapped[str] = mapped_column(Date, nullable=False)
    hours: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    work_type: Mapped[str | None] = mapped_column(String(30))
    description: Mapped[str | None] = mapped_column(Text)
    overtime_hours: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    status: Mapped[str] = mapped_column(String(10), default="submitted")


class TravelTrip(TenantBase):
    __tablename__ = "travel_trips"
    trip_no: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    employee_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    departure_date: Mapped[str] = mapped_column(Date, nullable=False)
    return_date: Mapped[str] = mapped_column(Date, nullable=False)
    origin: Mapped[str] = mapped_column(String(200), nullable=False)
    destination: Mapped[str] = mapped_column(String(200), nullable=False)
    vehicle: Mapped[str] = mapped_column(String(20), default="car")
    objectives: Mapped[str | None] = mapped_column(Text)
    planned_budget: Mapped[float | None] = mapped_column(Numeric(18, 2))
    actual_amount: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    status: Mapped[str] = mapped_column(String(20), default="planned")
    feedback: Mapped[str | None] = mapped_column(Text)
    completion_summary: Mapped[str | None] = mapped_column(Text)
    result_rating: Mapped[int | None] = mapped_column(Integer)
    photos: Mapped[dict | None] = mapped_column(JSONB)


class TravelProjectAllocation(TenantBase):
    __tablename__ = "travel_project_allocations"
    trip_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    share_ratio: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    allocated_amount: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    description: Mapped[str | None] = mapped_column(Text)


class TravelExpense(TenantBase):
    __tablename__ = "travel_expenses"
    trip_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    expense_type: Mapped[str] = mapped_column(String(30), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    expense_date: Mapped[str] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    receipt_url: Mapped[str | None] = mapped_column(String(500))
    ocr_result: Mapped[dict | None] = mapped_column(JSONB)
