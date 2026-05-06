import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.models.petty_cash.models import PettyCashFund
from app.models.project import CompanyEntity, FundDisbursement
from app.core.security_utils import safe_update

router = APIRouter(prefix="/erp/entities", tags=["公司主体与资金拨付"])


class EntityCreate(BaseModel):
    entity_name: str = Field(..., max_length=200)
    entity_code: str | None = None
    legal_person: str | None = None
    tax_no: str | None = None
    bank_name: str | None = None
    bank_account: str | None = None
    address: str | None = None
    is_default: bool = False


class EntityUpdate(BaseModel):
    entity_name: str | None = None
    entity_code: str | None = None
    legal_person: str | None = None
    tax_no: str | None = None
    bank_name: str | None = None
    bank_account: str | None = None
    address: str | None = None
    is_default: bool | None = None


class DisbursementCreate(BaseModel):
    fund_id: str
    user_id: str
    amount: float = Field(..., gt=0)
    disburse_date: date
    payment_method: str = "bank_transfer"
    payment_entity_id: str | None = None
    remark: str | None = None


class DisbursementUpdate(BaseModel):
    amount: float | None = None
    disburse_date: date | None = None
    payment_method: str | None = None
    payment_entity_id: str | None = None
    remark: str | None = None
    status: str | None = None


@router.get("/entities")
async def list_entities(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(CompanyEntity).where(
        CompanyEntity.is_deleted == False,
        CompanyEntity.company_id == current_user.company_id,
    )
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar()
    query = query.order_by(CompanyEntity.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    rows = result.scalars().all()
    items = [
        {
            "id": str(r.id), "entity_name": r.entity_name, "entity_code": r.entity_code,
            "legal_person": r.legal_person, "tax_no": r.tax_no,
            "bank_name": r.bank_name, "bank_account": r.bank_account,
            "address": r.address, "is_default": r.is_default,
        }
        for r in rows
    ]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/entities")
async def create_entity(
    body: EntityCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    e = CompanyEntity(
        **body.model_dump(),
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(e)
    await db.flush()
    return {"id": str(e.id)}


@router.put("/entities/{entity_id}")
async def update_entity(
    entity_id: str,
    body: EntityUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    e = (await db.execute(
        select(CompanyEntity).where(
            CompanyEntity.id == entity_id,
            CompanyEntity.is_deleted == False,
            CompanyEntity.company_id == current_user.company_id,
        )
    )).scalar_one_or_none()
    if not e:
        raise HTTPException(404, "公司主体不存在")
    safe_update(e, body)
    e.updated_by = current_user.id
    await db.flush()
    return {"id": str(e.id)}


@router.delete("/entities/{entity_id}")
async def delete_entity(
    entity_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(CompanyEntity).where(
            CompanyEntity.id == entity_id,
            CompanyEntity.company_id == current_user.company_id,
        ).values(is_deleted=True)
    )
    return {"message": "删除成功"}


@router.get("/fund-disbursements")
async def list_disbursements(
    fund_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(FundDisbursement).where(
        FundDisbursement.is_deleted == False,
        FundDisbursement.company_id == current_user.company_id,
    )
    if fund_id:
        query = query.where(FundDisbursement.fund_id == fund_id)
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar()
    query = query.order_by(FundDisbursement.disburse_date.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    rows = result.scalars().all()
    items = [
        {
            "id": str(r.id), "fund_id": str(r.fund_id), "user_id": str(r.user_id),
            "amount": float(r.amount), "disburse_date": str(r.disburse_date),
            "payment_method": r.payment_method,
            "payment_entity_id": str(r.payment_entity_id) if r.payment_entity_id else None,
            "remark": r.remark, "status": r.status,
        }
        for r in rows
    ]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/fund-disbursements")
async def create_disbursement(
    body: DisbursementCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    fund = (await db.execute(
        select(PettyCashFund).where(
            PettyCashFund.id == body.fund_id,
            PettyCashFund.is_deleted == False,
            PettyCashFund.company_id == current_user.company_id,
        )
    )).scalar_one_or_none()
    if not fund:
        raise HTTPException(404, "备用金不存在")
    disburse_amount = float(body.amount)
    if float(fund.remaining_amount) < disburse_amount:
        raise HTTPException(400, "备用金余额不足")
    d = FundDisbursement(
        **body.model_dump(),
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(d)
    fund.used_amount = float(fund.used_amount) + disburse_amount
    fund.remaining_amount = float(fund.remaining_amount) - disburse_amount
    fund.updated_by = current_user.id
    await db.flush()
    return {"id": str(d.id)}


@router.put("/fund-disbursements/{d_id}")
async def update_disbursement(
    d_id: str,
    body: DisbursementUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    d = (await db.execute(
        select(FundDisbursement).where(
            FundDisbursement.id == d_id,
            FundDisbursement.is_deleted == False,
            FundDisbursement.company_id == current_user.company_id,
        )
    )).scalar_one_or_none()
    if not d:
        raise HTTPException(404, "拨付记录不存在")
    safe_update(d, body)
    d.updated_by = current_user.id
    await db.flush()
    return {"id": str(d.id)}


@router.delete("/fund-disbursements/{d_id}")
async def delete_disbursement(
    d_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(FundDisbursement).where(
            FundDisbursement.id == d_id,
            FundDisbursement.company_id == current_user.company_id,
        ).values(is_deleted=True)
    )
    return {"message": "删除成功"}
