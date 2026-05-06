"""
项目成本实时看板服务
提供项目预算执行、成本归集、利润预测等实时数据
"""
import logging
from app.core.cache import cached
from typing import Dict, List, Optional
from datetime import datetime, date
from sqlalchemy import select, func, and_, case
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class ProjectDashboardService:
    """项目成本实时看板服务"""
    
    async def get_project_cost_detail(self, db: AsyncSession, project_id: str, company_id: str) -> Dict:
        """获取项目成本详情"""
        from app.models.project.models import Project, ProjectMilestone, ProjectLine
        from app.models.finance.models import ArApRecord, FinanceVoucher
        from app.models.erp.models import Contract
        
        # 获取项目基本信息
        project_result = await db.execute(
            select(Project).where(
                Project.id == project_id,
                Project.company_id == company_id,
                Project.is_deleted == False
            )
        )
        project = project_result.scalar_one_or_none()
        if not project:
            return {"error": "项目不存在"}
        
        # 获取成本明细
        lines_result = await db.execute(
            select(ProjectLine).where(
                ProjectLine.project_id == project_id,
                ProjectLine.is_deleted == False
            )
        )
        cost_lines = lines_result.scalars().all()
        
        # 按类别汇总成本
        cost_by_category = {}
        for line in cost_lines:
            category = line.category or "未分类"
            if category not in cost_by_category:
                cost_by_category[category] = {"amount": 0, "items": []}
            cost_by_category[category]["amount"] += float(line.amount or 0)
            cost_by_category[category]["items"].append({
                "id": str(line.id),
                "description": line.description,
                "amount": float(line.amount or 0),
                "date": line.created_at.isoformat() if line.created_at else None
            })
        
        # 获取合同信息
        contracts_result = await db.execute(
            select(Contract).where(
                Contract.project_id == project_id,
                Contract.is_deleted == False
            )
        )
        contracts = contracts_result.scalars().all()
        
        contract_summary = []
        for c in contracts:
            contract_summary.append({
                "id": str(c.id),
                "name": c.name,
                "total_amount": float(c.total_amount or 0),
                "paid_amount": float(c.paid_amount or 0),
                "invoiced_amount": float(c.invoiced_amount or 0),
                "status": c.status,
            })
        
        # 计算预算执行率
        total_budget = float(project.total_budget or 0)
        actual_cost = float(project.actual_cost or 0)
        budget_usage_pct = (actual_cost / total_budget * 100) if total_budget > 0 else 0
        
        # 预测总成本（基于当前进度）
        progress = float(project.progress or 0)
        if progress > 0:
            forecast_total_cost = actual_cost / (progress / 100)
            cost_variance = forecast_total_cost - total_budget
        else:
            forecast_total_cost = actual_cost
            cost_variance = 0
        
        # 获取里程碑
        milestones_result = await db.execute(
            select(ProjectMilestone).where(
                ProjectMilestone.project_id == project_id
            ).order_by(ProjectMilestone.planned_date)
        )
        milestones = milestones_result.scalars().all()
        
        milestone_data = []
        for m in milestones:
            milestone_data.append({
                "id": str(m.id),
                "name": m.name,
                "planned_date": m.planned_date.isoformat() if m.planned_date else None,
                "actual_date": m.actual_date.isoformat() if m.actual_date else None,
                "status": m.status,
                "is_delayed": m.actual_date and m.planned_date and m.actual_date > m.planned_date
            })
        
        # 计算延期里程碑数量
        delayed_count = sum(1 for m in milestone_data if m.get("is_delayed"))
        
        return {
            "project_id": project_id,
            "project_name": project.name,
            "project_code": project.project_code,
            "status": project.status,
            "progress": progress,
            "total_budget": total_budget,
            "actual_cost": round(actual_cost, 2),
            "budget_usage_pct": round(budget_usage_pct, 2),
            "forecast_total_cost": round(forecast_total_cost, 2),
            "cost_variance": round(cost_variance, 2),
            "variance_status": "超支" if cost_variance > 0 else "结余",
            "cost_by_category": cost_by_category,
            "contracts": contract_summary,
            "milestones": milestone_data,
            "delayed_milestones": delayed_count,
            "total_milestones": len(milestone_data),
            "last_updated": datetime.now().isoformat(),
        }
    
    async def get_company_projects_summary(self, db: AsyncSession, company_id: str) -> Dict:
        """获取公司所有项目的汇总看板"""
        from app.models.project.models import Project
        
        projects_result = await db.execute(
            select(Project).where(
                Project.company_id == company_id,
                Project.is_deleted == False
            )
        )
        projects = projects_result.scalars().all()
        
        total_budget = 0
        total_actual = 0
        active_projects = 0
        delayed_projects = 0
        
        project_list = []
        for p in projects:
            budget = float(p.total_budget or 0)
            actual = float(p.actual_cost or 0)
            usage = (actual / budget * 100) if budget > 0 else 0
            
            total_budget += budget
            total_actual += actual
            
            if p.status == "active":
                active_projects += 1
            
            # 检查是否延期（简化：检查end_date是否已过）
            is_delayed = False
            if p.end_date and p.status not in ["completed", "cancelled"]:
                if isinstance(p.end_date, date) and p.end_date < date.today():
                    is_delayed = True
                    delayed_projects += 1
            
            project_list.append({
                "id": str(p.id),
                "name": p.name,
                "code": p.project_code,
                "status": p.status,
                "progress": float(p.progress or 0),
                "budget": budget,
                "actual_cost": round(actual, 2),
                "usage_pct": round(usage, 2),
                "is_delayed": is_delayed,
                "end_date": p.end_date.isoformat() if p.end_date else None,
            })
        
        # 按预算使用率排序
        project_list.sort(key=lambda x: x["usage_pct"], reverse=True)
        
        return {
            "company_id": company_id,
            "total_projects": len(projects),
            "active_projects": active_projects,
            "delayed_projects": delayed_projects,
            "total_budget": round(total_budget, 2),
            "total_actual_cost": round(total_actual, 2),
            "overall_usage_pct": round((total_actual / total_budget * 100) if total_budget > 0 else 0, 2),
            "projects": project_list,
            "high_risk_projects": [p for p in project_list if p["usage_pct"] > 90 and p["status"] != "completed"],
        }


# 全局实例
project_dashboard = ProjectDashboardService()
