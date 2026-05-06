import logging
import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.models.project.models import PersonalTransaction, Project
from app.services.personal_import import PersonalImportService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/finance/personal", tags=["个人流水管理"])


class PersonalTxCreate(BaseModel):
    tx_date: date
    tx_amount: float
    balance: float | None = None
    counterparty: str | None = None
    description: str | None = None
    tx_type: str = "expense"
    source: str = "manual"
    source_account: str | None = None
    payment_channel: str | None = None
    is_public: bool = True
    fund_path: list[str] | None = None
    purpose: str | None = None
    category: str | None = None
    project_id: str | None = None
    remark: str | None = None


class PersonalTxUpdate(BaseModel):
    is_public: bool | None = None
    purpose: str | None = None
    category: str | None = None
    project_id: str | None = None
    remark: str | None = None
    fund_path: list[str] | None = None
    description: str | None = None
    counterparty: str | None = None


class PersonalTxBatchUpdate(BaseModel):
    ids: list[str] = Field(..., min_length=1)
    is_public: bool | None = None
    purpose: str | None = None
    category: str | None = None
    project_id: str | None = None
    remark: str | None = None


def _tx_to_dict(tx: PersonalTransaction) -> dict:
    return {
        "id": str(tx.id),
        "tx_date": str(tx.tx_date),
        "tx_time": tx.tx_time,
        "tx_amount": float(tx.tx_amount),
        "balance": float(tx.balance) if tx.balance is not None else None,
        "counterparty": tx.counterparty,
        "counterparty_name": tx.counterparty_name,
        "counterparty_bank": tx.counterparty_bank,
        "counterparty_account": tx.counterparty_account,
        "description": tx.description,
        "tx_type": tx.tx_type,
        "source": tx.source,
        "source_account": tx.source_account,
        "payment_channel": tx.payment_channel,
        "payment_method": tx.payment_method,
        "transaction_type": tx.transaction_type,
        "goods": tx.goods,
        "tx_status": tx.tx_status,
        "is_public": tx.is_public,
        "fund_path": tx.fund_path or [],
        "purpose": tx.purpose,
        "category": tx.category,
        "project_id": str(tx.project_id) if tx.project_id else None,
        "remark": tx.remark,
        "merged_sources": tx.merged_sources,
        "merged_group_id": str(tx.merged_group_id) if tx.merged_group_id else None,
        "created_at": str(tx.created_at) if tx.created_at else None,
        "updated_at": str(tx.updated_at) if tx.updated_at else None,
    }


@router.get("/list")
async def list_personal_tx(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100000),
    start_date: date | None = None,
    end_date: date | None = None,
    source: str | None = None,
    is_public: bool | None = None,
    project_id: str | None = None,
    category: str | None = None,
    tx_type: str | None = None,
    keyword: str | None = None,
    sort_by: str | None = None,
    sort_order: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(PersonalTransaction).where(
        PersonalTransaction.is_deleted == False,
        PersonalTransaction.user_id == str(current_user.id),
    )

    if start_date:
        q = q.where(PersonalTransaction.tx_date >= start_date)
    if end_date:
        q = q.where(PersonalTransaction.tx_date <= end_date)
    if source:
        q = q.where(PersonalTransaction.source == source)
    if is_public is not None:
        q = q.where(PersonalTransaction.is_public == is_public)
    if project_id:
        q = q.where(PersonalTransaction.project_id == project_id)
    if category:
        q = q.where(PersonalTransaction.category == category)
    if tx_type:
        q = q.where(PersonalTransaction.tx_type == tx_type)
    if keyword:
        kw = f"%{keyword}%"
        q = q.where(
            (PersonalTransaction.counterparty.ilike(kw))
            | (PersonalTransaction.description.ilike(kw))
            | (PersonalTransaction.purpose.ilike(kw))
        )

    total_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(total_q)).scalar() or 0

    sort_col = PersonalTransaction.tx_date
    if sort_by == "tx_amount":
        sort_col = PersonalTransaction.tx_amount
    elif sort_by == "balance":
        sort_col = PersonalTransaction.balance
    elif sort_by == "created_at":
        sort_col = PersonalTransaction.created_at
    elif sort_by == "purpose":
        sort_col = PersonalTransaction.purpose
    elif sort_by == "category":
        sort_col = PersonalTransaction.category

    if sort_order == "asc":
        q = q.order_by(sort_col.asc(), PersonalTransaction.tx_time.asc())
    else:
        q = q.order_by(sort_col.desc(), PersonalTransaction.tx_time.desc())

    q = q.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    rows = result.scalars().all()

    # Collapse merged rows: one per merged_group_id
    seen_groups = set()
    items = []
    for tx in rows:
        if tx.merged_group_id:
            gid = str(tx.merged_group_id)
            if gid in seen_groups:
                continue
            seen_groups.add(gid)
        items.append(_tx_to_dict(tx))

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/purpose-suggestions")
async def get_purpose_suggestions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(PersonalTransaction.purpose, func.count().label("cnt"))
        .where(
            PersonalTransaction.is_deleted == False,
            PersonalTransaction.user_id == str(current_user.id),
            PersonalTransaction.purpose.isnot(None),
            PersonalTransaction.purpose != "",
        )
        .group_by(PersonalTransaction.purpose)
        .order_by(func.count().desc())
    )).all()
    return [r[0] for r in rows if r[0]]


