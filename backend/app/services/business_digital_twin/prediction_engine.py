"""时序预测引擎

基于Prophet的预测引擎，从biz_metrics获取时序数据。
数据不足时降级为简单外推。
"""

import logging
from datetime import datetime, date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business.models import BizMetric

logger = logging.getLogger(__name__)


class PredictionEngine:
    """基于Prophet的时序预测引擎"""

    async def _get_monthly_series(
        self,
        db: AsyncSession,
        company_id: str,
        metric_type: str,
        months: int = 24,
    ) -> list[dict]:
        """从biz_metrics获取月度时序数据"""
        cutoff = (date.today().replace(day=1) - timedelta(days=months * 31)).strftime("%Y-%m")

        rows = (await db.execute(
            select(BizMetric).where(
                BizMetric.company_id == company_id,
                BizMetric.is_deleted == False,
                BizMetric.metric_type == metric_type,
                BizMetric.period_type == "monthly",
                BizMetric.period >= cutoff,
            ).order_by(BizMetric.period.asc())
        )).scalars().all()

        return [
            {
                "period": m.period,
                "value": float(m.value) if m.value else 0,
                "date": f"{m.period}-01",
            }
            for m in rows
        ]

    def _fit_prophet(self, series_df: list[dict], periods: int = 6) -> dict | None:
        """训练Prophet模型并预测"""
        try:
            import pandas as pd
            from prophet import Prophet

            df = pd.DataFrame(series_df)
            df = df.rename(columns={"date": "ds", "value": "y"})
            df["ds"] = pd.to_datetime(df["ds"])
            df = df[["ds", "y"]].dropna()

            if len(df) < 6:
                return None

            model = Prophet(
                yearly_seasonality=True,
                weekly_seasonality=False,
                daily_seasonality=False,
                changepoint_prior_scale=0.05,
            )
            model.fit(df)
            future = model.make_future_dataframe(periods=periods, freq="ME")
            forecast = model.predict(future)

            # 只取未来periods个预测
            predictions = forecast.tail(periods)
            result = {
                "predictions": [],
                "lower": [],
                "upper": [],
            }
            for _, row in predictions.iterrows():
                ds = row["ds"]
                month_str = f"{ds.year}-{ds.month:02d}" if hasattr(ds, "year") else str(ds)[:7]
                result["predictions"].append({
                    "period": month_str,
                    "amount": round(max(0, float(row["yhat"])), 2),
                })
                result["lower"].append({
                    "period": month_str,
                    "amount": round(max(0, float(row["yhat_lower"])), 2),
                })
                result["upper"].append({
                    "period": month_str,
                    "amount": round(max(0, float(row["yhat_upper"])), 2),
                })

            return result
        except ImportError:
            logger.warning("Prophet未安装，降级为简单外推")
            return None
        except Exception as e:
            logger.warning("Prophet拟合失败: %s，降级为简单外推", e)
            return None

    def _simple_forecast(self, series: list[dict], periods: int, metric_type: str) -> dict:
        """数据不足时的降级策略 — 移动平均外推"""
        if not series:
            return self._empty_forecast(metric_type, periods)

        values = [s["value"] for s in series]
        n = len(values)

        if n < 2:
            # 单点数据：假设持平
            avg = values[0] if values else 0
            return self._constant_forecast(avg, periods, metric_type)

        # 最近3个月的移动平均增长率
        window = min(3, n)
        recent = values[-window:]
        avg = sum(recent) / window

        # 计算环比增长
        growth_rate = 0
        if n >= 2 and values[-2] > 0:
            growth_rate = (values[-1] - values[-2]) / values[-2]

        predictions = []
        lower = []
        upper = []
        last_period = series[-1]["period"]

        for i in range(periods):
            # 解析月份并递增
            year, month = map(int, last_period.split("-"))
            month += i + 1
            while month > 12:
                month -= 12
                year += 1
            period = f"{year}-{month:02d}"

            # 应用增长率（衰减）
            decayed_rate = growth_rate * (0.85 ** i)
            predicted = avg * (1 + decayed_rate)

            predictions.append({"period": period, "amount": round(max(0, predicted), 2)})
            lower.append({"period": period, "amount": round(max(0, predicted * 0.8), 2)})
            upper.append({"period": period, "amount": round(predicted * 1.2, 2)})

        return {
            "metric_type": metric_type,
            "method": "simple_extrapolation",
            "historical": series,
            "predictions": predictions,
            "confidence_interval": {"lower": lower, "upper": upper},
            "generated_at": datetime.now().isoformat(),
        }

    async def predict_revenue(
        self,
        db: AsyncSession,
        company_id: str,
        months_ahead: int = 6,
    ) -> dict:
        """收入预测"""
        series = await self._get_monthly_series(db, company_id, "revenue")

        if len(series) < 6:
            return self._simple_forecast(series, months_ahead, "revenue")

        result = self._fit_prophet(series, months_ahead)
        if result:
            return self._format_forecast(result, series, "revenue", "prophet")

        return self._simple_forecast(series, months_ahead, "revenue")

    async def predict_cost(
        self,
        db: AsyncSession,
        company_id: str,
        months_ahead: int = 6,
    ) -> dict:
        """成本预测"""
        series = await self._get_monthly_series(db, company_id, "cost")

        if len(series) < 6:
            return self._simple_forecast(series, months_ahead, "cost")

        result = self._fit_prophet(series, months_ahead)
        if result:
            return self._format_forecast(result, series, "cost", "prophet")

        return self._simple_forecast(series, months_ahead, "cost")

    async def predict_cash_flow(
        self,
        db: AsyncSession,
        company_id: str,
        months_ahead: int = 6,
    ) -> dict:
        """现金流预测 — 收入-成本"""
        revenue = await self.predict_revenue(db, company_id, months_ahead)
        cost = await self.predict_cost(db, company_id, months_ahead)

        rev_preds = revenue.get("predictions", [])
        cost_preds = cost.get("predictions", [])

        predictions = []
        for i in range(min(len(rev_preds), len(cost_preds))):
            rev_amt = rev_preds[i].get("amount", 0)
            cost_amt = cost_preds[i].get("amount", 0)
            predictions.append({
                "period": rev_preds[i]["period"],
                "amount": round(rev_amt - cost_amt, 2),
            })

        return {
            "metric_type": "cash_flow",
            "method": "revenue_minus_cost",
            "predictions": predictions,
            "revenue_forecast": revenue,
            "cost_forecast": cost,
            "generated_at": datetime.now().isoformat(),
        }

    async def predict_project_risk(
        self,
        db: AsyncSession,
        company_id: str,
    ) -> dict:
        """项目风险预测 — 基于历史项目数据"""
        from app.models.business.models import BizEvent

        # 获取近期项目事件
        recent = (await db.execute(
            select(BizEvent).where(
                BizEvent.company_id == company_id,
                BizEvent.is_deleted == False,
                BizEvent.event_type.in_(["project_created", "project_started", "project_completed", "project_delayed"]),
            ).order_by(BizEvent.event_date.desc()).limit(50)
        )).scalars().all()

        total = len(recent)
        delayed = sum(1 for e in recent if e.event_type == "project_delayed")
        completed = sum(1 for e in recent if e.event_type == "project_completed")

        delay_rate = delayed / max(1, total) if total > 0 else 0
        completion_rate = completed / max(1, total) if total > 0 else 0

        risk_score = min(100, delay_rate * 100 + (1 - completion_rate) * 30)
        risk_level = "high" if risk_score > 60 else "medium" if risk_score > 30 else "low"

        return {
            "risk_score": round(risk_score, 1),
            "risk_level": risk_level,
            "delay_rate": round(delay_rate, 3),
            "completion_rate": round(completion_rate, 3),
            "total_projects": total,
            "delayed_projects": delayed,
        }

    async def get_dashboard(
        self,
        db: AsyncSession,
        company_id: str,
        months_ahead: int = 3,
    ) -> dict:
        """综合预测仪表盘"""
        revenue = await self.predict_revenue(db, company_id, months_ahead)
        cost = await self.predict_cost(db, company_id, months_ahead)
        cash_flow = await self.predict_cash_flow(db, company_id, months_ahead)
        risk = await self.predict_project_risk(db, company_id)

        total_revenue = sum(p.get("amount", 0) for p in revenue.get("predictions", []))
        total_cost = sum(p.get("amount", 0) for p in cost.get("predictions", []))

        risk_score = 0
        if total_cost > 0:
            ratio = total_revenue / total_cost
            if ratio < 1.0:
                risk_score = 80 + (1.0 - ratio) * 20
            elif ratio < 1.2:
                risk_score = 50 + (1.2 - ratio) * 150
            else:
                risk_score = max(0, 50 - (ratio - 1.2) * 50)

        return {
            "company_id": company_id,
            "summary": {
                "total_predicted_revenue": round(total_revenue, 2),
                "total_predicted_cost": round(total_cost, 2),
                "predicted_net": round(total_revenue - total_cost, 2),
                "risk_score": round(min(100, risk_score), 1),
                "risk_level": "high" if risk_score > 70 else "medium" if risk_score > 40 else "low",
            },
            "revenue_prediction": revenue,
            "cost_prediction": cost,
            "cash_flow_prediction": cash_flow,
            "project_risk": risk,
            "generated_at": datetime.now().isoformat(),
        }

    def _format_forecast(
        self,
        prophet_result: dict,
        series: list[dict],
        metric_type: str,
        method: str,
    ) -> dict:
        """格式化Prophet输出"""
        return {
            "metric_type": metric_type,
            "method": method,
            "historical": series,
            "predictions": prophet_result["predictions"],
            "confidence_interval": {
                "lower": prophet_result["lower"],
                "upper": prophet_result["upper"],
            },
            "generated_at": datetime.now().isoformat(),
        }

    def _empty_forecast(self, metric_type: str, periods: int) -> dict:
        """空预测"""
        return {
            "metric_type": metric_type,
            "method": "no_data",
            "historical": [],
            "predictions": [{"period": "unknown", "amount": 0}] * periods if periods else [],
            "confidence_interval": {"lower": [], "upper": []},
            "generated_at": datetime.now().isoformat(),
        }

    def _constant_forecast(self, value: float, periods: int, metric_type: str) -> dict:
        """恒定预测"""
        predictions = [{"period": f"m+{i+1}", "amount": round(value, 2)} for i in range(periods)]
        return {
            "metric_type": metric_type,
            "method": "constant",
            "historical": [],
            "predictions": predictions,
            "confidence_interval": {
                "lower": [{"period": p["period"], "amount": round(p["amount"] * 0.8, 2)} for p in predictions],
                "upper": [{"period": p["period"], "amount": round(p["amount"] * 1.2, 2)} for p in predictions],
            },
            "generated_at": datetime.now().isoformat(),
        }


# 全局单例
prediction_engine = PredictionEngine()
