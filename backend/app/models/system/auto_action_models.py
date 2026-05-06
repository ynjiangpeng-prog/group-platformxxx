"""自动执行记录模型。"""
from datetime import datetime
from uuid import uuid4
from sqlalchemy import String, Text, DateTime, JSON, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AutoActionRecord(Base):
    """自动执行动作记录。"""
    __tablename__ = "auto_action_records"
    
    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    action_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    company_id: Mapped[str] = mapped_column(String(36), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(50))
    priority: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(30))
    action_type: Mapped[str] = mapped_column(String(50))
    action_params: Mapped[dict] = mapped_column(JSON, default=dict)
    target_type: Mapped[str] = mapped_column(String(50))
    target_id: Mapped[str] = mapped_column(String(36))
    target_name: Mapped[str] = mapped_column(String(200))
    trigger_reason: Mapped[str] = mapped_column(Text)
    ai_analysis: Mapped[str] = mapped_column(Text)
    expected_result: Mapped[str] = mapped_column(Text)
    risk_level: Mapped[str] = mapped_column(String(20), default="low")
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    executed_at: Mapped[datetime] = mapped_column(DateTime)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime)
    executed_by: Mapped[str] = mapped_column(String(36), default="system")
    result_data: Mapped[dict] = mapped_column(JSON, default=dict)
    error_message: Mapped[str] = mapped_column(Text)
