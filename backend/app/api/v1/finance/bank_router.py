import json
import logging
import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import generate_no, get_current_user, get_db
from app.core.cache import cached, invalidate_cache
from app.models.erp import Customer, Supplier
from app.models.finance import ArApRecord
from app.models.organization import User
from app.models.project import BankTransaction
from app.models.project.models import CompanyEntity, ProjectLine, Project
from app.models.intelligence.models import BusinessKnowledge
from app.services.bank_import import BankImportService
from app.services.bank_cascade import capture_tx_snapshot, cascade_on_annotate, cascade_on_delete
from app.services.rule_engine import (
    load_annotation_rules, apply_rules_to_transactions, transaction_matches_rule,
    generate_rule_from_transaction, evaluate_condition,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/finance/bank", tags=["银行流水管理"])


class BankTxItem(BaseModel):
    account_name: str | None = None
    account_no: str | None = None
    bank_name: str | None = None
    tx_date: date
    tx_amount: float
    balance: float | None = None
    counterparty: str | None = None
    counterparty_account: str | None = None
    summary: str | None = None
    tx_type: str = "unknown"


class BankTxImport(BaseModel):
    transactions: list[BankTxItem] = Field(..., min_length=1)
    import_batch: str | None = None
    source: str = "manual"
    entity_id: str | None = None


class ManualMatchBody(BaseModel):
    arap_id: str | None = None
    invoice_id: str | None = None


class BankTxAnnotate(BaseModel):
    expense_type: str | None = None
    expense_subtype: str | None = None
    contract_id: str | None = None
    project_id: str | None = None
    remark: str | None = None
    tags: list[dict] | None = None
    is_proxy_payment: bool | None = None
    proxy_for_entity_id: str | None = None
    tax_bearer: str | None = None
    tax_amount: float | None = None
    tax_rate: float | None = None
    invoice_amount: float | None = None
    actual_received: float | None = None
    tax_loss: float | None = None


class BankTxBatchAnnotate(BaseModel):
    ids: list[str] = Field(..., min_length=1)
    expense_type: str | None = None
    expense_subtype: str | None = None
    contract_id: str | None = None
    project_id: str | None = None
    purpose: str | None = None
    remark: str | None = None
    arap_id: str | None = None


class BatchFleetRechargeBody(BaseModel):
    tx_ids: list[str] = Field(..., min_length=1)
    fleet_customer_id: str
    bonus_amount: float = 0


class BankTxBatchAnnotateByCounterparty(BaseModel):
    counterparty: str | None = None
    account_name: str | None = None
    summary: str | None = None
    purpose: str | None = None
    min_amount: float | None = None
    max_amount: float | None = None
    expense_type: str | None = None
    expense_subtype: str | None = None
    contract_id: str | None = None
    project_id: str | None = None
    remark: str | None = None
    save_rule: bool = False
    rule_name: str | None = None


EXPENSE_TYPES = {
    "车队收款": ["充电服务费", "充电电费", "月租"],
    "电费收入": ["电费收入", "充电费"],
    "电费支出": ["电费支出", "购电"],
    "差旅费": ["差旅交通"],
    "备用金": ["备用金支出"],
    "工资薪酬": ["工资", "社保", "公积金"],
    "材料采购": ["变压器供货", "电缆供货", "充电桩供货", "电气材料供货"],
    "工程施工": ["土建施工", "高压安装", "低压安装", "附属设施建设"],
    "设备销售": ["设备销售"],
    "租赁费": ["租地"],
    "运营费": ["运营", "合作方分成"],
    "税费": ["税费"],
    "其他": ["其他"],
}

PERSONAL_ACCOUNT_KEYWORDS = ["姜鹏", "聂志平"]
CORPORATE_ACCOUNT_KEYWORDS = ["雅诗达", "永充", "勇姜"]
THIRD_PARTY_KEYWORDS = ["微信", "支付宝"]


async def _auto_create_counterparty(
    db: AsyncSession, 
    company_id: str, 
    counterparty: str | None, 
    tx_type: str,
    created_by: str
) -> str | None:
    """Auto-create Customer or Supplier from bank transaction counterparty."""
    if not counterparty or not counterparty.strip():
        return None
    
    counterparty = counterparty.strip()
    
    # Check if it's our own company (bidirectional match)
    from app.models.project.models import CompanyEntity
    entities = (await db.execute(
        select(CompanyEntity).where(
            CompanyEntity.is_deleted == False,
            CompanyEntity.company_id == company_id,
        )
    )).scalars().all()
    
    for ent in entities:
        if ent.entity_name and (ent.entity_name in counterparty or counterparty in ent.entity_name):
            return None
    
    # Check personal accounts and excluded entities
    excluded_keywords = [
        "银行", "支行", "信用卡", "网联",
        "税务", "国库", "预算收入", "待报解",
        "支付宝", "财付通", "微信",
    ]
    if any(kw in counterparty for kw in excluded_keywords):
        return None
    
    if tx_type == "income":
        # Check if customer exists
        customer_result = await db.execute(
            select(Customer).where(
                Customer.is_deleted == False,
                Customer.company_id == company_id,
                Customer.name == counterparty,
            )
        )
        if not customer_result.scalar_one_or_none():
            # Create new customer
            customer = Customer(
                name=counterparty,
                code=f"CUST-{counterparty[:10]}",
                category="自动导入",
                company_id=company_id,
                created_by=created_by,
            )
            db.add(customer)
            await db.flush()
            return str(customer.id)
    else:
        # Check if supplier exists
        supplier_result = await db.execute(
            select(Supplier).where(
                Supplier.is_deleted == False,
                Supplier.company_id == company_id,
                Supplier.name == counterparty,
            )
        )
        if not supplier_result.scalar_one_or_none():
            # Create new supplier
            supplier = Supplier(
                name=counterparty,
                code=f"SUP-{counterparty[:10]}",
                category="自动导入",
                company_id=company_id,
                created_by=created_by,
            )
            db.add(supplier)
            await db.flush()
            return str(supplier.id)
    
    return None


@router.post("/import")
async def import_bank_transactions(
    body: BankTxImport,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    batch = body.import_batch or generate_no("BT")
    created = []
    auto_created_entities = {"customers": [], "suppliers": []}
    
    for item in body.transactions:
        tx_type = "income" if item.tx_amount > 0 else "expense"
        
        # Auto-create counterparty
        counterparty_id = await _auto_create_counterparty(
            db, current_user.company_id, item.counterparty, tx_type, current_user.id
        )
        
        tx = BankTransaction(
            **item.model_dump(),
            import_batch=batch,
            source=body.source,
            entity_id=body.entity_id,
            company_id=current_user.company_id,
            created_by=current_user.id,
        )
        db.add(tx)
        created.append(tx)
        
        if counterparty_id and item.counterparty:
            if tx_type == "income":
                auto_created_entities["customers"].append(item.counterparty)
            else:
                auto_created_entities["suppliers"].append(item.counterparty)
    
    await db.flush()
    result = {"imported": len(created), "batch": batch}
    if auto_created_entities["customers"] or auto_created_entities["suppliers"]:
        result["auto_created"] = auto_created_entities
    try:
        from app.services.finance_event_chain import finance_event_chain
        chain_result = await finance_event_chain.on_bank_import(db, current_user.company_id)
        result["finance_chain"] = chain_result
    except Exception as e:
        logger.warning("Finance event chain on import failed: %s", e)
    return result


@router.get("/list")
@cached(ttl=300, prefix="bank")
async def list_bank_transactions(
    start_date: date | None = None,
    end_date: date | None = None,
    matched: bool | None = None,
    entity_id: str | None = None,
    keyword: str | None = None,
    expense_type: str | None = None,
    project_id: str | None = None,
    contract_id: str | None = None,
    fund_level: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50000),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(BankTransaction).where(
        BankTransaction.is_deleted == False,
        BankTransaction.company_id == current_user.company_id,
    )
    if start_date:
        query = query.where(BankTransaction.tx_date >= start_date)
    if end_date:
        query = query.where(BankTransaction.tx_date <= end_date)
    if matched is not None:
        query = query.where(BankTransaction.matched == matched)
    if entity_id:
        query = query.where(BankTransaction.entity_id == entity_id)
    if keyword:
        kw = f"%{keyword}%"
        query = query.where(or_(
            BankTransaction.counterparty.ilike(kw),
            BankTransaction.summary.ilike(kw),
            BankTransaction.account_name.ilike(kw),
            BankTransaction.account_no.ilike(kw),
            BankTransaction.counterparty_account.ilike(kw),
            BankTransaction.remark.ilike(kw),
        ))
    if expense_type:
        query = query.where(BankTransaction.expense_type == expense_type)
    if project_id:
        query = query.where(BankTransaction.project_id == project_id)
    if contract_id:
        query = query.where(BankTransaction.contract_id == contract_id)
    if fund_level is not None:
        query = query.where(BankTransaction.fund_level == fund_level)
    query = query.order_by(BankTransaction.tx_date.desc())
    result = await db.execute(query)
    rows = result.scalars().all()
    
    # Get entity names
    entity_ids = list(set(str(r.entity_id) for r in rows if r.entity_id))
    entity_names = {}
    if entity_ids:
        from app.models.project.models import CompanyEntity
        entity_rows = (await db.execute(
            select(CompanyEntity.id, CompanyEntity.entity_name).where(CompanyEntity.id.in_(entity_ids))
        )).all()
        entity_names = {str(e[0]): e[1] for e in entity_rows}
    
    items = []
    for r in rows:
        cp = r.counterparty
        if cp == "聂志平":
            cp = "N"
        items.append({
            "id": str(r.id), "account_name": r.account_name, "account_no": r.account_no,
            "bank_name": r.bank_name, "tx_date": str(r.tx_date),
            "tx_amount": float(r.tx_amount or 0), "balance": float(r.balance) if r.balance else None,
            "counterparty": cp, "counterparty_account": r.counterparty_account,
            "summary": r.summary, "purpose": r.purpose, "tx_type": r.tx_type, "matched": r.matched,
            "matched_arap_id": str(r.matched_arap_id) if r.matched_arap_id else None,
            "import_batch": r.import_batch, "source": r.source,
            "entity_id": str(r.entity_id) if r.entity_id else None,
            "entity_name": entity_names.get(str(r.entity_id), "") if r.entity_id else "",
            "expense_type": r.expense_type, "expense_subtype": r.expense_subtype,
            "contract_id": str(r.contract_id) if r.contract_id else None,
            "project_id": str(r.project_id) if r.project_id else None,
            "remark": r.remark, "fund_level": r.fund_level,
            "parent_tx_id": str(r.parent_tx_id) if r.parent_tx_id else None,
            "fund_group_id": str(r.fund_group_id) if r.fund_group_id else None,
            "is_proxy_payment": r.is_proxy_payment,
            "proxy_for_entity_id": str(r.proxy_for_entity_id) if r.proxy_for_entity_id else None,
            "tax_bearer": r.tax_bearer,
            "tax_amount": float(r.tax_amount) if r.tax_amount else None,
            "tax_rate": float(r.tax_rate) if r.tax_rate else None,
            "invoice_amount": float(r.invoice_amount) if r.invoice_amount else None,
            "actual_received": float(r.actual_received) if r.actual_received else None,
            "tax_loss": float(r.tax_loss) if r.tax_loss else None,
        })
    return {"items": items, "total": len(items), "page": 1, "page_size": len(items)}


@router.post("/auto-match")
async def auto_match_bank_transactions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        from app.services.finance_event_chain import finance_event_chain
        result = await finance_event_chain.on_bank_import(db, current_user.company_id)
        return result
    except Exception as e:
        logger.warning("Finance event chain auto-match failed, fallback: %s", e)

    unmatched_txs = (await db.execute(
        select(BankTransaction).where(
            BankTransaction.is_deleted == False,
            BankTransaction.company_id == current_user.company_id,
            BankTransaction.matched == False,
        )
    )).scalars().all()

    unmatched_araps = (await db.execute(
        select(ArApRecord).where(
            ArApRecord.is_deleted == False,
            ArApRecord.company_id == current_user.company_id,
            ArApRecord.remaining_amount > 0,
        )
    )).scalars().all()

    matched_count = 0
    for tx in unmatched_txs:
        tx_amount = abs(float(tx.tx_amount or 0))
        for arap in unmatched_araps:
            arap_amount = float(arap.remaining_amount or 0)
            if abs(tx_amount - arap_amount) > 0.01:
                continue
            if tx.counterparty and arap.counterparty:
                if tx.counterparty not in arap.counterparty and arap.counterparty not in tx.counterparty:
                    continue
            tx.matched = True
            tx.matched_arap_id = arap.id
            arap.settled_amount = float(arap.settled_amount or 0) + tx_amount
            arap.remaining_amount = float(arap.total_amount or 0) - float(arap.settled_amount)
            if float(arap.remaining_amount or 0) <= 0.01:
                arap.status = "settled"
            matched_count += 1
            break
    await db.flush()
    return {"matched": matched_count}


@router.put("/{tx_id}/match")
async def manual_match_bank_transaction(
    tx_id: str,
    body: ManualMatchBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tx = (await db.execute(
        select(BankTransaction).where(
            BankTransaction.id == tx_id,
            BankTransaction.is_deleted == False,
            BankTransaction.company_id == current_user.company_id,
        )
    )).scalar_one_or_none()
    if not tx:
        raise HTTPException(404, "银行流水不存在")
    arap = (await db.execute(
        select(ArApRecord).where(
            ArApRecord.id == body.arap_id,
            ArApRecord.is_deleted == False,
            ArApRecord.company_id == current_user.company_id,
        )
    )).scalar_one_or_none()
    if not arap:
        raise HTTPException(404, "应收应付记录不存在")
    tx.matched = True
    tx.matched_arap_id = arap.id
    tx.updated_by = current_user.id
    match_amount = abs(float(tx.tx_amount or 0))
    arap.settled_amount = float(arap.settled_amount or 0) + match_amount
    arap.remaining_amount = float(arap.total_amount or 0) - float(arap.settled_amount)
    if float(arap.remaining_amount or 0) <= 0.01:
        arap.status = "settled"
    await db.flush()
    return {"message": "匹配成功"}


@router.delete("/{tx_id}")
async def delete_bank_transaction(
    tx_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Fetch the tx first for cascade reversal
    tx = (await db.execute(
        select(BankTransaction).where(
            BankTransaction.id == tx_id,
            BankTransaction.is_deleted == False,
            BankTransaction.company_id == current_user.company_id,
        )
    )).scalar_one_or_none()
    if not tx:
        raise HTTPException(404, "银行流水不存在")

    # Reverse all cascades before soft-delete
    reversed_items = await cascade_on_delete(tx, db, current_user.company_id, current_user.id)

    tx.is_deleted = True
    tx.updated_by = current_user.id
    await db.flush()
    return {"message": "删除成功", "reversed": reversed_items}


@router.get("/expense-types")
@cached(ttl=3600, prefix="bank")
async def get_expense_types():
    return EXPENSE_TYPES


@router.get("/{tx_id}/suggest-annotation")
async def suggest_annotation(
    tx_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """根据流水对手方、摘要等信息，返回快捷标注建议"""
    tx = (await db.execute(
        select(BankTransaction).where(
            BankTransaction.id == tx_id,
            BankTransaction.is_deleted == False,
            BankTransaction.company_id == current_user.company_id,
        )
    )).scalar_one_or_none()
    if not tx:
        return {"suggestions": []}

    counterparty = (tx.counterparty or "").strip()
    suggestions = []

    # 1. 电费匹配：counterparty 包含 station.electricity_payee
    from app.models.charging import ChargingStation
    stations = (await db.execute(
        select(ChargingStation).where(
            ChargingStation.electricity_payee.isnot(None),
            ChargingStation.electricity_payee != "",
            ChargingStation.is_deleted == False,
            ChargingStation.company_id == current_user.company_id,
        )
    )).scalars().all()
    for station in stations:
        if station.electricity_payee and (
            station.electricity_payee in counterparty
            or counterparty in station.electricity_payee
        ):
            direction = "收入" if float(tx.tx_amount or 0) >= 0 else "支出"
            suggestions.append({
                "type": "electricity",
                "label": f"电费{direction}-{station.name}",
                "expense_type": f"电费{direction}",
                "project_id": str(station.project_id) if station.project_id else None,
                "station_id": str(station.id),
            })

    # 2. 车队收款匹配：counterparty 匹配 FleetCustomer
    from app.models.charging import FleetCustomer
    fleet_customers = (await db.execute(
        select(FleetCustomer).where(
            FleetCustomer.is_deleted == False,
            FleetCustomer.company_id == current_user.company_id,
        )
    )).scalars().all()
    for fc in fleet_customers:
        if fc.fleet_name and (
            fc.fleet_name in counterparty or counterparty in fc.fleet_name
        ):
            # Try to find project from recent charging orders
            project_id = None
            from app.models.charging import ChargingOrder
            recent_order = (await db.execute(
                select(ChargingOrder).where(
                    ChargingOrder.fleet_customer_id == fc.id,
                    ChargingOrder.project_id.isnot(None),
                    ChargingOrder.is_deleted == False,
                ).order_by(ChargingOrder.created_at.desc()).limit(1)
            )).scalar_one_or_none()
            if recent_order:
                project_id = str(recent_order.project_id)
            suggestions.append({
                "type": "fleet",
                "label": f"车队收款-{fc.fleet_name}",
                "expense_type": "车队收款",
                "project_id": project_id,
                "fleet_customer_id": str(fc.id),
            })

    # 3. 充电运营平台结算款识别
    PLATFORM_KEYWORDS = ["特来电", "星星充电", "e充电", "快电", "新电途", "小桔充电", "云快充", "电动出行"]
    if float(tx.tx_amount or 0) > 0:
        for kw in PLATFORM_KEYWORDS:
            if kw in counterparty:
                suggestions.append({
                    "type": "platform_revenue",
                    "label": f"充电站收入-{counterparty}",
                    "expense_type": "充电站收入",
                    "project_id": None,
                })
                break

    # 4. 已知客户规律匹配（从business_knowledge读取）
    try:
        from app.models.intelligence.models import BusinessKnowledge
        import json as _json
        known_patterns = (await db.execute(
            select(BusinessKnowledge).where(
                BusinessKnowledge.category == "counterparty_mapping",
                BusinessKnowledge.is_active == True,
                BusinessKnowledge.company_id == current_user.company_id,
            )
        )).scalars().all()
        for kp in known_patterns:
            cp = kp.key
            if cp and (cp in counterparty or counterparty in cp):
                mapping = _json.loads(kp.value) if isinstance(kp.value, str) else (kp.value or {})
                suggestions.append({
                    "type": "learned_pattern",
                    "label": f"{mapping.get('expense_type', '其他')}-{counterparty}",
                    **mapping,
                })
    except Exception:
        pass

    return {"suggestions": suggestions}


@router.put("/{tx_id}/annotate")
async def annotate_bank_transaction(
    tx_id: str,
    body: BankTxAnnotate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tx = (await db.execute(
        select(BankTransaction).where(
            BankTransaction.id == tx_id,
            BankTransaction.is_deleted == False,
            BankTransaction.company_id == current_user.company_id,
        )
    )).scalar_one_or_none()
    if not tx:
        raise HTTPException(404, "银行流水不存在")
    before = capture_tx_snapshot(tx)
    if body.expense_type is not None:
        tx.expense_type = body.expense_type
    if body.expense_subtype is not None:
        tx.expense_subtype = body.expense_subtype
    if body.contract_id is not None:
        tx.contract_id = body.contract_id
    if body.project_id is not None:
        tx.project_id = body.project_id
    if body.remark is not None:
        tx.remark = body.remark
    if body.tags is not None:
        tx.tags = body.tags
    if body.is_proxy_payment is not None:
        tx.is_proxy_payment = body.is_proxy_payment
    if body.proxy_for_entity_id is not None:
        tx.proxy_for_entity_id = body.proxy_for_entity_id
    if body.tax_bearer is not None:
        tx.tax_bearer = body.tax_bearer
    if body.tax_amount is not None:
        tx.tax_amount = body.tax_amount
    if body.tax_rate is not None:
        tx.tax_rate = body.tax_rate
    if body.invoice_amount is not None:
        tx.invoice_amount = body.invoice_amount
    if body.actual_received is not None:
        tx.actual_received = body.actual_received
    if body.tax_loss is not None:
        tx.tax_loss = body.tax_loss
    tx.updated_by = current_user.id
    await db.flush()

    # ─── Auto-cascade via engine ───
    synced = await cascade_on_annotate(tx, before, db, current_user.company_id, current_user.id)
    return {"message": "标注成功", "synced": synced}


@router.post("/batch-annotate")
async def batch_annotate_bank_transactions(
    body: BankTxBatchAnnotate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    values = {"updated_by": current_user.id}
    if body.expense_type is not None:
        values["expense_type"] = body.expense_type
    if body.expense_subtype is not None:
        values["expense_subtype"] = body.expense_subtype
    if body.contract_id is not None:
        values["contract_id"] = body.contract_id
    if body.project_id is not None:
        values["project_id"] = body.project_id
    if body.purpose is not None:
        values["purpose"] = body.purpose
    if body.remark is not None:
        values["remark"] = body.remark

    if body.arap_id:
        from app.models.finance.models import ArApRecord
        arap = (await db.execute(
            select(ArApRecord).where(
                ArApRecord.id == body.arap_id,
                ArApRecord.is_deleted == False,
                ArApRecord.company_id == current_user.company_id,
            )
        )).scalar_one_or_none()
        if not arap:
            raise HTTPException(404, "AR/AP记录不存在")
        values["matched"] = True
        values["matched_arap_id"] = body.arap_id
        if arap.project_id and "project_id" not in values:
            values["project_id"] = str(arap.project_id)

    result = await db.execute(
        update(BankTransaction).where(
            BankTransaction.id.in_(body.ids),
            BankTransaction.is_deleted == False,
            BankTransaction.company_id == current_user.company_id,
        ).values(**values)
    )

    if body.arap_id:
        from app.models.finance.models import ArApRecord
        arap = (await db.execute(
            select(ArApRecord).where(ArApRecord.id == body.arap_id)
        )).scalar_one_or_none()
        if arap:
            txs = (await db.execute(
                select(BankTransaction).where(
                    BankTransaction.matched_arap_id == body.arap_id,
                    BankTransaction.is_deleted == False,
                )
            )).scalars().all()
            total_matched = sum(abs(float(t.tx_amount or 0)) for t in txs)
            arap.settled_amount = min(total_matched, float(arap.total_amount or 0))
            arap.remaining_amount = float(arap.total_amount or 0) - float(arap.settled_amount or 0)
            if float(arap.remaining_amount or 0) <= 0.01:
                arap.remaining_amount = 0
                arap.status = "settled"
            await db.flush()

    return {"updated": result.rowcount}


@router.post("/batch-fleet-recharge")
async def batch_fleet_recharge(
    body: BatchFleetRechargeBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.charging import FleetCustomer, FleetRecharge
    from app.models.finance.models import ArApRecord
    from app.api.deps.auth import generate_no

    fleet = (await db.execute(
        select(FleetCustomer).where(
            FleetCustomer.id == body.fleet_customer_id,
            FleetCustomer.is_deleted == False,
            FleetCustomer.company_id == current_user.company_id,
        )
    )).scalar_one_or_none()
    if not fleet:
        raise HTTPException(404, "车队客户不存在")

    txs = (await db.execute(
        select(BankTransaction).where(
            BankTransaction.id.in_(body.tx_ids),
            BankTransaction.is_deleted == False,
            BankTransaction.company_id == current_user.company_id,
        )
    )).scalars().all()
    if not txs:
        raise HTTPException(400, "未找到有效的银行流水")

    total_amount = sum(float(t.tx_amount or 0) for t in txs if float(t.tx_amount or 0) > 0)
    if total_amount <= 0:
        raise HTTPException(400, "选中的流水没有收入金额")

    balance_before = float(fleet.balance or 0)
    balance_after = balance_before + total_amount + body.bonus_amount
    fleet.balance = balance_after

    recharge = FleetRecharge(
        fleet_id=fleet.id,
        recharge_no=generate_no("FR"),
        amount=total_amount,
        bonus_amount=body.bonus_amount,
        balance_before=balance_before,
        balance_after=balance_after,
        status="confirmed",
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(recharge)

    for t in txs:
        t.matched = True
        t.expense_type = "车队收款"
        t.updated_by = current_user.id

    await db.flush()

    return {
        "recharge_id": str(recharge.id),
        "recharge_no": recharge.recharge_no,
        "total_amount": total_amount,
        "bonus_amount": body.bonus_amount,
        "balance_before": balance_before,
        "balance_after": balance_after,
        "matched_txs": len(txs),
    }


@router.post("/batch-annotate-by-counterparty")
async def batch_annotate_by_counterparty(
    body: BankTxBatchAnnotateByCounterparty,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """按多条件批量更新流水，支持持久记忆规则"""
    values = {"updated_by": current_user.id}
    if body.expense_type is not None:
        values["expense_type"] = body.expense_type
    if body.expense_subtype is not None:
        values["expense_subtype"] = body.expense_subtype
    if body.contract_id is not None:
        values["contract_id"] = body.contract_id
    if body.project_id is not None:
        values["project_id"] = body.project_id
    if body.remark is not None:
        values["remark"] = body.remark
    
    # Build multi-condition query
    conditions = [
        BankTransaction.is_deleted == False,
        BankTransaction.company_id == current_user.company_id,
    ]
    
    if body.counterparty:
        conditions.append(
            or_(
                BankTransaction.counterparty == body.counterparty,
                BankTransaction.counterparty.ilike(f"%{body.counterparty}%")
            )
        )
    
    if body.account_name:
        conditions.append(
            or_(
                BankTransaction.account_name == body.account_name,
                BankTransaction.account_name.ilike(f"%{body.account_name}%")
            )
        )
    
    if body.summary:
        conditions.append(
            or_(
                BankTransaction.summary == body.summary,
                BankTransaction.summary.ilike(f"%{body.summary}%")
            )
        )
    
    if body.purpose:
        conditions.append(
            or_(
                BankTransaction.purpose == body.purpose,
                BankTransaction.purpose.ilike(f"%{body.purpose}%")
            )
        )
    
    if body.min_amount is not None:
        conditions.append(BankTransaction.tx_amount >= body.min_amount)
    
    if body.max_amount is not None:
        conditions.append(BankTransaction.tx_amount <= body.max_amount)
    
    # Execute update
    result = await db.execute(
        update(BankTransaction).where(and_(*conditions)).values(**values)
    )
    
    # Save rule for persistent memory
    if body.save_rule:
        from app.models.intelligence.models import BusinessKnowledge
        import json
        
        rule_key = body.rule_name or f"rule_{body.counterparty or ''}_{body.summary or ''}"
        rule_data = {
            "counterparty": body.counterparty,
            "account_name": body.account_name,
            "summary": body.summary,
            "purpose": body.purpose,
            "min_amount": body.min_amount,
            "max_amount": body.max_amount,
            "expense_type": body.expense_type,
            "expense_subtype": body.expense_subtype,
            "project_id": body.project_id,
            "contract_id": body.contract_id,
        }
        
        # Check if rule already exists
        existing = (await db.execute(
            select(BusinessKnowledge).where(
                BusinessKnowledge.company_id == current_user.company_id,
                BusinessKnowledge.category == "counterparty_mapping",
                BusinessKnowledge.key == rule_key,
                BusinessKnowledge.is_deleted == False,
            )
        )).scalar_one_or_none()
        
        if existing:
            existing.value = json.dumps(rule_data, ensure_ascii=False)
            existing.is_active = True
            existing.updated_by = current_user.id
        else:
            rule = BusinessKnowledge(
                category="counterparty_mapping",
                key=rule_key,
                value=json.dumps(rule_data, ensure_ascii=False),
                context=f"批量标注规则: {rule_key}",
                source="manual",
                company_id=current_user.company_id,
                created_by=current_user.id,
            )
            db.add(rule)
        
        await db.flush()
    
    return {
        "updated": result.rowcount,
        "conditions": {
            "counterparty": body.counterparty,
            "summary": body.summary,
            "purpose": body.purpose,
            "amount_range": f"{body.min_amount} ~ {body.max_amount}" if body.min_amount or body.max_amount else None,
        }
    }


@router.get("/fund-flow/{tx_id}")
async def get_fund_flow(
    tx_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chain = []
    visited = set()
    current_id = tx_id

    # Walk upward to find root (L1)
    ancestors = []
    while current_id and current_id not in visited:
        visited.add(current_id)
        tx = (await db.execute(
            select(BankTransaction).where(
                BankTransaction.id == current_id,
                BankTransaction.is_deleted == False,
                BankTransaction.company_id == current_user.company_id,
            )
        )).scalar_one_or_none()
        if not tx:
            break
        ancestors.append(tx)
        current_id = str(tx.parent_tx_id) if tx.parent_tx_id else None
    ancestors.reverse()

    # Walk downward from each ancestor
    async def collect_children(parent_id: str):
        children = (await db.execute(
            select(BankTransaction).where(
                BankTransaction.parent_tx_id == parent_id,
                BankTransaction.is_deleted == False,
                BankTransaction.company_id == current_user.company_id,
            )
        )).scalars().all()
        result = []
        for child in children:
            cid = str(child.id)
            child_data = {
                "id": cid,
                "tx_date": str(child.tx_date),
                "tx_amount": float(child.tx_amount or 0),
                "counterparty": child.counterparty,
                "summary": child.summary,
                "account_name": child.account_name,
                "fund_level": child.fund_level,
                "children": await collect_children(cid) if cid not in visited else [],
            }
            visited.add(cid)
            result.append(child_data)
        return result

    for tx in ancestors:
        tid = str(tx.id)
        chain.append({
            "id": tid,
            "tx_date": str(tx.tx_date),
            "tx_amount": float(tx.tx_amount or 0),
            "counterparty": tx.counterparty,
            "summary": tx.summary,
            "account_name": tx.account_name,
            "fund_level": tx.fund_level,
            "children": await collect_children(tid) if tid not in visited else [],
        })
        visited.add(tid)

    return {"chain": chain}


@router.post("/import-file")
async def import_bank_file(
    file: UploadFile = File(...),
    entity_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    file_data = await file.read()
    filename = file.filename or "unknown.csv"
    logger.info("Bank import request: filename=%s size=%d", filename, len(file_data))
    try:
        transactions = BankImportService.parse_file(file_data, filename)
    except Exception as e:
        logger.error("Bank import parse failed: %s", e)
        raise HTTPException(400, f"文件解析失败: {str(e)}")

    if not transactions:
        raise HTTPException(400, "未从文件中解析到任何交易记录")

    no_date_count = sum(1 for t in transactions if not t.get("tx_date"))
    if no_date_count > 0:
        logger.warning("Bank import: %d/%d records have no tx_date, sample raw_dates: %s",
                       no_date_count, len(transactions),
                       [t.get("tx_date_raw", t.get("tx_date")) for t in transactions[:5]])

    existing_refs = set()
    ref_rows = (await db.execute(
        select(BankTransaction.source_ref).where(
            BankTransaction.is_deleted == False,
            BankTransaction.company_id == current_user.company_id,
            BankTransaction.source_ref != None,
        )
    )).scalars().all()
    existing_refs = {str(r) for r in ref_rows if r}

    new_txs = BankImportService.deduplicate(transactions, existing_refs)
    if not new_txs:
        return {"imported": 0, "skipped": len(transactions), "batch": None, "message": "所有记录均已存在"}

    # Auto-detect fund_level for each transaction
    def detect_fund_level(td: dict) -> int:
        account = (td.get("account_name") or "").lower()
        source = (td.get("source_ref") or "").lower()
        for kw in CORPORATE_ACCOUNT_KEYWORDS:
            if kw.lower() in account:
                return 1
        for kw in PERSONAL_ACCOUNT_KEYWORDS:
            if kw.lower() in account:
                return 2
        for kw in THIRD_PARTY_KEYWORDS:
            if kw.lower() in source or kw.lower() in account:
                return 3
        # Default: try counterparty hints
        counterparty = (td.get("counterparty") or "").lower()
        for kw in CORPORATE_ACCOUNT_KEYWORDS:
            if kw.lower() in counterparty:
                return 1
        for kw in PERSONAL_ACCOUNT_KEYWORDS:
            if kw.lower() in counterparty:
                return 2
        return 1

    for td in new_txs:
        td["_fund_level"] = detect_fund_level(td)

    # Auto-detect entity_id from account_name if not specified
    if not entity_id:
        all_entities = (await db.execute(
            select(CompanyEntity).where(
                CompanyEntity.is_deleted == False,
                CompanyEntity.company_id == current_user.company_id,
            )
        )).scalars().all()
        entity_id = None  # keep None if can't detect
        for td in new_txs:
            if td.get("_entity_id"):
                continue
            acct = (td.get("account_name") or "")
            for ent in all_entities:
                if ent.entity_name and ent.entity_name in acct:
                    td["_entity_id"] = str(ent.id)
                    break
            if not td.get("_entity_id"):
                # Also check bank_account match
                acct_no = (td.get("account_no") or "")
                for ent in all_entities:
                    if ent.bank_account and ent.bank_account in acct_no:
                        td["_entity_id"] = str(ent.id)
                        break

    batch = generate_no("BT")
    skipped_no_date = 0
    actual_imported = 0
    created_txs = []
    for tx_data in new_txs:
        if not tx_data.get("tx_date"):
            skipped_no_date += 1
            logger.warning("Skip tx no_date: ref=%s amount=%s counterparty=%s",
                           tx_data.get("source_ref"), tx_data.get("tx_amount"), tx_data.get("counterparty"))
            continue
        raw_date = tx_data["tx_date"]
        if isinstance(raw_date, str):
            try:
                parsed_date = datetime.strptime(raw_date, "%Y-%m-%d").date()
            except ValueError:
                skipped_no_date += 1
                continue
        elif isinstance(raw_date, date):
            parsed_date = raw_date
        else:
            skipped_no_date += 1
            continue
        # Auto-create counterparty
        tx_type = tx_data.get("tx_type", "unknown")
        if tx_type == "unknown":
            tx_type = "income" if float(tx_data.get("tx_amount", 0)) > 0 else "expense"
        counterparty_id = await _auto_create_counterparty(
            db, current_user.company_id, tx_data.get("counterparty"), tx_type, current_user.id
        )
        
        tx = BankTransaction(
            tx_date=parsed_date,
            tx_amount=tx_data["tx_amount"],
            balance=tx_data.get("balance"),
            counterparty=tx_data.get("counterparty"),
            counterparty_account=tx_data.get("counterparty_account"),
            summary=tx_data.get("summary"),
            purpose=tx_data.get("purpose"),
            remark=tx_data.get("remark"),
            tx_type=tx_data.get("tx_type", "unknown"),
            account_name=tx_data.get("account_name"),
            account_no=tx_data.get("account_no"),
            bank_name=tx_data.get("bank_name"),
            source_ref=tx_data.get("source_ref"),
            import_batch=batch,
            source=f"file:{filename}",
            entity_id=tx_data.get("_entity_id") or entity_id,
            company_id=current_user.company_id,
            created_by=current_user.id,
            fund_level=tx_data.get("_fund_level", 1),
            # Auto-tag: personal account outflow → 备用金
            expense_type="备用金" if tx_data.get("_fund_level") == 2 and float(tx_data.get("tx_amount", 0)) < 0 else None,
        )
        db.add(tx)
        created_txs.append(tx)
        actual_imported += 1
    await db.flush()

    # Auto-link parent_tx_id: L2→L1, L3→L2 by matching amount+date+counterparty
    linked_count = 0
    if actual_imported > 0:
        l2_txs = [t for t in created_txs if t.fund_level == 2]
        l3_txs = [t for t in created_txs if t.fund_level == 3]
        if l2_txs or l3_txs:
            # 按月份查询，只查新导入交易日期前后15天的历史记录
            tx_dates = {t.tx_date for t in created_txs if t.tx_date}
            if tx_dates:
                min_date = min(tx_dates) - timedelta(days=15)
                max_date = max(tx_dates) + timedelta(days=15)
                all_l1 = (await db.execute(
                    select(BankTransaction).where(
                        BankTransaction.is_deleted == False,
                        BankTransaction.company_id == current_user.company_id,
                        BankTransaction.fund_level == 1,
                        BankTransaction.tx_date >= min_date,
                        BankTransaction.tx_date <= max_date,
                    )
                )).scalars().all()
                all_l2 = (await db.execute(
                    select(BankTransaction).where(
                        BankTransaction.is_deleted == False,
                        BankTransaction.company_id == current_user.company_id,
                        BankTransaction.fund_level == 2,
                        BankTransaction.tx_date >= min_date,
                        BankTransaction.tx_date <= max_date,
                    )
                )).scalars().all()

                # 按金额索引历史记录
                l1_by_amount: dict[float, list] = {}
                l2_by_amount: dict[float, list] = {}
                for t in all_l1:
                    k = round(abs(float(t.tx_amount or 0)), 2)
                    l1_by_amount.setdefault(k, []).append(t)
                for t in all_l2:
                    k = round(abs(float(t.tx_amount or 0)), 2)
                    l2_by_amount.setdefault(k, []).append(t)

                for tx in l2_txs:
                    k = round(abs(float(tx.tx_amount or 0)), 2)
                    candidates = l1_by_amount.get(k, [])
                    if not candidates:
                        continue
                    best = None
                    best_score = 0
                    for l1 in candidates:
                        score = 1
                        if tx.counterparty and l1.counterparty:
                            if tx.counterparty in l1.counterparty or l1.counterparty in tx.counterparty:
                                score += 2
                        if tx.tx_date == l1.tx_date:
                            score += 1
                        if score > best_score:
                            best_score = score
                            best = l1
                    if best and best_score >= 2:
                        tx.parent_tx_id = best.id
                        if not best.fund_group_id:
                            best.fund_group_id = uuid.uuid4()
                        tx.fund_group_id = best.fund_group_id
                        linked_count += 1

                for tx in l3_txs:
                    k = round(abs(float(tx.tx_amount or 0)), 2)
                    candidates = l2_by_amount.get(k, [])
                    if not candidates:
                        continue
                    best = None
                    best_score = 0
                    for l2 in candidates:
                        score = 1
                        if tx.counterparty and l2.counterparty:
                            if tx.counterparty in l2.counterparty or l2.counterparty in tx.counterparty:
                                score += 2
                        if tx.tx_date == l2.tx_date:
                            score += 1
                        if score > best_score:
                            best_score = score
                            best = l2
                    if best and best_score >= 2:
                        tx.parent_tx_id = best.id
                        if best.fund_group_id:
                            tx.fund_group_id = best.fund_group_id
                        else:
                            g_id = uuid.uuid4()
                            best.fund_group_id = g_id
                            tx.fund_group_id = g_id
                        linked_count += 1

                await db.flush()

    # Auto-apply saved rules to newly imported transactions
    rule_applied_count = 0
    if actual_imported > 0:
        try:
            from app.models.intelligence.models import BusinessKnowledge
            import json as _json
            saved_rules = (await db.execute(
                select(BusinessKnowledge).where(
                    BusinessKnowledge.category == "counterparty_mapping",
                    BusinessKnowledge.is_active == True,
                    BusinessKnowledge.is_deleted == False,
                    BusinessKnowledge.company_id == current_user.company_id,
                )
            )).scalars().all()
            
            for tx in created_txs:
                if tx.project_id and tx.expense_type:
                    continue
                    
                cp = (tx.counterparty or "").strip()
                sm = (tx.summary or "").strip()
                pp = (tx.purpose or "").strip()
                amt = float(tx.tx_amount or 0)
                
                for rule in saved_rules:
                    try:
                        mapping = _json.loads(rule.value) if isinstance(rule.value, str) else (rule.value or {})
                        matched = True
                        
                        # Check counterparty
                        if mapping.get("counterparty"):
                            if mapping["counterparty"] not in cp and cp not in mapping["counterparty"]:
                                matched = False
                        
                        # Check summary
                        if matched and mapping.get("summary"):
                            if mapping["summary"] not in sm and sm not in mapping["summary"]:
                                matched = False
                        
                        # Check purpose
                        if matched and mapping.get("purpose"):
                            if mapping["purpose"] not in pp and pp not in mapping["purpose"]:
                                matched = False
                        
                        # Check amount range
                        if matched and mapping.get("min_amount") is not None:
                            if amt < mapping["min_amount"]:
                                matched = False
                        if matched and mapping.get("max_amount") is not None:
                            if amt > mapping["max_amount"]:
                                matched = False
                        
                        if matched:
                            if mapping.get("expense_type") and not tx.expense_type:
                                tx.expense_type = mapping["expense_type"]
                            if mapping.get("expense_subtype") and not tx.expense_subtype:
                                tx.expense_subtype = mapping["expense_subtype"]
                            if mapping.get("project_id") and not tx.project_id:
                                tx.project_id = mapping["project_id"]
                            if mapping.get("contract_id") and not tx.contract_id:
                                tx.contract_id = mapping["contract_id"]
                            rule_applied_count += 1
                            rule.usage_count = (rule.usage_count or 0) + 1
                            rule.last_used_at = datetime.now()
                            break
                    except Exception:
                        continue
            
            if rule_applied_count > 0:
                await db.flush()
        except Exception as e:
            logger.warning("Auto-apply rules failed: %s", e)

    chain_result = {}
    if actual_imported > 0:
        try:
            from app.services.finance_event_chain import finance_event_chain
            chain_result = await finance_event_chain.on_bank_import(db, current_user.company_id)
        except Exception as e:
            logger.warning("Finance event chain on file import failed: %s", e)

    logger.info("Bank import file=%s parsed=%d dedup_new=%d no_date=%d written=%d linked=%d rules=%d",
                filename, len(transactions), len(new_txs), skipped_no_date, actual_imported, linked_count, rule_applied_count)
    result = {
        "imported": actual_imported,
        "skipped": len(transactions) - actual_imported,
        "batch": batch if actual_imported > 0 else None,
        "linked": linked_count,
        "rule_applied": rule_applied_count,
        "preview": new_txs[:10],
    }
    if chain_result:
        result["finance_chain"] = chain_result
    return result


@router.get("/annotation-rules")
async def list_annotation_rules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List saved counterparty mapping rules"""
    from app.models.intelligence.models import BusinessKnowledge
    import json as _json
    
    rules = (await db.execute(
        select(BusinessKnowledge).where(
            BusinessKnowledge.category == "counterparty_mapping",
            BusinessKnowledge.is_deleted == False,
            BusinessKnowledge.company_id == current_user.company_id,
        ).order_by(BusinessKnowledge.created_at.desc())
    )).scalars().all()
    
    items = []
    for r in rules:
        try:
            mapping = _json.loads(r.value) if isinstance(r.value, str) else (r.value or {})
            items.append({
                "id": str(r.id),
                "name": r.key,
                "conditions": {
                    "counterparty": mapping.get("counterparty"),
                    "summary": mapping.get("summary"),
                    "purpose": mapping.get("purpose"),
                    "min_amount": mapping.get("min_amount"),
                    "max_amount": mapping.get("max_amount"),
                },
                "actions": {
                    "expense_type": mapping.get("expense_type"),
                    "expense_subtype": mapping.get("expense_subtype"),
                    "project_id": mapping.get("project_id"),
                    "contract_id": mapping.get("contract_id"),
                },
                "is_active": r.is_active,
                "usage_count": r.usage_count,
                "last_used_at": str(r.last_used_at) if r.last_used_at else None,
                "created_at": str(r.created_at) if r.created_at else None,
            })
        except Exception:
            continue
    
    return {"items": items, "total": len(items)}


@router.delete("/annotation-rules/{rule_id}")
async def delete_annotation_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a saved rule"""
    from app.models.intelligence.models import BusinessKnowledge
    
    rule = (await db.execute(
        select(BusinessKnowledge).where(
            BusinessKnowledge.id == rule_id,
            BusinessKnowledge.company_id == current_user.company_id,
            BusinessKnowledge.is_deleted == False,
        )
    )).scalar_one_or_none()
    
    if not rule:
        raise HTTPException(404, "规则不存在")
    
    rule.is_deleted = True
    rule.updated_by = current_user.id
    await db.flush()
    
    return {"message": "规则已删除"}


@router.get("/counterparty-summary")
async def counterparty_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Extract suppliers and customers from bank transactions.
    Outflow (we pay) = counterparty is supplier.
    Inflow (we receive) = counterparty is customer.
    """
    from sqlalchemy import and_
    from app.models.project.models import CompanyEntity

    # Get entity names to exclude self-transactions
    entities = (await db.execute(
        select(CompanyEntity).where(
            CompanyEntity.is_deleted == False,
            CompanyEntity.company_id == current_user.company_id,
        )
    )).scalars().all()
    entity_names = {e.entity_name for e in entities if e.entity_name}

    # Exclude system/internal keywords
    excluded = {"银行", "支行", "信用卡", "网联", "税务", "国库", "预算收入", "待报解", "支付宝", "财付通", "微信", "姜鹏", "聂志平"}
    excluded.update(entity_names)

    all_txs = (await db.execute(
        select(BankTransaction).where(
            BankTransaction.is_deleted == False,
            BankTransaction.company_id == current_user.company_id,
        )
    )).scalars().all()

    counterparties: dict[str, dict] = {}
    for tx in all_txs:
        cp = (tx.counterparty or "").strip()
        if not cp:
            continue
        # Skip excluded keywords
        if any(kw in cp for kw in excluded):
            continue

        if cp not in counterparties:
            counterparties[cp] = {
                "name": cp,
                "total_inflow": 0.0,
                "total_outflow": 0.0,
                "inflow_count": 0,
                "outflow_count": 0,
                "latest_date": None,
                "type": "unknown",
            }

        amount = float(tx.tx_amount or 0)
        if amount > 0:
            counterparties[cp]["total_inflow"] += amount
            counterparties[cp]["inflow_count"] += 1
        elif amount < 0:
            counterparties[cp]["total_outflow"] += abs(amount)
            counterparties[cp]["outflow_count"] += 1

        tx_date = str(tx.tx_date) if tx.tx_date else ""
        if not counterparties[cp]["latest_date"] or tx_date > counterparties[cp]["latest_date"]:
            counterparties[cp]["latest_date"] = tx_date

    # Classify: mainly outflow = supplier, mainly inflow = customer, both = both
    items = []
    for cp_name, data in counterparties.items():
        if data["outflow_count"] > 0 and data["inflow_count"] == 0:
            data["type"] = "supplier"
        elif data["inflow_count"] > 0 and data["outflow_count"] == 0:
            data["type"] = "customer"
        elif data["outflow_count"] > 0 and data["inflow_count"] > 0:
            data["type"] = "both"
        else:
            continue
        data["total_inflow"] = round(data["total_inflow"], 2)
        data["total_outflow"] = round(data["total_outflow"], 2)
        items.append(data)

    items.sort(key=lambda x: x["total_outflow"] + x["total_inflow"], reverse=True)

    suppliers = [i for i in items if i["type"] in ("supplier", "both")]
    customers = [i for i in items if i["type"] in ("customer", "both")]

    return {
        "suppliers": suppliers,
        "customers": customers,
        "total_suppliers": len(suppliers),
        "total_customers": len(customers),
    }


@router.get("/cross-entity-flow")
async def cross_entity_fund_flow(
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Analyze fund flows between company entities and personal accounts (姜鹏/聂志平)."""
    entities = (await db.execute(
        select(CompanyEntity).where(
            CompanyEntity.is_deleted == False,
            CompanyEntity.company_id == current_user.company_id,
        )
    )).scalars().all()
    entity_map = {str(e.id): e.entity_name for e in entities}

    # Add virtual entities for personal accounts
    virtual_entities = {"jiangpeng": "姜鹏", "niezhiping": "聂志平"}
    for vid, vname in virtual_entities.items():
        entity_map[vid] = vname

    # Get all transactions involving cross-entity counterparties
    query = select(BankTransaction).where(
        BankTransaction.is_deleted == False,
        BankTransaction.company_id == current_user.company_id,
    )
    if start_date:
        query = query.where(BankTransaction.tx_date >= start_date)
    if end_date:
        query = query.where(BankTransaction.tx_date <= end_date)
    query = query.order_by(BankTransaction.tx_date.desc())
    all_txs = (await db.execute(query)).scalars().all()

    # Find cross-entity transactions
    cross_entity_pairs = {}
    entity_totals = {eid: {"inflow": 0.0, "outflow": 0.0, "net": 0.0, "tax_loss": 0.0, "proxy_count": 0} for eid in entity_map}
    pair_flows = []

    for tx in all_txs:
        tx_entity_id = str(tx.entity_id) if tx.entity_id else None
        counterparty = (tx.counterparty or "").strip()
        if not counterparty or not tx_entity_id:
            continue

        # Check if counterparty matches another entity name (including virtual)
        matched_entity = None
        for eid, ename in entity_map.items():
            if eid == tx_entity_id:
                continue
            if ename in counterparty or counterparty in ename:
                matched_entity = eid
                break

        if not matched_entity:
            continue

        amount = float(tx.tx_amount or 0)
        pair_key = tuple(sorted([tx_entity_id, matched_entity]))
        if pair_key not in cross_entity_pairs:
            cross_entity_pairs[pair_key] = {"from_a_to_b": 0.0, "from_b_to_a": 0.0}

        if amount < 0:
            if tx_entity_id == pair_key[0]:
                cross_entity_pairs[pair_key]["from_a_to_b"] += abs(amount)
            else:
                cross_entity_pairs[pair_key]["from_b_to_a"] += abs(amount)
            entity_totals[tx_entity_id]["outflow"] += abs(amount)
            entity_totals[matched_entity]["inflow"] += abs(amount)
        else:
            if tx_entity_id == pair_key[0]:
                cross_entity_pairs[pair_key]["from_b_to_a"] += abs(amount)
            else:
                cross_entity_pairs[pair_key]["from_a_to_b"] += abs(amount)
            entity_totals[tx_entity_id]["inflow"] += abs(amount)
            entity_totals[matched_entity]["outflow"] += abs(amount)

        pair_flows.append({
            "id": str(tx.id),
            "tx_date": str(tx.tx_date),
            "amount": amount,
            "counterparty": counterparty,
            "summary": tx.summary,
            "account_name": tx.account_name,
            "entity_id": tx_entity_id,
            "entity_name": entity_map.get(tx_entity_id, ""),
            "counterparty_entity_id": matched_entity,
            "counterparty_entity_name": entity_map.get(matched_entity, ""),
            "expense_type": tx.expense_type,
            "direction": "outflow" if amount < 0 else "inflow",
            "is_proxy_payment": tx.is_proxy_payment,
            "tax_bearer": tx.tax_bearer,
            "tax_amount": float(tx.tax_amount) if tx.tax_amount else None,
            "tax_rate": float(tx.tax_rate) if tx.tax_rate else None,
            "invoice_amount": float(tx.invoice_amount) if tx.invoice_amount else None,
            "tax_loss": float(tx.tax_loss) if tx.tax_loss else None,
        })

        if tx.tax_loss:
            entity_totals[tx_entity_id]["tax_loss"] += float(tx.tax_loss)
        if tx.is_proxy_payment:
            entity_totals[tx_entity_id]["proxy_count"] += 1

    # Build summary
    pair_summaries = []
    for (eid_a, eid_b), flows in cross_entity_pairs.items():
        net = flows["from_a_to_b"] - flows["from_b_to_a"]
        pair_summaries.append({
            "entity_a": {"id": eid_a, "name": entity_map.get(eid_a, "")},
            "entity_b": {"id": eid_b, "name": entity_map.get(eid_b, "")},
            "a_to_b": flows["from_a_to_b"],
            "b_to_a": flows["from_b_to_a"],
            "net_a_to_b": round(net, 2),
            "flow_count": len([f for f in pair_flows if
                (f["entity_id"] == eid_a and f["counterparty_entity_id"] == eid_b) or
                (f["entity_id"] == eid_b and f["counterparty_entity_id"] == eid_a)]),
        })

    for eid in entity_totals:
        entity_totals[eid]["net"] = round(entity_totals[eid]["inflow"] - entity_totals[eid]["outflow"], 2)

    return {
        "entities": [{"id": eid, "name": ename} for eid, ename in entity_map.items()],
        "entity_totals": entity_totals,
        "pair_summaries": pair_summaries,
        "pair_flows": pair_flows[:200],
        "total_flow_count": len(pair_flows),
    }


# ============================================================
# Annotation Rule Endpoints
# ============================================================

class FieldConditionModel(BaseModel):
    operator: str = "contains"
    value: str

class RuleConditionsModel(BaseModel):
    counterparty: FieldConditionModel | None = None
    summary: FieldConditionModel | None = None
    purpose: FieldConditionModel | None = None
    counterparty_account: FieldConditionModel | None = None
    account_name: FieldConditionModel | None = None
    tx_amount_min: float | None = None
    tx_amount_max: float | None = None
    tx_type: str | None = None
    entity_id: str | None = None

class RuleActionsModel(BaseModel):
    expense_type: str | None = None
    expense_subtype: str | None = None
    project_id: str | None = None
    contract_id: str | None = None
    remark: str | None = None
    tags: list | None = None

class AnnotationRuleCreate(BaseModel):
    rule_name: str = Field(..., min_length=1)
    conditions: RuleConditionsModel
    actions: RuleActionsModel
    priority: int = 0
    is_active: bool = True

class AnnotationRuleUpdate(BaseModel):
    rule_name: str | None = None
    conditions: RuleConditionsModel | None = None
    actions: RuleActionsModel | None = None
    priority: int | None = None
    is_active: bool | None = None

class CardAnnotationModel(BaseModel):
    expense_type: str | None = None
    expense_subtype: str | None = None
    project_id: str | None = None
    quick_project_name: str | None = None
    contract_id: str | None = None
    remark: str | None = None
    tags: list | None = None
    create_rule_from_this: bool = False


@router.get("/annotation-rules")
async def list_annotation_rules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rules = await load_annotation_rules(db, str(current_user.company_id), active_only=False)
    return {"success": True, "data": rules}


@router.post("/annotation-rules")
async def create_annotation_rule(
    body: AnnotationRuleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rule_value = {
        "version": 2,
        "rule_name": body.rule_name,
        "conditions": body.conditions.model_dump(exclude_none=True),
        "actions": body.actions.model_dump(exclude_none=True),
        "is_active": body.is_active,
        "priority": body.priority,
        "match_count": 0,
    }
    rule = BusinessKnowledge(
        company_id=current_user.company_id,
        category="annotation_rule",
        key=body.rule_name,
        value=rule_value,
        created_by=str(current_user.id),
    )
    db.add(rule)
    await db.flush()

    # Preview match count
    conditions_raw = body.conditions.model_dump(exclude_none=True)
    unannotated = (await db.execute(
        select(BankTransaction).where(
            BankTransaction.company_id == current_user.company_id,
            BankTransaction.is_deleted == False,
            BankTransaction.expense_type == None,
        ).limit(5000)
    )).scalars().all()
    preview_count = sum(1 for tx in unannotated if transaction_matches_rule(tx, rule_value))

    return {
        "success": True,
        "data": {"rule_id": str(rule.id), **rule_value, "preview_count": preview_count},
    }


@router.put("/annotation-rules/{rule_id}")
async def update_annotation_rule(
    rule_id: str,
    body: AnnotationRuleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rule = (await db.execute(
        select(BusinessKnowledge).where(
            BusinessKnowledge.id == rule_id,
            BusinessKnowledge.company_id == current_user.company_id,
            BusinessKnowledge.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "规则不存在")

    current = rule.value if isinstance(rule.value, dict) else json.loads(rule.value)
    if body.rule_name is not None:
        current["rule_name"] = body.rule_name
        rule.key = body.rule_name
    if body.conditions is not None:
        current["conditions"] = body.conditions.model_dump(exclude_none=True)
    if body.actions is not None:
        current["actions"] = body.actions.model_dump(exclude_none=True)
    if body.priority is not None:
        current["priority"] = body.priority
    if body.is_active is not None:
        current["is_active"] = body.is_active
    rule.value = current
    await db.flush()
    return {"success": True, "data": current}


@router.delete("/annotation-rules/{rule_id}")
async def delete_annotation_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rule = (await db.execute(
        select(BusinessKnowledge).where(
            BusinessKnowledge.id == rule_id,
            BusinessKnowledge.company_id == current_user.company_id,
        )
    )).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "规则不存在")
    rule.is_deleted = True
    await db.flush()
    return {"success": True, "message": "规则已删除"}


@router.post("/annotation-rules/{rule_id}/preview")
async def preview_annotation_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rule = (await db.execute(
        select(BusinessKnowledge).where(
            BusinessKnowledge.id == rule_id,
            BusinessKnowledge.company_id == current_user.company_id,
            BusinessKnowledge.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "规则不存在")

    rule_value = rule.value if isinstance(rule.value, dict) else json.loads(rule.value)
    unannotated = (await db.execute(
        select(BankTransaction).where(
            BankTransaction.company_id == current_user.company_id,
            BankTransaction.is_deleted == False,
            BankTransaction.expense_type == None,
        ).limit(5000)
    )).scalars().all()

    matched = [tx for tx in unannotated if transaction_matches_rule(tx, rule_value)]
    return {
        "success": True,
        "match_count": len(matched),
        "matched_transactions": [
            {
                "id": str(tx.id), "tx_date": str(tx.tx_date), "tx_amount": float(tx.tx_amount or 0),
                "counterparty": tx.counterparty, "summary": tx.summary,
            }
            for tx in matched[:50]
        ],
    }


@router.post("/annotation-rules/{rule_id}/apply")
async def apply_single_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rule = (await db.execute(
        select(BusinessKnowledge).where(
            BusinessKnowledge.id == rule_id,
            BusinessKnowledge.company_id == current_user.company_id,
            BusinessKnowledge.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "规则不存在")

    rule_value = rule.value if isinstance(rule.value, dict) else json.loads(rule.value)
    if not rule_value.get("is_active", True):
        raise HTTPException(400, "规则未激活")

    unannotated = (await db.execute(
        select(BankTransaction).where(
            BankTransaction.company_id == current_user.company_id,
            BankTransaction.is_deleted == False,
            BankTransaction.expense_type == None,
        ).limit(5000)
    )).scalars().all()

    result = await apply_rules_to_transactions(db, unannotated, [rule_value], dry_run=False)
    await db.commit()
    return {"success": True, **result}


@router.post("/annotation-rules/apply-all")
async def apply_all_rules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rules = await load_annotation_rules(db, str(current_user.company_id), active_only=True)
    unannotated = (await db.execute(
        select(BankTransaction).where(
            BankTransaction.company_id == current_user.company_id,
            BankTransaction.is_deleted == False,
            BankTransaction.expense_type == None,
        ).limit(5000)
    )).scalars().all()

    result = await apply_rules_to_transactions(db, unannotated, rules, dry_run=False)
    await db.commit()
    return {"success": True, **result}


@router.get("/transactions/unannotated")
async def list_unannotated_transactions(
    entity_id: str | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(BankTransaction).where(
        BankTransaction.company_id == current_user.company_id,
        BankTransaction.is_deleted == False,
        BankTransaction.expense_type == None,
    ).order_by(BankTransaction.tx_date.desc())

    if entity_id:
        query = query.where(BankTransaction.entity_id == entity_id)

    total_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(total_q)).scalar() or 0

    items = (await db.execute(query.offset(offset).limit(limit))).scalars().all()
    return {
        "items": [
            {
                "id": str(tx.id), "tx_date": str(tx.tx_date),
                "tx_amount": float(tx.tx_amount or 0), "balance": float(tx.balance or 0),
                "counterparty": tx.counterparty, "summary": tx.summary,
                "purpose": tx.purpose, "tx_type": tx.tx_type,
                "account_name": tx.account_name, "account_no": tx.account_no,
                "bank_name": tx.bank_name, "counterparty_account": tx.counterparty_account,
                "entity_id": str(tx.entity_id) if tx.entity_id else None,
                "fund_level": tx.fund_level, "source": tx.source,
            }
            for tx in items
        ],
        "total": total,
    }


@router.post("/transactions/{tx_id}/annotate-card")
async def annotate_card(
    tx_id: str,
    body: CardAnnotationModel,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tx = (await db.execute(
        select(BankTransaction).where(
            BankTransaction.id == tx_id,
            BankTransaction.company_id == current_user.company_id,
            BankTransaction.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not tx:
        raise HTTPException(404, "交易不存在")

    # Quick project creation
    project_id = body.project_id
    if not project_id and body.quick_project_name:
        project = Project(
            company_id=current_user.company_id,
            created_by=str(current_user.id),
            name=body.quick_project_name,
            project_type="construction",
            status="planning",
        )
        db.add(project)
        await db.flush()
        project_id = str(project.id)

    # Apply annotation
    snapshot = await capture_tx_snapshot(tx)
    if body.expense_type:
        tx.expense_type = body.expense_type
    if body.expense_subtype:
        tx.expense_subtype = body.expense_subtype
    if project_id:
        tx.project_id = project_id
    if body.contract_id:
        tx.contract_id = body.contract_id
    if body.remark:
        tx.remark = body.remark
    if body.tags:
        tx.tags = body.tags

    # Create rule from this annotation if requested
    rule_id = None
    if body.create_rule_from_this:
        rule_value = generate_rule_from_transaction(tx, body.model_dump())
        rule = BusinessKnowledge(
            company_id=current_user.company_id,
            category="annotation_rule",
            key=rule_value["rule_name"],
            value=rule_value,
            created_by=str(current_user.id),
        )
        db.add(rule)
        await db.flush()
        rule_id = str(rule.id)

    await cascade_on_annotate(tx, snapshot, db)
    await db.commit()

    return {
        "success": True,
        "message": "标注成功",
        "project_id": project_id,
        "rule_id": rule_id,
    }


@router.get("/expense-types")
async def get_expense_types():
    types = {
        "车队收款": ["充电服务费", "充电电费", "月租"],
        "电费收入": ["电费收入", "充电费"],
        "电费支出": ["电费支出", "购电"],
        "差旅费": ["差旅交通"],
        "备用金": ["备用金支出"],
        "工资薪酬": ["工资", "社保", "公积金"],
        "材料采购": ["变压器供货", "电缆供货", "充电桩供货", "电气材料供货"],
        "工程施工": ["土建施工", "高压安装", "低压安装", "附属设施建设"],
        "设备销售": ["设备销售"],
        "租赁费": ["租地"],
        "运营费": ["运营", "合作方分成"],
        "税费": ["税费"],
        "其他": ["其他"],
    }
    return {"success": True, "data": types}

