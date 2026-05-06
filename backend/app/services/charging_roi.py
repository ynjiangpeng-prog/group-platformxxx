"""
充电站ROI自动计算服务
自动计算投资回报率、投资回收期、月度利润等核心指标
"""
import logging
from app.core.cache import cached
from typing import Dict, Optional
from datetime import datetime, timedelta, date
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class ChargingROIService:
    """充电站ROI计算服务"""
    
    async def calculate_station_roi(self, db: AsyncSession, station_id: str, company_id: str) -> Dict:
        """计算单个充电站的ROI指标"""
        from app.models.charging.models import ChargingStation, ChargingOrder, ChargingDevice
        from app.models.project.models import Project
        
        # 获取站点信息
        station_result = await db.execute(
            select(ChargingStation).where(
                ChargingStation.id == station_id,
                ChargingStation.company_id == company_id
            )
        )
        station = station_result.scalar_one_or_none()
        if not station:
            return {"error": "站点不存在"}
        
        # 获取项目投资
        total_investment = 0
        if station.project_id:
            project_result = await db.execute(
                select(Project).where(Project.id == station.project_id)
            )
            project = project_result.scalar_one_or_none()
            if project:
                total_investment = float(project.actual_cost or 0)
        
        # 计算月度营收（最近30天）
        month_ago = datetime.now() - timedelta(days=30)
        revenue_result = await db.execute(
            select(func.coalesce(func.sum(ChargingOrder.total_amount), 0))
            .where(
                ChargingOrder.station_id == station_id,
                ChargingOrder.pay_status == "paid",
                ChargingOrder.start_time >= month_ago
            )
        )
        monthly_revenue = float(revenue_result.scalar() or 0)
        
        # 计算月度成本
        # 电费（按营收的30%估算，实际应根据峰谷电价计算）
        electricity_cost = monthly_revenue * 0.30
        # 租金
        monthly_rent = float(getattr(station, 'monthly_rent', 0) or 0)
        # 人工维护（估算）
        labor_cost = 3000  # 每月固定3000元维护费
        # 设备折旧（按5年直线折旧）
        equipment_cost = total_investment * 0.6  # 设备占60%
        monthly_depreciation = equipment_cost / 60  # 5年=60个月
        
        total_monthly_cost = electricity_cost + monthly_rent + labor_cost + monthly_depreciation
        monthly_profit = monthly_revenue - total_monthly_cost
        
        # 计算利用率
        device_result = await db.execute(
            select(func.count(ChargingDevice.id)).where(ChargingDevice.station_id == station_id)
        )
        device_count = device_result.scalar() or 1
        
        # 假设每桩每天可服务20辆车，每车平均30度电
        daily_capacity = device_count * 20 * 30  # 日理论最大电量
        monthly_orders_result = await db.execute(
            select(func.coalesce(func.sum(ChargingOrder.charging_kwh), 0))
            .where(
                ChargingOrder.station_id == station_id,
                ChargingOrder.start_time >= month_ago
            )
        )
        monthly_kwh = float(monthly_orders_result.scalar() or 0)
        utilization_rate = (monthly_kwh / (daily_capacity * 30)) * 100 if daily_capacity > 0 else 0
        
        # 计算ROI
        roi_percentage = (monthly_profit * 12 / total_investment * 100) if total_investment > 0 else 0
        payback_months = total_investment / monthly_profit if monthly_profit > 0 else float('inf')
        
        return {
            "station_id": station_id,
            "station_name": station.name,
            "total_investment": round(total_investment, 2),
            "monthly_revenue": round(monthly_revenue, 2),
            "monthly_cost": round(total_monthly_cost, 2),
            "monthly_profit": round(monthly_profit, 2),
            "electricity_cost": round(electricity_cost, 2),
            "rent_cost": round(monthly_rent, 2),
            "labor_cost": labor_cost,
            "depreciation": round(monthly_depreciation, 2),
            "device_count": device_count,
            "monthly_kwh": round(monthly_kwh, 2),
            "utilization_rate": round(utilization_rate, 2),
            "roi_annual_percentage": round(roi_percentage, 2),
            "payback_months": round(payback_months, 1) if payback_months != float('inf') else None,
            "status": "盈利" if monthly_profit > 0 else "亏损",
            "calculation_date": date.today().isoformat(),
        }
    
    async def get_company_roi_summary(self, db: AsyncSession, company_id: str) -> Dict:
        """获取公司所有充电站的ROI汇总"""
        from app.models.charging.models import ChargingStation
        
        stations_result = await db.execute(
            select(ChargingStation).where(
                ChargingStation.company_id == company_id,
                ChargingStation.is_deleted == False
            )
        )
        stations = stations_result.scalars().all()
        
        station_rois = []
        total_investment = 0
        total_monthly_revenue = 0
        total_monthly_profit = 0
        
        for station in stations:
            roi = await self.calculate_station_roi(db, str(station.id), company_id)
            if "error" not in roi:
                station_rois.append(roi)
                total_investment += roi["total_investment"]
                total_monthly_revenue += roi["monthly_revenue"]
                total_monthly_profit += roi["monthly_profit"]
        
        # 排序：按月度利润降序
        station_rois.sort(key=lambda x: x["monthly_profit"], reverse=True)
        
        # 计算公司整体ROI
        company_roi = (total_monthly_profit * 12 / total_investment * 100) if total_investment > 0 else 0
        
        return {
            "company_id": company_id,
            "total_stations": len(stations),
            "active_stations": len([s for s in station_rois if s["monthly_revenue"] > 0]),
            "total_investment": round(total_investment, 2),
            "total_monthly_revenue": round(total_monthly_revenue, 2),
            "total_monthly_profit": round(total_monthly_profit, 2),
            "company_roi_annual": round(company_roi, 2),
            "payback_months_avg": round(total_investment / total_monthly_profit, 1) if total_monthly_profit > 0 else None,
            "stations": station_rois,
            "top_performer": station_rois[0] if station_rois else None,
            "worst_performer": station_rois[-1] if station_rois else None,
        }


# 全局实例
charging_roi = ChargingROIService()
