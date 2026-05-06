"""
充电站ROI API路由
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.services.charging_roi import charging_roi

router = APIRouter(prefix="/charging/roi", tags=["充电站ROI"])


@router.get("/station/{station_id}")
async def get_station_roi(
    station_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取单个充电站ROI"""
    return await charging_roi.calculate_station_roi(
        db, station_id, str(current_user.company_id)
    )


@router.get("/summary")
async def get_company_roi_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取公司充电站ROI汇总"""
    return await charging_roi.get_company_roi_summary(
        db, str(current_user.company_id)
    )
