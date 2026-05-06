import json
import logging
from datetime import date, datetime, timedelta
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.charging.models import ChargingStation, StationFinancialMonthly
from app.models.erp.models import Contract
from app.models.finance.models import ArApRecord
from app.models.intelligence.models import BusinessKnowledge, IntelligenceAlert
from app.models.project.models import Project

logger = logging.getLogger(__name__)


class IntelligenceEngine:

    async def run_all_rules(self, db: AsyncSession, company_id: str) -> int:
        count = 0
        for rule_fn in [
            self._check_contract_vs_budget,
            self._check_revenue_drop,
            self._check_overdue_ar,
            self._check_unbilled_contracts,
            self._check_project_health,
            self._check_budget_usage,
            self._check_expiring_contracts,
        ]:
            try:
                count += await rule_fn(db, company_id)
            except Exception as e:
                logger.exception("Intelligence rule %s failed: %s", rule_fn.__name__, e)
        return count

    async def _get_threshold(self, db: AsyncSession, company_id: str, key: str, default: float) -> float:
        result = await db.execute(
            select(BusinessKnowledge.value).where(
                BusinessKnowledge.company_id == company_id,
                BusinessKnowledge.key == key,
                BusinessKnowledge.is_active == True,
                BusinessKnowledge.is_deleted == False,
            )
        )
        val = result.scalar_one_or_none()
        if val:
            try:
                clean = val.replace("~", "").replace("%", "").replace("元", "").strip()
                num = float(clean)
                return num if key.endswith("_pct") or "tolerance" in key else num
            except (ValueError, AttributeError):
                pass
        return default

    async def _create_alert(self, db: AsyncSession, company_id: str, **kwargs) -> bool:
        alert_type = kwargs.get("alert_type")
        entity_id = kwargs.get("entity_id")
        existing = None
        if entity_id and alert_type:
            existing = (await db.execute(
                select(IntelligenceAlert).where(
                    IntelligenceAlert.company_id == company_id,
                    IntelligenceAlert.alert_type == alert_type,
                    IntelligenceAlert.entity_id == entity_id,
                    IntelligenceAlert.status == "active",
                    IntelligenceAlert.is_deleted == False,
                )
            )).scalar_one_or_none()
        if existing:
            existing.message = kwargs.get("message", existing.message)
            existing.severity = kwargs.get("severity", existing.severity)
            existing.data_snapshot = kwargs.get("data_snapshot", existing.data_snapshot)
            await db.flush()
            return False

        alert = IntelligenceAlert(
            company_id=company_id,
            id=str(uuid4()),
            **kwargs,
        )
        db.add(alert)
        await db.flush()
        return True

    async def _check_contract_vs_budget(self, db: AsyncSession, company_id: str) -> int:
        threshold = await self._get_threshold(db, company_id, "contract_vs_budget_tolerance", 1.1)
        rows = (await db.execute(
            select(Contract, Project).join(Project, Contract.project_id == Project.id).where(
                Contract.company_id == company_id, Contract.is_deleted == False,
                Project.is_deleted == False, Contract.project_id != None,
                Contract.total_amount != None, Project.total_budget != None,
                Contract.total_amount > 0, Project.total_budget > 0,
            )
        )).all()
        count = 0
        for contract, project in rows:
            if float(contract.total_amount) > float(project.total_budget) * threshold:
                created = await self._create_alert(db, company_id,
                    alert_type="contract_vs_budget",
                    severity="warning",
                    title=f"合同金额超出项目预算",
                    message=f"合同《{contract.name}》¥{float(contract.total_amount):,.0f} 超出项目《{project.name}》预算 ¥{float(project.total_budget):,.0f} ({(float(contract.total_amount)/float(project.total_budget)*100-100):.0f}%)",
                    suggestion="请确认合同金额是否正确，或更新项目预算",
                    entity_type="contract",
                    entity_id=str(contract.id),
                    module_a="erp",
                    module_b="project",
                    data_snapshot=json.dumps({"contract_amount": float(contract.total_amount), "budget": float(project.total_budget)}),
                )
                count += int(created)
        return count

    async def _check_revenue_drop(self, db: AsyncSession, company_id: str) -> int:
        threshold_pct = await self._get_threshold(db, company_id, "revenue_drop_alert", 30.0)
        now = date.today()
        this_month = f"{now.year}-{now.month:02d}"
        if now.month == 1:
            last_month = f"{now.year-1}-12"
        else:
            last_month = f"{now.year}-{now.month-1:02d}"

        stations = (await db.execute(
            select(ChargingStation).where(
                ChargingStation.company_id == company_id, ChargingStation.is_deleted == False,
                ChargingStation.status == "operating",
            )
        )).scalars().all()
        count = 0
        for station in stations:
            this_rev = float((await db.execute(
                select(func.coalesce(func.sum(StationFinancialMonthly.total_revenue), 0)).where(
                    StationFinancialMonthly.station_id == station.id,
                    StationFinancialMonthly.month == this_month,
                )
            )).scalar() or 0)
            last_rev = float((await db.execute(
                select(func.coalesce(func.sum(StationFinancialMonthly.total_revenue), 0)).where(
                    StationFinancialMonthly.station_id == station.id,
                    StationFinancialMonthly.month == last_month,
                )
            )).scalar() or 0)
            if last_rev > 0 and this_rev > 0:
                drop_pct = (1 - this_rev / last_rev) * 100
                if drop_pct >= threshold_pct:
                    created = await self._create_alert(db, company_id,
                        alert_type="revenue_drop",
                        severity="warning",
                        title=f"{station.name} 营收环比下降{drop_pct:.0f}%",
                        message=f"本月营收¥{this_rev:,.0f} vs 上月¥{last_rev:,.0f}",
                        suggestion="请检查充电站设备状态、周边竞争情况和电价变动",
                        entity_type="charging_station",
                        entity_id=str(station.id),
                        module_a="operations",
                        module_b="finance",
                        data_snapshot=json.dumps({"this_month_revenue": this_rev, "last_month_revenue": last_rev, "drop_pct": round(drop_pct, 1)}),
                    )
                    count += int(created)
        return count

    async def _check_overdue_ar(self, db: AsyncSession, company_id: str) -> int:
        today = date.today()
        rows = (await db.execute(
            select(ArApRecord.type, func.count(ArApRecord.id), func.coalesce(func.sum(ArApRecord.remaining_amount), 0))
            .where(
                ArApRecord.company_id == company_id, ArApRecord.is_deleted == False,
                ArApRecord.due_date < today, ArApRecord.remaining_amount > 0,
            ).group_by(ArApRecord.type)
        )).all()
        count = 0
        for atype, cnt, amt in rows:
            label = "应收" if atype == "ar" else "应付"
            created = await self._create_alert(db, company_id,
                alert_type=f"overdue_{atype}",
                severity="critical" if atype == "ar" else "warning",
                title=f"{cnt}笔{label}逾期",
                message=f"逾期{label}总额 ¥{float(amt):,.2f}",
                suggestion="请及时催收" if atype == "ar" else "请尽快安排付款",
                entity_type="ar_ap",
                module_a="finance",
                module_b="finance",
                data_snapshot=json.dumps({"type": atype, "count": cnt, "amount": float(amt)}),
            )
            count += int(created)
        return count

    async def _check_unbilled_contracts(self, db: AsyncSession, company_id: str) -> int:
        days_threshold = await self._get_threshold(db, company_id, "unbilled_contract_days", 30)
        cutoff = date.today() - timedelta(days=int(days_threshold))
        rows = (await db.execute(
            select(Contract).where(
                Contract.company_id == company_id, Contract.is_deleted == False,
                Contract.status.in_(["active", "performing"]),
                Contract.total_amount > 0,
                (Contract.invoiced_amount == None) | (Contract.invoiced_amount < Contract.total_amount * 0.1),
                Contract.start_date != None, Contract.start_date <= cutoff,
            )
        )).scalars().all()
        count = 0
        for c in rows[:20]:
            invoiced = float(c.invoiced_amount or 0)
            created = await self._create_alert(db, company_id,
                alert_type="unbilled_contract",
                severity="info",
                title=f"合同《{c.name}》长期未开票",
                message=f"合同金额¥{float(c.total_amount):,.0f}, 已开票¥{invoiced:,.0f}",
                suggestion="请确认是否需要催促开票或已线下处理",
                entity_type="contract",
                entity_id=str(c.id),
                module_a="erp",
                module_b="finance",
                data_snapshot=json.dumps({"contract_amount": float(c.total_amount), "invoiced": invoiced}),
            )
            count += int(created)
        return count

    async def _check_project_health(self, db: AsyncSession, company_id: str) -> int:
        today = date.today()
        no_progress_days = await self._get_threshold(db, company_id, "project_no_progress_days", 30)
        count = 0

        overdue = (await db.execute(
            select(Project).where(
                Project.company_id == company_id, Project.is_deleted == False,
                Project.status.in_(["in_progress", "active"]),
                Project.end_date != None, Project.end_date < today,
            )
        )).scalars().all()
        for p in overdue[:10]:
            created = await self._create_alert(db, company_id,
                alert_type="project_overdue",
                severity="warning",
                title=f"项目《{p.name}》已超期",
                message=f"计划结束日{p.end_date}, 当前状态{p.status}",
                suggestion="请确认项目实际进度并更新状态或调整计划日期",
                entity_type="project",
                entity_id=str(p.id),
                module_a="project",
                module_b="project",
            )
            count += int(created)

        no_contract = (await db.execute(
            select(Project).where(
                Project.company_id == company_id, Project.is_deleted == False,
                Project.status.in_(["in_progress", "active"]),
                Project.total_budget > 0,
            )
        )).scalars().all()
        for p in no_contract[:10]:
            has_contract = (await db.execute(
                select(func.count()).select_from(Contract).where(
                    Contract.project_id == p.id, Contract.is_deleted == False,
                )
            )).scalar()
            if has_contract == 0:
                created = await self._create_alert(db, company_id,
                    alert_type="project_no_contract",
                    severity="info",
                    title=f"项目《{p.name}》无关联合同",
                    message=f"预算¥{float(p.total_budget):,.0f}但未关联合同",
                    suggestion="请确认是否需要创建合同或关联已有合同",
                    entity_type="project",
                    entity_id=str(p.id),
                    module_a="project",
                    module_b="erp",
                )
                count += int(created)
        return count

    async def _check_budget_usage(self, db: AsyncSession, company_id: str) -> int:
        threshold_pct = await self._get_threshold(db, company_id, "budget_usage_pct", 80.0)
        rows = (await db.execute(
            select(Project).where(
                Project.company_id == company_id, Project.is_deleted == False,
                Project.status.in_(["in_progress", "active", "planning"]),
                Project.total_budget != None, Project.total_budget > 0,
                Project.actual_cost != None,
            )
        )).scalars().all()
        count = 0
        for p in rows:
            usage_pct = float(p.actual_cost or 0) / float(p.total_budget) * 100
            if usage_pct >= threshold_pct:
                severity = "critical" if usage_pct >= 100 else "warning"
                created = await self._create_alert(db, company_id,
                    alert_type="budget_usage",
                    severity=severity,
                    title=f"项目《{p.name}》预算使用率{usage_pct:.0f}%",
                    message=f"预算¥{float(p.total_budget):,.0f}, 已用¥{float(p.actual_cost):,.0f}",
                    suggestion="超预算" if usage_pct >= 100 else "预算即将用完，请关注后续支出",
                    entity_type="project",
                    entity_id=str(p.id),
                    module_a="project",
                    module_b="finance",
                    data_snapshot=json.dumps({"budget": float(p.total_budget), "actual": float(p.actual_cost), "usage_pct": round(usage_pct, 1)}),
                )
                count += int(created)
        return count

    async def _check_expiring_contracts(self, db: AsyncSession, company_id: str) -> int:
        today = date.today()
        soon = today + timedelta(days=15)
        rows = (await db.execute(
            select(Contract).where(
                Contract.company_id == company_id, Contract.is_deleted == False,
                Contract.status.in_(["active", "performing"]),
                Contract.end_date != None,
                Contract.end_date.between(today, soon),
            ).limit(10)
        )).scalars().all()
        count = 0
        for c in rows:
            created = await self._create_alert(db, company_id,
                alert_type="contract_expiring",
                severity="info",
                title=f"合同《{c.name}》即将到期",
                message=f"到期日: {c.end_date}",
                suggestion="提前安排续签或收尾工作",
                entity_type="contract",
                entity_id=str(c.id),
                module_a="erp",
                module_b="erp",
            )
            count += int(created)
        return count


intelligence_engine = IntelligenceEngine()
