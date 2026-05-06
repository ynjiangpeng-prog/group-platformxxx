import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.models.project import CrmReminder
from app.core.security_utils import safe_update

router = APIRouter(prefix="/crm", tags=["CRM提醒"])


class ReminderCreate(BaseModel):
    lead_id: str | None = None
    customer_name: str | None = None
    reminder_type: str = Field(..., max_length=50)
    remind_at: datetime
    content: str | None = None
    assignee_id: str | None = None


class ReminderUpdate(BaseModel):
    lead_id: str | None = None
    customer_name: str | None = None
    reminder_type: str | None = None
    remind_at: datetime | None = None
    content: str | None = None
    status: str | None = None
    assignee_id: str | None = None


@router.get("/reminders")
async def list_reminders(
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(CrmReminder).where(
        CrmReminder.is_deleted == False,
        CrmReminder.company_id == current_user.company_id,
        CrmReminder.assignee_id == current_user.id,
    )
    if status:
        query = query.where(CrmReminder.status == status)
    else:
        query = query.where(CrmReminder.status == "pending")
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar()
    query = query.order_by(CrmReminder.remind_at.asc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    rows = result.scalars().all()
    items = [
        {
            "id": str(r.id), "lead_id": str(r.lead_id) if r.lead_id else None,
            "customer_name": r.customer_name, "reminder_type": r.reminder_type,
            "remind_at": str(r.remind_at) if r.remind_at else None,
            "content": r.content, "status": r.status,
            "assignee_id": str(r.assignee_id) if r.assignee_id else None,
        }
        for r in rows
    ]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/reminders")
async def create_reminder(
    body: ReminderCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = CrmReminder(
        **body.model_dump(),
        company_id=current_user.company_id,
        created_by=current_user.id,
        assignee_id=body.assignee_id or current_user.id,
    )
    db.add(r)
    await db.flush()
    return {"id": str(r.id)}


@router.put("/reminders/{reminder_id}")
async def update_reminder(
    reminder_id: str,
    body: ReminderUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = (await db.execute(
        select(CrmReminder).where(
            CrmReminder.id == reminder_id,
            CrmReminder.is_deleted == False,
            CrmReminder.company_id == current_user.company_id,
        )
    )).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "提醒不存在")
    safe_update(r, body)
    r.updated_by = current_user.id
    await db.flush()
    return {"id": str(r.id)}


@router.delete("/reminders/{reminder_id}")
async def delete_reminder(
    reminder_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(CrmReminder).where(
            CrmReminder.id == reminder_id,
            CrmReminder.company_id == current_user.company_id,
        ).values(is_deleted=True)
    )
    return {"message": "删除成功"}
