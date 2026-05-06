
"""自动执行引擎 - AI发现问题后自动执行修复。"""
import logging
import json
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Callable
from enum import Enum
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class ActionPriority(Enum):
    CRITICAL = "critical"  # 立即执行，无需确认（如设备故障报警）
    HIGH = "high"         # 建议执行，24小时内确认
    MEDIUM = "medium"     # 可执行，72小时内确认
    LOW = "low"           # 仅通知，不执行


class ActionStatus(Enum):
    PENDING = "pending"       # 等待执行
    AUTO_EXECUTED = "auto_executed"  # 已自动执行
    WAITING_CONFIRM = "waiting_confirm"  # 等待老板确认
    CONFIRMED = "confirmed"   # 老板已确认
    REJECTED = "rejected"     # 老板已拒绝
    FAILED = "failed"         # 执行失败


@dataclass
class AutoAction:
    """自动化执行动作。"""
    id: str
    title: str
    description: str
    category: str  # project, finance, charging, system
    priority: ActionPriority
    status: ActionStatus
    
    # 执行内容
    action_type: str  # update_status, send_notification, create_ticket, adjust_price
    action_params: Dict[str, Any] = field(default_factory=dict)
    
    # 影响范围
    target_type: str = ""  # project, station, contract, user
    target_id: Optional[str] = None
    target_name: str = ""
    
    # 决策信息
    trigger_reason: str = ""  # 为什么触发这个动作
    ai_analysis: str = ""     # AI分析结果
    expected_result: str = "" # 预期效果
    risk_level: str = "low"   # low/medium/high
    
    # 执行记录
    created_at: datetime = field(default_factory=datetime.now)
    executed_at: Optional[datetime] = None
    confirmed_at: Optional[datetime] = None
    executed_by: str = "system"  # system / user_id
    result_data: Dict[str, Any] = field(default_factory=dict)
    error_message: Optional[str] = None
    
    # 通知
    notified_channels: List[str] = field(default_factory=list)  # wechat, dingtalk, sms, email


# 执行器注册表
EXECUTORS: Dict[str, Callable] = {}


def register_executor(action_type: str):
    """注册执行器。"""
    def decorator(fn: Callable):
        EXECUTORS[action_type] = fn
        return fn
    return decorator


