import logging
import time
from datetime import datetime

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class AgentEvent:
    __slots__ = ("db", "company_id", "user_id")

    def __init__(self, db: AsyncSession, company_id: str, user_id: str | None = None):
        self.db = db
        self.company_id = company_id
        self.user_id = user_id

    async def emit(
        self,
        event_type: str,
        entity_type: str | None = None,
        entity_id: str | None = None,
        data: dict | None = None,
        result: dict | None = None,
        duration_ms: int | None = None,
        session_id: str | None = None,
    ):
        from app.models.system.agent_models import AgentTask, AgentMemory

        payload = {
            "event_type": event_type,
            "company_id": self.company_id,
            "user_id": self.user_id,
            "session_id": session_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "data": data or {},
            "result": result or {},
            "duration_ms": duration_ms,
        }

        try:
            import json
            from sqlalchemy import text
            await self.db.execute(
                text("""
                    INSERT INTO agent_events (company_id, user_id, session_id, event_type, entity_type, entity_id, data, result, duration_ms)
                    VALUES (:company_id, :user_id, :session_id, :event_type, :entity_type, :entity_id, CAST(:data AS jsonb), CAST(:result AS jsonb), :duration_ms)
                """),
                {**payload, "data": json.dumps(payload["data"]), "result": json.dumps(payload["result"])},
            )
            await self.db.flush()
        except Exception as e:
            logger.warning("事件记录失败: %s", e)

    async def query_events(
        self,
        entity_type: str | None = None,
        entity_id: str | None = None,
        event_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        from sqlalchemy import text
        conditions = ["company_id = :cid"]
        params: dict = {"cid": self.company_id, "limit": limit, "offset": offset}
        if entity_type:
            conditions.append("entity_type = :et")
            params["et"] = entity_type
        if entity_id:
            conditions.append("entity_id = :eid")
            params["eid"] = entity_id
        if event_type:
            conditions.append("event_type = :evt")
            params["evt"] = event_type

        where = " AND ".join(conditions)
        rows = await self.db.execute(
            text(f"SELECT id, event_type, entity_type, entity_id, data, result, duration_ms, created_at, user_id FROM agent_events WHERE {where} ORDER BY created_at DESC LIMIT :limit OFFSET :offset"),
            params,
        )
        return [
            {
                "id": str(r[0]), "event_type": r[1], "entity_type": r[2],
                "entity_id": str(r[3]) if r[3] else None,
                "data": r[4], "result": r[5], "duration_ms": r[6],
                "created_at": str(r[7]), "user_id": str(r[8]) if r[8] else None,
            }
            for r in rows.fetchall()
        ]

    async def query_timeline(self, limit: int = 30) -> list[dict]:
        return await self.query_events(limit=limit)

    async def get_entity_timeline(self, entity_type: str, entity_id: str, limit: int = 50) -> list[dict]:
        return await self.query_events(entity_type=entity_type, entity_id=entity_id, limit=limit)


class TimedEvent:
    def __init__(self, bus: AgentEvent, event_type: str, **kwargs):
        self.bus = bus
        self.event_type = event_type
        self.kwargs = kwargs
        self.start = time.monotonic()

    async def complete(self, result: dict | None = None):
        elapsed = int((time.monotonic() - self.start) * 1000)
        await self.bus.emit(self.event_type, duration_ms=elapsed, result=result, **self.kwargs)

    async def fail(self, error: str):
        elapsed = int((time.monotonic() - self.start) * 1000)
        await self.bus.emit(self.event_type, duration_ms=elapsed, result={"error": error}, **self.kwargs)
