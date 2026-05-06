"""
Command Service - 老板指令中心
自然语言 → 意图识别 → 数据查询 → AI 总结回答
"""
import json
import logging
from datetime import date, datetime, timedelta
from typing import Optional

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ai import AI_API_BASE, AI_API_KEY, AI_MODEL

logger = logging.getLogger(__name__)

# 预定义的查询意图和对应的SQL
INTENT_QUERIES = {
    "revenue": {
        "keywords": ["收入", "营收", "赚了多少", "营业额", "多少钱", "进账"],
        "sql": """
            SELECT
                COALESCE(SUM(CASE WHEN tx_amount > 0 THEN tx_amount ELSE 0 END), 0) as total_income,
                COUNT(*) as tx_count,
                MIN(tx_date) as earliest,
                MAX(tx_date) as latest
            FROM bank_transactions
            WHERE is_deleted = false AND company_id = :cid
                AND tx_amount > 0
                {date_filter}
        """,
        "label": "收入查询",
    },
    "expense": {
        "keywords": ["支出", "花了多少", "开销", "费用", "成本", "花销"],
        "sql": """
            SELECT
                COALESCE(SUM(CASE WHEN tx_amount < 0 THEN ABS(tx_amount) ELSE 0 END), 0) as total_expense,
                COUNT(*) as tx_count
            FROM bank_transactions
            WHERE is_deleted = false AND company_id = :cid
                AND tx_amount < 0
                {date_filter}
        """,
        "label": "支出查询",
    },
    "project": {
        "keywords": ["项目", "工程", "进度", "施工"],
        "sql": """
            SELECT name, status, progress, total_budget, actual_cost, start_date, end_date
            FROM projects
            WHERE is_deleted = false AND company_id = :cid
                {extra_filter}
            ORDER BY updated_at DESC NULLS LAST
            LIMIT 10
        """,
        "label": "项目查询",
    },
    "charging": {
        "keywords": ["充电", "充电桩", "充电站", "电量", "度电"],
        "sql": """
            SELECT
                COUNT(*) as orders,
                COALESCE(SUM(charging_kwh), 0) as total_kwh,
                COALESCE(SUM(total_amount), 0) as total_revenue
            FROM charging_orders
            WHERE is_deleted = false AND company_id = :cid
                {charging_date_filter}
        """,
        "label": "充电业务查询",
    },
    "receivable": {
        "keywords": ["应收", "欠款", "还没收", "催款", "回款"],
        "sql": """
            SELECT counterparty, remaining_amount, overdue_days, due_date
            FROM ar_ap_records
            WHERE is_deleted = false AND company_id = :cid AND type = 'receivable'
                AND remaining_amount > 0
            ORDER BY overdue_days DESC NULLS LAST
            LIMIT 10
        """,
        "label": "应收查询",
    },
    "payable": {
        "keywords": ["应付", "要付", "欠别人", "待付"],
        "sql": """
            SELECT counterparty, remaining_amount, due_date
            FROM ar_ap_records
            WHERE is_deleted = false AND company_id = :cid AND type = 'payable'
                AND remaining_amount > 0
            ORDER BY due_date
            LIMIT 10
        """,
        "label": "应付查询",
    },
    "inventory": {
        "keywords": ["库存", "存货", "物料", "设备", "备货"],
        "sql": """
            SELECT name, quantity, unit, unit_price, min_quantity
            FROM inventory_items
            WHERE is_deleted = false AND company_id = :cid
            ORDER BY quantity ASC
            LIMIT 10
        """,
        "label": "库存查询",
    },
}


