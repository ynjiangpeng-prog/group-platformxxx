import logging
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project.models import (
    ConstructionLog, ProjectLine, Project, ProjectMilestone,
)

logger = logging.getLogger(__name__)

# 默认人工单价（元/工日），可从系统配置覆盖
DEFAULT_DAILY_WAGE_SKILLED = 350
DEFAULT_DAILY_WAGE_UNSKILLED = 220


class LaborAnalysisService:
    """施工人工效率分析：窝工预警、人工成本追踪、利用率分析。"""

    @staticmethod
    async def get_project_labor_summary(
        db: AsyncSession, project_id: str, days: int = 30
    ) -> dict:
        """项目人工效率概览：近N天的汇总数据。"""
        end = date.today()
        start = end - timedelta(days=days)

        # 1. 施工日志汇总
        log_stats = (await db.execute(
            select(
                func.count(ConstructionLog.id).label("log_days"),
                func.sum(ConstructionLog.worker_count).label("total_workers"),
                func.avg(ConstructionLog.worker_count).label("avg_workers"),
                func.max(ConstructionLog.worker_count).label("max_workers"),
            ).where(
                ConstructionLog.project_id == project_id,
                ConstructionLog.log_date >= start,
                ConstructionLog.log_date <= end,
                ConstructionLog.is_deleted == False,
            )
        )).one()

        log_days = log_stats.log_days or 0
        total_worker_days = int(log_stats.total_workers or 0)
        avg_workers = float(log_stats.avg_workers or 0)

        # 2. 人工成本（ProjectLine中line_type='labor'）
        labor_cost = (await db.execute(
            select(func.coalesce(func.sum(ProjectLine.amount), 0)).where(
                ProjectLine.project_id == project_id,
                ProjectLine.line_type == "labor",
                ProjectLine.record_date >= start,
                ProjectLine.record_date <= end,
                ProjectLine.is_deleted == False,
            )
        )).scalar() or 0

        # 3. 总成本（用于计算人工占比）
        total_cost = (await db.execute(
            select(func.coalesce(func.sum(ProjectLine.amount), 0)).where(
                ProjectLine.project_id == project_id,
                ProjectLine.record_date >= start,
                ProjectLine.record_date <= end,
                ProjectLine.is_deleted == False,
            )
        )).scalar() or 0

        labor_cost = float(labor_cost)
        total_cost = float(total_cost)
        labor_ratio = round(labor_cost / total_cost * 100, 1) if total_cost > 0 else 0

        # 4. 估算工日单价
        est_daily_cost = round(labor_cost / total_worker_days, 1) if total_worker_days > 0 else 0

        # 5. 里程碑完成情况（用于判断窝工）
        total_milestones = (await db.execute(
            select(func.count(ProjectMilestone.id)).where(
                ProjectMilestone.project_id == project_id,
                ProjectMilestone.is_deleted == False,
            )
        )).scalar() or 0

        completed_milestones = (await db.execute(
            select(func.count(ProjectMilestone.id)).where(
                ProjectMilestone.project_id == project_id,
                ProjectMilestone.status == "completed",
                ProjectMilestone.is_deleted == False,
            )
        )).scalar() or 0

        overdue_milestones = (await db.execute(
            select(func.count(ProjectMilestone.id)).where(
                ProjectMilestone.project_id == project_id,
                ProjectMilestone.planned_date < end,
                ProjectMilestone.status != "completed",
                ProjectMilestone.is_deleted == False,
            )
        )).scalar() or 0

        # 6. 项目预算信息
        project = (await db.execute(
            select(Project).where(Project.id == project_id)
        )).scalar_one_or_none()

        budget = float(project.total_budget or 0) if project else 0
        actual_cost_total = float(project.actual_cost or 0) if project else 0
        progress = float(project.progress or 0) if project else 0

        # 7. 窝工预警计算
        idle_alerts = await LaborAnalysisService._detect_idle_workers(
            db, project_id, start, end, avg_workers
        )

        return {
            "project_id": project_id,
            "project_name": project.name if project else None,
            "period": {"start": start.isoformat(), "end": end.isoformat(), "days": days},
            "labor": {
                "log_days": log_days,
                "total_worker_days": total_worker_days,
                "avg_daily_workers": round(avg_workers, 1),
                "max_daily_workers": int(log_stats.max_workers or 0),
                "labor_cost": labor_cost,
                "est_daily_cost_per_worker": est_daily_cost,
                "labor_ratio_pct": labor_ratio,
            },
            "cost": {
                "total_budget": budget,
                "actual_cost": actual_cost_total,
                "period_cost": total_cost,
                "budget_usage_pct": round(actual_cost_total / budget * 100, 1) if budget > 0 else 0,
            },
            "progress": {
                "total_milestones": total_milestones,
                "completed_milestones": completed_milestones,
                "overdue_milestones": overdue_milestones,
                "progress_pct": progress,
                "cost_per_progress": round(actual_cost_total / progress, 0) if progress > 0 else 0,
            },
            "idle_alerts": idle_alerts,
        }

    @staticmethod
    async def _detect_idle_workers(
        db: AsyncSession, project_id: str, start: date, end: date, avg_workers: float
    ) -> list[dict]:
        """检测窝工：工人数量高但工程进度停滞的天数。"""
        if avg_workers <= 0:
            return []

        logs = (await db.execute(
            select(ConstructionLog).where(
                ConstructionLog.project_id == project_id,
                ConstructionLog.log_date >= start,
                ConstructionLog.log_date <= end,
                ConstructionLog.is_deleted == False,
            ).order_by(ConstructionLog.log_date)
        )).scalars().all()

        if len(logs) < 3:
            return []

        alerts = []
        threshold = avg_workers * 1.5 if avg_workers > 0 else 5

        for i in range(2, len(logs)):
            log = logs[i]
            prev1 = logs[i - 1]
            prev2 = logs[i - 2]

            # 窝工信号1: 工人数量突然激增50%+
            if log.worker_count > threshold:
                # 检查工作内容是否有实质性变化
                work_today = (log.work_content or "").strip()
                work_prev = (prev1.work_content or "").strip()
                content_similarity = len(set(work_today) & set(work_prev)) / max(len(set(work_today) | set(work_prev)), 1)

                if content_similarity > 0.6 and work_today:
                    alerts.append({
                        "date": log.log_date.isoformat(),
                        "type": "worker_surge",
                        "level": "warning",
                        "worker_count": log.worker_count,
                        "avg_workers": round(avg_workers, 1),
                        "description": f"工人{log.worker_count}人，超出均值{round(avg_workers, 1)}人达{round(log.worker_count/avg_workers*100-100, 0)}%，但工作内容与昨日高度重复，可能存在窝工",
                        "suggestion": "核实工作分配，考虑调出闲置人员",
                    })

            # 窝工信号2: 连续3天工人数量正常但工作内容几乎相同
            work_contents = [
                (logs[j].work_content or "").strip()[:100] for j in range(i - 2, i + 1)
            ]
            if all(wc for wc in work_contents):
                wc_set = [set(wc) for wc in work_contents]
                overlap = len(wc_set[0] & wc_set[1] & wc_set[2]) / max(len(wc_set[0] | wc_set[1] | wc_set[2]), 1)
                if overlap > 0.7 and log.worker_count >= avg_workers:
                    alerts.append({
                        "date": log.log_date.isoformat(),
                        "type": "stagnant_work",
                        "level": "info",
                        "worker_count": log.worker_count,
                        "description": f"连续3天工作内容高度重复，{log.worker_count}人可能在做重复性低效工作",
                        "suggestion": "评估是否需要调整施工方案或减少人数",
                    })

        return alerts

    @staticmethod
    async def get_daily_labor_trend(
        db: AsyncSession, project_id: str, days: int = 30
    ) -> list[dict]:
        """每日人工趋势数据。"""
        end = date.today()
        start = end - timedelta(days=days)

        logs = (await db.execute(
            select(ConstructionLog).where(
                ConstructionLog.project_id == project_id,
                ConstructionLog.log_date >= start,
                ConstructionLog.is_deleted == False,
            ).order_by(ConstructionLog.log_date)
        )).scalars().all()

        log_map = {l.log_date: l for l in logs}

        labor_costs = (await db.execute(
            select(
                ProjectLine.record_date,
                func.coalesce(func.sum(ProjectLine.amount), 0),
            ).where(
                ProjectLine.project_id == project_id,
                ProjectLine.line_type == "labor",
                ProjectLine.record_date >= start,
                ProjectLine.is_deleted == False,
            ).group_by(ProjectLine.record_date)
        )).all()
        cost_map = {r[0]: float(r[1]) for r in labor_costs}

        result = []
        current = start
        while current <= end:
            log = log_map.get(current)
            result.append({
                "date": current.isoformat(),
                "worker_count": log.worker_count if log else 0,
                "has_log": log is not None,
                "work_summary": (log.work_content or "")[:80] if log else None,
                "safety_status": log.safety_status if log else None,
                "labor_cost": cost_map.get(current, 0),
            })
            current += timedelta(days=1)

        return result

    @staticmethod
    async def get_company_labor_overview(db: AsyncSession, company_id: str) -> dict:
        """全公司项目人工效率排名。"""
        end = date.today()
        start = end - timedelta(days=30)

        projects = (await db.execute(
            select(Project).where(
                Project.company_id == company_id,
                Project.is_deleted == False,
                Project.status.in_(["in_progress", "planning", "delayed"]),
            )
        )).scalars().all()

        project_summaries = []
        for p in projects:
            pid = str(p.id)

            total_workers = (await db.execute(
                select(func.coalesce(func.sum(ConstructionLog.worker_count), 0)).where(
                    ConstructionLog.project_id == pid,
                    ConstructionLog.log_date >= start,
                    ConstructionLog.is_deleted == False,
                )
            )).scalar() or 0

            labor_cost = (await db.execute(
                select(func.coalesce(func.sum(ProjectLine.amount), 0)).where(
                    ProjectLine.project_id == pid,
                    ProjectLine.line_type == "labor",
                    ProjectLine.record_date >= start,
                    ProjectLine.is_deleted == False,
                )
            )).scalar() or 0

            log_count = (await db.execute(
                select(func.count(ConstructionLog.id)).where(
                    ConstructionLog.project_id == pid,
                    ConstructionLog.log_date >= start,
                    ConstructionLog.is_deleted == False,
                )
            )).scalar() or 0

            avg_workers = int(total_workers) / max(log_count, 1)
            cost_per_worker_day = float(labor_cost) / max(int(total_workers), 1)

            project_summaries.append({
                "project_id": pid,
                "project_name": p.name,
                "status": p.status,
                "progress": float(p.progress or 0),
                "log_days_30d": log_count,
                "total_worker_days_30d": int(total_workers),
                "avg_daily_workers": round(avg_workers, 1),
                "labor_cost_30d": float(labor_cost),
                "cost_per_worker_day": round(cost_per_worker_day, 0),
            })

        project_summaries.sort(key=lambda x: x["total_worker_days_30d"], reverse=True)

        company_total_workers = sum(p["total_worker_days_30d"] for p in project_summaries)
        company_total_labor_cost = sum(p["labor_cost_30d"] for p in project_summaries)

        return {
            "period": "30d",
            "company_total_worker_days": company_total_workers,
            "company_total_labor_cost": company_total_labor_cost,
            "avg_cost_per_worker_day": round(company_total_labor_cost / max(company_total_workers, 1), 0),
            "active_projects": len(project_summaries),
            "projects": project_summaries,
        }


labor_analysis = LaborAnalysisService()
