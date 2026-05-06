"""
AI经营预测分析服务（简化版）
基于现有数据模型进行趋势预测
"""
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
import logging

logger = logging.getLogger(__name__)

class AIPredictionService:
    """AI经营预测服务"""
    
    async def predict_revenue(self, db: AsyncSession, company_id: str, 
                             months_ahead: int = 3) -> Dict:
        """预测未来收入 - 基于项目历史数据"""
        from app.models.project.models import Project
        
        # 获取项目历史预算和实际成本
        result = await db.execute(
            select(
                func.count(Project.id).label('count'),
                func.coalesce(func.sum(Project.total_budget), 0).label('total_budget'),
                func.coalesce(func.sum(Project.actual_cost), 0).label('total_actual')
            ).where(
                Project.company_id == company_id,
                Project.is_deleted == False
            )
        )
        
        row = result.first()
        total_budget = float(row.total_budget or 0)
        total_actual = float(row.total_actual or 0)
        project_count = row.count or 0
        
        # 基于历史平均预算进行预测
        avg_budget = total_budget / project_count if project_count > 0 else 0
        
        predictions = []
        for i in range(months_ahead):
            future_date = datetime.now() + timedelta(days=30 * (i + 1))
            # 保守预测：基于历史平均值，每月递减5%
            predicted = avg_budget * (0.95 ** i)
            predictions.append({
                'month': future_date.strftime('%Y-%m'),
                'amount': round(predicted, 2),
                'confidence': 'medium'
            })
        
        return {
            'company_id': company_id,
            'prediction_type': 'revenue',
            'historical_summary': {
                'total_projects': project_count,
                'total_budget': total_budget,
                'total_actual': total_actual
            },
            'predictions': predictions,
            'confidence': 'medium',
            'method': 'project_based_forecast',
            'generated_at': datetime.now().isoformat()
        }
    
    async def predict_cost(self, db: AsyncSession, company_id: str, 
                          months_ahead: int = 3) -> Dict:
        """预测未来成本"""
        from app.models.project.models import Project
        
        result = await db.execute(
            select(
                func.count(Project.id).label('count'),
                func.coalesce(func.sum(Project.actual_cost), 0).label('total_actual'),
                func.coalesce(func.avg(Project.actual_cost), 0).label('avg_actual')
            ).where(
                Project.company_id == company_id,
                Project.is_deleted == False,
                Project.actual_cost > 0
            )
        )
        
        row = result.first()
        total_actual = float(row.total_actual or 0)
        avg_actual = float(row.avg_actual or 0)
        project_count = row.count or 0
        
        predictions = []
        for i in range(months_ahead):
            future_date = datetime.now() + timedelta(days=30 * (i + 1))
            predicted = avg_actual * (1.02 ** i)  # 成本预计每月增长2%
            predictions.append({
                'month': future_date.strftime('%Y-%m'),
                'amount': round(predicted, 2),
                'confidence': 'medium'
            })
        
        return {
            'company_id': company_id,
            'prediction_type': 'cost',
            'historical_summary': {
                'total_projects': project_count,
                'total_actual_cost': total_actual,
                'avg_cost': avg_actual
            },
            'predictions': predictions,
            'confidence': 'medium',
            'method': 'project_cost_forecast',
            'generated_at': datetime.now().isoformat()
        }
    
    async def predict_cash_flow(self, db: AsyncSession, company_id: str, 
                               months_ahead: int = 3) -> Dict:
        """预测现金流"""
        revenue_pred = await self.predict_revenue(db, company_id, months_ahead)
        cost_pred = await self.predict_cost(db, company_id, months_ahead)
        
        cash_flow = []
        for i in range(months_ahead):
            rev = revenue_pred['predictions'][i]['amount'] if i < len(revenue_pred['predictions']) else 0
            cost = cost_pred['predictions'][i]['amount'] if i < len(cost_pred['predictions']) else 0
            
            future_date = datetime.now() + timedelta(days=30 * (i + 1))
            month_str = future_date.strftime('%Y-%m')
            
            cash_flow.append({
                'month': month_str,
                'predicted_revenue': round(rev, 2),
                'predicted_cost': round(cost, 2),
                'predicted_net': round(rev - cost, 2),
                'risk_level': 'high' if rev < cost else 'medium' if rev < cost * 1.2 else 'low'
            })
        
        return {
            'company_id': company_id,
            'prediction_type': 'cash_flow',
            'predictions': cash_flow,
            'confidence': 'medium',
            'generated_at': datetime.now().isoformat()
        }

# 全局实例
ai_prediction = AIPredictionService()
