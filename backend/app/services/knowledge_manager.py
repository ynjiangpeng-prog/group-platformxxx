import json
import logging
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.intelligence.models import AiFeedback, BusinessKnowledge

logger = logging.getLogger(__name__)


class KnowledgeManager:

    async def seed_initial_knowledge(self, db: AsyncSession, company_id: str):
        existing = (await db.execute(
            select(func.count()).select_from(BusinessKnowledge).where(
                BusinessKnowledge.company_id == company_id,
                BusinessKnowledge.is_deleted == False,
            )
        )).scalar() or 0
        if existing > 0:
            return {"seeded": 0, "existing": existing}

        items = []
        def add(category, key, value, source="system", confidence=1.0, context=None):
            items.append(BusinessKnowledge(
                company_id=company_id, category=category, key=key, value=value,
                source=source, confidence=confidence, context=context, is_active=True,
            ))

        add("business_rule", "company_structure",
            "集团下两家公司主体: 云南雅诗达(YSD,工程建设) + 云南永充(YCNE,充电运营)")
        add("business_rule", "project_types",
            "4种: pure_engineering(纯工程), charging_epc(充电站EPC), self_invest_build(自投自建), cooperative_build(合作共建)")
        add("business_rule", "entity_mapping",
            "工程类合同→YSD(雅诗达), 租地/运营类→YCNE(永充); 自投自建/合作建双主体")
        add("business_rule", "project_handover",
            "自投自建/合作建项目完工后, 由雅诗达(YSD)移交给永充(YCNE)运营")
        add("business_rule", "contract_types",
            "15种: land_lease,epc,civil_construction,hv_construction,lv_construction,ancillary_construction,transformer_purchase,cable_purchase,charging_pile_purchase,electrical_material_purchase,equipment_sale,service,cooperation,supplement,other")
        add("business_rule", "cross_module_flow",
            "合同→发票→应收应付→银行流水→凭证; 项目→充电站→订单→月度营收→凭证; 采购申请→采购订单→收货→发票→应付→付款")

        add("pricing", "electricity_price_kwh", "~0.65元/kWh")
        add("pricing", "service_fee_kwh", "~0.25元/kWh")
        add("pricing", "charging_unit_price", "~0.90元/kWh (电费+服务费)")
        add("pricing", "vat_rate", "13%")
        add("pricing", "corporate_income_tax_rate", "25%")

        add("threshold", "contract_vs_budget_tolerance", "合同金额超出项目预算10%时预警", confidence=0.9)
        add("threshold", "revenue_drop_alert", "充电站月营收环比下降30%时预警", confidence=0.9)
        add("threshold", "supplier_delay_days", "供应商交货延迟超过7天时预警", confidence=0.8)
        add("threshold", "overdue_ar_days", "应收账款逾期即预警", confidence=1.0)
        add("threshold", "budget_usage_pct", "预算使用率超80%时预警", confidence=0.8)
        add("threshold", "unbilled_contract_days", "合同激活超过30天未开票预警", confidence=0.7)
        add("threshold", "project_no_progress_days", "项目30天无进度更新预警", confidence=0.7)

        for item in items:
            db.add(item)
        await db.flush()
        return {"seeded": len(items), "existing": 0}

    async def add_knowledge(self, db: AsyncSession, company_id: str, category: str,
                            key: str, value: str, source: str = "manual",
                            confidence: float = 1.0, context: str = None,
                            user_id: str = None) -> BusinessKnowledge:
        item = BusinessKnowledge(
            company_id=company_id, category=category, key=key, value=value,
            source=source, confidence=confidence, context=context,
            is_active=True, created_by=user_id,
        )
        db.add(item)
        await db.flush()
        return item

    async def get_active_knowledge(self, db: AsyncSession, company_id: str,
                                   categories: list[str] | None = None) -> list[BusinessKnowledge]:
        q = select(BusinessKnowledge).where(
            BusinessKnowledge.company_id == company_id,
            BusinessKnowledge.is_active == True,
            BusinessKnowledge.is_deleted == False,
        )
        if categories:
            q = q.where(BusinessKnowledge.category.in_(categories))
        q = q.order_by(BusinessKnowledge.category, BusinessKnowledge.key)
        result = await db.execute(q)
        return result.scalars().all()

    async def update_knowledge(self, db: AsyncSession, knowledge_id: str,
                               value: str | None = None, is_active: bool | None = None,
                               verified_by: str | None = None) -> BusinessKnowledge | None:
        result = await db.execute(
            select(BusinessKnowledge).where(BusinessKnowledge.id == knowledge_id)
        )
        item = result.scalar_one_or_none()
        if not item:
            return None
        if value is not None:
            item.value = value
        if is_active is not None:
            item.is_active = is_active
        if verified_by:
            item.verified_by = verified_by
            item.verified_at = datetime.now()
        await db.flush()
        return item

    async def record_usage(self, db: AsyncSession, knowledge_id: str):
        await db.execute(
            update(BusinessKnowledge).where(BusinessKnowledge.id == knowledge_id).values(
                usage_count=BusinessKnowledge.usage_count + 1,
                last_used_at=datetime.now(),
            )
        )

    async def learn_from_feedback(self, db: AsyncSession, feedback: AiFeedback) -> BusinessKnowledge | None:
        if feedback.action not in ("overridden", "corrected"):
            return None

        key = f"{feedback.module}_{feedback.entity_type or 'unknown'}_correction"
        suggested = feedback.suggested_value or ""
        actual = feedback.actual_value or ""
        value = f"用户纠正: AI建议={suggested}, 用户实际={actual}"
        if feedback.user_comment:
            value += f", 原因={feedback.user_comment}"

        existing = (await db.execute(
            select(BusinessKnowledge).where(
                BusinessKnowledge.company_id == feedback.company_id,
                BusinessKnowledge.category == "correction",
                BusinessKnowledge.key == key,
                BusinessKnowledge.is_active == True,
                BusinessKnowledge.is_deleted == False,
            )
        )).scalar_one_or_none()

        if existing:
            existing.value = value
            existing.confidence = min(1.0, existing.confidence + 0.1)
            existing.source = "feedback"
            await db.flush()
            return existing

        item = BusinessKnowledge(
            company_id=feedback.company_id,
            category="correction",
            key=key,
            value=value,
            source="feedback",
            confidence=0.6,
            context=json.dumps({"module": feedback.module, "entity_type": feedback.entity_type}),
            is_active=True,
            created_by=feedback.user_id,
        )
        db.add(item)
        await db.flush()
        return item


from sqlalchemy import func

knowledge_manager = KnowledgeManager()
