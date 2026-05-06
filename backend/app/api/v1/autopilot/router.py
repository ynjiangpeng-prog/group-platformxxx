"""
Autopilot API Router - 自动驾驶中心API
老板一站式接口：仪表盘、告警、报告、指令
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.services.autopilot import dashboard_service, alert_engine, report_service, command_service

router = APIRouter(prefix="/autopilot", tags=["自动驾驶中心"])


# ========== 仪表盘 ==========

@router.get("/dashboard")
async def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """老板仪表盘 - 一屏看全公司经营状态"""
    data = await dashboard_service.get_full_dashboard(db, str(current_user.company_id))
    return data


# ========== 智能告警 ==========

@router.get("/alerts")
async def get_alerts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取当前所有活跃告警"""
    alerts = await alert_engine.get_all_alerts(db, str(current_user.company_id))
    return {"alerts": alerts, "total": len(alerts)}


# ========== 每日简报 ==========

@router.get("/reports/daily")
async def get_daily_briefing(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取AI生成的每日经营简报"""
    report = await report_service.generate_daily_briefing(db, str(current_user.company_id))
    return report


# ========== 周报 ==========

@router.get("/reports/weekly")
async def get_weekly_report(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取AI生成的周度经营报告"""
    report = await report_service.generate_weekly_report(db, str(current_user.company_id))
    return report


# ========== 老板指令中心 ==========

class CommandRequest(BaseModel):
    command: str


@router.post("/command")
async def process_command(
    req: CommandRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """老板自然语言指令 - 说一句话，AI帮你查数据"""
    result = await command_service.process_command(
        db, str(current_user.company_id), req.command
    )
    return result


# ========== 快速摘要 ==========

@router.get("/summary")
async def get_quick_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """快速经营摘要 - 一句话概括当前状态"""
    alerts = await alert_engine.get_all_alerts(db, str(current_user.company_id))
    dashboard = await dashboard_service.get_full_dashboard(db, str(current_user.company_id))

    critical = [a for a in alerts if a.get("severity") == "critical"]
    warnings = [a for a in alerts if a.get("severity") == "warning"]

    m = dashboard.get("quick_metrics", {})

    return {
        "status": dashboard.get("company_status", "unknown"),
        "cash_balance": m.get("cash_balance", 0),
        "today_net": m.get("today_net", 0),
        "month_profit": m.get("month_profit", 0),
        "critical_count": len(critical),
        "warning_count": len(warnings),
        "critical_items": [a["title"] for a in critical],
        "warning_items": [a["title"] for a in warnings],
    }


# Import executive router
from app.api.v1.autopilot.executive_router import router as executive_router
router.include_router(executive_router)