class CommandService:
    """老板指令中心 - 自然语言查询"""

    async def process_command(self, db: AsyncSession, company_id: str,
                              command: str) -> dict:
        """处理老板的自然语言指令"""
        # 1. 意图识别
        intent = self._detect_intent(command)

        # 2. 提取时间范围
        date_filter = self._extract_date_filter(command)

        # 3. 查询数据
        query_result = await self._execute_intent_query(
            db, company_id, intent, date_filter, command
        )

        # 4. AI 总结回答
        answer = await self._ai_respond(command, intent, query_result)

        return {
            "command": command,
            "intent": intent["label"],
            "data": query_result,
            "answer": answer,
            "timestamp": datetime.now().isoformat(),
        }

    def _detect_intent(self, command: str) -> dict:
        """基于关键词的意图识别，同分时选择更具体的匹配"""
        cmd = command.lower()
        candidates = []

        for intent_key, intent_def in INTENT_QUERIES.items():
            score = sum(1 for kw in intent_def["keywords"] if kw in cmd)
            if score > 0:
                candidates.append((score, intent_key, intent_def))

        if not candidates:
            return {"key": "general", "label": "通用查询",
                    "keywords": [], "sql": None}

        # 按分数降序
        candidates.sort(key=lambda x: -x[0])
        top_score = candidates[0][0]

        # 同分时优先选更具体的：charging > revenue/expense, project > revenue
        priority = ["charging", "project", "receivable", "payable", "inventory",
                     "revenue", "expense"]
        top_candidates = [c for c in candidates if c[0] == top_score]
        for p_key in priority:
            for score, key, defn in top_candidates:
                if key == p_key:
                    return {"key": key, **defn}

        return {"key": top_candidates[0][1], **top_candidates[0][2]}

    def _extract_date_filter(self, command: str) -> str:
        """从自然语言中提取时间范围"""
        cmd = command.lower()
        today = date.today()

        if "今天" in cmd or "今日" in cmd:
            return f"AND tx_date = '{today.isoformat()}'"
        elif "昨天" in cmd or "昨日" in cmd:
            y = today - timedelta(days=1)
            return f"AND tx_date = '{y.isoformat()}'"
        elif "本周" in cmd or "这周" in cmd:
            start = today - timedelta(days=today.weekday())
            return f"AND tx_date >= '{start.isoformat()}'"
        elif "上周" in cmd:
            start = today - timedelta(days=today.weekday() + 7)
            end = start + timedelta(days=6)
            return f"AND tx_date >= '{start.isoformat()}' AND tx_date <= '{end.isoformat()}'"
        elif "本月" in cmd or "这个月" in cmd:
            start = today.replace(day=1)
            return f"AND tx_date >= '{start.isoformat()}'"
        elif "上月" in cmd or "上个月" in cmd:
            start = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
            end = today.replace(day=1) - timedelta(days=1)
            return f"AND tx_date >= '{start.isoformat()}' AND tx_date <= '{end.isoformat()}'"
        elif "今年" in cmd:
            start = today.replace(month=1, day=1)
            return f"AND tx_date >= '{start.isoformat()}'"
        return ""

    async def _execute_intent_query(self, db: AsyncSession, company_id: str,
                                     intent: dict, date_filter: str,
                                     command: str) -> list[dict]:
        """执行意图对应的SQL查询"""
        sql_template = intent.get("sql")
        if not sql_template:
            return await self._general_query(db, company_id, command)

        # 充电订单用 start_time，其他用 tx_date 或 start_date
        charging_filter = date_filter.replace("tx_date", "start_time::date")
        project_filter = date_filter.replace("tx_date", "start_date")
        sql = sql_template.format(
            date_filter=date_filter,
            extra_filter=project_filter,
            charging_date_filter=charging_filter,
        )
        try:
            result = await db.execute(text(sql), {"cid": company_id})
            columns = list(result.keys())
            rows = result.fetchall()
            return [dict(zip(columns, row)) for row in rows]
        except Exception as e:
            logger.error(f"Query execution failed: {e}")
            return [{"error": str(e)}]

    async def _general_query(self, db: AsyncSession, company_id: str,
                              command: str) -> list[dict]:
        """通用查询 - 返回关键经营数据供AI分析"""
        result = await db.execute(text("""
            SELECT
                (SELECT COUNT(*) FROM projects WHERE is_deleted=false AND company_id=:cid AND status='in_progress') as active_projects,
                (SELECT COALESCE(SUM(CASE WHEN tx_amount>0 THEN tx_amount ELSE 0 END),0) FROM bank_transactions WHERE is_deleted=false AND company_id=:cid AND tx_date >= CURRENT_DATE - INTERVAL '30 days') as income_30d,
                (SELECT COALESCE(SUM(CASE WHEN tx_amount<0 THEN ABS(tx_amount) ELSE 0 END),0) FROM bank_transactions WHERE is_deleted=false AND company_id=:cid AND tx_date >= CURRENT_DATE - INTERVAL '30 days') as expense_30d,
                (SELECT COUNT(*) FROM charging_orders WHERE is_deleted=false AND company_id=:cid AND start_time >= CURRENT_DATE - INTERVAL '30 days') as charging_orders_30d,
                (SELECT COALESCE(SUM(remaining_amount),0) FROM ar_ap_records WHERE is_deleted=false AND company_id=:cid AND type='receivable' AND remaining_amount>0) as total_receivable,
                (SELECT COUNT(*) FROM charging_stations WHERE is_deleted=false AND company_id=:cid AND status='operating') as operating_stations
        """), {"cid": company_id})
        row = result.fetchone()
        if row:
            columns = list(result.keys())
            return [dict(zip(columns, row))]
        return []

    async def _ai_respond(self, command: str, intent: dict,
                           data: list[dict]) -> str:
        """AI 生成自然语言回答"""
        try:
            prompt = f"""你是云南永充新能源科技公司的AI助理。老板问了一个问题，请根据查询到的数据给出简洁、专业的回答。

老板的问题: {command}
查询类别: {intent.get("label", "通用")}
查询结果: {json.dumps(data, ensure_ascii=False, default=str)}

要求:
1. 直接回答问题，不要废话
2. 用数字说话，带金额的用"万元"为单位
3. 如果数据为空，说明暂无相关记录
4. 如果发现异常，主动指出"""

            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{AI_API_BASE}/chat/completions",
                    headers={"Authorization": f"Bearer {AI_API_KEY}",
                             "Content-Type": "application/json"},
                    json={
                        "model": AI_MODEL,
                        "messages": [
                            {"role": "system", "content": "你是公司AI助理，负责数据查询和经营分析。"},
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.3,
                        "max_tokens": 800,
                    },
                )
                resp.raise_for_status()
                return resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"AI response failed: {e}")
            return f"查询完成，数据: {json.dumps(data, ensure_ascii=False, default=str)}"
