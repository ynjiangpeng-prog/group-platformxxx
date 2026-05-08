"""Token成本优化器

三个策略：
1. prompt压缩 — 移除冗余空白、截断过长上下文
2. 记忆过滤 — 按相关性筛选注入的记忆，控制token预算
3. 模型路由 — 简单任务用小模型，复杂任务用大模型
"""

import logging
import re

logger = logging.getLogger(__name__)

# 模型成本表（每1K token的相对成本）
MODEL_COST = {
    "glm-4-flash": 0.1,
    "glm-4-plus": 0.5,
    "glm-5.1": 1.0,
}

# 默认模型
DEFAULT_MODEL = "glm-5.1"
CHEAP_MODEL = "glm-4-flash"


def estimate_tokens(text: str) -> int:
    """粗略估算token数（中文约1.5字/token，英文约4字符/token）"""
    if not text:
        return 0
    chinese = len(re.findall(r'[一-鿿]', text))
    other = len(text) - chinese
    return int(chinese / 1.5 + other / 4)


def compress_prompt(text: str, max_tokens: int = 4000) -> str:
    """压缩prompt：移除多余空白，截断过长内容"""
    if not text:
        return ""

    # 移除连续空行
    text = re.sub(r'\n{3,}', '\n\n', text)
    # 移除行尾空白
    text = re.sub(r'[ \t]+\n', '\n', text)
    # 合并连续空格
    text = re.sub(r' {2,}', ' ', text)

    # 如果还是超长，截断
    tokens = estimate_tokens(text)
    if tokens > max_tokens:
        # 按比例截取
        ratio = max_tokens / tokens
        cut_pos = int(len(text) * ratio * 0.95)  # 留5%余量
        text = text[:cut_pos] + "\n...(内容已截断)"

    return text.strip()


def filter_memories_by_relevance(
    memories: list[str],
    query: str,
    max_tokens: int = 1000,
) -> list[str]:
    """按关键词相关性筛选记忆，控制在token预算内"""
    if not memories or not query:
        return []

    query_words = set(re.findall(r'[一-鿿]{2,}|[a-zA-Z]{2,}', query.lower()))
    scored = []
    for m in memories:
        m_words = set(re.findall(r'[一-鿿]{2,}|[a-zA-Z]{2,}', m.lower()))
        overlap = len(query_words & m_words)
        scored.append((overlap, m))

    scored.sort(key=lambda x: x[0], reverse=True)

    result = []
    used_tokens = 0
    for _, m in scored:
        t = estimate_tokens(m)
        if used_tokens + t > max_tokens:
            break
        result.append(m)
        used_tokens += t

    return result


def route_model(input_data: dict, agent_config: dict | None = None) -> str:
    """模型路由：根据任务复杂度选择模型"""
    config = agent_config or {}
    configured_model = config.get("model", DEFAULT_MODEL)

    # 如果用户明确指定了模型，尊重配置
    if config.get("model_fixed"):
        return configured_model

    # 简单启发式：短输入 + 无记忆 = 简单任务
    query = input_data.get("query") or input_data.get("text", "")
    has_memories = bool(input_data.get("_memories"))
    input_tokens = estimate_tokens(query)

    if input_tokens < 50 and not has_memories:
        return CHEAP_MODEL

    return configured_model
