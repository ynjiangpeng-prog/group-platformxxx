import json
import logging
import uuid

from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project.models import Project
from app.models.erp.models import Contract
from app.models.finance.models import Invoice
from app.models.charging.models import ChargingStation

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.8


async def auto_link_project(
    db: AsyncSession,
    company_id: str,
    target_type: str,
    data: dict,
    user_id: str | None = None,
) -> dict:
    project_id = data.get("project_id")
    if project_id:
        return {"project_id": project_id, "confidence": 1.0, "method": "direct"}

    contract_id = data.get("contract_id")
    if contract_id:
        r = await db.execute(select(Contract.project_id).where(Contract.id == contract_id))
        pid = r.scalar_one_or_none()
        if pid:
            return {"project_id": str(pid), "confidence": 0.95, "method": "contract"}

    invoice_id = data.get("invoice_id")
    if invoice_id:
        r = await db.execute(select(Invoice.project_id).where(Invoice.id == invoice_id))
        pid = r.scalar_one_or_none()
        if pid:
            return {"project_id": str(pid), "confidence": 0.95, "method": "invoice"}

    station_id = data.get("station_id")
    if station_id:
        r = await db.execute(select(ChargingStation.project_id).where(ChargingStation.id == station_id))
        pid = r.scalar_one_or_none()
        if pid:
            return {"project_id": str(pid), "confidence": 0.90, "method": "station"}

    supplier_id = data.get("supplier_id")
    if supplier_id:
        r = await db.execute(
            select(Contract.project_id).where(
                Contract.company_id == company_id,
                Contract.is_deleted == False,
                Contract.supplier_id == supplier_id,
                Contract.project_id.isnot(None),
            ).order_by(Contract.created_at.desc()).limit(1)
        )
        pid = r.scalar_one_or_none()
        if pid:
            return {"project_id": str(pid), "confidence": 0.7, "method": "supplier_recent"}

    counterparty = data.get("counterparty") or data.get("seller_name") or data.get("buyer_name") or ""
    description = data.get("description") or data.get("title") or data.get("remark") or ""
    search_text = f"{counterparty} {description}".strip()
    if search_text:
        r = await db.execute(
            select(Project.id, Project.name).where(
                Project.company_id == company_id,
                Project.is_deleted == False,
                or_(
                    Project.name.ilike(f"%{search_text[:20]}%"),
                    Project.address.ilike(f"%{search_text[:20]}%"),
                ),
            ).limit(3)
        )
        matches = r.all()
        if len(matches) == 1:
            return {"project_id": str(matches[0][0]), "confidence": 0.6, "method": "name_match",
                    "matched_project_name": matches[0][1]}

    return {"project_id": None, "confidence": 0, "method": "none"}


async def apply_auto_link(
    db: AsyncSession,
    company_id: str,
    target_type: str,
    target_id: str,
    data: dict,
    user_id: str | None = None,
):
    result = await auto_link_project(db, company_id, target_type, data, user_id)
    pid = result.get("project_id")

    if pid and result["confidence"] >= CONFIDENCE_THRESHOLD:
        return result

    if pid and result["confidence"] < CONFIDENCE_THRESHOLD:
        await _create_linkage_notification(db, company_id, user_id, target_type, target_id, result)
        return result

    if not pid:
        await _create_linkage_notification(db, company_id, user_id, target_type, target_id, result)

    return result


async def _create_linkage_notification(
    db: AsyncSession,
    company_id: str,
    user_id: str | None,
    target_type: str,
    target_id: str,
    link_result: dict,
):
    from app.models.system.notification import Notification

    type_labels = {
        "invoice": "发票", "ar_ap": "应收应付", "bank_transaction": "银行流水",
        "charging_order": "充电订单", "expense": "日常报销", "petty_cash": "备用金支出",
        "trip": "差旅", "contract": "合同", "purchase_order": "采购订单",
    }
    label = type_labels.get(target_type, target_type)

    summary = ""
    try:
        if target_type == "ar_ap":
            from app.models.finance.models import ArApRecord
            r = await db.execute(select(ArApRecord).where(ArApRecord.id == target_id))
            obj = r.scalar_one_or_none()
            if obj:
                t = "应收" if obj.type == "ar" else "应付"
                summary = f"{t} | {obj.counterparty or '-'} | ¥{float(obj.total_amount or 0):,.2f}"
                if obj.remark:
                    summary += f" | {obj.remark[:30]}"
        elif target_type == "invoice":
            from app.models.finance.models import Invoice
            r = await db.execute(select(Invoice).where(Invoice.id == target_id))
            obj = r.scalar_one_or_none()
            if obj:
                summary = f"{obj.seller_name or '-'} → {obj.buyer_name or '-'} | ¥{float(obj.total_amount or 0):,.2f}"
        elif target_type == "contract":
            from app.models.erp.models import Contract
            r = await db.execute(select(Contract).where(Contract.id == target_id))
            obj = r.scalar_one_or_none()
            if obj:
                cp = getattr(obj, 'counterparty', None) or obj.party_a or obj.party_b or "-"
                summary = f"{obj.name[:40]} | {cp} | ¥{float(obj.total_amount or 0):,.2f}"
        elif target_type == "bank_transaction":
            from app.models.project.models import BankTransaction
            r = await db.execute(select(BankTransaction).where(BankTransaction.id == target_id))
            obj = r.scalar_one_or_none()
            if obj:
                summary = f"{getattr(obj, 'counterparty', '-') or '-'} | ¥{float(getattr(obj, 'amount', 0) or 0):,.2f}"
        elif target_type == "charging_order":
            from app.models.charging.models import ChargingOrder
            r = await db.execute(select(ChargingOrder).where(ChargingOrder.id == target_id))
            obj = r.scalar_one_or_none()
            if obj:
                summary = f"{obj.station_name or '-'} | ¥{float(obj.total_amount or 0):,.2f}"
        elif target_type == "expense":
            from app.models.business.models import DailyExpense
            r = await db.execute(select(DailyExpense).where(DailyExpense.id == target_id))
            obj = r.scalar_one_or_none()
            if obj:
                summary = f"{obj.category or '-'} | ¥{float(obj.amount or 0):,.2f} | {(obj.description or '')[:30]}"
    except Exception as e:
        logger.warning(f"Failed to build linkage summary: {e}")

    content = json.dumps({
        "target_type": target_type,
        "target_id": target_id,
        "suggested_project_id": link_result.get("project_id"),
        "confidence": link_result.get("confidence", 0),
        "method": link_result.get("method", ""),
        "matched_project_name": link_result.get("matched_project_name", ""),
        "summary": summary,
    }, ensure_ascii=False)

    notif = Notification(
        id=uuid.uuid4(),
        company_id=uuid.UUID(company_id) if isinstance(company_id, str) else company_id,
        user_id=uuid.UUID(user_id or "00000000-0000-0000-0000-000000000010"),
        category="linkage",
        title=f"待确认关联：{label}",
        content=content,
        is_read=False,
    )
    db.add(notif)
    logger.info(f"[auto_link] created linkage notification: {target_type} {target_id} → project={link_result.get('project_id')} conf={link_result.get('confidence')}")
