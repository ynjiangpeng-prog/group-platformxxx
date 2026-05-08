"""闭环学习服务 — 执行→评估→进化→再执行

循环：
1. agent执行任务 → 记录结果
2. 评估器打分
3. 如果分数低于阈值 → 触发进化
4. 新prompt回测通过 → 更新agent配置
5. 继续执行 → 再次评估
"""

import logging
from datetime import datetime

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_evolution.models import (
    EvoAgent, EvoExecution, EvoHistory, EvoFeedback,
)
from app.services.agent_evo.evolution.prompt_evolver import prompt_evolver

logger = logging.getLogger(__name__)


class LearningLoop:
    """闭环学习管理器"""

    async def check_and_evolve(
        self, db: AsyncSession, company_id: str,
    ) -> list[dict]:
        """检查所有agent，对需要进化的执行进化循环"""
        targets = await prompt_evolver.identify_targets(db, company_id)
        results = []

        for target in targets:
            agent_id = target["agent_id"]
            agent_name = target["agent_name"]
            logger.info("开始进化: %s (原因: %s)", agent_name, ", ".join(target["reasons"]))

            try:
                # 执行Level 3进化（system prompt）
                variants = await prompt_evolver.evolve(
                    db, agent_id, company_id,
                    user_id="system",
                    level=3,
                    num_variants=3,
                )

                # 自动选择最优变体
                best = max(variants, key=lambda v: v["score"]) if variants else None
                if best and best["delta"] > 0.05:
                    # Level 3需要人工确认，不自动应用
                    results.append({
                        "agent_id": agent_id,
                        "agent_name": agent_name,
                        "status": "evolved",
                        "best_score": best["score"],
                        "delta": best["delta"],
                        "history_id": best["history_id"],
                        "message": f"发现更优变体(得分+{best['delta']:.2f})，待人工确认",
                    })
                else:
                    results.append({
                        "agent_id": agent_id,
                        "agent_name": agent_name,
                        "status": "no_improvement",
                        "message": "未找到优于基线的变体",
                    })

            except Exception as e:
                logger.exception("进化失败: %s", agent_name)
                results.append({
                    "agent_id": agent_id,
                    "agent_name": agent_name,
                    "status": "error",
                    "message": str(e),
                })

        return results

    async def process_feedback(
        self,
        db: AsyncSession,
        execution_id: str,
        agent_id: str,
        company_id: str,
        user_id: str,
        rating: str,
        comment: str | None = None,
    ) -> dict:
        """处理用户反馈，负面反馈立即触发评估"""
        feedback = EvoFeedback(
            company_id=company_id,
            created_by=user_id,
            execution_id=execution_id,
            agent_id=agent_id,
            rating=rating,
            comment=comment,
            user_id=user_id,
        )
        db.add(feedback)

        # 如果是负面反馈，检查是否需要进化
        if rating == "negative":
            execution = (await db.execute(
                select(EvoExecution).where(EvoExecution.id == execution_id)
            )).scalar_one_or_none()

            if execution:
                execution.quality_score = 0.2  # 负面反馈直接降分
                logger.info("负面反馈: agent=%s execution=%s", agent_id, execution_id)

        await db.flush()
        return {"feedback_id": str(feedback.id), "triggered_evolution": rating == "negative"}

    async def get_quality_trend(
        self, db: AsyncSession, agent_id: str, company_id: str, days: int = 30,
    ) -> list[dict]:
        """获取agent的质量趋势数据"""
        from datetime import timedelta
        cutoff = datetime.now() - timedelta(days=days)

        execs = (await db.execute(
            select(EvoExecution).where(
                EvoExecution.agent_id == agent_id,
                EvoExecution.company_id == company_id,
                EvoExecution.is_deleted == False,
                EvoExecution.created_at >= cutoff,
                EvoExecution.quality_score.isnot(None),
            ).order_by(EvoExecution.created_at)
        )).scalars().all()

        # 按日聚合
        daily: dict[str, list[float]] = {}
        for e in execs:
            day = e.created_at.strftime("%Y-%m-%d") if e.created_at else "unknown"
            if day not in daily:
                daily[day] = []
            daily[day].append(e.quality_score)

        return [
            {"date": day, "avg_score": sum(scores) / len(scores), "count": len(scores)}
            for day, scores in sorted(daily.items())
        ]

    async def get_evolution_history(
        self, db: AsyncSession, agent_id: str, company_id: str, limit: int = 20,
    ) -> list[dict]:
        """获取agent的进化历史"""
        histories = (await db.execute(
            select(EvoHistory).where(
                EvoHistory.agent_id == agent_id,
                EvoHistory.company_id == company_id,
                EvoHistory.is_deleted == False,
            ).order_by(EvoHistory.created_at.desc()).limit(limit)
        )).scalars().all()

        return [
            {
                "id": str(h.id),
                "level": h.level,
                "evolution_type": h.evolution_type,
                "score_before": h.score_before,
                "score_after": h.score_after,
                "delta": (h.score_after or 0) - (h.score_before or 0) if h.score_before and h.score_after else 0,
                "status": h.status,
                "diff_summary": h.diff_summary,
                "created_at": h.created_at.isoformat() if h.created_at else None,
                "approved_at": h.approved_at.isoformat() if h.approved_at else None,
            }
            for h in histories
        ]

    async def auto_rollback_check(self, db: AsyncSession, company_id: str) -> list[dict]:
        """检查24小时内是否有部署后质量下降的进化，自动回滚"""
        from datetime import timedelta
        cutoff = datetime.now() - timedelta(hours=24)

        recent_deploys = (await db.execute(
            select(EvoHistory).where(
                EvoHistory.company_id == company_id,
                EvoHistory.status == "approved",
                EvoHistory.deployed_at >= cutoff,
                EvoHistory.is_deleted == False,
            )
        )).scalars().all()

        rolled_back = []
        for h in recent_deploys:
            # 检查部署后的平均质量
            post_execs = (await db.execute(
                select(EvoExecution).where(
                    EvoExecution.agent_id == h.agent_id,
                    EvoExecution.company_id == company_id,
                    EvoExecution.created_at >= h.deployed_at,
                    EvoExecution.quality_score.isnot(None),
                )
            )).scalars().all()

            if not post_execs:
                continue

            avg_post = sum(e.quality_score for e in post_execs) / len(post_execs)
            if h.score_before and avg_post < h.score_before - 0.1:
                # 质量下降超过0.1，自动回滚
                try:
                    await prompt_evolver.rollback(db, str(h.id), "system")
                    rolled_back.append({
                        "history_id": str(h.id),
                        "agent_id": str(h.agent_id),
                        "reason": f"部署后平均质量{avg_post:.2f}低于基线{h.score_before:.2f}",
                    })
                except Exception as e:
                    logger.exception("自动回滚失败: %s", e)

        return rolled_back


# 全局单例
learning_loop = LearningLoop()
