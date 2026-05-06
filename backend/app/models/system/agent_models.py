from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TenantBase


class AgentSkill(TenantBase):
    __tablename__ = "agent_skills"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    trigger_type: Mapped[str] = mapped_column(String(20), default="manual")
    trigger_config: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    steps: Mapped[dict | None] = mapped_column(JSONB, default=list)
    parameters: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    success_count: Mapped[int] = mapped_column(Integer, default=0)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_from: Mapped[str] = mapped_column(String(20), default="manual")
    is_template: Mapped[bool] = mapped_column(Boolean, default=False)
    icon: Mapped[str | None] = mapped_column(String(50))
    category: Mapped[str | None] = mapped_column(String(50))


class AgentTask(TenantBase):
    __tablename__ = "agent_tasks"

    parent_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    skill_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    task_type: Mapped[str] = mapped_column(String(30), default="skill")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    title: Mapped[str | None] = mapped_column(String(300))
    input: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    output: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    error_message: Mapped[str | None] = mapped_column(Text)
    agent_model: Mapped[str | None] = mapped_column(String(50))
    progress: Mapped[int] = mapped_column(Integer, default=0)
    depends_on: Mapped[list | None] = mapped_column(ARRAY(UUID(as_uuid=True)), default=list)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    token_usage: Mapped[int] = mapped_column(Integer, default=0)


class AgentMemory(TenantBase):
    __tablename__ = "agent_memories"

    user_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    key: Mapped[str] = mapped_column(String(200), nullable=False)
    value: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    access_count: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(20), default="user_explicit")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AgentUserProfile(TenantBase):
    __tablename__ = "agent_user_profiles"

    user_id: Mapped[str] = mapped_column(UUID(as_uuid=True), unique=True, nullable=False)
    role_model: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    common_actions: Mapped[dict | None] = mapped_column(JSONB, default=list)
    preferred_views: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    work_schedule: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    last_active_context: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    preferences: Mapped[dict | None] = mapped_column(JSONB, default=dict)
