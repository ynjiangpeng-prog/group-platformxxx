import logging
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system.agent_models import AgentSkill, AgentTask

logger = logging.getLogger(__name__)

SKILL_ACTION_REGISTRY: dict[str, callable] = {}


def register_action(name: str, fn: callable):
    SKILL_ACTION_REGISTRY[name] = fn


async def execute_skill(db: AsyncSession, skill: AgentSkill, params: dict, user_id: str, company_id: str) -> AgentTask:
    task = AgentTask(
        skill_id=str(skill.id),
        task_type="skill",
        status="running",
        title=f"执行技能: {skill.name}",
        input=params,
        company_id=company_id,
        created_by=user_id,
        started_at=datetime.now(),
    )
    db.add(task)
    await db.flush()

    skill.usage_count = (skill.usage_count or 0) + 1
    skill.last_used_at = datetime.now()

    steps = skill.steps or []
    results = []
    success = True

    try:
        for i, step in enumerate(steps):
            action_name = step.get("action", "")
            step_params = {**step.get("params", {}), **params}

            handler = SKILL_ACTION_REGISTRY.get(action_name)
            if not handler:
                raise ValueError(f"未知动作: {action_name}")

            task.progress = int((i / max(len(steps), 1)) * 100)
            result = await handler(db, company_id, user_id, step_params)
            results.append({"step": i, "action": action_name, "result": result})

        task.progress = 100
        task.status = "completed"
        task.output = {"results": results}
        task.completed_at = datetime.now()

        skill.success_count = (skill.success_count or 0) + 1

    except Exception as e:
        logger.exception("技能执行失败 %s: %s", skill.name, e)
        task.status = "failed"
        task.error_message = str(e)
        task.output = {"results": results, "error": str(e)}
        task.completed_at = datetime.now()
        success = False

    await db.flush()
    return task


async def create_template_skills(db: AsyncSession, company_id: str, user_id: str):
    templates = [
        {
            "name": "月度车队账单生成",
            "description": "自动生成所有月结车队的当月账单，包含峰平谷明细",
            "trigger_type": "scheduled",
            "trigger_config": {"cron": "0 9 1 * *"},
            "steps": [{"action": "fleet_billing.generate_all", "params": {"period": "previous_month"}}],
            "category": "charging",
            "icon": "FileText",
        },
        {
            "name": "充电站月度运营报告",
            "description": "汇总所有充电站本月运营数据，生成分析报告",
            "trigger_type": "scheduled",
            "trigger_config": {"cron": "0 10 1 * *"},
            "steps": [
                {"action": "data_query.station_financial", "params": {"period": "previous_month"}},
                {"action": "analysis.station_comparison", "params": {}},
                {"action": "report.generate", "params": {"template": "monthly_station_report"}},
            ],
            "category": "charging",
            "icon": "BarChart3",
        },
        {
            "name": "项目成本归集",
            "description": "汇总项目相关的所有费用：合同付款、电费、人工、采购等",
            "trigger_type": "manual",
            "steps": [
                {"action": "data_query.project_costs", "params": {}},
                {"action": "data_query.project_revenue", "params": {}},
                {"action": "report.generate", "params": {"template": "project_cost_report"}},
            ],
            "category": "project",
            "icon": "Calculator",
        },
        {
            "name": "应收逾期检查",
            "description": "检查所有应收款项，标记逾期并推送催收通知",
            "trigger_type": "scheduled",
            "trigger_config": {"cron": "0 9 * * 1-5"},
            "steps": [
                {"action": "data_query.overdue_ar", "params": {}},
                {"action": "notification.send_overdue_alert", "params": {}},
            ],
            "category": "finance",
            "icon": "AlertTriangle",
        },
        {
            "name": "合同到期预警",
            "description": "检查即将到期的合同并提醒相关人员",
            "trigger_type": "scheduled",
            "trigger_config": {"cron": "0 9 * * 1"},
            "steps": [
                {"action": "data_query.expiring_contracts", "params": {"days": 30}},
                {"action": "notification.send_expiry_alert", "params": {}},
            ],
            "category": "erp",
            "icon": "Clock",
        },
    ]

    created = []
    for tpl in templates:
        existing = (await db.execute(
            select(AgentSkill).where(
                AgentSkill.name == tpl["name"],
                AgentSkill.company_id == company_id,
                AgentSkill.is_deleted == False,
            )
        )).scalar_one_or_none()
        if existing:
            continue

        skill = AgentSkill(
            name=tpl["name"],
            description=tpl["description"],
            trigger_type=tpl["trigger_type"],
            trigger_config=tpl.get("trigger_config", {}),
            steps=tpl.get("steps", []),
            parameters={},
            created_from="template",
            is_template=True,
            category=tpl.get("category"),
            icon=tpl.get("icon"),
            company_id=company_id,
            created_by=user_id,
        )
        db.add(skill)
        created.append(tpl["name"])

    await db.flush()
    return created