@router.post("/import")
async def create_personal_tx(
    body: PersonalTxCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tx = PersonalTransaction(
        company_id=str(current_user.company_id),
        user_id=str(current_user.id),
        created_by=str(current_user.id),
        **body.model_dump(),
    )
    db.add(tx)
    await db.flush()
    return _tx_to_dict(tx)


@router.post("/import-file")
async def import_personal_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file_data = await file.read()
    filename = file.filename or "unknown.xlsx"

    try:
        parsed, source_type = PersonalImportService.parse_file(file_data, filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not parsed:
        raise HTTPException(status_code=400, detail="未解析到有效交易记录")

    existing_refs_q = select(PersonalTransaction.source_ref).where(
        PersonalTransaction.is_deleted == False,
        PersonalTransaction.user_id == str(current_user.id),
        PersonalTransaction.source_ref.isnot(None),
    )
    result = await db.execute(existing_refs_q)
    existing_refs = {r[0] for r in result.all()}

    new_txs = PersonalImportService.deduplicate(parsed, existing_refs)

    # Load known counterparty→project mappings for auto-annotation
    known_mappings = {}
    try:
        from app.models.intelligence.models import BusinessKnowledge
        import json as _json
        knowledge_rows = (await db.execute(
            select(BusinessKnowledge).where(
                BusinessKnowledge.category == "counterparty_mapping",
                BusinessKnowledge.is_active == True,
                BusinessKnowledge.company_id == current_user.company_id,
            )
        )).scalars().all()
        for k in knowledge_rows:
            mapping = _json.loads(k.value) if isinstance(k.value, str) else (k.value or {})
            known_mappings[k.key.strip()] = mapping
    except Exception:
        pass

    batch_id = uuid.uuid4().hex[:12]
    created = []
    created_txs = []
    suggestions = []

    for item in new_txs:
        cp = (item.get("counterparty") or item.get("counterparty_name") or "").strip()
        suggested_project_id = None
        suggested_category = None
        if cp and cp in known_mappings:
            mapping = known_mappings[cp]
            suggested_project_id = mapping.get("project_id")
            suggested_category = mapping.get("expense_type")

        raw = item["tx_date"]
        if isinstance(raw, str):
            parsed_date = datetime.strptime(raw, "%Y-%m-%d").date()
        elif isinstance(raw, date):
            parsed_date = raw
        else:
            continue

        tx = PersonalTransaction(
            company_id=str(current_user.company_id),
            user_id=str(current_user.id),
            created_by=str(current_user.id),
            tx_date=parsed_date,
            tx_time=item.get("tx_time"),
            tx_amount=item["tx_amount"],
            balance=item.get("balance"),
            counterparty=item.get("counterparty"),
            counterparty_name=item.get("counterparty_name"),
            counterparty_bank=item.get("counterparty_bank"),
            counterparty_account=item.get("counterparty_account"),
            description=item.get("description"),
            tx_type=item.get("tx_type", "expense"),
            source=item.get("source", source_type),
            source_account=item.get("source_account"),
            payment_channel=item.get("payment_channel"),
            payment_method=item.get("payment_method"),
            transaction_type=item.get("transaction_type"),
            goods=item.get("goods"),
            tx_status=item.get("tx_status"),
            import_batch=batch_id,
            source_ref=item.get("source_ref"),
            original_data=item.get("original_data"),
            is_public=item.get("is_public", True),
            fund_path=item.get("fund_path", []),
            purpose=item.get("purpose"),
            category=item.get("category"),
            project_id=item.get("project_id"),
            remark=item.get("remark"),
        )
        db.add(tx)
        created.append(item)
        created_txs.append(tx)

        if suggested_project_id:
            suggestions.append({
                "tx_idx": len(created) - 1,
                "counterparty": cp,
                "suggested_project_id": suggested_project_id,
                "suggested_category": suggested_category,
                "tx_date": str(parsed_date),
                "tx_amount": item["tx_amount"],
                "description": item.get("description", ""),
            })

    await db.flush()

    # Auto-merge: find matching transactions across sources by date+amount
    merged_count = 0
    if len(created_txs) > 1:
        # Get all user's transactions for merge candidates
        all_user_txs = (await db.execute(
            select(PersonalTransaction).where(
                PersonalTransaction.is_deleted == False,
                PersonalTransaction.user_id == str(current_user.id),
                PersonalTransaction.merged_group_id.is_(None),
            )
        )).scalars().all()

        # Build lookup by (date, abs_amount)
        by_date_amount = {}
        for t in all_user_txs:
            key = (str(t.tx_date), round(abs(float(t.tx_amount)), 2))
            by_date_amount.setdefault(key, []).append(t)

        for key, txs in by_date_amount.items():
            sources = set(t.source for t in txs)
            if len(sources) < 2:
                continue
            # Found matching transactions from different sources
            group_id = uuid.uuid4()
            source_labels = []
            for t in txs:
                t.merged_group_id = group_id
                src_label = t.source_account or t.source
                if src_label not in source_labels:
                    source_labels.append(src_label)
            merged_label = "-".join(source_labels)
            for t in txs:
                t.merged_sources = merged_label
            merged_count += 1

        if merged_count:
            await db.flush()

    return {
        "imported": len(created),
        "skipped": len(parsed) - len(created),
        "merged": merged_count,
        "batch_id": batch_id,
        "source": source_type,
        "created_ids": [str(t.id) for t in created_txs],
        "suggestions": suggestions,
    }


@router.put("/{tx_id}")
async def update_personal_tx(
    tx_id: str,
    body: PersonalTxUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PersonalTransaction).where(
            PersonalTransaction.id == tx_id,
            PersonalTransaction.is_deleted == False,
            PersonalTransaction.user_id == str(current_user.id),
        )
    )
    tx = result.scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="记录不存在")

    update_data = body.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(tx, k, v)
    tx.updated_by = str(current_user.id)

    await db.flush()

    if body.project_id and (tx.counterparty or tx.counterparty_name):
        try:
            from app.models.intelligence.models import BusinessKnowledge
            import json as _json
            cp = (tx.counterparty_name or tx.counterparty or "").strip()
            if cp:
                existing = (await db.execute(
                    select(BusinessKnowledge).where(
                        BusinessKnowledge.category == "counterparty_mapping",
                        BusinessKnowledge.key == cp,
                        BusinessKnowledge.company_id == current_user.company_id,
                    )
                )).scalar_one_or_none()
                mapping = {"project_id": body.project_id}
                if body.category:
                    mapping["expense_type"] = body.category
                if body.purpose:
                    mapping["purpose"] = body.purpose
                if existing:
                    existing.value = _json.dumps(mapping, ensure_ascii=False)
                    existing.updated_by = str(current_user.id)
                else:
                    db.add(BusinessKnowledge(
                        category="counterparty_mapping",
                        key=cp,
                        value=_json.dumps(mapping, ensure_ascii=False),
                        confidence=0.9,
                        source="personal_annotation",
                        is_active=True,
                        company_id=current_user.company_id,
                        created_by=str(current_user.id),
                    ))
                await db.flush()
        except Exception:
            pass

    return _tx_to_dict(tx)


