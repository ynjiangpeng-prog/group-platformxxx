"""策略引擎 — 声明式规则评估

基于evo_guardrail_rules表中的规则，在hook流程中评估策略。
评估延迟 <1ms（纯内存计算，不调用LLM）。
"""

import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_evolution.models import EvoGuardrailRule

logger = logging.getLogger(__name__)


class PolicyEngine:
    """策略引擎 — 评估声明式规则"""

    async def evaluate(
        self,
        db: AsyncSession,
        agent_id: str | None,
        company_id: str,
        context: dict,
    ) -> dict:
        """评估所有适用的策略规则

        Returns: {passed: bool, violations: list[str], actions: list[str]}
        """
        # 查询适用的规则
        stmt = (
            select(EvoGuardrailRule)
            .where(
                EvoGuardrailRule.company_id == company_id,
                EvoGuardrailRule.enabled == True,
                EvoGuardrailRule.is_deleted == False,
            )
            .where(
                (EvoGuardrailRule.agent_id == agent_id) | (EvoGuardrailRule.agent_id.is_(None))
            )
        )
        rules = (await db.execute(stmt)).scalars().all()

        if not rules:
            return {"passed": True, "violations": [], "actions": []}

        violations = []
        actions = []

        for rule in rules:
            result = self._evaluate_rule(rule, context)
            if result:
                violations.append(result)
                if rule.severity == "block":
                    actions.append("block")

        return {
            "passed": len(violations) == 0 or all(v.get("severity") != "block" for v in violations),
            "violations": [v["message"] for v in violations],
            "actions": actions,
        }

    def _evaluate_rule(self, rule: EvoGuardrailRule, context: dict) -> dict | None:
        """评估单条规则（纯内存计算）"""
        config = rule.config or {}
        phase = rule.phase  # input/output

        if phase == "input":
            text = str(context.get("input_data", {}))
        elif phase == "output":
            text = str(context.get("output_data", {}))
        else:
            text = str(context)

        # 按rule_name分发评估
        evaluators = {
            "json_format": self._check_json,
            "max_length": self._check_length,
            "no_pii": self._check_pii,
            "no_sql_injection": self._check_sql,
            "score_threshold": self._check_score,
            "contains_keywords": self._check_keywords,
        }

        evaluator = evaluators.get(rule.rule_name)
        if not evaluator:
            return None

        violation = evaluator(text, config, context)
        if violation:
            return {"message": f"[{rule.rule_name}] {violation}", "severity": rule.severity}
        return None

    def _check_json(self, text: str, config: dict, ctx: dict) -> str | None:
        import json
        try:
            json.loads(text)
            return None
        except (json.JSONDecodeError, TypeError):
            return "内容不是合法JSON"

    def _check_length(self, text: str, config: dict, ctx: dict) -> str | None:
        max_len = config.get("max_length", 10000)
        if len(text) > max_len:
            return f"长度{len(text)}超过限制{max_len}"

    def _check_pii(self, text: str, config: dict, ctx: dict) -> str | None:
        import re
        if re.search(r'\b\d{18}[0-9xX]\b', text):
            return "检测到疑似身份证号"
        if re.search(r'\b1[3-9]\d{9}\b', text):
            return "检测到疑似手机号"

    def _check_sql(self, text: str, config: dict, ctx: dict) -> str | None:
        import re
        if re.search(r"(?i)(\bunion\b\s+\bselect\b|\bdrop\b\s+\btable\b)", text):
            return "检测到疑似SQL注入"

    def _check_score(self, text: str, config: dict, ctx: dict) -> str | None:
        score = ctx.get("quality_score")
        min_score = config.get("min_score", 0)
        if score is not None and score < min_score:
            return f"评分{score}低于阈值{min_score}"

    def _check_keywords(self, text: str, config: dict, ctx: dict) -> str | None:
        keywords = config.get("keywords", [])
        for kw in keywords:
            if kw.lower() in text.lower():
                return f"包含禁止关键词: {kw}"


# 全局单例
policy_engine = PolicyEngine()
