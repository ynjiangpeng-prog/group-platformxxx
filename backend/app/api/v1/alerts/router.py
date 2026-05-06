"""
业务告警 API路由
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.services.business_alert import business_alert

router = APIRouter(prefix="/alerts", tags=["业务告警"])


@router.get("/active")
async def get_active_alerts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取当前所有活跃告警"""
    alerts = await business_alert.check_all_alerts(
        db, str(current_user.company_id)
    )
    return {
        "alerts": alerts,
        "total": len(alerts),
        "critical_count": len([a for a in alerts if a["severity"] == "critical"]),
        "high_count": len([a for a in alerts if a["severity"] == "high"]),
        "medium_count": len([a for a in alerts if a["severity"] == "medium"]),
        "by_type": {}
    }


@router.get("/by-type/{alert_type}")
async def get_alerts_by_type(
    alert_type: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """按类型获取告警"""
    alerts = await business_alert.check_all_alerts(
        db, str(current_user.company_id)
    )
    filtered = [a for a in alerts if a["type"] == alert_type]
    return {
        "type": alert_type,
        "alerts": filtered,
        "total": len(filtered)
    }
