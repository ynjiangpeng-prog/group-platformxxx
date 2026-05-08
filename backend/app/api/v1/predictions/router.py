"""AI经营预测API路由 — 基于Prophet的时序预测"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.services.business_digital_twin.prediction_engine import prediction_engine

router = APIRouter(prefix='/predictions', tags=['AI经营预测'])


@router.get('/revenue')
async def predict_revenue(
    months_ahead: int = Query(6, ge=1, le=12),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """预测未来收入"""
    return await prediction_engine.predict_revenue(
        db, str(current_user.company_id), months_ahead
    )


@router.get('/cost')
async def predict_cost(
    months_ahead: int = Query(6, ge=1, le=12),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """预测未来成本"""
    return await prediction_engine.predict_cost(
        db, str(current_user.company_id), months_ahead
    )


@router.get('/cash-flow')
async def predict_cash_flow(
    months_ahead: int = Query(6, ge=1, le=12),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """预测现金流"""
    return await prediction_engine.predict_cash_flow(
        db, str(current_user.company_id), months_ahead
    )


@router.get('/project-risk')
async def predict_project_risk(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """项目风险预测"""
    return await prediction_engine.predict_project_risk(
        db, str(current_user.company_id)
    )


@router.get('/dashboard')
async def prediction_dashboard(
    months_ahead: int = Query(3, ge=1, le=12),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """预测仪表盘（综合视图）"""
    return await prediction_engine.get_dashboard(
        db, str(current_user.company_id), months_ahead
    )