async def _fleet_billing_generate_all(db: AsyncSession, company_id: str, user_id: str, params: dict) -> dict:
    from app.services.fleet_billing import fleet_billing_service
    from datetime import date
    period = params.get("period", "")
    if period == "previous_month":
        today = date.today()
        pm = today.month - 1 or 12
        py = today.year if today.month > 1 else today.year - 1
        period = f"{py}-{pm:02d}"
    return await fleet_billing_service.generate_all_monthly_bills(db, company_id, period, user_id)


async def _data_query_station_financial(db: AsyncSession, company_id: str, user_id: str, params: dict) -> dict:
    from app.models.charging.models import StationFinancialMonthly, ChargingStation
    from datetime import date
    period = params.get("period", "")
    if period == "previous_month":
        today = date.today()
        pm = today.month - 1 or 12
        py = today.year if today.month > 1 else today.year - 1
        period = f"{py}-{pm:02d}"

    result = await db.execute(
        select(StationFinancialMonthly).where(
            StationFinancialMonthly.company_id == company_id,
            StationFinancialMonthly.month == period,
            StationFinancialMonthly.is_deleted == False,
        )
    )
    records = result.scalars().all()
    return {"period": period, "stations": len(records), "data": [
        {"station_id": str(r.station_id), "total_revenue": float(r.total_revenue or 0), "total_cost": float(r.total_cost or 0)}
        for r in records
    ]}


async def _data_query_overdue_ar(db: AsyncSession, company_id: str, user_id: str, params: dict) -> dict:
    from app.models.finance.models import ArApRecord
    from datetime import date
    result = await db.execute(
        select(ArApRecord).where(
            ArApRecord.type == "ar",
            ArApRecord.company_id == company_id,
            ArApRecord.is_deleted == False,
            ArApRecord.remaining_amount > 0,
            ArApRecord.due_date < date.today(),
        )
    )
    records = result.scalars().all()
    return {"overdue_count": len(records), "total_overdue": sum(float(r.remaining_amount or 0) for r in records)}


async def _data_query_expiring_contracts(db: AsyncSession, company_id: str, user_id: str, params: dict) -> dict:
    from app.models.erp.models import Contract
    from datetime import date, timedelta
    days = params.get("days", 30)
    target = date.today() + timedelta(days=days)
    result = await db.execute(
        select(Contract).where(
            Contract.company_id == company_id,
            Contract.is_deleted == False,
            Contract.end_date <= target,
            Contract.end_date >= date.today(),
        )
    )
    records = result.scalars().all()
    return {"expiring_count": len(records), "contracts": [{"id": str(c.id), "name": c.name, "end_date": str(c.end_date)} for c in records]}


async def _notification_send(db: AsyncSession, company_id: str, user_id: str, params: dict) -> dict:
    from app.services.notification_service import send_notification
    await send_notification(db, company_id, params.get("title", "系统通知"), params.get("content", ""), params.get("type", "info"))
    return {"sent": True}


async def _analysis_station_comparison(db: AsyncSession, company_id: str, user_id: str, params: dict) -> dict:
    from sqlalchemy import text
    result = await db.execute(text("""
        SELECT s.name, sf.total_revenue, sf.total_cost, sf.gross_profit, sf.gross_margin, sf.total_orders, sf.total_kwh
        FROM station_financial_monthly sf
        JOIN charging_stations s ON s.id = sf.station_id
        WHERE sf.company_id = :cid AND sf.is_deleted = false AND s.is_deleted = false
        ORDER BY sf.total_revenue DESC
    """), {"cid": company_id})
    rows = result.fetchall()
    if not rows:
        return {"analysis": "no_data", "insights": ["暂无充电站财务数据"]}

    insights = []
    top = rows[0]
    insights.append(f"营收最高: {top[0]} (¥{float(top[1]):,.0f})")
    if len(rows) > 1:
        bottom = rows[-1]
        insights.append(f"营收最低: {bottom[0]} (¥{float(bottom[1]):,.0f})")

    avg_margin = sum(float(r[4] or 0) for r in rows) / len(rows)
    insights.append(f"平均毛利率: {avg_margin:.1f}%")

    low_margin = [r for r in rows if float(r[4] or 0) < avg_margin * 0.5]
    if low_margin:
        insights.append(f"毛利率偏低站点: {', '.join(r[0] for r in low_margin[:3])}")

    return {"station_count": len(rows), "insights": insights, "data": [
        {"name": r[0], "revenue": float(r[1] or 0), "cost": float(r[2] or 0), "margin": float(r[4] or 0)} for r in rows
    ]}


