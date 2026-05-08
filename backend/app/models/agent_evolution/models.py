"""Agent自进化系统 — 数据库模型

11张新表，全部使用evo_前缀避免与现有表冲突。
所有模型继承TenantBase，遵循现有多租户模式。"""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base.model_base import TenantBase


# ─── Agent元数据 ───

class EvoAgent(TenantBase):
    """Agent注册表 — 存储agent的元数据、能力、配置"""
    __tablename__ = "evo_agents"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    capabilities: Mapped[dict | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active/disabled/evolving
    version: Mapped[int] = mapped_column(Integer, default=1)
    system_prompt: Mapped[str | None] = mapped_column(Text)
    tools: Mapped[dict | None] = mapped_column(JSONB)
    input_schema: Mapped[dict | None] = mapped_column(JSONB)
    output_schema: Mapped[dict | None] = mapped_column(JSONB)
    config: Mapped[dict | None] = mapped_column(JSONB)
    quality_score: Mapped[float | None] = mapped_column(Float)
    execution_count: Mapped[int] = mapped_column(Integer, default=0)
    success_count: Mapped[int] = mapped_column(Integer, default=0)


# ─── Agent执行日志 ───

class EvoExecution(TenantBase):
    """Agent执行记录 — 每次执行的输入/输出/质量/耗时"""
    __tablename__ = "evo_executions"

    agent_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    workflow_instance_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    task_type: Mapped[str | None] = mapped_column(String(50))
    input_data: Mapped[dict | None] = mapped_column(JSONB)
    output_data: Mapped[dict | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(20), default="running")  # running/completed/failed
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    token_count: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)
    quality_score: Mapped[float | None] = mapped_column(Float)
    quality_details: Mapped[dict | None] = mapped_column(JSONB)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ─── Hook系统 ───

class EvoHook(TenantBase):
    """Hook配置 — 定义agent生命周期的钩子"""
    __tablename__ = "evo_hooks"

    agent_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)  # null=全局hook
    hook_type: Mapped[str] = mapped_column(String(30), nullable=False)  # pre_execute/post_execute/on_error/on_evolve
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    handler_type: Mapped[str] = mapped_column(String(30), default="builtin")  # builtin/llm/script
    handler_config: Mapped[dict | None] = mapped_column(JSONB)
    priority: Mapped[int] = mapped_column(Integer, default=100)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class EvoHookLog(TenantBase):
    """Hook执行日志 — 记录每次hook的执行结果"""
    __tablename__ = "evo_hook_logs"

    hook_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    execution_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    agent_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    hook_type: Mapped[str] = mapped_column(String(30))
    result: Mapped[str] = mapped_column(String(20))  # success/blocked/error
    message: Mapped[str | None] = mapped_column(Text)
    modified_input: Mapped[dict | None] = mapped_column(JSONB)
    modified_output: Mapped[dict | None] = mapped_column(JSONB)
    duration_ms: Mapped[int | None] = mapped_column(Integer)


# ─── Agent持久记忆 ───

class EvoMemory(TenantBase):
    """Agent持久记忆 — 跨会话的执行经验和知识"""
    __tablename__ = "evo_memories"

    agent_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    memory_type: Mapped[str] = mapped_column(String(20), nullable=False)  # episodic/semantic/procedural
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_embedding: Mapped[list | None] = mapped_column(ARRAY(Float))  # 向量检索用
    source_execution_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    tags: Mapped[list | None] = mapped_column(ARRAY(String))
    score: Mapped[float] = mapped_column(Float, default=0.5)
    access_count: Mapped[int] = mapped_column(Integer, default=0)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ─── 用户反馈 ───

class EvoFeedback(TenantBase):
    """用户反馈 — 对agent执行结果的满意度"""
    __tablename__ = "evo_feedback"

    execution_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    agent_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    rating: Mapped[str] = mapped_column(String(10), nullable=False)  # positive/negative
    comment: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False)


# ─── 工作流模板 ───

class EvoWorkflowTemplate(TenantBase):
    """工作流模板 — DAG图定义"""
    __tablename__ = "evo_workflow_templates"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    graph_config: Mapped[dict | None] = mapped_column(JSONB)  # {nodes: [...], edges: [...]}
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft/active/archived
    version: Mapped[int] = mapped_column(Integer, default=1)
    fitness_score: Mapped[float | None] = mapped_column(Float)
    category: Mapped[str | None] = mapped_column(String(50))


# ─── 工作流执行实例 ───

class EvoWorkflowInstance(TenantBase):
    """工作流运行实例"""
    __tablename__ = "evo_workflow_instances"

    template_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    input_data: Mapped[dict | None] = mapped_column(JSONB)
    output_data: Mapped[dict | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/running/completed/failed
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)


# ─── 工作流节点执行 ───

class EvoNodeExecution(TenantBase):
    """工作流中单个节点的执行记录"""
    __tablename__ = "evo_node_executions"

    workflow_instance_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    node_id: Mapped[str] = mapped_column(String(100), nullable=False)
    agent_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    input_data: Mapped[dict | None] = mapped_column(JSONB)
    output_data: Mapped[dict | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/running/completed/failed/skipped
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ─── 进化历史 ───

class EvoHistory(TenantBase):
    """进化历史 — 记录每次进化的变更和评估结果"""
    __tablename__ = "evo_history"

    agent_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    workflow_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    level: Mapped[int] = mapped_column(Integer, nullable=False)  # 1=Skill描述 2=Tool描述 3=System Prompt 4=Code
    evolution_type: Mapped[str] = mapped_column(String(30))  # prompt_mutate/workflow_restructure/param_tune
    old_content: Mapped[str | None] = mapped_column(Text)
    new_content: Mapped[str | None] = mapped_column(Text)
    diff_summary: Mapped[str | None] = mapped_column(Text)
    score_before: Mapped[float | None] = mapped_column(Float)
    score_after: Mapped[float | None] = mapped_column(Float)
    metrics: Mapped[dict | None] = mapped_column(JSONB)
    eval_dataset_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/approved/rejected/rolled_back
    approved_by: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deployed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rolled_back_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ─── 评估数据集 ───

class EvoGuardrailRule(TenantBase):
    """Guardrails校验规则 — 定义输入/输出的校验策略"""
    __tablename__ = "evo_guardrail_rules"

    agent_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)  # null=全局规则
    phase: Mapped[str] = mapped_column(String(20), nullable=False)  # input/output
    rule_name: Mapped[str] = mapped_column(String(50), nullable=False)
    config: Mapped[dict | None] = mapped_column(JSONB)
    severity: Mapped[str] = mapped_column(String(10), default="block")  # block/warn
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class EvoEvalDataset(TenantBase):
    """评估数据集 — 用于评估agent/工作流质量的测试用例集"""
    __tablename__ = "evo_eval_datasets"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    target_type: Mapped[str] = mapped_column(String(30))  # agent/workflow
    target_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    cases: Mapped[list] = mapped_column(JSONB, nullable=False)  # [{input, expected_behavior, rubric}]
    source: Mapped[str] = mapped_column(String(20), default="synthetic")  # real/synthetic/manual
    split: Mapped[dict | None] = mapped_column(JSONB)  # {train: [...idx], val: [...idx], holdout: [...idx]}
    version: Mapped[int] = mapped_column(Integer, default=1)
    case_count: Mapped[int] = mapped_column(Integer, default=0)
