from sqlalchemy import Boolean, Date, DateTime, Integer, Numeric, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TenantBase


class Project(TenantBase):
    __tablename__ = "projects"
    project_code: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    project_type: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    priority: Mapped[int] = mapped_column(SmallInteger, default=2)
    customer_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    contract_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    counterparty_company: Mapped[str | None] = mapped_column(String(200))
    execution_unit_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    partner_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    enabled_modules: Mapped[dict | None] = mapped_column(JSONB)
    total_budget: Mapped[float | None] = mapped_column(Numeric(18, 2))
    budget_items: Mapped[dict | None] = mapped_column(JSONB)
    actual_cost: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    province: Mapped[str | None] = mapped_column(String(20))
    city: Mapped[str | None] = mapped_column(String(20))
    address: Mapped[str | None] = mapped_column(Text)
    longitude: Mapped[float | None] = mapped_column(Numeric(10, 7))
    latitude: Mapped[float | None] = mapped_column(Numeric(10, 7))
    start_date: Mapped[str | None] = mapped_column(Date)
    end_date: Mapped[str | None] = mapped_column(Date)
    actual_start_date: Mapped[str | None] = mapped_column(Date)
    actual_end_date: Mapped[str | None] = mapped_column(Date)
    progress: Mapped[int] = mapped_column(SmallInteger, default=0)
    project_manager_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    team_members: Mapped[dict | None] = mapped_column(JSONB)
    description: Mapped[str | None] = mapped_column(Text)
    workflow_instance_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    entity_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    operation_entity_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))


PROJECT_MODULES = [
    {"code": "land_lease", "name": "租地", "category": "preparation"},
    {"code": "ndrc_filing", "name": "发改备案", "category": "preparation"},
    {"code": "power_application", "name": "电力报装供电方案", "category": "preparation"},
    {"code": "civil_construction", "name": "土建施工", "category": "construction"},
    {"code": "transformer_supply", "name": "变压器供货", "category": "supply"},
    {"code": "cable_supply", "name": "电缆供货", "category": "supply"},
    {"code": "charging_pile_supply", "name": "充电桩供货", "category": "supply"},
    {"code": "electrical_material_supply", "name": "电气材料供货", "category": "supply"},
    {"code": "hv_installation", "name": "高压安装", "category": "installation"},
    {"code": "lv_installation", "name": "低压安装", "category": "installation"},
    {"code": "ancillary_construction", "name": "附属设施建设", "category": "construction"},
    {"code": "operation", "name": "运营", "category": "operation"},
    {"code": "partner_revenue_share", "name": "合作方分成", "category": "operation"},
]

MODULE_TEMPLATES = {
    "pure_engineering": {
        "name": "纯工程",
        "modules": ["ndrc_filing", "power_application", "civil_construction", "transformer_supply",
                     "cable_supply", "electrical_material_supply", "hv_installation", "lv_installation",
                     "ancillary_construction"],
    },
    "charging_epc": {
        "name": "充电站EPC",
        "modules": ["land_lease", "ndrc_filing", "power_application", "civil_construction",
                     "transformer_supply", "cable_supply", "charging_pile_supply", "electrical_material_supply",
                     "hv_installation", "lv_installation", "ancillary_construction"],
    },
    "self_invest_build": {
        "name": "自投自建",
        "modules": ["land_lease", "ndrc_filing", "power_application", "civil_construction",
                     "transformer_supply", "cable_supply", "charging_pile_supply", "electrical_material_supply",
                     "hv_installation", "lv_installation", "ancillary_construction", "operation"],
    },
    "cooperative_build": {
        "name": "合作共建",
        "modules": ["land_lease", "ndrc_filing", "power_application", "civil_construction",
                     "transformer_supply", "cable_supply", "charging_pile_supply", "electrical_material_supply",
                     "hv_installation", "lv_installation", "ancillary_construction", "operation",
                     "partner_revenue_share"],
    },
}


