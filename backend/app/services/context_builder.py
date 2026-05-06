import json
import logging
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.charging.models import ChargingOrder, ChargingStation
from app.models.finance.models import ArApRecord
from app.models.intelligence.models import BusinessKnowledge
from app.models.project.models import CompanyEntity, Project

logger = logging.getLogger(__name__)

MODULE_CONTEXT = {
    "autopilot": {
        "entities": True, "pricing": True, "rules": True, "stats": True, "corrections": True,
    },
    "finance": {
        "entities": True, "pricing": False, "rules": True, "stats": True, "corrections": True,
    },
    "engineering": {
        "entities": True, "pricing": False, "rules": True, "stats": True, "corrections": False,
    },
    "operations": {
        "entities": True, "pricing": True, "rules": True, "stats": True, "corrections": False,
    },
    "smart_doc": {
        "entities": True, "pricing": False, "rules": True, "stats": False, "corrections": False,
    },
}

_ENTITY_MAP = {
    "a0000000-0000-0000-0000-000000000001": "雅诗达(YSD,工程建设)",
    "a0000000-0000-0000-0000-000000000002": "永充(YCNE,充电运营)",
}

_PROJECT_TYPES = {
    "pure_engineering": "纯工程",
    "charging_epc": "充电站EPC",
    "self_invest_build": "自投自建",
    "cooperative_build": "合作共建",
}

_CONTRACT_TYPES = {
    "land_lease": "租地", "epc": "EPC总包", "civil_construction": "土建施工",
    "hv_construction": "高压安装", "lv_construction": "低压安装",
    "ancillary_construction": "附属设施", "transformer_purchase": "变压器采购",
    "cable_purchase": "电缆采购", "charging_pile_purchase": "充电桩采购",
    "electrical_material_purchase": "电气材料采购", "equipment_sale": "设备销售",
    "service": "服务合同", "cooperation": "合作协议", "supplement": "补充协议", "other": "其他",
}


