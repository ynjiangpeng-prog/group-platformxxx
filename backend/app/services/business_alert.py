"""
核心业务告警服务
实时监控关键业务指标，生成告警
"""
import logging
from app.core.cache import cached
from app.services.webhook_service import webhook_service
from typing import Dict, List, Optional
from datetime import datetime, timedelta, date
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class BusinessAlertService:
    """业务告警服务"""
    
    @cached(ttl=60, prefix="alerts")
    async def check_all_alerts(self, db: AsyncSession, company_id: str) -> List[Dict]:
        """检查所有告警"""
        alerts = []
        
        # 1. 超预算告警
        alerts.extend(await self._check_budget_overrun(db, company_id))
        
        # 2. 合同到期告警
        alerts.extend(await self._check_contract_expiry(db, company_id))
        
        # 3. 设备离线告警
        alerts.extend(await self._check_device_offline(db, company_id))
        
        # 4. 应收逾期告警
        alerts.extend(await self._check_overdue_receivables(db, company_id))
        
        # 5. 项目延期告警
        alerts.extend(await self._check_project_delay(db, company_id))
        
        # 按严重程度排序
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        alerts.sort(key=lambda x: severity_order.get(x.get("severity", "low"), 99))
        
        # 发送关键告警通知
        critical_alerts = [a for a in alerts if a.get("severity") in ["critical", "high"]]
        if critical_alerts:
            import asyncio
            asyncio.create_task(webhook_service.send_batch_alerts(critical_alerts[:5]))
        
        return alerts
    
    async def _check_budget_overrun(self, db: AsyncSession, company_id: str) -> List[Dict]:
        """检查超预算项目"""
        from app.models.project.models import Project
        
        alerts = []
        today = date.today()
        
        # 检查预算使用率 > 90% 或实际成本 > 预算
        projects = (await db.execute(
            select(Project).where(
                Project.company_id == company_id,
                Project.is_deleted == False,
                Project.status.in_(["active", "in_progress", "draft"]),
                Project.total_budget > 0
            )
        )).scalars().all()
        
        for p in projects:
            budget = float(p.total_budget or 0)
            actual = float(p.actual_cost or 0)
            usage_pct = (actual / budget * 100) if budget > 0 else 0
            
            if actual > budget:
                # 已超预算
                overrun_amount = actual - budget
                overrun_pct = (overrun_amount / budget * 100) if budget > 0 else 0
                alerts.append({
                    "id": f"budget_overrun_{p.id}",
                    "type": "budget_overrun",
                    "severity": "critical",
                    "title": f"项目《{p.name}》已超预算",
                    "message": f"预算: ¥{budget:,.2f}, 实际: ¥{actual:,.2f}, 超支: ¥{overrun_amount:,.2f} ({overrun_pct:.1f}%)",
                    "project_id": str(p.id),
                    "project_name": p.name,
                    "data": {
                        "budget": budget,
                        "actual_cost": actual,
                        "overrun_amount": overrun_amount,
                        "overrun_pct": round(overrun_pct, 2)
                    },
                    "created_at": today.isoformat(),
                    "suggestion": "立即冻结非必要支出，评估是否需要追加预算"
                })
            elif usage_pct > 90:
                # 即将超预算
                alerts.append({
                    "id": f"budget_warning_{p.id}",
                    "type": "budget_warning",
                    "severity": "high",
                    "title": f"项目《{p.name}》预算使用率超90%",
                    "message": f"预算: ¥{budget:,.2f}, 已用: ¥{actual:,.2f} ({usage_pct:.1f}%)",
                    "project_id": str(p.id),
                    "project_name": p.name,
                    "data": {
                        "budget": budget,
                        "actual_cost": actual,
                        "usage_pct": round(usage_pct, 2)
                    },
                    "created_at": today.isoformat(),
                    "suggestion": "严格控制后续支出，准备预算调整方案"
                })
        
        return alerts
    
    async def _check_contract_expiry(self, db: AsyncSession, company_id: str) -> List[Dict]:
        """检查合同到期"""
        from app.models.erp.models import Contract
        
        alerts = []
        today = date.today()
        
        # 7天内到期的合同
        warning_date = today + timedelta(days=7)
        
        contracts = (await db.execute(
            select(Contract).where(
                Contract.company_id == company_id,
                Contract.is_deleted == False,
                Contract.status.in_(["active", "performing"]),
                Contract.end_date <= warning_date,
                Contract.end_date >= today
            )
        )).scalars().all()
        
        for c in contracts:
            days_left = (c.end_date - today).days
            if days_left <= 3:
                severity = "critical"
                title = f"【紧急】合同《{c.name}》即将到期（{days_left}天）"
            elif days_left <= 7:
                severity = "high"
                title = f"合同《{c.name}》即将到期（{days_left}天）"
            else:
                severity = "medium"
                title = f"合同《{c.name}》即将到期（{days_left}天）"
            
            alerts.append({
                "id": f"contract_expiry_{c.id}",
                "type": "contract_expiry",
                "severity": severity,
                "title": title,
                "message": f"合同编号: {c.contract_no}, 到期日: {c.end_date}, 金额: ¥{float(c.total_amount or 0):,.2f}",
                "contract_id": str(c.id),
                "contract_name": c.name,
                "data": {
                    "contract_no": c.contract_no,
                    "end_date": str(c.end_date),
                    "total_amount": float(c.total_amount or 0),
                    "days_left": days_left,
                    "counterparty": c.party_a or c.counterparty or "未指定"
                },
                "created_at": today.isoformat(),
                "suggestion": f"{'请立即联系对方确认续签或终止！' if days_left <= 3 else '请安排续签谈判或终止事宜'}"
            })
        
        # 已过期的合同
        overdue_contracts = (await db.execute(
            select(Contract).where(
                Contract.company_id == company_id,
                Contract.is_deleted == False,
                Contract.status.in_(["active", "performing"]),
                Contract.end_date < today
            )
        )).scalars().all()
        
        for c in overdue_contracts:
            overdue_days = (today - c.end_date).days
            alerts.append({
                "id": f"contract_overdue_{c.id}",
                "type": "contract_overdue",
                "severity": "critical",
                "title": f"【严重】合同《{c.name}》已过期{overdue_days}天",
                "message": f"合同编号: {c.contract_no}, 过期日期: {c.end_date}",
                "contract_id": str(c.id),
                "contract_name": c.name,
                "data": {
                    "contract_no": c.contract_no,
                    "overdue_days": overdue_days,
                    "end_date": str(c.end_date)
                },
                "created_at": today.isoformat(),
                "suggestion": "请立即处理！1)续签 2)终止 3)结算尾款"
            })
        
        return alerts
    
    async def _check_device_offline(self, db: AsyncSession, company_id: str) -> List[Dict]:
        """检查设备离线"""
        from app.models.charging.models import ChargingDevice, ChargingStation
        
        alerts = []
        today = date.today()
        
        # 检查离线超过24小时的设备
        offline_devices = (await db.execute(
            select(ChargingDevice, ChargingStation).join(
                ChargingStation, ChargingStation.id == ChargingDevice.station_id
            ).where(
                ChargingDevice.company_id == company_id,
                ChargingDevice.is_deleted == False,
                ChargingDevice.status == "offline"
            )
        )).all()
        
        for device, station in offline_devices:
            # 估算收入损失（假设每天500元）
            daily_loss = float(getattr(device, 'daily_revenue', 500) or 500)
            
            alerts.append({
                "id": f"device_offline_{device.id}",
                "type": "device_offline",
                "severity": "high",
                "title": f"设备离线: {station.name} - {device.device_code}",
                "message": f"充电设备已离线，影响站点运营，预计日损失收入约¥{daily_loss}",
                "device_id": str(device.id),
                "station_id": str(station.id),
                "station_name": station.name,
                "data": {
                    "device_code": device.device_code,
                    "station_name": station.name,
                    "daily_loss": daily_loss
                },
                "created_at": today.isoformat(),
                "suggestion": "请立即联系运维人员检查设备"
            })
        
        return alerts
    
    async def _check_overdue_receivables(self, db: AsyncSession, company_id: str) -> List[Dict]:
        """检查应收逾期"""
        from app.models.finance.models import ArApRecord
        
        alerts = []
        today = date.today()
        
        # 逾期超过30天的应收
        overdue_ar = (await db.execute(
            select(ArApRecord).where(
                ArApRecord.company_id == company_id,
                ArApRecord.is_deleted == False,
                ArApRecord.type == "ar",
                ArApRecord.due_date < today - timedelta(days=30),
                ArApRecord.remaining_amount > 0
            )
        )).scalars().all()
        
        for ar in overdue_ar:
            overdue_days = (today - ar.due_date).days
            severity = "critical" if overdue_days > 60 else "high"
            
            alerts.append({
                "id": f"overdue_ar_{ar.id}",
                "type": "overdue_receivable",
                "severity": severity,
                "title": f"应收款逾期{overdue_days}天: {ar.counterparty}",
                "message": f"应收金额: ¥{float(ar.remaining_amount):,.2f}, 到期日: {ar.due_date}",
                "arap_id": str(ar.id),
                "data": {
                    "counterparty": ar.counterparty,
                    "remaining_amount": float(ar.remaining_amount),
                    "overdue_days": overdue_days,
                    "due_date": str(ar.due_date)
                },
                "created_at": today.isoformat(),
                "suggestion": "请立即催收，避免坏账风险"
            })
        
        return alerts
    
    async def _check_project_delay(self, db: AsyncSession, company_id: str) -> List[Dict]:
        """检查项目延期"""
        from app.models.project.models import Project
        
        alerts = []
        today = date.today()
        
        # 延期超过7天的项目
        delayed_projects = (await db.execute(
            select(Project).where(
                Project.company_id == company_id,
                Project.is_deleted == False,
                Project.status.in_(["active", "in_progress"]),
                Project.end_date < today - timedelta(days=7)
            )
        )).scalars().all()
        
        for p in delayed_projects:
            delay_days = (today - p.end_date).days
            alerts.append({
                "id": f"project_delay_{p.id}",
                "type": "project_delay",
                "severity": "high",
                "title": f"项目《{p.name}》已延期{delay_days}天",
                "message": f"计划完成日期: {p.end_date}, 当前进度: {p.progress}%",
                "project_id": str(p.id),
                "project_name": p.name,
                "data": {
                    "delay_days": delay_days,
                    "end_date": str(p.end_date),
                    "progress": float(p.progress or 0)
                },
                "created_at": today.isoformat(),
                "suggestion": "立即评估延期原因，安排赶工或调整计划"
            })
        
        return alerts


# 全局实例
business_alert = BusinessAlertService()