class ProjectMilestone(TenantBase):
    __tablename__ = "project_milestones"
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    planned_date: Mapped[str | None] = mapped_column(Date)
    actual_date: Mapped[str | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(SmallInteger, default=0)


class ProjectDailyTarget(TenantBase):
    __tablename__ = "project_daily_targets"
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    target_date: Mapped[str] = mapped_column(Date, nullable=False)
    target_content: Mapped[str | None] = mapped_column(Text)
    target_items: Mapped[dict | None] = mapped_column(JSONB)
    completion_content: Mapped[str | None] = mapped_column(Text)
    completion_items: Mapped[dict | None] = mapped_column(JSONB)
    overall_completion_rate: Mapped[int] = mapped_column(SmallInteger, default=0)
    deviation_analysis: Mapped[str | None] = mapped_column(Text)
    corrective_action: Mapped[str | None] = mapped_column(Text)
    weather: Mapped[str | None] = mapped_column(String(20))
    temperature: Mapped[str | None] = mapped_column(String(20))
    recorder_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    reviewer_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    status: Mapped[str] = mapped_column(String(20), default="draft")


class ProjectDailyBudget(TenantBase):
    __tablename__ = "project_daily_budgets"
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    budget_date: Mapped[str] = mapped_column(Date, nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    planned_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    actual_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    items: Mapped[dict | None] = mapped_column(JSONB)
    cumulative_budget: Mapped[float | None] = mapped_column(Numeric(18, 2))
    cumulative_actual: Mapped[float | None] = mapped_column(Numeric(18, 2))
    budget_execution_rate: Mapped[float | None] = mapped_column(Numeric(5, 2))
    variance_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    variance_reason: Mapped[str | None] = mapped_column(Text)
    recorder_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    status: Mapped[str] = mapped_column(String(20), default="draft")


class ProjectDailyLabor(TenantBase):
    __tablename__ = "project_daily_labor"
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    labor_date: Mapped[str] = mapped_column(Date, nullable=False)
    records: Mapped[dict | None] = mapped_column(JSONB)
    total_workers: Mapped[int] = mapped_column(SmallInteger, default=0)
    total_regular_hours: Mapped[float | None] = mapped_column(Numeric(8, 1))
    total_overtime_hours: Mapped[float | None] = mapped_column(Numeric(8, 1))
    total_labor_cost: Mapped[float | None] = mapped_column(Numeric(18, 2))
    recorder_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    workflow_instance_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))


class ProjectProcurementApproval(TenantBase):
    __tablename__ = "project_procurement_approvals"
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    approval_no: Mapped[str] = mapped_column(String(20), nullable=False)
    procurement_type: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    items: Mapped[dict | None] = mapped_column(JSONB)
    total_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    urgency: Mapped[str] = mapped_column(String(20), default="normal")
    expected_date: Mapped[str | None] = mapped_column(Date)
    budget_check: Mapped[dict | None] = mapped_column(JSONB)
    attachments: Mapped[dict | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    workflow_instance_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))


class ConstructionLog(TenantBase):
    __tablename__ = "construction_logs"
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    log_date: Mapped[str] = mapped_column(Date, nullable=False)
    weather: Mapped[str | None] = mapped_column(String(20))
    temperature: Mapped[str | None] = mapped_column(String(20))
    work_content: Mapped[str | None] = mapped_column(Text)
    worker_count: Mapped[int] = mapped_column(SmallInteger, default=0)
    equipment_used: Mapped[str | None] = mapped_column(Text)
    materials_used: Mapped[str | None] = mapped_column(Text)
    safety_status: Mapped[str] = mapped_column(String(20), default="normal")
    quality_issues: Mapped[str | None] = mapped_column(Text)
    photos: Mapped[list | None] = mapped_column(JSONB)
    recorder_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    execution_unit: Mapped[str | None] = mapped_column(String(200))
    feedback: Mapped[str | None] = mapped_column(Text)
    related_modules: Mapped[list | None] = mapped_column(JSONB)
    related_contracts: Mapped[list | None] = mapped_column(JSONB)


class SafetyInspection(TenantBase):
    __tablename__ = "safety_inspections"
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    inspection_date: Mapped[str] = mapped_column(Date, nullable=False)
    inspector_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    inspection_type: Mapped[str] = mapped_column(String(20), nullable=False)
    hazards: Mapped[list | None] = mapped_column(JSONB)
    overall_level: Mapped[str] = mapped_column(String(10), default="good")
    photos: Mapped[list | None] = mapped_column(JSONB)
    rectification_deadline: Mapped[str | None] = mapped_column(Date)
    rectification_status: Mapped[str] = mapped_column(String(20), default="pending")
    remark: Mapped[str | None] = mapped_column(Text)


