"""全局审计模块 - 跨模块关联查询"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.models.project.models import (
    Project, ProjectLine, BankTransaction, CompanyEntity,
)
from app.models.erp.models import Contract
from app.models.finance.models import ArApRecord, Invoice
from app.models.charging.models import ChargingStation, ChargingOrder, ElectricityPayment
from app.models.petty_cash.models import PettyCashFund, PettyCashExpense

router = APIRouter(prefix="/audit", tags=["全局审计"])


def _fmt_id(val) -> str | None:
    return str(val) if val else None


@router.get("/project-links/{project_id}")
async def project_links(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """查询项目的所有跨模块关联数据"""
    cid = current_user.company_id

    # ── 项目基本信息 ──
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False, Project.company_id == cid)
    )).scalar_one_or_none()
    if not project:
        return {"error": "项目不存在"}

    entity_map = {}
    entities = (await db.execute(
        select(CompanyEntity).where(CompanyEntity.is_deleted == False, CompanyEntity.company_id == cid)
    )).scalars().all()
    for e in entities:
        entity_map[str(e.id)] = e.entity_name

    result = {
        "project": {
            "id": str(project.id),
            "name": project.name,
            "code": project.project_code,
            "status": project.status,
            "project_type": project.project_type,
            "entity_id": _fmt_id(project.entity_id),
            "entity_name": entity_map.get(_fmt_id(project.entity_id), ""),
            "contract_id": _fmt_id(project.contract_id),
            "total_budget": float(project.total_budget) if project.total_budget else None,
            "actual_cost": float(project.actual_cost) if project.actual_cost else None,
            "progress": float(project.progress) if project.progress else None,
            "start_date": str(project.start_date) if project.start_date else None,
            "end_date": str(project.end_date) if project.end_date else None,
            "counterparty_company": project.counterparty_company,
        },
        "modules": {},
    }

    # ── 1. 银行流水 ──
    bank_txs = (await db.execute(
        select(BankTransaction).where(
            BankTransaction.project_id == project_id,
            BankTransaction.is_deleted == False,
            BankTransaction.company_id == cid,
        ).order_by(BankTransaction.tx_date.desc())
    )).scalars().all()
    result["modules"]["bank"] = {
        "label": "银行流水",
        "icon": "Landmark",
        "count": len(bank_txs),
        "total_income": sum(float(t.tx_amount) for t in bank_txs if float(t.tx_amount) > 0),
        "total_expense": sum(abs(float(t.tx_amount)) for t in bank_txs if float(t.tx_amount) < 0),
        "items": [
            {
                "id": str(t.id),
                "tx_date": str(t.tx_date),
                "tx_amount": float(t.tx_amount),
                "counterparty": t.counterparty,
                "summary": t.summary,
                "purpose": t.purpose,
                "remark": t.remark,
                "expense_type": t.expense_type,
                "account_name": t.account_name,
                "bank_name": t.bank_name,
                "tx_type": t.tx_type,
                "entity_id": _fmt_id(t.entity_id),
                "entity_name": entity_map.get(_fmt_id(t.entity_id), ""),
                "matched": t.matched,
                "source_ref": t.source_ref,
            }
            for t in bank_txs
        ],
    }

    # ── 2. 合同 ──
    contracts = (await db.execute(
        select(Contract).where(
            Contract.project_id == project_id,
            Contract.is_deleted == False,
            Contract.company_id == cid,
        ).order_by(Contract.signing_date.desc())
    )).scalars().all()
    # Also find contracts linked via contract_id on project
    if project.contract_id and not any(str(c.id) == str(project.contract_id) for c in contracts):
        extra = (await db.execute(
            select(Contract).where(Contract.id == project.contract_id, Contract.is_deleted == False)
        )).scalar_one_or_none()
        if extra:
            contracts = [extra] + list(contracts)
    result["modules"]["contracts"] = {
        "label": "合同",
        "icon": "FileSignature",
        "count": len(contracts),
        "items": [
            {
                "id": str(c.id),
                "contract_no": c.contract_no,
                "name": c.name,
                "contract_type": c.contract_type,
                "party_a": c.party_a,
                "party_b": c.party_b,
                "total_amount": float(c.total_amount) if c.total_amount else 0,
                "paid_amount": float(c.paid_amount) if c.paid_amount else 0,
                "status": c.status,
                "signing_date": str(c.signing_date) if c.signing_date else None,
                "entity_id": _fmt_id(c.entity_id),
                "entity_name": entity_map.get(_fmt_id(c.entity_id), ""),
            }
            for c in contracts
        ],
    }

    # ── 3. 应收应付 ──
    araps = (await db.execute(
        select(ArApRecord).where(
            ArApRecord.project_id == project_id,
            ArApRecord.is_deleted == False,
            ArApRecord.company_id == cid,
        ).order_by(ArApRecord.due_date.desc())
    )).scalars().all()
    result["modules"]["ar_ap"] = {
        "label": "应收应付",
        "icon": "ArrowLeftRight",
        "count": len(araps),
        "total_ar": sum(float(a.total_amount) for a in araps if a.type == "ar"),
        "total_ap": sum(float(a.total_amount) for a in araps if a.type == "ap"),
        "total_remaining": sum(float(a.remaining_amount) for a in araps),
        "items": [
            {
                "id": str(a.id),
                "type": a.type,
                "source_no": a.source_no,
                "counterparty": a.counterparty,
                "total_amount": float(a.total_amount),
                "settled_amount": float(a.settled_amount),
                "remaining_amount": float(a.remaining_amount),
                "status": a.status,
                "due_date": str(a.due_date) if a.due_date else None,
                "contract_id": _fmt_id(a.contract_id),
            }
            for a in araps
        ],
    }

    # ── 4. 发票 ──
    invoices = (await db.execute(
        select(Invoice).where(
            Invoice.project_id == project_id,
            Invoice.is_deleted == False,
            Invoice.company_id == cid,
        ).order_by(Invoice.issue_date.desc())
    )).scalars().all()
    result["modules"]["invoices"] = {
        "label": "发票",
        "icon": "Receipt",
        "count": len(invoices),
        "items": [
            {
                "id": str(i.id),
                "invoice_type": i.invoice_type,
                "direction": i.direction,
                "invoice_code": i.invoice_code,
                "invoice_no": i.invoice_no,
                "issue_date": str(i.issue_date) if i.issue_date else None,
                "seller_name": i.seller_name,
                "buyer_name": i.buyer_name,
                "total_amount": float(i.total_amount) if i.total_amount else 0,
                "tax_amount": float(i.tax_amount) if i.tax_amount else 0,
                "check_status": i.check_status,
            }
            for i in invoices
        ],
    }

    # ── 5. 充电站 ──
    stations = (await db.execute(
        select(ChargingStation).where(
            ChargingStation.project_id == project_id,
            ChargingStation.is_deleted == False,
            ChargingStation.company_id == cid,
        )
    )).scalars().all()
    station_ids = [str(s.id) for s in stations]
    # Get recent orders for these stations
    recent_orders = []
    if station_ids:
        orders = (await db.execute(
            select(ChargingOrder).where(
                ChargingOrder.station_id.in_(station_ids),
                ChargingOrder.is_deleted == False,
                ChargingOrder.company_id == cid,
            ).order_by(ChargingOrder.start_time.desc()).limit(50)
        )).scalars().all()
        recent_orders = [
            {
                "id": str(o.id),
                "order_no": o.order_no,
                "station_name": o.station_name,
                "charging_kwh": float(o.charging_kwh) if o.charging_kwh else 0,
                "total_amount": float(o.total_amount) if o.total_amount else 0,
                "pay_status": o.pay_status,
                "start_time": str(o.start_time) if o.start_time else None,
            }
            for o in orders
        ]
    result["modules"]["charging"] = {
        "label": "充电站",
        "icon": "Zap",
        "count": len(stations),
        "station_count": len(stations),
        "order_count": len(recent_orders),
        "items": [
            {
                "id": str(s.id),
                "name": s.name,
                "station_code": s.station_code,
                "status": s.status,
                "address": s.address,
                "electricity_payee": s.electricity_payee,
                "total_parking": s.total_parking,
                "operation_start_date": str(s.operation_start_date) if s.operation_start_date else None,
            }
            for s in stations
        ],
        "recent_orders": recent_orders,
    }

    # ── 6. 电费缴纳 ──
    elec_payments = (await db.execute(
        select(ElectricityPayment).where(
            ElectricityPayment.project_id == project_id,
            ElectricityPayment.is_deleted == False,
            ElectricityPayment.company_id == cid,
        ).order_by(ElectricityPayment.period.desc())
    )).scalars().all()
    result["modules"]["electricity"] = {
        "label": "电费缴纳",
        "icon": "Bolt",
        "count": len(elec_payments),
        "total_amount": sum(float(e.total_amount) for e in elec_payments if e.total_amount),
        "items": [
            {
                "id": str(e.id),
                "period": e.period,
                "total_kwh": float(e.total_kwh) if e.total_kwh else None,
                "total_amount": float(e.total_amount) if e.total_amount else None,
                "payment_status": e.payment_status,
                "due_date": str(e.due_date) if e.due_date else None,
                "payment_date": str(e.payment_date) if e.payment_date else None,
                "remark": e.remark,
            }
            for e in elec_payments
        ],
    }

    # ── 7. 项目明细 ──
    lines = (await db.execute(
        select(ProjectLine).where(
            ProjectLine.project_id == project_id,
            ProjectLine.is_deleted == False,
        ).order_by(ProjectLine.record_date.desc())
    )).scalars().all()
    result["modules"]["project_lines"] = {
        "label": "项目明细",
        "icon": "ListTree",
        "count": len(lines),
        "total_amount": sum(float(l.amount) for l in lines if l.amount),
        "items": [
            {
                "id": str(l.id),
                "line_type": l.line_type,
                "amount": float(l.amount) if l.amount else 0,
                "description": l.description,
                "record_date": str(l.record_date) if l.record_date else None,
                "source_type": l.source_type,
                "source_no": l.source_no,
            }
            for l in lines
        ],
    }

    # ── 8. 备用金 ──
    petty_funds = (await db.execute(
        select(PettyCashFund).where(
            PettyCashFund.project_id == project_id,
            PettyCashFund.is_deleted == False,
            PettyCashFund.company_id == cid,
        )
    )).scalars().all()
    petty_expenses = (await db.execute(
        select(PettyCashExpense).where(
            PettyCashExpense.project_id == project_id,
            PettyCashExpense.is_deleted == False,
            PettyCashExpense.company_id == cid,
        ).order_by(PettyCashExpense.expense_date.desc())
    )).scalars().all()
    result["modules"]["petty_cash"] = {
        "label": "备用金",
        "icon": "Wallet",
        "count": len(petty_funds) + len(petty_expenses),
        "fund_count": len(petty_funds),
        "expense_count": len(petty_expenses),
        "total_fund": sum(float(f.amount) for f in petty_funds if f.amount),
        "total_expense": sum(float(e.amount) for e in petty_expenses if e.amount),
        "items": [
            {
                "id": str(e.id),
                "expense_date": str(e.expense_date) if e.expense_date else None,
                "amount": float(e.amount) if e.amount else 0,
                "description": e.description,
                "status": e.status,
                "category": e.category,
            }
            for e in petty_expenses
        ],
    }

    # ── Summary stats ──
    result["summary"] = {
        "total_modules": len([k for k, v in result["modules"].items() if v["count"] > 0]),
        "total_records": sum(v["count"] for v in result["modules"].values()),
        "bank_income": result["modules"]["bank"]["total_income"],
        "bank_expense": result["modules"]["bank"]["total_expense"],
        "bank_net": round(result["modules"]["bank"]["total_income"] - result["modules"]["bank"]["total_expense"], 2),
    }

    return result


@router.get("/projects-overview")
async def projects_overview(
    keyword: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """项目列表概览 - 含各模块记录数量"""
    cid = current_user.company_id

    query = select(Project).where(Project.is_deleted == False, Project.company_id == cid)
    if keyword:
        kw = f"%{keyword}%"
        query = query.where(Project.name.ilike(kw) | Project.project_code.ilike(kw))
    query = query.order_by(Project.created_at.desc())

    projects = (await db.execute(query)).scalars().all()

    entity_map = {}
    entities = (await db.execute(
        select(CompanyEntity).where(CompanyEntity.is_deleted == False, CompanyEntity.company_id == cid)
    )).scalars().all()
    for e in entities:
        entity_map[str(e.id)] = e.entity_name

    results = []
    for p in projects:
        pid = str(p.id)
        # Count related records
        bank_count = (await db.execute(
            select(func.count()).select_from(BankTransaction).where(
                BankTransaction.project_id == pid, BankTransaction.is_deleted == False, BankTransaction.company_id == cid
            )
        )).scalar() or 0
        contract_count = (await db.execute(
            select(func.count()).select_from(Contract).where(
                Contract.project_id == pid, Contract.is_deleted == False, Contract.company_id == cid
            )
        )).scalar() or 0
        arap_count = (await db.execute(
            select(func.count()).select_from(ArApRecord).where(
                ArApRecord.project_id == pid, ArApRecord.is_deleted == False, ArApRecord.company_id == cid
            )
        )).scalar() or 0
        invoice_count = (await db.execute(
            select(func.count()).select_from(Invoice).where(
                Invoice.project_id == pid, Invoice.is_deleted == False, Invoice.company_id == cid
            )
        )).scalar() or 0
        station_count = (await db.execute(
            select(func.count()).select_from(ChargingStation).where(
                ChargingStation.project_id == pid, ChargingStation.is_deleted == False, ChargingStation.company_id == cid
            )
        )).scalar() or 0

        results.append({
            "id": pid,
            "name": p.name,
            "code": p.project_code,
            "status": p.status,
            "entity_name": entity_map.get(_fmt_id(p.entity_id), ""),
            "bank_count": bank_count,
            "contract_count": contract_count,
            "arap_count": arap_count,
            "invoice_count": invoice_count,
            "station_count": station_count,
            "total_links": bank_count + contract_count + arap_count + invoice_count + station_count,
        })

    return {"items": results, "total": len(results)}
