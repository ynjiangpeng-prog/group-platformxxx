from sqlalchemy import Boolean, Date, Float, Numeric, SmallInteger, String, Text, Integer
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TenantBase


class AccountSubject(TenantBase):
    __tablename__ = "account_subjects"
    code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    level: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    parent_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)
    is_leaf: Mapped[bool] = mapped_column(Boolean, default=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    cash_flow_type: Mapped[str | None] = mapped_column(String(20))
    auxiliary_types: Mapped[dict | None] = mapped_column(JSONB)


class AccountingPeriod(TenantBase):
    __tablename__ = "accounting_periods"
    period: Mapped[str] = mapped_column(String(7), nullable=False, unique=True)
    start_date: Mapped[str] = mapped_column(Date, nullable=False)
    end_date: Mapped[str] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="open")
    closed_by: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    closed_at: Mapped[str | None] = mapped_column(String(30))


class VoucherLine(TenantBase):
    __tablename__ = "voucher_lines"
    voucher_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    line_no: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    account_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False)
    account_code: Mapped[str] = mapped_column(String(20), nullable=False)
    account_name: Mapped[str] = mapped_column(String(100), nullable=False)
    debit: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    credit: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    cost_center_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    cost_center_type: Mapped[str | None] = mapped_column(String(20))
    counterparty_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    counterparty_name: Mapped[str | None] = mapped_column(String(200))
    summary: Mapped[str | None] = mapped_column(String(500))


class FinanceVoucher(TenantBase):
    __tablename__ = "finance_vouchers"
    voucher_no: Mapped[str] = mapped_column(String(20), nullable=False)
    voucher_date: Mapped[str] = mapped_column(Date, nullable=False)
    period: Mapped[str] = mapped_column(String(7), nullable=False)
    voucher_type: Mapped[str] = mapped_column(String(20), default="general")
    total_debit: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    total_credit: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    line_count: Mapped[int] = mapped_column(SmallInteger, default=0)
    business_type: Mapped[str | None] = mapped_column(String(30))
    business_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    source_module: Mapped[str | None] = mapped_column(String(20))
    source_no: Mapped[str | None] = mapped_column(String(30))
    attachments: Mapped[dict | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    prepared_by: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    reviewed_by: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    posted_by: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    workflow_instance_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    remark: Mapped[str | None] = mapped_column(Text)


class ArApRecord(TenantBase):
    __tablename__ = "ar_ap_records"
    type: Mapped[str] = mapped_column(String(10), nullable=False)
    business_type: Mapped[str | None] = mapped_column(String(30))
    business_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    source_no: Mapped[str | None] = mapped_column(String(30))
    counterparty: Mapped[str | None] = mapped_column(String(200))
    counterparty_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    total_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    settled_amount: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    remaining_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    due_date: Mapped[str | None] = mapped_column(Date)
    overdue_days: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    voucher_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    contract_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    invoice_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    remark: Mapped[str | None] = mapped_column(Text)


class SettlementRecord(TenantBase):
    __tablename__ = "settlement_records"
    settlement_no: Mapped[str] = mapped_column(String(20), nullable=False)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)
    counterparty: Mapped[str | None] = mapped_column(String(200))
    counterparty_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    payment_method: Mapped[str | None] = mapped_column(String(20))
    bank_account: Mapped[str | None] = mapped_column(String(50))
    settlement_date: Mapped[str | None] = mapped_column(Date)
    arap_ids: Mapped[dict | None] = mapped_column(JSONB)
    bank_tx_ids: Mapped[dict | None] = mapped_column(JSONB)
    voucher_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    contract_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    invoice_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    remark: Mapped[str | None] = mapped_column(Text)


class Invoice(TenantBase):
    __tablename__ = "invoices"
    invoice_type: Mapped[str] = mapped_column(String(20), nullable=False)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)
    invoice_code: Mapped[str | None] = mapped_column(String(20))
    invoice_no: Mapped[str | None] = mapped_column(String(20))
    issue_date: Mapped[str | None] = mapped_column(Date)
    seller_name: Mapped[str | None] = mapped_column(String(200))
    buyer_name: Mapped[str | None] = mapped_column(String(200))
    amount_before_tax: Mapped[float | None] = mapped_column(Numeric(18, 2))
    tax_rate: Mapped[float | None] = mapped_column(Numeric(5, 2))
    tax_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    total_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    items: Mapped[dict | None] = mapped_column(JSONB)
    check_status: Mapped[str] = mapped_column(String(20), default="unchecked")
    contract_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    invoice_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    purchase_order_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    voucher_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    arap_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    attachments: Mapped[dict | None] = mapped_column(JSONB)


class TaxDeclaration(TenantBase):
    __tablename__ = "tax_declarations"
    tax_type: Mapped[str] = mapped_column(String(30), nullable=False)
    period: Mapped[str] = mapped_column(String(7), nullable=False)
    declaration_date: Mapped[str | None] = mapped_column(Date)
    taxable_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    tax_rate: Mapped[float | None] = mapped_column(Numeric(5, 2))
    tax_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    paid_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    payment_date: Mapped[str | None] = mapped_column(Date)
    voucher_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    remark: Mapped[str | None] = mapped_column(Text)


class Budget(TenantBase):
    __tablename__ = "budgets"
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    period_type: Mapped[str] = mapped_column(String(10), nullable=False)
    period: Mapped[str] = mapped_column(String(7), nullable=False)
    department_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    items: Mapped[dict | None] = mapped_column(JSONB)
    total_budget: Mapped[float | None] = mapped_column(Numeric(18, 2))
    total_used: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    total_committed: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    workflow_instance_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    source: Mapped[str] = mapped_column(String(20), default="manual")


class CostCenter(TenantBase):
    __tablename__ = "cost_centers"
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    center_type: Mapped[str] = mapped_column(String(20), nullable=False)
    ref_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    parent_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    status: Mapped[int] = mapped_column(SmallInteger, default=1)
