import logging
import uuid
from datetime import date, datetime, timezone, timedelta

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import generate_no
from app.models.project import Project
from app.models.project.models import (
    ProjectLine, ProjectLocation, ProjectMilestone,
    ProjectDailyTarget, ProjectProcurementApproval,
)
from app.models.workflow.engine import ProjectTypeTemplate, ProjectStage, StageTransition

logger = logging.getLogger(__name__)

AUTO_ACTION_MAP = {}


def register_auto_action(name: str):
    def decorator(fn):
        AUTO_ACTION_MAP[name] = fn
        return fn
    return decorator


@register_auto_action("create_lead")
async def create_lead(project_id, stage, db, user):
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )).scalar_one_or_none()
    if not project:
        return {"skipped": True, "reason": "project not found"}

    from app.models.charging import SiteProspect
    existing = (await db.execute(
        select(func.count()).select_from(SiteProspect).where(
            SiteProspect.company_id == project.company_id,
            SiteProspect.address == project.address,
            SiteProspect.is_deleted == False,
        )
    )).scalar() or 0

    prospect = SiteProspect(
        id=uuid.uuid4(),
        company_id=project.company_id,
        created_by=user,
        name=f"{project.name}-场地意向",
        province=project.province,
        city=project.city,
        address=project.address,
        longitude=project.longitude,
        latitude=project.latitude,
        status="initial",
    )
    db.add(prospect)
    await db.flush()
    return {"site_prospect_id": str(prospect.id), "name": prospect.name}


@register_auto_action("create_project_line")
async def create_project_line(project_id, stage, db, user):
    from app.services.project_cost import ProjectCostService

    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )).scalar_one_or_none()
    if not project:
        return {"skipped": True, "reason": "project not found"}

    contract_id = str(project.contract_id) if project.contract_id else None
    contract_amount = float(project.total_budget or 0)
    if contract_amount <= 0:
        return {"skipped": True, "reason": "no contract amount"}

    line = await ProjectCostService.allocate_from_contract(
        project_id=project_id,
        contract_id=contract_id,
        amount=contract_amount,
        db=db,
        company_id=project.company_id,
        user_id=user,
    )
    return {"project_line_id": str(line.id), "amount": contract_amount}


@register_auto_action("track_procurement")
async def track_procurement(project_id, stage, db, user):
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )).scalar_one_or_none()
    if not project:
        return {"skipped": True, "reason": "project not found"}

    from app.models.erp import ProcurementRequest
    seq = (await db.execute(
        select(func.count()).select_from(ProjectProcurementApproval).where(
            ProjectProcurementApproval.project_id == project_id,
            ProjectProcurementApproval.is_deleted == False,
        )
    )).scalar() or 0
    seq += 1

    approval = ProjectProcurementApproval(
        id=uuid.uuid4(),
        project_id=project_id,
        company_id=project.company_id,
        created_by=user,
        approval_no=f"WF-PA-{seq:04d}",
        procurement_type="material",
        title=f"{project.name}-材料采购申请",
        status="draft",
    )
    db.add(approval)
    await db.flush()
    return {"procurement_approval_id": str(approval.id), "approval_no": approval.approval_no}


@register_auto_action("create_daily_plan")
async def create_daily_plan(project_id, stage, db, user):
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )).scalar_one_or_none()
    if not project:
        return {"skipped": True, "reason": "project not found"}

    today = date.today()
    target = ProjectDailyTarget(
        id=uuid.uuid4(),
        project_id=project_id,
        company_id=project.company_id,
        created_by=user,
        recorder_id=user,
        target_date=today,
        target_content=f"{project.name} 施工计划模板",
        target_items={"sections": [], "tasks": []},
        status="draft",
    )
    db.add(target)
    await db.flush()
    return {"daily_target_id": str(target.id), "date": today.isoformat()}


@register_auto_action("track_progress")
async def track_progress(project_id, stage, db, user):
    result = await db.execute(
        select(ProjectStage).where(
            ProjectStage.project_id == project_id,
            ProjectStage.is_deleted == False,
        ).order_by(ProjectStage.stage_order)
    )
    stages = list(result.scalars().all())
    total = len(stages)
    completed = sum(1 for s in stages if s.status in ("completed", "skipped"))
    progress = int(completed / total * 100) if total > 0 else 0

    await db.execute(
        text("UPDATE projects SET progress = :p WHERE id = :id"),
        {"p": progress, "id": project_id},
    )
    return {"progress": progress, "completed_stages": completed, "total_stages": total}


