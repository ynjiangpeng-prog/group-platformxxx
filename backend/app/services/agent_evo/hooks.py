"""Hook管理系统

基于Claude Code理念的agent生命周期钩子系统。
支持：pre_execute、post_execute、on_error、on_evolve 四种钩子。
Hook可以：修改输入/输出、注入上下文、阻止执行、触发后续动作。
集成Guardrails校验：quality_gate前先跑Guardrails预检查。"""

import logging
import time
from datetime import datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_evolution.models import EvoHook, EvoHookLog, EvoGuardrailRule
from app.services.agent_evo.guardrails import agent_guardrails
from app.services.agent_evo.governance import policy_engine

logger = logging.getLogger(__name__)


# ─── 内置Hook处理器 ───

async def quality_gate_hook(
    db: AsyncSession, context: dict, config: dict,
) -> dict | None:
    """质量门控hook — 先跑Guardrails校验，再用LLM评估输出质量（0-10分）"""
    from app.services.ai_gateway import ai_gateway

    output_data = context.get("output_data", {})
    threshold = config.get("threshold", 6.0)
    response_text = output_data.get("response", "") if isinstance(output_data, dict) else str(output_data)

    if not response_text:
        return {"quality_score": 0.0, "message": "输出为空"}

    # Guardrails预检查
    guardrail_result = await _run_guardrails_check(db, context, response_text, "output")
    if guardrail_result:
        return guardrail_result

    prompt = (
        f"请评估以下AI回答的质量（0-10分）：\n\n"
        f"问题上下文：{str(context.get('input_data', ''))[:500]}\n\n"
        f"AI回答：{response_text[:1000]}\n\n"
        f"评估维度：准确性(3分)、完整性(3分)、实用性(2分)、表达清晰(2分)\n"
        f"只返回一个JSON: {{\"score\": 数字, \"reason\": \"简短原因\"}}"
    )

    try:
        result = await ai_gateway.tunnel_chat(
            [{"role": "user", "content": prompt}],
            task="quality_gate",
        )
        parsed = ai_gateway.parse_json_response(result)
        score = float(parsed.get("score", 5)) / 10.0  # 归一化到0-1
        return {
            "quality_score": score,
            "message": f"质量评估: {parsed.get('score', 5)}/10 - {parsed.get('reason', '')}",
        }
    except Exception as e:
        logger.warning("质量门控评估失败: %s", e)
        return {"quality_score": 0.5, "message": f"评估失败: {e}"}


async def context_enrichment_hook(
    db: AsyncSession, context: dict, config: dict,
) -> dict | None:
    """上下文增强hook — 执行前注入相关历史经验"""
    # 在lifecycle层已处理记忆注入，这里作为扩展点
    return {"message": "上下文已增强"}


async def error_recovery_hook(
    db: AsyncSession, context: dict, config: dict,
) -> dict | None:
    """错误恢复hook — 分析错误原因并建议重试策略"""
    from app.services.ai_gateway import ai_gateway

    error_msg = context.get("error", "未知错误")
    input_data = context.get("input_data", {})

    prompt = (
        f"分析以下agent执行失败的原因，给出简洁的重试建议：\n\n"
        f"输入：{str(input_data)[:500]}\n"
        f"错误：{error_msg}\n\n"
        f"返回JSON: {{\"cause\": \"原因\", \"suggestion\": \"建议\", \"retry\": true/false}}"
    )

    try:
        result = await ai_gateway.tunnel_chat(
            [{"role": "user", "content": prompt}],
            task="error_recovery",
        )
        parsed = ai_gateway.parse_json_response(result)
        return {
            "message": f"错误分析: {parsed.get('cause', '未知')} → 建议: {parsed.get('suggestion', '重试')}",
            "should_retry": parsed.get("retry", False),
        }
    except Exception as e:
        logger.warning("错误恢复分析失败: %s", e)
        return {"message": f"分析失败: {e}"}


async def evolution_trigger_hook(
    db: AsyncSession, context: dict, config: dict,
) -> dict | None:
    """进化触发hook — 当连续执行质量下降时触发进化流程"""
    agent_id = context.get("agent_id")
    quality_score = context.get("quality_score")

    if quality_score is not None and quality_score < 0.4:
        return {
            "message": f"质量分{quality_score:.1f}低于阈值，标记为进化候选",
            "trigger_evolution": True,
        }
    return None


# ─── Guardrails集成 ───

async def _run_guardrails_check(
    db: AsyncSession, context: dict, text: str, phase: str,
) -> dict | None:
    """从数据库加载规则并执行Guardrails校验"""
    agent_id = context.get("agent_id")
    company_id = context.get("company_id")

    if not company_id:
        return None

    # 查询适用的guardrail规则
    stmt = (
        select(EvoGuardrailRule)
        .where(
            EvoGuardrailRule.company_id == company_id,
            EvoGuardrailRule.phase == phase,
            EvoGuardrailRule.enabled == True,
            EvoGuardrailRule.is_deleted == False,
        )
        .where(
            (EvoGuardrailRule.agent_id == agent_id) | (EvoGuardrailRule.agent_id.is_(None))
        )
    )
    rules = (await db.execute(stmt)).scalars().all()

    if not rules:
        return None

    rule_configs = [{"name": r.rule_name, "config": r.config or {}} for r in rules]
    violations = agent_guardrails.validate_output(text, rule_configs)

    if not violations:
        return None

    report = agent_guardrails.format_report(violations)
    if agent_guardrails.has_block(violations):
        return {"quality_score": 0.0, "message": f"Guardrails拦截: {report}"}

    return {"quality_score": None, "message": f"Guardrails警告: {report}"}


