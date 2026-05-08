from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.models.project.models import Project, ConstructionLog
from app.services.labor_analysis import labor_analysis

router = APIRouter(prefix="/project/labor", tags=["人工效率分析"])


@router.get("/company-overview")
async def company_labor_overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """全公司项目人工效率排名：哪些项目花钱多、效率低，一目了然。"""
    return await labor_analysis.get_company_labor_overview(db, str(current_user.company_id))


@router.get("/project/{project_id}/dashboard")
async def project_labor_dashboard(
    project_id: str,
    days: int = Query(30, ge=7, le=90, description="分析天数"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """单项目人工效率看板：工日、成本、窝工预警、预算偏差。"""
    project = (await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.company_id == current_user.company_id,
            Project.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not project:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="项目不存在")

    return await labor_analysis.get_project_labor_summary(db, project_id, days)


@router.get("/project/{project_id}/daily-trend")
async def project_labor_trend(
    project_id: str,
    days: int = Query(30, ge=7, le=90),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """项目每日人工趋势：工人数量、成本变化曲线。"""
    return await labor_analysis.get_daily_labor_trend(db, project_id, days)


@router.get("/project/{project_id}/idle-alerts")
async def project_idle_alerts(
    project_id: str,
    days: int = Query(30, ge=7, le=90),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """项目窝工预警列表：发现人来了活没干的情况。"""
    from datetime import timedelta
    end = date.today()
    start = end - timedelta(days=days)

    avg = (await db.execute(
        select(func.avg(ConstructionLog.worker_count)).where(
            ConstructionLog.project_id == project_id,
            ConstructionLog.log_date >= start,
            ConstructionLog.is_deleted == False,
        )
    )).scalar() or 0

    alerts = await labor_analysis._detect_idle_workers(db, project_id, start, end, float(avg))
    return {"project_id": project_id, "period_days": days, "alerts": alerts, "alert_count": len(alerts)}
