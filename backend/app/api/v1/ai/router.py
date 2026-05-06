from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.models.project.models import (
    Project, ProjectMilestone, ProjectLine, ConstructionLog, ServiceTicket,
    ProjectProcurementApproval, SafetyInspection,
)
from app.models.erp.models import Contract, PurchaseOrder
from app.services.ai_service import (
    analyze_cross_business,
    analyze_customer_churn,
    analyze_device_health,
    analyze_finance_health,
    analyze_procurement,
    analyze_project_risk,
    analyze_station_revenue,
    generate_daily_briefing,
    execute_ai_task,
)
from app.services.notification_service import send_notification
from app.services.project_cost import ProjectCostService

router = APIRouter(prefix="/ai", tags=["AI决策"])


@router.get("/insights")
async def ai_insights(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    briefing = await generate_daily_briefing(db, current_user.company_id, str(current_user.id))
    items = []
    if isinstance(briefing, dict):
        for k, v in briefing.items():
            items.append({"category": k, "content": str(v), "type": "info"})
    elif isinstance(briefing, list):
        items = briefing
    return {"items": items[:5]}


@router.get("/recommendations")
async def ai_recommendations(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    data = await analyze_cross_business(db, current_user.company_id)
    recs = []
    if isinstance(data, dict):
        for k, v in data.items():
            recs.append({"category": k, "content": str(v), "priority": "medium"})
    elif isinstance(data, list):
        recs = data
    return {"items": recs[:5]}


@router.get("/risk-alerts")
async def ai_risk_alerts(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.services.linkage import check_contract_expiry
    alerts = await check_contract_expiry(db)
    return {"items": alerts[:5]}


@router.get("/project-risk")
async def project_risk_analysis(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await analyze_project_risk(db, current_user.company_id)


@router.get("/station-revenue")
async def station_revenue_analysis(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await analyze_station_revenue(db, current_user.company_id)


@router.get("/finance-health")
async def finance_health_analysis(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await analyze_finance_health(db, current_user.company_id)


@router.get("/procurement")
async def procurement_analysis(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await analyze_procurement(db, current_user.company_id)


@router.get("/device-health")
async def device_health_analysis(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await analyze_device_health(db, current_user.company_id)


@router.get("/customer-churn")
async def customer_churn_analysis(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await analyze_customer_churn(db, current_user.company_id)


@router.get("/project-analysis/{project_id}")
async def project_360_analysis(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = (await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.company_id == current_user.company_id,
            Project.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    today = date.today()

    contracts = (await db.execute(
        select(Contract).where(
            Contract.project_id == project_id,
            Contract.company_id == current_user.company_id,
            Contract.is_deleted == False,
        )
    )).scalars().all()

    cost_summary = await ProjectCostService.get_cost_summary(project_id, db)
    cost_trend = await ProjectCostService.get_monthly_trend(project_id, db)

    cost_lines = (await db.execute(
        select(ProjectLine).where(
            ProjectLine.project_id == project_id,
            ProjectLine.is_deleted == False,
        ).order_by(ProjectLine.record_date.desc()).limit(20)
    )).scalars().all()

    purchase_orders = (await db.execute(
        select(PurchaseOrder).where(
            PurchaseOrder.project_id == project_id,
            PurchaseOrder.company_id == current_user.company_id,
            PurchaseOrder.is_deleted == False,
        )
    )).scalars().all()

    construction_logs = (await db.execute(
        select(ConstructionLog).where(
            ConstructionLog.project_id == project_id,
            ConstructionLog.is_deleted == False,
            ConstructionLog.log_date >= today - timedelta(days=30),
        ).order_by(ConstructionLog.log_date.desc()).limit(10)
    )).scalars().all()

    service_tickets = (await db.execute(
        select(ServiceTicket).where(
            ServiceTicket.project_id == project_id,
            ServiceTicket.company_id == current_user.company_id,
            ServiceTicket.is_deleted == False,
            ServiceTicket.status.in_(["pending", "in_progress"]),
        )
    )).scalars().all()

    milestones = (await db.execute(
        select(ProjectMilestone).where(
            ProjectMilestone.project_id == project_id,
            ProjectMilestone.is_deleted == False,
        ).order_by(ProjectMilestone.sort_order)
    )).scalars().all()

    safety_inspections = (await db.execute(
        select(SafetyInspection).where(
            SafetyInspection.project_id == project_id,
            SafetyInspection.is_deleted == False,
            SafetyInspection.overall_level.in_(["warning", "danger"]),
        )
    )).scalars().all()

    procurement_approvals = (await db.execute(
        select(ProjectProcurementApproval).where(
            ProjectProcurementApproval.project_id == project_id,
            ProjectProcurementApproval.is_deleted == False,
        )
    )).scalars().all()

    delay_days = 0
    if project.end_date and project.end_date < today and project.status not in ["completed", "closed"]:
        delay_days = (today - project.end_date).days

    overdue_milestones = [m for m in milestones if m.planned_date and m.planned_date < today and m.status != "completed"]
    safety_issues = [l for l in construction_logs if l.safety_status != "normal"]

    total_budget = float(project.total_budget or 0)
    actual_cost = float(project.actual_cost or 0)
    budget_rate = round(actual_cost / total_budget * 100, 1) if total_budget > 0 else 0

    total_contract_amount = sum(float(c.total_amount or 0) for c in contracts)
    total_paid = sum(float(c.paid_amount or 0) for c in contracts)

    risks = []
    if delay_days > 0:
        risks.append({"category": "schedule", "level": "high" if delay_days > 30 else "medium", "description": f"项目已逾期{delay_days}天"})
    if budget_rate > 100:
        risks.append({"category": "budget", "level": "high", "description": f"预算超支{budget_rate - 100:.1f}%"})
    elif budget_rate > 85:
        risks.append({"category": "budget", "level": "medium", "description": f"预算使用率{budget_rate:.1f}%，接近上限"})
    if overdue_milestones:
        risks.append({"category": "milestone", "level": "medium", "description": f"{len(overdue_milestones)}个里程碑逾期"})
    if safety_issues:
        risks.append({"category": "safety", "level": "high" if len(safety_issues) > 3 else "medium", "description": f"近期{len(safety_issues)}条施工日志记录安全问题"})
    if safety_inspections:
        risks.append({"category": "safety", "level": "high", "description": f"{len(safety_inspections)}条安全隐患未整改"})
    if service_tickets:
        risks.append({"category": "service", "level": "low", "description": f"{len(service_tickets)}个未关闭的服务工单"})

    recommendations = []
    if delay_days > 0:
        recommendations.append("评估剩余工作量，考虑增加资源或调整工期")
    if budget_rate > 90:
        recommendations.append("审核成本明细，控制非必要支出")
    if overdue_milestones:
        recommendations.append("复核逾期里程碑，制定追赶计划")
    if safety_inspections:
        recommendations.append("优先处理安全隐患整改，避免停工风险")
    pending_procurement = [p for p in procurement_approvals if p.status in ("draft", "pending")]
    if pending_procurement:
        recommendations.append(f"{len(pending_procurement)}个采购审批待处理，加快审批流程")

    return {
        "project": {
            "id": str(project.id),
            "project_code": project.project_code,
            "name": project.name,
            "project_type": project.project_type,
            "status": project.status,
            "priority": project.priority,
            "progress": project.progress,
            "start_date": project.start_date.isoformat() if project.start_date else None,
            "end_date": project.end_date.isoformat() if project.end_date else None,
            "actual_start_date": project.actual_start_date.isoformat() if project.actual_start_date else None,
            "actual_end_date": project.actual_end_date.isoformat() if project.actual_end_date else None,
            "delay_days": delay_days,
            "address": project.address,
        },
        "budget": {
            "total_budget": total_budget,
            "actual_cost": actual_cost,
            "budget_usage_rate": budget_rate,
            "by_type": cost_summary.get("by_type", {}),
            "monthly_trend": cost_trend,
        },
        "contracts": {
            "total": len(contracts),
            "total_amount": total_contract_amount,
            "total_paid": total_paid,
            "payment_rate": round(total_paid / total_contract_amount * 100, 1) if total_contract_amount > 0 else 0,
            "items": [{
                "id": str(c.id),
                "contract_no": c.contract_no,
                "name": c.name,
                "party_a": c.party_a,
                "party_b": c.party_b,
                "total_amount": float(c.total_amount or 0),
                "paid_amount": float(c.paid_amount or 0),
                "status": c.status,
                "end_date": c.end_date.isoformat() if c.end_date else None,
            } for c in contracts],
        },
        "procurement": {
            "orders": [{
                "id": str(po.id),
                "po_no": po.po_no,
                "title": po.title,
                "total_amount": float(po.total_amount or 0),
                "status": po.status,
                "delivery_date": po.delivery_date.isoformat() if po.delivery_date else None,
            } for po in purchase_orders],
            "pending_approvals": len(pending_procurement),
        },
        "construction_logs": {
            "recent_count": len(construction_logs),
            "items": [{
                "log_date": l.log_date.isoformat() if l.log_date else None,
                "work_content": l.work_content,
                "worker_count": l.worker_count,
                "safety_status": l.safety_status,
            } for l in construction_logs],
        },
        "service_tickets": {
            "open_count": len(service_tickets),
            "items": [{
                "id": str(t.id),
                "ticket_no": t.ticket_no,
                "title": t.title,
                "priority": t.priority,
                "status": t.status,
                "assigned_to": str(t.assigned_to) if t.assigned_to else None,
            } for t in service_tickets],
        },
        "milestones": {
            "total": len(milestones),
            "completed": sum(1 for m in milestones if m.status == "completed"),
            "overdue": len(overdue_milestones),
            "items": [{
                "name": m.name,
                "planned_date": m.planned_date.isoformat() if m.planned_date else None,
                "actual_date": m.actual_date.isoformat() if m.actual_date else None,
                "status": m.status,
            } for m in milestones],
        },
        "risks": risks,
        "recommendations": recommendations,
    }


@router.get("/cross-business")
async def cross_business_analysis(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await analyze_cross_business(db, current_user.company_id)


@router.get("/daily-briefing")
async def daily_briefing(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await generate_daily_briefing(db, current_user.company_id, str(current_user.id))


class AIActionRequest(BaseModel):
    task_type: str = Field(..., description="task type: create_alert|generate_report|summarize_module")
    params: dict | None = None


@router.post("/execute")
async def execute_task(body: AIActionRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await execute_ai_task(db, current_user.company_id, str(current_user.id), body.task_type, body.params or {})
    if result.get("notifications"):
        for n in result["notifications"]:
            await send_notification(db, current_user.company_id, n["user_id"], n["category"], n["title"], n.get("content"), n.get("link"), str(current_user.id))
    return result