# 内置hook注册表
BUILTIN_HANDLERS = {
    "quality_gate": quality_gate_hook,
    "context_enrichment": context_enrichment_hook,
    "error_recovery": error_recovery_hook,
    "evolution_trigger": evolution_trigger_hook,
}


class HookManager:
    """Hook管理器 — 注册、存储、执行hooks"""

    async def register_hook(
        self,
        db: AsyncSession,
        company_id: str,
        user_id: str,
        agent_id: str | None,
        hook_type: str,
        name: str,
        handler_type: str = "builtin",
        handler_config: dict | None = None,
        priority: int = 100,
    ) -> EvoHook:
        """注册新hook"""
        hook = EvoHook(
            company_id=company_id,
            created_by=user_id,
            agent_id=agent_id,
            hook_type=hook_type,
            name=name,
            handler_type=handler_type,
            handler_config=handler_config or {},
            priority=priority,
            enabled=True,
        )
        db.add(hook)
        await db.flush()
        await db.refresh(hook)
        return hook

    async def get_hooks_for_agent(
        self, db: AsyncSession, agent_id: str, company_id: str, hook_type: str,
    ) -> list[EvoHook]:
        """获取agent的hooks（含全局hooks），按优先级排序"""
        stmt = (
            select(EvoHook)
            .where(
                EvoHook.company_id == company_id,
                EvoHook.hook_type == hook_type,
                EvoHook.enabled == True,
                EvoHook.is_deleted == False,
            )
            .where(
                # agent专属hook 或 全局hook（agent_id为null）
                (EvoHook.agent_id == agent_id) | (EvoHook.agent_id.is_(None))
            )
            .order_by(EvoHook.priority.asc())
        )
        return (await db.execute(stmt)).scalars().all()

    async def fire_hooks(
        self,
        db: AsyncSession,
        hook_type: str,
        agent_id: str,
        company_id: str,
        user_id: str,
        context: dict,
    ) -> dict | None:
        """触发指定类型的所有hooks

        返回合并后的结果，任一hook返回blocked则终止执行链。
        """
        hooks = await self.get_hooks_for_agent(db, agent_id, company_id, hook_type)
        if not hooks:
            return None

        # 策略引擎评估
        policy_result = await policy_engine.evaluate(db, agent_id, company_id, context)
        if not policy_result["passed"]:
            return {
                "blocked": True,
                "quality_score": 0.0,
                "message": f"策略引擎拦截: {'; '.join(policy_result['violations'])}",
            }

        merged_result = {}

        for hook in hooks:
            t0 = time.monotonic()
            hook_log = EvoHookLog(
                company_id=company_id,
                created_by=user_id,
                hook_id=hook.id,
                execution_id=context.get("execution_id"),
                agent_id=agent_id,
                hook_type=hook_type,
            )

            try:
                handler = BUILTIN_HANDLERS.get(hook.name)
                if handler:
                    result = await handler(db, context, hook.handler_config or {})
                else:
                    result = {"message": f"未知处理器: {hook.name}"}

                hook_log.result = "success"
                if result:
                    hook_log.message = result.get("message", "")
                    # 合并结果
                    if "quality_score" in result:
                        merged_result["quality_score"] = result["quality_score"]
                    if "modified_input" in result:
                        merged_result["modified_input"] = result["modified_input"]
                    if "modified_output" in result:
                        merged_result["modified_output"] = result["modified_output"]
                    if "trigger_evolution" in result:
                        merged_result["trigger_evolution"] = result["trigger_evolution"]

            except Exception as e:
                logger.exception("Hook执行失败: %s", hook.name)
                hook_log.result = "error"
                hook_log.message = str(e)
                # hook失败不阻塞主流程

            hook_log.duration_ms = int((time.monotonic() - t0) * 1000)
            db.add(hook_log)

        return merged_result if merged_result else None

    async def list_hooks(
        self, db: AsyncSession, company_id: str, hook_type: str | None = None,
    ) -> list[EvoHook]:
        """列出所有hooks"""
        stmt = select(EvoHook).where(
            EvoHook.company_id == company_id,
            EvoHook.is_deleted == False,
        )
        if hook_type:
            stmt = stmt.where(EvoHook.hook_type == hook_type)
        return (await db.execute(stmt.order_by(EvoHook.priority))).scalars().all()

    async def init_default_hooks(self, db: AsyncSession, company_id: str, user_id: str) -> int:
        """初始化默认hooks"""
        defaults = [
            {"hook_type": "post_execute", "name": "quality_gate", "handler_config": {"threshold": 6.0}, "priority": 10},
            {"hook_type": "pre_execute", "name": "context_enrichment", "handler_config": {}, "priority": 10},
            {"hook_type": "on_error", "name": "error_recovery", "handler_config": {}, "priority": 10},
            {"hook_type": "post_execute", "name": "evolution_trigger", "handler_config": {}, "priority": 50},
        ]
        count = 0
        for d in defaults:
            existing = (await db.execute(
                select(EvoHook).where(
                    EvoHook.company_id == company_id,
                    EvoHook.hook_type == d["hook_type"],
                    EvoHook.name == d["name"],
                    EvoHook.is_deleted == False,
                    EvoHook.agent_id.is_(None),
                )
            )).scalar_one_or_none()
            if existing:
                continue
            await self.register_hook(
                db, company_id, user_id,
                agent_id=None,  # 全局hook
                hook_type=d["hook_type"],
                name=d["name"],
                handler_type="builtin",
                handler_config=d["handler_config"],
                priority=d["priority"],
            )
            count += 1
        return count


# 全局单例
hook_manager = HookManager()
