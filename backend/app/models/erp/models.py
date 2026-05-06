from sqlalchemy import Boolean, Date, Numeric, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TenantBase


class Supplier(TenantBase):
    __tablename__ = "suppliers"
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    contact_person: Mapped[str | None] = mapped_column(String(50))
    contact_phone: Mapped[str | None] = mapped_column(String(20))
    unified_credit_code: Mapped[str | None] = mapped_column(String(18))
    bank_name: Mapped[str | None] = mapped_column(String(100))
    bank_account: Mapped[str | None] = mapped_column(String(50))
    rating: Mapped[int] = mapped_column(SmallInteger, default=3)
    status: Mapped[int] = mapped_column(SmallInteger, default=1)
    remark: Mapped[str | None] = mapped_column(Text)


class Customer(TenantBase):
    __tablename__ = "customers"
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    category: Mapped[str | None] = mapped_column(String(30))
    contact_person: Mapped[str | None] = mapped_column(String(50))
    contact_phone: Mapped[str | None] = mapped_column(String(20))
    unified_credit_code: Mapped[str | None] = mapped_column(String(18))
    bank_name: Mapped[str | None] = mapped_column(String(100))
    bank_account: Mapped[str | None] = mapped_column(String(50))
    rating: Mapped[int] = mapped_column(SmallInteger, default=3)
    status: Mapped[int] = mapped_column(SmallInteger, default=1)
    remark: Mapped[str | None] = mapped_column(Text)


class ProcurementRequest(TenantBase):
    __tablename__ = "procurement_requests"
    pr_no: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    budget_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    budget_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    items: Mapped[dict | None] = mapped_column(JSONB)
    total_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    urgency: Mapped[str] = mapped_column(String(10), default="normal")
    expected_date: Mapped[str | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    workflow_instance_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    remark: Mapped[str | None] = mapped_column(Text)


class PurchaseOrder(TenantBase):
    __tablename__ = "purchase_orders"
    po_no: Mapped[str] = mapped_column(String(20), nullable=False)
    pr_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    supplier_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    contract_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    items: Mapped[dict | None] = mapped_column(JSONB)
    total_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    received_amount: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    invoiced_amount: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    delivery_date: Mapped[str | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    workflow_instance_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))


class GoodsReceipt(TenantBase):
    __tablename__ = "goods_receipts"
    gr_no: Mapped[str] = mapped_column(String(20), nullable=False)
    po_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False)
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    items: Mapped[dict | None] = mapped_column(JSONB)
    total_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    received_date: Mapped[str | None] = mapped_column(Date)
    receiver_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    quality_status: Mapped[str] = mapped_column(String(20), default="pending")
    status: Mapped[str] = mapped_column(String(20), default="draft")
    remark: Mapped[str | None] = mapped_column(Text)


class Contract(TenantBase):
    __tablename__ = "contracts"
    contract_no: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    contract_type: Mapped[str] = mapped_column(String(30), nullable=False)
    party_a: Mapped[str | None] = mapped_column(String(200))
    party_b: Mapped[str | None] = mapped_column(String(200))
    supplier_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    signing_date: Mapped[str | None] = mapped_column(Date)
    start_date: Mapped[str | None] = mapped_column(Date)
    end_date: Mapped[str | None] = mapped_column(Date)
    total_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    paid_amount: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    invoiced_amount: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    payment_terms: Mapped[dict | None] = mapped_column(JSONB)
    key_clauses: Mapped[dict | None] = mapped_column(JSONB)
    remark: Mapped[str | None] = mapped_column(String(500))
    po_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    attachments: Mapped[list | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    workflow_instance_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    entity_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    settlement_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    settlement_date: Mapped[str | None] = mapped_column(Date)
    settlement_confirmed_by: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    warranty_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    warranty_rate: Mapped[float | None] = mapped_column(Numeric(5, 2))
    warranty_due_date: Mapped[str | None] = mapped_column(Date)
    warranty_status: Mapped[str | None] = mapped_column(String(20), default="none")
    direction: Mapped[str | None] = mapped_column(String(10), default="out")
    counterparty: Mapped[str | None] = mapped_column(String(200))
    drawings: Mapped[list | None] = mapped_column(JSONB)
