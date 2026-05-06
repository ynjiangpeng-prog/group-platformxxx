from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.charging import ChargingDevice, ChargingOrder, ChargingStation, Partnership, RevenueSharePlan, StationFinancialMonthly
from app.models.erp.models import Contract
from app.models.finance.models import Invoice, ArApRecord, FinanceVoucher
from app.models.organization import User
from app.models.project.models import ConstructionLog, Project, ServiceTicket
from app.models.business.models import ProjectDailyPlan, ProjectDailyFeedback, WorkHourRecord
from app.services.project_cost import ProjectCostService

router = APIRouter(prefix="/project", tags=["项目定位与成本"])


class LocationMatchRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    accuracy: float | None = None


@router.post("/match-by-location")
async def match_by_location(
    body: LocationMatchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    matches = await ProjectCostService.auto_match_project(
        latitude=body.latitude,
        longitude=body.longitude,
        db=db,
        company_id=current_user.company_id,
    )
    return {"matches": matches}


@router.get("/{project_id}/cost-summary")
async def get_cost_summary(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    summary = await ProjectCostService.get_cost_summary(project_id, db)
    trend = await ProjectCostService.get_monthly_trend(project_id, db)
    summary["monthly_trend"] = trend
    return summary


@router.get("/{project_id}/cost-breakdown")
async def get_cost_breakdown(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await ProjectCostService.get_project_full_cost_breakdown(project_id, db)


@router.get("/{project_id}/stations")
async def get_project_stations(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChargingStation)
        .where(ChargingStation.project_id == project_id, ChargingStation.is_deleted == False, ChargingStation.company_id == current_user.company_id)
        .order_by(ChargingStation.created_at.desc())
    )
    stations = result.scalars().all()
    station_ids = [s.id for s in stations]
    device_counts = {}
    if station_ids:
        rows = await db.execute(
            select(ChargingDevice.station_id, func.count(ChargingDevice.id))
            .where(ChargingDevice.station_id.in_(station_ids), ChargingDevice.is_deleted == False)
            .group_by(ChargingDevice.station_id)
        )
        device_counts = {str(r[0]): r[1] for r in rows.all()}
    items = []
    for s in stations:
        items.append({
            "id": str(s.id), "station_code": s.station_code, "name": s.name,
            "station_type": s.station_type, "status": s.status,
            "address": s.address, "total_parking": s.total_parking,
            "power_capacity": float(s.power_capacity) if s.power_capacity else None,
            "monthly_rent": float(s.monthly_rent) if s.monthly_rent else None,
            "operation_start_date": str(s.operation_start_date) if s.operation_start_date else None,
            "device_count": device_counts.get(str(s.id), 0),
        })
    return {"items": items, "total": len(items)}


@router.get("/{project_id}/operations-summary")
async def get_project_operations_summary(
    project_id: str,
    station_id: str | None = None,
    month_start: str | None = None,
    month_end: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    station_q = select(ChargingStation.id).where(
        ChargingStation.project_id == project_id, ChargingStation.is_deleted == False,
        ChargingStation.company_id == current_user.company_id,
    )
    if station_id:
        station_q = station_q.where(ChargingStation.id == station_id)
    station_result = await db.execute(station_q)
    station_ids = [r[0] for r in station_result.all()]
    if not station_ids:
        return {"monthly": [], "totals": {"revenue": 0, "cost": 0, "profit": 0, "orders": 0, "kwh": 0}}

    q = select(StationFinancialMonthly).where(
        StationFinancialMonthly.station_id.in_(station_ids),
        StationFinancialMonthly.is_deleted == False,
        StationFinancialMonthly.company_id == current_user.company_id,
    )
    if month_start:
        q = q.where(StationFinancialMonthly.month >= month_start)
    if month_end:
        q = q.where(StationFinancialMonthly.month <= month_end)
    q = q.order_by(StationFinancialMonthly.month.desc())
    result = await db.execute(q)
    records = result.scalars().all()

    totals = {"revenue": 0, "cost": 0, "profit": 0, "orders": 0, "kwh": 0}
    monthly = []
    for r in records:
        cost = float(r.electricity_cost or 0) + float(r.rent_cost or 0) + float(r.depreciation or 0) + float(r.maintenance_cost or 0) + float(r.labor_cost or 0)
        revenue = float(r.total_revenue or 0)
        profit = revenue - cost
        totals["revenue"] += revenue
        totals["cost"] += cost
        totals["profit"] += profit
        totals["orders"] += r.total_orders or 0
        totals["kwh"] += float(r.total_kwh or 0)
        monthly.append({
            "id": str(r.id), "station_id": str(r.station_id), "month": r.month,
            "total_orders": r.total_orders, "total_kwh": float(r.total_kwh or 0),
            "total_energy_revenue": float(r.total_energy_revenue or 0),
            "total_service_revenue": float(r.total_service_revenue or 0),
            "total_revenue": revenue,
            "electricity_cost": float(r.electricity_cost or 0),
            "rent_cost": float(r.rent_cost or 0),
            "depreciation": float(r.depreciation or 0),
            "maintenance_cost": float(r.maintenance_cost or 0),
            "labor_cost": float(r.labor_cost or 0),
            "total_cost": cost, "gross_profit": profit,
            "gross_margin": float(r.gross_margin or 0), "status": r.status,
        })
    return {"monthly": monthly, "totals": totals}


@router.get("/{project_id}/revenue-shares")
async def get_project_revenue_shares(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    station_q = select(ChargingStation.id).where(
        ChargingStation.project_id == project_id, ChargingStation.is_deleted == False,
        ChargingStation.company_id == current_user.company_id,
    )
    station_result = await db.execute(station_q)
    station_ids = [r[0] for r in station_result.all()]
    if not station_ids:
        return {"items": [], "total": 0}

    q = select(RevenueSharePlan).where(
        RevenueSharePlan.station_id.in_(station_ids),
        RevenueSharePlan.is_deleted == False,
        RevenueSharePlan.company_id == current_user.company_id,
    ).order_by(RevenueSharePlan.period.desc())
    result = await db.execute(q)
    plans = result.scalars().all()

    partnership_ids = list(set(str(p.partnership_id) for p in plans))
    partner_map = {}
    if partnership_ids:
        p_result = await db.execute(select(Partnership).where(Partnership.id.in_(partnership_ids)))
        for p in p_result.scalars().all():
            partner_map[str(p.id)] = p.partner_name

    items = []
    for p in plans:
        items.append({
            "id": str(p.id), "partnership_id": str(p.partnership_id),
            "partner_name": partner_map.get(str(p.partnership_id), "-"),
            "station_id": str(p.station_id), "period": p.period,
            "total_revenue": float(p.total_revenue or 0),
            "our_share_ratio": float(p.our_share_ratio or 0),
            "our_share_amount": float(p.our_share_amount or 0),
            "partner_share_amount": float(p.partner_share_amount or 0),
            "deduct_electricity": float(p.deduct_electricity or 0),
            "deduct_rent": float(p.deduct_rent or 0),
            "deduct_maintenance": float(p.deduct_maintenance or 0),
            "net_share_amount": float(p.net_share_amount or 0),
            "payment_due_date": str(p.payment_due_date) if p.payment_due_date else None,
            "payment_status": p.payment_status,
        })
    return {"items": items, "total": len(items)}


@router.get("/{project_id}/operation-logs")
async def get_project_operation_logs(
    project_id: str,
    station_id: str | None = None,
    log_type: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.project import ConstructionLog
    q = select(ConstructionLog).where(
        ConstructionLog.project_id == project_id,
        ConstructionLog.is_deleted == False,
        ConstructionLog.company_id == current_user.company_id,
    )
    if log_type:
        q = q.where(ConstructionLog.safety_status == log_type)
    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar()
    q = q.order_by(ConstructionLog.log_date.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    logs = result.scalars().all()
    items = []
    for l in logs:
        items.append({
            "id": str(l.id), "log_date": str(l.log_date) if l.log_date else None,
            "weather": l.weather, "work_content": l.work_content,
            "worker_count": l.worker_count, "equipment_used": l.equipment_used,
            "materials_used": l.materials_used, "safety_status": l.safety_status,
            "quality_issues": l.quality_issues, "created_at": str(l.created_at) if l.created_at else None,
        })
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{project_id}/hub")
async def get_project_hub(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cid = current_user.company_id
    result = {"contracts": [], "invoices": [], "arap": [], "vouchers": [],
              "logs": [], "tickets": [], "plans": [], "work_hours": [],
              "stations": [], "devices": [], "ops_summary": None, "revenue_shares": [],
              "financials": []}

    contracts = (await db.execute(select(Contract).where(
        Contract.project_id == project_id, Contract.is_deleted == False, Contract.company_id == cid
    ).order_by(Contract.created_at.desc()))).scalars().all()
    for c in contracts:
        result["contracts"].append({
            "id": str(c.id), "contract_no": c.contract_no, "name": c.name,
            "contract_type": c.contract_type, "status": c.status,
            "total_amount": float(c.total_amount) if c.total_amount else 0,
            "paid_amount": float(c.paid_amount) if c.paid_amount else 0,
            "signing_date": str(c.signing_date) if c.signing_date else None,
            "party_a": c.party_a, "party_b": c.party_b, "remark": c.remark,
        })

    invoices = (await db.execute(select(Invoice).where(
        Invoice.project_id == project_id, Invoice.is_deleted == False, Invoice.company_id == cid
    ).order_by(Invoice.created_at.desc()))).scalars().all()
    for inv in invoices:
        result["invoices"].append({
            "id": str(inv.id), "invoice_no": inv.invoice_no, "direction": inv.direction,
            "total_amount": float(inv.total_amount) if inv.total_amount else 0,
            "check_status": inv.check_status, "issue_date": str(inv.issue_date) if inv.issue_date else None,
        })

    araps = (await db.execute(select(ArApRecord).where(
        ArApRecord.project_id == project_id, ArApRecord.is_deleted == False, ArApRecord.company_id == cid
    ).order_by(ArApRecord.created_at.desc()).limit(20))).scalars().all()
    for a in araps:
        result["arap"].append({
            "id": str(a.id), "type": a.type, "business_type": a.business_type,
            "counterparty": a.counterparty, "total_amount": float(a.total_amount) if a.total_amount else 0,
            "settled_amount": float(a.settled_amount) if a.settled_amount else 0,
            "remaining_amount": float(a.remaining_amount) if a.remaining_amount else 0,
            "status": a.status,
        })

    vcount = (await db.execute(select(func.count()).select_from(FinanceVoucher).where(
        FinanceVoucher.project_id == project_id, FinanceVoucher.is_deleted == False, FinanceVoucher.company_id == cid
    ))).scalar()
    vtotal = (await db.execute(select(func.coalesce(func.sum(FinanceVoucher.total_debit), 0)).where(
        FinanceVoucher.project_id == project_id, FinanceVoucher.is_deleted == False, FinanceVoucher.company_id == cid
    ))).scalar()
    result["vouchers"] = {"count": vcount, "total_amount": float(vtotal)}

    logs = (await db.execute(select(ConstructionLog).where(
        ConstructionLog.project_id == project_id, ConstructionLog.is_deleted == False, ConstructionLog.company_id == cid
    ).order_by(ConstructionLog.log_date.desc()).limit(30))).scalars().all()
    for l in logs:
        result["logs"].append({
            "id": str(l.id), "log_date": str(l.log_date) if l.log_date else None,
            "work_content": l.work_content, "worker_count": l.worker_count,
            "safety_status": l.safety_status, "weather": l.weather,
            "quality_issues": l.quality_issues,
            "execution_unit": l.execution_unit,
        })

    tickets = (await db.execute(select(ServiceTicket).where(
        ServiceTicket.project_id == project_id, ServiceTicket.is_deleted == False, ServiceTicket.company_id == cid
    ).order_by(ServiceTicket.created_at.desc()).limit(20))).scalars().all()
    for t in tickets:
        result["tickets"].append({
            "id": str(t.id), "ticket_no": t.ticket_no, "title": t.title,
            "service_type": t.service_type, "priority": t.priority,
            "status": t.status, "assigned_to": str(t.assigned_to) if t.assigned_to else None,
        })

    plans = (await db.execute(select(ProjectDailyPlan).where(
        ProjectDailyPlan.project_id == project_id, ProjectDailyPlan.is_deleted == False, ProjectDailyPlan.company_id == cid
    ).order_by(ProjectDailyPlan.plan_date.desc()).limit(14))).scalars().all()
    for p in plans:
        result["plans"].append({
            "id": str(p.id), "plan_date": str(p.plan_date) if p.plan_date else None,
            "tasks": p.tasks, "estimated_hours": float(p.estimated_hours) if p.estimated_hours else None,
            "assigned_to": str(p.assigned_to) if p.assigned_to else None,
            "status": p.status,
        })

    wh_total = (await db.execute(select(func.coalesce(func.sum(WorkHourRecord.hours), 0), func.coalesce(func.sum(WorkHourRecord.overtime_hours), 0)).where(
        WorkHourRecord.project_id == project_id, WorkHourRecord.is_deleted == False, WorkHourRecord.company_id == cid
    ))).one()
    result["work_hours"] = {"total_hours": float(wh_total[0]), "total_overtime": float(wh_total[1])}

    stations = (await db.execute(select(ChargingStation).where(
        ChargingStation.project_id == project_id, ChargingStation.is_deleted == False, ChargingStation.company_id == cid
    ))).scalars().all()
    station_ids = [s.id for s in stations]
    for s in stations:
        result["stations"].append({
            "id": str(s.id), "name": s.name, "station_type": s.station_type,
            "status": s.status, "address": s.address,
        })

    if station_ids:
        devices = (await db.execute(select(ChargingDevice).where(
            ChargingDevice.station_id.in_(station_ids), ChargingDevice.is_deleted == False, ChargingDevice.company_id == cid
        ))).scalars().all()
        for d in devices:
            result["devices"].append({
                "id": str(d.id), "station_id": str(d.station_id),
                "device_code": d.device_code, "device_type": d.device_type,
                "rated_power": float(d.rated_power) if d.rated_power else None,
                "status": d.status,
            })

        fins = (await db.execute(select(StationFinancialMonthly).where(
            StationFinancialMonthly.station_id.in_(station_ids), StationFinancialMonthly.is_deleted == False,
            StationFinancialMonthly.company_id == cid
        ).order_by(StationFinancialMonthly.month.desc()).limit(12))).scalars().all()
        ops_rev = ops_cost = 0
        for f in fins:
            cost = float(f.electricity_cost or 0) + float(f.rent_cost or 0) + float(f.depreciation or 0) + float(f.maintenance_cost or 0) + float(f.labor_cost or 0)
            rev = float(f.total_revenue or 0)
            ops_rev += rev
            ops_cost += cost
            result["financials"].append({
                "id": str(f.id), "station_id": str(f.station_id), "month": f.month,
                "total_orders": f.total_orders, "total_kwh": float(f.total_kwh or 0),
                "total_revenue": rev, "total_cost": cost,
                "gross_profit": rev - cost, "status": f.status,
            })
        result["ops_summary"] = {"total_revenue": ops_rev, "total_cost": ops_cost, "total_profit": ops_rev - ops_cost, "months": len(fins)}

        shares = (await db.execute(select(RevenueSharePlan).where(
            RevenueSharePlan.station_id.in_(station_ids), RevenueSharePlan.is_deleted == False,
            RevenueSharePlan.company_id == cid
        ).order_by(RevenueSharePlan.period.desc()).limit(12))).scalars().all()
        for sh in shares:
            partner_name = None
            if sh.partnership_id:
                p = (await db.execute(select(Partnership).where(Partnership.id == sh.partnership_id))).scalar_one_or_none()
                if p:
                    partner_name = p.partner_name
            result["revenue_shares"].append({
                "id": str(sh.id), "period": sh.period, "partner_name": partner_name,
                "total_revenue": float(sh.total_revenue or 0),
                "our_share_amount": float(sh.our_share_amount or 0),
                "net_share_amount": float(sh.net_share_amount or 0),
                "payment_status": sh.payment_status,
            })

    project_row = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    ptype = project_row.project_type if project_row else ""
    is_invest = ptype in ("co_invest", "full_invest", "self_invest_build", "cooperative_build")

    contract_sum = sum(float(c.total_amount or 0) for c in contracts)
    ar_sum = float((await db.execute(
        select(func.coalesce(func.sum(ArApRecord.total_amount), 0)).where(
            ArApRecord.project_id == project_id, ArApRecord.type == "ar",
            ArApRecord.is_deleted == False, ArApRecord.company_id == cid,
        )
    )).scalar() or 0)
    ap_sum = float((await db.execute(
        select(func.coalesce(func.sum(ArApRecord.total_amount), 0)).where(
            ArApRecord.project_id == project_id, ArApRecord.type == "ap",
            ArApRecord.is_deleted == False, ArApRecord.company_id == cid,
        )
    )).scalar() or 0)
    cost_sum = float(project_row.actual_cost or 0) if project_row else 0
    investment = sum(float(s.construction_cost or 0) for s in stations)

    ops_rev = 0.0
    ops_cost = 0.0
    for f in result.get("financials", []):
        ops_rev += float(f.get("total_revenue", 0))
        ops_cost += float(f.get("total_cost", 0))

    revenue_base = ar_sum if ar_sum > 0 else contract_sum
    if is_invest:
        profit = ops_rev - investment
        profit_rate = (profit / investment * 100) if investment > 0 else 0
    else:
        profit = revenue_base - cost_sum
        profit_rate = (profit / revenue_base * 100) if revenue_base > 0 else 0

    result["profit"] = {
        "type": "invest" if is_invest else "engineering",
        "contract_total": revenue_base,
        "payable_total": ap_sum,
        "cost_total": cost_sum,
        "investment": investment,
        "ops_revenue": ops_rev,
        "ops_cost": ops_cost,
        "profit": profit,
        "profit_rate": round(profit_rate, 2),
    }

    return result