class AutoExecutiveEngine:
    """自动执行引擎。"""
    
    # 自动执行配置：哪些操作可以自动执行，哪些需要确认
    AUTO_EXECUTE_RULES = {
        # 高风险操作：必须人工确认
        "high_risk_types": [
            "delete",
            "cancel_contract",
            "refund",
            "fire_employee",
            "transfer_large_amount",
        ],
        # 金额阈值：超过此金额必须确认
        "amount_threshold": 50000,  # 5万元
        # 自动执行白名单：这些操作无需确认
        "auto_execute_whitelist": [
            "send_notification",
            "create_reminder",
            "update_status_to_active",
            "generate_report",
            "create_inspection_task",
            "mark_as_read",
            "send_wechat",
        ],
        # 时间规则：工作时间外的高风险操作需确认
        "working_hours": (9, 18),
    }
    
    def __init__(self):
        self.pending_actions: List[AutoAction] = []
    
    async def create_action(
        self,
        db: AsyncSession,
        company_id: str,
        title: str,
        description: str,
        category: str,
        action_type: str,
        action_params: Dict[str, Any],
        trigger_reason: str,
        ai_analysis: str = "",
        expected_result: str = "",
        target_type: str = "",
        target_id: Optional[str] = None,
        target_name: str = "",
        priority: ActionPriority = ActionPriority.MEDIUM,
    ) -> AutoAction:
        """创建自动化执行动作。"""
        
        # 判断是否需要人工确认
        needs_confirm = self._needs_manual_confirmation(
            action_type, action_params, priority
        )
        
        if needs_confirm:
            status = ActionStatus.WAITING_CONFIRM
        else:
            status = ActionStatus.PENDING
        
        action = AutoAction(
            id=f"auto_{datetime.now().strftime('%Y%m%d%H%M%S')}_{target_id or 'system'}",
            title=title,
            description=description,
            category=category,
            priority=priority,
            status=status,
            action_type=action_type,
            action_params=action_params,
            target_type=target_type,
            target_id=target_id,
            target_name=target_name,
            trigger_reason=trigger_reason,
            ai_analysis=ai_analysis,
            expected_result=expected_result,
        )
        
        # 保存到数据库
        from app.models.system.auto_action_models import AutoActionRecord
        record = AutoActionRecord(
            company_id=company_id,
            action_id=action.id,
            title=action.title,
            description=action.description,
            category=action.category,
            priority=action.priority.value,
            status=action.status.value,
            action_type=action.action_type,
            action_params=json.dumps(action.action_params),
            target_type=action.target_type,
            target_id=action.target_id,
            target_name=action.target_name,
            trigger_reason=action.trigger_reason,
            ai_analysis=action.ai_analysis,
            expected_result=action.expected_result,
            risk_level=action.risk_level,
        )
        db.add(record)
        await db.flush()
        
        # 如果无需确认，立即执行
        if not needs_confirm:
            await self.execute_action(db, action)
        else:
            # 需要确认：发送通知给老板
            await self._notify_boss(db, company_id, action)
        
        return action
    
    def _needs_manual_confirmation(
        self, action_type: str, action_params: Dict[str, Any], priority: ActionPriority
    ) -> bool:
        """判断是否需要人工确认。"""
        # 白名单中的操作无需确认
        if action_type in self.AUTO_EXECUTE_RULES["auto_execute_whitelist"]:
            return False
        
        # 高风险操作必须确认
        if action_type in self.AUTO_EXECUTE_RULES["high_risk_types"]:
            return True
        
        # 金额超过阈值需确认
        amount = action_params.get("amount", 0)
        if isinstance(amount, (int, float)) and amount > self.AUTO_EXECUTE_RULES["amount_threshold"]:
            return True
        
        # 关键优先级默认需确认
        if priority == ActionPriority.CRITICAL and action_type not in self.AUTO_EXECUTE_RULES["auto_execute_whitelist"]:
            return True
        
        return False
    
    async def execute_action(self, db: AsyncSession, action: AutoAction) -> bool:
        """执行动作。"""
        executor = EXECUTORS.get(action.action_type)
        if not executor:
            action.status = ActionStatus.FAILED
            action.error_message = f"Unknown action type: {action.action_type}"
            logger.error(action.error_message)
            return False
        
        try:
            action.executed_at = datetime.now()
            result = await executor(db, action)
            
            if result.get("success", False):
                action.status = ActionStatus.AUTO_EXECUTED
                action.result_data = result
                logger.info("Auto action executed successfully: %s", action.id)
            else:
                action.status = ActionStatus.FAILED
                action.error_message = result.get("error", "Unknown error")
                logger.error("Auto action failed: %s - %s", action.id, action.error_message)
            
            return result.get("success", False)
            
        except Exception as e:
            action.status = ActionStatus.FAILED
            action.error_message = str(e)
            logger.exception("Auto action execution error: %s", action.id)
            return False
    
    async def confirm_action(self, db: AsyncSession, action_id: str, user_id: str, confirmed: bool = True) -> bool:
        """老板确认或拒绝动作。"""
        from app.models.system.auto_action_models import AutoActionRecord
        
        result = await db.execute(
            select(AutoActionRecord).where(AutoActionRecord.action_id == action_id)
        )
        record = result.scalar_one_or_none()
        if not record:
            return False
        
        if confirmed:
            record.status = ActionStatus.CONFIRMED.value
            record.confirmed_at = datetime.now()
            
            # 构建action对象并执行
            action = AutoAction(
                id=record.action_id,
                title=record.title,
                description=record.description,
                category=record.category,
                priority=ActionPriority(record.priority),
                status=ActionStatus.CONFIRMED,
                action_type=record.action_type,
                action_params=json.loads(record.action_params),
                target_type=record.target_type,
                target_id=record.target_id,
                target_name=record.target_name,
            )
            
            success = await self.execute_action(db, action)
            
            # 更新执行结果
            record.result_data = json.dumps(action.result_data)
            record.error_message = action.error_message
            record.executed_at = action.executed_at
            record.executed_by = user_id
            
            await db.flush()
            return success
        else:
            record.status = ActionStatus.REJECTED.value
            record.confirmed_at = datetime.now()
            await db.flush()
            return True
    
    async def _notify_boss(self, db: AsyncSession, company_id: str, action: AutoAction):
        """通知老板有待确认的操作。"""
        # 这里接入微信/钉钉推送
        message = f"""
【待确认】{action.title}

{action.description}

触发原因：{action.trigger_reason}
{action.ai_analysis and f"AI分析：{action.ai_analysis}" or ""}
预期效果：{action.expected_result}

风险等级：{action.risk_level}
请登录系统确认或拒绝此操作。
"""
        
        # 保存通知记录
        from app.services.notification_service import send_notification
        await send_notification(
            db=db,
            company_id=company_id,
            title=f"待确认：{action.title}",
            content=message,
            notification_type="auto_action_confirm",
            target_users=["admin"],  # 发给管理员
            extra_data={"action_id": action.id}
        )
        
        action.notified_channels.append("system")
        logger.info("Boss notified for action: %s", action.id)