@register_auto_action("generate_voucher")
async def generate_voucher(project_id, stage, db, user):
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )).scalar_one_or_none()
    if not project:
        return {"skipped": True, "reason": "project not found"}

    from app.models.finance import FinanceVoucher, VoucherLine

    cost_summary = await _get_project_cost_total(project_id, db)
    amount = cost_summary.get("total_cost", 0)
    if amount <= 0:
        return {"skipped": True, "reason": "no cost to settle"}

    today = date.today()
    seq = (await db.execute(
        select(func.count()).select_from(FinanceVoucher).where(
            FinanceVoucher.company_id == project.company_id,
            FinanceVoucher.voucher_no.like("AUTO-WF-STL-%"),
            FinanceVoucher.is_deleted == False,
        )
    )).scalar() or 0
    seq += 1

    nil_uuid = uuid.UUID("00000000-0000-0000-0000-000000000000")
    voucher = FinanceVoucher(
        id=uuid.uuid4(),
        company_id=project.company_id,
        created_by=user,
        voucher_no=f"AUTO-WF-STL-{seq:04d}",
        voucher_date=today,
        period=today.strftime("%Y-%m"),
        voucher_type="auto_settlement",
        source_module="workflow",
        business_type="project_settlement",
        business_id=project_id,
        source_no=project.project_code,
        status="draft",
        total_debit=amount,
        total_credit=amount,
        line_count=2,
    )
    db.add(voucher)

    db.add(VoucherLine(
        id=uuid.uuid4(), company_id=project.company_id,
        voucher_id=voucher.id, line_no=1,
        account_id=nil_uuid, account_code="6401",
        account_name="工程成本结转", debit=amount, credit=0,
        summary=f"项目结算成本结转 {project.project_code}",
    ))
    db.add(VoucherLine(
        id=uuid.uuid4(), company_id=project.company_id,
        voucher_id=voucher.id, line_no=2,
        account_id=nil_uuid, account_code="1601",
        account_name="在建工程", debit=0, credit=amount,
        summary=f"项目结算成本结转 {project.project_code}",
    ))
    await db.flush()
    return {"voucher_id": str(voucher.id), "voucher_no": voucher.voucher_no, "amount": amount}


@register_auto_action("create_arap")
async def create_arap(project_id, stage, db, user):
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )).scalar_one_or_none()
    if not project:
        return {"skipped": True, "reason": "project not found"}

    from app.models.finance import ArApRecord

    budget = float(project.total_budget or 0)
    cost_summary = await _get_project_cost_total(project_id, db)
    actual_cost = cost_summary.get("total_cost", 0)
    if budget <= 0:
        return {"skipped": True, "reason": "no budget"}

    ar = ArApRecord(
        id=uuid.uuid4(),
        company_id=project.company_id,
        created_by=user,
        type="ar",
        business_type="project_settlement",
        business_id=project_id,
        source_no=project.project_code,
        counterparty=project.customer_id,
        total_amount=budget,
        settled_amount=0,
        remaining_amount=budget,
        project_id=project_id,
        status="pending",
    )
    db.add(ar)

    if actual_cost > 0:
        ap = ArApRecord(
            id=uuid.uuid4(),
            company_id=project.company_id,
            created_by=user,
            type="ap",
            business_type="project_cost",
            business_id=project_id,
            source_no=project.project_code,
            total_amount=actual_cost,
            settled_amount=0,
            remaining_amount=actual_cost,
            project_id=project_id,
            status="pending",
        )
        db.add(ap)
        await db.flush()
        return {"ar_id": str(ar.id), "ap_id": str(ap.id), "ar_amount": budget, "ap_amount": actual_cost}

    await db.flush()
    return {"ar_id": str(ar.id), "ar_amount": budget}


@register_auto_action("create_station")
async def create_station(project_id, stage, db, user):
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )).scalar_one_or_none()
    if not project:
        return {"skipped": True, "reason": "project not found"}

    from app.models.charging import ChargingStation

    seq = (await db.execute(
        select(func.count()).select_from(ChargingStation).where(
            ChargingStation.company_id == project.company_id,
            ChargingStation.station_code.like("STN-AUTO-%"),
            ChargingStation.is_deleted == False,
        )
    )).scalar() or 0
    seq += 1

    station = ChargingStation(
        id=uuid.uuid4(),
        company_id=project.company_id,
        created_by=user,
        station_code=f"STN-AUTO-{seq:04d}",
        name=f"{project.name}-充电站",
        province=project.province,
        city=project.city,
        address=project.address,
        longitude=project.longitude,
        latitude=project.latitude,
        status="constructing",
        project_id=project_id,
    )
    db.add(station)
    await db.flush()
    return {"station_id": str(station.id), "station_code": station.station_code}


