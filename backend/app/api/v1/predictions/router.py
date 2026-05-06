"""
AI经营预测API路由
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.services.ai_prediction_service import ai_prediction

router = APIRouter(prefix='/predictions', tags=['AI经营预测'])

@router.get('/revenue')
async def predict_revenue(
    months_ahead: int = 3,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """预测未来收入"""
    return await ai_prediction.predict_revenue(
        db, str(current_user.company_id), months_ahead
    )

@router.get('/cost')
async def predict_cost(
    months_ahead: int = 3,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """预测未来成本"""
    return await ai_prediction.predict_cost(
        db, str(current_user.company_id), months_ahead
    )

@router.get('/cash-flow')
async def predict_cash_flow(
    months_ahead: int = 3,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """预测现金流"""
    return await ai_prediction.predict_cash_flow(
        db, str(current_user.company_id), months_ahead
    )

@router.get('/dashboard')
async def prediction_dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """预测仪表盘（综合视图）"""
    revenue = await ai_prediction.predict_revenue(db, str(current_user.company_id), 3)
    cost = await ai_prediction.predict_cost(db, str(current_user.company_id), 3)
    cash_flow = await ai_prediction.predict_cash_flow(db, str(current_user.company_id), 3)
    
    # 计算风险指标
    total_predicted_revenue = sum(p['amount'] for p in revenue.get('predictions', []))
    total_predicted_cost = sum(p['amount'] for p in cost.get('predictions', []))
    
    risk_score = 0
    if total_predicted_cost > 0:
        ratio = total_predicted_revenue / total_predicted_cost
        if ratio < 1.0:
            risk_score = 80 + (1.0 - ratio) * 20
        elif ratio < 1.2:
            risk_score = 50 + (1.2 - ratio) * 150
        else:
            risk_score = max(0, 50 - (ratio - 1.2) * 50)
    
    return {
        'company_id': str(current_user.company_id),
        'summary': {
            'total_predicted_revenue': round(total_predicted_revenue, 2),
            'total_predicted_cost': round(total_predicted_cost, 2),
            'predicted_net': round(total_predicted_revenue - total_predicted_cost, 2),
            'risk_score': round(min(100, risk_score), 1),
            'risk_level': 'high' if risk_score > 70 else 'medium' if risk_score > 40 else 'low'
        },
        'revenue_prediction': revenue,
        'cost_prediction': cost,
        'cash_flow_prediction': cash_flow,
        'generated_at': revenue.get('generated_at')
    }
