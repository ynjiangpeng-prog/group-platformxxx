
"""甩手掌柜 - 自动执行管理API。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.services.auto_executive import auto_executive, ActionStatus
from app.services.auto_trigger import auto_trigger

router = APIRouter(prefix="/executive", tags=["甩手掌柜"])


class ConfirmRequest(BaseModel):
    action_id: str
    confirmed: bool = True
    comment: Optional[str] = None


class ExecuteRequest(BaseModel):
    action_type: str
    action_params: dict
    title: Optional[str] = None
    description: Optional[str] = None


# ========== 老板一键操作 ==========

@router.get("/pending-actions")
async def get_pending_actions(
    status: Optional[str] = Query(None, description="pending/waiting_confirm/auto_executed"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取待处理的动作列表（老板看板）。"""
    from app.models.system.auto_action_models import AutoActionRecord
    
    query = select(AutoActionRecord).where(
        AutoActionRecord.company_id == str(current_user.company_id),
        AutoActionRecord.is_deleted == False,
    )
    
    if status:
        query = query.where(AutoActionRecord.status == status)
    else:
        # 默认显示待确认和已自动执行的
        query = query.where(AutoActionRecord.status.in_(["waiting_confirm", "auto_executed", "failed"]))
    
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar()
    
    query = query.order_by(
        AutoActionRecord.created_at.desc()
    ).offset((page - 1) * page_size).limit(page_size)
    
    records = (await db.execute(query)).scalars().all()
    
    return {
        "items": [{
            "action_id": r.action_id,
            "title": r.title,
            "description": r.description,
            "category": r.category,
            "priority": r.priority,
            "status": r.status,
            "action_type": r.action_type,
            "target_name": r.target_name,
            "trigger_reason": r.trigger_reason,
            "ai_analysis": r.ai_analysis,
            "expected_result": r.expected_result,
            "risk_level": r.risk_level,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "executed_at": r.executed_at.isoformat() if r.executed_at else None,
            "confirmed_at": r.confirmed_at.isoformat() if r.confirmed_at else None,
            "executed_by": r.executed_by,
            "error_message": r.error_message,
        } for r in records],
        "total": total,
        "page": page,
        "page_size": page_size,
        "summary": {
            "waiting_confirm": len([r for r in records if r.status == "waiting_confirm"]),
            "auto_executed": len([r for r in records if r.status == "auto_executed"]),
            "failed": len([r for r in records if r.status == "failed"]),
        }
    }


@router.post("/confirm")
async def confirm_action(
    req: ConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """老板确认或拒绝自动执行动作。"""
    success = await auto_executive.confirm_action(
        db=db,
        action_id=req.action_id,
        user_id=str(current_user.id),
        confirmed=req.confirmed
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Action not found or already processed")
    
    return {
        "action_id": req.action_id,
        "status": "confirmed" if req.confirmed else "rejected",
        "message": "操作已确认" if req.confirmed else "操作已拒绝",
    }


@router.post("/batch-confirm")
async def batch_confirm(
    action_ids: list[str],
    confirmed: bool = True,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """批量确认/拒绝。"""
    results = []
    for action_id in action_ids:
        success = await auto_executive.confirm_action(
            db=db,
            action_id=action_id,
            user_id=str(current_user.id),
            confirmed=confirmed
        )
        results.append({"action_id": action_id, "success": success})
    
    return {
        "total": len(action_ids),
        "success_count": len([r for r in results if r["success"]]),
        "results": results,
    }


# ========== 执行统计 ==========

@router.get("/stats")
async def get_execution_stats(
    days: int = Query(7, ge=1, le=30),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取自动执行统计（老板看数据）。"""
    from app.models.system.auto_action_models import AutoActionRecord
    from datetime import datetime, timedelta
    
    start_date = datetime.now() - timedelta(days=days)
    
    # 统计各类状态的数量
    stats = {}
    for status in ["auto_executed", "waiting_confirm", "confirmed", "rejected", "failed"]:
        count = (await db.execute(
            select(func.count()).where(
                AutoActionRecord.company_id == str(current_user.company_id),
                AutoActionRecord.status == status,
                AutoActionRecord.created_at >= start_date,
            )
        )).scalar()
        stats[status] = count
    
    # 按类别统计
    category_stats = (await db.execute(
        select(AutoActionRecord.category, AutoActionRecord.status, func.count())
        .where(
            AutoActionRecord.company_id == str(current_user.company_id),
            AutoActionRecord.created_at >= start_date,
        )
        .group_by(AutoActionRecord.category, AutoActionRecord.status)
    )).all()
    
    return {
        "period_days": days,
        "total_actions": sum(stats.values()),
        "status_breakdown": stats,
        "auto_execution_rate": round(stats.get("auto_executed", 0) / max(sum(stats.values()), 1) * 100, 1),
        "category_breakdown": {
            cat: {status: count for _, status, count in category_stats if _ == cat}
            for cat in set(cat for cat, _, _ in category_stats)
        },
        "savings_estimate": {  # 估算节省的人工时间
            "hours_saved": stats.get("auto_executed", 0) * 0.5,  # 每次自动执行节省30分钟
            "manual_reviews": stats.get("waiting_confirm", 0) + stats.get("confirmed", 0),
        }
    }


# ========== 手动触发扫描 ==========

@router.post("/scan")
async def trigger_scan(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """手动触发自动扫描（老板或管理员）。"""
    count = await auto_trigger.scan_and_trigger(db, str(current_user.company_id))
    return {
        "message": "扫描完成",
        "actions_triggered": count,
        "status": "success",
    }


# ========== 执行详情 ==========

@router.get("/action/{action_id}")
async def get_action_detail(
    action_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取执行详情。"""
    from app.models.system.auto_action_models import AutoActionRecord
    
    result = await db.execute(
        select(AutoActionRecord).where(
            AutoActionRecord.action_id == action_id,
            AutoActionRecord.company_id == str(current_user.company_id),
        )
    )
    record = result.scalar_one_or_none()
    
    if not record:
        raise HTTPException(status_code=404, detail="Action not found")
    
    import json
    return {
        "action_id": record.action_id,
        "title": record.title,
        "description": record.description,
        "category": record.category,
        "priority": record.priority,
        "status": record.status,
        "action_type": record.action_type,
        "action_params": json.loads(record.action_params) if record.action_params else {},
        "target_type": record.target_type,
        "target_id": record.target_id,
        "target_name": record.target_name,
        "trigger_reason": record.trigger_reason,
        "ai_analysis": record.ai_analysis,
        "expected_result": record.expected_result,
        "risk_level": record.risk_level,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "executed_at": record.executed_at.isoformat() if record.executed_at else None,
        "confirmed_at": record.confirmed_at.isoformat() if record.confirmed_at else None,
        "executed_by": record.executed_by,
        "result_data": json.loads(record.result_data) if record.result_data else {},
        "error_message": record.error_message,
    }
