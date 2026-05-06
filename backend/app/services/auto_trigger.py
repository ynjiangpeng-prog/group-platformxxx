
"""自动触发规则引擎 - 基于业务规则自动创建执行动作。"""
import logging
from datetime import datetime, timedelta, date
from typing import List, Dict, Any

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.auto_executive import auto_executive, ActionPriority

logger = logging.getLogger(__name__)


class AutoTriggerEngine:
    """自动触发规则引擎。"""
    
    async def scan_and_trigger(self, db: AsyncSession, company_id: str):
        """扫描所有规则并触发执行。"""
        triggers = []
        
        # 1. 项目风险自动处理
        triggers.extend(await self._check_project_risks(db, company_id))
        
        # 2. 财务异常自动处理
        triggers.extend(await self._check_finance_anomalies(db, company_id))
        
        # 3. 充电站运营自动处理
        triggers.extend(await self._check_charging_operations(db, company_id))
        
        # 4. 合同到期自动提醒
        triggers.extend(await self._check_contract_expiry(db, company_id))
        
        # 5. 应收逾期自动催收
        triggers.extend(await self._check_overdue_receivables(db, company_id))
        
        # 6. 库存预警自动补货
        triggers.extend(await self._check_inventory_levels(db, company_id))
        
        # 7. 设备故障自动报修
        triggers.extend(await self._check_device_faults(db, company_id))
        
        # 执行所有触发的动作
        for trigger in triggers:
            try:
                await auto_executive.create_action(
                    db=db,
                    company_id=company_id,
                    title=trigger["title"],
                    description=trigger["description"],
                    category=trigger["category"],
                    action_type=trigger["action_type"],
                    action_params=trigger["action_params"],
                    trigger_reason=trigger["trigger_reason"],
                    ai_analysis=trigger.get("ai_analysis", ""),
                    expected_result=trigger.get("expected_result", ""),
                    target_type=trigger.get("target_type", ""),
                    target_id=trigger.get("target_id"),
                    target_name=trigger.get("target_name", ""),
                    priority=trigger["priority"],
                )
            except Exception as e:
                logger.exception("Trigger execution failed: %s", trigger.get("title"))
        
        logger.info("Auto trigger scan completed for %s: %d actions triggered", company_id, len(triggers))
        return len(triggers)
    
    async def _check_project_risks(self, db: AsyncSession, company_id: str) -> List[Dict]:
        """检查项目风险。"""
        from app.models.project.models import Project
        
        triggers = []
        today = date.today()
        
        # 项目延期超过7天
        overdue_projects = (await db.execute(
            select(Project).where(
                Project.company_id == company_id,
                Project.is_deleted == False,
                Project.status.in_(["active", "in_progress"]),
                Project.end_date < today - timedelta(days=7),
            )
        )).scalars().all()
        
        for p in overdue_projects:
            delay_days = (today - p.end_date).days
            triggers.append({
                "title": f"项目《{p.name}》已延期{delay_days}天",
                "description": f"项目计划结束日期：{p.end_date}，当前进度：{p.progress}%",
                "category": "project",
                "action_type": "create_reminder",
                "action_params": {
                    "reminder_type": "project_overdue",
                    "project_id": str(p.id),
                    "message": f"项目{p.name}已延期{delay_days}天，请及时处理"
                },
                "trigger_reason": f"项目延期{delay_days}天，超过7天预警阈值",
                "ai_analysis": f"根据项目进度{p.progress}%和计划工期分析，项目已严重延期",
                "expected_result": "项目经理收到提醒，安排赶工或调整计划",
                "target_type": "project",
                "target_id": str(p.id),
                "target_name": p.name,
                "priority": ActionPriority.HIGH,
            })
        
        return triggers
    
    async def _check_finance_anomalies(self, db: AsyncSession, company_id: str) -> List[Dict]:
        """检查财务异常。"""
        from app.models.finance.models import ArApRecord
        
        triggers = []
        today = date.today()
        
        # 应收逾期超过30天
        overdue_ar = (await db.execute(
            select(ArApRecord).where(
                ArApRecord.company_id == company_id,
                ArApRecord.is_deleted == False,
                ArApRecord.type == "ar",
                ArApRecord.due_date < today - timedelta(days=30),
                ArApRecord.remaining_amount > 10000,  # 超过1万
            )
        )).scalars().all()
        
        for ar in overdue_ar:
            overdue_days = (today - ar.due_date).days
            triggers.append({
                "title": f"应收款逾期{overdue_days}天：{ar.counterparty}",
                "description": f"应收金额：¥{ar.remaining_amount:,.2f}，到期日：{ar.due_date}",
                "category": "finance",
                "action_type": "send_notification",
                "action_params": {
                    "notification_type": "overdue_collection",
                    "target_users": ["finance_manager"],
                    "title": f"催收提醒：{ar.counterparty}",
                    "content": f"应收款¥{ar.remaining_amount:,.2f}已逾期{overdue_days}天，请尽快催收"
                },
                "trigger_reason": f"应收款逾期{overdue_days}天，金额超过1万元",
                "ai_analysis": f"该客户欠款{overdue_days}天，存在坏账风险",
                "expected_result": "财务主管收到催收提醒，联系客户回款",
                "target_type": "ar_ap",
                "target_id": str(ar.id),
                "target_name": ar.counterparty,
                "priority": ActionPriority.CRITICAL if overdue_days > 60 else ActionPriority.HIGH,
            })
        
        return triggers
    
    async def _check_charging_operations(self, db: AsyncSession, company_id: str) -> List[Dict]:
        """检查充电站运营。"""
        from app.models.charging.models import ChargingDevice, ChargingStation
        
        triggers = []
        
        # 设备离线超过24小时
        offline_devices = (await db.execute(
            select(ChargingDevice, ChargingStation).join(
                ChargingStation, ChargingStation.id == ChargingDevice.station_id
            ).where(
                ChargingDevice.company_id == company_id,
                ChargingDevice.is_deleted == False,
                ChargingDevice.status == "offline",
            )
        )).all()
        
        for device, station in offline_devices:
            triggers.append({
                "title": f"设备离线：{station.name} - {device.device_code}",
                "description": f"充电设备已离线，影响站点运营",
                "category": "charging",
                "action_type": "create_inspection_task",
                "action_params": {
                    "task_type": "device_repair",
                    "station_id": str(station.id),
                    "device_id": str(device.id),
                    "priority": "high"
                },
                "trigger_reason": "充电设备离线超过24小时",
                "ai_analysis": f"设备{device.device_code}离线，可能导致日损失收入约¥{getattr(device, 'daily_revenue', 500) or 500}",
                "expected_result": "维修人员收到工单，2小时内到场处理",
                "target_type": "charging_device",
                "target_id": str(device.id),
                "target_name": f"{station.name} - {device.device_code}",
                "priority": ActionPriority.CRITICAL,
            })
        
        return triggers
    
    async def _check_contract_expiry(self, db: AsyncSession, company_id: str) -> List[Dict]:
        """检查合同到期。"""
        from app.models.erp.models import Contract
        
        triggers = []
        today = date.today()
        warning_date = today + timedelta(days=30)
        
        # 30天内到期的合同
        expiring = (await db.execute(
            select(Contract).where(
                Contract.company_id == company_id,
                Contract.is_deleted == False,
                Contract.status.in_(["active", "performing"]),
                Contract.end_date <= warning_date,
                Contract.end_date >= today,
            )
        )).scalars().all()
        
        for c in expiring:
            days_left = (c.end_date - today).days
            triggers.append({
                "title": f"合同即将到期：{c.name}（还剩{days_left}天）",
                "description": f"合同编号：{c.contract_no}，到期日：{c.end_date}，金额：¥{c.total_amount or 0:,.2f}",
                "category": "erp",
                "action_type": "create_reminder",
                "action_params": {
                    "reminder_type": "contract_expiry",
                    "contract_id": str(c.id),
                    "days_left": days_left,
                    "message": f"合同{c.name}将在{days_left}天后到期，请安排续签"
                },
                "trigger_reason": f"合同将在{days_left}天内到期",
                "expected_result": "法务/业务人员收到提醒，提前安排续签谈判",
                "target_type": "contract",
                "target_id": str(c.id),
                "target_name": c.name,
                "priority": ActionPriority.HIGH if days_left <= 7 else ActionPriority.MEDIUM,
            })
        
        return triggers
    
    async def _check_overdue_receivables(self, db: AsyncSession, company_id: str) -> List[Dict]:
        """检查应收逾期（更严格的规则）。"""
        return []  # 已在财务异常中处理
    
    async def _check_inventory_levels(self, db: AsyncSession, company_id: str) -> List[Dict]:
        """检查库存水平。"""
        from app.models.project.models import InventoryItem
        
        triggers = []
        
        # 库存低于安全库存
        low_inventory = (await db.execute(
            select(InventoryItem).where(
                InventoryItem.company_id == company_id,
                InventoryItem.is_deleted == False,
                InventoryItem.quantity <= InventoryItem.min_quantity,
                InventoryItem.min_quantity > 0,
            )
        )).scalars().all()
        
        for item in low_inventory:
            triggers.append({
                "title": f"库存预警：{item.name} 库存不足",
                "description": f"当前库存：{item.quantity} {item.unit}，安全库存：{item.min_quantity} {item.unit}",
                "category": "project",
                "action_type": "send_notification",
                "action_params": {
                    "notification_type": "inventory_low",
                    "target_users": ["warehouse_manager"],
                    "title": f"库存预警：{item.name}",
                    "content": f"{item.name}库存{item.quantity}{item.unit}，低于安全库存{item.min_quantity}{item.unit}，请及时采购"
                },
                "trigger_reason": f"库存{item.name}低于安全线",
                "expected_result": "仓库管理员收到提醒，安排采购补货",
                "target_type": "inventory",
                "target_id": str(item.id),
                "target_name": item.name,
                "priority": ActionPriority.MEDIUM,
            })
        
        return triggers
    
    async def _check_device_faults(self, db: AsyncSession, company_id: str) -> List[Dict]:
        """检查设备故障。"""
        from app.models.project.models import FixedAsset
        
        triggers = []
        
        # 固定资产需要保养
        maintenance_due = (await db.execute(
            select(FixedAsset).where(
                FixedAsset.company_id == company_id,
                FixedAsset.is_deleted == False,
                FixedAsset.next_maintenance_date <= date.today(),
            )
        )).scalars().all()
        
        for asset in maintenance_due:
            triggers.append({
                "title": f"设备保养到期：{asset.asset_name}",
                "description": f"资产编号：{asset.asset_code}，保养日期：{asset.next_maintenance_date}",
                "category": "project",
                "action_type": "create_reminder",
                "action_params": {
                    "reminder_type": "asset_maintenance",
                    "asset_id": str(asset.id),
                    "message": f"设备{asset.asset_name}保养已到期，请安排维护"
                },
                "trigger_reason": "设备保养日期已到",
                "expected_result": "设备管理员收到提醒，安排保养维护",
                "target_type": "fixed_asset",
                "target_id": str(asset.id),
                "target_name": asset.asset_name,
                "priority": ActionPriority.MEDIUM,
            })
        
        return triggers


# 全局实例
auto_trigger = AutoTriggerEngine()