async def _report_generate(db: AsyncSession, company_id: str, user_id: str, params: dict) -> dict:
    template = params.get("template", "default")
    return {"report_generated": True, "template": template}


async def _data_query_project_costs(db: AsyncSession, company_id: str, user_id: str, params: dict) -> dict:
    from sqlalchemy import text
    project_id = params.get("project_id")
    base_filter = "AND c.project_id = :pid" if project_id else ""
    query_params = {"cid": company_id}
    if project_id:
        query_params["pid"] = project_id

    contract_costs = (await db.execute(text(f"""
        SELECT COALESCE(SUM(paid_amount), 0) as total_paid, COALESCE(SUM(total_amount), 0) as total_contract
        FROM contracts WHERE is_deleted=false AND company_id=:cid {base_filter}
    """), query_params)).fetchone()

    ar_ap_costs = (await db.execute(text(f"""
        SELECT type, COALESCE(SUM(total_amount),0) as total, COALESCE(SUM(settled_amount),0) as settled
        FROM ar_ap_records WHERE is_deleted=false AND company_id=:cid {base_filter}
        GROUP BY type
    """), query_params)).fetchall()

    bank_out = (await db.execute(text(f"""
        SELECT COALESCE(SUM(ABS(tx_amount)),0) as total_outflow
        FROM bank_transactions WHERE is_deleted=false AND company_id=:cid AND tx_amount < 0 {base_filter.replace('c.project_id','project_id')}
    """), query_params)).fetchone()

    contract_total = float(contract_costs[1] or 0) if contract_costs else 0
    contract_paid = float(contract_costs[0] or 0) if contract_costs else 0
    outflow = float(bank_out[0] or 0) if bank_out else 0

    return {
        "contract_total": contract_total,
        "contract_paid": contract_paid,
        "bank_outflow": outflow,
        "ar_ap": [{"type": r[0], "total": float(r[1]), "settled": float(r[2])} for r in ar_ap_costs],
    }


async def _data_query_project_revenue(db: AsyncSession, company_id: str, user_id: str, params: dict) -> dict:
    from sqlalchemy import text
    project_id = params.get("project_id")
    base_filter = "AND project_id = :pid" if project_id else ""
    query_params = {"cid": company_id}
    if project_id:
        query_params["pid"] = project_id

    charging_rev = (await db.execute(text(f"""
        SELECT COALESCE(SUM(total_amount),0) as revenue, COUNT(*) as orders
        FROM charging_orders WHERE is_deleted=false AND company_id=:cid {base_filter}
    """), query_params)).fetchone()

    bank_in = (await db.execute(text(f"""
        SELECT COALESCE(SUM(tx_amount),0) as total_inflow
        FROM bank_transactions WHERE is_deleted=false AND company_id=:cid AND tx_amount > 0 {base_filter}
    """), query_params)).fetchone()

    return {
        "charging_revenue": float(charging_rev[0] or 0) if charging_rev else 0,
        "charging_orders": int(charging_rev[1] or 0) if charging_rev else 0,
        "bank_inflow": float(bank_in[0] or 0) if bank_in else 0,
    }


async def _notification_send_overdue_alert(db: AsyncSession, company_id: str, user_id: str, params: dict) -> dict:
    overdue_data = await _data_query_overdue_ar(db, company_id, user_id, params)
    count = overdue_data.get("overdue_count", 0)
    total = overdue_data.get("total_overdue", 0)
    try:
        from app.services.notification_service import send_notification
        await send_notification(db, company_id, "逾期应收提醒",
                                f"当前有{count}笔逾期应收，合计¥{total:,.0f}", "warning")
    except Exception:
        pass
    return {"alerts_sent": count, "total_overdue": total}


async def _notification_send_expiry_alert(db: AsyncSession, company_id: str, user_id: str, params: dict) -> dict:
    expiry_data = await _data_query_expiring_contracts(db, company_id, user_id, params)
    count = expiry_data.get("expiring_count", 0)
    try:
        from app.services.notification_service import send_notification
        await send_notification(db, company_id, "合同到期提醒",
                                f"有{count}份合同即将到期", "warning")
    except Exception:
        pass
    return {"alerts_sent": count}


register_action("fleet_billing.generate_all", _fleet_billing_generate_all)
register_action("data_query.station_financial", _data_query_station_financial)
register_action("data_query.overdue_ar", _data_query_overdue_ar)
register_action("data_query.expiring_contracts", _data_query_expiring_contracts)
register_action("notification.send", _notification_send)
register_action("notification.send_overdue_alert", _notification_send_overdue_alert)
register_action("notification.send_expiry_alert", _notification_send_expiry_alert)
register_action("analysis.station_comparison", _analysis_station_comparison)
register_action("report.generate", _report_generate)
register_action("data_query.project_costs", _data_query_project_costs)
register_action("data_query.project_revenue", _data_query_project_revenue)