@register_auto_action("setup_revenue_share")
async def setup_revenue_share(project_id, stage, db, user):
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )).scalar_one_or_none()
    if not project:
        return {"skipped": True, "reason": "project not found"}

    from app.models.charging import Partnership, RevenueSharePlan, ChargingStation

    station = (await db.execute(
        select(ChargingStation).where(
            ChargingStation.project_id == project_id,
            ChargingStation.is_deleted == False,
        ).limit(1)
    )).scalar_one_or_none()
    if not station:
        return {"skipped": True, "reason": "no station found"}

    partnership = Partnership(
        id=uuid.uuid4(),
        company_id=project.company_id,
        created_by=user,
        partner_name=project.name,
        partner_type="co_invest",
        cooperation_type="revenue_share",
        status="active",
    )
    db.add(partnership)
    await db.flush()

    today = date.today()
    plan = RevenueSharePlan(
        id=uuid.uuid4(),
        company_id=project.company_id,
        created_by=user,
        partnership_id=partnership.id,
        station_id=station.id,
        period=today.strftime("%Y-%m"),
        our_share_ratio=50.0,
        status="pending",
    )
    db.add(plan)
    await db.flush()
    return {"partnership_id": str(partnership.id), "revenue_share_plan_id": str(plan.id)}


@register_auto_action("monthly_revenue_split")
async def monthly_revenue_split(project_id, stage, db, user):
    from app.models.charging import ChargingStation, StationFinancialMonthly, RevenueSharePlan

    station = (await db.execute(
        select(ChargingStation).where(
            ChargingStation.project_id == project_id,
            ChargingStation.is_deleted == False,
        ).limit(1)
    )).scalar_one_or_none()
    if not station:
        return {"skipped": True, "reason": "no station found"}

    month_str = date.today().strftime("%Y-%m")
    monthly = (await db.execute(
        select(StationFinancialMonthly).where(
            StationFinancialMonthly.station_id == station.id,
            StationFinancialMonthly.month == month_str,
            StationFinancialMonthly.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not monthly:
        return {"skipped": True, "reason": f"no monthly data for {month_str}"}

    plan = (await db.execute(
        select(RevenueSharePlan).where(
            RevenueSharePlan.station_id == station.id,
            RevenueSharePlan.is_deleted == False,
        ).limit(1)
    )).scalar_one_or_none()
    if not plan:
        return {"skipped": True, "reason": "no revenue share plan"}

    total_revenue = float(monthly.total_revenue or 0)
    our_ratio = float(plan.our_share_ratio or 50) / 100
    our_amount = round(total_revenue * our_ratio, 2)
    partner_amount = round(total_revenue - our_amount, 2)

    plan.total_revenue = total_revenue
    plan.our_share_amount = our_amount
    plan.partner_share_amount = partner_amount
    plan.net_share_amount = our_amount - float(monthly.electricity_cost or 0) - float(monthly.rent_cost or 0)
    await db.flush()
    return {"total_revenue": total_revenue, "our_share": our_amount, "partner_share": partner_amount}


@register_auto_action("track_roi")
async def track_roi(project_id, stage, db, user):
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )).scalar_one_or_none()
    if not project:
        return {"skipped": True, "reason": "project not found"}

    from app.models.charging import ChargingStation, StationFinancialMonthly

    station = (await db.execute(
        select(ChargingStation).where(
            ChargingStation.project_id == project_id,
            ChargingStation.is_deleted == False,
        ).limit(1)
    )).scalar_one_or_none()
    if not station:
        return {"skipped": True, "reason": "no station"}

    investment = float(station.construction_cost or project.total_budget or 0)
    if investment <= 0:
        return {"skipped": True, "reason": "no investment data"}

    total_revenue = float((await db.execute(
        select(func.coalesce(func.sum(StationFinancialMonthly.total_revenue), 0)).where(
            StationFinancialMonthly.station_id == station.id,
            StationFinancialMonthly.is_deleted == False,
        )
    )).scalar() or 0)
    total_cost = float((await db.execute(
        select(func.coalesce(func.sum(StationFinancialMonthly.total_cost), 0)).where(
            StationFinancialMonthly.station_id == station.id,
            StationFinancialMonthly.is_deleted == False,
        )
    )).scalar() or 0)

    net_profit = total_revenue - total_cost
    roi_pct = round(net_profit / investment * 100, 2) if investment > 0 else 0
    monthly_avg_profit = net_profit / 12 if net_profit > 0 else 0
    payback_months = round(investment / monthly_avg_profit, 1) if monthly_avg_profit > 0 else None

    return {
        "investment": investment,
        "total_revenue": total_revenue,
        "total_cost": total_cost,
        "net_profit": net_profit,
        "roi_pct": roi_pct,
        "payback_months": payback_months,
    }


@register_auto_action("start_warranty_timer")
async def start_warranty_timer(project_id, stage, db, user):
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )).scalar_one_or_none()
    if not project:
        return {"skipped": True, "reason": "project not found"}

    today = date.today()
    warranty_months = 24
    if stage and hasattr(stage, "stage_code"):
        stage_cfg = await _get_stage_config(stage, db)
        if stage_cfg:
            warranty_months = stage_cfg.get("warranty_months", 24)

    warranty_end = today + timedelta(days=warranty_months * 30)
    project.actual_end_date = today

    from app.models.project.models import ServiceTicket
    existing = (await db.execute(
        select(func.count()).select_from(ServiceTicket).where(
            ServiceTicket.project_id == project_id,
            ServiceTicket.is_deleted == False,
        )
    )).scalar() or 0

    if not project.team_members:
        project.team_members = {}
    project.team_members["warranty"] = {
        "start": today.isoformat(),
        "end": warranty_end.isoformat(),
        "months": warranty_months,
    }
    await db.flush()
    return {"warranty_start": today.isoformat(), "warranty_end": warranty_end.isoformat(), "months": warranty_months}