class ContextBuilder:

    async def build_system_prompt(self, db: AsyncSession, company_id: str, module: str, base_prompt: str) -> str:
        cfg = MODULE_CONTEXT.get(module, MODULE_CONTEXT["autopilot"])
        parts = [base_prompt, ""]

        if cfg.get("entities"):
            parts.append(await self._entity_context(db, company_id))
        if cfg.get("pricing"):
            parts.append(self._pricing_context(db, company_id))
        if cfg.get("rules"):
            parts.append(self._rules_context())
        if cfg.get("stats"):
            parts.append(await self._stats_context(db, company_id))
        if cfg.get("corrections"):
            parts.append(await self._corrections_context(db, company_id))

        return "\n".join(p for p in parts if p)

    async def _entity_context(self, db: AsyncSession, company_id: str) -> str:
        result = await db.execute(
            select(CompanyEntity).where(CompanyEntity.company_id == company_id, CompanyEntity.is_deleted == False)
        )
        entities = result.scalars().all()
        if not entities:
            return "## 公司主体\n（暂无公司主体数据）"
        lines = ["## 公司主体"]
        for e in entities:
            code = e.entity_code or "—"
            lines.append(f"- {e.entity_name}({code}): entity_id={e.id}")
        lines.append("- 规则: 工程类合同→雅诗达(YSD), 租地/运营→永充(YCNE)")
        return "\n".join(lines)

    def _pricing_context(self, db: AsyncSession, company_id: str) -> str:
        return (
            "## 业务定价\n"
            "- 电费: ~0.65元/kWh (视地区和时段)\n"
            "- 服务费: ~0.25元/kWh\n"
            "- 充电单价: ~0.90元/kWh (电费+服务费)\n"
            "- 增值税率: 13%\n"
            "- 企业所得税率: 25%"
        )

    def _rules_context(self) -> str:
        return (
            "## 业务规则\n"
            "### 项目类型\n"
            "- pure_engineering(纯工程): YSD签约→施工→验收→结算\n"
            "- charging_epc(充电站EPC): YSD签约→施工→移交YCNE运营\n"
            "- self_invest_build(自投自建): YSD建设→完工移交YCNE, 双主体\n"
            "- cooperative_build(合作共建): YSD建设+YCNE运营+合作方分成\n"
            "### 合同类型(15种)\n"
            "- 工程类(→YSD): epc, civil_construction, hv_construction, lv_construction, ancillary_construction, transformer_purchase, cable_purchase, charging_pile_purchase, electrical_material_purchase, equipment_sale, service, supplement, other\n"
            "- 运营类(→YCNE): land_lease, cooperation\n"
            "### 跨模块数据流\n"
            "合同→发票→应收应付→银行流水→凭证\n"
            "项目→充电站→充电订单→月度营收→凭证\n"
            "采购申请→采购订单→收货→发票→应付→付款\n"
        )

    async def _stats_context(self, db: AsyncSession, company_id: str) -> str:
        today = date.today()
        lines = ["## 当前经营状态"]

        active_projects = (await db.execute(
            select(func.count()).select_from(Project).where(
                Project.company_id == company_id, Project.is_deleted == False,
                Project.status.in_(["in_progress", "active", "planning"]),
            )
        )).scalar() or 0
        lines.append(f"- 进行中/待启动项目: {active_projects}个")

        operating_stations = (await db.execute(
            select(func.count()).select_from(ChargingStation).where(
                ChargingStation.company_id == company_id, ChargingStation.is_deleted == False,
                ChargingStation.status == "operating",
            )
        )).scalar() or 0
        total_stations = (await db.execute(
            select(func.count()).select_from(ChargingStation).where(
                ChargingStation.company_id == company_id, ChargingStation.is_deleted == False,
            )
        )).scalar() or 0
        lines.append(f"- 运营充电站: {operating_stations}/{total_stations}座")

        total_ar = float((await db.execute(
            select(func.coalesce(func.sum(ArApRecord.remaining_amount), 0)).where(
                ArApRecord.company_id == company_id, ArApRecord.is_deleted == False, ArApRecord.type == "ar",
            )
        )).scalar() or 0)
        overdue_ar = float((await db.execute(
            select(func.coalesce(func.sum(ArApRecord.remaining_amount), 0)).where(
                ArApRecord.company_id == company_id, ArApRecord.is_deleted == False, ArApRecord.type == "ar",
                ArApRecord.due_date < today, ArApRecord.remaining_amount > 0,
            )
        )).scalar() or 0)
        total_ap = float((await db.execute(
            select(func.coalesce(func.sum(ArApRecord.remaining_amount), 0)).where(
                ArApRecord.company_id == company_id, ArApRecord.is_deleted == False, ArApRecord.type == "ap",
            )
        )).scalar() or 0)
        lines.append(f"- 应收账款: ¥{total_ar:,.0f} (逾期 ¥{overdue_ar:,.0f})")
        lines.append(f"- 应付账款: ¥{total_ap:,.0f}")

        from datetime import timedelta
        month_start = today.replace(day=1)
        month_orders = (await db.execute(
            select(func.count()).select_from(ChargingOrder).where(
                ChargingOrder.company_id == company_id, ChargingOrder.is_deleted == False,
                ChargingOrder.created_at >= month_start,
            )
        )).scalar() or 0
        month_revenue = float((await db.execute(
            select(func.coalesce(func.sum(ChargingOrder.total_amount), 0)).where(
                ChargingOrder.company_id == company_id, ChargingOrder.is_deleted == False,
                ChargingOrder.created_at >= month_start,
            )
        )).scalar() or 0)
        month_kwh = float((await db.execute(
            select(func.coalesce(func.sum(ChargingOrder.charging_kwh), 0)).where(
                ChargingOrder.company_id == company_id, ChargingOrder.is_deleted == False,
                ChargingOrder.created_at >= month_start,
            )
        )).scalar() or 0)
        lines.append(f"- 本月充电: {month_orders}单, {month_kwh:,.0f}kWh, 收入¥{month_revenue:,.0f}")

        total_orders = (await db.execute(
            select(func.count()).select_from(ChargingOrder).where(
                ChargingOrder.company_id == company_id, ChargingOrder.is_deleted == False,
            )
        )).scalar() or 0
        total_fleet = (await db.execute(
            select(func.count()).select_from(ChargingOrder).where(
                ChargingOrder.company_id == company_id, ChargingOrder.is_deleted == False,
                ChargingOrder.order_type == "fleet",
            )
        )).scalar() or 0
        lines.append(f"- 历史充电订单: {total_orders}单 (其中车队{total_fleet}单)")

        return "\n".join(lines)

    async def _corrections_context(self, db: AsyncSession, company_id: str) -> str:
        result = await db.execute(
            select(BusinessKnowledge).where(
                BusinessKnowledge.company_id == company_id,
                BusinessKnowledge.category == "correction",
                BusinessKnowledge.is_active == True,
                BusinessKnowledge.is_deleted == False,
            ).order_by(BusinessKnowledge.usage_count.desc()).limit(10)
        )
        items = result.scalars().all()
        if not items:
            return ""
        lines = ["## 已知的业务修正"]
        for item in items:
            lines.append(f"- {item.key}: {item.value}")
        return "\n".join(lines)


context_builder = ContextBuilder()
