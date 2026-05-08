"""业务指标聚合器

定时聚合biz_events中的数据，写入biz_metrics。
指标：收入、成本、净利润、合同数、项目数、回款率、充电收入、充电量。
"""

import logging
from datetime import datetime, date, timedelta
from decimal import Decimal

from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business.models import BizEvent, BizMetric

logger = logging.getLogger(__name__)

# 事件类型到金额汇总的映射
REVENUE_EVENTS = {"contract_signed", "payment_received", "charging_order"}
COST_EVENTS = {"payment_made", "invoice_received", "expense_recorded"}
CONTRACT_EVENTS = {"contract_signed", "contract_created"}
PROJECT_EVENTS = {"project_created", "project_started"}


class MetricAggregator:
    """业务指标聚合器"""

    async def aggregate_daily(
        self,
        db: AsyncSession,
        company_id: str,
        target_date: date,
        user_id: str = "system",
    ) -> list[BizMetric]:
        """聚合当日指标"""
        start = datetime.combine(target_date, datetime.min.time())
        end = datetime.combine(target_date, datetime.max.time())
        period = target_date.strftime("%Y-%m-%d")

        events = (await db.execute(
            select(BizEvent).where(
                BizEvent.company_id == company_id,
                BizEvent.is_deleted == False,
                BizEvent.event_date >= start,
                BizEvent.event_date <= end,
            )
        )).scalars().all()

        metrics = []

        # 收入
        revenue = self._sum_amount(events, REVENUE_EVENTS)
        metrics.append(await self._upsert_metric(
            db, company_id, user_id, "revenue", period, "daily", revenue,
        ))

        # 成本
        cost = self._sum_amount(events, COST_EVENTS)
        metrics.append(await self._upsert_metric(
            db, company_id, user_id, "cost", period, "daily", cost,
        ))

        # 净利润
        net = revenue - cost
        metrics.append(await self._upsert_metric(
            db, company_id, user_id, "net_profit", period, "daily", net,
        ))

        # 合同数
        contract_count = sum(1 for e in events if e.event_type in CONTRACT_EVENTS)
        metrics.append(await self._upsert_metric(
            db, company_id, user_id, "contract_count", period, "daily",
            float(contract_count),
        ))

        # 项目数
        project_count = sum(1 for e in events if e.event_type in PROJECT_EVENTS)
        metrics.append(await self._upsert_metric(
            db, company_id, user_id, "project_count", period, "daily",
            float(project_count),
        ))

        # 充电收入
        charging_revenue = self._sum_amount(events, {"charging_order"})
        metrics.append(await self._upsert_metric(
            db, company_id, user_id, "charging_revenue", period, "daily", charging_revenue,
        ))

        await db.flush()
        return metrics

    async def aggregate_monthly(
        self,
        db: AsyncSession,
        company_id: str,
        year: int,
        month: int,
        user_id: str = "system",
    ) -> list[BizMetric]:
        """聚合当月指标"""
        period = f"{year}-{month:02d}"

        # 汇总该月的daily指标
        daily_metrics = (await db.execute(
            select(BizMetric).where(
                BizMetric.company_id == company_id,
                BizMetric.is_deleted == False,
                BizMetric.period_type == "daily",
                BizMetric.period.like(f"{period}%"),
            )
        )).scalars().all()

        # 按metric_type分组求和
        grouped: dict[str, float] = {}
        for m in daily_metrics:
            val = float(m.value) if m.value else 0
            grouped[m.metric_type] = grouped.get(m.metric_type, 0) + val

        metrics = []
        for metric_type, total in grouped.items():
            metrics.append(await self._upsert_metric(
                db, company_id, user_id, metric_type, period, "monthly", total,
            ))

        # 计算回款率
        revenue = grouped.get("revenue", 0)
        cost = grouped.get("cost", 0)
        if cost > 0:
            payment_rate = min(1.0, revenue / cost)
            metrics.append(await self._upsert_metric(
                db, company_id, user_id, "payment_rate", period, "monthly",
                payment_rate, {"ratio_of": "revenue/cost"},
            ))

        await db.flush()
        return metrics

    async def query_metrics(
        self,
        db: AsyncSession,
        company_id: str,
        metric_type: str | None = None,
        period_type: str | None = None,
        period: str | None = None,
        limit: int = 100,
    ) -> list[dict]:
        """查询聚合指标"""
        stmt = select(BizMetric).where(
            BizMetric.company_id == company_id,
            BizMetric.is_deleted == False,
        )
        if metric_type:
            stmt = stmt.where(BizMetric.metric_type == metric_type)
        if period_type:
            stmt = stmt.where(BizMetric.period_type == period_type)
        if period:
            stmt = stmt.where(BizMetric.period.like(f"{period}%"))

        rows = (await db.execute(
            stmt.order_by(BizMetric.period.desc()).limit(limit)
        )).scalars().all()

        return [
            {
                "id": str(m.id),
                "metric_type": m.metric_type,
                "period": m.period,
                "period_type": m.period_type,
                "value": float(m.value) if m.value else 0,
                "dimensions": m.dimensions,
            }
            for m in rows
        ]

    async def get_timeline(
        self,
        db: AsyncSession,
        company_id: str,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        event_types: list[str] | None = None,
        limit: int = 50,
    ) -> list[dict]:
        """时间轴视图 — 关键业务事件按时间排列"""
        stmt = select(BizEvent).where(
            BizEvent.company_id == company_id,
            BizEvent.is_deleted == False,
        )
        if start_date:
            stmt = stmt.where(BizEvent.event_date >= start_date)
        if end_date:
            stmt = stmt.where(BizEvent.event_date <= end_date)
        if event_types:
            stmt = stmt.where(BizEvent.event_type.in_(event_types))

        # 关键事件类型优先，金额大的优先
        key_events = {
            "contract_signed", "project_started", "payment_made",
            "payment_received", "charging_order",
        }
        rows = (await db.execute(
            stmt.order_by(BizEvent.event_date.desc()).limit(limit)
        )).scalars().all()

        # 标记重要程度
        results = []
        for e in rows:
            importance = "high" if e.event_type in key_events else "normal"
            if e.amount and float(e.amount) >= 100000:
                importance = "high"
            elif e.amount and float(e.amount) >= 10000:
                importance = "medium"

            results.append({
                "id": str(e.id),
                "event_type": e.event_type,
                "source_module": e.source_module,
                "event_data": e.event_data,
                "event_date": e.event_date.isoformat() if e.event_date else None,
                "amount": float(e.amount) if e.amount else None,
                "importance": importance,
            })

        return results

    def _sum_amount(self, events: list[BizEvent], types: set[str]) -> float:
        """汇总指定类型事件的金额"""
        total = Decimal("0")
        for e in events:
            if e.event_type in types and e.amount:
                total += e.amount if isinstance(e.amount, Decimal) else Decimal(str(e.amount))
        return float(total)

    async def _upsert_metric(
        self,
        db: AsyncSession,
        company_id: str,
        user_id: str,
        metric_type: str,
        period: str,
        period_type: str,
        value: float,
        dimensions: dict | None = None,
    ) -> BizMetric:
        """创建或更新指标"""
        existing = (await db.execute(
            select(BizMetric).where(
                BizMetric.company_id == company_id,
                BizMetric.metric_type == metric_type,
                BizMetric.period == period,
                BizMetric.period_type == period_type,
                BizMetric.is_deleted == False,
            )
        )).scalar_one_or_none()

        if existing:
            existing.value = value
            if dimensions:
                existing.dimensions = dimensions
            return existing

        metric = BizMetric(
            company_id=company_id,
            created_by=user_id,
            metric_type=metric_type,
            period=period,
            period_type=period_type,
            value=value,
            dimensions=dimensions,
        )
        db.add(metric)
        return metric


# 全局单例
metric_aggregator = MetricAggregator()
