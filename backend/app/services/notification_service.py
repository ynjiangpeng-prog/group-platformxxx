import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.system.notification import Notification


async def send_notification(
    db: AsyncSession,
    company_id: str,
    user_id: str,
    category: str,
    title: str,
    content: str | None = None,
    link: str | None = None,
    created_by: str | None = None,
):
    n = Notification(
        id=uuid.uuid4(),
        company_id=uuid.UUID(company_id) if isinstance(company_id, str) else company_id,
        user_id=uuid.UUID(user_id) if isinstance(user_id, str) else user_id,
        category=category,
        title=title,
        content=content,
        link=link,
        created_by=uuid.UUID(created_by) if isinstance(created_by, str) else created_by,
    )
    db.add(n)


async def broadcast_notification(
    db: AsyncSession,
    company_id: str,
    user_ids: list[str],
    category: str,
    title: str,
    content: str | None = None,
    link: str | None = None,
    created_by: str | None = None,
):
    for uid in user_ids:
        await send_notification(db, company_id, uid, category, title, content, link, created_by)
