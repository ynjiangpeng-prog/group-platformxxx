from datetime import datetime

from sqlalchemy import Boolean, Date, DateTime, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TenantBase


class PettyCashPool(TenantBase):
    __tablename__ = "petty_cash_pools"

    employee_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    total_received: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    total_used: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    balance: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    status: Mapped[str] = mapped_column(String(20), default="active")


class PettyCashFund(TenantBase):
    __tablename__ = "petty_cash_funds"

    fund_no: Mapped[str] = mapped_column(String(30), unique=True)
    pool_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    employee_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    used_amount: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    remaining_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    purpose: Mapped[str] = mapped_column(Text)
    issue_date: Mapped[str] = mapped_column(Date, nullable=False)
    expected_return_date: Mapped[str] = mapped_column(Date)
    actual_return_date: Mapped[str | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="active")
    approved_by: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    payment_method: Mapped[str | None] = mapped_column(String(30))
    payment_entity_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    remark: Mapped[str | None] = mapped_column(Text)


class PettyCashExpense(TenantBase):
    __tablename__ = "petty_cash_expenses"

    pool_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    fund_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    expense_date: Mapped[str] = mapped_column(Date, nullable=False)
    category: Mapped[str] = mapped_column(String(50))
    amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    invoice_count: Mapped[int] = mapped_column(Integer, default=0)
    invoice_total: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    finance_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    finance_approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    admin_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    admin_approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finance_comment: Mapped[str | None] = mapped_column(Text)
    admin_comment: Mapped[str | None] = mapped_column(Text)
    reject_reason: Mapped[str | None] = mapped_column(Text)
    remark: Mapped[str | None] = mapped_column(Text)
    attachments: Mapped[list | None] = mapped_column(JSONB)
    invoice_files: Mapped[list | None] = mapped_column(JSONB)


class PettyCashInvoice(TenantBase):
    __tablename__ = "petty_cash_invoices"

    expense_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    fund_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    invoice_type: Mapped[str] = mapped_column(String(30))
    invoice_no: Mapped[str | None] = mapped_column(String(50))
    invoice_date: Mapped[str | None] = mapped_column(Date)
    seller_name: Mapped[str | None] = mapped_column(String(200))
    amount_without_tax: Mapped[float | None] = mapped_column(Numeric(18, 2))
    tax_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    total_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    file_url: Mapped[str | None] = mapped_column(String(500))
    ocr_result: Mapped[dict | None] = mapped_column(JSONB)
    ocr_raw: Mapped[dict | None] = mapped_column(JSONB)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    remark: Mapped[str | None] = mapped_column(Text)
