"""Prompt进化器 — 基于GEPA的prompt进化引擎

进化流程：收集执行历史 → 评估当前质量 → 生成变异候选 → 回测 → 选优 → 申请更新
进化层级（由低到高，越低越自动）：
  Level 1 - Skill描述：全自动
  Level 2 - Tool描述：自动 + 日志
  Level 3 - System Prompt：需人工确认
  Level 4 - Code逻辑：仅建议
"""

import json
import logging
from datetime import datetime
from uuid import uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_evolution.models import (
    EvoAgent, EvoExecution, EvoHistory, EvoEvalDataset,
)

logger = logging.getLogger(__name__)

# 变异策略
MUTATION_STRATEGIES = [
    "clarify",     # 澄清 — 让指令更明确
    "add_constraint",  # 增加约束 — 添加限制条件
    "add_example",     # 增加示例 — 加入few-shot示例
    "simplify",    # 简化 — 去除冗余表述
    "restructure", # 重构 — 改变组织结构
    "specialize",  # 专业化 — 针对特定场景优化
]


class PromptEvolver:
    """Prompt进化器"""

    async def identify_targets(
        self, db: AsyncSession, company_id: str,
    ) -> list[dict]:
        """识别需要进化的agent（质量下降或失败率高）"""
        # 查询所有活跃agent
        agents = (await db.execute(
            select(EvoAgent).where(
                EvoAgent.company_id == company_id,
                EvoAgent.is_deleted == False,
                EvoAgent.status == "active",
            )
        )).scalars().all()

        targets = []
        for agent in agents:
            # 统计近7天执行数据
            stats = await self._get_recent_stats(db, str(agent.id), company_id, days=7)
            reasons = []

            # 条件1：质量下降超过15%
            if stats["quality_trend"] < -0.15:
                reasons.append(f"质量下降{abs(stats['quality_trend'])*100:.0f}%")

            # 条件2：失败率超过20%
            if stats["failure_rate"] > 0.2:
                reasons.append(f"失败率{stats['failure_rate']*100:.0f}%")

            # 条件3：连续50次执行质量稳定（固化了可以尝试优化）
            if stats["total"] >= 50 and abs(stats["quality_trend"]) < 0.05:
                reasons.append("执行稳定，尝试突破")

            if reasons:
                targets.append({
                    "agent_id": str(agent.id),
                    "agent_name": agent.name,
                    "current_score": agent.quality_score,
                    "reasons": reasons,
                    "stats": stats,
                })

        return targets

    async def evolve(
        self,
        db: AsyncSession,
        agent_id: str,
        company_id: str,
        user_id: str,
        level: int = 3,
        num_variants: int = 3,
        eval_dataset_id: str | None = None,
    ) -> list[dict]:
        """执行一轮进化

        返回候选变体列表，每个包含 {content, score, delta}
        """
        agent = (await db.execute(
            select(EvoAgent).where(EvoAgent.id == agent_id)
        )).scalar_one_or_none()
        if not agent:
            raise ValueError(f"Agent {agent_id} 不存在")

        # 获取当前内容
        if level == 1:
            current_content = agent.description or ""
        elif level == 2:
            current_content = str(agent.tools or [])
        elif level == 3:
            current_content = agent.system_prompt or ""
        else:
            return [{"content": "Level 4仅建议，不自动修改", "score": 0, "delta": 0}]

        # 收集执行经验
        experiences = await self._collect_experiences(db, agent_id, company_id)

        # 使用DSPy Optimizer筛选最优few-shot示例，注入到变体生成prompt中
        from app.services.agent_evo.evolution.dspy_module import Optimizer, FewShotExample
        optimizer = Optimizer(max_examples=3, min_score=0.6)
        for exp in experiences:
            if exp["type"] == "success" and exp.get("score"):
                optimizer.add_example(FewShotExample(
                    input_data=exp.get("input", {}),
                    output_data=exp.get("output", {}),
                    score=exp["score"],
                ))
        few_shot_text = optimizer.format_few_shots()

        # Promptomatix: 分析当前prompt的弱点
        weaknesses = await self._analyze_weaknesses(current_content, experiences, level)

        # 生成变异候选
        variants = await self._generate_variants(
            current_content, experiences, level, num_variants, few_shot_text, weaknesses
        )

        # 评估每个变体
        eval_cases = await self._get_eval_cases(db, agent_id, company_id, eval_dataset_id)
        baseline_score = agent.quality_score or 0.5
        results = []

        for variant in variants:
            score = await self._evaluate_variant(variant, eval_cases, level)
            delta = score - baseline_score

            # 记录进化历史
            history = EvoHistory(
                company_id=company_id,
                created_by=user_id,
                agent_id=agent_id,
                level=level,
                evolution_type="prompt_mutate",
                old_content=current_content,
                new_content=variant,
                diff_summary=f"进化Level{level}，得分变化{delta:+.2f}",
                score_before=baseline_score,
                score_after=score,
                metrics={"num_variants": num_variants, "eval_cases": len(eval_cases)},
                eval_dataset_id=eval_dataset_id,
                status="pending",
            )
            db.add(history)
            await db.flush()
            await db.refresh(history)

            results.append({
                "history_id": str(history.id),
                "content": variant,
                "score": score,
                "delta": delta,
                "status": "pending",
            })

        return results

    async def apply_evolution(
        self, db: AsyncSession, history_id: str, approved_by: str,
    ) -> dict:
        """应用进化结果（更新agent配置）"""
        history = (await db.execute(
            select(EvoHistory).where(EvoHistory.id == history_id)
        )).scalar_one_or_none()
        if not history:
            raise ValueError("进化记录不存在")
        if history.status != "pending":
            raise ValueError(f"进化状态为{history.status}，无法应用")

        # 更新agent
        agent = (await db.execute(
            select(EvoAgent).where(EvoAgent.id == history.agent_id)
        )).scalar_one_or_none()
        if not agent:
            raise ValueError("Agent不存在")

        if history.level == 1:
            agent.description = history.new_content
        elif history.level == 2:
            try:
                agent.tools = json.loads(history.new_content) if isinstance(history.new_content, str) else history.new_content
            except (json.JSONDecodeError, TypeError):
                agent.tools = {"raw": history.new_content}
        elif history.level == 3:
            agent.system_prompt = history.new_content

        agent.version = (agent.version or 1) + 1
        if history.score_after is not None:
            agent.quality_score = history.score_after

        history.status = "approved"
        history.approved_by = approved_by
        history.approved_at = datetime.now()
        history.deployed_at = datetime.now()

        await db.flush()

        # 回归测试：质量下降超过15%时自动回滚
        regression = await self._regression_check(history.score_before or 0.5, history.score_after or 0.5)
        if regression:
            # 自动回滚
            if history.level == 1:
                agent.description = history.old_content
            elif history.level == 2:
                try:
                    agent.tools = json.loads(history.old_content) if isinstance(history.old_content, str) else history.old_content
                except (json.JSONDecodeError, TypeError):
                    agent.tools = {"raw": history.old_content}
            elif history.level == 3:
                agent.system_prompt = history.old_content
            agent.version = max(1, (agent.version or 1) - 1)
            agent.quality_score = history.score_before
            history.status = "auto_rolled_back"
            history.rolled_back_at = datetime.now()
            await db.flush()
            return {
                "agent_id": str(agent.id),
                "version": agent.version,
                "new_score": history.score_before,
                "regression_rolled_back": True,
                "reason": f"回归测试失败：质量下降超过15%",
            }

        return {
            "agent_id": str(agent.id),
            "version": agent.version,
            "new_score": history.score_after,
        }

    async def rollback(self, db: AsyncSession, history_id: str, user_id: str) -> dict:
        """回滚进化"""
        history = (await db.execute(
            select(EvoHistory).where(EvoHistory.id == history_id)
        )).scalar_one_or_none()
        if not history:
            raise ValueError("进化记录不存在")

        agent = (await db.execute(
            select(EvoAgent).where(EvoAgent.id == history.agent_id)
        )).scalar_one_or_none()
        if not agent:
            raise ValueError("Agent不存在")

        # 恢复旧内容
        if history.level == 1:
            agent.description = history.old_content
        elif history.level == 2:
            try:
                agent.tools = json.loads(history.old_content) if isinstance(history.old_content, str) else history.old_content
            except (json.JSONDecodeError, TypeError):
                agent.tools = {"raw": history.old_content}
        elif history.level == 3:
            agent.system_prompt = history.old_content

        agent.version = max(1, (agent.version or 1) - 1)
        if history.score_before is not None:
            agent.quality_score = history.score_before

        history.status = "rolled_back"
        history.rolled_back_at = datetime.now()

        await db.flush()
        return {"agent_id": str(agent.id), "version": agent.version}

    async def _regression_check(self, score_before: float, score_after: float) -> bool:
        """回归测试：质量下降超过15%判定为回归"""
        if score_before <= 0:
            return False
        drop = (score_before - score_after) / score_before
        return drop > 0.15

    async def _get_recent_stats(
        self, db: AsyncSession, agent_id: str, company_id: str, days: int = 7,
    ) -> dict:
        """获取agent近期执行统计"""
        from datetime import timedelta
        cutoff = datetime.now() - timedelta(days=days)

        execs = (await db.execute(
            select(EvoExecution).where(
                EvoExecution.agent_id == agent_id,
                EvoExecution.company_id == company_id,
                EvoExecution.is_deleted == False,
                EvoExecution.created_at >= cutoff,
            )
        )).scalars().all()

        total = len(execs)
        if total == 0:
            return {"total": 0, "avg_quality": 0, "failure_rate": 0, "quality_trend": 0}

        scores = [e.quality_score for e in execs if e.quality_score is not None]
        failures = sum(1 for e in execs if e.status == "failed")

        # 简单趋势：前半和后半的平均分差
        if len(scores) >= 4:
            mid = len(scores) // 2
            first_half = sum(scores[:mid]) / mid
            second_half = sum(scores[mid:]) / (len(scores) - mid)
            trend = second_half - first_half
        else:
            trend = 0

        return {
            "total": total,
            "avg_quality": sum(scores) / max(1, len(scores)) if scores else 0,
            "failure_rate": failures / total,
            "quality_trend": trend,
        }

    async def _collect_experiences(
        self, db: AsyncSession, agent_id: str, company_id: str,
    ) -> list[dict]:
        """收集执行经验（高分和低分案例）"""
        # 高分案例
        good = (await db.execute(
            select(EvoExecution).where(
                EvoExecution.agent_id == agent_id,
                EvoExecution.company_id == company_id,
                EvoExecution.quality_score >= 0.7,
                EvoExecution.is_deleted == False,
            ).order_by(EvoExecution.quality_score.desc()).limit(5)
        )).scalars().all()

        # 低分案例
        bad = (await db.execute(
            select(EvoExecution).where(
                EvoExecution.agent_id == agent_id,
                EvoExecution.company_id == company_id,
                EvoExecution.quality_score < 0.4,
                EvoExecution.is_deleted == False,
            ).order_by(EvoExecution.quality_score.asc()).limit(5)
        )).scalars().all()

        experiences = []
        for e in good:
            experiences.append({
                "type": "success",
                "input": e.input_data,
                "output": e.output_data,
                "score": e.quality_score,
            })
        for e in bad:
            experiences.append({
                "type": "failure",
                "input": e.input_data,
                "output": e.output_data,
                "score": e.quality_score,
                "error": e.error_message,
            })

        return experiences

    async def _generate_variants(
        self,
        current_content: str,
        experiences: list[dict],
        level: int,
        num_variants: int,
        few_shot_text: str = "",
        weaknesses: str = "",
    ) -> list[str]:
        """用LLM生成prompt变体"""
        from app.services.ai_gateway import ai_gateway

        # 构建经验摘要
        exp_text = ""
        for exp in experiences[:6]:
            score = exp.get("score") or 0
            if exp["type"] == "success":
                exp_text += f"✓ 成功(评分{score:.1f}): 输入={str(exp.get('input') or '')[:100]}\n"
            else:
                exp_text += f"✗ 失败(评分{score:.1f}): 原因={str(exp.get('error') or '未知')[:100]}\n"

        level_names = {1: "技能描述", 2: "工具描述", 3: "系统提示词", 4: "代码逻辑"}
        strategy_names = ", ".join(MUTATION_STRATEGIES[:4])

        few_shot_section = f"\n优秀示例参考：\n{few_shot_text}\n" if few_shot_text else ""
        weakness_section = f"\n当前弱点分析：\n{weaknesses}\n" if weaknesses else ""

        prompt = (
            f"你是一个Prompt优化专家。请为以下AI Agent的{level_names.get(level, '配置')}生成{num_variants}个优化变体。\n\n"
            f"当前内容：\n{current_content[:1500]}\n\n"
            f"执行经验：\n{exp_text or '暂无执行数据'}\n"
            f"{few_shot_section}"
            f"{weakness_section}"
            f"优化策略参考：{strategy_names}\n\n"
            f"要求：\n"
            f"1. 每个变体必须不同于原文和彼此\n"
            f"2. 长度不超过原文的120%\n"
            f"3. 保持原有语义核心不变\n"
            f"4. 针对失败案例的问题进行改进\n\n"
            f"返回JSON数组：\n"
            f'[{{"variant": "变体内容", "strategy": "使用的策略", "reason": "为什么这样改"}}]\n'
            f"直接输出JSON，不要其他文字。"
        )

        try:
            result = await ai_gateway.routed_chat(
                [{"role": "user", "content": prompt}],
                task="evolution_generate",
            )
            parsed = ai_gateway.parse_json_response(result)
            if isinstance(parsed, list):
                return [v.get("variant", current_content) for v in parsed[:num_variants]]
            return [current_content]
        except Exception as e:
            logger.exception("变体生成失败: %s", e)
            return [current_content]

    async def _get_eval_cases(
        self,
        db: AsyncSession,
        agent_id: str,
        company_id: str,
        eval_dataset_id: str | None = None,
    ) -> list[dict]:
        """获取评估用例"""
        if eval_dataset_id:
            dataset = (await db.execute(
                select(EvoEvalDataset).where(EvoEvalDataset.id == eval_dataset_id)
            )).scalar_one_or_none()
            if dataset and dataset.cases:
                return dataset.cases[:10]

        # 无指定数据集时，从执行历史生成
        execs = (await db.execute(
            select(EvoExecution).where(
                EvoExecution.agent_id == agent_id,
                EvoExecution.company_id == company_id,
                EvoExecution.is_deleted == False,
            ).order_by(EvoExecution.created_at.desc()).limit(10)
        )).scalars().all()

        return [
            {
                "input": e.input_data,
                "expected_quality": 0.7,
                "historical_score": e.quality_score,
            }
            for e in execs if e.input_data
        ]

    async def _analyze_weaknesses(
        self, content: str, experiences: list[dict], level: int,
    ) -> str:
        """Promptomatix: 分析当前prompt的弱点，用于指导变异策略"""
        from app.services.ai_gateway import ai_gateway

        if not content or len(content) < 20:
            return ""

        # 统计失败模式
        failures = [e for e in experiences if e.get("type") == "failure"]
        if not failures:
            return ""

        failure_reasons = "; ".join(
            str(e.get("error") or "质量低")[:80] for e in failures[:5]
        )

        prompt = (
            f"分析以下AI Agent的{'技能描述' if level <= 2 else '系统提示词'}的弱点：\n\n"
            f"当前内容：\n{content[:1500]}\n\n"
            f"已知失败模式：{failure_reasons}\n\n"
            f"请从以下维度分析弱点：\n"
            f"1. 指令清晰度：是否有模糊或矛盾的指令\n"
            f"2. 约束缺失：是否缺少必要的边界条件\n"
            f"3. 覆盖不足：是否有场景未被覆盖\n"
            f"4. 过度限制：是否有多余的限制阻碍灵活性\n\n"
            f"返回JSON：{{\"weaknesses\": [\"弱点1\", \"弱点2\"], \"suggestions\": [\"建议1\", \"建议2\"]}}\n"
            f"直接输出JSON。"
        )

        try:
            result = await ai_gateway.routed_chat(
                [{"role": "user", "content": prompt}],
                task="evolution_eval",
            )
            parsed = ai_gateway.parse_json_response(result)
            ws = parsed.get("weaknesses", [])
            ss = parsed.get("suggestions", [])
            parts = []
            if ws:
                parts.append("弱点: " + ", ".join(ws[:3]))
            if ss:
                parts.append("建议: " + ", ".join(ss[:3]))
            return " | ".join(parts) if parts else ""
        except Exception:
            return ""

    async def _evaluate_variant(
        self, variant: str, eval_cases: list[dict], level: int,
    ) -> float:
        """用LLM评估变体质量，使用DSPy Signature标准化评估流程"""
        if not eval_cases:
            return 0.5

        from app.services.ai_gateway import ai_gateway
        from app.services.agent_evo.evolution.dspy_module import Signature

        # 用Signature定义评估的输入输出规范
        eval_sig = Signature(
            inputs={"prompt": "待评估的prompt文本", "eval_criteria": "评估标准"},
            outputs={"score": "0-10的评分", "reason": "评分原因"},
        )

        criteria = (
            "指令清晰度(3分)：是否明确告诉AI该做什么\n"
            "约束完备性(3分)：是否规定了边界和限制\n"
            "可操作性(2分)：是否包含具体执行步骤\n"
            "健壮性(2分)：是否考虑了异常情况"
        )

        prompt = (
            f"评估以下AI Agent的{'技能描述' if level <= 2 else '系统提示词'}的质量(0-10分)：\n\n"
            f"{variant[:1000]}\n\n"
            f"评估标准：\n{criteria}\n\n"
            f"只返回一个JSON: {{\"score\": 数字}}"
        )

        try:
            result = await ai_gateway.routed_chat(
                [{"role": "user", "content": prompt}],
                task="evolution_eval",
            )
            parsed = ai_gateway.parse_json_response(result)
            return min(1.0, float(parsed.get("score", 5)) / 10.0)
        except Exception:
            return 0.5


# 全局单例
prompt_evolver = PromptEvolver()
