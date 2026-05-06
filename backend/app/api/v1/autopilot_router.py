import logging
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select, func, case, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.models.project.models import Project
from app.models.erp.models import Contract
from app.models.finance.models import Invoice
from app.models.finance.models import ArApRecord as ArAp
from app.models.charging.models import ChargingStation as Station, ChargingOrder
from app.models.business.models import DailyExpense
from app.services.ai_gateway import ai_gateway

router = APIRouter(prefix="/autopilot", tags=["自动驾驶"])
logger = logging.getLogger(__name__)


@router.get("/dashboard")
async def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cid = current_user.company_id
    today = date.today()
    month_start = datetime(today.year, today.month, 1)

    month_expense_row = await db.execute(
        select(func.coalesce(func.sum(DailyExpense.amount), 0)).where(
            DailyExpense.company_id == cid, DailyExpense.is_deleted == False,
            DailyExpense.expense_date >= month_start,
        )
    )
    month_expense = float(month_expense_row.scalar() or 0)

    station_stats = await db.execute(
        select(Station.status, func.count(Station.id)).where(
            Station.company_id == cid, Station.is_deleted == False,
        ).group_by(Station.status)
    )
    status_counts = {row[0]: row[1] for row in station_stats.all()}

    order_stats = await db.execute(
        select(
            func.count(ChargingOrder.id),
            func.coalesce(func.sum(ChargingOrder.charging_kwh), 0),
            func.coalesce(func.sum(ChargingOrder.total_amount), 0),
        ).where(
            ChargingOrder.company_id == cid,
            ChargingOrder.start_time >= month_start,
        )
    )
    o_row = order_stats.one()
    month_orders, month_kwh, month_revenue = o_row[0], float(o_row[1] or 0), float(o_row[2] or 0)

    project_stats = await db.execute(
        select(Project.status, func.count(Project.id), func.coalesce(func.sum(Project.total_budget), 0),
               func.coalesce(func.sum(Project.actual_cost), 0)).where(
            Project.company_id == cid, Project.is_deleted == False,
        ).group_by(Project.status)
    )
    by_status = {}
    total_budget = 0.0
    total_cost = 0.0
    for status, cnt, budget, cost in project_stats.all():
        by_status[status] = {"count": cnt, "budget": float(budget or 0), "cost": float(cost or 0)}
        total_budget += float(budget or 0)
        total_cost += float(cost or 0)

    ar_summary = await db.execute(
        select(ArAp.type, func.coalesce(func.sum(ArAp.total_amount), 0),
               func.coalesce(func.sum(ArAp.settled_amount), 0),
               func.coalesce(func.sum(case((ArAp.due_date < today, ArAp.remaining_amount), else_=0)), 0),
               func.count(case((ArAp.due_date < today, ArAp.id)))).where(
            ArAp.company_id == cid, ArAp.is_deleted == False,
        ).group_by(ArAp.type)
    )
    arap = {"receivable": {"total": 0, "paid": 0, "remaining": 0, "overdue_count": 0, "overdue_amount": 0},
            "payable": {"total": 0, "paid": 0, "remaining": 0, "overdue_count": 0, "overdue_amount": 0}}
    for atype, total, settled, overdue_amt, overdue_cnt in ar_summary.all():
        key = "receivable" if atype == "ar" else "payable"
        arap[key] = {"total": float(total), "paid": float(settled), "remaining": float(total) - float(settled),
                     "overdue_count": overdue_cnt, "overdue_amount": float(overdue_amt)}

    top_stations = await db.execute(
        select(Station.name, func.count(ChargingOrder.id).label("orders"),
               func.coalesce(func.sum(ChargingOrder.charging_kwh), 0),
               func.coalesce(func.sum(ChargingOrder.total_amount), 0)).where(
            ChargingOrder.company_id == cid,
            ChargingOrder.start_time >= datetime.now() - timedelta(days=30),
        ).join(Station, ChargingOrder.station_id == Station.id).group_by(Station.name)
        .order_by(func.sum(ChargingOrder.total_amount).desc()).limit(5)
    )
    top_station_list = [{"name": r[0], "orders_30d": r[1], "kwh_30d": float(r[2]),
                          "revenue_30d": float(r[3])} for r in top_stations.all()]

    contracts_due = await db.execute(
        select(Contract.name, Contract.end_date).where(
            Contract.company_id == cid, Contract.is_deleted == False,
            Contract.status.in_(["active", "performing"]),
            Contract.end_date.between(today, today + timedelta(days=30)),
        ).limit(5)
    )
    upcoming_items = [{"type": "contract_expiry", "label": f"合同到期: {name}", "date": str(end_date)}
                       for name, end_date in contracts_due.all()]

    return {
        "generated_at": today.isoformat(),
        "company_status": "green",
        "quick_metrics": {
            "today_income": 0, "today_expense": 0, "today_net": 0,
            "month_income": month_revenue, "month_expense": month_expense,
            "month_profit": month_revenue - month_expense,
            "income_change_pct": 0, "expense_change_pct": 0,
            "cash_balance": 0,
        },
        "cash_flow": {"daily": []},
        "charging": {
            "today": {"orders": 0, "kwh": 0, "revenue": 0, "avg_price": 0},
            "this_month": {"orders": month_orders, "kwh": round(month_kwh, 2), "revenue": round(month_revenue, 2), "avg_price": round(month_revenue / month_kwh, 4) if month_kwh else 0},
        },
        "projects": {
            "by_status": by_status,
            "total_budget": total_budget, "total_cost": total_cost,
            "budget_usage_pct": round(total_cost / total_budget * 100, 1) if total_budget else 0,
            "delayed_count": 0, "upcoming_milestones": [],
        },
        "finance": {"arap": arap},
        "inventory": {"total_items": 0, "low_stock_count": 0, "total_value": 0, "low_stock_items": []},
        "stations": {"status_counts": status_counts, "top_revenue_stations": top_station_list},
        "upcoming": {"items": upcoming_items},
    }