@register_auto_action("release_warranty_retention")
async def release_warranty_retention(project_id, stage, db, user):
    from app.services.project_cost import ProjectCostService

    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )).scalar_one_or_none()
    if not project:
        return {"skipped": True, "reason": "project not found"}

    budget = float(project.total_budget or 0)
    retention_pct = 0.05
    retention_amount = round(budget * retention_pct, 2)
    if retention_amount <= 0:
        return {"skipped": True, "reason": "no retention amount"}

    line = await ProjectCostService.allocate_cost(
        project_id=project_id,
        line_type="warranty_retention_release",
        amount=retention_amount,
        source_id=None,
        source_type="warranty_release",
        source_no=f"WR-{project.project_code}",
        db=db,
        company_id=project.company_id,
        user_id=user,
        description="质保金释放",
    )
    return {"project_line_id": str(line.id), "retention_amount": retention_amount}


@register_auto_action("close_project")
async def close_project(project_id, stage, db, user):
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )).scalar_one_or_none()
    if not project:
        return {"skipped": True, "reason": "project not found"}

    cost_summary = await _get_project_cost_total(project_id, db)
    unsettled_arap = (await db.execute(
        text(
            "SELECT count(*) FROM ar_ap_records "
            "WHERE project_id = :pid AND status != 'settled' AND is_deleted = false"
        ),
        {"pid": project_id},
    )).scalar() or 0

    open_issues = []
    if unsettled_arap > 0:
        open_issues.append(f"{unsettled_arap} 条未结清的应收/应付记录")

    project.status = "completed"
    project.actual_end_date = date.today()
    await db.flush()

    return {
        "status": "completed",
        "final_cost": cost_summary.get("total_cost", 0),
        "open_issues": open_issues,
        "can_close": len(open_issues) == 0,
    }