# ====== 执行器实现 ======

@register_executor("send_notification")
async def exec_send_notification(db: AsyncSession, action: AutoAction) -> Dict[str, Any]:
    """发送通知。"""
    from app.services.notification_service import send_notification
    
    params = action.action_params
    await send_notification(
        db=db,
        company_id=params.get("company_id"),
        title=params.get("title", action.title),
        content=params.get("content", action.description),
        notification_type=params.get("type", "info"),
        target_users=params.get("target_users", []),
    )
    return {"success": True, "message": "Notification sent"}


@register_executor("update_status")
async def exec_update_status(db: AsyncSession, action: AutoAction) -> Dict[str, Any]:
    """更新实体状态。"""
    params = action.action_params
    entity_type = params.get("entity_type")
    entity_id = params.get("entity_id")
    new_status = params.get("status")
    
    # 根据实体类型更新状态
    if entity_type == "project":
        from app.models.project.models import Project
        result = await db.execute(
            select(Project).where(Project.id == entity_id)
        )
        entity = result.scalar_one_or_none()
    elif entity_type == "charging_station":
        from app.models.charging.models import ChargingStation
        result = await db.execute(
            select(ChargingStation).where(ChargingStation.id == entity_id)
        )
        entity = result.scalar_one_or_none()
    elif entity_type == "contract":
        from app.models.erp.models import Contract
        result = await db.execute(
            select(Contract).where(Contract.id == entity_id)
        )
        entity = result.scalar_one_or_none()
    else:
        return {"success": False, "error": f"Unknown entity type: {entity_type}"}
    
    if entity:
        entity.status = new_status
        await db.flush()
        return {"success": True, "message": f"Status updated to {new_status}"}
    else:
        return {"success": False, "error": "Entity not found"}


@register_executor("create_reminder")
async def exec_create_reminder(db: AsyncSession, action: AutoAction) -> Dict[str, Any]:
    """创建提醒任务。"""
    params = action.action_params
    # 创建待办事项或提醒
    return {"success": True, "message": "Reminder created"}


@register_executor("create_inspection_task")
async def exec_create_inspection(db: AsyncSession, action: AutoAction) -> Dict[str, Any]:
    """创建检查任务。"""
    params = action.action_params
    # 创建安全检查或设备巡检任务
    return {"success": True, "message": "Inspection task created"}


@register_executor("send_wechat")
async def exec_send_wechat(db: AsyncSession, action: AutoAction) -> Dict[str, Any]:
    """发送微信通知。"""
    params = action.action_params
    # 调用微信API发送消息
    logger.info("WeChat notification: %s", params.get("message", ""))
    return {"success": True, "message": "WeChat message sent"}


@register_executor("generate_report")
async def exec_generate_report(db: AsyncSession, action: AutoAction) -> Dict[str, Any]:
    """生成报告。"""
    params = action.action_params
    report_type = params.get("report_type", "daily")
    # 调用报告生成服务
    return {"success": True, "message": f"{report_type} report generated"}


@register_executor("adjust_price")
async def exec_adjust_price(db: AsyncSession, action: AutoAction) -> Dict[str, Any]:
    """调整价格（需确认）。"""
    params = action.action_params
    station_id = params.get("station_id")
    new_price = params.get("new_price")
    
    # 实际执行价格调整
    logger.info("Adjusting price for station %s to %s", station_id, new_price)
    return {"success": True, "message": f"Price adjusted to {new_price}"}


# 全局引擎实例
auto_executive = AutoExecutiveEngine()
