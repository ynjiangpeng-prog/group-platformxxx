"""轻量Guardrails校验系统（自研）

不依赖guardrails-ai包，内置7个常用校验器。
在hook流程中执行输入/输出校验，不合规时阻止执行或标记警告。"""

import re
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class GuardrailViolation(Exception):
    """校验未通过"""
    def __init__(self, rule_name: str, reason: str, severity: str = "block"):
        self.rule_name = rule_name
        self.reason = reason
        self.severity = severity
        super().__init__(f"[{rule_name}] {reason}")


class GuardrailValidator:
    """单个校验器"""

    def __init__(self, name: str, validator_fn, severity: str = "block"):
        self.name = name
        self.validator_fn = validator_fn
        self.severity = severity  # block | warn

    def validate(self, text: str, config: dict | None = None) -> GuardrailViolation | None:
        try:
            result = self.validator_fn(text, config or {})
            if result:
                return GuardrailViolation(self.name, result, self.severity)
        except Exception as e:
            logger.warning("校验器%s执行异常: %s", self.name, e)
        return None


# ─── 内置校验器 ───

def _check_json_format(text: str, config: dict) -> str | None:
    """检查是否为合法JSON"""
    import json
    try:
        json.loads(text)
        return None
    except (json.JSONDecodeError, TypeError):
        return "内容不是合法JSON格式"


def _check_max_length(text: str, config: dict) -> str | None:
    """检查最大长度"""
    max_len = config.get("max_length", 10000)
    if len(text) > max_len:
        return f"内容长度{len(text)}超过限制{max_len}"


def _check_no_pii(text: str, config: dict) -> str | None:
    """检查是否包含PII（个人身份信息）"""
    patterns = [
        (r'\b\d{18}[0-9xX]\b', "身份证号"),
        (r'\b1[3-9]\d{9}\b', "手机号"),
        (r'\b\d{6,8}\b', "可能为银行卡号"),
    ]
    for pattern, label in patterns:
        if re.search(pattern, text):
            return f"检测到疑似{label}"


def _check_no_sql_injection(text: str, config: dict) -> str | None:
    """检查SQL注入风险"""
    sql_patterns = [
        r"(?i)(\bunion\b\s+\bselect\b)",
        r"(?i)(\bdrop\b\s+\btable\b)",
        r"(?i)(\binsert\b\s+\binto\b)",
        r"(?i)(\bdelete\b\s+\bfrom\b)",
        r"(?i)(--\s*$)",
        r"(';|;\s*drop\s)",
    ]
    for pattern in sql_patterns:
        if re.search(pattern, text):
            return "检测到疑似SQL注入"


def _check_contains_keywords(text: str, config: dict) -> str | None:
    """检查是否包含指定关键词"""
    keywords = config.get("keywords", [])
    for kw in keywords:
        if kw.lower() in text.lower():
            return f"包含禁止关键词: {kw}"


def _check_regex_match(text: str, config: dict) -> str | None:
    """检查正则匹配"""
    pattern = config.get("pattern")
    if pattern and not re.search(pattern, text):
        return f"内容不匹配要求的格式: {pattern}"


def _check_score_threshold(text: str, config: dict) -> str | None:
    """检查评分阈值（用于输出质量）"""
    import json
    try:
        data = json.loads(text)
        score = data.get("score", 0)
        threshold = config.get("min_score", 0)
        if score < threshold:
            return f"评分{score}低于阈值{threshold}"
    except (json.JSONDecodeError, TypeError):
        pass  # 非JSON不检查
    return None


# ─── 校验器注册表 ───

BUILTIN_VALIDATORS: dict[str, GuardrailValidator] = {
    "json_format": GuardrailValidator("json_format", _check_json_format, "block"),
    "max_length": GuardrailValidator("max_length", _check_max_length, "block"),
    "no_pii": GuardrailValidator("no_pii", _check_no_pii, "block"),
    "no_sql_injection": GuardrailValidator("no_sql_injection", _check_no_sql_injection, "block"),
    "contains_keywords": GuardrailValidator("contains_keywords", _check_contains_keywords, "warn"),
    "regex_match": GuardrailValidator("regex_match", _check_regex_match, "block"),
    "score_threshold": GuardrailValidator("score_threshold", _check_score_threshold, "warn"),
}


class AgentGuardrails:
    """Agent Guardrails管理器"""

    def validate_input(self, text: str, rules: list[dict]) -> list[GuardrailViolation]:
        """校验输入文本"""
        return self._run_validations(text, rules)

    def validate_output(self, text: str, rules: list[dict]) -> list[GuardrailViolation]:
        """校验输出文本"""
        return self._run_validations(text, rules)

    def _run_validations(self, text: str, rules: list[dict]) -> list[GuardrailViolation]:
        violations = []
        for rule in rules:
            name = rule.get("name", "")
            config = rule.get("config", {})
            validator = BUILTIN_VALIDATORS.get(name)
            if not validator:
                continue
            violation = validator.validate(text, config)
            if violation:
                violations.append(violation)
        return violations

    def has_block(self, violations: list[GuardrailViolation]) -> bool:
        return any(v.severity == "block" for v in violations)

    def format_report(self, violations: list[GuardrailViolation]) -> str:
        if not violations:
            return ""
        parts = []
        for v in violations:
            parts.append(f"[{v.severity.upper()}] {v.rule_name}: {v.reason}")
        return "; ".join(parts)


# 全局单例
agent_guardrails = AgentGuardrails()