@router.get("/alerts")
async def get_alerts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cid = current_user.company_id
    today = date.today()
    alerts = []

    overdue_ar = await db.execute(
        select(func.count(ArAp.id), func.coalesce(func.sum(ArAp.remaining_amount), 0)).where(
            ArAp.company_id == cid, ArAp.is_deleted == False, ArAp.type == "ar",
            ArAp.due_date < today, ArAp.remaining_amount > 0,
        )
    )
    cnt, amt = overdue_ar.one()
    if cnt and cnt > 0:
        alerts.append({
            "id": "overdue_ar", "category": "finance", "severity": "warning",
            "title": f"{cnt}笔应收逾期", "message": f"逾期应收总额 ¥{float(amt or 0):,.2f}",
            "suggestion": "请及时催收，避免资金占用",
        })

    overdue_ap = await db.execute(
        select(func.count(ArAp.id), func.coalesce(func.sum(ArAp.remaining_amount), 0)).where(
            ArAp.company_id == cid, ArAp.is_deleted == False, ArAp.type == "ap",
            ArAp.due_date < today, ArAp.remaining_amount > 0,
        )
    )
    cnt, amt = overdue_ap.one()
    if cnt and cnt > 0:
        alerts.append({
            "id": "overdue_ap", "category": "finance", "severity": "warning",
            "title": f"{cnt}笔应付逾期", "message": f"逾期应付总额 ¥{float(amt or 0):,.2f}",
            "suggestion": "请尽快安排付款，维护供应商关系",
        })

    expiring = await db.execute(
        select(func.count(Contract.id)).where(
            Contract.company_id == cid, Contract.is_deleted == False,
            Contract.status.in_(["active", "performing"]),
            Contract.end_date.between(today, today + timedelta(days=15)),
        )
    )
    exp_cnt = expiring.scalar() or 0
    if exp_cnt > 0:
        alerts.append({
            "id": "expiring_contracts", "category": "contract", "severity": "info",
            "title": f"{exp_cnt}份合同即将到期", "message": "15天内有合同到期",
            "suggestion": "提前安排续签或收尾工作",
        })

    from app.models.system.notification import Notification
    linkage_cnt = (await db.execute(
        select(func.count(Notification.id)).where(
            Notification.company_id == cid,
            Notification.category == "linkage",
            Notification.is_read == False,
        )
    )).scalar() or 0
    if linkage_cnt > 0:
        alerts.append({
            "id": "pending_linkages", "category": "linkage", "severity": "warning",
            "title": f"{linkage_cnt}条待确认关联", "message": f"有{linkage_cnt}条业务数据需要确认项目关联",
            "suggestion": "请前往通知中心确认关联，确保数据归集完整",
        })

    return {"alerts": alerts, "total": len(alerts)}


@router.post("/command")
async def send_command(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    command = body.get("command", "")
    try:
        from app.services.context_builder import context_builder
        system_prompt = await context_builder.build_system_prompt(
            db, current_user.company_id, "autopilot",
            "你是云南永充新能源科技集团的经营数据助手。根据问题给出简短可操作的建议。如果涉及具体数据，请如实说明你无法查询实时数据，建议用户查看对应管理页面。"
        )
        answer = await ai_gateway.provider.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": command},
        ])
        return {"command": command, "intent": "general", "data": [], "answer": answer, "timestamp": date.today().isoformat()}
    except Exception as e:
        return {"command": command, "intent": "error", "data": [], "answer": f"AI服务暂不可用: {str(e)}", "timestamp": date.today().isoformat()}


@router.get("/reports/daily")
async def get_daily_briefing(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    try:
        from app.services.context_builder import context_builder
        system_prompt = await context_builder.build_system_prompt(
            db, current_user.company_id, "autopilot",
            "你是云南永充新能源科技集团的经营助手。请生成一句简短的每日经营问候语（包含日期），不超过50字。结合当前经营数据给出鼓励或提醒。"
        )
        briefing = await ai_gateway.provider.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"今天是{today.strftime('%Y年%m月%d日')}"},
        ])
    except Exception:
        briefing = f"今日经营简报 ({today.isoformat()})：系统运行正常。"
    return {"date": today.isoformat(), "data": {}, "briefing": briefing}


@router.get("/finance/check")
async def finance_daily_check(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.auto_finance import auto_finance
    return await auto_finance.auto_daily_finance_check(db, current_user.company_id)


@router.get("/finance/tax")
async def finance_tax_summary(
    month: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.auto_finance import auto_finance
    return await auto_finance.auto_tax_summary(db, current_user.company_id, month)


@router.get("/project/{project_id}/financial-summary")
async def project_financial_summary(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.finance_event_chain import finance_event_chain
    return await finance_event_chain.get_project_financial_summary(
        db, current_user.company_id, project_id
    )