class ProjectAcceptance(TenantBase):
    __tablename__ = "project_acceptances"
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    acceptance_type: Mapped[str] = mapped_column(String(20), nullable=False)
    acceptance_date: Mapped[str] = mapped_column(Date, nullable=False)
    acceptance_unit: Mapped[str | None] = mapped_column(String(200))
    result: Mapped[str] = mapped_column(String(20), default="passed")
    issues: Mapped[str | None] = mapped_column(Text)
    sign_off_photos: Mapped[list | None] = mapped_column(JSONB)
    handover_docs: Mapped[list | None] = mapped_column(JSONB)


class ServiceTicket(TenantBase):
    __tablename__ = "service_tickets"
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    ticket_no: Mapped[str] = mapped_column(String(20), nullable=False)
    service_type: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    customer_name: Mapped[str | None] = mapped_column(String(100))
    customer_phone: Mapped[str | None] = mapped_column(String(20))
    customer_company: Mapped[str | None] = mapped_column(String(200))
    priority: Mapped[int] = mapped_column(SmallInteger, default=2)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    assigned_to: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    assigned_at: Mapped[str | None] = mapped_column(Date)
    handling_records: Mapped[dict | None] = mapped_column(JSONB)
    resolution: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[str | None] = mapped_column(Date)
    customer_rating: Mapped[int | None] = mapped_column(SmallInteger)
    customer_feedback: Mapped[str | None] = mapped_column(Text)
    warranty_start: Mapped[str | None] = mapped_column(Date)
    warranty_end: Mapped[str | None] = mapped_column(Date)
    photos: Mapped[dict | None] = mapped_column(JSONB)
    documents: Mapped[dict | None] = mapped_column(JSONB)


class InspectionRecord(TenantBase):
    __tablename__ = "inspection_records"
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    ticket_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    inspection_type: Mapped[str] = mapped_column(String(20), nullable=False)
    inspection_date: Mapped[str] = mapped_column(Date, nullable=False)
    inspector_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    items: Mapped[dict | None] = mapped_column(JSONB)
    overall_result: Mapped[str] = mapped_column(String(20), default="normal")
    issues_found: Mapped[str | None] = mapped_column(Text)
    rectification_required: Mapped[bool] = mapped_column(Boolean, default=False)
    rectification_deadline: Mapped[str | None] = mapped_column(Date)
    rectification_status: Mapped[str] = mapped_column(String(20), default="none")
    photos: Mapped[dict | None] = mapped_column(JSONB)
    remark: Mapped[str | None] = mapped_column(Text)


class ProjectLine(TenantBase):
    __tablename__ = "project_lines"
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    line_type: Mapped[str] = mapped_column(String(30), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    source_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    source_type: Mapped[str | None] = mapped_column(String(50))
    source_no: Mapped[str | None] = mapped_column(String(50))
    description: Mapped[str | None] = mapped_column(Text)
    record_date: Mapped[str | None] = mapped_column(Date)
    travel_from: Mapped[str | None] = mapped_column(String(200))
    travel_to: Mapped[str | None] = mapped_column(String(200))
    travel_purpose: Mapped[str | None] = mapped_column(Text)


class ProjectLocation(TenantBase):
    __tablename__ = "project_locations"
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    location_name: Mapped[str | None] = mapped_column(String(200))
    province: Mapped[str | None] = mapped_column(String(50))
    city: Mapped[str | None] = mapped_column(String(50))
    district: Mapped[str | None] = mapped_column(String(50))
    address: Mapped[str | None] = mapped_column(String(500))
    longitude: Mapped[float | None] = mapped_column(Numeric(12, 8))
    latitude: Mapped[float | None] = mapped_column(Numeric(12, 8))
    radius_meters: Mapped[int] = mapped_column(Integer, default=500)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)


