"""自然语言业务查询

意图识别 → 调用对应服务 → 生成自然语言回答。
支持：指标查询、预测查询、模拟查询、实体查询、通用问答。
"""

import json
import logging
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

INTENT_PROMPT = (
    "分析以下用户问题的意图，返回对应的意图类别：\n\n"
    "问题：{question}\n\n"
    "意图类别：\n"
    "- metric_query: 查询业务指标（收入/成本/利润/合同数等）\n"
    "- prediction_query: 查询未来预测（趋势/预测/展望等）\n"
    "- simulation_query: 模拟假设（如果/假如/what-if等）\n"
    "- entity_query: 查询实体信息（某公司/某项目/某合同等）\n"
    "- general_qa: 通用问题\n\n"
    "只返回意图类别名称，不要其他文字。"
)


class BusinessNLQuery:
    """自然语言业务查询"""

    async def query(
        self,
        db: AsyncSession,
        company_id: str,
        user_id: str,
        question: str,
        history: list[dict] | None = None,
    ) -> dict:
        """处理自然语言问题"""
        # 1. 意图识别
        intent = await self._classify_intent(question)

        # 2. 根据意图调用对应服务
        if intent == "metric_query":
            result = await self._query_metrics(db, company_id, question)
        elif intent == "prediction_query":
            result = await self._query_prediction(db, company_id, question)
        elif intent == "simulation_query":
            result = await self._query_simulation(db, company_id, question)
        elif intent == "entity_query":
            result = await self._query_entity(db, company_id, question)
        else:
            result = await self._general_qa(db, company_id, question)

        # 3. 生成自然语言回答
        answer = await self._generate_answer(question, result, intent)

        return {
            "question": question,
            "answer": answer,
            "data": result,
            "intent": intent,
        }

    async def _classify_intent(self, question: str) -> str:
        """意图识别"""
        from app.services.ai_gateway import ai_gateway

        try:
            prompt = INTENT_PROMPT.format(question=question)
            result = await ai_gateway.routed_chat(
                [{"role": "user", "content": prompt}],
                task="quality_gate",
            )
            intent = result.strip().lower()
            valid = {"metric_query", "prediction_query", "simulation_query", "entity_query", "general_qa"}
            return intent if intent in valid else "general_qa"
        except Exception:
            return "general_qa"

    async def _query_metrics(
        self, db: AsyncSession, company_id: str, question: str,
    ) -> dict:
        """指标查询"""
        from app.services.business_digital_twin.metric_aggregator import metric_aggregator

        metrics = await metric_aggregator.query_metrics(
            db, company_id, period_type="monthly",
        )

        # 提取最近几个月的关键指标
        recent = metrics[:12] if metrics else []
        return {"type": "metrics", "metrics": recent}

    async def _query_prediction(
        self, db: AsyncSession, company_id: str, question: str,
    ) -> dict:
        """预测查询"""
        from app.services.business_digital_twin.prediction_engine import prediction_engine

        dashboard = await prediction_engine.get_dashboard(db, company_id, 6)
        return {"type": "prediction", "dashboard": dashboard}

    async def _query_simulation(
        self, db: AsyncSession, company_id: str, question: str,
    ) -> dict:
        """模拟查询"""
        from app.services.business_digital_twin.simulation_engine import simulation_engine
        return {
            "type": "simulation",
            "templates": list(simulation_engine.get_templates().keys()),
            "message": "请使用模拟沙盘页面进行What-If分析",
        }

    async def _query_entity(
        self, db: AsyncSession, company_id: str, question: str,
    ) -> dict:
        """实体查询"""
        from app.services.business_digital_twin.knowledge_graph import business_kg

        # 尝试从问题中提取实体名
        entity_name = await self._extract_entity_name(question)
        if entity_name:
            graph = await business_kg.query_graph(db, company_id, entity_name, depth=1)
            return {"type": "entity", "entity_name": entity_name, "graph": graph}

        entities = await business_kg.build_graph(db, company_id)
        return {"type": "entity_list", "total_entities": len(entities.get("nodes", []))}

    async def _general_qa(
        self, db: AsyncSession, company_id: str, question: str,
    ) -> dict:
        """通用问答"""
        from app.services.business_digital_twin.metric_aggregator import metric_aggregator

        # 提供基础业务上下文
        metrics = await metric_aggregator.query_metrics(
            db, company_id, period_type="monthly",
        )
        recent_metrics = metrics[:6] if metrics else []

        return {"type": "general", "context_metrics": recent_metrics}

    async def _extract_entity_name(self, question: str) -> str | None:
        """从问题中提取实体名"""
        from app.services.ai_gateway import ai_gateway

        try:
            prompt = (
                f"从以下问题中提取可能的业务实体名称（公司/项目/合同/供应商名），"
                f"如果没有明确的实体名则返回空字符串。\n\n"
                f"问题：{question}\n\n只返回实体名，不要其他文字。"
            )
            result = await ai_gateway.routed_chat(
                [{"role": "user", "content": prompt}],
                task="quality_gate",
            )
            name = result.strip()
            return name if name and len(name) > 1 else None
        except Exception:
            return None

    async def _generate_answer(
        self, question: str, result: dict, intent: str,
    ) -> str:
        """生成自然语言回答"""
        from app.services.ai_gateway import ai_gateway

        prompt = (
            f"用户问：「{question}」（意图：{intent}）\n\n"
            f"以下是系统返回的数据：\n"
            f"{json.dumps(result, ensure_ascii=False, default=str)[:2000]}\n\n"
            f"请根据数据给出简洁、有用的回答。不超过300字。"
        )

        try:
            return await ai_gateway.routed_chat(
                [{"role": "user", "content": prompt}],
                task="evolution_eval",
            )
        except Exception:
            if intent == "metric_query" and result.get("metrics"):
                return f"系统查到了{len(result['metrics'])}条指标数据，详情请查看业务时间轴页面。"
            if intent == "prediction_query" and result.get("dashboard"):
                summary = result["dashboard"].get("summary", {})
                return (
                    f"根据预测分析：预计总收入{summary.get('total_predicted_revenue', 0):,.0f}元，"
                    f"总成本{summary.get('total_predicted_cost', 0):,.0f}元，"
                    f"净利润{summary.get('predicted_net', 0):,.0f}元。"
                )
            return "抱歉，系统暂时无法回答这个问题，请稍后再试。"


# 全局单例
business_nl_query = BusinessNLQuery()
