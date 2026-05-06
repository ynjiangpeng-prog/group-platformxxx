from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TenantBase


class ProjectTypeTemplate(TenantBase):
    __tablename__ = "project_type_templates"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    closure_type: Mapped[str | None] = mapped_column(String(30))
    stages: Mapped[dict | None] = mapped_column(JSONB)


class ProjectStage(TenantBase):
    __tablename__ = "project_stages"

    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    template_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False)
    stage_code: Mapped[str] = mapped_column(String(50), nullable=False)
    stage_name: Mapped[str] = mapped_column(String(100), nullable=False)
    stage_order: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    started_at: Mapped[str | None] = mapped_column(String(30))
    completed_at: Mapped[str | None] = mapped_column(String(30))
    actual_data: Mapped[dict | None] = mapped_column(JSONB)
    auto_actions_result: Mapped[dict | None] = mapped_column(JSONB)
    required_docs: Mapped[dict | None] = mapped_column(JSONB)
    approval_required: Mapped[bool] = mapped_column(Boolean, default=False)


class StageTransition(TenantBase):
    __tablename__ = "stage_transitions"

    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    from_stage: Mapped[str | None] = mapped_column(String(50))
    to_stage: Mapped[str] = mapped_column(String(50), nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    operator_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    remark: Mapped[str | None] = mapped_column(Text)
    trigger_type: Mapped[str] = mapped_column(String(20), default="manual")
    auto_result: Mapped[dict | None] = mapped_column(JSONB)


class StageDocument(TenantBase):
    __tablename__ = "stage_documents"

    project_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    stage_code: Mapped[str] = mapped_column(String(50), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_name: Mapped[str] = mapped_column(String(200), nullable=False)
    file_url: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size: Mapped[int | None] = mapped_column(Integer)
    mime_type: Mapped[str | None] = mapped_column(String(100))
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB)