@register_auto_action("final_settlement")
async def final_settlement(project_id, stage, db, user):
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )).scalar_one_or_none()
    if not project:
        return {"skipped": True, "reason": "project not found"}

    from app.models.finance import FinanceVoucher, VoucherLine, ArApRecord, SettlementRecord

    cost_summary = await _get_project_cost_total(project_id, db)
    total_cost = cost_summary.get("total_cost", 0)
    total_budget = float(project.total_budget or 0)

    results = {}

    ar_records = (await db.execute(
        select(ArApRecord).where(
            ArApRecord.project_id == project_id,
            ArApRecord.type == "ar",
            ArApRecord.status != "settled",
            ArApRecord.is_deleted == False,
        )
    )).scalars().all()

    total_ar = sum(float(r.remaining_amount or 0) for r in ar_records)
    if total_ar > 0:
        seq = (await db.execute(
            select(func.count()).select_from(SettlementRecord).where(
                SettlementRecord.company_id == project.company_id,
                SettlementRecord.settlement_no.like("STL-WF-FINAL-%"),
                SettlementRecord.is_deleted == False,
            )
        )).scalar() or 0
        seq += 1

        settlement = SettlementRecord(
            id=uuid.uuid4(),
            company_id=project.company_id,
            created_by=user,
            settlement_no=f"STL-WF-FINAL-{seq:04d}",
            direction="in",
            counterparty=project.customer_id,
            amount=total_ar,
            settlement_date=date.today(),
            arap_ids=[str(r.id) for r in ar_records],
            project_id=project_id,
            remark="终验收款",
            status="draft",
        )
        db.add(settlement)
        results["ar_settlement_id"] = str(settlement.id)
        results["ar_amount"] = total_ar

    ap_records = (await db.execute(
        select(ArApRecord).where(
            ArApRecord.project_id == project_id,
            ArApRecord.type == "ap",
            ArApRecord.status != "settled",
            ArApRecord.is_deleted == False,
        )
    )).scalars().all()

    total_ap = sum(float(r.remaining_amount or 0) for r in ap_records)
    if total_ap > 0:
        seq2 = (await db.execute(
            select(func.count()).select_from(SettlementRecord).where(
                SettlementRecord.company_id == project.company_id,
                SettlementRecord.settlement_no.like("STL-WF-FINAL-%"),
                SettlementRecord.is_deleted == False,
            )
        )).scalar() or 0
        seq2 += 1

        ap_settlement = SettlementRecord(
            id=uuid.uuid4(),
            company_id=project.company_id,
            created_by=user,
            settlement_no=f"STL-WF-FINAL-{seq2:04d}",
            direction="out",
            amount=total_ap,
            settlement_date=date.today(),
            arap_ids=[str(r.id) for r in ap_records],
            project_id=project_id,
            remark="终验付款",
            status="draft",
        )
        db.add(ap_settlement)
        results["ap_settlement_id"] = str(ap_settlement.id)
        results["ap_amount"] = total_ap

    await db.flush()
    results["total_cost"] = total_cost
    results["total_budget"] = total_budget
    return results


@register_auto_action("create_partnership")
async def create_partnership(project_id, stage, db, user):
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )).scalar_one_or_none()
    if not project:
        return {"skipped": True, "reason": "project not found"}

    from app.models.charging import Partnership

    partnership = Partnership(
        id=uuid.uuid4(),
        company_id=project.company_id,
        created_by=user,
        partner_name=project.name,
        partner_type="co_invest",
        cooperation_type="joint_venture",
        start_date=date.today(),
        status="active",
    )
    db.add(partnership)
    await db.flush()
    return {"partnership_id": str(partnership.id)}


@register_auto_action("monitor_performance")
async def monitor_performance(project_id, stage, db, user):
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )).scalar_one_or_none()
    if not project:
        return {"skipped": True, "reason": "project not found"}

    result = await db.execute(
        select(ProjectStage).where(
            ProjectStage.project_id == project_id,
            ProjectStage.is_deleted == False,
        ).order_by(ProjectStage.stage_order)
    )
    stages = list(result.scalars().all())
    total = len(stages)
    completed = sum(1 for s in stages if s.status in ("completed", "skipped"))
    in_progress = sum(1 for s in stages if s.status == "in_progress")
    overdue = 0

    now_iso = datetime.now(timezone.utc).isoformat()
    for s in stages:
        if s.status == "in_progress" and s.started_at:
            started = datetime.fromisoformat(s.started_at)
            if (datetime.now(timezone.utc) - started).days > 30:
                overdue += 1

    budget = float(project.total_budget or 0)
    actual_cost = float(project.actual_cost or 0)
    budget_usage = round(actual_cost / budget * 100, 2) if budget > 0 else 0

    if not project.team_members:
        project.team_members = {}
    project.team_members["performance_snapshot"] = {
        "progress": int(completed / total * 100) if total > 0 else 0,
        "overdue_stages": overdue,
        "budget_usage_pct": budget_usage,
        "snapshot_at": now_iso,
    }
    await db.flush()

    return {
        "progress": int(completed / total * 100) if total > 0 else 0,
        "total_stages": total,
        "completed": completed,
        "in_progress": in_progress,
        "overdue": overdue,
        "budget_usage_pct": budget_usage,
    }