@router.delete("/{tx_id}")
async def delete_personal_tx(
    tx_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PersonalTransaction).where(
            PersonalTransaction.id == tx_id,
            PersonalTransaction.is_deleted == False,
            PersonalTransaction.user_id == str(current_user.id),
        )
    )
    tx = result.scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="记录不存在")

    tx.is_deleted = True
    tx.updated_by = str(current_user.id)
    await db.flush()
    return {"ok": True}


@router.put("/batch-update")
async def batch_update_personal_tx(
    body: PersonalTxBatchUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    update_data = body.model_dump(exclude_unset=True)
    ids = update_data.pop("ids", [])

    if not update_data:
        raise HTTPException(status_code=400, detail="无更新字段")

    result = await db.execute(
        select(PersonalTransaction).where(
            PersonalTransaction.id.in_(ids),
            PersonalTransaction.is_deleted == False,
            PersonalTransaction.user_id == str(current_user.id),
        )
    )
    txs = result.scalars().all()

    updated = 0
    for tx in txs:
        for k, v in update_data.items():
            setattr(tx, k, v)
        tx.updated_by = str(current_user.id)
        updated += 1

    await db.flush()

    if update_data.get("project_id"):
        try:
            from app.models.intelligence.models import BusinessKnowledge
            import json as _json
            counterparties = set()
            for tx in txs:
                cp = (tx.counterparty_name or tx.counterparty or "").strip()
                if cp:
                    counterparties.add(cp)
            for cp in counterparties:
                existing = (await db.execute(
                    select(BusinessKnowledge).where(
                        BusinessKnowledge.category == "counterparty_mapping",
                        BusinessKnowledge.key == cp,
                        BusinessKnowledge.company_id == current_user.company_id,
                    )
                )).scalar_one_or_none()
                mapping = {"project_id": update_data["project_id"]}
                if update_data.get("category"):
                    mapping["expense_type"] = update_data["category"]
                if existing:
                    existing.value = _json.dumps(mapping, ensure_ascii=False)
                    existing.updated_by = str(current_user.id)
                else:
                    db.add(BusinessKnowledge(
                        category="counterparty_mapping",
                        key=cp,
                        value=_json.dumps(mapping, ensure_ascii=False),
                        confidence=0.85,
                        source="personal_batch_annotation",
                        is_active=True,
                        company_id=current_user.company_id,
                        created_by=str(current_user.id),
                    ))
            await db.flush()
        except Exception:
            pass

    return {"updated": updated}


@router.get("/stats")
async def get_personal_stats(
    start_date: date | None = None,
    end_date: date | None = None,
    source: str | None = None,
    project_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base_q = select(
        func.count().label("count"),
        func.sum(PersonalTransaction.tx_amount).label("total_amount"),
    ).where(
        PersonalTransaction.is_deleted == False,
        PersonalTransaction.user_id == str(current_user.id),
    )

    if start_date:
        base_q = base_q.where(PersonalTransaction.tx_date >= start_date)
    if end_date:
        base_q = base_q.where(PersonalTransaction.tx_date <= end_date)
    if source:
        base_q = base_q.where(PersonalTransaction.source == source)
    if project_id:
        base_q = base_q.where(PersonalTransaction.project_id == project_id)

    income_q = base_q.where(PersonalTransaction.tx_amount > 0)
    expense_q = base_q.where(PersonalTransaction.tx_amount < 0)

    income_result = (await db.execute(income_q)).one()
    expense_result = (await db.execute(expense_q)).one()

    public_q = base_q.where(PersonalTransaction.is_public == True, PersonalTransaction.tx_amount < 0)
    private_q = base_q.where(PersonalTransaction.is_public == False, PersonalTransaction.tx_amount < 0)

    public_result = (await db.execute(public_q)).one()
    private_result = (await db.execute(private_q)).one()

    by_source_q = select(
        PersonalTransaction.source,
        func.count().label("count"),
        func.sum(PersonalTransaction.tx_amount).label("total"),
    ).where(
        PersonalTransaction.is_deleted == False,
        PersonalTransaction.user_id == str(current_user.id),
    )
    if start_date:
        by_source_q = by_source_q.where(PersonalTransaction.tx_date >= start_date)
    if end_date:
        by_source_q = by_source_q.where(PersonalTransaction.tx_date <= end_date)
    by_source_q = by_source_q.group_by(PersonalTransaction.source)
    by_source_result = (await db.execute(by_source_q)).all()

    return {
        "income": {"count": income_result.count, "total": float(income_result.total_amount or 0)},
        "expense": {"count": expense_result.count, "total": float(expense_result.total_amount or 0)},
        "public_expense": {"count": public_result.count, "total": float(public_result.total_amount or 0)},
        "private_expense": {"count": private_result.count, "total": float(private_result.total_amount or 0)},
        "by_source": {r[0]: {"count": r[1], "total": float(r[2] or 0)} for r in by_source_result},
    }
