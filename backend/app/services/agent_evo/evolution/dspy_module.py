"""简化版DSPy模块 — 将agent包装为可优化模块

不依赖dspy-ai库，自己实现核心概念：
- Signature：输入输出类型声明
- Module：执行函数 + 校验函数
- Optimizer：基于历史数据的few-shot选择器
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable

logger = logging.getLogger(__name__)


@dataclass
class Signature:
    """签名 — 声明模块的输入输出"""
    inputs: dict[str, str]   # {字段名: 描述}
    outputs: dict[str, str]  # {字段名: 描述}
    instructions: str = ""

    def validate_input(self, data: dict) -> list[str]:
        """校验输入是否完整"""
        errors = []
        for name in self.inputs:
            if name not in data:
                errors.append(f"缺少输入字段: {name}")
        return errors

    def validate_output(self, data: dict) -> list[str]:
        """校验输出是否完整"""
        errors = []
        for name in self.outputs:
            if name not in data:
                errors.append(f"缺少输出字段: {name}")
        return errors


@dataclass
class AssertResult:
    """断言结果"""
    passed: bool
    message: str = ""


class Module:
    """可优化模块 — agent的执行单元"""

    def __init__(
        self,
        signature: Signature,
        forward_fn: Callable | None = None,
        asserts: list[Callable] | None = None,
        suggests: list[Callable] | None = None,
    ):
        self.signature = signature
        self.forward_fn = forward_fn
        self.asserts = asserts or []  # 硬约束 — 不满足则失败
        self.suggests = suggests or []  # 软建议 — 不满足仅降分

    async def forward(self, **kwargs) -> dict:
        """执行前向传播"""
        # 校验输入
        errors = self.signature.validate_input(kwargs)
        if errors:
            raise ValueError(f"输入校验失败: {errors}")

        # 执行
        if self.forward_fn:
            result = await self.forward_fn(**kwargs)
        else:
            result = kwargs  # 默认透传

        # 校验硬约束
        for assert_fn in self.asserts:
            res = assert_fn(result)
            if isinstance(res, AssertResult) and not res.passed:
                raise AssertionError(f"硬约束失败: {res.message}")

        # 评估软建议
        suggestion_score = 1.0
        for suggest_fn in self.suggests:
            res = suggest_fn(result)
            if isinstance(res, AssertResult) and not res.passed:
                suggestion_score -= 0.2

        result["_suggestion_score"] = max(0, suggestion_score)
        return result


@dataclass
class FewShotExample:
    """Few-shot示例"""
    input_data: dict
    output_data: dict
    score: float = 1.0


class Optimizer:
    """基于历史数据的优化器 — 选择最优few-shot示例"""

    def __init__(self, max_examples: int = 3, min_score: float = 0.7):
        self.max_examples = max_examples
        self.min_score = min_score
        self.examples: list[FewShotExample] = []

    def add_example(self, example: FewShotExample):
        """添加示例"""
        if example.score >= self.min_score:
            self.examples.append(example)
            self.examples.sort(key=lambda x: x.score, reverse=True)
            self.examples = self.examples[:self.max_examples * 2]

    def get_best_examples(self, n: int | None = None) -> list[FewShotExample]:
        """获取最优示例"""
        n = n or self.max_examples
        return self.examples[:n]

    def format_few_shots(self) -> str:
        """格式化为few-shot prompt片段"""
        examples = self.get_best_examples()
        if not examples:
            return ""

        lines = ["以下是几个优秀的回答示例：\n"]
        for i, ex in enumerate(examples, 1):
            input_str = str(ex.input_data)[:300]
            output_str = str(ex.output_data)[:500]
            lines.append(f"示例{i}（评分{ex.score:.1f}）：\n输入：{input_str}\n输出：{output_str}\n")

        return "\n".join(lines)
