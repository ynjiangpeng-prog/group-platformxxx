"""业务事件采集器

统一收集所有模块的业务变更事件，写入biz_events表。
同时自动提取/更新biz_entities和biz_relations。
"""

import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business.models import BizEvent, BizEntity, BizRelation

logger = logging.getLogger(__name__)


class EventCollector:
    """业务事件采集器"""

    async def emit_event(
        self,
        db: AsyncSession,
        company_id: str,
        user_id: str,
        event_type: str,
        source_module: str,
        source_id: str | None = None,
        event_data: dict | None = None,
        amount: float | None = None,
        entity_ids: list[str] | None = None,
        event_date: datetime | None = None,
    ) -> BizEvent:
        """发送一个业务事件"""
        event = BizEvent(
            company_id=company_id,
            created_by=user_id,
            event_type=event_type,
            source_module=source_module,
            source_id=source_id,
            event_data=event_data or {},
            event_date=event_date or datetime.now(),
            amount=amount,
            entity_ids=entity_ids,
        )
        db.add(event)
        await db.flush()
        await db.refresh(event)

        # 自动提取实体（如果event_data中有实体信息）
        if event_data:
            await self._extract_entities(db, company_id, user_id, event_type, event_data)

        return event

    async def replay_events(
        self,
        db: AsyncSession,
        company_id: str,
        start_date: datetime,
        end_date: datetime,
    ) -> list[dict]:
        """回放指定时间段的业务事件"""
        events = (await db.execute(
            select(BizEvent).where(
                BizEvent.company_id == company_id,
                BizEvent.is_deleted == False,
                BizEvent.event_date >= start_date,
                BizEvent.event_date <= end_date,
            ).order_by(BizEvent.event_date.asc())
        )).scalars().all()

        results = []
        for e in events:
            results.append({
                "id": str(e.id),
                "event_type": e.event_type,
                "source_module": e.source_module,
                "event_data": e.event_data,
                "event_date": e.event_date.isoformat() if e.event_date else None,
                "amount": float(e.amount) if e.amount else None,
            })

        return results

    async def query_events(
        self,
        db: AsyncSession,
        company_id: str,
        event_type: str | None = None,
        source_module: str | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[dict], int]:
        """查询事件流"""
        from sqlalchemy import func as sa_func

        base = select(BizEvent).where(
            BizEvent.company_id == company_id,
            BizEvent.is_deleted == False,
        )
        count_base = select(sa_func.count(BizEvent.id)).where(
            BizEvent.company_id == company_id,
            BizEvent.is_deleted == False,
        )

        if event_type:
            base = base.where(BizEvent.event_type == event_type)
            count_base = count_base.where(BizEvent.event_type == event_type)
        if source_module:
            base = base.where(BizEvent.source_module == source_module)
            count_base = count_base.where(BizEvent.source_module == source_module)
        if start_date:
            base = base.where(BizEvent.event_date >= start_date)
            count_base = count_base.where(BizEvent.event_date >= start_date)
        if end_date:
            base = base.where(BizEvent.event_date <= end_date)
            count_base = count_base.where(BizEvent.event_date <= end_date)

        total = (await db.execute(count_base)).scalar() or 0
        rows = (await db.execute(
            base.order_by(BizEvent.event_date.desc()).limit(limit).offset(offset)
        )).scalars().all()

        items = []
        for e in rows:
            items.append({
                "id": str(e.id),
                "event_type": e.event_type,
                "source_module": e.source_module,
                "source_id": e.source_id,
                "event_data": e.event_data,
                "event_date": e.event_date.isoformat() if e.event_date else None,
                "amount": float(e.amount) if e.amount else None,
                "entity_ids": e.entity_ids,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            })

        return items, total

    async def query_entities(
        self,
        db: AsyncSession,
        company_id: str,
        entity_type: str | None = None,
        search: str | None = None,
        limit: int = 50,
    ) -> list[dict]:
        """查询业务实体"""
        stmt = select(BizEntity).where(
            BizEntity.company_id == company_id,
            BizEntity.is_deleted == False,
        )
        if entity_type:
            stmt = stmt.where(BizEntity.entity_type == entity_type)
        if search:
            stmt = stmt.where(BizEntity.entity_name.ilike(f"%{search}%"))

        rows = (await db.execute(
            stmt.order_by(BizEntity.created_at.desc()).limit(limit)
        )).scalars().all()

        return [
            {
                "id": str(e.id),
                "entity_type": e.entity_type,
                "entity_name": e.entity_name,
                "source_id": e.source_id,
                "properties": e.properties,
                "status": e.status,
                "tags": e.tags,
            }
            for e in rows
        ]

    async def query_relations(
        self,
        db: AsyncSession,
        company_id: str,
        entity_id: str | None = None,
        relation_type: str | None = None,
        limit: int = 50,
    ) -> list[dict]:
        """查询实体关系"""
        stmt = select(BizRelation).where(
            BizRelation.company_id == company_id,
            BizRelation.is_deleted == False,
        )
        if entity_id:
            stmt = stmt.where(
                (BizRelation.source_entity_id == entity_id) |
                (BizRelation.target_entity_id == entity_id)
            )
        if relation_type:
            stmt = stmt.where(BizRelation.relation_type == relation_type)

        rows = (await db.execute(stmt.order_by(BizRelation.created_at.desc()).limit(limit))).scalars().all()

        return [
            {
                "id": str(r.id),
                "source_entity_id": str(r.source_entity_id),
                "target_entity_id": str(r.target_entity_id),
                "relation_type": r.relation_type,
                "properties": r.properties,
                "confidence": r.confidence,
            }
            for r in rows
        ]

    async def _extract_entities(
        self,
        db: AsyncSession,
        company_id: str,
        user_id: str,
        event_type: str,
        event_data: dict,
    ):
        """从事件数据中自动提取实体（简单规则匹配，不调LLM）"""
        # 根据事件类型提取关键实体
        entity_map = {
            "contract_signed": ("contract", "contract_name"),
            "project_created": ("project", "project_name"),
            "payment_made": ("supplier", "supplier_name"),
            "invoice_received": ("supplier", "supplier_name"),
            "charging_order": ("station", "station_name"),
        }

        extract_info = entity_map.get(event_type)
        if not extract_info:
            return

        entity_type, name_key = extract_info
        entity_name = event_data.get(name_key)
        if not entity_name:
            return

        source_id = event_data.get("id") or event_data.get(f"{entity_type}_id")

        # 检查是否已存在
        existing = (await db.execute(
            select(BizEntity).where(
                BizEntity.company_id == company_id,
                BizEntity.entity_type == entity_type,
                BizEntity.entity_name == entity_name,
                BizEntity.is_deleted == False,
            )
        )).scalar_one_or_none()

        if existing:
            # 更新属性
            if existing.properties:
                existing.properties.update(event_data)
            else:
                existing.properties = event_data
        else:
            entity = BizEntity(
                company_id=company_id,
                created_by=user_id,
                entity_type=entity_type,
                entity_name=entity_name,
                source_id=str(source_id) if source_id else None,
                properties=event_data,
                status="active",
            )
            db.add(entity)
        await db.flush()


# 全局单例
event_collector = EventCollector()
