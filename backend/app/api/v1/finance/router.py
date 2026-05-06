import calendar
import uuid
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import generate_no, get_current_user, get_db
from app.models.finance import (
    AccountSubject, AccountingPeriod, ArApRecord, Budget, CostCenter,
    FinanceVoucher, Invoice, SettlementRecord, TaxDeclaration, VoucherLine,
)
from app.models.organization import User
from app.services.number_generator import generate_number
from app.core.security_utils import safe_update
from app.core.cache import cached, invalidate_cache

router = APIRouter(prefix="/finance", tags=["财务管理"])


@router.get("/vouchers/next-number")
async def next_voucher_number(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    number = await generate_number(db, FinanceVoucher, "voucher_no", "voucher", current_user.company_id)
    return {"number": number}


@router.get("/invoices/next-number")
async def next_invoice_number(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    number = await generate_number(db, Invoice, "invoice_no", "invoice_in", current_user.company_id)
    return {"number": number}


@router.get("/ar-ap/next-number")
async def next_ar_ap_number(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    number = await generate_number(db, ArApRecord, None, "arap", current_user.company_id)
    return {"number": number}


class AccountSubjectCreate(BaseModel):
    code: str = Field(..., max_length=20)
    name: str = Field(..., max_length=100)
    level: int
    parent_id: str | None = None
    category: str
    direction: str
    is_leaf: bool = True
    is_enabled: bool = True
    cash_flow_type: str | None = None
    auxiliary_types: dict | None = None


class AccountSubjectUpdate(BaseModel):
    name: str | None = None
    level: int | None = None
    parent_id: str | None = None
    category: str | None = None
    direction: str | None = None
    is_leaf: bool | None = None
    is_enabled: bool | None = None
    cash_flow_type: str | None = None
    auxiliary_types: dict | None = None


@router.get("/accounts")
@cached(ttl=300, prefix="finance")
async def list_accounts(
    category: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(AccountSubject).where(
        AccountSubject.is_deleted == False,
        AccountSubject.company_id == current_user.company_id,
    )
    if category:
        query = query.where(AccountSubject.category == category)
    query = query.order_by(AccountSubject.code)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/accounts")
async def create_account(
    body: AccountSubjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = AccountSubject(
        **body.model_dump(),
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.put("/accounts/{account_id}")
async def update_account(
    account_id: str,
    body: AccountSubjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AccountSubject).where(
            AccountSubject.id == account_id,
            AccountSubject.is_deleted == False,
            AccountSubject.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="科目不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(obj, data)
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/accounts/{account_id}")
async def delete_account(
    account_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(AccountSubject)
        .where(AccountSubject.id == account_id, AccountSubject.is_deleted == False)
        .values(is_deleted=True)
    )
    return {"message": "删除成功"}


class AccountingPeriodCreate(BaseModel):
    period: str = Field(..., pattern=r"^\d{4}-\d{2}$")


@router.get("/periods")
@cached(ttl=300, prefix="finance")
async def list_periods(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AccountingPeriod)
        .where(AccountingPeriod.is_deleted == False, AccountingPeriod.company_id == current_user.company_id)
        .order_by(AccountingPeriod.period.desc())
    )
    return result.scalars().all()


@router.post("/periods")
async def create_period(
    body: AccountingPeriodCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    year, month = map(int, body.period.split("-"))
    start_date = date(year, month, 1)
    end_date = date(year, month, calendar.monthrange(year, month)[1])
    obj = AccountingPeriod(
        period=body.period,
        start_date=start_date,
        end_date=end_date,
        status="open",
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.put("/periods/{period_id}/close")
async def close_period(
    period_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AccountingPeriod).where(
            AccountingPeriod.id == period_id,
            AccountingPeriod.is_deleted == False,
            AccountingPeriod.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="会计期间不存在")
    if obj.status == "closed":
        raise HTTPException(status_code=400, detail="该期间已结账")
    obj.status = "closed"
    obj.closed_by = current_user.id
    obj.closed_at = datetime.now().isoformat()
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


class VoucherLineCreate(BaseModel):
    account_id: str | None = None
    account_code: str
    account_name: str
    debit: float = 0
    credit: float = 0
    summary: str | None = None
    cost_center_id: str | None = None
    counterparty_id: str | None = None
    counterparty_name: str | None = None


class VoucherCreate(BaseModel):
    voucher_date: date
    period: str
    voucher_type: str = "general"
    business_type: str | None = None
    business_id: str | None = None
    source_module: str | None = None
    source_no: str | None = None
    project_id: str | None = None
    remark: str | None = None
    lines: list[VoucherLineCreate] = []


class VoucherUpdate(BaseModel):
    voucher_date: date | None = None
    period: str | None = None
    voucher_type: str | None = None
    remark: str | None = None
    lines: list[VoucherLineCreate] | None = None


@router.get("/vouchers")
@cached(ttl=300, prefix="finance")
async def list_vouchers(
    period: str | None = None,
    status: str | None = None,
    business_type: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(FinanceVoucher).where(
        FinanceVoucher.is_deleted == False,
        FinanceVoucher.company_id == current_user.company_id,
    )
    if period:
        query = query.where(FinanceVoucher.period == period)
    if status:
        query = query.where(FinanceVoucher.status == status)
    if business_type:
        query = query.where(FinanceVoucher.business_type == business_type)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(FinanceVoucher.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total}


@router.post("/vouchers")
async def create_voucher(
    body: VoucherCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    total_debit = sum(line.debit for line in body.lines)
    total_credit = sum(line.credit for line in body.lines)
    if abs(total_debit - total_credit) > 0.01:
        raise HTTPException(status_code=400, detail=f"借贷不平衡：借方{total_debit}，贷方{total_credit}")

    voucher = FinanceVoucher(
        voucher_no=generate_no("V"),
        voucher_date=body.voucher_date,
        period=body.period,
        voucher_type=body.voucher_type,
        total_debit=total_debit,
        total_credit=total_credit,
        line_count=len(body.lines),
        business_type=body.business_type,
        business_id=body.business_id,
        source_module=body.source_module,
        source_no=body.source_no,
        project_id=body.project_id,
        status="draft",
        prepared_by=current_user.id,
        remark=body.remark,
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(voucher)
    await db.flush()

    for idx, line in enumerate(body.lines, 1):
        acct_id = line.account_id or str(uuid.UUID(int=0))
        vl = VoucherLine(
            voucher_id=voucher.id,
            line_no=idx,
            account_id=acct_id,
            account_code=line.account_code,
            account_name=line.account_name,
            debit=line.debit,
            credit=line.credit,
            summary=line.summary,
            cost_center_id=line.cost_center_id,
            counterparty_id=line.counterparty_id,
            counterparty_name=line.counterparty_name,
            company_id=current_user.company_id,
            created_by=current_user.id,
        )
        db.add(vl)

    await db.flush()
    await db.refresh(voucher)
    return voucher


@router.get("/vouchers/{voucher_id}")
async def get_voucher(
    voucher_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FinanceVoucher).where(
            FinanceVoucher.id == voucher_id,
            FinanceVoucher.is_deleted == False,
            FinanceVoucher.company_id == current_user.company_id,
        )
    )
    voucher = result.scalar_one_or_none()
    if not voucher:
        raise HTTPException(status_code=404, detail="凭证不存在")

    lines_result = await db.execute(
        select(VoucherLine).where(
            VoucherLine.voucher_id == voucher_id,
            VoucherLine.is_deleted == False,
        ).order_by(VoucherLine.line_no)
    )
    lines = lines_result.scalars().all()
    return {"voucher": voucher, "lines": lines}


@router.put("/vouchers/{voucher_id}")
async def update_voucher(
    voucher_id: str,
    body: VoucherUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FinanceVoucher).where(
            FinanceVoucher.id == voucher_id,
            FinanceVoucher.is_deleted == False,
            FinanceVoucher.company_id == current_user.company_id,
        )
    )
    voucher = result.scalar_one_or_none()
    if not voucher:
        raise HTTPException(status_code=404, detail="凭证不存在")
    if voucher.status != "draft":
        raise HTTPException(status_code=400, detail="只有草稿状态的凭证可以修改")

    for k, v in body.model_dump(exclude_unset=True).items():
        if k == "lines":
            continue
        setattr(voucher, k, v)

    if body.lines is not None:
        await db.execute(
            update(VoucherLine)
            .where(VoucherLine.voucher_id == voucher_id, VoucherLine.is_deleted == False)
            .values(is_deleted=True)
        )
        total_debit = sum(line.debit for line in body.lines)
        total_credit = sum(line.credit for line in body.lines)
        if abs(total_debit - total_credit) > 0.01:
            raise HTTPException(status_code=400, detail=f"借贷不平衡：借方{total_debit}，贷方{total_credit}")

        for idx, line in enumerate(body.lines, 1):
            acct_id = line.account_id or str(uuid.UUID(int=0))
            vl = VoucherLine(
                voucher_id=voucher_id,
                line_no=idx,
                account_id=acct_id,
                account_code=line.account_code,
                account_name=line.account_name,
                debit=line.debit,
                credit=line.credit,
                summary=line.summary,
                cost_center_id=line.cost_center_id,
                counterparty_id=line.counterparty_id,
                counterparty_name=line.counterparty_name,
                company_id=current_user.company_id,
                created_by=current_user.id,
            )
            db.add(vl)

        voucher.total_debit = total_debit
        voucher.total_credit = total_credit
        voucher.line_count = len(body.lines)

    voucher.updated_by = current_user.id
    await db.flush()
    await db.refresh(voucher)
    return voucher


@router.put("/vouchers/{voucher_id}/review")
async def review_voucher(
    voucher_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FinanceVoucher).where(
            FinanceVoucher.id == voucher_id,
            FinanceVoucher.is_deleted == False,
            FinanceVoucher.company_id == current_user.company_id,
        )
    )
    voucher = result.scalar_one_or_none()
    if not voucher:
        raise HTTPException(status_code=404, detail="凭证不存在")
    if voucher.status != "draft":
        raise HTTPException(status_code=400, detail="只有草稿状态的凭证可以审核")
    voucher.status = "reviewed"
    voucher.reviewed_by = current_user.id
    voucher.updated_by = current_user.id
    await db.flush()
    await db.refresh(voucher)
    return voucher


@router.put("/vouchers/{voucher_id}/post")
async def post_voucher(
    voucher_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FinanceVoucher).where(
            FinanceVoucher.id == voucher_id,
            FinanceVoucher.is_deleted == False,
            FinanceVoucher.company_id == current_user.company_id,
        )
    )
    voucher = result.scalar_one_or_none()
    if not voucher:
        raise HTTPException(status_code=404, detail="凭证不存在")
    if voucher.status != "reviewed":
        raise HTTPException(status_code=400, detail="只有已审核的凭证可以过账")
    voucher.status = "posted"
    voucher.posted_by = current_user.id
    voucher.updated_by = current_user.id
    await db.flush()
    await db.refresh(voucher)
    return voucher


@router.delete("/vouchers/{voucher_id}")
async def delete_voucher(
    voucher_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FinanceVoucher).where(
            FinanceVoucher.id == voucher_id,
            FinanceVoucher.is_deleted == False,
            FinanceVoucher.company_id == current_user.company_id,
        )
    )
    voucher = result.scalar_one_or_none()
    if not voucher:
        raise HTTPException(status_code=404, detail="凭证不存在")
    if voucher.status != "draft":
        raise HTTPException(status_code=400, detail="只有草稿状态的凭证可以删除")
    await db.execute(
        update(FinanceVoucher)
        .where(FinanceVoucher.id == voucher_id, FinanceVoucher.is_deleted == False)
        .values(is_deleted=True)
    )
    await db.execute(
        update(VoucherLine)
        .where(VoucherLine.voucher_id == voucher_id, VoucherLine.is_deleted == False)
        .values(is_deleted=True)
    )
    return {"message": "删除成功"}


class ArApCreate(BaseModel):
    type: str = Field(..., pattern="^(ar|ap)$")
    business_type: str | None = None
    business_id: str | None = None
    source_no: str | None = None
    counterparty: str | None = None
    counterparty_id: str | None = None
    total_amount: float
    due_date: date | None = None
    project_id: str | None = None
    contract_id: str | None = None
    remark: str | None = None


class ArApUpdate(BaseModel):
    counterparty: str | None = None
    counterparty_id: str | None = None
    total_amount: float | None = None
    due_date: date | None = None
    remark: str | None = None


class SettleBody(BaseModel):
    amount: float = Field(..., gt=0)
    payment_method: str | None = None
    bank_account: str | None = None
    settlement_date: date | None = None
    remark: str | None = None


@router.get("/ar-ap")
@cached(ttl=300, prefix="finance")
async def list_ar_ap(
    type: str | None = None,
    counterparty: str | None = None,
    status: str | None = None,
    contract_id: str | None = None,
    project_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ArApRecord).where(
        ArApRecord.is_deleted == False,
        ArApRecord.company_id == current_user.company_id,
    )
    if type:
        query = query.where(ArApRecord.type == type)
    if counterparty:
        query = query.where(ArApRecord.counterparty.ilike(f"%{counterparty}%"))
    if status:
        query = query.where(ArApRecord.status == status)
    if contract_id:
        query = query.where(ArApRecord.contract_id == contract_id)
    if project_id:
        query = query.where(ArApRecord.project_id == project_id)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(ArApRecord.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total}


@router.post("/ar-ap")
async def create_ar_ap(
    body: ArApCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    dump = body.model_dump()
    dup_q = select(ArApRecord).where(
        ArApRecord.is_deleted == False,
        ArApRecord.company_id == current_user.company_id,
        ArApRecord.type == dump.get("type"),
        ArApRecord.total_amount == dump.get("total_amount"),
    )
    cp = dump.get("counterparty")
    if cp:
        dup_q = dup_q.where(ArApRecord.counterparty == cp)
    dd = dump.get("due_date")
    if dd:
        dup_q = dup_q.where(ArApRecord.due_date == dd)
    else:
        dup_q = dup_q.where(ArApRecord.due_date.is_(None))
    cid = dump.get("contract_id")
    if cid:
        dup_q = dup_q.where(ArApRecord.contract_id == cid)
    else:
        dup_q = dup_q.where(ArApRecord.contract_id.is_(None))
    existing = (await db.execute(dup_q.limit(1))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="该应收应付记录已存在")

    if not dump.get("project_id"):
        try:
            from app.services.auto_link import apply_auto_link
            link = await apply_auto_link(db, current_user.company_id, "ar_ap", "", dump, str(current_user.id))
            if link.get("project_id") and link["confidence"] >= 0.8:
                dump["project_id"] = link["project_id"]
        except Exception:
            pass
    obj = ArApRecord(
        **dump,
        remaining_amount=body.total_amount,
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    if not dump.get("project_id"):
        try:
            from app.services.auto_link import _create_linkage_notification
            await _create_linkage_notification(db, current_user.company_id, str(current_user.id), "ar_ap", str(obj.id), {"confidence": 0, "method": "none"})
        except Exception:
            pass
    return obj


@router.get("/ar-ap/{record_id}")
async def get_ar_ap(
    record_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ArApRecord).where(
            ArApRecord.id == record_id,
            ArApRecord.is_deleted == False,
            ArApRecord.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="记录不存在")
    return obj


@router.put("/ar-ap/{record_id}")
async def update_ar_ap(
    record_id: str,
    body: ArApUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ArApRecord).where(
            ArApRecord.id == record_id,
            ArApRecord.is_deleted == False,
            ArApRecord.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="记录不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(obj, data)
    if body.total_amount is not None:
        obj.remaining_amount = float(body.total_amount or 0) - float(obj.settled_amount or 0)
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/ar-ap/{record_id}")
async def delete_ar_ap(
    record_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ArApRecord).where(
            ArApRecord.id == record_id,
            ArApRecord.is_deleted == False,
            ArApRecord.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="记录不存在")
    obj.is_deleted = True
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.post("/ar-ap/{record_id}/settle")
async def settle_ar_ap(
    record_id: str,
    body: SettleBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ArApRecord).where(
            ArApRecord.id == record_id,
            ArApRecord.is_deleted == False,
            ArApRecord.company_id == current_user.company_id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    if body.amount > float(record.remaining_amount or 0):
        raise HTTPException(status_code=400, detail="收款金额超过剩余金额")

    direction = "receive" if record.type == "ar" else "pay"
    settlement = SettlementRecord(
        settlement_no=generate_no("ST"),
        direction=direction,
        counterparty=record.counterparty,
        counterparty_id=record.counterparty_id,
        amount=body.amount,
        payment_method=body.payment_method,
        bank_account=body.bank_account,
        settlement_date=body.settlement_date or date.today(),
        arap_ids=[str(record.id)],
        contract_id=record.contract_id,
        project_id=record.project_id,
        remark=body.remark,
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(settlement)
    await db.flush()

    record.settled_amount = float(record.settled_amount or 0) + body.amount
    record.remaining_amount = float(record.remaining_amount or 0) - body.amount
    if float(record.remaining_amount or 0) <= 0.01:
        record.status = "settled"
        record.remaining_amount = 0
    else:
        record.status = "partial"
    record.updated_by = current_user.id

    bank_result = await db.execute(
        select(AccountSubject).where(
            AccountSubject.company_id == current_user.company_id,
            AccountSubject.is_deleted == False,
            AccountSubject.name == "银行存款",
        )
    )
    bank = bank_result.scalar_one_or_none()

    target_name = "应收账款" if record.type == "ar" else "应付账款"
    target_result = await db.execute(
        select(AccountSubject).where(
            AccountSubject.company_id == current_user.company_id,
            AccountSubject.is_deleted == False,
            AccountSubject.name == target_name,
        )
    )
    target = target_result.scalar_one_or_none()

    if not bank:
        bank = AccountSubject(
            code="1002", name="银行存款", level=1, category="asset",
            direction="debit", is_leaf=True, is_enabled=True,
            company_id=current_user.company_id, created_by=current_user.id,
        )
        db.add(bank)
        await db.flush()
    if not target:
        target = AccountSubject(
            code="2202" if record.type == "ap" else "1122",
            name=target_name, level=1,
            category="liability" if record.type == "ap" else "asset",
            direction="credit" if record.type == "ap" else "debit",
            is_leaf=True, is_enabled=True,
            company_id=current_user.company_id, created_by=current_user.id,
        )
        db.add(target)
        await db.flush()

    voucher = FinanceVoucher(
        voucher_no=generate_no("V"),
        voucher_date=date.today(),
        period=date.today().strftime("%Y-%m"),
        voucher_type="payment" if record.type == "ap" else "receipt",
        total_debit=body.amount,
        total_credit=body.amount,
        line_count=2,
        business_type="settlement",
        business_id=settlement.id,
        source_module="finance",
        source_no=settlement.settlement_no,
        status="draft",
        prepared_by=current_user.id,
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(voucher)
    await db.flush()

    if record.type == "ar":
        lines_data = [
            (bank, "银行存款", "1002", body.amount, 0),
            (target, "应收账款", "1122", 0, body.amount),
        ]
    else:
        lines_data = [
            (target, "应付账款", "2202", body.amount, 0),
            (bank, "银行存款", "1002", 0, body.amount),
        ]

    for idx, (acct, default_name, default_code, debit, credit) in enumerate(lines_data, 1):
        vl = VoucherLine(
            voucher_id=voucher.id,
            line_no=idx,
            account_id=acct.id if acct else uuid.UUID(int=0),
            account_code=acct.code if acct else default_code,
            account_name=acct.name if acct else default_name,
            debit=debit,
            credit=credit,
            counterparty_id=record.counterparty_id,
            counterparty_name=record.counterparty,
            summary=f"{'收款' if record.type == 'ar' else '付款'} - {record.counterparty or ''}",
            company_id=current_user.company_id,
            created_by=current_user.id,
        )
        db.add(vl)

    settlement.voucher_id = voucher.id
    record.voucher_id = voucher.id

    if record.contract_id and direction == "pay":
        from app.models.erp.models import Contract
        contract_result = await db.execute(
            select(Contract).where(
                Contract.id == record.contract_id,
                Contract.is_deleted == False,
                Contract.company_id == current_user.company_id,
            )
        )
        contract = contract_result.scalar_one_or_none()
        if contract:
            new_paid = float(contract.paid_amount or 0) + body.amount
            if contract.total_amount and new_paid > float(contract.total_amount) + 0.01:
                raise HTTPException(status_code=400, detail=f"付款金额超过合同总额（合同额{float(contract.total_amount)}，已付{float(contract.paid_amount or 0)}）")
            contract.paid_amount = new_paid
            contract.updated_by = current_user.id

    await db.flush()
    await db.refresh(settlement)
    return {"settlement": settlement, "voucher": voucher}


@router.get("/settlements")
@cached(ttl=300, prefix="finance")
async def list_settlements(
    direction: str | None = None,
    contract_id: str | None = None,
    project_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(SettlementRecord).where(
        SettlementRecord.is_deleted == False,
        SettlementRecord.company_id == current_user.company_id,
    )
    if direction:
        query = query.where(SettlementRecord.direction == direction)
    if contract_id:
        query = query.where(SettlementRecord.contract_id == contract_id)
    if project_id:
        query = query.where(SettlementRecord.project_id == project_id)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(SettlementRecord.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    settlements = result.scalars().all()

    # Load linked bank transactions
    all_tx_ids = set()
    for s in settlements:
        if s.bank_tx_ids:
            all_tx_ids.update(s.bank_tx_ids)

    tx_map = {}
    if all_tx_ids:
        tx_result = await db.execute(
            select(BankTransaction).where(
                BankTransaction.id.in_(list(all_tx_ids)),
                BankTransaction.is_deleted == False,
            )
        )
        for tx in tx_result.scalars().all():
            tx_map[str(tx.id)] = {
                "id": str(tx.id),
                "tx_date": str(tx.tx_date),
                "tx_amount": float(tx.tx_amount or 0),
                "counterparty": tx.counterparty,
                "summary": tx.summary,
                "bank_name": tx.bank_name,
            }

    items = []
    for s in settlements:
        item = {k: getattr(s, k) for k in s.__mapper__.columns.keys()}
        item["id"] = str(s.id)
        item["contract_id"] = str(s.contract_id) if s.contract_id else None
        item["project_id"] = str(s.project_id) if s.project_id else None
        item["voucher_id"] = str(s.voucher_id) if s.voucher_id else None
        item["counterparty_id"] = str(s.counterparty_id) if s.counterparty_id else None
        item["bank_transactions"] = [tx_map[tx_id] for tx_id in (s.bank_tx_ids or []) if tx_id in tx_map]
        items.append(item)

    return {"items": items, "total": total}


@router.get("/settlements/{settlement_id}")
async def get_settlement(
    settlement_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SettlementRecord).where(
            SettlementRecord.id == settlement_id,
            SettlementRecord.is_deleted == False,
            SettlementRecord.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="收付款记录不存在")
    return obj


@router.post("/settlements/{settlement_id}/link-bank-tx")
async def link_settlement_bank_tx(
    settlement_id: str,
    tx_id: str = Query(..., description="银行流水ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SettlementRecord).where(
            SettlementRecord.id == settlement_id,
            SettlementRecord.is_deleted == False,
            SettlementRecord.company_id == current_user.company_id,
        )
    )
    settlement = result.scalar_one_or_none()
    if not settlement:
        raise HTTPException(status_code=404, detail="收付款记录不存在")

    tx_result = await db.execute(
        select(BankTransaction).where(
            BankTransaction.id == tx_id,
            BankTransaction.is_deleted == False,
            BankTransaction.company_id == current_user.company_id,
        )
    )
    tx = tx_result.scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="银行流水不存在")

    current_ids = settlement.bank_tx_ids or []
    if tx_id not in current_ids:
        current_ids.append(tx_id)
        settlement.bank_tx_ids = current_ids

    tx.matched = True
    tx.updated_by = current_user.id

    await db.flush()
    return {"message": "关联成功"}


@router.delete("/settlements/{settlement_id}/unlink-bank-tx/{tx_id}")
async def unlink_settlement_bank_tx(
    settlement_id: str,
    tx_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SettlementRecord).where(
            SettlementRecord.id == settlement_id,
            SettlementRecord.is_deleted == False,
            SettlementRecord.company_id == current_user.company_id,
        )
    )
    settlement = result.scalar_one_or_none()
    if not settlement:
        raise HTTPException(status_code=404, detail="收付款记录不存在")

    current_ids = settlement.bank_tx_ids or []
    if tx_id in current_ids:
        current_ids.remove(tx_id)
        settlement.bank_tx_ids = current_ids if current_ids else None

    tx_result = await db.execute(
        select(BankTransaction).where(
            BankTransaction.id == tx_id,
            BankTransaction.is_deleted == False,
            BankTransaction.company_id == current_user.company_id,
        )
    )
    tx = tx_result.scalar_one_or_none()
    if tx:
        tx.matched = False
        tx.matched_arap_id = None
        tx.updated_by = current_user.id

    await db.flush()
    return {"message": "取消关联成功"}


class InvoiceCreate(BaseModel):
    model_config = {"extra": "ignore"}
    invoice_type: str
    direction: str
    invoice_code: str | None = None
    invoice_no: str | None = None
    issue_date: date | None = None
    seller_name: str | None = None
    buyer_name: str | None = None
    amount_before_tax: float | None = Field(None, ge=0)
    tax_rate: float | None = Field(None, ge=0)
    tax_amount: float | None = Field(None, ge=0)
    total_amount: float | None = Field(None, ge=0)
    items: dict | list | None = None
    contract_id: str | None = None
    purchase_order_id: str | None = None
    project_id: str | None = None
    arap_id: str | None = None
    attachments: list[dict] | None = None


class InvoiceUpdate(BaseModel):
    invoice_code: str | None = None
    invoice_no: str | None = None
    issue_date: date | None = None
    seller_name: str | None = None
    buyer_name: str | None = None
    amount_before_tax: float | None = None
    tax_rate: float | None = None
    tax_amount: float | None = None
    total_amount: float | None = None
    items: dict | None = None


@router.get("/invoices")
@cached(ttl=300, prefix="finance")
async def list_invoices(
    direction: str | None = None,
    check_status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Invoice).where(
        Invoice.is_deleted == False,
        Invoice.company_id == current_user.company_id,
    )
    if not current_user.is_super_admin:
        query = query.where(Invoice.created_by == current_user.id)
    if direction:
        query = query.where(Invoice.direction == direction)
    if check_status:
        query = query.where(Invoice.check_status == check_status)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(Invoice.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total}


@router.post("/invoices")
async def create_invoice(
    body: InvoiceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    dump = body.model_dump()
    for uuid_field in ("contract_id", "purchase_order_id", "project_id", "arap_id"):
        if dump.get(uuid_field) == "":
            dump[uuid_field] = None
    if not dump.get("project_id") and dump.get("contract_id"):
        from app.models.erp.models import Contract
        cr = await db.execute(select(Contract.project_id).where(Contract.id == dump["contract_id"]))
        inherited_pid = cr.scalar_one_or_none()
        if inherited_pid:
            dump["project_id"] = str(inherited_pid)
    obj = Invoice(
        **dump,
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(obj)
    await db.flush()
    await db.refresh(obj)

    effective_contract_id = dump.get("contract_id")
    if effective_contract_id:
        from app.models.erp.models import Contract
        contract_result = await db.execute(
            select(Contract).where(
                Contract.id == effective_contract_id,
                Contract.is_deleted == False,
                Contract.company_id == current_user.company_id,
            )
        )
        contract = contract_result.scalar_one_or_none()
        if contract:
            inv_amount = float(body.total_amount or 0)
            new_invoiced = float(contract.invoiced_amount or 0) + inv_amount
            if contract.total_amount and new_invoiced > float(contract.total_amount) + 0.01:
                raise HTTPException(status_code=400, detail=f"发票金额超过合同总额（合同额{float(contract.total_amount)}，已开票{float(contract.invoiced_amount or 0)}）")
            contract.invoiced_amount = new_invoiced
            contract.updated_by = current_user.id
            await db.flush()

    return obj


@router.get("/invoices/{invoice_id}")
async def get_invoice(
    invoice_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.is_deleted == False,
            Invoice.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="发票不存在")
    return obj


@router.put("/invoices/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    body: InvoiceUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.is_deleted == False,
            Invoice.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="发票不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(obj, data)
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.put("/invoices/{invoice_id}/check")
async def check_invoice(
    invoice_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.is_deleted == False,
            Invoice.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="发票不存在")
    if obj.check_status == "checked":
        raise HTTPException(status_code=400, detail="发票已勾选认证")
    obj.check_status = "checked"
    obj.updated_by = current_user.id
    await db.flush()
    try:
        from app.services.linkage import invoice_create_arap
        await invoice_create_arap(invoice_id, db)
    except Exception as exc:
        import logging
        logging.exception("联动-发票创建ARAP失败: %s", exc)
        raise HTTPException(status_code=500, detail=f"发票勾选成功但创建应收应付失败: {exc}")
    await db.flush()
    try:
        from app.services.finance_event_chain import finance_event_chain
        await finance_event_chain.on_invoice_verified(db, invoice_id)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("联动-发票核验财务链失败: %s", exc)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/invoices/{invoice_id}")
async def delete_invoice(
    invoice_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.is_deleted == False,
            Invoice.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="发票不存在")
    if obj.check_status == "checked":
        raise HTTPException(status_code=400, detail="已勾选认证的发票不能删除")

    if obj.contract_id:
        from app.models.erp.models import Contract
        contract_result = await db.execute(
            select(Contract).where(
                Contract.id == obj.contract_id,
                Contract.is_deleted == False,
                Contract.company_id == current_user.company_id,
            )
        )
        contract = contract_result.scalar_one_or_none()
        if contract:
            contract.invoiced_amount = float(contract.invoiced_amount or 0) - float(obj.total_amount or 0)
            contract.updated_by = current_user.id

    obj.is_deleted = True
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


class TaxCreate(BaseModel):
    tax_type: str
    period: str
    declaration_date: date | None = None
    taxable_amount: float | None = None
    tax_rate: float | None = None
    tax_amount: float | None = None
    paid_amount: float | None = None
    payment_date: date | None = None
    remark: str | None = None


class TaxUpdate(BaseModel):
    declaration_date: date | None = None
    taxable_amount: float | None = None
    tax_rate: float | None = None
    tax_amount: float | None = None
    paid_amount: float | None = None
    payment_date: date | None = None
    status: str | None = None
    remark: str | None = None


@router.get("/tax")
@cached(ttl=300, prefix="finance")
async def list_tax(
    tax_type: str | None = None,
    period: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(TaxDeclaration).where(
        TaxDeclaration.is_deleted == False,
        TaxDeclaration.company_id == current_user.company_id,
    )
    if tax_type:
        query = query.where(TaxDeclaration.tax_type == tax_type)
    if period:
        query = query.where(TaxDeclaration.period == period)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(TaxDeclaration.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total}


@router.post("/tax")
async def create_tax(
    body: TaxCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = TaxDeclaration(
        **body.model_dump(),
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.put("/tax/{tax_id}")
async def update_tax(
    tax_id: str,
    body: TaxUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TaxDeclaration).where(
            TaxDeclaration.id == tax_id,
            TaxDeclaration.is_deleted == False,
            TaxDeclaration.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="税务记录不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(obj, data)
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


class BudgetCreate(BaseModel):
    name: str = Field(..., max_length=100)
    period_type: str
    period: str
    department_id: str | None = None
    project_id: str | None = None
    items: list[dict] | None = None
    total_budget: float | None = None
    status: str = "draft"
    source: str = "manual"


class BudgetUpdate(BaseModel):
    name: str | None = None
    items: list[dict] | None = None
    total_budget: float | None = None
    total_used: float | None = None
    total_committed: float | None = None
    status: str | None = None


@router.get("/budgets")
@cached(ttl=300, prefix="finance")
async def list_budgets(
    period_type: str | None = None,
    project_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Budget).where(
        Budget.is_deleted == False,
        Budget.company_id == current_user.company_id,
    )
    if period_type:
        query = query.where(Budget.period_type == period_type)
    if project_id:
        query = query.where(Budget.project_id == project_id)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(Budget.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total}


@router.post("/budgets")
async def create_budget(
    body: BudgetCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = Budget(
        **body.model_dump(),
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(obj)
    await db.flush()
    await db.refresh(obj)

    if body.project_id and (body.total_budget or body.items):
        try:
            from app.models.project import Project as ProjectModel
            proj = (await db.execute(
                select(ProjectModel).where(ProjectModel.id == body.project_id, ProjectModel.is_deleted == False)
            )).scalar_one_or_none()
            if proj:
                if body.total_budget is not None:
                    proj.total_budget = body.total_budget
                if body.items:
                    proj.budget_items = body.items
                proj.updated_by = current_user.id
                await db.flush()
        except Exception:
            import logging
            logging.getLogger(__name__).exception("同步预算到项目失败")

    return obj


@router.put("/budgets/{budget_id}")
async def update_budget(
    budget_id: str,
    body: BudgetUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Budget).where(
            Budget.id == budget_id,
            Budget.is_deleted == False,
            Budget.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="预算不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(obj, data)
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)

    if obj.project_id and (body.total_budget is not None or body.items is not None):
        try:
            from app.models.project import Project as ProjectModel
            proj = (await db.execute(
                select(ProjectModel).where(ProjectModel.id == str(obj.project_id), ProjectModel.is_deleted == False)
            )).scalar_one_or_none()
            if proj:
                if body.total_budget is not None:
                    proj.total_budget = body.total_budget
                if body.items is not None:
                    proj.budget_items = body.items
                proj.updated_by = current_user.id
                await db.flush()
        except Exception:
            import logging
            logging.getLogger(__name__).exception("同步预算到项目失败")

    return obj


@router.get("/budgets/{budget_id}/execution")
async def budget_execution(
    budget_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Budget).where(
            Budget.id == budget_id,
            Budget.is_deleted == False,
            Budget.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="预算不存在")

    total_budget = float(obj.total_budget or 0)
    total_used = float(obj.total_used or 0)
    total_committed = float(obj.total_committed or 0)
    execution_rate = round(total_used / total_budget * 100, 2) if total_budget > 0 else 0

    return {
        "id": obj.id,
        "name": obj.name,
        "period": obj.period,
        "items": obj.items or [],
        "total_budget": total_budget,
        "total_used": total_used,
        "total_committed": total_committed,
        "remaining": round(total_budget - total_used, 2),
        "execution_rate": execution_rate,
    }


class CostCenterCreate(BaseModel):
    code: str = Field(..., max_length=20)
    name: str = Field(..., max_length=100)
    center_type: str
    ref_id: str | None = None
    parent_id: str | None = None


@router.get("/cost-centers")
@cached(ttl=300, prefix="finance")
async def list_cost_centers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CostCenter).where(
            CostCenter.is_deleted == False,
            CostCenter.company_id == current_user.company_id,
        ).order_by(CostCenter.code)
    )
    return result.scalars().all()


@router.post("/cost-centers")
async def create_cost_center(
    body: CostCenterCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = CostCenter(
        **body.model_dump(),
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.get("/reports/trial-balance")
@cached(ttl=600, prefix="finance")
async def trial_balance(
    period: str = Query(..., description="会计期间 YYYY-MM"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(
            VoucherLine.account_code,
            VoucherLine.account_name,
            func.sum(VoucherLine.debit).label("total_debit"),
            func.sum(VoucherLine.credit).label("total_credit"),
        )
        .join(FinanceVoucher, FinanceVoucher.id == VoucherLine.voucher_id)
        .where(
            FinanceVoucher.period == period,
            FinanceVoucher.status == "posted",
            FinanceVoucher.is_deleted == False,
            FinanceVoucher.company_id == current_user.company_id,
            VoucherLine.is_deleted == False,
        )
        .group_by(VoucherLine.account_code, VoucherLine.account_name)
        .order_by(VoucherLine.account_code)
    )
    result = await db.execute(stmt)
    rows = result.all()

    items = []
    total_debit = 0
    total_credit = 0
    for row in rows:
        debit = float(row.total_debit or 0)
        credit = float(row.total_credit or 0)
        balance = debit - credit
        items.append({
            "account_code": row.account_code,
            "account_name": row.account_name,
            "debit": debit,
            "credit": credit,
            "balance": round(balance, 2),
        })
        total_debit += debit
        total_credit += credit

    return {
        "period": period,
        "items": items,
        "total_debit": round(total_debit, 2),
        "total_credit": round(total_credit, 2),
        "total_balance": round(total_debit - total_credit, 2),
    }


@router.get("/reports/ar-ap-aging")
@cached(ttl=600, prefix="finance")
async def ar_ap_aging(
    type: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ArApRecord).where(
        ArApRecord.is_deleted == False,
        ArApRecord.company_id == current_user.company_id,
        ArApRecord.remaining_amount > 0,
    )
    if type:
        query = query.where(ArApRecord.type == type)
    result = await db.execute(query)
    records = result.scalars().all()

    today = date.today()
    buckets = {
        "not_due": {"label": "未到期", "amount": 0, "count": 0},
        "overdue_1_30": {"label": "1-30天", "amount": 0, "count": 0},
        "overdue_31_60": {"label": "31-60天", "amount": 0, "count": 0},
        "overdue_61_90": {"label": "61-90天", "amount": 0, "count": 0},
        "overdue_90_plus": {"label": "90天以上", "amount": 0, "count": 0},
    }

    details = []
    for r in records:
        remaining = float(r.remaining_amount or 0)
        overdue_days = 0
        if r.due_date:
            due = r.due_date if isinstance(r.due_date, date) else date.fromisoformat(str(r.due_date))
            overdue_days = (today - due).days

        if overdue_days <= 0:
            bucket = "not_due"
        elif overdue_days <= 30:
            bucket = "overdue_1_30"
        elif overdue_days <= 60:
            bucket = "overdue_31_60"
        elif overdue_days <= 90:
            bucket = "overdue_61_90"
        else:
            bucket = "overdue_90_plus"

        buckets[bucket]["amount"] += remaining
        buckets[bucket]["count"] += 1
        details.append({
            "id": str(r.id),
            "type": r.type,
            "counterparty": r.counterparty,
            "total_amount": float(r.total_amount or 0),
            "remaining_amount": remaining,
            "due_date": str(r.due_date) if r.due_date else None,
            "overdue_days": overdue_days,
            "status": r.status,
        })

    for v in buckets.values():
        v["amount"] = round(v["amount"], 2)

    return {"buckets": buckets, "details": details}


@router.get("/reports/profit-loss")
@cached(ttl=600, prefix="finance")
async def profit_loss(
    period: str = Query(..., description="会计期间 YYYY-MM"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(
            VoucherLine.account_code,
            VoucherLine.account_name,
            AccountSubject.category,
            func.sum(VoucherLine.debit).label("total_debit"),
            func.sum(VoucherLine.credit).label("total_credit"),
        )
        .join(FinanceVoucher, FinanceVoucher.id == VoucherLine.voucher_id)
        .join(AccountSubject, AccountSubject.id == VoucherLine.account_id)
        .where(
            FinanceVoucher.period == period,
            FinanceVoucher.status == "posted",
            FinanceVoucher.is_deleted == False,
            FinanceVoucher.company_id == current_user.company_id,
            VoucherLine.is_deleted == False,
            AccountSubject.is_deleted == False,
            AccountSubject.category.in_(["revenue", "cost", "expense"]),
        )
        .group_by(VoucherLine.account_code, VoucherLine.account_name, AccountSubject.category)
        .order_by(AccountSubject.category, VoucherLine.account_code)
    )
    result = await db.execute(stmt)
    rows = result.all()

    revenue_items = []
    cost_items = []
    expense_items = []
    total_revenue = 0
    total_cost = 0
    total_expense = 0

    for row in rows:
        debit = float(row.total_debit or 0)
        credit = float(row.total_credit or 0)
        item = {
            "account_code": row.account_code,
            "account_name": row.account_name,
            "debit": round(debit, 2),
            "credit": round(credit, 2),
        }
        if row.category == "revenue":
            revenue_items.append(item)
            total_revenue += credit - debit
        elif row.category == "cost":
            cost_items.append(item)
            total_cost += debit - credit
        elif row.category == "expense":
            expense_items.append(item)
            total_expense += debit - credit

    gross_profit = total_revenue - total_cost
    net_profit = gross_profit - total_expense

    return {
        "period": period,
        "revenue": {"items": revenue_items, "total": round(total_revenue, 2)},
        "cost": {"items": cost_items, "total": round(total_cost, 2)},
        "gross_profit": round(gross_profit, 2),
        "expense": {"items": expense_items, "total": round(total_expense, 2)},
        "net_profit": round(net_profit, 2),
    }
