"""业务数字孪生 — 新增biz_表

创建biz_events, biz_entities, biz_relations, biz_metrics四张表。
Revision ID: 003_business_twin
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID

revision = "003_business_twin"
down_revision = "002_fusion_upgrade"
branch_labels = None
depends_on = None


def upgrade():
    # ─── biz_events ───
    op.create_table(
        "biz_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("updated_by", UUID(as_uuid=True), nullable=True),
        sa.Column("is_deleted", sa.Boolean, default=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("event_type", sa.String(50), nullable=False, index=True),
        sa.Column("source_module", sa.String(30), nullable=False, index=True),
        sa.Column("source_id", sa.String(100), nullable=True),
        sa.Column("event_data", JSONB, nullable=True),
        sa.Column("event_date", sa.DateTime(timezone=True), nullable=True, index=True),
        sa.Column("amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("entity_ids", ARRAY(sa.String), nullable=True),
    )

    # ─── biz_entities ───
    op.create_table(
        "biz_entities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("updated_by", UUID(as_uuid=True), nullable=True),
        sa.Column("is_deleted", sa.Boolean, default=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("entity_type", sa.String(30), nullable=False, index=True),
        sa.Column("entity_name", sa.String(200), nullable=False),
        sa.Column("source_id", sa.String(100), nullable=True, index=True),
        sa.Column("properties", JSONB, nullable=True),
        sa.Column("status", sa.String(20), default="active"),
        sa.Column("tags", ARRAY(sa.String), nullable=True),
    )

    # ─── biz_relations ───
    op.create_table(
        "biz_relations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("updated_by", UUID(as_uuid=True), nullable=True),
        sa.Column("is_deleted", sa.Boolean, default=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("source_entity_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("target_entity_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("relation_type", sa.String(50), nullable=False, index=True),
        sa.Column("properties", JSONB, nullable=True),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("valid_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confidence", sa.Float, default=1.0),
    )

    # ─── biz_metrics ───
    op.create_table(
        "biz_metrics",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("updated_by", UUID(as_uuid=True), nullable=True),
        sa.Column("is_deleted", sa.Boolean, default=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("metric_type", sa.String(50), nullable=False, index=True),
        sa.Column("period", sa.String(20), nullable=False, index=True),
        sa.Column("period_type", sa.String(20), nullable=False),
        sa.Column("value", sa.Numeric(18, 2), nullable=False),
        sa.Column("dimensions", JSONB, nullable=True),
    )


def downgrade():
    op.drop_table("biz_metrics")
    op.drop_table("biz_relations")
    op.drop_table("biz_entities")
    op.drop_table("biz_events")
