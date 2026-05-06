"""
Autopilot Dashboard Service - 公司自动驾驶仪表盘数据聚合
从现有92张表提取关键经营指标，为老板提供一站式决策视图
"""
import logging
from app.core.cache import cached
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select, text, and_, or_, case
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class AutopilotDashboard:
    """公司经营自动驾驶仪表盘"""

    async def get_full_dashboard(self, db: AsyncSession, company_id: str) -> dict:
        """获取完整仪表盘数据 - 老板一屏看全公司"""
        today = date.today()
        this_month_start = today.replace(day=1)
        last_month_start = (this_month_start - timedelta(days=1)).replace(day=1)

        cash_flow = await self._get_cash_flow(db, company_id)
        charging_today = await self._get_charging_summary(db, company_id, today, today)
        charging_month = await self._get_charging_summary(db, company_id, this_month_start, today)
        projects_status = await self._get_projects_status(db, company_id)
        arap_summary = await self._get_arap_summary(db, company_id)
        inventory_alerts = await self._get_inventory_status(db, company_id)
        upcoming_events = await self._get_upcoming_events(db, company_id, today)
        station_health = await self._get_station_health(db, company_id)
        quick_metrics = await self._get_quick_metrics(db, company_id, today, this_month_start, last_month_start)

        return {
            "generated_at": datetime.now().isoformat(),
            "company_status": self._compute_company_status(quick_metrics, arap_summary, projects_status),
            "quick_metrics": quick_metrics,
            "cash_flow": cash_flow,
            "charging": {
                "today": charging_today,
                "this_month": charging_month,
            },
            "projects": projects_status,
            "finance": {"arap": arap_summary},
            "inventory": inventory_alerts,
            "stations": station_health,
            "upcoming": upcoming_events,
        }

    def _compute_company_status(self, metrics: dict, arap: dict, projects: dict) -> str:
        warnings = []
        if arap.get("overdue_receivable", 0) > 100000:
            warnings.append("应收逾期")
        if metrics.get("cash_balance", 0) < 50000:
            warnings.append("现金流紧张")
        delayed = projects.get("delayed_count", 0)
        if delayed > 0:
            warnings.append(f"{delayed}个项目延期")
        if not warnings:
            return "green"
        return "yellow"

    async def _get_quick_metrics(self, db: AsyncSession, company_id: str,
                                  today: date, this_month: date, last_month: date) -> dict:
        # 今日收支
        result = await db.execute(text("""
            SELECT
                COALESCE(SUM(CASE WHEN tx_amount > 0 THEN tx_amount ELSE 0 END), 0) as income,
                COALESCE(SUM(CASE WHEN tx_amount < 0 THEN ABS(tx_amount) ELSE 0 END), 0) as expense
            FROM bank_transactions
            WHERE is_deleted = false AND company_id = :cid AND tx_date = :today
        """), {"cid": company_id, "today": today})
        row = result.fetchone()
        today_income = float(row[0]) if row else 0
        today_expense = float(row[1]) if row else 0

        # 本月收支
        result = await db.execute(text("""
            SELECT
                COALESCE(SUM(CASE WHEN tx_amount > 0 THEN tx_amount ELSE 0 END), 0) as income,
                COALESCE(SUM(CASE WHEN tx_amount < 0 THEN ABS(tx_amount) ELSE 0 END), 0) as expense
            FROM bank_transactions
            WHERE is_deleted = false AND company_id = :cid AND tx_date >= :start
        """), {"cid": company_id, "start": this_month})
        row = result.fetchone()
        month_income = float(row[0]) if row else 0
        month_expense = float(row[1]) if row else 0

        # 上月同期对比
        this_month_days = (today - this_month).days + 1
        last_month_end = min(last_month + timedelta(days=this_month_days - 1),
                             (this_month - timedelta(days=1)))
        result = await db.execute(text("""
            SELECT
                COALESCE(SUM(CASE WHEN tx_amount > 0 THEN tx_amount ELSE 0 END), 0) as income,
                COALESCE(SUM(CASE WHEN tx_amount < 0 THEN ABS(tx_amount) ELSE 0 END), 0) as expense
            FROM bank_transactions
            WHERE is_deleted = false AND company_id = :cid AND tx_date >= :start AND tx_date <= :end
        """), {"cid": company_id, "start": last_month, "end": last_month_end})
        row = result.fetchone()
        last_income = float(row[0]) if row else 0
        last_expense = float(row[1]) if row else 0

        # 现金余额
        result = await db.execute(text("""
            SELECT
                COALESCE(SUM(CASE WHEN tx_amount > 0 THEN tx_amount ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN tx_amount < 0 THEN ABS(tx_amount) ELSE 0 END), 0) as balance
            FROM bank_transactions
            WHERE is_deleted = false AND company_id = :cid
        """), {"cid": company_id})
        row = result.fetchone()
        cash_balance = float(row[0]) if row else 0

        def pct_change(current, previous):
            if previous == 0:
                return 0
            return round((current - previous) / previous * 100, 1)

        return {
            "today_income": today_income,
            "today_expense": today_expense,
            "today_net": today_income - today_expense,
            "month_income": month_income,
            "month_expense": month_expense,
            "month_profit": month_income - month_expense,
            "income_change_pct": pct_change(month_income, last_income),
            "expense_change_pct": pct_change(month_expense, last_expense),
            "cash_balance": cash_balance,
        }

    async def _get_cash_flow(self, db: AsyncSession, company_id: str) -> dict:
        result = await db.execute(text("""
            SELECT
                tx_date,
                SUM(CASE WHEN tx_amount > 0 THEN tx_amount ELSE 0 END) as income,
                SUM(CASE WHEN tx_amount < 0 THEN ABS(tx_amount) ELSE 0 END) as expense
            FROM bank_transactions
            WHERE is_deleted = false AND company_id = :cid
                AND tx_date >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY tx_date
            ORDER BY tx_date DESC
        """), {"cid": company_id})
        rows = result.fetchall()
        return {
            "daily": [
                {
                    "date": r[0].isoformat() if r[0] else None,
                    "income": float(r[1]),
                    "expense": float(r[2]),
                    "net": float(r[1]) - float(r[2]),
                }
                for r in rows
            ]
        }

    async def _get_charging_summary(self, db: AsyncSession, company_id: str,
                                     start: date, end: date) -> dict:
        result = await db.execute(text("""
            SELECT
                COUNT(*) as orders,
                COALESCE(SUM(charging_kwh), 0) as kwh,
                COALESCE(SUM(total_amount), 0) as revenue,
                COALESCE(AVG(total_amount / NULLIF(charging_kwh, 0)), 0) as avg_price
            FROM charging_orders
            WHERE is_deleted = false AND company_id = :cid
                AND start_time::date >= :start AND start_time::date <= :end
        """), {"cid": company_id, "start": start, "end": end})
        row = result.fetchone()
        return {
            "orders": row[0] if row else 0,
            "kwh": round(float(row[1]), 2) if row else 0,
            "revenue": round(float(row[2]), 2) if row else 0,
            "avg_price": round(float(row[3]), 4) if row else 0,
        }

    async def _get_projects_status(self, db: AsyncSession, company_id: str) -> dict:
        result = await db.execute(text("""
            SELECT status, COUNT(*) as cnt,
                COALESCE(SUM(actual_cost), 0) as cost,
                COALESCE(SUM(total_budget), 0) as budget
            FROM projects
            WHERE is_deleted = false AND company_id = :cid
            GROUP BY status
        """), {"cid": company_id})
        rows = result.fetchall()
        status_map = {}
        total_budget = 0
        total_cost = 0
        for r in rows:
            status_map[r[0]] = {"count": r[1], "cost": float(r[2]), "budget": float(r[3])}
            total_budget += float(r[3])
            total_cost += float(r[2])

        # 即将到期的里程碑
        result = await db.execute(text("""
            SELECT p.name, m.name, m.planned_date
            FROM project_milestones m
            JOIN projects p ON p.id = m.project_id
            WHERE p.is_deleted = false AND p.company_id = :cid
                AND m.planned_date >= CURRENT_DATE
                AND m.planned_date <= CURRENT_DATE + INTERVAL '7 days'
                AND m.status != 'completed'
            ORDER BY m.planned_date LIMIT 5
        """), {"cid": company_id})
        upcoming_milestones = [
            {"project": r[0], "milestone": r[1], "date": r[2].isoformat() if r[2] else None}
            for r in result.fetchall()
        ]

        # 延期项目
        result = await db.execute(text("""
            SELECT COUNT(*) FROM projects
            WHERE is_deleted = false AND company_id = :cid
                AND status = 'in_progress' AND end_date < CURRENT_DATE
        """), {"cid": company_id})
        delayed_count = result.scalar()

        return {
            "by_status": status_map,
            "total_budget": total_budget,
            "total_cost": total_cost,
            "budget_usage_pct": round(total_cost / total_budget * 100, 1) if total_budget > 0 else 0,
            "delayed_count": delayed_count,
            "upcoming_milestones": upcoming_milestones,
        }

    async def _get_arap_summary(self, db: AsyncSession, company_id: str) -> dict:
        result = await db.execute(text("""
            SELECT type,
                COUNT(*) as cnt,
                COALESCE(SUM(total_amount), 0) as total,
                COALESCE(SUM(settled_amount), 0) as paid,
                COALESCE(SUM(remaining_amount), 0) as remaining,
                COUNT(CASE WHEN overdue_days > 0 THEN 1 END) as overdue_cnt,
                COALESCE(SUM(CASE WHEN overdue_days > 0 THEN remaining_amount ELSE 0 END), 0) as overdue_amt
            FROM ar_ap_records
            WHERE is_deleted = false AND company_id = :cid
            GROUP BY type
        """), {"cid": company_id})
        rows = result.fetchall()
        receivable = {"total": 0, "paid": 0, "remaining": 0, "overdue_count": 0, "overdue_amount": 0}
        payable = {"total": 0, "paid": 0, "remaining": 0, "overdue_count": 0, "overdue_amount": 0}
        for r in rows:
            entry = {
                "total": float(r[2]), "paid": float(r[3]), "remaining": float(r[4]),
                "overdue_count": r[5], "overdue_amount": float(r[6]),
            }
            if r[0] == "receivable":
                receivable = entry
            else:
                payable = entry
        return {
            "receivable": receivable,
            "payable": payable,
            "overdue_receivable": receivable["overdue_amount"],
            "net_position": receivable["remaining"] - payable["remaining"],
        }

    async def _get_inventory_status(self, db: AsyncSession, company_id: str) -> dict:
        result = await db.execute(text("""
            SELECT COUNT(*) as total_items,
                COUNT(CASE WHEN quantity <= min_quantity THEN 1 END) as low_stock,
                COALESCE(SUM(quantity * unit_price), 0) as total_value
            FROM inventory_items
            WHERE is_deleted = false AND company_id = :cid
        """), {"cid": company_id})
        row = result.fetchone()
        result2 = await db.execute(text("""
            SELECT name, quantity, min_quantity, unit
            FROM inventory_items
            WHERE is_deleted = false AND company_id = :cid
                AND quantity <= min_quantity
            ORDER BY (min_quantity - quantity) DESC LIMIT 10
        """), {"cid": company_id})
        low_stock_items = [
            {"name": r[0], "quantity": float(r[1]), "min": float(r[2]), "unit": r[3]}
            for r in result2.fetchall()
        ]
        return {
            "total_items": row[0] if row else 0,
            "low_stock_count": row[1] if row else 0,
            "total_value": float(row[2]) if row else 0,
            "low_stock_items": low_stock_items,
        }

    async def _get_station_health(self, db: AsyncSession, company_id: str) -> dict:
        result = await db.execute(text("""
            SELECT status, COUNT(*) as cnt
            FROM charging_stations
            WHERE is_deleted = false AND company_id = :cid
            GROUP BY status
        """), {"cid": company_id})
        rows = result.fetchall()
        status_counts = {r[0]: r[1] for r in rows}

        result2 = await db.execute(text("""
            SELECT cs.name,
                COUNT(co.id) as orders,
                COALESCE(SUM(co.total_amount), 0) as revenue,
                COALESCE(SUM(co.charging_kwh), 0) as kwh
            FROM charging_stations cs
            LEFT JOIN charging_orders co ON co.station_id = cs.id AND co.is_deleted = false
                AND co.start_time >= CURRENT_DATE - INTERVAL '30 days'
            WHERE cs.is_deleted = false AND cs.company_id = :cid
            GROUP BY cs.id, cs.name
            ORDER BY revenue DESC LIMIT 5
        """), {"cid": company_id})
        top_stations = [
            {"name": r[0], "orders_30d": r[1], "revenue_30d": float(r[2]), "kwh_30d": float(r[3])}
            for r in result2.fetchall()
        ]
        return {"status_counts": status_counts, "top_revenue_stations": top_stations}

    async def _get_upcoming_events(self, db: AsyncSession, company_id: str, today: date) -> dict:
        events = []

        # 应收到期
        result = await db.execute(text("""
            SELECT counterparty, remaining_amount, due_date
            FROM ar_ap_records
            WHERE is_deleted = false AND company_id = :cid AND type = 'receivable'
                AND remaining_amount > 0 AND due_date IS NOT NULL
                AND due_date >= CURRENT_DATE AND due_date <= CURRENT_DATE + INTERVAL '7 days'
            ORDER BY due_date LIMIT 5
        """), {"cid": company_id})
        for r in result.fetchall():
            events.append({
                "type": "receivable_due", "label": f"应收到期 - {r[0]}",
                "amount": float(r[1]), "date": r[2].isoformat() if r[2] else None,
            })

        # 合同到期
        result = await db.execute(text("""
            SELECT name, party_a, end_date
            FROM contracts
            WHERE is_deleted = false AND company_id = :cid
                AND end_date IS NOT NULL
                AND end_date >= CURRENT_DATE AND end_date <= CURRENT_DATE + INTERVAL '14 days'
            ORDER BY end_date LIMIT 5
        """), {"cid": company_id})
        for r in result.fetchall():
            events.append({
                "type": "contract_expiry", "label": f"合同到期 - {r[0]}",
                "counterparty": r[1], "date": r[2].isoformat() if r[2] else None,
            })

        # 应付到期
        result = await db.execute(text("""
            SELECT counterparty, remaining_amount, due_date
            FROM ar_ap_records
            WHERE is_deleted = false AND company_id = :cid AND type = 'payable'
                AND remaining_amount > 0 AND due_date IS NOT NULL
                AND due_date >= CURRENT_DATE AND due_date <= CURRENT_DATE + INTERVAL '7 days'
            ORDER BY due_date LIMIT 5
        """), {"cid": company_id})
        for r in result.fetchall():
            events.append({
                "type": "payable_due", "label": f"应付到期 - {r[0]}",
                "amount": float(r[1]), "date": r[2].isoformat() if r[2] else None,
            })

        events.sort(key=lambda x: x.get("date") or "9999")
        return {"items": events[:10]}
