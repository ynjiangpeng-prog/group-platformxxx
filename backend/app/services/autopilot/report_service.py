"""
Report Service - 自动报告生成服务
每日/每周/每月自动生成经营报告，替代运营/财务/管理层的汇报工作
"""
import json
import logging
from datetime import date, datetime, timedelta
from decimal import Decimal

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ai import AI_API_BASE, AI_API_KEY, AI_MODEL

logger = logging.getLogger(__name__)


class ReportService:
    """自动报告生成器"""

    async def generate_daily_briefing(self, db: AsyncSession, company_id: str) -> dict:
        """生成每日经营简报"""
        today = date.today()
        yesterday = today - timedelta(days=1)

        # 收集所有数据
        data = {}
        data["date"] = today.isoformat()

        # 1. 昨日银行收支
        result = await db.execute(text("""
            SELECT
                COALESCE(SUM(CASE WHEN tx_amount > 0 THEN tx_amount ELSE 0 END), 0) as income,
                COALESCE(SUM(CASE WHEN tx_amount < 0 THEN ABS(tx_amount) ELSE 0 END), 0) as expense,
                COUNT(*) as tx_count
            FROM bank_transactions
            WHERE is_deleted = false AND company_id = :cid AND tx_date = :d
        """), {"cid": company_id, "d": yesterday})
        row = result.fetchone()
        data["bank_yesterday"] = {
            "income": float(row[0]) if row else 0,
            "expense": float(row[1]) if row else 0,
            "net": float(row[0]) - float(row[1]) if row else 0,
            "count": row[2] if row else 0,
        }

        # 2. 昨日充电订单
        result = await db.execute(text("""
            SELECT COUNT(*) as cnt,
                COALESCE(SUM(charging_kwh), 0) as kwh,
                COALESCE(SUM(total_amount), 0) as revenue
            FROM charging_orders
            WHERE is_deleted = false AND company_id = :cid
                AND start_time >= :d AND start_time < :d + INTERVAL '1 day'
        """), {"cid": company_id, "d": yesterday})
        row = result.fetchone()
        data["charging_yesterday"] = {
            "orders": row[0] if row else 0,
            "kwh": float(row[1]) if row else 0,
            "revenue": float(row[2]) if row else 0,
        }

        # 3. 本月累计
        month_start = today.replace(day=1)
        result = await db.execute(text("""
            SELECT
                COALESCE(SUM(CASE WHEN tx_amount > 0 THEN tx_amount ELSE 0 END), 0) as income,
                COALESCE(SUM(CASE WHEN tx_amount < 0 THEN ABS(tx_amount) ELSE 0 END), 0) as expense
            FROM bank_transactions
            WHERE is_deleted = false AND company_id = :cid AND tx_date >= :start
        """), {"cid": company_id, "start": month_start})
        row = result.fetchone()
        data["month_cumulative"] = {
            "income": float(row[0]) if row else 0,
            "expense": float(row[1]) if row else 0,
            "profit": float(row[0]) - float(row[1]) if row else 0,
        }

        # 4. 在进行项目
        result = await db.execute(text("""
            SELECT COUNT(*) FROM projects
            WHERE is_deleted = false AND company_id = :cid AND status = 'in_progress'
        """), {"cid": company_id})
        data["active_projects"] = result.scalar() or 0

        # 5. 待办事项
        result = await db.execute(text("""
            SELECT type, COUNT(*) FROM ar_ap_records
            WHERE is_deleted = false AND company_id = :cid
                AND remaining_amount > 0 AND due_date <= CURRENT_DATE + INTERVAL '3 days'
            GROUP BY type
        """), {"cid": company_id})
        data["pending"] = {r[0]: r[1] for r in result.fetchall()}

        # 6. 用AI生成文字报告
        briefing = await self._ai_generate_briefing(data)

        return {
            "date": today.isoformat(),
            "data": data,
            "briefing": briefing,
        }

    async def generate_weekly_report(self, db: AsyncSession, company_id: str) -> dict:
        """生成周报"""
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
        last_week_start = week_start - timedelta(days=7)

        data = {"period": f"{week_start.isoformat()} ~ {(week_start + timedelta(days=6)).isoformat()}"}

        # 本周收支
        result = await db.execute(text("""
            SELECT
                COALESCE(SUM(CASE WHEN tx_amount > 0 THEN tx_amount ELSE 0 END), 0) as income,
                COALESCE(SUM(CASE WHEN tx_amount < 0 THEN ABS(tx_amount) ELSE 0 END), 0) as expense
            FROM bank_transactions
            WHERE is_deleted = false AND company_id = :cid
                AND tx_date >= :start AND tx_date < :start + INTERVAL '7 days'
        """), {"cid": company_id, "start": week_start})
        row = result.fetchone()
        data["this_week"] = {"income": float(row[0]) if row else 0, "expense": float(row[1]) if row else 0}

        # 上周对比
        result = await db.execute(text("""
            SELECT
                COALESCE(SUM(CASE WHEN tx_amount > 0 THEN tx_amount ELSE 0 END), 0) as income,
                COALESCE(SUM(CASE WHEN tx_amount < 0 THEN ABS(tx_amount) ELSE 0 END), 0) as expense
            FROM bank_transactions
            WHERE is_deleted = false AND company_id = :cid
                AND tx_date >= :start AND tx_date < :start + INTERVAL '7 days'
        """), {"cid": company_id, "start": last_week_start})
        row = result.fetchone()
        data["last_week"] = {"income": float(row[0]) if row else 0, "expense": float(row[1]) if row else 0}

        # 充电业务
        result = await db.execute(text("""
            SELECT COUNT(*), COALESCE(SUM(charging_kwh), 0), COALESCE(SUM(total_amount), 0)
            FROM charging_orders
            WHERE is_deleted = false AND company_id = :cid
                AND start_time >= :start AND start_time < :start + INTERVAL '7 days'
        """), {"cid": company_id, "start": week_start})
        row = result.fetchone()
        data["charging"] = {"orders": row[0] if row else 0, "kwh": float(row[1]) if row else 0, "revenue": float(row[2]) if row else 0}

        # 项目进度
        result = await db.execute(text("""
            SELECT name, status, progress, end_date
            FROM projects
            WHERE is_deleted = false AND company_id = :cid AND status IN ('in_progress', 'planning')
            ORDER BY end_date
        """), {"cid": company_id})
        data["projects"] = [
            {"name": r[0], "status": r[1], "progress": r[2], "end_date": r[3].isoformat() if r[3] else None}
            for r in result.fetchall()
        ]

        report = await self._ai_generate_weekly(data)
        return {"data": data, "report": report}

    async def _ai_generate_briefing(self, data: dict) -> str:
        """用AI生成每日简报文字"""
        try:
            prompt = f"""你是云南永充新能源科技公司的AI运营助理。根据以下数据生成一份简洁的每日经营简报。
要求：
1. 用中文，语气专业但简洁
2. 重点突出：昨日收支、充电营收、本月累计、待办事项
3. 如有异常数据要特别提醒
4. 最后给出今日行动建议

数据：
{json.dumps(data, ensure_ascii=False, indent=2)}"""

            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{AI_API_BASE}/chat/completions",
                    headers={"Authorization": f"Bearer {AI_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": AI_MODEL,
                        "messages": [
                            {"role": "system", "content": "你是一家充电桩/电力工程公司的AI运营助理，擅长数据分析和经营建议。"},
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.3,
                        "max_tokens": 1000,
                    },
                )
                resp.raise_for_status()
                return resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"AI briefing generation failed: {e}")
            return f"数据已收集完成，AI分析暂时不可用。原始数据: {json.dumps(data, ensure_ascii=False)}"

    async def _ai_generate_weekly(self, data: dict) -> str:
        """用AI生成周报"""
        try:
            prompt = f"""你是云南永充新能源科技公司的AI运营助理。根据以下数据生成一份周度经营报告。
要求：
1. 用中文，格式清晰，包含标题和分段
2. 包含：本周经营概况、收支分析、充电业务分析、项目进度跟踪
3. 与上周数据对比分析
4. 下周工作重点建议

数据：
{json.dumps(data, ensure_ascii=False, indent=2)}"""

            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{AI_API_BASE}/chat/completions",
                    headers={"Authorization": f"Bearer {AI_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": AI_MODEL,
                        "messages": [
                            {"role": "system", "content": "你是一家充电桩/电力工程公司的AI运营助理。"},
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.3,
                        "max_tokens": 2000,
                    },
                )
                resp.raise_for_status()
                return resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"AI weekly report generation failed: {e}")
            return json.dumps(data, ensure_ascii=False)
