import base64
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import func, select, update, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import generate_no, get_current_user, get_db, get_user_permissions
from app.core.cache import cached, invalidate_cache
from app.models.petty_cash.models import PettyCashExpense, PettyCashFund, PettyCashInvoice, PettyCashPool
from app.models.organization import User
from app.core.security_utils import safe_update


async def _check_perm(user: User, db: AsyncSession, *codes: str):
    if user.is_super_admin:
        return
    perms = await get_user_permissions(user, db)
    if "*" in perms:
        return
    for c in codes:
        if c in perms:
            return
    raise HTTPException(status_code=403, detail=f"权限不足，需要: {', '.join(codes)}")


router = APIRouter(prefix="/petty-cash", tags=["备用金管理"])


# ─── Schemas ───

class FundCreate(BaseModel):
    employee_id: str
    amount: float = Field(..., gt=0)
    project_id: str | None = None
    purpose: str
    issue_date: date
    payment_method: str | None = None
    payment_entity_id: str | None = None
    remark: str | None = None


class FundUpdate(BaseModel):
    purpose: str | None = None
    remark: str | None = None


class ExpenseCreate(BaseModel):
    pool_id: str
    project_id: str
    expense_date: date
    category: str
    amount: float = Field(..., gt=0)
    description: str | None = None
    remark: str | None = None
    attachments: list[str] | None = None
    invoice_files: list[str] | None = None


class ExpenseUpdate(BaseModel):
    expense_date: date | None = None
    category: str | None = None
    amount: float | None = None
    description: str | None = None
    project_id: str | None = None
    remark: str | None = None
    attachments: list[str] | None = None
    invoice_files: list[str] | None = None


class InvoiceCreate(BaseModel):
    expense_id: str
    total_amount: float
    invoice_type: str | None = None
    invoice_no: str | None = None
    invoice_date: date | None = None
    seller_name: str | None = None
    amount_without_tax: float | None = None
    tax_amount: float | None = None
    file_url: str | None = None
    remark: str | None = None


class InvoiceUpdate(BaseModel):
    invoice_type: str | None = None
    invoice_no: str | None = None
    invoice_date: date | None = None
    seller_name: str | None = None
    amount_without_tax: float | None = None
    tax_amount: float | None = None
    total_amount: float | None = None
    file_url: str | None = None
    is_verified: bool | None = None
    remark: str | None = None


class RejectBody(BaseModel):
    reject_reason: str


class ApproveBody(BaseModel):
    comment: str | None = None


class BatchApproveBody(BaseModel):
    ids: list[str]


class ResubmitBody(BaseModel):
    expense_date: date | None = None
    category: str | None = None
    amount: float | None = None
    description: str | None = None
    project_id: str | None = None
    remark: str | None = None


# ─── Helpers ───

def _to_dict(obj: Any) -> dict:
    d = {}
    for col in obj.__table__.columns:
        val = getattr(obj, col.key, None)
        if hasattr(val, "isoformat"):
            val = val.isoformat()
        d[col.key] = val
    return d


async def _generate_fund_no(db: AsyncSession, company_id: str) -> str:
    year = date.today().year
    prefix = f"BYJ-{year}-"
    result = await db.execute(
        select(func.count()).select_from(PettyCashFund).where(
            PettyCashFund.company_id == company_id,
            PettyCashFund.fund_no.like(f"{prefix}%"),
        )
    )
    seq = (result.scalar() or 0) + 1
    return f"{prefix}{seq:04d}"


async def _get_pool(db: AsyncSession, pool_id: str, company_id: str) -> PettyCashPool:
    result = await db.execute(
        select(PettyCashPool).where(
            PettyCashPool.id == pool_id,
            PettyCashPool.is_deleted == False,
            PettyCashPool.company_id == company_id,
        )
    )
    pool = result.scalar_one_or_none()
    if not pool:
        raise HTTPException(status_code=404, detail="资金池不存在")
    return pool


async def _get_or_create_pool(db: AsyncSession, company_id: str, employee_id: str) -> PettyCashPool:
    result = await db.execute(
        select(PettyCashPool).where(
            PettyCashPool.company_id == company_id,
            PettyCashPool.employee_id == employee_id,
            PettyCashPool.is_deleted == False,
        )
    )
    pool = result.scalar_one_or_none()
    if pool:
        return pool
    pool = PettyCashPool(
        company_id=company_id,
        employee_id=employee_id,
        total_received=0,
        total_used=0,
        balance=0,
        status="active",
    )
    db.add(pool)
    await db.flush()
    await db.refresh(pool)
    return pool


