from sqlalchemy import SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TenantBase


class WorkflowTemplate(TenantBase):
    __tablename__ = "workflow_templates"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    business_type: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(SmallInteger, default=1)
    status: Mapped[int] = mapped_column(SmallInteger, default=1)
    node_config: Mapped[dict | None] = mapped_column(JSONB)


class WorkflowInstance(TenantBase):
    __tablename__ = "workflow_instances"

    template_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    business_type: Mapped[str] = mapped_column(String(50), nullable=False)
    business_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    initiator_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False)
    current_step: Mapped[int] = mapped_column(SmallInteger, default=0)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    urgency: Mapped[int] = mapped_column(SmallInteger, default=1)
    form_data: Mapped[dict | None] = mapped_column(JSONB)


class ApprovalRecord(TenantBase):
    __tablename__ = "approval_records"

    instance_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    step: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    approver_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    attachments: Mapped[dict | None] = mapped_column(JSONB)
