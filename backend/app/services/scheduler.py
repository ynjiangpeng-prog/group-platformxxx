import asyncio
import logging
from datetime import datetime, date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.models.organization import Company

logger = logging.getLogger(__name__)


class Scheduler:
    def __init__(self):
        self._running = False
        self._last_daily: date | None = None
        self._last_weekly: date | None = None

    async def start(self):
        if self._running:
            return
        self._running = True
        asyncio.create_task(self._loop())
        logger.info("Scheduler started")

    async def _loop(self):
        await self._run_if_due()
        while self._running:
            await asyncio.sleep(300)
            await self._run_if_due()

    async def _run_if_due(self):
        now = datetime.now()
        today = now.date()

        if now.hour >= 8 and self._last_daily != today:
            try:
                await self._run_daily()
                self._last_daily = today
            except Exception as e:
                logger.exception("Scheduler daily error: %s", e)

        if now.weekday() == 0 and now.hour >= 9 and (self._last_weekly is None or (today - self._last_weekly).days >= 7):
            try:
                await self._run_weekly()
                self._last_weekly = today
            except Exception as e:
                logger.exception("Scheduler weekly error: %s", e)

    async def _run_daily(self):
        logger.info("Running daily tasks...")
        async with async_session_factory() as db:
            companies = (await db.execute(
                select(Company).where(Company.is_deleted == False)
            )).scalars().all()

            for company in companies:
                cid = str(company.id)
                try:
                    from app.services.intelligence_engine import intelligence_engine
                    await intelligence_engine.run_all_rules(db, cid)

                    from app.services.finance_event_chain import finance_event_chain
                    await finance_event_chain.on_bank_import(db, cid)
                    
                    # 甩手掌柜：自动触发扫描
                    from app.services.auto_trigger import auto_trigger
                    triggered = await auto_trigger.scan_and_trigger(db, cid)
                    if triggered > 0:
                        logger.info("Auto trigger: %d actions for company %s", triggered, cid)

                    await db.commit()
                    logger.info("Daily tasks completed for company %s", cid)
                except Exception as e:
                    logger.exception("Daily tasks failed for company %s: %s", cid, e)
                    await db.rollback()

    async def _run_weekly(self):
        logger.info("Running weekly learning cycle...")
        async with async_session_factory() as db:
            companies = (await db.execute(
                select(Company).where(Company.is_deleted == False)
            )).scalars().all()

            for company in companies:
                cid = str(company.id)
                try:
                    from app.services.learning_service import learning_service
                    result = await learning_service.run_learning_cycle(db, cid)
                    await db.commit()
                    logger.info("Weekly learning for %s: %s", cid, result)
                except Exception as e:
                    logger.exception("Weekly learning failed for %s: %s", cid, e)
                    await db.rollback()

    def stop(self):
        self._running = False


scheduler = Scheduler()
