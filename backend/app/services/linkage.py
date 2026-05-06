import uuid
from datetime import date, timedelta

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.charging import ChargingStation, StationFinancialMonthly, SiteProspect
from app.models.project import Project, ProjectMilestone
from app.models.erp import ProcurementRequest, Contract, PurchaseOrder, GoodsReceipt
from app.models.finance import FinanceVoucher, VoucherLine, ArApRecord, Budget, Invoice, SettlementRecord
from app.models.organization import Company, User, UserRole, Role
from app.services.notification_service import send_notification

NIL_UUID = uuid.UUID("00000000-0000-0000-0000-000000000000")


async def charging_monthly_to_voucher(
    station_id: uuid.UUID, month: str, db: AsyncSession
) -> FinanceVoucher:
    monthly = (await db.execute(
        select(StationFinancialMonthly).where(
            StationFinancialMonthly.station_id == station_id,
            StationFinancialMonthly.month == month,
            StationFinancialMonthly.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not monthly:
        raise ValueError(f"未找到站点 {station_id} 在 {month} 的月度财务数据")

    station = (await db.execute(
        select(ChargingStation).where(
            ChargingStation.id == station_id,
            ChargingStation.is_deleted == False,
        )
    )).scalar_one_or_none()

    seq = (await db.execute(
        select(func.count()).select_from(FinanceVoucher).where(
            FinanceVoucher.company_id == monthly.company_id,
            FinanceVoucher.voucher_no.like(f"AUTO-CHG-{month}%"),
            FinanceVoucher.is_deleted == False,
        )
    )).scalar() or 0
    seq += 1

    total_revenue = float(monthly.total_revenue or 0)
    energy_revenue = float(monthly.total_energy_revenue or 0)
    service_revenue = float(monthly.total_service_revenue or 0)
    total_cost = float(monthly.total_cost or 0)
    electricity_cost = float(monthly.electricity_cost or 0)
    rent_cost = float(monthly.rent_cost or 0)
    depreciation = float(monthly.depreciation or 0)
    maintenance_cost = float(monthly.maintenance_cost or 0)
    labor_cost = float(monthly.labor_cost or 0)

    voucher = FinanceVoucher(
        id=uuid.uuid4(),
        company_id=monthly.company_id,
        voucher_no=f"AC-{month}-{seq:03d}",
        voucher_date=date.today(),
        period=month,
        voucher_type="auto_charging",
        source_module="charging",
        business_type="monthly_settlement",
        business_id=monthly.id,
        source_no=f"STN-FIN-{str(monthly.id)[:8]}",
        project_id=station.project_id if station else None,
        status="draft",
    )

    lines = []
    line_no = 1

    if total_revenue > 0:
        lines.append(VoucherLine(
            id=uuid.uuid4(), company_id=monthly.company_id,
            voucher_id=voucher.id, line_no=line_no,
            account_id=NIL_UUID, account_code="1122",
            account_name="应收账款", debit=total_revenue, credit=0,
            summary=f"充电站月度营收 {month}",
        ))
        line_no += 1

    if energy_revenue > 0:
        lines.append(VoucherLine(
            id=uuid.uuid4(), company_id=monthly.company_id,
            voucher_id=voucher.id, line_no=line_no,
            account_id=NIL_UUID, account_code="6001",
            account_name="主营业务收入-充电收入", debit=0, credit=energy_revenue,
            summary=f"充电收入 {month}",
        ))
        line_no += 1

    if service_revenue > 0:
        lines.append(VoucherLine(
            id=uuid.uuid4(), company_id=monthly.company_id,
            voucher_id=voucher.id, line_no=line_no,
            account_id=NIL_UUID, account_code="6002",
            account_name="主营业务收入-服务收入", debit=0, credit=service_revenue,
            summary=f"服务收入 {month}",
        ))
        line_no += 1

    if total_cost > 0:
        lines.append(VoucherLine(
            id=uuid.uuid4(), company_id=monthly.company_id,
            voucher_id=voucher.id, line_no=line_no,
            account_id=NIL_UUID, account_code="6401",
            account_name="主营业务成本", debit=total_cost, credit=0,
            summary=f"运营成本 {month}",
        ))
        line_no += 1

    cost_ap = electricity_cost + rent_cost + depreciation + maintenance_cost + labor_cost
    if cost_ap > 0:
        lines.append(VoucherLine(
            id=uuid.uuid4(), company_id=monthly.company_id,
            voucher_id=voucher.id, line_no=line_no,
            account_id=NIL_UUID, account_code="1002",
            account_name="银行存款/应付账款", debit=0, credit=cost_ap,
            summary=f"电费/租金/折旧/维护/人工 {month}",
        ))

    voucher.total_debit = sum(float(l.debit) for l in lines)
    voucher.total_credit = sum(float(l.credit) for l in lines)
    voucher.line_count = len(lines)

    db.add(voucher)
    for line in lines:
        db.add(line)
    await db.flush()
    return voucher


async def site_signed_to_project(
    site_prospect_id: uuid.UUID, db: AsyncSession
) -> Project:
    site = (await db.execute(
        select(SiteProspect).where(
            SiteProspect.id == site_prospect_id,
            SiteProspect.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not site:
        raise ValueError(f"未找到场地 {site_prospect_id}")

    seq = (await db.execute(
        select(func.count()).select_from(Project).where(
            Project.company_id == site.company_id,
            Project.project_code.like("PJ-AUTO-%"),
            Project.is_deleted == False,
        )
    )).scalar() or 0
    seq += 1

    project = Project(
        id=uuid.uuid4(),
        company_id=site.company_id,
        project_code=f"PJ-AUTO-{seq:04d}",
        name=f"{site.name}-电力增容工程",
        project_type="charging_station",
        status="planning",
        province=site.province,
        city=site.city,
        address=site.address,
    )
    db.add(project)
    await db.flush()
    return project


async def validate_procurement_budget(
    pr_id: uuid.UUID, db: AsyncSession
) -> dict:
    pr = (await db.execute(
        select(ProcurementRequest).where(
            ProcurementRequest.id == pr_id,
            ProcurementRequest.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not pr:
        raise ValueError(f"未找到采购申请 {pr_id}")

    budget = None
    if pr.budget_id:
        budget = (await db.execute(
            select(Budget).where(
                Budget.id == pr.budget_id,
                Budget.is_deleted == False,
            )
        )).scalar_one_or_none()

    if not budget and pr.project_id:
        budget = (await db.execute(
            select(Budget).where(
                Budget.project_id == pr.project_id,
                Budget.is_deleted == False,
                Budget.status == "approved",
            ).order_by(Budget.created_at.desc()).limit(1)
        )).scalar_one_or_none()

    if not budget:
        return {
            "valid": False,
            "budget_total": 0,
            "budget_used": 0,
            "budget_remaining": 0,
            "request_amount": float(pr.total_amount or 0),
        }

    budget_total = float(budget.total_budget or 0)
    budget_used = float(budget.total_used or 0)
    budget_remaining = budget_total - budget_used
    request_amount = float(pr.total_amount or 0)

    return {
        "valid": budget_remaining >= request_amount,
        "budget_total": budget_total,
        "budget_used": budget_used,
        "budget_remaining": budget_remaining,
        "request_amount": request_amount,
    }


async def milestone_to_revenue_voucher(
    milestone_id: uuid.UUID, db: AsyncSession
) -> FinanceVoucher | None:
    milestone = (await db.execute(
        select(ProjectMilestone).where(
            ProjectMilestone.id == milestone_id,
            ProjectMilestone.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not milestone or milestone.status != "completed":
        return None

    project = (await db.execute(
        select(Project).where(
            Project.id == milestone.project_id,
            Project.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not project or not project.total_budget or float(project.total_budget) <= 0:
        return None

    total_milestones = (await db.execute(
        select(func.count()).select_from(ProjectMilestone).where(
            ProjectMilestone.project_id == project.id,
            ProjectMilestone.is_deleted == False,
        )
    )).scalar() or 1

    progress_change = 1.0 / max(total_milestones, 1)
    amount = float(project.total_budget) * progress_change

    seq = (await db.execute(
        select(func.count()).select_from(FinanceVoucher).where(
            FinanceVoucher.company_id == project.company_id,
            FinanceVoucher.voucher_no.like("AUTO-REV-%"),
            FinanceVoucher.is_deleted == False,
        )
    )).scalar() or 0
    seq += 1

    today = date.today()
    voucher = FinanceVoucher(
        id=uuid.uuid4(),
        company_id=project.company_id,
        voucher_no=f"AUTO-REV-{seq:04d}",
        voucher_date=today,
        period=today.strftime("%Y-%m"),
        voucher_type="auto_revenue",
        source_module="project",
        business_type="milestone_revenue",
        business_id=milestone.id,
        source_no=f"MS-{str(milestone.id)[:8]}",
        project_id=milestone.project_id,
        status="draft",
    )

    debit_line = VoucherLine(
        id=uuid.uuid4(), company_id=project.company_id,
        voucher_id=voucher.id, line_no=1,
        account_id=NIL_UUID, account_code="1122",
        account_name="应收账款", debit=amount, credit=0,
        summary=f"里程碑完成收入确认: {milestone.name}",
    )
    credit_line = VoucherLine(
        id=uuid.uuid4(), company_id=project.company_id,
        voucher_id=voucher.id, line_no=2,
        account_id=NIL_UUID, account_code="6001",
        account_name="工程结算收入", debit=0, credit=amount,
        summary=f"里程碑完成收入确认: {milestone.name}",
    )

    voucher.total_debit = amount
    voucher.total_credit = amount
    voucher.line_count = 2

    db.add(voucher)
    db.add(debit_line)
    db.add(credit_line)
    await db.flush()
    return voucher


async def check_contract_expiry(db: AsyncSession) -> list[dict]:
    today = date.today()
    deadline = today + timedelta(days=30)
    alerts = []

    stations = (await db.execute(
        select(ChargingStation).where(
            ChargingStation.is_deleted == False,
            ChargingStation.lease_end != None,
            ChargingStation.lease_end <= deadline,
            ChargingStation.lease_end >= today,
        )
    )).scalars().all()

    for s in stations:
        alerts.append({
            "type": "station_lease",
            "id": str(s.id),
            "name": s.name,
            "expire_date": s.lease_end.isoformat() if s.lease_end else None,
            "days_remaining": (s.lease_end - today).days if s.lease_end else 0,
        })

    contracts = (await db.execute(
        select(Contract).where(
            Contract.is_deleted == False,
            Contract.end_date != None,
            Contract.end_date <= deadline,
            Contract.end_date >= today,
            Contract.status != "completed",
        )
    )).scalars().all()

    for c in contracts:
        alerts.append({
            "type": "contract",
            "id": str(c.id),
            "name": c.name,
            "expire_date": c.end_date.isoformat() if c.end_date else None,
            "days_remaining": (c.end_date - today).days if c.end_date else 0,
        })

    alerts.sort(key=lambda x: x["days_remaining"])
    return alerts


async def get_group_consolidated_stats(db: AsyncSession) -> dict:
    companies = (await db.execute(
        select(Company).where(
            Company.is_deleted == False,
            Company.status == 1,
        )
    )).scalars().all()

    company_stats = []
    total_revenue = 0.0
    total_cost = 0.0
    total_profit = 0.0
    total_active_projects = 0
    total_active_stations = 0
    monthly_agg: dict[str, dict[str, float]] = {}

    for company in companies:
        cid = company.id

        station_revenue = float((await db.execute(
            select(func.coalesce(func.sum(StationFinancialMonthly.total_revenue), 0)).where(
                StationFinancialMonthly.company_id == cid,
                StationFinancialMonthly.is_deleted == False,
            )
        )).scalar() or 0)

        station_cost = float((await db.execute(
            select(func.coalesce(func.sum(StationFinancialMonthly.total_cost), 0)).where(
                StationFinancialMonthly.company_id == cid,
                StationFinancialMonthly.is_deleted == False,
            )
        )).scalar() or 0)

        active_projects = (await db.execute(
            select(func.count()).select_from(Project).where(
                Project.company_id == cid,
                Project.is_deleted == False,
                Project.status.in_(["active", "in_progress"]),
            )
        )).scalar() or 0

        active_stations = (await db.execute(
            select(func.count()).select_from(ChargingStation).where(
                ChargingStation.company_id == cid,
                ChargingStation.is_deleted == False,
                ChargingStation.status == "operating",
            )
        )).scalar() or 0

        profit = station_revenue - station_cost
        total_revenue += station_revenue
        total_cost += station_cost
        total_profit += profit
        total_active_projects += active_projects
        total_active_stations += active_stations

        company_stats.append({
            "id": str(cid),
            "name": company.name,
            "type": company.company_type,
            "revenue": station_revenue,
            "cost": station_cost,
            "profit": profit,
        })

        monthly_rows = (await db.execute(
            select(
                StationFinancialMonthly.month,
                func.coalesce(func.sum(StationFinancialMonthly.total_revenue), 0),
                func.coalesce(func.sum(StationFinancialMonthly.total_cost), 0),
            ).where(
                StationFinancialMonthly.company_id == cid,
                StationFinancialMonthly.is_deleted == False,
            ).group_by(StationFinancialMonthly.month)
        )).all()

        for m, rev, cost in monthly_rows:
            if m not in monthly_agg:
                monthly_agg[m] = {"revenue": 0.0, "cost": 0.0}
            monthly_agg[m]["revenue"] += float(rev)
            monthly_agg[m]["cost"] += float(cost)

    monthly_trend = [
        {"month": m, "revenue": v["revenue"], "cost": v["cost"]}
        for m, v in sorted(monthly_agg.items())
    ]

    return {
        "companies": company_stats,
        "totals": {
            "revenue": total_revenue,
            "cost": total_cost,
            "profit": total_profit,
            "active_projects": total_active_projects,
            "active_stations": total_active_stations,
        },
        "monthly_trend": monthly_trend,
    }


async def site_signed_to_station(
    site_prospect_id: uuid.UUID, db: AsyncSession
) -> ChargingStation:
    site = (await db.execute(
        select(SiteProspect).where(
            SiteProspect.id == site_prospect_id,
            SiteProspect.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not site:
        raise ValueError(f"未找到场地 {site_prospect_id}")

    project = (await db.execute(
        select(Project).where(
            Project.company_id == site.company_id,
            Project.address == site.address,
            Project.is_deleted == False,
            Project.project_code.like("PJ-AUTO-%"),
        ).order_by(Project.created_at.desc()).limit(1)
    )).scalar_one_or_none()

    seq = (await db.execute(
        select(func.count()).select_from(ChargingStation).where(
            ChargingStation.company_id == site.company_id,
            ChargingStation.station_code.like("STN-AUTO-%"),
            ChargingStation.is_deleted == False,
        )
    )).scalar() or 0
    seq += 1

    area_size = float(site.area_size or 0)
    estimated_parking = int(area_size / 15) if area_size > 0 else None

    station = ChargingStation(
        id=uuid.uuid4(),
        company_id=site.company_id,
        created_by=site.created_by,
        station_code=f"STN-AUTO-{seq:04d}",
        name=f"{site.name}-充电站",
        province=site.province,
        city=site.city,
        district=site.district,
        address=site.address,
        longitude=site.longitude,
        latitude=site.latitude,
        status="constructing",
        monthly_rent=site.expected_rent,
        total_parking=estimated_parking,
        landlord=site.owner_name,
        project_id=project.id if project else None,
    )
    db.add(station)
    await db.flush()
    return station


async def project_completed_update_station(
    project_id: uuid.UUID, db: AsyncSession
) -> ChargingStation | None:
    project = (await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not project or project.project_type != "charging_station":
        return None

    station = (await db.execute(
        select(ChargingStation).where(
            ChargingStation.project_id == project_id,
            ChargingStation.is_deleted == False,
        ).limit(1)
    )).scalar_one_or_none()

    if not station:
        station = (await db.execute(
            select(ChargingStation).where(
                ChargingStation.company_id == project.company_id,
                ChargingStation.address == project.address,
                ChargingStation.is_deleted == False,
            ).limit(1)
        )).scalar_one_or_none()

    if not station:
        return None

    station.status = "operating"
    station.operation_start_date = date.today()

    construction_cost = float(station.construction_cost or 0)
    if construction_cost > 0:
        arap = ArApRecord(
            id=uuid.uuid4(),
            company_id=station.company_id,
            created_by=project.created_by,
            type="ap",
            business_type="construction_cost",
            business_id=station.id,
            source_no=f"STN-{station.station_code}",
            counterparty=station.landlord,
            total_amount=construction_cost,
            settled_amount=0,
            remaining_amount=construction_cost,
            status="pending",
        )
        db.add(arap)

    await db.flush()
    return station


async def pr_approved_create_po(
    pr_id: uuid.UUID, db: AsyncSession
) -> PurchaseOrder | None:
    pr = (await db.execute(
        select(ProcurementRequest).where(
            ProcurementRequest.id == pr_id,
            ProcurementRequest.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not pr:
        return None

    seq = (await db.execute(
        select(func.count()).select_from(PurchaseOrder).where(
            PurchaseOrder.company_id == pr.company_id,
            PurchaseOrder.po_no.like("PO-AUTO-%"),
            PurchaseOrder.is_deleted == False,
        )
    )).scalar() or 0
    seq += 1

    po = PurchaseOrder(
        id=uuid.uuid4(),
        company_id=pr.company_id,
        created_by=pr.created_by,
        po_no=f"PO-AUTO-{seq:04d}",
        pr_id=pr.id,
        title=pr.title,
        project_id=pr.project_id,
        items=pr.items,
        total_amount=pr.total_amount,
        status="draft",
    )

    if pr.budget_id:
        budget = (await db.execute(
            select(Budget).where(
                Budget.id == pr.budget_id,
                Budget.is_deleted == False,
            )
        )).scalar_one_or_none()
        if budget:
            pr_amount = float(pr.total_amount or 0)
            budget.total_used = float(budget.total_used or 0) + pr_amount

    db.add(po)
    await db.flush()

    await notify_company_finance_users(
        pr.company_id,
        "采购订单自动创建",
        f"采购申请 {pr.pr_no} 已审批，自动创建采购订单 {po.po_no}",
        db,
        created_by=str(pr.created_by) if pr.created_by else None,
    )

    return po


async def po_generate_contract(
    po_id: uuid.UUID, db: AsyncSession
) -> Contract | None:
    po = (await db.execute(
        select(PurchaseOrder).where(
            PurchaseOrder.id == po_id,
            PurchaseOrder.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not po:
        return None

    company = (await db.execute(
        select(Company).where(Company.id == po.company_id, Company.is_deleted == False)
    )).scalar_one_or_none()

    from app.models.erp import Supplier
    supplier_name = None
    if po.supplier_id:
        supplier = (await db.execute(
            select(Supplier).where(Supplier.id == po.supplier_id, Supplier.is_deleted == False)
        )).scalar_one_or_none()
        if supplier:
            supplier_name = supplier.name

    seq = (await db.execute(
        select(func.count()).select_from(Contract).where(
            Contract.company_id == po.company_id,
            Contract.contract_no.like("CT-AUTO-%"),
            Contract.is_deleted == False,
        )
    )).scalar() or 0
    seq += 1

    contract = Contract(
        id=uuid.uuid4(),
        company_id=po.company_id,
        created_by=po.created_by,
        contract_no=f"CT-AUTO-{seq:04d}",
        name=f"采购合同-{po.title}",
        contract_type="purchase",
        party_a=company.name if company else None,
        party_b=supplier_name,
        supplier_id=po.supplier_id,
        signing_date=date.today(),
        start_date=date.today(),
        total_amount=po.total_amount,
        po_id=po_id,
        project_id=po.project_id,
        status="active",
    )
    db.add(contract)
    await db.flush()
    return contract


async def goods_receipt_update_po(
    gr_id: uuid.UUID, db: AsyncSession
) -> PurchaseOrder | None:
    gr = (await db.execute(
        select(GoodsReceipt).where(
            GoodsReceipt.id == gr_id,
            GoodsReceipt.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not gr or gr.quality_status != "passed":
        return None

    po = (await db.execute(
        select(PurchaseOrder).where(
            PurchaseOrder.id == gr.po_id,
            PurchaseOrder.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not po:
        return None

    gr_amount = float(gr.total_amount or 0)
    po.received_amount = float(po.received_amount or 0) + gr_amount

    if float(po.received_amount) >= float(po.total_amount or 0):
        po.status = "completed"

    await db.flush()

    try:
        pid = str(gr.project_id) if gr.project_id else (str(po.project_id) if po.project_id else None)
        if pid:
            from app.services.project_cost import ProjectCostService
            await ProjectCostService.allocate_from_procurement(
                project_id=pid,
                po_id=str(po.id),
                amount=gr_amount,
                db=db,
                company_id=str(po.company_id),
                user_id=str(po.created_by) if po.created_by else None,
            )
    except Exception:
        import logging as _log
        _log.getLogger(__name__).exception("采购到货成本分配失败 gr_id=%s", gr_id)

    return po


async def invoice_create_arap(
    invoice_id: uuid.UUID, db: AsyncSession
) -> ArApRecord | None:
    invoice = (await db.execute(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not invoice or invoice.check_status not in ("checked", "verified"):
        return None

    arap_type = "ar" if invoice.direction == "out" else "ap"
    total = float(invoice.total_amount or 0)

    counterparty = None
    counterparty_id = None
    if invoice.direction == "out":
        counterparty = invoice.buyer_name
    else:
        counterparty = invoice.seller_name

    arap_project_id = None
    if invoice.project_id:
        arap_project_id = invoice.project_id
    if invoice.contract_id:
        contract = (await db.execute(
            select(Contract).where(
                Contract.id == invoice.contract_id,
                Contract.is_deleted == False,
            )
        )).scalar_one_or_none()
        if contract and contract.project_id:
            arap_project_id = contract.project_id
    if not arap_project_id and invoice.purchase_order_id:
        po = (await db.execute(
            select(PurchaseOrder).where(
                PurchaseOrder.id == invoice.purchase_order_id,
                PurchaseOrder.is_deleted == False,
            )
        )).scalar_one_or_none()
        if po and po.project_id:
            arap_project_id = po.project_id

    arap = ArApRecord(
        id=uuid.uuid4(),
        company_id=invoice.company_id,
        created_by=invoice.created_by,
        type=arap_type,
        business_type="invoice",
        business_id=invoice.id,
        source_no=invoice.invoice_no,
        counterparty=counterparty,
        total_amount=total,
        settled_amount=0,
        remaining_amount=total,
        project_id=arap_project_id,
        status="pending",
    )
    db.add(arap)
    await db.flush()

    try:
        project_id = None
        if invoice.contract_id:
            contract = (await db.execute(
                select(Contract).where(Contract.id == invoice.contract_id, Contract.is_deleted == False)
            )).scalar_one_or_none()
            if contract and contract.project_id:
                project_id = str(contract.project_id)
        if not project_id and invoice.purchase_order_id:
            po = (await db.execute(
                select(PurchaseOrder).where(PurchaseOrder.id == invoice.purchase_order_id, PurchaseOrder.is_deleted == False)
            )).scalar_one_or_none()
            if po and po.project_id:
                project_id = str(po.project_id)
        if project_id:
            from app.services.project_cost import ProjectCostService
            await ProjectCostService.allocate_from_invoice(
                project_id=project_id,
                invoice_id=str(invoice.id),
                amount=total,
                db=db,
                company_id=str(invoice.company_id),
                user_id=str(invoice.created_by) if invoice.created_by else None,
            )
    except Exception:
        import logging as _log
        _log.getLogger(__name__).exception("发票成本分配失败 invoice_id=%s", invoice_id)

    await notify_company_finance_users(
        invoice.company_id,
        f"{'应收' if arap_type == 'ar' else '应付'}记录自动创建",
        f"发票 {invoice.invoice_no or invoice.id} 已核验，自动创建{'应收' if arap_type == 'ar' else '应付'}记录 ¥{total:,.2f}",
        db,
        created_by=str(invoice.created_by) if invoice.created_by else None,
    )

    return arap


async def settlement_create_voucher(
    settlement_id: uuid.UUID, db: AsyncSession
) -> FinanceVoucher | None:
    settlement = (await db.execute(
        select(SettlementRecord).where(
            SettlementRecord.id == settlement_id,
            SettlementRecord.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not settlement:
        return None

    amount = float(settlement.amount or 0)
    if amount <= 0:
        return None

    today = date.today()
    seq = (await db.execute(
        select(func.count()).select_from(FinanceVoucher).where(
            FinanceVoucher.company_id == settlement.company_id,
            FinanceVoucher.voucher_no.like("AUTO-STL-%"),
            FinanceVoucher.is_deleted == False,
        )
    )).scalar() or 0
    seq += 1

    voucher = FinanceVoucher(
        id=uuid.uuid4(),
        company_id=settlement.company_id,
        created_by=settlement.created_by,
        voucher_no=f"AUTO-STL-{seq:04d}",
        voucher_date=today,
        period=today.strftime("%Y-%m"),
        voucher_type="auto_settlement",
        source_module="finance",
        business_type="settlement",
        business_id=settlement.id,
        source_no=settlement.settlement_no,
        project_id=settlement.project_id,
        status="draft",
    )

    if settlement.direction == "in":
        debit_line = VoucherLine(
            id=uuid.uuid4(), company_id=settlement.company_id,
            voucher_id=voucher.id, line_no=1,
            account_id=NIL_UUID, account_code="1002",
            account_name="银行存款", debit=amount, credit=0,
            summary=f"收款结算 {settlement.settlement_no}",
        )
        credit_line = VoucherLine(
            id=uuid.uuid4(), company_id=settlement.company_id,
            voucher_id=voucher.id, line_no=2,
            account_id=NIL_UUID, account_code="1122",
            account_name="应收账款", debit=0, credit=amount,
            summary=f"收款结算 {settlement.settlement_no}",
        )
    else:
        debit_line = VoucherLine(
            id=uuid.uuid4(), company_id=settlement.company_id,
            voucher_id=voucher.id, line_no=1,
            account_id=NIL_UUID, account_code="2202",
            account_name="应付账款", debit=amount, credit=0,
            summary=f"付款结算 {settlement.settlement_no}",
        )
        credit_line = VoucherLine(
            id=uuid.uuid4(), company_id=settlement.company_id,
            voucher_id=voucher.id, line_no=2,
            account_id=NIL_UUID, account_code="1002",
            account_name="银行存款", debit=0, credit=amount,
            summary=f"付款结算 {settlement.settlement_no}",
        )

    voucher.total_debit = amount
    voucher.total_credit = amount
    voucher.line_count = 2

    db.add(voucher)
    db.add(debit_line)
    db.add(credit_line)

    if settlement.arap_ids:
        arap_id_list = settlement.arap_ids if isinstance(settlement.arap_ids, list) else []
        for arap_id_str in arap_id_list:
            try:
                arap_uid = uuid.UUID(str(arap_id_str))
            except (ValueError, AttributeError):
                continue
            arap = (await db.execute(
                select(ArApRecord).where(
                    ArApRecord.id == arap_uid,
                    ArApRecord.is_deleted == False,
                )
            )).scalar_one_or_none()
            if arap:
                arap.settled_amount = float(arap.settled_amount or 0) + amount
                arap.remaining_amount = float(arap.total_amount or 0) - float(arap.settled_amount)
                if float(arap.remaining_amount) <= 0:
                    arap.remaining_amount = 0
                    arap.status = "settled"

    await db.flush()

    try:
        if settlement.project_id:
            from app.services.project_cost import ProjectCostService
            await ProjectCostService.allocate_from_settlement(
                project_id=str(settlement.project_id),
                settlement_id=str(settlement.id),
                amount=amount,
                direction=settlement.direction,
                db=db,
                company_id=str(settlement.company_id),
                user_id=str(settlement.created_by) if settlement.created_by else None,
            )
    except Exception:
        import logging as _log
        _log.getLogger(__name__).exception("结算成本分配失败 settlement_id=%s", settlement_id)

    await notify_company_finance_users(
        settlement.company_id,
        f"{'收款' if settlement.direction == 'in' else '付款'}凭证自动生成",
        f"结算单 {settlement.settlement_no} 已自动生成财务凭证 {voucher.voucher_no}，金额 ¥{amount:,.2f}",
        db,
        created_by=str(settlement.created_by) if settlement.created_by else None,
    )

    return voucher


async def budget_update_on_pr(
    pr_id: uuid.UUID, action: str, db: AsyncSession
) -> Budget | None:
    pr = (await db.execute(
        select(ProcurementRequest).where(
            ProcurementRequest.id == pr_id,
            ProcurementRequest.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not pr:
        return None

    budget = None
    if pr.budget_id:
        budget = (await db.execute(
            select(Budget).where(
                Budget.id == pr.budget_id,
                Budget.is_deleted == False,
            )
        )).scalar_one_or_none()

    if not budget and pr.project_id:
        budget = (await db.execute(
            select(Budget).where(
                Budget.project_id == pr.project_id,
                Budget.is_deleted == False,
                Budget.status == "approved",
            ).order_by(Budget.created_at.desc()).limit(1)
        )).scalar_one_or_none()

    if not budget:
        return None

    pr_amount = float(pr.total_amount or 0)
    current_used = float(budget.total_used or 0)

    if action == "commit":
        budget.total_used = current_used + pr_amount
    elif action == "release":
        budget.total_used = max(0, current_used - pr_amount)

    await db.flush()
    return budget


async def notify_company_finance_users(
    company_id: uuid.UUID, title: str, content: str, db: AsyncSession,
    link: str | None = None, created_by: str | None = None,
) -> int:
    from app.models.organization import User, UserRole, Role

    finance_user_ids = (await db.execute(
        select(User.id).where(
            User.company_id == company_id,
            User.is_deleted == False,
            User.status == 1,
        ).join(
            UserRole, UserRole.user_id == User.id
        ).join(
            Role, Role.id == UserRole.role_id
        ).where(
            Role.code.in_(["finance_lead", "group_admin"]),
            Role.is_deleted == False,
        )
    )).scalars().all()

    count = 0
    for uid in finance_user_ids:
        await send_notification(
            db, str(company_id), str(uid), "finance", title, content, link, created_by
        )
        count += 1

    return count


async def electricity_payment_to_project_cost(
    payment_id: uuid.UUID, db: AsyncSession
) -> None:
    from app.models.charging import ElectricityPayment
    from app.services.project_cost import ProjectCostService

    payment = (await db.execute(
        select(ElectricityPayment).where(
            ElectricityPayment.id == payment_id,
            ElectricityPayment.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not payment:
        return

    station = (await db.execute(
        select(ChargingStation).where(
            ChargingStation.id == payment.station_id,
            ChargingStation.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not station or not station.project_id:
        return

    amount = float(payment.total_amount or 0)
    if amount <= 0:
        return

    try:
        await ProjectCostService.allocate_from_electricity(
            project_id=str(station.project_id),
            payment_id=str(payment.id),
            amount=amount,
            period=payment.period,
            db=db,
            company_id=str(payment.company_id),
            user_id=str(payment.created_by) if payment.created_by else None,
        )
    except Exception:
        import logging as _log
        _log.getLogger(__name__).exception("电费成本分配失败 payment_id=%s", payment_id)
