"""What-If模拟引擎

在基准预测上叠加假设条件，对比分析决策影响。
提供预置模拟模板（接新项目/材料涨价/回款延迟/充电站扩容）。
"""

import logging
from datetime import datetime, date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business.models import BizMetric

logger = logging.getLogger(__name__)

# 预置场景模板
SCENARIO_TEMPLATES = {
    "new_project": {
        "name": "接新项目",
        "description": "预测新项目对现金流的影响",
        "fields": [
            {"key": "project_budget", "label": "项目金额", "type": "number", "default": 5000000},
            {"key": "duration_months", "label": "工期（月）", "type": "number", "default": 6},
            {"key": "payment_terms", "label": "付款比例（如3-3-3-1）", "type": "text", "default": "3-3-3-1"},
            {"key": "material_cost_ratio", "label": "材料成本占比", "type": "number", "default": 0.6},
        ],
    },
    "material_increase": {
        "name": "材料涨价",
        "description": "预测材料成本上涨对利润的影响",
        "fields": [
            {"key": "increase_rate", "label": "涨幅（%）", "type": "number", "default": 5},
            {"key": "affected_months", "label": "影响月数", "type": "number", "default": 12},
        ],
    },
    "payment_delay": {
        "name": "客户回款延迟",
        "description": "预测回款延迟对资金链的影响",
        "fields": [
            {"key": "delay_months", "label": "延迟月数", "type": "number", "default": 2},
            {"key": "affected_ratio", "label": "受影响比例（%）", "type": "number", "default": 30},
        ],
    },
    "charging_expansion": {
        "name": "充电站扩容",
        "description": "预测新站点对收入增长的影响",
        "fields": [
            {"key": "new_stations", "label": "新增站点数", "type": "number", "default": 3},
            {"key": "avg_monthly_revenue", "label": "单站月均收入", "type": "number", "default": 50000},
            {"key": "ramp_months", "label": "爬坡期（月）", "type": "number", "default": 3},
        ],
    },
}