async def _get_expense(db: AsyncSession, expense_id: str, company_id: str) -> PettyCashExpense:
    result = await db.execute(
        select(PettyCashExpense).where(
            PettyCashExpense.id == expense_id,
            PettyCashExpense.is_deleted == False,
            PettyCashExpense.company_id == company_id,
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="支出记录不存在")
    return expense


async def _get_fund(db: AsyncSession, fund_id: str, company_id: str) -> PettyCashFund:
    result = await db.execute(
        select(PettyCashFund).where(
            PettyCashFund.id == fund_id,
            PettyCashFund.is_deleted == False,
            PettyCashFund.company_id == company_id,
        )
    )
    fund = result.scalar_one_or_none()
    if not fund:
        raise HTTPException(status_code=404, detail="备用金记录不存在")
    return fund


def _recalc_pool(pool: PettyCashPool):
    pool.balance = float(pool.total_received or 0) - float(pool.total_used or 0)


# ─── Pool Endpoints ───

@router.get("/my-pool")
@cached(ttl=300, prefix="petty_cash")
async def get_my_pool(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pool = await _get_or_create_pool(db, current_user.company_id, str(current_user.id))
    result = await db.execute(
        select(User.real_name, User.username).where(User.id == current_user.id)
    )
    user_info = result.one_or_none()
    d = _to_dict(pool)
    d["employee_name"] = user_info[0] or user_info[1] if user_info else None
    return d


@router.get("/pools")
@cached(ttl=300, prefix="petty_cash")
async def list_pools(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    status: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(PettyCashPool).where(
        PettyCashPool.is_deleted == False,
        PettyCashPool.company_id == current_user.company_id,
    )
    if status:
        query = query.where(PettyCashPool.status == status)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(PettyCashPool.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    pools = (await db.execute(query)).scalars().all()

    user_ids = [str(p.employee_id) for p in pools]
    user_map = {}
    if user_ids:
        users = (await db.execute(
            select(User.id, User.real_name, User.username).where(User.id.in_(user_ids))
        )).all()
        user_map = {str(u[0]): u[1] or u[2] for u in users}

    items = []
    for p in pools:
        d = _to_dict(p)
        d["employee_name"] = user_map.get(str(p.employee_id))
        items.append(d)
    return {"items": items, "total": total}


@router.get("/pools/{pool_id}")
async def get_pool_detail(
    pool_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pool = await _get_pool(db, pool_id, current_user.company_id)
    user_result = await db.execute(
        select(User.real_name, User.username).where(User.id == pool.employee_id)
    )
    user_info = user_result.one_or_none()

    funds = (await db.execute(
        select(PettyCashFund).where(
            PettyCashFund.pool_id == pool_id,
            PettyCashFund.is_deleted == False,
            PettyCashFund.company_id == current_user.company_id,
        ).order_by(PettyCashFund.created_at.desc())
    )).scalars().all()

    expenses = (await db.execute(
        select(PettyCashExpense).where(
            PettyCashExpense.pool_id == pool_id,
            PettyCashExpense.is_deleted == False,
            PettyCashExpense.company_id == current_user.company_id,
        ).order_by(PettyCashExpense.created_at.desc())
    )).scalars().all()

    d = _to_dict(pool)
    d["employee_name"] = user_info[0] or user_info[1] if user_info else None
    d["funds"] = [_to_dict(f) for f in funds]
    d["expenses"] = [_to_dict(e) for e in expenses]
    return d


# ─── Fund (Disbursement) Endpoints ───

@router.get("/funds")
@cached(ttl=300, prefix="petty_cash")
async def list_funds(
    employee_id: str | None = None,
    pool_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(PettyCashFund).where(
        PettyCashFund.is_deleted == False,
        PettyCashFund.company_id == current_user.company_id,
    )
    if employee_id:
        query = query.where(PettyCashFund.employee_id == employee_id)
    if pool_id:
        query = query.where(PettyCashFund.pool_id == pool_id)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(PettyCashFund.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    funds = (await db.execute(query)).scalars().all()

    user_ids = list(set(str(f.employee_id) for f in funds))
    user_map = {}
    if user_ids:
        users = (await db.execute(
            select(User.id, User.real_name, User.username).where(User.id.in_(user_ids))
        )).all()
        user_map = {str(u[0]): u[1] or u[2] for u in users}

    items = []
    for f in funds:
        d = _to_dict(f)
        d["employee_name"] = user_map.get(str(f.employee_id))
        items.append(d)
    return {"items": items, "total": total}


@router.post("/funds")
async def create_fund(
    body: FundCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_perm(current_user, db, "petty_cash:issue")
    pool = await _get_or_create_pool(db, current_user.company_id, body.employee_id)
    fund_no = await _generate_fund_no(db, current_user.company_id)

    fund = PettyCashFund(
        fund_no=fund_no,
        pool_id=str(pool.id),
        project_id=body.project_id or uuid.uuid4().hex,
        employee_id=body.employee_id,
        amount=body.amount,
        used_amount=0,
        remaining_amount=body.amount,
        purpose=body.purpose,
        issue_date=body.issue_date,
        expected_return_date=body.issue_date + timedelta(days=30),
        status="active",
        payment_method=body.payment_method,
        payment_entity_id=body.payment_entity_id,
        remark=body.remark,
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(fund)

    pool.total_received = float(pool.total_received or 0) + body.amount
    pool.balance = float(pool.total_received or 0) - float(pool.total_used or 0)

    await db.flush()
    await db.refresh(fund)
    d = _to_dict(fund)
    d["pool_id"] = str(pool.id)
    return d


@router.put("/funds/{fund_id}")
async def update_fund(
    fund_id: str,
    body: FundUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    fund = await _get_fund(db, fund_id, current_user.company_id)
    safe_update(fund, body)
    await db.flush()
    await db.refresh(fund)
    return _to_dict(fund)


@router.delete("/funds/{fund_id}")
async def delete_fund(
    fund_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    fund = await _get_fund(db, fund_id, current_user.company_id)
    if float(fund.used_amount or 0) > 0:
        raise HTTPException(status_code=400, detail="已有支出的发放记录不能删除")
    pool_id = str(fund.pool_id) if fund.pool_id else None
    await db.execute(
        update(PettyCashFund).where(PettyCashFund.id == fund_id).values(is_deleted=True)
    )
    if pool_id:
        pool = await _get_pool(db, pool_id, current_user.company_id)
        pool.total_received = float(pool.total_received or 0) - float(fund.amount or 0)
        _recalc_pool(pool)
    await db.flush()
    return {"message": "删除成功"}


@router.get("/funds/stats")
async def fund_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = (await db.execute(
        select(
            func.coalesce(func.sum(PettyCashPool.total_received), 0).label("total_received"),
            func.coalesce(func.sum(PettyCashPool.total_used), 0).label("total_used"),
            func.coalesce(func.sum(PettyCashPool.balance), 0).label("total_balance"),
            func.count(PettyCashPool.id).label("pool_count"),
        ).where(
            PettyCashPool.is_deleted == False,
            PettyCashPool.company_id == current_user.company_id,
            PettyCashPool.status == "active",
        )
    )).one()
    return {
        "total_received": float(r.total_received or 0),
        "total_used": float(r.total_used or 0),
        "total_balance": float(r.total_balance or 0),
        "pool_count": r.pool_count or 0,
    }


# ─── Expense Endpoints ───

@router.get("/expenses")
@cached(ttl=300, prefix="petty_cash")
async def list_expenses(
    pool_id: str | None = None,
    project_id: str | None = None,
    status: str | None = None,
    employee_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(PettyCashExpense).where(
        PettyCashExpense.is_deleted == False,
        PettyCashExpense.company_id == current_user.company_id,
    )
    if pool_id:
        query = query.where(PettyCashExpense.pool_id == pool_id)
    if project_id:
        query = query.where(PettyCashExpense.project_id == project_id)
    if status:
        if status == "pending_review":
            query = query.where(PettyCashExpense.status.in_(["submitted", "finance_approved"]))
        else:
            query = query.where(PettyCashExpense.status == status)
    if employee_id:
        sub = select(PettyCashPool.id).where(
            PettyCashPool.employee_id == employee_id,
            PettyCashPool.company_id == current_user.company_id,
            PettyCashPool.is_deleted == False,
        )
        query = query.where(PettyCashExpense.pool_id.in_(sub))

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(PettyCashExpense.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    expenses = (await db.execute(query)).scalars().all()

    pool_ids = list(set(str(e.pool_id) for e in expenses if e.pool_id))
    pool_user_map = {}
    if pool_ids:
        pool_rows = (await db.execute(
            select(PettyCashPool.id, PettyCashPool.employee_id).where(PettyCashPool.id.in_(pool_ids))
        )).all()
        emp_ids = [str(pr[1]) for pr in pool_rows]
        users = {}
        if emp_ids:
            u_rows = (await db.execute(
                select(User.id, User.real_name, User.username).where(User.id.in_(emp_ids))
            )).all()
            users = {str(u[0]): u[1] or u[2] for u in u_rows}
        pool_user_map = {str(pr[0]): users.get(str(pr[1])) for pr in pool_rows}

    items = []
    for e in expenses:
        d = _to_dict(e)
        d["employee_name"] = pool_user_map.get(str(e.pool_id)) if e.pool_id else None
        items.append(d)
    return {"items": items, "total": total}


@router.post("/expenses")
async def create_expense(
    body: ExpenseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pool = await _get_pool(db, body.pool_id, current_user.company_id)
    if pool.status != "active":
        raise HTTPException(status_code=400, detail="资金池状态不允许新增支出")

    pending_sum = (await db.execute(
        select(func.coalesce(func.sum(PettyCashExpense.amount), 0)).where(
            PettyCashExpense.pool_id == body.pool_id,
            PettyCashExpense.is_deleted == False,
            PettyCashExpense.company_id == current_user.company_id,
            PettyCashExpense.status.in_(["pending", "submitted", "finance_approved"]),
        )
    )).scalar() or 0
    available = float(pool.balance or 0) - float(pending_sum)
    if available < body.amount:
        raise HTTPException(status_code=400, detail=f"支出金额超过可用余额(余额¥{pool.balance or 0}，待核销¥{pending_sum}，可用¥{available:.2f})")

    expense = PettyCashExpense(
        pool_id=body.pool_id,
        project_id=body.project_id,
        expense_date=body.expense_date,
        category=body.category,
        amount=body.amount,
        description=body.description,
        status="pending",
        remark=body.remark,
        attachments=body.attachments,
        invoice_files=body.invoice_files,
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(expense)
    await db.flush()
    await db.refresh(expense)
    return _to_dict(expense)


@router.get("/expenses/{expense_id}")
async def get_expense(
    expense_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    expense = await _get_expense(db, expense_id, current_user.company_id)
    inv_result = await db.execute(
        select(PettyCashInvoice).where(
            PettyCashInvoice.expense_id == expense_id,
            PettyCashInvoice.is_deleted == False,
            PettyCashInvoice.company_id == current_user.company_id,
        )
    )
    invoices = inv_result.scalars().all()
    return {"expense": _to_dict(expense), "invoices": [_to_dict(i) for i in invoices]}


@router.put("/expenses/{expense_id}")
async def update_expense(
    expense_id: str,
    body: ExpenseUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    expense = await _get_expense(db, expense_id, current_user.company_id)
    if expense.status not in ("pending", "rejected"):
        raise HTTPException(status_code=400, detail="当前状态不允许修改")

    update_data = body.model_dump(exclude_unset=True)
    safe_update(expense, update_data)

    if body.amount is not None and expense.pool_id:
        pool = await _get_pool(db, str(expense.pool_id), current_user.company_id)
        if float(pool.balance or 0) < body.amount:
            raise HTTPException(status_code=400, detail=f"修改后金额超过可用余额(¥{pool.balance or 0})")

    expense.status = "pending"
    expense.reject_reason = None
    await db.flush()
    await db.refresh(expense)
    return _to_dict(expense)


@router.delete("/expenses/{expense_id}")
async def delete_expense(
    expense_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    expense = await _get_expense(db, expense_id, current_user.company_id)
    if expense.status not in ("pending", "rejected"):
        raise HTTPException(status_code=400, detail="只有待提交或已驳回的支出可以删除")

    await db.execute(
        update(PettyCashInvoice).where(
            PettyCashInvoice.expense_id == expense_id,
            PettyCashInvoice.is_deleted == False,
        ).values(is_deleted=True)
    )
    await db.execute(
        update(PettyCashExpense).where(PettyCashExpense.id == expense_id).values(is_deleted=True)
    )
    await db.flush()
    return {"message": "删除成功"}


@router.post("/expenses/{expense_id}/submit")
async def submit_expense(
    expense_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    expense = await _get_expense(db, expense_id, current_user.company_id)
    if expense.status not in ("pending", "rejected"):
        raise HTTPException(status_code=400, detail="只有待提交状态可以提交")
    expense.status = "submitted"
    expense.reject_reason = None

    try:
        from app.services.notification_service import broadcast_notification
        from app.core.database import async_session_factory
        async with async_session_factory() as ndb:
            from sqlalchemy import text
            rows = (await ndb.execute(
                text("SELECT id FROM users WHERE company_id = :cid AND is_super_admin = true AND (is_deleted = false OR is_deleted IS NULL)"),
                {"cid": str(current_user.company_id)},
            )).fetchall()
            emp_name = current_user.real_name or current_user.username
            content = f"{emp_name} 提交了 ¥{float(expense.amount or 0):,.2f} 备用金核销，类别：{expense.category or '-'}"
            admin_ids = [str(r[0]) for r in rows]
            await broadcast_notification(ndb, str(current_user.company_id), admin_ids, "petty_cash", "备用金核销待审批", content, "/petty-cash/admin")
            await ndb.commit()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"[notify] failed: {e}")

    await db.flush()
    await db.refresh(expense)
    return _to_dict(expense)


@router.post("/expenses/{expense_id}/finance-approve")
async def finance_approve(
    expense_id: str,
    body: ApproveBody = ApproveBody(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_perm(current_user, db, "petty_cash:finance_approve")
    expense = await _get_expense(db, expense_id, current_user.company_id)
    if expense.status != "submitted":
        raise HTTPException(status_code=400, detail="只有已提交状态可以财务审核")
    expense.status = "finance_approved"
    expense.finance_id = current_user.id
    expense.finance_approved_at = datetime.now()
    if body.comment:
        expense.finance_comment = body.comment
    await db.flush()
    await db.refresh(expense)
    return _to_dict(expense)


@router.post("/expenses/{expense_id}/admin-approve")
async def admin_approve(
    expense_id: str,
    body: ApproveBody = ApproveBody(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_perm(current_user, db, "petty_cash:approve")
    expense = await _get_expense(db, expense_id, current_user.company_id)
    if expense.status not in ("submitted", "finance_approved"):
        raise HTTPException(status_code=400, detail="只有已提交或财务已审状态可以管理员审核")
    if not expense.pool_id:
        raise HTTPException(status_code=400, detail="支出未关联资金池")

    pool = await _get_pool(db, str(expense.pool_id), current_user.company_id)
    if float(pool.balance or 0) < float(expense.amount or 0):
        raise HTTPException(status_code=400, detail=f"资金池余额不足(¥{pool.balance or 0})")

    expense.status = "admin_approved"
    expense.admin_id = current_user.id
    expense.admin_approved_at = datetime.now()
    if body.comment:
        expense.admin_comment = body.comment

    pool.total_used = float(pool.total_used or 0) + float(expense.amount or 0)
    _recalc_pool(pool)

    try:
        from app.core.database import async_session_factory
        from app.services.project_cost import ProjectCostService
        async with async_session_factory() as cost_db:
            await ProjectCostService.allocate_cost(
                project_id=str(expense.project_id),
                line_type="petty_cash",
                amount=float(expense.amount or 0),
                source_id=str(expense.id),
                source_type="PettyCashExpense",
                source_no=None,
                db=cost_db,
                company_id=current_user.company_id,
                user_id=current_user.id,
                record_date=expense.expense_date,
                description=expense.description,
            )
            await cost_db.commit()
    except Exception:
        pass

    await db.flush()
    await db.refresh(expense)
    return _to_dict(expense)


@router.post("/expenses/{expense_id}/reject")
async def reject_expense(
    expense_id: str,
    body: RejectBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    expense = await _get_expense(db, expense_id, current_user.company_id)
    if expense.status not in ("submitted", "finance_approved", "admin_approved"):
        raise HTTPException(status_code=400, detail="当前状态不允许驳回")

    was_deducted = expense.status == "admin_approved"
    if was_deducted and expense.pool_id:
        pool = await _get_pool(db, str(expense.pool_id), current_user.company_id)
        pool.total_used = float(pool.total_used or 0) - float(expense.amount or 0)
        _recalc_pool(pool)

    expense.status = "rejected"
    expense.reject_reason = body.reject_reason
    expense.admin_id = current_user.id
    expense.admin_approved_at = datetime.now()
    await db.flush()
    await db.refresh(expense)
    return _to_dict(expense)


@router.post("/expenses/{expense_id}/resubmit")
async def resubmit_expense(
    expense_id: str,
    body: ResubmitBody | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    expense = await _get_expense(db, expense_id, current_user.company_id)
    if expense.status != "rejected":
        raise HTTPException(status_code=400, detail="只有被驳回的支出可以重新提交")

    if body:
        safe_update(expense, body)

    if expense.pool_id:
        pool = await _get_pool(db, str(expense.pool_id), current_user.company_id)
        if float(pool.balance or 0) < float(expense.amount or 0):
            raise HTTPException(status_code=400, detail=f"修改后金额超过可用余额(¥{pool.balance or 0})")

    expense.status = "pending"
    expense.reject_reason = None
    await db.flush()
    await db.refresh(expense)
    return _to_dict(expense)


@router.post("/expenses/batch-finance-approve")
async def batch_finance_approve(
    body: BatchApproveBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_perm(current_user, db, "petty_cash:finance_approve")
    if not body.ids:
        raise HTTPException(status_code=400, detail="请选择要审核的记录")
    result = await db.execute(
        select(PettyCashExpense).where(
            PettyCashExpense.id.in_(body.ids),
            PettyCashExpense.is_deleted == False,
            PettyCashExpense.company_id == current_user.company_id,
            PettyCashExpense.status == "submitted",
        )
    )
    expenses = result.scalars().all()
    now = datetime.now()
    for e in expenses:
        e.status = "finance_approved"
        e.finance_id = current_user.id
        e.finance_approved_at = now
    await db.flush()
    return {"approved_count": len(expenses)}


@router.post("/expenses/batch-admin-approve")
async def batch_admin_approve(
    body: BatchApproveBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_perm(current_user, db, "petty_cash:approve")
    if not body.ids:
        raise HTTPException(status_code=400, detail="请选择要审核的记录")
    result = await db.execute(
        select(PettyCashExpense).where(
            PettyCashExpense.id.in_(body.ids),
            PettyCashExpense.is_deleted == False,
            PettyCashExpense.company_id == current_user.company_id,
            PettyCashExpense.status.in_(["submitted", "finance_approved"]),
        )
    )
    expenses = result.scalars().all()
    now = datetime.now()
    pool_ids = set()
    for e in expenses:
        e.status = "admin_approved"
        e.admin_id = current_user.id
        e.admin_approved_at = now
        if e.pool_id:
            pool_ids.add(str(e.pool_id))

    for pid in pool_ids:
        pool = await _get_pool(db, pid, current_user.company_id)
        pool.total_used = float(pool.total_used or 0) + sum(
            float(e.amount or 0) for e in expenses if str(e.pool_id) == pid
        )
        _recalc_pool(pool)

    await db.flush()
    return {"approved_count": len(expenses)}


@router.post("/expenses/batch-reject")
async def batch_reject(
    body: BatchApproveBody,
    reject_reason: str = "",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not body.ids:
        raise HTTPException(status_code=400, detail="请选择要驳回的记录")
    result = await db.execute(
        select(PettyCashExpense).where(
            PettyCashExpense.id.in_(body.ids),
            PettyCashExpense.is_deleted == False,
            PettyCashExpense.company_id == current_user.company_id,
            PettyCashExpense.status.in_(["submitted", "finance_approved"]),
        )
    )
    expenses = result.scalars().all()
    now = datetime.now()
    for e in expenses:
        e.status = "rejected"
        e.reject_reason = reject_reason
        e.admin_id = current_user.id
        e.admin_approved_at = now
    await db.flush()
    return {"rejected_count": len(expenses)}


# ─── Invoice Endpoints ───

@router.get("/invoices")
@cached(ttl=300, prefix="petty_cash")
async def list_invoices(
    expense_id: str | None = None,
    pool_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(PettyCashInvoice).where(
        PettyCashInvoice.is_deleted == False,
        PettyCashInvoice.company_id == current_user.company_id,
    )
    if expense_id:
        query = query.where(PettyCashInvoice.expense_id == expense_id)
    if pool_id:
        query = query.where(PettyCashInvoice.fund_id == pool_id)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(PettyCashInvoice.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": [_to_dict(i) for i in result.scalars().all()], "total": total}


@router.post("/invoices")
async def create_invoice(
    body: InvoiceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    invoice = PettyCashInvoice(
        expense_id=body.expense_id,
        fund_id=body.expense_id,
        invoice_type=body.invoice_type or "",
        invoice_no=body.invoice_no,
        invoice_date=body.invoice_date,
        seller_name=body.seller_name,
        amount_without_tax=body.amount_without_tax,
        tax_amount=body.tax_amount,
        total_amount=body.total_amount,
        file_url=body.file_url,
        remark=body.remark,
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(invoice)
    await db.execute(
        update(PettyCashExpense).where(
            PettyCashExpense.id == body.expense_id,
        ).values(
            invoice_count=PettyCashExpense.invoice_count + 1,
            invoice_total=PettyCashExpense.invoice_total + body.total_amount,
        )
    )
    await db.flush()
    await db.refresh(invoice)
    return _to_dict(invoice)


@router.post("/invoices/ocr-upload")
async def ocr_upload_invoice(
    expense_id: str = ...,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="文件大小不能超过10MB")

    image_b64 = base64.b64encode(content).decode("utf-8") if content else ""
    ocr_result = None

    try:
        from app.services.ai_gateway import ai_gateway
        ocr_result = await ai_gateway.recognize_invoice(image_b64)
        if ocr_result and ocr_result.get("parse_error"):
            ocr_result = None
    except Exception:
        pass

    invoice = PettyCashInvoice(
        expense_id=expense_id,
        fund_id=expense_id,
        invoice_type=ocr_result.get("invoice_type", "") if ocr_result else "",
        invoice_no=ocr_result.get("invoice_no") if ocr_result else None,
        invoice_date=ocr_result.get("invoice_date") if ocr_result else None,
        seller_name=ocr_result.get("seller_name") if ocr_result else None,
        amount_without_tax=ocr_result.get("amount_without_tax") if ocr_result else None,
        tax_amount=ocr_result.get("tax_amount") if ocr_result else None,
        total_amount=ocr_result.get("total_amount", 0) if ocr_result else 0,
        ocr_result=ocr_result,
        ocr_raw=ocr_result,
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(invoice)
    await db.execute(
        update(PettyCashExpense).where(
            PettyCashExpense.id == expense_id,
        ).values(
            invoice_count=PettyCashExpense.invoice_count + 1,
        )
    )
    if ocr_result and ocr_result.get("total_amount"):
        await db.execute(
            update(PettyCashExpense).where(
                PettyCashExpense.id == expense_id,
            ).values(
                invoice_total=PettyCashExpense.invoice_total + float(ocr_result.get("total_amount", 0)),
            )
        )
    await db.flush()
    await db.refresh(invoice)
    return {"invoice": _to_dict(invoice), "ocr_result": ocr_result}


@router.put("/invoices/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    body: InvoiceUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PettyCashInvoice).where(
            PettyCashInvoice.id == invoice_id,
            PettyCashInvoice.is_deleted == False,
            PettyCashInvoice.company_id == current_user.company_id,
        )
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="发票不存在")
    safe_update(invoice, body)
    await db.flush()
    await db.refresh(invoice)
    return _to_dict(invoice)


@router.delete("/invoices/{invoice_id}")
async def delete_invoice(
    invoice_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PettyCashInvoice).where(
            PettyCashInvoice.id == invoice_id,
            PettyCashInvoice.is_deleted == False,
            PettyCashInvoice.company_id == current_user.company_id,
        )
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="发票不存在")
    inv_total = float(invoice.total_amount or 0)
    expense_id = str(invoice.expense_id)
    await db.execute(
        update(PettyCashInvoice).where(PettyCashInvoice.id == invoice_id).values(is_deleted=True)
    )
    await db.execute(
        update(PettyCashExpense).where(
            PettyCashExpense.id == expense_id,
        ).values(
            invoice_count=PettyCashExpense.invoice_count - 1,
            invoice_total=PettyCashExpense.invoice_total - inv_total,
        )
    )
    await db.flush()
    return {"message": "删除成功"}


@router.post("/funds/{fund_id}/cancel")
async def cancel_fund(
    fund_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """取消备用金"""
    fund = (await db.execute(
        select(PettyCashFund).where(
            PettyCashFund.id == fund_id,
            PettyCashFund.company_id == current_user.company_id,
            PettyCashFund.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not fund:
        raise HTTPException(status_code=404, detail="备用金不存在")
    fund.status = "cancelled"
    await db.commit()
    return {"detail": "已取消"}


@router.post("/funds/{fund_id}/settle")
async def settle_fund(
    fund_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """结清备用金"""
    fund = (await db.execute(
        select(PettyCashFund).where(
            PettyCashFund.id == fund_id,
            PettyCashFund.company_id == current_user.company_id,
            PettyCashFund.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not fund:
        raise HTTPException(status_code=404, detail="备用金不存在")
    fund.status = "settled"
    fund.actual_return_date = datetime.now().date()
    await db.commit()
    return {"detail": "已结清"}


@router.get("/funds/overdue")
async def get_overdue_funds(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取逾期备用金"""
    today = datetime.now().date()
    result = await db.execute(
        select(PettyCashFund).where(
            PettyCashFund.company_id == current_user.company_id,
            PettyCashFund.is_deleted == False,
            PettyCashFund.status == "active",
            PettyCashFund.expected_return_date < today,
        ).order_by(PettyCashFund.expected_return_date)
    )
    funds = result.scalars().all()
    return [
        {
            "id": str(f.id),
            "fund_no": f.fund_no,
            "project_id": str(f.project_id),
            "employee_id": str(f.employee_id),
            "amount": float(f.amount),
            "used_amount": float(f.used_amount),
            "remaining_amount": float(f.remaining_amount),
            "purpose": f.purpose,
            "issue_date": str(f.issue_date),
            "expected_return_date": str(f.expected_return_date),
            "actual_return_date": str(f.actual_return_date) if f.actual_return_date else None,
            "status": f.status,
            "approved_by": str(f.approved_by) if f.approved_by else None,
            "remark": f.remark,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        }
        for f in funds
    ]


@router.post("/expenses/{expense_id}/leader-approve")
async def leader_approve_expense(
    expense_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """领导审批报销"""
    expense = (await db.execute(
        select(PettyCashExpense).where(
            PettyCashExpense.id == expense_id,
            PettyCashExpense.company_id == current_user.company_id,
            PettyCashExpense.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="报销单不存在")
    expense.status = "finance_pending"
    expense.leader_id = current_user.id
    await db.commit()
    return {"detail": "已审批通过"}


@router.post("/expenses/{expense_id}/leader-reject")
async def leader_reject_expense(
    expense_id: str,
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """领导驳回报销"""
    expense = (await db.execute(
        select(PettyCashExpense).where(
            PettyCashExpense.id == expense_id,
            PettyCashExpense.company_id == current_user.company_id,
            PettyCashExpense.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="报销单不存在")
    expense.status = "rejected"
    expense.reject_reason = data.get("reject_reason", "")
    await db.commit()
    return {"detail": "已驳回"}


@router.post("/expenses/{expense_id}/finance-reject")
async def finance_reject_expense(
    expense_id: str,
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """财务驳回报销"""
    expense = (await db.execute(
        select(PettyCashExpense).where(
            PettyCashExpense.id == expense_id,
            PettyCashExpense.company_id == current_user.company_id,
            PettyCashExpense.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="报销单不存在")
    expense.status = "rejected"
    expense.reject_reason = data.get("reject_reason", "")
    await db.commit()
    return {"detail": "已驳回"}


@router.post("/expenses/batch-leader-approve")
async def batch_leader_approve_expenses(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """批量领导审批报销"""
    ids = data.get("ids", [])
    count = 0
    for expense_id in ids:
        expense = (await db.execute(
            select(PettyCashExpense).where(
                PettyCashExpense.id == expense_id,
                PettyCashExpense.company_id == current_user.company_id,
                PettyCashExpense.is_deleted == False,
            )
        )).scalar_one_or_none()
        if expense:
            expense.status = "finance_pending"
            expense.leader_id = current_user.id
            count += 1
    await db.commit()
    return {"detail": f"已审批 {count} 条"}
