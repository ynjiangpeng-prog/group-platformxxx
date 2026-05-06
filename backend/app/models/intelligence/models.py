from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TenantBase


class BusinessKnowledge(TenantBase):
    __tablename__ = "business_knowledge"
    __table_args__ = (
        Index("ix_bk_category_active", "company_id", "category", "is_active"),
    )

    category: Mapped[str] = mapped_column(String(30), nullable=False)
    key: Mapped[str] = mapped_column(String(200), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    source: Mapped[str] = mapped_column(String(30), default="manual")
    source_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    verified_by: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    usage_count: Mapped[int] = mapped_column(default=0)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AiFeedback(TenantBase):
    __tablename__ = "ai_feedback"
    __table_args__ = (
        Index("ix_af_module_type", "company_id", "module", "feedback_type"),
    )

    user_id: Mapped[str] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    module: Mapped[str] = mapped_column(String(30), nullable=False)
    feedback_type: Mapped[str] = mapped_column(String(30), nullable=False)
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    suggested_value: Mapped[str | None] = mapped_column(Text)
    actual_value: Mapped[str | None] = mapped_column(Text)
    entity_type: Mapped[str | None] = mapped_column(String(50))
    entity_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    confidence: Mapped[float | None] = mapped_column(Float)
    context_snapshot: Mapped[str | None] = mapped_column(Text)
    user_comment: Mapped[str | None] = mapped_column(Text)


class IntelligenceAlert(TenantBase):
    __tablename__ = "intelligence_alerts"
    __table_args__ = (
        Index("ix_ia_status", "company_id", "status", "severity"),
    )

    rule_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    alert_type: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False, default="warning")
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    suggestion: Mapped[str | None] = mapped_column(Text)
    entity_type: Mapped[str | None] = mapped_column(String(50))
    entity_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    module_a: Mapped[str | None] = mapped_column(String(30))
    module_b: Mapped[str | None] = mapped_column(String(30))
    data_snapshot: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="active")
    resolved_by: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution_note: Mapped[str | None] = mapped_column(Text)
    feedback_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