class SimulationEngine:
    """What-If模拟引擎"""

    async def simulate_scenario(
        self,
        db: AsyncSession,
        company_id: str,
        scenario: dict,
    ) -> dict:
        """
        运行What-If模拟

        scenario: { name, template_type?, assumptions: {...}, time_horizon_months }
        """
        assumptions = scenario.get("assumptions", {})
        time_horizon = scenario.get("time_horizon_months", 12)

        # 1. 获取基准预测
        from app.services.business_digital_twin.prediction_engine import prediction_engine
        baseline_revenue = await prediction_engine.predict_revenue(db, company_id, time_horizon)
        baseline_cost = await prediction_engine.predict_cost(db, company_id, time_horizon)

        # 2. 叠加假设条件
        simulated_revenue = self._apply_assumptions_revenue(
            baseline_revenue.get("predictions", []), assumptions
        )
        simulated_cost = self._apply_assumptions_cost(
            baseline_cost.get("predictions", []), assumptions
        )

        # 3. 对比分析
        baseline_revs = baseline_revenue.get("predictions", [])
        baseline_costs = baseline_cost.get("predictions", [])

        comparison = self._compare(
            baseline_revs, baseline_costs,
            simulated_revenue, simulated_cost,
        )

        # 4. 用LLM生成解读
        explanation = await self._explain_scenario(comparison, scenario)

        return {
            "scenario": scenario,
            "baseline": {
                "revenue": baseline_revs,
                "cost": baseline_costs,
            },
            "simulated": {
                "revenue": simulated_revenue,
                "cost": simulated_cost,
            },
            "comparison": comparison,
            "explanation": explanation,
            "risk_assessment": self._assess_risk(comparison),
            "simulated_at": datetime.now().isoformat(),
        }

    def _apply_assumptions_revenue(
        self,
        baseline: list[dict],
        assumptions: dict,
    ) -> list[dict]:
        """对收入基准叠加假设"""
        result = []
        budget = assumptions.get("project_budget", 0)
        duration = assumptions.get("duration_months", 6)
        payment_terms = str(assumptions.get("payment_terms", "3-3-3-1"))
        avg_monthly_revenue = assumptions.get("avg_monthly_revenue", 0)
        new_stations = assumptions.get("new_stations", 0)
        ramp_months = assumptions.get("ramp_months", 3)

        # 解析付款比例
        payments = []
        try:
            parts = [int(x.strip()) for x in payment_terms.split("-")]
            total = sum(parts)
            payments = [p / total for p in parts]
        except (ValueError, ZeroDivisionError):
            payments = [1.0]

        for i, pred in enumerate(baseline):
            amount = pred.get("amount", 0)
            month = i + 1

            # 新项目收入
            if budget > 0 and month <= len(payments):
                amount += budget * payments[month - 1]

            # 充电站扩容收入
            if new_stations > 0 and avg_monthly_revenue > 0:
                if month <= ramp_months:
                    ratio = month / ramp_months
                else:
                    ratio = 1.0
                amount += new_stations * avg_monthly_revenue * ratio

            result.append({"period": pred.get("period", f"m+{month}"), "amount": round(amount, 2)})

        return result

    def _apply_assumptions_cost(
        self,
        baseline: list[dict],
        assumptions: dict,
    ) -> list[dict]:
        """对成本基准叠加假设"""
        result = []
        budget = assumptions.get("project_budget", 0)
        material_ratio = assumptions.get("material_cost_ratio", 0.6)
        increase_rate = float(assumptions.get("increase_rate", 0)) / 100
        affected_months = assumptions.get("affected_months", 12)

        for i, pred in enumerate(baseline):
            amount = pred.get("amount", 0)
            month = i + 1

            # 新项目成本
            if budget > 0:
                amount += budget * material_ratio / max(1, assumptions.get("duration_months", 6))

            # 材料涨价
            if increase_rate > 0 and month <= affected_months:
                amount *= (1 + increase_rate)

            result.append({"period": pred.get("period", f"m+{month}"), "amount": round(amount, 2)})

        return result

    def _compare(
        self,
        baseline_revenue: list[dict],
        baseline_cost: list[dict],
        simulated_revenue: list[dict],
        simulated_cost: list[dict],
    ) -> dict:
        """对比分析"""
        total_base_rev = sum(r.get("amount", 0) for r in baseline_revenue)
        total_base_cost = sum(c.get("amount", 0) for c in baseline_cost)
        total_sim_rev = sum(r.get("amount", 0) for r in simulated_revenue)
        total_sim_cost = sum(c.get("amount", 0) for c in simulated_cost)

        base_net = total_base_rev - total_base_cost
        sim_net = total_sim_rev - total_sim_cost

        return {
            "baseline_total_revenue": round(total_base_rev, 2),
            "baseline_total_cost": round(total_base_cost, 2),
            "baseline_net": round(base_net, 2),
            "simulated_total_revenue": round(total_sim_rev, 2),
            "simulated_total_cost": round(total_sim_cost, 2),
            "simulated_net": round(sim_net, 2),
            "revenue_delta": round(total_sim_rev - total_base_rev, 2),
            "cost_delta": round(total_sim_cost - total_base_cost, 2),
            "net_delta": round(sim_net - base_net, 2),
        }

    async def _explain_scenario(self, comparison: dict, scenario: dict) -> str:
        """用LLM解释模拟结果"""
        try:
            from app.services.ai_gateway import ai_gateway
            prompt = (
                f"基于以下业务模拟结果，给出简洁的决策建议：\n\n"
                f"场景：{scenario.get('name', '自定义')}\n"
                f"假设：{scenario.get('assumptions', {})}\n"
                f"模拟结果：{comparison}\n\n"
                f"从现金流、风险、机会三个维度分析。不超过200字。"
            )
            return await ai_gateway.routed_chat(
                [{"role": "user", "content": prompt}],
                task="evolution_eval",
            )
        except Exception as e:
            logger.warning("LLM解读失败: %s", e)
            net_delta = comparison.get("net_delta", 0)
            if net_delta > 0:
                return f"模拟结果为正向，净利润预计增加{net_delta:,.0f}元。建议关注成本控制。"
            return f"模拟结果为负向，净利润预计减少{abs(net_delta):,.0f}元。建议谨慎决策。"

    def _assess_risk(self, comparison: dict) -> dict:
        """风险评估"""
        sim_net = comparison.get("simulated_net", 0)
        sim_cost = comparison.get("simulated_total_cost", 0)
        net_delta = comparison.get("net_delta", 0)

        if sim_net < 0:
            level = "high"
            message = "模拟结果显示亏损，建议重新评估"
        elif net_delta < 0 and sim_cost > 0 and (abs(net_delta) / sim_cost) > 0.2:
            level = "medium"
            message = "利润下降幅度较大，需关注成本控制"
        else:
            level = "low"
            message = "模拟结果正向或影响可控"

        return {"level": level, "message": message}

    def get_templates(self) -> dict:
        """获取预置模拟模板"""
        return SCENARIO_TEMPLATES


# 全局单例
simulation_engine = SimulationEngine()
