"""
Alert Engine - 智能告警引擎
基于规则 + AI 的多维度告警，替代运营/财务/项目经理的巡检工作
"""
import logging
from datetime import date, datetime, timedelta
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class AlertEngine:
    """告警引擎 - 自动巡检公司运营状态"""

    async def get_all_alerts(self, db: AsyncSession, company_id: str) -> list[dict]:
        """运行所有告警规则，返回当前活跃告警"""
        alerts = []
        alerts.extend(await self._check_cash_flow(db, company_id))
        alerts.extend(await self._check_arap_overdue(db, company_id))
        alerts.extend(await self._check_project_delays(db, company_id))
        alerts.extend(await self._check_inventory_low(db, company_id))
        alerts.extend(await self._check_contract_expiry(db, company_id))
        alerts.extend(await self._check_charging_anomaly(db, company_id))
        alerts.extend(await self._check_budget_overrun(db, company_id))
        alerts.sort(key=lambda x: {"critical": 0, "warning": 1, "info": 2}.get(x.get("severity"), 3))
        return alerts

    async def _check_cash_flow(self, db: AsyncSession, company_id: str) -> list[dict]:
        """现金流告警"""
        alerts = []
        result = await db.execute(text("""
            SELECT
                COALESCE(SUM(CASE WHEN tx_amount > 0 THEN tx_amount ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN tx_amount < 0 THEN ABS(tx_amount) ELSE 0 END), 0) as balance
            FROM bank_transactions
            WHERE is_deleted = false AND company_id = :cid
        """), {"cid": company_id})
        row = result.fetchone()
        balance = float(row[0]) if row else 0

        if balance < 10000:
            alerts.append({
                "id": "cash_critical",
                "category": "finance",
                "severity": "critical",
                "title": "现金流严重不足",
                "message": f"当前现金余额: {balance:,.2f} 元，低于安全线 10,000 元",
                "suggestion": "建议立即催收应收款项或安排短期融资",
            })
        elif balance < 50000:
            alerts.append({
                "id": "cash_warning",
                "category": "finance",
                "severity": "warning",
                "title": "现金流偏低",
                "message": f"当前现金余额: {balance:,.2f} 元",
                "suggestion": "关注近期大额支出，确保应收及时回款",
            })

        # 近7日连续支出>收入
        result = await db.execute(text("""
            SELECT
                SUM(CASE WHEN tx_amount > 0 THEN tx_amount ELSE 0 END) as income,
                SUM(CASE WHEN tx_amount < 0 THEN ABS(tx_amount) ELSE 0 END) as expense
            FROM bank_transactions
            WHERE is_deleted = false AND company_id = :cid
                AND tx_date >= CURRENT_DATE - INTERVAL '7 days'
        """), {"cid": company_id})
        row = result.fetchone()
        income_7d = float(row[0] or 0) if row else 0
        expense_7d = float(row[1] or 0) if row else 0
        if expense_7d > income_7d * 1.5 and income_7d > 0:
            alerts.append({
                "id": "cash_burn",
                "category": "finance",
                "severity": "warning",
                "title": "近7日支出远超收入",
                "message": f"收入 {income_7d:,.0f} 元 vs 支出 {expense_7d:,.0f} 元",
                "suggestion": "检查是否有异常大额支出",
            })
        return alerts

    async def _check_arap_overdue(self, db: AsyncSession, company_id: str) -> list[dict]:
        """应收逾期告警"""
        alerts = []
        result = await db.execute(text("""
            SELECT counterparty, remaining_amount, overdue_days, due_date
            FROM ar_ap_records
            WHERE is_deleted = false AND company_id = :cid AND type = 'receivable'
                AND remaining_amount > 0 AND overdue_days > 0
            ORDER BY overdue_days DESC
        """), {"cid": company_id})
        rows = result.fetchall()
        if rows:
            total_overdue = sum(float(r[1]) for r in rows)
            worst = rows[0]
            severity = "critical" if total_overdue > 200000 else "warning"
            alerts.append({
                "id": "ar_overdue",
                "category": "finance",
                "severity": severity,
                "title": f"应收逾期 {len(rows)} 笔，共 {total_overdue:,.0f} 元",
                "message": f"最严重: {worst[0]} 逾期 {worst[2]} 天，金额 {float(worst[1]):,.0f} 元",
                "suggestion": "建议立即跟进催收，必要时发送催款函",
                "details": [
                    {"name": r[0], "amount": float(r[1]), "days": r[2]}
                    for r in rows[:5]
                ],
            })
        return alerts

    async def _check_project_delays(self, db: AsyncSession, company_id: str) -> list[dict]:
        """项目延期告警"""
        alerts = []
        result = await db.execute(text("""
            SELECT name, end_date, total_budget, actual_cost, progress
            FROM projects
            WHERE is_deleted = false AND company_id = :cid
                AND status = 'in_progress' AND end_date < CURRENT_DATE
            ORDER BY end_date
        """), {"cid": company_id})
        rows = result.fetchall()
        if rows:
            alerts.append({
                "id": "project_delayed",
                "category": "project",
                "severity": "warning",
                "title": f"{len(rows)} 个项目已超过计划完成日期",
                "message": "; ".join(f"{r[0]}(应完成:{r[1]})" for r in rows[:3]),
                "suggestion": "确认项目实际状态，更新进度或调整计划",
                "details": [
                    {"name": r[0], "end_date": r[1].isoformat() if r[1] else None,
                     "budget": float(r[2] or 0), "cost": float(r[3] or 0), "progress": r[4]}
                    for r in rows[:5]
                ],
            })
        return alerts

    async def _check_inventory_low(self, db: AsyncSession, company_id: str) -> list[dict]:
        """库存不足告警"""
        alerts = []
        result = await db.execute(text("""
            SELECT name, quantity, min_quantity, unit
            FROM inventory_items
            WHERE is_deleted = false AND company_id = :cid
                AND quantity <= min_quantity
            ORDER BY (min_quantity - quantity) DESC
        """), {"cid": company_id})
        rows = result.fetchall()
        if rows:
            alerts.append({
                "id": "inventory_low",
                "category": "inventory",
                "severity": "warning" if len(rows) <= 3 else "critical",
                "title": f"{len(rows)} 项物料库存不足",
                "message": ", ".join(f"{r[0]}({float(r[1])}/{float(r[2])}{r[3]})" for r in rows[:5]),
                "suggestion": "建议尽快发起采购补货",
                "details": [
                    {"name": r[0], "quantity": float(r[1]), "min": float(r[2]), "unit": r[3]}
                    for r in rows[:10]
                ],
            })
        return alerts

    async def _check_contract_expiry(self, db: AsyncSession, company_id: str) -> list[dict]:
        """合同即将到期"""
        alerts = []
        result = await db.execute(text("""
            SELECT name, party_a, end_date, total_amount
            FROM contracts
            WHERE is_deleted = false AND company_id = :cid
                AND end_date IS NOT NULL
                AND end_date >= CURRENT_DATE AND end_date <= CURRENT_DATE + INTERVAL '14 days'
            ORDER BY end_date
        """), {"cid": company_id})
        rows = result.fetchall()
        if rows:
            alerts.append({
                "id": "contract_expiry",
                "category": "contract",
                "severity": "info",
                "title": f"{len(rows)} 份合同即将到期",
                "message": "; ".join(f"{r[0]}(到期:{r[2]})" for r in rows[:3]),
                "suggestion": "确认是否续签或结算尾款",
                "details": [
                    {"name": r[0], "counterparty": r[1],
                     "end_date": r[2].isoformat() if r[2] else None, "amount": float(r[3] or 0)}
                    for r in rows[:5]
                ],
            })
        return alerts

    async def _check_charging_anomaly(self, db: AsyncSession, company_id: str) -> list[dict]:
        """充电业务异常检测"""
        alerts = []
        # 近7日 vs 前7日 充电收入对比
        result = await db.execute(text("""
            SELECT
                (SELECT COALESCE(SUM(total_amount), 0) FROM charging_orders
                 WHERE is_deleted = false AND company_id = :cid
                    AND start_time >= CURRENT_DATE - INTERVAL '7 days') as recent,
                (SELECT COALESCE(SUM(total_amount), 0) FROM charging_orders
                 WHERE is_deleted = false AND company_id = :cid
                    AND start_time >= CURRENT_DATE - INTERVAL '14 days'
                    AND start_time < CURRENT_DATE - INTERVAL '7 days') as previous
        """), {"cid": company_id})
        row = result.fetchone()
        if row and float(row[1]) > 0:
            recent = float(row[0])
            previous = float(row[1])
            change = (recent - previous) / previous * 100
            if change < -30:
                alerts.append({
                    "id": "charging_drop",
                    "category": "charging",
                    "severity": "warning",
                    "title": f"充电收入环比下降 {abs(change):.1f}%",
                    "message": f"近7日: {recent:,.0f} 元 vs 前7日: {previous:,.0f} 元",
                    "suggestion": "检查充电桩运行状态，排查是否有点位故障",
                })
        return alerts

    async def _check_budget_overrun(self, db: AsyncSession, company_id: str) -> list[dict]:
        """预算超支告警"""
        alerts = []
        result = await db.execute(text("""
            SELECT name, total_budget, actual_cost, progress
            FROM projects
            WHERE is_deleted = false AND company_id = :cid
                AND total_budget > 0 AND actual_cost > total_budget
            ORDER BY (actual_cost - total_budget) DESC
        """), {"cid": company_id})
        rows = result.fetchall()
        if rows:
            total_over = sum(float(r[2]) - float(r[1]) for r in rows)
            alerts.append({
                "id": "budget_overrun",
                "category": "project",
                "severity": "warning",
                "title": f"{len(rows)} 个项目预算超支，累计超 {total_over:,.0f} 元",
                "message": "; ".join(
                    f"{r[0]}(超{(float(r[2])-float(r[1]))/float(r[1])*100:.0f}%)"
                    for r in rows[:3]
                ),
                "suggestion": "审查超支原因，必要时追加预算或控制支出",
                "details": [
                    {"name": r[0], "budget": float(r[1]), "actual": float(r[2]), "progress": r[3]}
                    for r in rows[:5]
                ],
            })
        return alerts
