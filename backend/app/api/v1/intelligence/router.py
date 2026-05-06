import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.intelligence.models import AiFeedback, BusinessKnowledge, IntelligenceAlert
from app.models.organization import User
from app.services.knowledge_manager import knowledge_manager

router = APIRouter(prefix="/intelligence", tags=["智能引擎"])
logger = logging.getLogger(__name__)


@router.get("/knowledge")
async def list_knowledge(
    category: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(BusinessKnowledge).where(
        BusinessKnowledge.company_id == current_user.company_id,
        BusinessKnowledge.is_deleted == False,
    )
    if category:
        query = query.where(BusinessKnowledge.category == category)
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar()
    query = query.order_by(BusinessKnowledge.category, BusinessKnowledge.key).offset((page - 1) * page_size).limit(page_size)
    items = (await db.execute(query)).scalars().all()
    return {
        "items": [{
            "id": str(k.id), "category": k.category, "key": k.key, "value": k.value,
            "context": k.context, "confidence": k.confidence, "source": k.source,
            "is_active": k.is_active, "usage_count": k.usage_count,
            "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
            "created_at": k.created_at.isoformat() if k.created_at else None,
        } for k in items],
        "total": total, "page": page, "page_size": page_size,
    }


class KnowledgeCreate(BaseModel):
    category: str
    key: str
    value: str
    context: str | None = None
    confidence: float = 1.0


@router.post("/knowledge")
async def add_knowledge(
    body: KnowledgeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item = await knowledge_manager.add_knowledge(
        db, current_user.company_id, body.category, body.key, body.value,
        source="manual", confidence=body.confidence, context=body.context,
        user_id=str(current_user.id),
    )
    return {"id": str(item.id), "category": item.category, "key": item.key, "value": item.value}


class KnowledgeUpdate(BaseModel):
    value: str | None = None
    is_active: bool | None = None


@router.put("/knowledge/{kid}")
async def update_knowledge(
    kid: str,
    body: KnowledgeUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item = await knowledge_manager.update_knowledge(
        db, kid, value=body.value, is_active=body.is_active,
        verified_by=str(current_user.id),
    )
    if not item:
        raise HTTPException(status_code=404, detail="知识不存在")
    return {"id": str(item.id), "value": item.value, "is_active": item.is_active}


@router.post("/knowledge/seed")
async def seed_knowledge(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await knowledge_manager.seed_initial_knowledge(db, current_user.company_id)
    return result


@router.get("/knowledge/stats")
async def knowledge_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(BusinessKnowledge.category, func.count(BusinessKnowledge.id))
        .where(BusinessKnowledge.company_id == current_user.company_id, BusinessKnowledge.is_deleted == False)
        .group_by(BusinessKnowledge.category)
    )).all()
    total = sum(r[1] for r in rows)
    active = (await db.execute(
        select(func.count()).select_from(BusinessKnowledge).where(
            BusinessKnowledge.company_id == current_user.company_id,
            BusinessKnowledge.is_active == True, BusinessKnowledge.is_deleted == False,
        )
    )).scalar()
    return {
        "total": total, "active": active,
        "by_category": {r[0]: r[1] for r in rows},
    }


@router.get("/alerts")
async def list_alerts(
    status: str | None = None,
    severity: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(IntelligenceAlert).where(
        IntelligenceAlert.company_id == current_user.company_id,
        IntelligenceAlert.is_deleted == False,
    )
    if status:
        query = query.where(IntelligenceAlert.status == status)
    if severity:
        query = query.where(IntelligenceAlert.severity == severity)
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar()
    active_count = (await db.execute(
        select(func.count()).select_from(IntelligenceAlert).where(
            IntelligenceAlert.company_id == current_user.company_id,
            IntelligenceAlert.status == "active", IntelligenceAlert.is_deleted == False,
        )
    )).scalar()
    query = query.order_by(IntelligenceAlert.severity.desc(), IntelligenceAlert.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = (await db.execute(query)).scalars().all()
    return {
        "items": [{
            "id": str(a.id), "alert_type": a.alert_type, "severity": a.severity,
            "title": a.title, "message": a.message, "suggestion": a.suggestion,
            "entity_type": a.entity_type, "entity_id": str(a.entity_id) if a.entity_id else None,
            "module_a": a.module_a, "module_b": a.module_b,
            "data_snapshot": a.data_snapshot, "status": a.status,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        } for a in items],
        "total": total, "active_count": active_count, "page": page, "page_size": page_size,
    }


class AlertAction(BaseModel):
    status: str
    resolution_note: str | None = None


@router.put("/alerts/{aid}")
async def resolve_alert(
    aid: str,
    body: AlertAction,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(IntelligenceAlert).where(IntelligenceAlert.id == aid))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="预警不存在")
    alert.status = body.status
    alert.resolved_by = current_user.id
    alert.resolution_note = body.resolution_note
    from datetime import datetime
    alert.resolved_at = datetime.now()
    await db.flush()
    return {"id": str(alert.id), "status": alert.status}


@router.post("/alerts/scan")
async def scan_alerts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.intelligence_engine import intelligence_engine
    count = await intelligence_engine.run_all_rules(db, current_user.company_id)
    return {"new_alerts": count}


class FeedbackPayload(BaseModel):
    module: str
    feedback_type: str
    action: str
    suggested_value: str | None = None
    actual_value: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    context_snapshot: str | None = None
    user_comment: str | None = None


@router.post("/feedback")
async def submit_feedback(
    body: FeedbackPayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    feedback = AiFeedback(
        company_id=current_user.company_id,
        user_id=current_user.id,
        module=body.module,
        feedback_type=body.feedback_type,
        action=body.action,
        suggested_value=body.suggested_value,
        actual_value=body.actual_value,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        context_snapshot=body.context_snapshot,
        user_comment=body.user_comment,
    )
    db.add(feedback)
    await db.flush()
    learned = await knowledge_manager.learn_from_feedback(db, feedback)
    return {
        "id": str(feedback.id),
        "learned": learned is not None,
        "knowledge_id": str(learned.id) if learned else None,
    }


@router.post("/learn")
async def trigger_learning(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.learning_service import learning_service
    result = await learning_service.run_learning_cycle(db, current_user.company_id)
    return result


@router.get("/dashboard")
async def intelligence_dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cid = current_user.company_id

    active_alerts = (await db.execute(
        select(IntelligenceAlert.severity, func.count(IntelligenceAlert.id))
        .where(IntelligenceAlert.company_id == cid, IntelligenceAlert.status == "active", IntelligenceAlert.is_deleted == False)
        .group_by(IntelligenceAlert.severity)
    )).all()
    alert_summary = {r[0]: r[1] for r in active_alerts}

    knowledge_stats = (await db.execute(
        select(BusinessKnowledge.category, func.count(BusinessKnowledge.id))
        .where(BusinessKnowledge.company_id == cid, BusinessKnowledge.is_deleted == False, BusinessKnowledge.is_active == True)
        .group_by(BusinessKnowledge.category)
    )).all()

    feedback_count = (await db.execute(
        select(func.count(AiFeedback.id)).where(
            AiFeedback.company_id == cid, AiFeedback.is_deleted == False,
        )
    )).scalar() or 0

    acceptance_rate = 0.0
    if feedback_count > 0:
        accepted = (await db.execute(
            select(func.count(AiFeedback.id)).where(
                AiFeedback.company_id == cid, AiFeedback.action == "accepted",
            )
        )).scalar() or 0
        acceptance_rate = round(accepted / feedback_count * 100, 1)

    return {
        "alerts": alert_summary,
        "alerts_total": sum(alert_summary.values()),
        "knowledge": {r[0]: r[1] for r in knowledge_stats},
        "knowledge_total": sum(r[1] for r in knowledge_stats),
        "feedback_count": feedback_count,
        "acceptance_rate": acceptance_rate,
    }
