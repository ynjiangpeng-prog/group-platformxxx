import json
import logging
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.intelligence.models import AiFeedback, BusinessKnowledge

logger = logging.getLogger(__name__)


class LearningService:

    async def run_learning_cycle(self, db: AsyncSession, company_id: str) -> dict:
        results = {
            "feedback_processed": 0,
            "patterns_found": 0,
            "knowledge_updated": 0,
        }

        results["feedback_processed"] = await self._process_auto_link_feedback(db, company_id)
        patterns = await self._mine_supplier_patterns(db, company_id)
        results["patterns_found"] = len(patterns)
        station_patterns = await self._mine_station_patterns(db, company_id)
        results["patterns_found"] += len(station_patterns)

        return results

    async def _process_auto_link_feedback(self, db: AsyncSession, company_id: str) -> int:
        rows = (await db.execute(
            select(AiFeedback).where(
                AiFeedback.company_id == company_id,
                AiFeedback.module == "auto_link",
                AiFeedback.action.in_(["overridden", "corrected"]),
                AiFeedback.is_deleted == False,
            )
        )).scalars().all()

        pattern_map = {}
        for fb in rows:
            if not fb.suggested_value or not fb.actual_value:
                continue
            try:
                suggested = json.loads(fb.suggested_value)
                actual = json.loads(fb.actual_value)
            except (json.JSONDecodeError, TypeError):
                continue

            if fb.entity_type:
                key = f"auto_link_{fb.entity_type}"
                if key not in pattern_map:
                    pattern_map[key] = {"count": 0, "suggestions": [], "actuals": []}
                pattern_map[key]["count"] += 1
                pattern_map[key]["suggestions"].append(suggested)
                pattern_map[key]["actuals"].append(actual)

        learned = 0
        for key, data in pattern_map.items():
            if data["count"] < 2:
                continue
            existing = (await db.execute(
                select(BusinessKnowledge).where(
                    BusinessKnowledge.company_id == company_id,
                    BusinessKnowledge.key == key,
                    BusinessKnowledge.category == "pattern",
                    BusinessKnowledge.is_active == True,
                    BusinessKnowledge.is_deleted == False,
                )
            )).scalar_one_or_none()

            value = f"用户纠正auto_link {data['count']}次: AI建议={json.dumps(data['suggestions'][-1])}, 用户实际={json.dumps(data['actuals'][-1])}"
            if existing:
                existing.value = value
                existing.confidence = min(1.0, existing.confidence + 0.05)
                await db.flush()
            else:
                db.add(BusinessKnowledge(
                    company_id=company_id,
                    category="pattern",
                    key=key,
                    value=value,
                    source="mined",
                    confidence=0.6,
                    is_active=True,
                ))
                await db.flush()
            learned += 1
        return learned

    async def _mine_supplier_patterns(self, db: AsyncSession, company_id: str) -> list[dict]:
        try:
            from app.models.erp.models import Contract, PurchaseOrder
            from app.models.charging.models import GoodsReceipt
        except ImportError:
            return []

        patterns = []
        supplier_contracts = (await db.execute(
            select(Contract.supplier_id, func.count(Contract.id), func.coalesce(func.sum(Contract.total_amount), 0))
            .where(Contract.company_id == company_id, Contract.is_deleted == False, Contract.supplier_id != None)
            .group_by(Contract.supplier_id)
        )).all()

        for sid, cnt, total_amt in supplier_contracts[:20]:
            if not sid:
                continue
            key = f"supplier_pattern_{sid}"
            value = f"供应商合作{cnt}次, 合同总金额¥{float(total_amt):,.0f}"
            existing = (await db.execute(
                select(BusinessKnowledge).where(
                    BusinessKnowledge.company_id == company_id,
                    BusinessKnowledge.key == key,
                    BusinessKnowledge.is_deleted == False,
                )
            )).scalar_one_or_none()
            if existing:
                existing.value = value
                await db.flush()
            else:
                db.add(BusinessKnowledge(
                    company_id=company_id,
                    category="supplier_note",
                    key=key,
                    value=value,
                    source="mined",
                    confidence=0.7,
                    context=json.dumps({"supplier_id": str(sid), "contract_count": cnt, "total_amount": float(total_amt)}),
                    is_active=True,
                ))
                await db.flush()
            patterns.append({"supplier_id": str(sid), "contracts": cnt})

        return patterns

    async def _mine_station_patterns(self, db: AsyncSession, company_id: str) -> list[dict]:
        try:
            from app.models.charging.models import ChargingStation, StationFinancialMonthly
        except ImportError:
            return []

        patterns = []
        stations = (await db.execute(
            select(ChargingStation).where(
                ChargingStation.company_id == company_id, ChargingStation.is_deleted == False,
            )
        )).scalars().all()

        for station in stations:
            avg_monthly = (await db.execute(
                select(func.avg(StationFinancialMonthly.total_revenue))
                .where(StationFinancialMonthly.station_id == station.id)
            )).scalar()
            if avg_monthly and float(avg_monthly) > 0:
                key = f"station_pattern_{station.id}"
                value = f"{station.name} 月均营收¥{float(avg_monthly):,.0f}"
                existing = (await db.execute(
                    select(BusinessKnowledge).where(
                        BusinessKnowledge.company_id == company_id,
                        BusinessKnowledge.key == key,
                        BusinessKnowledge.is_deleted == False,
                    )
                )).scalar_one_or_none()
                if existing:
                    existing.value = value
                    await db.flush()
                else:
                    db.add(BusinessKnowledge(
                        company_id=company_id,
                        category="pattern",
                        key=key,
                        value=value,
                        source="mined",
                        confidence=0.8,
                        context=json.dumps({"station_id": str(station.id), "avg_monthly_revenue": float(avg_monthly)}),
                        is_active=True,
                    ))
                    await db.flush()
                patterns.append({"station_id": str(station.id), "avg_revenue": float(avg_monthly)})

        return patterns


learning_service = LearningService()