class TargetCost(TenantBase):
    __tablename__ = "target_costs"
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    module_code: Mapped[str | None] = mapped_column(String(50))
    target_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    actual_amount: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    variance_amount: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    variance_rate: Mapped[float | None] = mapped_column(Numeric(5, 2))
    status: Mapped[str] = mapped_column(String(20), default="active")
    remark: Mapped[str | None] = mapped_column(Text)


class ProjectDocument(TenantBase):
    __tablename__ = "project_documents"
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    module_code: Mapped[str] = mapped_column(String(50), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    files: Mapped[dict | None] = mapped_column(JSONB)
    remark: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="active")


class BankTransaction(TenantBase):
    __tablename__ = "bank_transactions"
    account_name: Mapped[str | None] = mapped_column(String(200))
    account_no: Mapped[str | None] = mapped_column(String(100))
    bank_name: Mapped[str | None] = mapped_column(String(100))
    tx_date: Mapped[str] = mapped_column(Date, nullable=False)
    tx_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    balance: Mapped[float | None] = mapped_column(Numeric(18, 2))
    counterparty: Mapped[str | None] = mapped_column(String(200))
    counterparty_account: Mapped[str | None] = mapped_column(String(100))
    summary: Mapped[str | None] = mapped_column(Text)
    purpose: Mapped[str | None] = mapped_column(String(100))
    tx_type: Mapped[str] = mapped_column(String(20), default="unknown")
    matched: Mapped[bool] = mapped_column(Boolean, default=False)
    matched_arap_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    invoice_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    import_batch: Mapped[str | None] = mapped_column(String(50))
    source: Mapped[str] = mapped_column(String(20), default="manual")
    source_ref: Mapped[str | None] = mapped_column(String(100), index=True)
    entity_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    expense_type: Mapped[str | None] = mapped_column(String(50))
    expense_subtype: Mapped[str | None] = mapped_column(String(50))
    contract_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    remark: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[dict | None] = mapped_column(JSONB)
    fund_level: Mapped[int] = mapped_column(SmallInteger, default=1)
    parent_tx_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    fund_group_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    attachments: Mapped[dict | None] = mapped_column(JSONB)
    # Tax & proxy payment fields
    is_proxy_payment: Mapped[bool] = mapped_column(Boolean, default=False)
    proxy_for_entity_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    tax_bearer: Mapped[str | None] = mapped_column(String(50))  # "self" / entity_code
    tax_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    tax_rate: Mapped[float | None] = mapped_column(Numeric(5, 2))
    invoice_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    actual_received: Mapped[float | None] = mapped_column(Numeric(18, 2))
    tax_loss: Mapped[float | None] = mapped_column(Numeric(18, 2))

class PersonalTransaction(TenantBase):
    __tablename__ = "personal_transactions"
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False)
    tx_date: Mapped[str] = mapped_column(Date, nullable=False)
    tx_time: Mapped[str | None] = mapped_column(String(20))
    tx_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    balance: Mapped[float | None] = mapped_column(Numeric(18, 2))
    counterparty: Mapped[str | None] = mapped_column(String(200))
    counterparty_name: Mapped[str | None] = mapped_column(String(200))
    counterparty_bank: Mapped[str | None] = mapped_column(String(100))
    counterparty_account: Mapped[str | None] = mapped_column(String(50))
    description: Mapped[str | None] = mapped_column(Text)
    tx_type: Mapped[str] = mapped_column(String(10), default="expense")
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    source_account: Mapped[str | None] = mapped_column(String(30))
    payment_channel: Mapped[str | None] = mapped_column(String(20))
    payment_method: Mapped[str | None] = mapped_column(String(50))
    transaction_type: Mapped[str | None] = mapped_column(String(50))
    goods: Mapped[str | None] = mapped_column(Text)
    tx_status: Mapped[str | None] = mapped_column(String(30))
    import_batch: Mapped[str | None] = mapped_column(String(50))
    source_ref: Mapped[str | None] = mapped_column(Text)
    original_data: Mapped[dict | None] = mapped_column(JSONB)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)
    fund_path: Mapped[dict | None] = mapped_column(JSONB, default=[])
    purpose: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(30))
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    remark: Mapped[str | None] = mapped_column(Text)
    merged_sources: Mapped[str | None] = mapped_column(String(100))
    merged_group_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))

