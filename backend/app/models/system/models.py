from sqlalchemy import DateTime, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class OperationLog(Base):
    __tablename__ = "operation_logs"
    __table_args__ = (Index("ix_oplog_company_module", "company_id", "module"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True)
    company_id: Mapped[str] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    user_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    username: Mapped[str | None] = mapped_column(String(50))
    module: Mapped[str | None] = mapped_column(String(30))
    action: Mapped[str | None] = mapped_column(String(20))
    target_type: Mapped[str | None] = mapped_column(String(50))
    target_id: Mapped[str | None] = mapped_column(String(100))
    detail: Mapped[str | None] = mapped_column(Text)
    ip: Mapped[str | None] = mapped_column(String(50))
    created_at = mapped_column(DateTime(timezone=True), server_default=__import__("sqlalchemy").func.now())


class SystemConfigKV(Base):
    __tablename__ = "system_config"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=__import__("uuid").uuid4)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    value: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(30), default="general")
