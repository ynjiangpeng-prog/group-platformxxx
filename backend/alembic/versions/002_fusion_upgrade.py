"""Fusion升级 — Phase 0: Guardrails规则表 + Phase 1: pgvector扩展

创建evo_guardrail_rules表，启用pgvector扩展，为evo_memories添加embedding列。
Revision ID: 002_fusion_upgrade
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "002_fusion_upgrade"
down_revision = "001_agent_evolution"
branch_labels = None
depends_on = None


def upgrade():
    # ─── Phase 1: pgvector扩展 ───
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # 为evo_memories添加embedding列（1536维，OpenAI标准）
    op.execute(
        "ALTER TABLE evo_memories "
        "ADD COLUMN IF NOT EXISTS content_vector vector(1536)"
    )

    # ivfflat索引（向量检索加速）
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_evo_memories_vector "
        "ON evo_memories USING ivfflat (content_vector vector_cosine_ops) "
        "WITH (lists = 100)"
    )

    # ─── Phase 0: Guardrails规则表 ───
    op.create_table(
        "evo_guardrail_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("created_by", UUID(as_uuid=True)),
        sa.Column("updated_by", UUID(as_uuid=True)),
        sa.Column("is_deleted", sa.Boolean, default=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("agent_id", UUID(as_uuid=True), index=True),
        sa.Column("phase", sa.String(20), nullable=False),
        sa.Column("rule_name", sa.String(50), nullable=False),
        sa.Column("config", JSONB),
        sa.Column("severity", sa.String(10), default="block"),
        sa.Column("enabled", sa.Boolean, default=True),
    )


def downgrade():
    op.drop_table("evo_guardrail_rules")
    op.execute("DROP INDEX IF EXISTS idx_evo_memories_vector")
    op.execute("ALTER TABLE evo_memories DROP COLUMN IF EXISTS content_vector")
    # 不卸载pgvector扩展（可能被其他功能使用）