class WorkflowDefinition(TenantBase):
    __tablename__ = "workflow_definitions"
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    business_type: Mapped[str] = mapped_column(String(50), nullable=False)
    steps: Mapped[dict] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active")

class CrmReminder(TenantBase):
    __tablename__ = "crm_reminders"
    lead_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    customer_name: Mapped[str | None] = mapped_column(String(200))
    reminder_type: Mapped[str] = mapped_column(String(50), nullable=False)
    remind_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False)
    content: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    assignee_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))

class CompanyEntity(TenantBase):
    __tablename__ = "company_entities"
    entity_name: Mapped[str] = mapped_column(String(200), nullable=False)
    entity_code: Mapped[str | None] = mapped_column(String(50))
    legal_person: Mapped[str | None] = mapped_column(String(50))
    tax_no: Mapped[str | None] = mapped_column(String(50))
    bank_name: Mapped[str | None] = mapped_column(String(100))
    bank_account: Mapped[str | None] = mapped_column(String(100))
    address: Mapped[str | None] = mapped_column(Text)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)

class FundDisbursement(TenantBase):
    __tablename__ = "fund_disbursements"
    fund_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    disburse_date: Mapped[str] = mapped_column(Date, nullable=False)
    payment_method: Mapped[str] = mapped_column(String(30), default="bank_transfer")
    payment_entity_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    remark: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="active")


class Warehouse(TenantBase):
    __tablename__ = "warehouses"
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    wh_type: Mapped[str] = mapped_column(String(20), default="internal")
    location: Mapped[str | None] = mapped_column(String(500))
    manager_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    status: Mapped[str] = mapped_column(String(20), default="active")


class InventoryItem(TenantBase):
    __tablename__ = "inventory_items"
    warehouse_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    category: Mapped[str | None] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    model_spec: Mapped[str | None] = mapped_column(String(200))
    unit: Mapped[str] = mapped_column(String(20), default="个")
    quantity: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    unit_price: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    total_value: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    source_type: Mapped[str | None] = mapped_column(String(30))
    source_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    min_quantity: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    status: Mapped[str] = mapped_column(String(20), default="in_stock")
    barcode: Mapped[str | None] = mapped_column(String(100), index=True)


class InventoryTransaction(TenantBase):
    __tablename__ = "inventory_transactions"
    item_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    tx_type: Mapped[str] = mapped_column(String(30), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    unit_price: Mapped[float | None] = mapped_column(Numeric(18, 2))
    from_warehouse_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    to_warehouse_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    operator_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    remark: Mapped[str | None] = mapped_column(Text)
    photos: Mapped[dict | None] = mapped_column(JSONB)


class FixedAsset(TenantBase):
    __tablename__ = "fixed_assets"
    asset_code: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    asset_name: Mapped[str] = mapped_column(String(200), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str | None] = mapped_column(String(50))
    model_spec: Mapped[str | None] = mapped_column(String(200))
    serial_no: Mapped[str | None] = mapped_column(String(100))
    purchase_date: Mapped[str | None] = mapped_column(Date)
    original_value: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    current_value: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    depreciation_rate: Mapped[float | None] = mapped_column(Numeric(5, 2), default=0)
    warehouse_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    assignee_type: Mapped[str | None] = mapped_column(String(20))
    assignee_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    assign_date: Mapped[str | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="in_stock")
    next_maintenance_date: Mapped[str | None] = mapped_column(Date)
    maintenance_cycle_days: Mapped[int | None] = mapped_column(SmallInteger, default=90)
    remark: Mapped[str | None] = mapped_column(Text)
    attachments: Mapped[dict | None] = mapped_column(JSONB)


class AssetAssignment(TenantBase):
    __tablename__ = "asset_assignments"
    asset_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    assignee_type: Mapped[str] = mapped_column(String(20), nullable=False)
    assignee_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    assign_date: Mapped[str] = mapped_column(Date, nullable=False)
    expected_return_date: Mapped[str | None] = mapped_column(Date)
    actual_return_date: Mapped[str | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="active")
    remark: Mapped[str | None] = mapped_column(Text)

