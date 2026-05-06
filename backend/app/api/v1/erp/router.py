import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import generate_no, get_current_user, get_db
from app.models.erp import Contract, Customer, GoodsReceipt, ProcurementRequest, PurchaseOrder, Supplier
from app.models.finance import ArApRecord, Invoice
from app.models.organization import User
from app.services.number_generator import generate_number
from app.core.security_utils import safe_update

router = APIRouter(prefix="/erp", tags=["采购合同"])


@router.get("/contracts/next-number")
async def next_contract_number(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    number = await generate_number(db, Contract, "contract_no", "contract", current_user.company_id)
    return {"number": number}


@router.get("/purchase-orders/next-number")
async def next_purchase_order_number(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    number = await generate_number(db, PurchaseOrder, "po_no", "purchase_order", current_user.company_id)
    return {"number": number}


@router.get("/procurement-requests/next-number")
async def next_procurement_request_number(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    number = await generate_number(db, ProcurementRequest, "pr_no", "procurement_request", current_user.company_id)
    return {"number": number}


@router.get("/goods-receipts/next-number")
async def next_goods_receipt_number(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    number = await generate_number(db, GoodsReceipt, "gr_no", "goods_receipt", current_user.company_id)
    return {"number": number}


class SupplierCreate(BaseModel):
    name: str = Field(..., max_length=200)
    code: str = Field(..., max_length=20)
    category: str = Field(..., max_length=30)
    contact_person: str | None = None
    contact_phone: str | None = None
    unified_credit_code: str | None = None
    bank_name: str | None = None
    bank_account: str | None = None
    rating: int = 3
    remark: str | None = None


class SupplierUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    category: str | None = None
    contact_person: str | None = None
    contact_phone: str | None = None
    unified_credit_code: str | None = None
    bank_name: str | None = None
    bank_account: str | None = None
    rating: int | None = None
    status: int | None = None
    remark: str | None = None


@router.get("/suppliers")
async def list_suppliers(
    keyword: str | None = None,
    category: str | None = None,
    status: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Supplier).where(
        Supplier.is_deleted == False,
        Supplier.company_id == current_user.company_id,
    )
    if keyword:
        query = query.where((Supplier.name.ilike(f"%{keyword}%")) | (Supplier.code.ilike(f"%{keyword}%")))
    if category:
        query = query.where(Supplier.category == category)
    if status is not None:
        query = query.where(Supplier.status == status)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(Supplier.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total}


@router.post("/suppliers")
async def create_supplier(
    body: SupplierCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = Supplier(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.put("/suppliers/{supplier_id}")
async def update_supplier(
    supplier_id: str,
    body: SupplierUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Supplier).where(
            Supplier.id == supplier_id,
            Supplier.is_deleted == False,
            Supplier.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="供应商不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(obj, data)
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/suppliers/{supplier_id}")
async def delete_supplier(
    supplier_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    po_count = (await db.execute(
        select(func.count()).select_from(PurchaseOrder).where(
            PurchaseOrder.supplier_id == supplier_id,
            PurchaseOrder.is_deleted == False,
        )
    )).scalar() or 0
    if po_count > 0:
        raise HTTPException(status_code=400, detail=f"该供应商下有{po_count}个采购订单，无法删除")

    contract_count = (await db.execute(
        select(func.count()).select_from(Contract).where(
            Contract.supplier_id == supplier_id,
            Contract.is_deleted == False,
        )
    )).scalar() or 0
    if contract_count > 0:
        raise HTTPException(status_code=400, detail=f"该供应商下有{contract_count}个合同，无法删除")

    await db.execute(
        update(Supplier)
        .where(Supplier.id == supplier_id, Supplier.company_id == current_user.company_id, Supplier.is_deleted == False)
        .values(is_deleted=True)
    )
    return {"message": "删除成功"}


class CustomerCreate(BaseModel):
    name: str = Field(..., max_length=200)
    code: str = Field(..., max_length=20)
    category: str | None = Field(None, max_length=30)
    contact_person: str | None = Field(None, max_length=50)
    contact_phone: str | None = Field(None, max_length=20)
    unified_credit_code: str | None = Field(None, max_length=18)
    bank_name: str | None = Field(None, max_length=100)
    bank_account: str | None = Field(None, max_length=50)
    rating: int = 3
    remark: str | None = None


class CustomerUpdate(BaseModel):
    name: str | None = Field(None, max_length=200)
    code: str | None = Field(None, max_length=20)
    category: str | None = Field(None, max_length=30)
    contact_person: str | None = Field(None, max_length=50)
    contact_phone: str | None = Field(None, max_length=20)
    unified_credit_code: str | None = Field(None, max_length=18)
    bank_name: str | None = Field(None, max_length=100)
    bank_account: str | None = Field(None, max_length=50)
    rating: int | None = None
    status: int | None = None
    remark: str | None = None


@router.get("/customers")
async def list_customers(
    keyword: str | None = None,
    category: str | None = None,
    status: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Customer).where(
        Customer.is_deleted == False,
        Customer.company_id == current_user.company_id,
    )
    if keyword:
        query = query.where((Customer.name.ilike(f"%{keyword}%")) | (Customer.code.ilike(f"%{keyword}%")))
    if category:
        query = query.where(Customer.category == category)
    if status is not None:
        query = query.where(Customer.status == status)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(Customer.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total}


@router.post("/customers")
async def create_customer(
    body: CustomerCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = Customer(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.put("/customers/{customer_id}")
async def update_customer(
    customer_id: str,
    body: CustomerUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.is_deleted == False,
            Customer.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="客户不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(obj, data)
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/customers/{customer_id}")
async def delete_customer(
    customer_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    contract_count = (await db.execute(
        select(func.count()).select_from(Contract).where(
            Contract.customer_id == customer_id,
            Contract.is_deleted == False,
        )
    )).scalar() or 0
    if contract_count > 0:
        raise HTTPException(status_code=400, detail=f"该客户下有{contract_count}个合同，无法删除")

    await db.execute(
        update(Customer)
        .where(Customer.id == customer_id, Customer.company_id == current_user.company_id, Customer.is_deleted == False)
        .values(is_deleted=True)
    )
    return {"message": "删除成功"}


class ProcurementRequestCreate(BaseModel):
    title: str = Field(..., max_length=200)
    project_id: str | None = None
    budget_id: str | None = None
    budget_amount: float | None = None
    items: dict | None = None
    total_amount: float | None = None
    urgency: str = "normal"
    expected_date: date | None = None
    remark: str | None = None


class ProcurementRequestUpdate(BaseModel):
    title: str | None = None
    items: dict | None = None
    total_amount: float | None = None
    urgency: str | None = None
    expected_date: date | None = None
    remark: str | None = None


@router.get("/procurement-requests")
async def list_procurement_requests(
    project_id: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ProcurementRequest).where(
        ProcurementRequest.is_deleted == False,
        ProcurementRequest.company_id == current_user.company_id,
    )
    if project_id:
        query = query.where(ProcurementRequest.project_id == project_id)
    if status:
        query = query.where(ProcurementRequest.status == status)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(ProcurementRequest.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total}


@router.post("/procurement-requests")
async def create_procurement_request(
    body: ProcurementRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = ProcurementRequest(
        **body.model_dump(),
        pr_no=generate_no("PR"),
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.put("/procurement-requests/{pr_id}")
async def update_procurement_request(
    pr_id: str,
    body: ProcurementRequestUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProcurementRequest).where(
            ProcurementRequest.id == pr_id,
            ProcurementRequest.is_deleted == False,
            ProcurementRequest.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="采购申请不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(obj, data)
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.post("/procurement-requests/{pr_id}/submit")
async def submit_procurement_request(
    pr_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProcurementRequest).where(
            ProcurementRequest.id == pr_id,
            ProcurementRequest.is_deleted == False,
            ProcurementRequest.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="采购申请不存在")
    if obj.status != "draft":
        raise HTTPException(status_code=400, detail="只有草稿状态的申请可以提交")
    obj.status = "submitted"
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.post("/procurement-requests/{pr_id}/approve")
async def approve_procurement_request(
    pr_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProcurementRequest).where(
            ProcurementRequest.id == pr_id,
            ProcurementRequest.is_deleted == False,
            ProcurementRequest.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="采购申请不存在")
    if obj.status != "submitted":
        raise HTTPException(status_code=400, detail="只有已提交的申请可以审批")

    try:
        from app.services.linkage import validate_procurement_budget
        budget_check = await validate_procurement_budget(uuid.UUID(pr_id), db)
        if not budget_check.get("valid"):
            raise HTTPException(status_code=400, detail=budget_check.get("message", "预算校验失败"))
    except HTTPException:
        raise
    except Exception:
        pass

    obj.status = "approved"
    obj.updated_by = current_user.id

    po = PurchaseOrder(
        po_no=generate_no("PO"),
        pr_id=obj.id,
        project_id=obj.project_id,
        title=obj.title,
        items=obj.items,
        total_amount=obj.total_amount,
        status="confirmed",
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(po)
    await db.flush()
    try:
        from app.services.linkage import budget_update_on_pr
        await budget_update_on_pr(pr_id, "commit", db)
    except Exception as exc:
        import logging
        logging.exception("联动-预算扣减失败: %s", exc)
    try:
        from app.services.notification_service import broadcast_notification
        users = (await db.execute(select(User.id).where(User.company_id == current_user.company_id, User.is_deleted == False))).scalars().all()
        await broadcast_notification(db, current_user.company_id, [str(u) for u in users], "erp", "采购申请已审批", f"采购申请 {obj.pr_no} 已审批通过", None, str(current_user.id))
    except Exception as exc:
        import logging
        logging.exception("通知推送失败: %s", exc)
    await db.flush()
    await db.refresh(po)
    return {"procurement_request": obj, "purchase_order": po}


@router.post("/procurement-requests/{pr_id}/reject")
async def reject_procurement_request(pr_id: str, comment: str | None = None, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ProcurementRequest).where(ProcurementRequest.id == pr_id, ProcurementRequest.company_id == current_user.company_id, ProcurementRequest.is_deleted == False))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "采购申请不存在")
    if obj.status != "submitted":
        raise HTTPException(400, "只有已提交的申请可以驳回")
    obj.status = "rejected"
    obj.updated_by = current_user.id
    await db.flush()
    return {"message": "已驳回", "status": "rejected"}


class PurchaseOrderCreate(BaseModel):
    supplier_id: str | None = None
    project_id: str | None = None
    contract_id: str | None = None
    title: str = Field(..., max_length=200)
    items: list | dict | None = None
    total_amount: float | None = None
    delivery_date: date | None = None


class PurchaseOrderUpdate(BaseModel):
    supplier_id: str | None = None
    contract_id: str | None = None
    title: str | None = None
    items: list | dict | None = None
    total_amount: float | None = None
    delivery_date: date | None = None
    status: str | None = None


@router.get("/purchase-orders")
async def list_purchase_orders(
    supplier_id: str | None = None,
    project_id: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(PurchaseOrder).where(
        PurchaseOrder.is_deleted == False,
        PurchaseOrder.company_id == current_user.company_id,
    )
    if supplier_id:
        query = query.where(PurchaseOrder.supplier_id == supplier_id)
    if project_id:
        query = query.where(PurchaseOrder.project_id == project_id)
    if status:
        query = query.where(PurchaseOrder.status == status)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(PurchaseOrder.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total}


@router.post("/purchase-orders")
async def create_purchase_order(
    body: PurchaseOrderCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = PurchaseOrder(
        **body.model_dump(),
        po_no=generate_no("PO"),
        status="draft",
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.get("/purchase-orders/{po_id}")
async def get_purchase_order(
    po_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PurchaseOrder).where(
            PurchaseOrder.id == po_id,
            PurchaseOrder.is_deleted == False,
            PurchaseOrder.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="采购订单不存在")
    return obj


@router.put("/purchase-orders/{po_id}")
async def update_purchase_order(
    po_id: str,
    body: PurchaseOrderUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PurchaseOrder).where(
            PurchaseOrder.id == po_id,
            PurchaseOrder.is_deleted == False,
            PurchaseOrder.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="采购订单不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(obj, data)
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.post("/purchase-orders/{po_id}/generate-contract")
async def generate_contract(
    po_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PurchaseOrder).where(
            PurchaseOrder.id == po_id,
            PurchaseOrder.is_deleted == False,
            PurchaseOrder.company_id == current_user.company_id,
        )
    )
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="采购订单不存在")
    if po.contract_id:
        raise HTTPException(status_code=400, detail="该采购订单已生成合同")

    supplier_name = None
    if po.supplier_id:
        sup_result = await db.execute(
            select(Supplier).where(Supplier.id == po.supplier_id, Supplier.company_id == current_user.company_id, Supplier.is_deleted == False)
        )
        supplier = sup_result.scalar_one_or_none()
        if supplier:
            supplier_name = supplier.name

    contract = Contract(
        contract_no=generate_no("CT"),
        name=f"采购合同-{po.title}",
        contract_type="purchase",
        party_b=supplier_name,
        supplier_id=po.supplier_id,
        total_amount=po.total_amount,
        po_id=po.id,
        project_id=po.project_id,
        status="draft",
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(contract)
    await db.flush()

    po.contract_id = contract.id
    po.updated_by = current_user.id
    await db.flush()
    await db.refresh(contract)
    return contract


class GoodsReceiptCreate(BaseModel):
    po_id: str
    items: dict | None = None
    total_amount: float | None = None
    received_date: date | None = None
    remark: str | None = None


@router.get("/goods-receipts")
async def list_goods_receipts(
    po_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(GoodsReceipt).where(
        GoodsReceipt.is_deleted == False,
        GoodsReceipt.company_id == current_user.company_id,
    )
    if po_id:
        query = query.where(GoodsReceipt.po_id == po_id)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(GoodsReceipt.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total}


@router.post("/goods-receipts")
async def create_goods_receipt(
    body: GoodsReceiptCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    po_result = await db.execute(
        select(PurchaseOrder).where(
            PurchaseOrder.id == body.po_id,
            PurchaseOrder.is_deleted == False,
            PurchaseOrder.company_id == current_user.company_id,
        )
    )
    po = po_result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="采购订单不存在")

    gr = GoodsReceipt(
        gr_no=generate_no("GR"),
        po_id=body.po_id,
        project_id=po.project_id,
        items=body.items,
        total_amount=body.total_amount,
        received_date=body.received_date or date.today(),
        receiver_id=current_user.id,
        remark=body.remark,
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(gr)
    await db.flush()
    await db.refresh(gr)
    return gr


@router.put("/goods-receipts/{gr_id}/quality-pass")
async def quality_pass_goods_receipt(
    gr_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GoodsReceipt).where(
            GoodsReceipt.id == gr_id,
            GoodsReceipt.is_deleted == False,
            GoodsReceipt.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="验收记录不存在")
    if obj.quality_status == "passed":
        raise HTTPException(status_code=400, detail="该记录已通过质检")
    obj.quality_status = "passed"
    obj.status = "completed"
    obj.updated_by = current_user.id
    await db.flush()
    try:
        from app.services.linkage import goods_receipt_update_po
        await goods_receipt_update_po(gr_id, db)
    except Exception as exc:
        import logging
        logging.exception("联动-质检更新PO失败: %s", exc)
    await db.flush()
    await db.refresh(obj)
    return obj


class ContractCreate(BaseModel):
    contract_no: str = Field(..., max_length=30)
    name: str = Field(..., max_length=200)
    contract_type: str
    direction: str | None = None
    counterparty: str | None = None
    party_a: str | None = None
    party_b: str | None = None
    supplier_id: str | None = None
    signing_date: date | None = None
    start_date: date | None = None
    end_date: date | None = None
    total_amount: float | None = None
    payment_terms: dict | None = None
    key_clauses: dict | None = None
    remark: str | None = None
    po_id: str | None = None
    project_id: str | None = None
    entity_id: str | None = None
    attachments: list[dict] | None = None
    warranty_amount: float | None = None
    warranty_rate: float | None = None
    warranty_due_date: date | None = None


class ContractUpdate(BaseModel):
    name: str | None = None
    contract_type: str | None = None
    direction: str | None = None
    counterparty: str | None = None
    party_a: str | None = None
    party_b: str | None = None
    supplier_id: str | None = None
    signing_date: date | None = None
    start_date: date | None = None
    end_date: date | None = None
    total_amount: float | None = None
    paid_amount: float | None = None
    invoiced_amount: float | None = None
    payment_terms: dict | None = None
    key_clauses: dict | None = None
    remark: str | None = None
    status: str | None = None
    attachments: list[dict] | None = None
    warranty_amount: float | None = None
    warranty_rate: float | None = None
    warranty_due_date: date | None = None


@router.get("/contracts")
async def list_contracts(
    contract_type: str | None = None,
    project_id: str | None = None,
    status: str | None = None,
    keyword: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Contract).where(
        Contract.is_deleted == False,
        Contract.company_id == current_user.company_id,
    )
    if contract_type:
        query = query.where(Contract.contract_type == contract_type)
    if project_id:
        query = query.where(Contract.project_id == project_id)
    if status:
        query = query.where(Contract.status == status)
    if keyword:
        query = query.where((Contract.name.ilike(f"%{keyword}%")) | (Contract.contract_no.ilike(f"%{keyword}%")))
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(Contract.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.get("/contracts/warranty-reminders")
async def get_warranty_reminders(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from datetime import timedelta
    cutoff = date.today() + timedelta(days=days)
    rows = (await db.execute(
        select(Contract).where(
            Contract.is_deleted == False,
            Contract.company_id == current_user.company_id,
            Contract.warranty_due_date != None,
            Contract.warranty_due_date <= cutoff,
            Contract.warranty_status.in_(["retained", "none", None]),
        ).order_by(Contract.warranty_due_date)
    )).scalars().all()
    return [{
        "id": str(c.id), "contract_no": c.contract_no, "name": c.name,
        "warranty_amount": float(c.warranty_amount or 0), "warranty_due_date": str(c.warranty_due_date),
        "warranty_status": c.warranty_status,
        "total_amount": float(c.total_amount or 0),
        "project_id": str(c.project_id) if c.project_id else None,
    } for c in rows]


@router.get("/contracts/{contract_id}")
async def get_contract(
    contract_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Contract).where(
            Contract.id == contract_id,
            Contract.is_deleted == False,
            Contract.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="合同不存在")
    return obj


@router.post("/contracts")
async def create_contract(
    body: ContractCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(Contract.id).where(
            Contract.contract_no == body.contract_no,
            Contract.company_id == current_user.company_id,
            Contract.is_deleted == False,
        ).limit(1)
    )
    if existing.scalar():
        raise HTTPException(status_code=409, detail=f"合同编号 {body.contract_no} 已存在")

    dump = body.model_dump()
    if not dump.get("entity_id"):
        try:
            from app.services.entity_resolver import resolve_contract_entity
            dump["entity_id"] = await resolve_contract_entity(db, current_user.company_id, body.contract_type)
        except Exception as exc:
            import logging
            logging.exception("entity_resolver(contract) failed: %s", exc)
    obj = Contract(**dump, company_id=current_user.company_id, created_by=current_user.id)
    db.add(obj)
    await db.flush()

    if body.po_id:
        po_result = await db.execute(
            select(PurchaseOrder).where(
                PurchaseOrder.id == body.po_id,
                PurchaseOrder.is_deleted == False,
                PurchaseOrder.company_id == current_user.company_id,
            )
        )
        po = po_result.scalar_one_or_none()
        if po and not po.contract_id:
            po.contract_id = obj.id
            po.updated_by = current_user.id

    # Run contract cascade (auto-create project, FleetCustomer, cost allocation, etc.)
    synced = []
    try:
        from app.services.contract_cascade import cascade_on_contract_create
        synced = await cascade_on_contract_create(
            obj, db, current_user.company_id, current_user.id
        )
    except Exception as exc:
        import logging
        logging.exception("合同联动失败: %s", exc)

    await db.refresh(obj)

    if obj.direction and obj.total_amount and float(obj.total_amount) > 0:
        try:
            from app.models.finance.models import ArApRecord
            ar_ap_type = "ar" if obj.direction == "in" else "ap"
            cp = obj.counterparty or obj.party_a or obj.party_b
            ar_ap = ArApRecord(
                type=ar_ap_type,
                business_type="contract",
                business_id=str(obj.id),
                source_no=obj.contract_no,
                counterparty=cp,
                total_amount=float(obj.total_amount),
                remaining_amount=float(obj.total_amount),
                due_date=obj.end_date,
                project_id=obj.project_id,
                contract_id=str(obj.id),
                remark=f"合同 {obj.contract_no} 自动生成",
                company_id=current_user.company_id,
                created_by=current_user.id,
            )
            db.add(ar_ap)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("合同自动生成应收应付失败: %s", exc)

    if synced:
        return {"data": obj, "synced": synced}
    return obj


@router.put("/contracts/{contract_id}")
async def update_contract(
    contract_id: str,
    body: ContractUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Contract).where(
            Contract.id == contract_id,
            Contract.is_deleted == False,
            Contract.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="合同不存在")
    data = body.model_dump(exclude_unset=True)
    safe_update(obj, data)
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/contracts/{contract_id}")
async def delete_contract(
    contract_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Contract).where(
            Contract.id == contract_id,
            Contract.is_deleted == False,
            Contract.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="合同不存在")

    if obj.status in ("active", "executing"):
        raise HTTPException(status_code=400, detail="执行中的合同无法删除")

    inv_count = (await db.execute(
        select(func.count()).select_from(Invoice).where(
            Invoice.contract_id == contract_id,
            Invoice.is_deleted == False,
        )
    )).scalar() or 0
    if inv_count > 0:
        raise HTTPException(status_code=400, detail=f"该合同下有{inv_count}张发票，无法删除")

    arap_count = (await db.execute(
        select(func.count()).select_from(ArApRecord).where(
            ArApRecord.contract_id == contract_id,
            ArApRecord.is_deleted == False,
        )
    )).scalar() or 0
    if arap_count > 0:
        raise HTTPException(status_code=400, detail=f"该合同下有{arap_count}笔应收/应付记录，无法删除")

    obj.is_deleted = True
    obj.updated_by = current_user.id
    await db.flush()
    return {"message": "删除成功"}


@router.put("/contracts/{contract_id}/status")
async def change_contract_status(
    contract_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    new_status = body.get("status")
    if not new_status:
        raise HTTPException(status_code=400, detail="status is required")
    result = await db.execute(
        select(Contract).where(
            Contract.id == contract_id,
            Contract.is_deleted == False,
            Contract.company_id == current_user.company_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="合同不存在")
    old_status = obj.status
    obj.status = new_status
    obj.updated_by = current_user.id

    # Run contract status cascade
    synced = []
    try:
        from app.services.contract_cascade import cascade_on_contract_status_change
        synced = await cascade_on_contract_status_change(
            obj, old_status, db, current_user.company_id, current_user.id
        )
    except Exception as exc:
        import logging
        logging.exception("合同状态联动失败: %s", exc)

    await db.flush()
    await db.refresh(obj)
    if synced:
        return {"data": obj, "synced": synced}
    return obj


@router.post("/contracts/{contract_id}/settle")
async def settle_contract(
    contract_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    settlement_amount = body.get("settlement_amount")
    if settlement_amount is None:
        raise HTTPException(400, "缺少 settlement_amount")
    obj = (await db.execute(
        select(Contract).where(Contract.id == contract_id, Contract.is_deleted == False, Contract.company_id == current_user.company_id)
    )).scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "合同不存在")
    obj.settlement_amount = float(settlement_amount)
    obj.settlement_date = date.today()
    obj.settlement_confirmed_by = current_user.id
    obj.status = "settled"
    obj.updated_by = current_user.id
    if obj.warranty_amount and obj.warranty_due_date:
        obj.warranty_status = "retained"
    await db.flush()
    await db.refresh(obj)
    return obj


@router.post("/contracts/{contract_id}/warranty-release")
async def release_warranty(
    contract_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = (await db.execute(
        select(Contract).where(Contract.id == contract_id, Contract.is_deleted == False, Contract.company_id == current_user.company_id)
    )).scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "合同不存在")
    if not obj.warranty_amount:
        raise HTTPException(400, "该合同无质保金")
    obj.warranty_status = "released"
    obj.updated_by = current_user.id
    await db.flush()
    return {"message": "质保金已释放"}


@router.get("/three-way-match/{po_id}")
async def three_way_match(
    po_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    po_result = await db.execute(
        select(PurchaseOrder).where(
            PurchaseOrder.id == po_id,
            PurchaseOrder.is_deleted == False,
            PurchaseOrder.company_id == current_user.company_id,
        )
    )
    po = po_result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="采购订单不存在")

    gr_result = await db.execute(
        select(GoodsReceipt).where(
            GoodsReceipt.po_id == po_id,
            GoodsReceipt.is_deleted == False,
            GoodsReceipt.quality_status == "passed",
        )
    )
    goods_receipts = gr_result.scalars().all()
    total_received = sum(float(gr.total_amount or 0) for gr in goods_receipts)

    inv_result = await db.execute(
        select(Invoice).where(
            Invoice.purchase_order_id == po_id,
            Invoice.is_deleted == False,
        )
    )
    invoices = inv_result.scalars().all()
    total_invoiced = sum(float(inv.total_amount or 0) for inv in invoices)

    po_amount = float(po.total_amount or 0)
    tolerance = 0.05

    received_match = abs(po_amount - total_received) / max(po_amount, 1) <= tolerance if po_amount > 0 else total_received == 0
    invoiced_match = abs(po_amount - total_invoiced) / max(po_amount, 1) <= tolerance if po_amount > 0 else total_invoiced == 0

    if received_match and invoiced_match and total_received > 0 and total_invoiced > 0:
        match_status = "matched"
    elif total_received == 0 or total_invoiced == 0:
        match_status = "pending"
    else:
        match_status = "mismatch"

    return {
        "po_id": str(po.id),
        "po_no": po.po_no,
        "po_amount": po_amount,
        "received_amount": total_received,
        "invoiced_amount": total_invoiced,
        "match_status": match_status,
        "received_deviation": round(abs(po_amount - total_received) / max(po_amount, 1) * 100, 2),
        "invoiced_deviation": round(abs(po_amount - total_invoiced) / max(po_amount, 1) * 100, 2),
        "goods_receipts": [{"id": str(gr.id), "gr_no": gr.gr_no, "total_amount": float(gr.total_amount or 0)} for gr in goods_receipts],
        "invoices": [{"id": str(inv.id), "invoice_no": inv.invoice_no, "total_amount": float(inv.total_amount or 0)} for inv in invoices],
    }


@router.post("/three-way-match/{po_id}/confirm")
async def confirm_three_way_match(
    po_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    po_result = await db.execute(
        select(PurchaseOrder).where(
            PurchaseOrder.id == po_id,
            PurchaseOrder.is_deleted == False,
            PurchaseOrder.company_id == current_user.company_id,
        )
    )
    po = po_result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="采购订单不存在")

    gr_result = await db.execute(
        select(GoodsReceipt).where(
            GoodsReceipt.po_id == po_id,
            GoodsReceipt.is_deleted == False,
            GoodsReceipt.quality_status == "passed",
        )
    )
    goods_receipts = gr_result.scalars().all()
    total_received = sum(float(gr.total_amount or 0) for gr in goods_receipts)

    inv_result = await db.execute(
        select(Invoice).where(
            Invoice.purchase_order_id == po_id,
            Invoice.is_deleted == False,
        )
    )
    invoices = inv_result.scalars().all()
    total_invoiced = sum(float(inv.total_amount or 0) for inv in invoices)

    po_amount = float(po.total_amount or 0)
    tolerance = 0.05

    if total_received == 0:
        raise HTTPException(status_code=400, detail="暂无通过质检的验收记录")
    if total_invoiced == 0:
        raise HTTPException(status_code=400, detail="暂无关联发票")

    if abs(po_amount - total_received) / max(po_amount, 1) > tolerance:
        raise HTTPException(status_code=400, detail=f"验收金额与采购订单金额偏差超过5%（偏差{round(abs(po_amount - total_received) / max(po_amount, 1) * 100, 2)}%）")
    if abs(po_amount - total_invoiced) / max(po_amount, 1) > tolerance:
        raise HTTPException(status_code=400, detail=f"发票金额与采购订单金额偏差超过5%（偏差{round(abs(po_amount - total_invoiced) / max(po_amount, 1) * 100, 2)}%）")

    supplier_name = None
    if po.supplier_id:
        sup_result = await db.execute(
            select(Supplier).where(Supplier.id == po.supplier_id, Supplier.company_id == current_user.company_id, Supplier.is_deleted == False)
        )
        supplier = sup_result.scalar_one_or_none()
        if supplier:
            supplier_name = supplier.name

    arap = ArApRecord(
        type="ap",
        business_type="purchase_order",
        business_id=po_id,
        source_no=po.po_no,
        counterparty=supplier_name,
        counterparty_id=po.supplier_id,
        total_amount=po_amount,
        remaining_amount=po_amount,
        project_id=po.project_id,
        contract_id=po.contract_id,
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(arap)

    po.status = "confirmed"
    po.updated_by = current_user.id

    await db.flush()
    await db.refresh(arap)
    return arap
