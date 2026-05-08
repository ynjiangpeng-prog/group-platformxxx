import json
import logging
import time
from datetime import date, datetime, timedelta
from decimal import Decimal

import httpx
from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ai import AI_API_BASE, AI_API_KEY, AI_MODEL, AVAILABLE_MODELS
from app.services.ai_gateway import get_model_for_task
from app.models.project.models import (
    Project,
    ProjectDailyBudget,
    ProjectDailyTarget,
    ProjectMilestone,
    ConstructionLog,
    SafetyInspection,
    ProjectProcurementApproval,
    ServiceTicket,
    InspectionRecord,
)
from app.models.charging.models import (
    ChargingStation,
    ChargingDevice,
    ChargingOrder,
    StationFinancialMonthly,
    FleetCustomer,
    FleetPaymentBill,
    Partnership,
    RevenueSharePlan,
    ElectricityPayment,
)
from app.models.finance.models import (
    ArApRecord,
    Budget,
    FinanceVoucher,
    Invoice,
    TaxDeclaration,
)
from app.models.erp.models import Supplier, PurchaseOrder, Contract

logger = logging.getLogger(__name__)


def _decimal_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


async def _call_ai(system_prompt: str, user_prompt: str, model: str = None) -> str:
    """Call NVIDIA API for AI completion."""
    headers = {
        "Authorization": f"Bearer {AI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model or AI_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
        "max_tokens": 2000,
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{AI_API_BASE}/chat/completions", headers=headers, json=payload
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


# --- AI result cache (TTL 30 min per company+endpoint) ---
_ai_cache: dict[str, tuple[float, dict]] = {}
_AI_CACHE_TTL = 1800  # 30 minutes


def _cache_key(prefix: str, company_id: str) -> str:
    return f"{prefix}:{company_id}"


def _get_cached(key: str) -> dict | None:
    if key in _ai_cache:
        ts, data = _ai_cache[key]
        if time.time() - ts < _AI_CACHE_TTL:
            return data
        del _ai_cache[key]
    return None


def _set_cached(key: str, data: dict) -> None:
    # Evict stale entries if cache grows too large
    if len(_ai_cache) > 200:
        now = time.time()
        stale = [k for k, (ts, _) in _ai_cache.items() if now - ts > _AI_CACHE_TTL]
        for k in stale:
            del _ai_cache[k]
    _ai_cache[key] = (time.time(), data)


def get_available_models() -> list[dict]:
    """Return list of available NVIDIA models."""
    return AVAILABLE_MODELS


async def analyze_project_risk(db: AsyncSession, company_id: str) -> dict:
    cached = _get_cached(_cache_key("project_risk", company_id))
    if cached:
        return cached
    today = date.today()
    thirty_days_ago = today - timedelta(days=30)

    projects = (await db.execute(
        select(Project).where(
            Project.company_id == company_id,
            Project.is_deleted == False,
            Project.status.in_(["active", "in_progress", "pending"]),
        )
    )).scalars().all()

    project_data = []
    for p in projects:
        delay_days = 0
        if p.end_date and p.end_date < today and p.status not in ["completed", "closed"]:
            delay_days = (today - p.end_date).days

        budget_overrun = float(p.actual_cost or 0) - float(p.total_budget or 0)
        budget_rate = float(p.actual_cost or 0) / float(p.total_budget or 1) * 100

        milestones = (await db.execute(
            select(ProjectMilestone).where(
                ProjectMilestone.project_id == p.id,
                ProjectMilestone.is_deleted == False,
            )
        )).scalars().all()
        overdue_milestones = [m for m in milestones if m.planned_date and m.planned_date < today and m.status != "completed"]

        recent_logs = (await db.execute(
            select(ConstructionLog).where(
                ConstructionLog.project_id == p.id,
                ConstructionLog.is_deleted == False,
                ConstructionLog.log_date >= thirty_days_ago,
            )
        )).scalars().all()
        safety_issues = [l for l in recent_logs if l.safety_status != "normal"]

        safety_inspections = (await db.execute(
            select(SafetyInspection).where(
                SafetyInspection.project_id == p.id,
                SafetyInspection.is_deleted == False,
                SafetyInspection.overall_level.in_(["warning", "danger"]),
            )
        )).scalars().all()

        project_data.append({
            "name": p.name,
            "status": p.status,
            "progress": p.progress,
            "total_budget": float(p.total_budget or 0),
            "actual_cost": float(p.actual_cost or 0),
            "budget_overrun": budget_overrun,
            "budget_rate": round(budget_rate, 1),
            "delay_days": delay_days,
            "start_date": p.start_date.isoformat() if p.start_date else None,
            "end_date": p.end_date.isoformat() if p.end_date else None,
            "overdue_milestones_count": len(overdue_milestones),
            "safety_issues_count": len(safety_issues),
            "safety_inspection_warnings": len(safety_inspections),
        })

    if not project_data:
        return {"summary": "暂无进行中项目数据", "risks": [], "recommendations": []}

    system_prompt = (
        "你是一位资深的电力工程项目管理专家。根据提供的项目数据分析工期延误、成本超支、安全风险等问题。"
        "请用JSON格式返回，包含: summary(总体风险概述), risks(风险列表，每项含project,category,risk_level,description),"
        "recommendations(建议列表，每项含project,action,priority,reason)。risk_level只能是low/medium/high/critical。"
    )
    user_prompt = f"以下是公司当前所有进行中项目的数据，请进行风险分析:\n{json.dumps(project_data, ensure_ascii=False, default=_decimal_default)}"

    try:
        result = await _call_ai(system_prompt, user_prompt, model=get_model_for_task("reasoning"))
        parsed = json.loads(result)
    except json.JSONDecodeError:
        parsed = {"summary": result, "risks": [], "recommendations": []}
    except Exception as e:
        logger.error(f"AI project risk analysis failed: {e}")
        parsed = {"summary": f"AI分析暂时不可用: {str(e)}", "risks": [], "recommendations": []}
    _set_cached(_cache_key("project_risk", company_id), parsed)
    return parsed


async def analyze_station_revenue(db: AsyncSession, company_id: str) -> dict:
    cached = _get_cached(_cache_key("station_revenue", company_id))
    if cached:
        return cached
    three_months_ago = (date.today().replace(day=1) - timedelta(days=90)).strftime("%Y-%m")

    stations = (await db.execute(
        select(ChargingStation).where(
            ChargingStation.company_id == company_id,
            ChargingStation.is_deleted == False,
            ChargingStation.status == "operating",
        )
    )).scalars().all()

    station_data = []
    for s in stations:
        financials = (await db.execute(
            select(StationFinancialMonthly).where(
                StationFinancialMonthly.station_id == s.id,
                StationFinancialMonthly.is_deleted == False,
                StationFinancialMonthly.month >= three_months_ago,
            ).order_by(StationFinancialMonthly.month)
        )).scalars().all()

        devices = (await db.execute(
            select(ChargingDevice).where(
                ChargingDevice.station_id == s.id,
                ChargingDevice.is_deleted == False,
            )
        )).scalars().all()
        offline_devices = [d for d in devices if d.status == "offline"]
        fault_devices = [d for d in devices if d.status == "fault"]

        monthly_data = []
        for f in financials:
            monthly_data.append({
                "month": f.month,
                "total_revenue": float(f.total_revenue or 0),
                "total_cost": float(f.total_cost or 0),
                "gross_profit": float(f.gross_profit or 0),
                "gross_margin": float(f.gross_margin or 0),
                "total_kwh": float(f.total_kwh or 0),
                "total_orders": f.total_orders,
            })

        station_data.append({
            "name": s.name,
            "station_type": s.station_type,
            "monthly_financial": monthly_data,
            "total_devices": len(devices),
            "offline_devices": len(offline_devices),
            "fault_devices": len(fault_devices),
            "monthly_rent": float(s.monthly_rent or 0),
            "power_capacity": float(s.power_capacity or 0),
        })

    partnerships = (await db.execute(
        select(Partnership).where(
            Partnership.company_id == company_id,
            Partnership.is_deleted == False,
            Partnership.status == "active",
        )
    )).scalars().all()
    partnership_data = []
    for p in partnerships:
        shares = (await db.execute(
            select(RevenueSharePlan).where(
                RevenueSharePlan.partnership_id == p.id,
                RevenueSharePlan.is_deleted == False,
                RevenueSharePlan.period >= three_months_ago,
            )
        )).scalars().all()
        partnership_data.append({
            "partner_name": p.partner_name,
            "cooperation_type": p.cooperation_type,
            "recent_shares": [{
                "period": s.period,
                "total_revenue": float(s.total_revenue or 0),
                "our_share_amount": float(s.our_share_amount or 0),
                "net_share_amount": float(s.net_share_amount or 0),
            } for s in shares],
        })

    if not station_data:
        return {"summary": "暂无运营中充电站数据", "analysis": [], "recommendations": []}

    system_prompt = (
        "你是一位充电站运营优化专家。根据提供的充电站运营数据分析收益优化空间、设备利用率、分成策略建议。"
        "请用JSON格式返回，包含: summary(总体概述), analysis(各站点分析，每项含station,issues,growth_trend,revenue_score_0_100),"
        "recommendations(建议列表，每项含station,action,expected_impact,priority)。"
    )
    user_prompt = (
        f"充电站运营数据:\n{json.dumps(station_data, ensure_ascii=False, default=_decimal_default)}\n\n"
        f"合作分成数据:\n{json.dumps(partnership_data, ensure_ascii=False, default=_decimal_default)}"
    )

    try:
        result = await _call_ai(system_prompt, user_prompt)
        parsed = json.loads(result)
    except json.JSONDecodeError:
        parsed = {"summary": result, "analysis": [], "recommendations": []}
    except Exception as e:
        logger.error(f"AI station revenue analysis failed: {e}")
        parsed = {"summary": f"AI分析暂时不可用: {str(e)}", "analysis": [], "recommendations": []}
    _set_cached(_cache_key("station_revenue", company_id), parsed)
    return parsed


async def analyze_finance_health(db: AsyncSession, company_id: str) -> dict:
    cached = _get_cached(_cache_key("finance_health", company_id))
    if cached:
        return cached
    today = date.today()
    current_month = today.strftime("%Y-%m")
    three_months_ago_month = (today.replace(day=1) - timedelta(days=90)).strftime("%Y-%m")

    ar_records = (await db.execute(
        select(ArApRecord).where(
            ArApRecord.company_id == company_id,
            ArApRecord.is_deleted == False,
            ArApRecord.type == "ar",
            ArApRecord.remaining_amount > 0,
        )
    )).scalars().all()
    ap_records = (await db.execute(
        select(ArApRecord).where(
            ArApRecord.company_id == company_id,
            ArApRecord.is_deleted == False,
            ArApRecord.type == "ap",
            ArApRecord.remaining_amount > 0,
        )
    )).scalars().all()

    overdue_ar = [r for r in ar_records if r.due_date and r.due_date < today]
    overdue_ap = [r for r in ap_records if r.due_date and r.due_date < today]

    total_ar = sum(float(r.remaining_amount or 0) for r in ar_records)
    total_ap = sum(float(r.remaining_amount or 0) for r in ap_records)
    total_overdue_ar = sum(float(r.remaining_amount or 0) for r in overdue_ar)
    total_overdue_ap = sum(float(r.remaining_amount or 0) for r in overdue_ap)

    budgets = (await db.execute(
        select(Budget).where(
            Budget.company_id == company_id,
            Budget.is_deleted == False,
            Budget.status == "approved",
        )
    )).scalars().all()
    budget_data = []
    for b in budgets:
        execution_rate = float(b.total_used or 0) / float(b.total_budget or 1) * 100
        budget_data.append({
            "name": b.name,
            "period": b.period,
            "total_budget": float(b.total_budget or 0),
            "total_used": float(b.total_used or 0),
            "execution_rate": round(execution_rate, 1),
        })

    recent_vouchers = (await db.execute(
        select(FinanceVoucher).where(
            FinanceVoucher.company_id == company_id,
            FinanceVoucher.is_deleted == False,
            FinanceVoucher.period >= three_months_ago_month,
        )
    )).scalars().all()
    monthly_debit = {}
    for v in recent_vouchers:
        monthly_debit.setdefault(v.period, 0)
        monthly_debit[v.period] += float(v.total_debit or 0)

    tax_declarations = (await db.execute(
        select(TaxDeclaration).where(
            TaxDeclaration.company_id == company_id,
            TaxDeclaration.is_deleted == False,
            TaxDeclaration.period >= three_months_ago_month,
        )
    )).scalars().all()
    tax_data = [{
        "tax_type": t.tax_type,
        "period": t.period,
        "taxable_amount": float(t.taxable_amount or 0),
        "tax_amount": float(t.tax_amount or 0),
        "paid_amount": float(t.paid_amount or 0),
        "status": t.status,
    } for t in tax_declarations]

    finance_summary = {
        "total_ar": total_ar,
        "total_ap": total_ap,
        "total_overdue_ar": total_overdue_ar,
        "total_overdue_ap": total_overdue_ap,
        "overdue_ar_count": len(overdue_ar),
        "overdue_ap_count": len(overdue_ap),
        "ar_count": len(ar_records),
        "ap_count": len(ap_records),
        "monthly_debit": monthly_debit,
        "budgets": budget_data,
        "tax_declarations": tax_data,
    }

    system_prompt = (
        "你是一位集团财务分析专家和税务筹划顾问。根据提供的财务数据分析现金流状况、应收账款风险、预算偏差、税务筹划建议。"
        "请用JSON格式返回，包含: summary(总体财务健康概述), cash_flow(现金流分析含assessment和forecast),"
        "risk_items(风险项列表，每项含category,severity,description,amount),"
        "recommendations(建议列表，每项含category,action,expected_benefit,priority)。severity为low/medium/high/critical。"
    )
    user_prompt = f"公司财务数据概览:\n{json.dumps(finance_summary, ensure_ascii=False, default=_decimal_default)}"

    try:
        result = await _call_ai(system_prompt, user_prompt)
        parsed = json.loads(result)
    except json.JSONDecodeError:
        parsed = {"summary": result, "risk_items": [], "recommendations": []}
    except Exception as e:
        logger.error(f"AI finance analysis failed: {e}")
        parsed = {"summary": f"AI分析暂时不可用: {str(e)}", "risk_items": [], "recommendations": []}
    _set_cached(_cache_key("finance_health", company_id), parsed)
    return parsed


async def analyze_procurement(db: AsyncSession, company_id: str) -> dict:
    cached = _get_cached(_cache_key("procurement", company_id))
    if cached:
        return cached
    suppliers = (await db.execute(
        select(Supplier).where(
            Supplier.company_id == company_id,
            Supplier.is_deleted == False,
            Supplier.status == 1,
        )
    )).scalars().all()

    recent_orders = (await db.execute(
        select(PurchaseOrder).where(
            PurchaseOrder.company_id == company_id,
            PurchaseOrder.is_deleted == False,
        ).order_by(PurchaseOrder.created_at.desc()).limit(50)
    )).scalars().all()

    active_contracts = (await db.execute(
        select(Contract).where(
            Contract.company_id == company_id,
            Contract.is_deleted == False,
            Contract.status == "active",
        )
    )).scalars().all()

    supplier_data = [{
        "name": s.name,
        "category": s.category,
        "rating": s.rating,
        "order_count": sum(1 for o in recent_orders if o.supplier_id == s.id),
    } for s in suppliers]

    order_data = [{
        "po_no": o.po_no,
        "title": o.title,
        "total_amount": float(o.total_amount or 0),
        "status": o.status,
        "delivery_date": o.delivery_date.isoformat() if o.delivery_date else None,
    } for o in recent_orders]

    contract_data = [{
        "contract_no": c.contract_no,
        "name": c.name,
        "contract_type": c.contract_type,
        "total_amount": float(c.total_amount or 0),
        "paid_amount": float(c.paid_amount or 0),
        "end_date": c.end_date.isoformat() if c.end_date else None,
    } for c in active_contracts]

    procurement_summary = {
        "suppliers": supplier_data,
        "recent_orders": order_data,
        "active_contracts": contract_data,
    }

    system_prompt = (
        "你是一位供应链管理和采购优化专家。根据提供的采购数据、供应商数据、合同数据分析采购决策优化方案。"
        "请用JSON格式返回，包含: summary(总体概述), supplier_analysis(供应商评估，含concentration_risk和rating_issues),"
        "recommendations(建议列表，每项含category,action,expected_saving,priority,reason)。"
    )
    user_prompt = f"采购与合同数据:\n{json.dumps(procurement_summary, ensure_ascii=False, default=_decimal_default)}"

    try:
        result = await _call_ai(system_prompt, user_prompt)
        parsed = json.loads(result)
    except json.JSONDecodeError:
        parsed = {"summary": result, "supplier_analysis": {}, "recommendations": []}
    except Exception as e:
        logger.error(f"AI procurement analysis failed: {e}")
        parsed = {"summary": f"AI分析暂时不可用: {str(e)}", "supplier_analysis": {}, "recommendations": []}
    _set_cached(_cache_key("procurement", company_id), parsed)
    return parsed


async def analyze_cross_business(db: AsyncSession, company_id: str) -> dict:
    cached = _get_cached(_cache_key("cross_business", company_id))
    if cached:
        return cached
    today = date.today()
    current_month = today.strftime("%Y-%m")

    project_count = (await db.execute(
        select(func.count()).select_from(Project).where(
            Project.company_id == company_id,
            Project.is_deleted == False,
            Project.status.in_(["active", "in_progress"]),
        )
    )).scalar() or 0

    total_project_budget = (await db.execute(
        select(func.coalesce(func.sum(Project.total_budget), 0)).where(
            Project.company_id == company_id,
            Project.is_deleted == False,
            Project.status.in_(["active", "in_progress"]),
        )
    )).scalar() or 0

    total_project_cost = (await db.execute(
        select(func.coalesce(func.sum(Project.actual_cost), 0)).where(
            Project.company_id == company_id,
            Project.is_deleted == False,
            Project.status.in_(["active", "in_progress"]),
        )
    )).scalar() or 0

    station_count = (await db.execute(
        select(func.count()).select_from(ChargingStation).where(
            ChargingStation.company_id == company_id,
            ChargingStation.is_deleted == False,
            ChargingStation.status == "operating",
        )
    )).scalar() or 0

    recent_station_revenue = (await db.execute(
        select(func.coalesce(func.sum(StationFinancialMonthly.total_revenue), 0)).where(
            StationFinancialMonthly.company_id == company_id,
            StationFinancialMonthly.is_deleted == False,
            StationFinancialMonthly.month >= current_month,
        )
    )).scalar() or 0

    total_ar = (await db.execute(
        select(func.coalesce(func.sum(ArApRecord.remaining_amount), 0)).where(
            ArApRecord.company_id == company_id,
            ArApRecord.is_deleted == False,
            ArApRecord.type == "ar",
        )
    )).scalar() or 0

    total_ap = (await db.execute(
        select(func.coalesce(func.sum(ArApRecord.remaining_amount), 0)).where(
            ArApRecord.company_id == company_id,
            ArApRecord.is_deleted == False,
            ArApRecord.type == "ap",
        )
    )).scalar() or 0

    active_contracts_count = (await db.execute(
        select(func.count()).select_from(Contract).where(
            Contract.company_id == company_id,
            Contract.is_deleted == False,
            Contract.status == "active",
        )
    )).scalar() or 0

    total_contract_amount = (await db.execute(
        select(func.coalesce(func.sum(Contract.total_amount), 0)).where(
            Contract.company_id == company_id,
            Contract.is_deleted == False,
            Contract.status == "active",
        )
    )).scalar() or 0

    cross_data = {
        "project": {
            "active_count": project_count,
            "total_budget": float(total_project_budget),
            "total_cost": float(total_project_cost),
            "budget_utilization": float(total_project_cost) / float(total_project_budget or 1) * 100,
        },
        "charging": {
            "operating_stations": station_count,
            "recent_revenue": float(recent_station_revenue),
        },
        "finance": {
            "total_ar": float(total_ar),
            "total_ap": float(total_ap),
            "net_position": float(total_ar) - float(total_ap),
        },
        "contracts": {
            "active_count": active_contracts_count,
            "total_amount": float(total_contract_amount),
        },
    }

    system_prompt = (
        "你是一位集团经营决策顾问。根据提供的跨业务板块数据进行综合分析，提出资源调配建议和经营决策建议。"
        "请用JSON格式返回，包含: summary(集团整体经营概述), board_overview(各板块状态评估),"
        "resource_allocation(资源调配建议，每项含from_board,to_board,resource_type,reason),"
        "strategic_recommendations(战略建议列表，每项含title,description,impact,priority,time_horizon)。"
    )
    user_prompt = f"集团各业务板块数据概览:\n{json.dumps(cross_data, ensure_ascii=False, default=_decimal_default)}"

    try:
        result = await _call_ai(system_prompt, user_prompt)
        parsed = json.loads(result)
    except json.JSONDecodeError:
        parsed = {"summary": result, "board_overview": {}, "resource_allocation": [], "strategic_recommendations": []}
    except Exception as e:
        logger.error(f"AI cross-business analysis failed: {e}")
        parsed = {"summary": f"AI分析暂时不可用: {str(e)}", "board_overview": {}, "resource_allocation": [], "strategic_recommendations": []}
    _set_cached(_cache_key("cross_business", company_id), parsed)
    return parsed


async def analyze_device_health(db: AsyncSession, company_id: str) -> dict:
    cached = _get_cached(_cache_key("device_health", company_id))
    if cached:
        return cached
    stations = (await db.execute(
        select(ChargingStation).where(
            ChargingStation.company_id == company_id,
            ChargingStation.is_deleted == False,
            ChargingStation.status == "operating",
        )
    )).scalars().all()

    device_data = []
    for s in stations:
        devices = (await db.execute(
            select(ChargingDevice).where(
                ChargingDevice.station_id == s.id,
                ChargingDevice.is_deleted == False,
            )
        )).scalars().all()
        for d in devices:
            avg_kwh_per_charge = float(d.total_charging_kwh or 0) / max(d.total_charging_count or 1, 1)
            device_data.append({
                "station_name": s.name,
                "device_code": d.device_code,
                "device_type": d.device_type,
                "manufacturer": d.manufacturer,
                "model": d.model,
                "rated_power": float(d.rated_power or 0),
                "status": d.status,
                "total_kwh": float(d.total_charging_kwh or 0),
                "total_count": d.total_charging_count,
                "avg_kwh_per_charge": round(avg_kwh_per_charge, 2),
                "install_date": d.install_date.isoformat() if d.install_date else None,
            })

    if not device_data:
        return {"summary": "暂无设备数据", "devices": [], "recommendations": []}

    system_prompt = (
        "你是一位充电设备运维专家。根据提供的设备数据分析设备健康状况、故障预警和维护建议。"
        "请用JSON格式返回，包含: summary(总体设备健康状况), devices_at_risk(风险设备列表，每项含device_code,station,risk_type,risk_level,reason),"
        "maintenance_plan(维护建议列表，每项含device_code,action,urgency,estimated_cost)。risk_level为low/medium/high/critical。"
    )
    user_prompt = f"充电设备数据:\n{json.dumps(device_data, ensure_ascii=False, default=_decimal_default)}"

    try:
        result = await _call_ai(system_prompt, user_prompt)
        parsed = json.loads(result)
    except json.JSONDecodeError:
        parsed = {"summary": result, "devices_at_risk": [], "maintenance_plan": []}
    except Exception as e:
        logger.error(f"AI device health analysis failed: {e}")
        parsed = {"summary": f"AI分析暂时不可用: {str(e)}", "devices_at_risk": [], "maintenance_plan": []}
    _set_cached(_cache_key("device_health", company_id), parsed)
    return parsed


async def analyze_customer_churn(db: AsyncSession, company_id: str) -> dict:
    cached = _get_cached(_cache_key("customer_churn", company_id))
    if cached:
        return cached
    fleets = (await db.execute(
        select(FleetCustomer).where(
            FleetCustomer.company_id == company_id,
            FleetCustomer.is_deleted == False,
            FleetCustomer.status == "active",
        )
    )).scalars().all()

    fleet_data = []
    for f in fleets:
        recent_bills = (await db.execute(
            select(FleetPaymentBill).where(
                FleetPaymentBill.fleet_id == f.id,
                FleetPaymentBill.is_deleted == False,
            ).order_by(FleetPaymentBill.period.desc()).limit(6)
        )).scalars().all()

        fleet_data.append({
            "fleet_name": f.fleet_name,
            "fleet_size": f.fleet_size,
            "balance": float(f.balance or 0),
            "credit_limit": float(f.credit_limit or 0),
            "total_charged_kwh": float(f.total_charged_kwh or 0),
            "total_payment": float(f.total_payment or 0),
            "recent_bills": [{
                "period": b.period,
                "total_kwh": float(b.total_kwh or 0),
                "total_amount": float(b.total_amount or 0),
                "payment_status": b.payment_status,
            } for b in recent_bills],
        })

    if not fleet_data:
        return {"summary": "暂无车队客户数据", "customers": [], "recommendations": []}

    system_prompt = (
        "你是一位客户关系管理和客户流失预警专家。根据提供的车队客户数据，分析客户活跃度、流失风险和挽回建议。"
        "请用JSON格式返回，包含: summary(总体客户健康度), at_risk_customers(风险客户列表，每项含fleet_name,risk_level,reason,engagement_score_0_100),"
        "recommendations(建议列表，每项含fleet_name,action,expected_outcome,priority)。risk_level为low/medium/high/critical。"
    )
    user_prompt = f"车队客户数据:\n{json.dumps(fleet_data, ensure_ascii=False, default=_decimal_default)}"

    try:
        result = await _call_ai(system_prompt, user_prompt)
        parsed = json.loads(result)
    except json.JSONDecodeError:
        parsed = {"summary": result, "at_risk_customers": [], "recommendations": []}
    except Exception as e:
        logger.error(f"AI customer churn analysis failed: {e}")
        parsed = {"summary": f"AI分析暂时不可用: {str(e)}", "at_risk_customers": [], "recommendations": []}
    _set_cached(_cache_key("customer_churn", company_id), parsed)
    return parsed


async def generate_daily_briefing(db: AsyncSession, company_id: str, user_id: str) -> dict:
    cached = _get_cached(_cache_key("daily_briefing", company_id))
    if cached:
        return cached
    today = date.today()

    project_stats = (await db.execute(
        select(Project.status, func.count()).where(
            Project.company_id == company_id, Project.is_deleted == False
        ).group_by(Project.status)
    )).all()

    overdue_projects = (await db.execute(
        select(Project.name, Project.end_date, Project.progress).where(
            Project.company_id == company_id, Project.is_deleted == False,
            Project.end_date < today, Project.status.notin_(["completed", "closed"]),
        )
    )).all()

    overdue_ar = (await db.execute(
        select(ArApRecord.counterparty, ArApRecord.remaining_amount, ArApRecord.due_date).where(
            ArApRecord.company_id == company_id, ArApRecord.is_deleted == False,
            ArApRecord.type == "ar", ArApRecord.due_date < today, ArApRecord.remaining_amount > 0,
        )
    )).all()

    device_faults = (await db.execute(
        select(ChargingDevice.device_code, ChargingStation.name, ChargingDevice.status).join(
            ChargingStation, ChargingStation.id == ChargingDevice.station_id
        ).where(
            ChargingDevice.company_id == company_id, ChargingDevice.is_deleted == False,
            ChargingDevice.status.in_(["fault", "offline"]),
        )
    )).all()

    pending_tickets = (await db.execute(
        select(func.count()).select_from(
            select(ServiceTicket).where(
                ServiceTicket.company_id == company_id, ServiceTicket.is_deleted == False,
                ServiceTicket.status == "pending",
            ).subquery()
        )
    )).scalar() or 0

    upcoming_inspections = (await db.execute(
        select(InspectionRecord.inspection_date, InspectionRecord.inspection_type, Project.name).join(
            Project, Project.id == InspectionRecord.project_id
        ).where(
            InspectionRecord.company_id == company_id, InspectionRecord.is_deleted == False,
            InspectionRecord.rectification_required == True,
            InspectionRecord.rectification_status == "pending",
        ).limit(5)
    )).all()

    data = {
        "date": today.isoformat(),
        "project_stats": {s: c for s, c in project_stats},
        "overdue_projects": [{"name": n, "end_date": str(e), "progress": p} for n, e, p in overdue_projects],
        "overdue_ar": [{"counterparty": c, "amount": float(a), "due_date": str(d)} for c, a, d in overdue_ar],
        "device_faults": [{"device_code": c, "station": n, "status": s} for c, n, s in device_faults],
        "pending_service_tickets": pending_tickets,
        "pending_rectifications": [{"date": str(d), "type": t, "project": n} for d, t, n in upcoming_inspections],
    }

    system_prompt = (
        "你是一位集团高管每日简报助手。根据提供的当日运营数据，生成一份结构化的每日管理简报。"
        "请用JSON格式返回，包含: greeting(一句话问候语，如'早上好，张总'), "
        "headline(核心头条，一句话概括今天最重要的事), "
        "alerts(预警列表，每项含level[critical/high/medium], title, detail), "
        "highlights(亮点列表，每项含title, detail), "
        "todo_suggestions(今日建议关注事项，每项含title, priority, link_suggestion), "
        "closing(一句鼓励的话)。语气专业但不生硬。"
    )
    user_prompt = f"今日运营数据:\n{json.dumps(data, ensure_ascii=False, default=_decimal_default)}"

    try:
        result = await _call_ai(system_prompt, user_prompt)
        briefing = json.loads(result)
        briefing["raw_data"] = data
    except Exception as e:
        briefing = {"greeting": "早上好", "headline": "简报生成失败", "alerts": [], "highlights": [], "todo_suggestions": [], "closing": "", "raw_data": data}
    _set_cached(_cache_key("daily_briefing", company_id), briefing)
    return briefing


async def execute_ai_task(db: AsyncSession, company_id: str, user_id: str, task_type: str, params: dict) -> dict:
    notifications = []

    if task_type == "create_alert":
        target_module = params.get("module", "all")
        alert_data = {}
        if target_module in ("project", "all"):
            overdue = (await db.execute(
                select(Project.name, Project.end_date).where(
                    Project.company_id == company_id, Project.is_deleted == False,
                    Project.end_date < date.today(), Project.status.notin_(["completed", "closed"]),
                )
            )).all()
            for name, end_date in overdue:
                notifications.append({
                    "user_id": user_id, "category": "project_risk",
                    "title": f"工期延误: {name}",
                    "content": f"计划完工日 {end_date}，已逾期",
                    "link": "/project/list",
                })

        if target_module in ("finance", "all"):
            overdue_ar = (await db.execute(
                select(ArApRecord.counterparty, ArApRecord.remaining_amount).where(
                    ArApRecord.company_id == company_id, ArApRecord.is_deleted == False,
                    ArApRecord.type == "ar", ArApRecord.due_date < date.today(), ArApRecord.remaining_amount > 0,
                )
            )).all()
            for counterparty, amount in overdue_ar:
                notifications.append({
                    "user_id": user_id, "category": "finance_risk",
                    "title": f"应收逾期: {counterparty}",
                    "content": f"逾期金额 ¥{float(amount):,.0f}",
                    "link": "/finance/ar-ap",
                })

        if target_module in ("charging", "all"):
            faults = (await db.execute(
                select(ChargingDevice.device_code, ChargingStation.name).join(
                    ChargingStation, ChargingStation.id == ChargingDevice.station_id
                ).where(
                    ChargingDevice.company_id == company_id, ChargingDevice.is_deleted == False,
                    ChargingDevice.status.in_(["fault", "offline"]),
                )
            )).all()
            for code, station in faults:
                notifications.append({
                    "user_id": user_id, "category": "device_alert",
                    "title": f"设备异常: {code}",
                    "content": f"站点 {station} 设备故障/离线",
                    "link": "/charging/device",
                })

        return {"task_type": task_type, "status": "completed", "notifications_created": len(notifications), "notifications": notifications}

    elif task_type == "summarize_module":
        module = params.get("module", "project")
        summaries = {
            "project": await analyze_project_risk(db, company_id),
            "charging": await analyze_station_revenue(db, company_id),
            "finance": await analyze_finance_health(db, company_id),
        }
        return {"task_type": task_type, "module": module, "result": summaries.get(module, {"summary": "未知模块"})}

    elif task_type == "generate_report":
        report = await generate_daily_briefing(db, company_id, user_id)
        return {"task_type": task_type, "status": "completed", "report": report}

    return {"task_type": task_type, "status": "unknown_task"}
