"""Agent自进化系统 — 数据库迁移

创建11张evo_前缀表，支持downgrade回滚。
Revision ID: 001_agent_evolution
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID, ARRAY

revision = "001_agent_evolution"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # ─── Agent注册表 ───
    op.create_table(
        "evo_agents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("created_by", UUID(as_uuid=True)),
        sa.Column("updated_by", UUID(as_uuid=True)),
        sa.Column("is_deleted", sa.Boolean, default=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("capabilities", JSONB),
        sa.Column("status", sa.String(20), default="active"),
        sa.Column("version", sa.Integer, default=1),
        sa.Column("system_prompt", sa.Text),
        sa.Column("tools", JSONB),
        sa.Column("input_schema", JSONB),
        sa.Column("output_schema", JSONB),
        sa.Column("config", JSONB),
        sa.Column("quality_score", sa.Float),
        sa.Column("execution_count", sa.Integer, default=0),
        sa.Column("success_count", sa.Integer, default=0),
    )

    # ─── Agent执行记录 ───
    op.create_table(
        "evo_executions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("created_by", UUID(as_uuid=True)),
        sa.Column("updated_by", UUID(as_uuid=True)),
        sa.Column("is_deleted", sa.Boolean, default=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("agent_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("workflow_instance_id", UUID(as_uuid=True), index=True),
        sa.Column("task_type", sa.String(50)),
        sa.Column("input_data", JSONB),
        sa.Column("output_data", JSONB),
        sa.Column("status", sa.String(20), default="running"),
        sa.Column("duration_ms", sa.Integer),
        sa.Column("token_count", sa.Integer),
        sa.Column("error_message", sa.Text),
        sa.Column("quality_score", sa.Float),
        sa.Column("quality_details", JSONB),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
    )

    # ─── Hook配置 ───
    op.create_table(
        "evo_hooks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("created_by", UUID(as_uuid=True)),
        sa.Column("updated_by", UUID(as_uuid=True)),
        sa.Column("is_deleted", sa.Boolean, default=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("agent_id", UUID(as_uuid=True), index=True),
        sa.Column("hook_type", sa.String(30), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("handler_type", sa.String(30), default="builtin"),
        sa.Column("handler_config", JSONB),
        sa.Column("priority", sa.Integer, default=100),
        sa.Column("enabled", sa.Boolean, default=True),
    )

    # ─── Hook执行日志 ───
    op.create_table(
        "evo_hook_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("created_by", UUID(as_uuid=True)),
        sa.Column("updated_by", UUID(as_uuid=True)),
        sa.Column("is_deleted", sa.Boolean, default=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("hook_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("execution_id", UUID(as_uuid=True), index=True),
        sa.Column("agent_id", UUID(as_uuid=True), index=True),
        sa.Column("hook_type", sa.String(30)),
        sa.Column("result", sa.String(20)),
        sa.Column("message", sa.Text),
        sa.Column("modified_input", JSONB),
        sa.Column("modified_output", JSONB),
        sa.Column("duration_ms", sa.Integer),
    )

    # ─── Agent持久记忆 ───
    op.create_table(
        "evo_memories",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("created_by", UUID(as_uuid=True)),
        sa.Column("updated_by", UUID(as_uuid=True)),
        sa.Column("is_deleted", sa.Boolean, default=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("agent_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("memory_type", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("content_embedding", ARRAY(sa.Float)),
        sa.Column("source_execution_id", UUID(as_uuid=True)),
        sa.Column("tags", ARRAY(sa.String)),
        sa.Column("score", sa.Float, default=0.5),
        sa.Column("access_count", sa.Integer, default=0),
        sa.Column("last_used_at", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
    )

    # ─── 用户反馈 ───
    op.create_table(
        "evo_feedback",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("created_by", UUID(as_uuid=True)),
        sa.Column("updated_by", UUID(as_uuid=True)),
        sa.Column("is_deleted", sa.Boolean, default=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("execution_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("agent_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("rating", sa.String(10), nullable=False),
        sa.Column("comment", sa.Text),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
    )

    # ─── 工作流模板 ───
    op.create_table(
        "evo_workflow_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("created_by", UUID(as_uuid=True)),
        sa.Column("updated_by", UUID(as_uuid=True)),
        sa.Column("is_deleted", sa.Boolean, default=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("graph_config", JSONB),
        sa.Column("status", sa.String(20), default="draft"),
        sa.Column("version", sa.Integer, default=1),
        sa.Column("fitness_score", sa.Float),
        sa.Column("category", sa.String(50)),
    )

    # ─── 工作流实例 ───
    op.create_table(
        "evo_workflow_instances",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("created_by", UUID(as_uuid=True)),
        sa.Column("updated_by", UUID(as_uuid=True)),
        sa.Column("is_deleted", sa.Boolean, default=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("template_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("input_data", JSONB),
        sa.Column("output_data", JSONB),
        sa.Column("status", sa.String(20), default="pending"),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("duration_ms", sa.Integer),
        sa.Column("error_message", sa.Text),
    )

    # ─── 工作流节点执行 ───
    op.create_table(
        "evo_node_executions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("created_by", UUID(as_uuid=True)),
        sa.Column("updated_by", UUID(as_uuid=True)),
        sa.Column("is_deleted", sa.Boolean, default=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("workflow_instance_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("node_id", sa.String(100), nullable=False),
        sa.Column("agent_id", UUID(as_uuid=True), index=True),
        sa.Column("input_data", JSONB),
        sa.Column("output_data", JSONB),
        sa.Column("status", sa.String(20), default="pending"),
        sa.Column("duration_ms", sa.Integer),
        sa.Column("error_message", sa.Text),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
    )

    # ─── 进化历史 ───
    op.create_table(
        "evo_history",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("created_by", UUID(as_uuid=True)),
        sa.Column("updated_by", UUID(as_uuid=True)),
        sa.Column("is_deleted", sa.Boolean, default=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("agent_id", UUID(as_uuid=True), index=True),
        sa.Column("workflow_id", UUID(as_uuid=True), index=True),
        sa.Column("level", sa.Integer, nullable=False),
        sa.Column("evolution_type", sa.String(30)),
        sa.Column("old_content", sa.Text),
        sa.Column("new_content", sa.Text),
        sa.Column("diff_summary", sa.Text),
        sa.Column("score_before", sa.Float),
        sa.Column("score_after", sa.Float),
        sa.Column("metrics", JSONB),
        sa.Column("eval_dataset_id", UUID(as_uuid=True)),
        sa.Column("status", sa.String(20), default="pending"),
        sa.Column("approved_by", UUID(as_uuid=True)),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
        sa.Column("deployed_at", sa.DateTime(timezone=True)),
        sa.Column("rolled_back_at", sa.DateTime(timezone=True)),
    )

    # ─── 评估数据集 ───
    op.create_table(
        "evo_eval_datasets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("created_by", UUID(as_uuid=True)),
        sa.Column("updated_by", UUID(as_uuid=True)),
        sa.Column("is_deleted", sa.Boolean, default=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("target_type", sa.String(30)),
        sa.Column("target_id", UUID(as_uuid=True)),
        sa.Column("cases", JSONB, nullable=False),
        sa.Column("source", sa.String(20), default="synthetic"),
        sa.Column("split", JSONB),
        sa.Column("version", sa.Integer, default=1),
        sa.Column("case_count", sa.Integer, default=0),
    )


def downgrade():
    # 按依赖关系反序删除
    op.drop_table("evo_eval_datasets")
    op.drop_table("evo_history")
    op.drop_table("evo_node_executions")
    op.drop_table("evo_workflow_instances")
    op.drop_table("evo_workflow_templates")
    op.drop_table("evo_feedback")
    op.drop_table("evo_memories")
    op.drop_table("evo_hook_logs")
    op.drop_table("evo_hooks")
    op.drop_table("evo_executions")
    op.drop_table("evo_agents")