async def _get_project_cost_total(project_id: str, db: AsyncSession) -> dict:
    result = (await db.execute(
        select(func.coalesce(func.sum(ProjectLine.amount), 0)).where(
            ProjectLine.project_id == project_id,
            ProjectLine.is_deleted == False,
        )
    )).scalar()
    return {"total_cost": float(result or 0)}


async def _get_stage_config(stage: ProjectStage, db: AsyncSession) -> dict | None:
    template = (await db.execute(
        select(ProjectTypeTemplate).where(
            ProjectTypeTemplate.id == stage.template_id,
            ProjectTypeTemplate.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not template or not template.stages:
        return None
    for sc in template.stages:
        if sc.get("code") == stage.stage_code:
            return sc
    return None


class WorkflowEngine:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_template_by_code(self, code: str, company_id: str) -> ProjectTypeTemplate | None:
        result = await self.db.execute(
            select(ProjectTypeTemplate).where(
                ProjectTypeTemplate.code == code,
                ProjectTypeTemplate.company_id == company_id,
                ProjectTypeTemplate.is_deleted == False,
            )
        )
        return result.scalar_one_or_none()

    async def create_project_from_template(
        self,
        project_type_code: str,
        project_data: dict,
        company_id: str,
        user_id: str,
    ) -> dict:
        template = await self.get_template_by_code(project_type_code, company_id)
        if not template:
            raise ValueError(f"模板 {project_type_code} 不存在")

        stages = template.stages or []
        if not stages:
            raise ValueError(f"模板 {project_type_code} 没有配置阶段")

        priority_map = {"low": 1, "medium": 2, "high": 3}
        clean_data = {k: v for k, v in project_data.items() if v is not None}
        if "priority" in clean_data and isinstance(clean_data["priority"], str):
            clean_data["priority"] = priority_map.get(clean_data["priority"].lower(), 2)

        project = Project(
            **clean_data,
            company_id=company_id,
            created_by=user_id,
            project_type=project_type_code,
            project_code=generate_no("PRJ-"),
            status="active",
        )
        self.db.add(project)
        await self.db.flush()
        await self.db.refresh(project)

        project_stages = []
        for stage_cfg in stages:
            ps = ProjectStage(
                project_id=project.id,
                template_id=template.id,
                stage_code=stage_cfg.get("code", ""),
                stage_name=stage_cfg.get("name", ""),
                stage_order=stage_cfg.get("order", 0),
                status="pending",
                required_docs=stage_cfg.get("required_docs"),
                approval_required=stage_cfg.get("approval_required", False),
                company_id=company_id,
                created_by=user_id,
            )
            self.db.add(ps)
            project_stages.append(ps)

        await self.db.flush()

        if project_stages:
            first_stage = project_stages[0]
            first_stage.status = "in_progress"
            first_stage.started_at = datetime.now(timezone.utc).isoformat()
            auto_actions = stages[0].get("auto_actions", [])
            auto_result = await self._execute_auto_actions(
                auto_actions, project.id, first_stage, user_id
            )
            first_stage.auto_actions_result = auto_result or None

            self.db.add(StageTransition(
                project_id=project.id,
                from_stage=None,
                to_stage=first_stage.stage_code,
                action="start",
                operator_id=user_id,
                trigger_type="auto",
                auto_result=auto_result or None,
                company_id=company_id,
                created_by=user_id,
            ))

        await self.db.flush()
        return {
            "project_id": str(project.id),
            "project_code": project.project_code,
            "template_code": project_type_code,
            "stages": [
                {
                    "stage_code": ps.stage_code,
                    "stage_name": ps.stage_name,
                    "status": ps.status,
                    "auto_actions_result": ps.auto_actions_result if ps.stage_order == 1 else None,
                }
                for ps in project_stages
            ],
        }

    async def advance_stage(
        self,
        project_id: str,
        target_stage_code: str,
        action: str,
        data: dict | None,
        company_id: str,
        user_id: str,
    ) -> dict:
        result = await self.db.execute(
            select(ProjectStage).where(
                ProjectStage.project_id == project_id,
                ProjectStage.company_id == company_id,
                ProjectStage.is_deleted == False,
            ).order_by(ProjectStage.stage_order)
        )
        stages = list(result.scalars().all())
        if not stages:
            raise ValueError("项目没有阶段记录")

        current_stage = None
        target_stage = None
        for s in stages:
            if s.status == "in_progress":
                current_stage = s
            if s.stage_code == target_stage_code:
                target_stage = s

        if not target_stage:
            raise ValueError(f"阶段 {target_stage_code} 不存在")

        stage_cfg = await _get_stage_config(target_stage, self.db)

        if action in ("complete", "start") and stage_cfg:
            required_docs = stage_cfg.get("required_docs", [])
            if required_docs:
                uploaded = await self._check_docs_uploaded(project_id, target_stage_code, required_docs)
                missing = [d for d in required_docs if d not in uploaded]
                if missing:
                    raise ValueError(f"缺少必需文档: {', '.join(missing)}")

        now = datetime.now(timezone.utc).isoformat()
        auto_result = None

        if action == "complete":
            if not current_stage:
                raise ValueError("没有进行中的阶段")
            current_stage.status = "completed"
            current_stage.completed_at = now
            if data:
                current_stage.actual_data = data

        elif action == "start":
            target_stage.status = "in_progress"
            target_stage.started_at = now
            if data:
                target_stage.actual_data = data

            auto_actions = stage_cfg.get("auto_actions", []) if stage_cfg else []
            auto_result = await self._execute_auto_actions(
                auto_actions, project_id, target_stage, user_id
            )
            target_stage.auto_actions_result = auto_result or None

            if stage_cfg and stage_cfg.get("approval_required"):
                await self._notify_approval_required(project_id, target_stage, company_id, user_id)

        elif action == "skip":
            target_stage.status = "skipped"
            target_stage.completed_at = now

        elif action == "rollback":
            if current_stage:
                current_stage.status = "pending"
                current_stage.started_at = None
            target_stage.status = "in_progress"
            target_stage.started_at = now

        else:
            raise ValueError(f"不支持的操作: {action}")

        transition = StageTransition(
            project_id=project_id,
            from_stage=current_stage.stage_code if current_stage else None,
            to_stage=target_stage_code,
            action=action,
            operator_id=user_id,
            remark=data.get("remark") if data else None,
            trigger_type="manual",
            auto_result=auto_result,
            company_id=company_id,
            created_by=user_id,
        )
        self.db.add(transition)

        completed_count = sum(1 for s in stages if s.status in ("completed", "skipped"))
        total_count = len(stages)
        progress = int(completed_count / total_count * 100) if total_count > 0 else 0

        await self.db.execute(
            text("UPDATE projects SET progress = :p WHERE id = :id"),
            {"p": progress, "id": project_id},
        )
        if progress == 100:
            await self.db.execute(
                text("UPDATE projects SET status = 'completed' WHERE id = :id"),
                {"id": project_id},
            )

        await self.db.flush()
        return {
            "transition_id": str(transition.id),
            "from_stage": current_stage.stage_code if current_stage else None,
            "to_stage": target_stage_code,
            "action": action,
            "progress": progress,
            "auto_result": auto_result,
        }

    async def get_project_progress(self, project_id: str, company_id: str) -> dict:
        result = await self.db.execute(
            select(ProjectStage).where(
                ProjectStage.project_id == project_id,
                ProjectStage.company_id == company_id,
                ProjectStage.is_deleted == False,
            ).order_by(ProjectStage.stage_order)
        )
        stages = list(result.scalars().all())

        trans_result = await self.db.execute(
            select(StageTransition).where(
                StageTransition.project_id == project_id,
                StageTransition.company_id == company_id,
                StageTransition.is_deleted == False,
            ).order_by(StageTransition.created_at.desc())
        )
        transitions = list(trans_result.scalars().all())

        completed_count = sum(1 for s in stages if s.status in ("completed", "skipped"))
        total_count = len(stages)
        progress = int(completed_count / total_count * 100) if total_count > 0 else 0

        current_stage = None
        for s in stages:
            if s.status == "in_progress":
                current_stage = {"code": s.stage_code, "name": s.stage_name}
                break

        return {
            "project_id": project_id,
            "progress": progress,
            "current_stage": current_stage,
            "total_stages": total_count,
            "completed_stages": completed_count,
            "stages": [
                {
                    "id": str(s.id),
                    "stage_code": s.stage_code,
                    "stage_name": s.stage_name,
                    "stage_order": s.stage_order,
                    "status": s.status,
                    "started_at": s.started_at,
                    "completed_at": s.completed_at,
                    "actual_data": s.actual_data,
                    "auto_actions_result": s.auto_actions_result,
                    "required_docs": s.required_docs,
                    "approval_required": s.approval_required,
                }
                for s in stages
            ],
            "recent_transitions": [
                {
                    "id": str(t.id),
                    "from_stage": t.from_stage,
                    "to_stage": t.to_stage,
                    "action": t.action,
                    "operator_id": t.operator_id,
                    "trigger_type": t.trigger_type,
                    "remark": t.remark,
                    "created_at": str(t.created_at),
                }
                for t in transitions[:10]
            ],
        }

    async def get_project_timeline(self, project_id: str, company_id: str) -> list[dict]:
        result = await self.db.execute(
            select(StageTransition).where(
                StageTransition.project_id == project_id,
                StageTransition.company_id == company_id,
                StageTransition.is_deleted == False,
            ).order_by(StageTransition.created_at.asc())
        )
        transitions = list(result.scalars().all())
        return [
            {
                "id": str(t.id),
                "from_stage": t.from_stage,
                "to_stage": t.to_stage,
                "action": t.action,
                "operator_id": t.operator_id,
                "trigger_type": t.trigger_type,
                "remark": t.remark,
                "auto_result": t.auto_result,
                "created_at": str(t.created_at),
            }
            for t in transitions
        ]

    async def get_stage_documents(self, project_id: str, stage_code: str, company_id: str) -> list[dict]:
        from app.models.workflow.engine import StageDocument
        result = await self.db.execute(
            select(StageDocument).where(
                StageDocument.project_id == project_id,
                StageDocument.stage_code == stage_code,
                StageDocument.company_id == company_id,
                StageDocument.is_deleted == False,
            ).order_by(StageDocument.created_at.desc())
        )
        docs = list(result.scalars().all())
        return [
            {
                "id": str(d.id),
                "stage_code": d.stage_code,
                "doc_type": d.doc_type,
                "file_name": d.file_name,
                "file_url": d.file_url,
                "file_size": d.file_size,
                "mime_type": d.mime_type,
                "created_at": str(d.created_at),
            }
            for d in docs
        ]

    async def upload_stage_document(
        self, project_id: str, stage_code: str, doc_data: dict, company_id: str, user_id: str,
    ) -> dict:
        from app.models.workflow.engine import StageDocument
        doc = StageDocument(
            project_id=project_id,
            stage_code=stage_code,
            doc_type=doc_data.get("doc_type", ""),
            file_name=doc_data.get("file_name", ""),
            file_url=doc_data.get("file_url", ""),
            file_size=doc_data.get("file_size"),
            mime_type=doc_data.get("mime_type"),
            company_id=company_id,
            created_by=user_id,
        )
        self.db.add(doc)
        await self.db.flush()
        return {
            "id": str(doc.id),
            "stage_code": doc.stage_code,
            "doc_type": doc.doc_type,
            "file_name": doc.file_name,
            "file_url": doc.file_url,
        }

    async def get_cost_breakdown_by_stage(self, project_id: str, company_id: str) -> dict:
        from app.services.project_cost import ProjectCostService
        return await ProjectCostService.get_cost_by_stage(project_id, self.db)

    async def _check_docs_uploaded(self, project_id: str, stage_code: str, required_docs: list[str]) -> list[str]:
        from app.models.workflow.engine import StageDocument
        result = await self.db.execute(
            select(StageDocument.doc_type).where(
                StageDocument.project_id == project_id,
                StageDocument.stage_code == stage_code,
                StageDocument.is_deleted == False,
            )
        )
        uploaded = [r[0] for r in result.all()]
        return uploaded

    async def _notify_approval_required(
        self, project_id: str, stage: ProjectStage, company_id: str, user_id: str,
    ):
        try:
            project = (await self.db.execute(
                select(Project).where(Project.id == project_id, Project.is_deleted == False)
            )).scalar_one_or_none()
            if not project or not project.project_manager_id:
                return

            from app.services.notification_service import send_notification
            await send_notification(
                self.db,
                company_id,
                str(project.project_manager_id),
                "workflow",
                "阶段审批通知",
                f"项目 {project.name} 阶段 {stage.stage_name} 需要审批",
                None,
                user_id,
            )
        except Exception:
            logger.exception("审批通知发送失败")

    async def _execute_auto_actions(
        self, action_names: list[str], project_id: str, stage: ProjectStage, user_id: str
    ) -> dict:
        results = {}
        for name in action_names:
            handler = AUTO_ACTION_MAP.get(name)
            if handler:
                try:
                    result = await handler(project_id, stage, self.db, user_id)
                    results[name] = {"status": "success", "result": result}
                except Exception as e:
                    logger.exception("自动动作 %s 执行失败", name)
                    results[name] = {"status": "failed", "error": str(e)}
            else:
                results[name] = {"status": "skipped", "reason": "handler not registered"}
        return results
