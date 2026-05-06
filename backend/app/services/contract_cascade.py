"""
Contract Cascade Engine
合同智能联动引擎：创建合同时自动创建项目/客户/ARAP，状态变更联动

场景：
- 合同的己方是乙方(服务提供方) → 自动创建项目
- 合同的己方是甲方(被服务方) → 关联已有项目
- 充电服务合同 → 自动创建 FleetCustomer
- 合同激活 → 自动创建 AP 记录
"""
import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

ENTITY_NAMES = {
    "云南雅诗达科技有限公司": "YSD",
    "云南永充新能源科技有限公司": "YCNE",
    "临沧市临翔区勇姜交通运输服务部": "YJ",
}

CONTRACT_TYPE_PROJECT_MAP = {
    "engineering": "engineering",
    "charging_service": "charging_station",
    "procurement": None,       # 采购合同不创建项目
    "lease": None,
    "service": "service",
    "operation": "operation",
    "construction": "engineering",
    "other": None,
}


def _identify_our_role(contract):
    """Determine which party is us and return (our_role, counterparty_name, our_entity)."""
    party_a = (getattr(contract, 'party_a', None) or "").strip()
    party_b = (getattr(contract, 'party_b', None) or "").strip()

    for name, code in ENTITY_NAMES.items():
        if name in party_a:
            return "party_a", party_b, code
        if name in party_b:
            return "party_b", party_a, code
    return None, None, None


def _get_entity_id_by_name(name: str, entities: list) -> str | None:
    """Find entity_id by entity name."""
    for e in entities:
        if e.entity_name and name in e.entity_name:
            return str(e.id)
    return None


async def cascade_on_contract_create(
    contract, db: AsyncSession, company_id: str, user_id: str
) -> list[str]:
    """Run all cascades after contract creation."""
    synced = []
    our_role, counterparty, our_entity = _identify_our_role(contract)

    if not our_role or not counterparty:
        return synced

    # Get entities for entity_id resolution
    from app.models.project.models import CompanyEntity
    entities = (await db.execute(
        select(CompanyEntity).where(CompanyEntity.is_deleted == False, CompanyEntity.company_id == company_id)
    )).scalars().all()

    contract_type = getattr(contract, 'contract_type', '') or ''

    # ─── Auto-create/link project ───
    existing_project_id = getattr(contract, 'project_id', None)
    project_type = CONTRACT_TYPE_PROJECT_MAP.get(contract_type)

    if project_type and not existing_project_id:
        from app.models.project.models import Project

        # We are the service provider (乙方) → create new project
        if our_role == "party_b":
            # Check if project already exists with similar name
            existing_proj = (await db.execute(
                select(Project).where(
                    Project.name.ilike(f"%{contract.name}%") if hasattr(contract, 'name') else False,
                    Project.is_deleted == False,
                    Project.company_id == company_id,
                )
            )).scalars().first()

            if not existing_proj:
                from app.api.deps.auth import generate_no
                entity_id = _get_entity_id_by_name(
                    next((n for n, c in ENTITY_NAMES.items() if c == our_entity), ""),
                    entities
                )
                proj = Project(
                    project_code=generate_no("PRJ"),
                    name=contract.name,
                    project_type=project_type,
                    status="planning",
                    priority=5,
                    progress=0,
                    entity_id=entity_id,
                    contract_id=contract.id,
                    total_budget=float(contract.total_amount) if contract.total_amount else None,
                    company_id=company_id,
                    created_by=user_id,
                )
                db.add(proj)
                await db.flush()
                contract.project_id = proj.id
                synced.append(f"自动创建项目: {proj.project_code} {proj.name}")
            else:
                contract.project_id = existing_proj.id
                synced.append(f"关联已有项目: {existing_proj.project_code} {existing_proj.name}")

        # We are the client (甲方) → link to existing project
        elif our_role == "party_a":
            projs = (await db.execute(
                select(Project).where(
                    Project.is_deleted == False,
                    Project.company_id == company_id,
                ).order_by(Project.created_at.desc()).limit(5)
            )).scalars().all()
            # Best effort: try to match by supplier name in project name/counterparty
            for p in projs:
                if counterparty and p.counterparty_company and counterparty in p.counterparty_company:
                    contract.project_id = p.id
                    synced.append(f"关联项目: {p.project_code} {p.name}")
                    break

    # ─── Auto-create FleetCustomer for charging service contracts ───
    if contract_type in ("charging_service", "operation"):
        from app.models.charging import FleetCustomer
        existing = (await db.execute(
            select(FleetCustomer).where(
                FleetCustomer.fleet_name.ilike(f"%{counterparty}%"),
                FleetCustomer.is_deleted == False,
                FleetCustomer.company_id == company_id,
            )
        )).scalar_one_or_none()

        if not existing and counterparty:
            from app.api.deps.auth import generate_no
            fc = FleetCustomer(
                fleet_name=counterparty,
                fleet_code=generate_no("FC"),
                contact_person=counterparty,
                status="active",
                balance=0,
                total_charged_kwh=0,
                total_payment=0,
                company_id=company_id,
                created_by=user_id,
            )
            db.add(fc)
            await db.flush()
            synced.append(f"自动创建客户: {counterparty}")

    # ─── Auto-create ProjectLine for cost tracking ───
    if contract.project_id and contract.total_amount:
        from app.services.project_cost import ProjectCostService
        await ProjectCostService.allocate_cost(
            project_id=str(contract.project_id),
            line_type="contract",
            amount=float(contract.total_amount),
            source_id=str(contract.id),
            source_type="Contract",
            source_no=contract.contract_no,
            db=db,
            company_id=company_id,
            user_id=user_id,
            description=f"合同 {contract.contract_no}: {contract.name}",
        )
        synced.append(f"项目成本归集: ¥{float(contract.total_amount):.2f}")

    await db.flush()
    return synced


async def cascade_on_contract_status_change(
    contract, old_status: str, db: AsyncSession, company_id: str, user_id: str
) -> list[str]:
    """Run cascades when contract status changes."""
    synced = []
    new_status = contract.status

    # ─── Contract activated → create AP record if needed ───
    if new_status == "active" and old_status != "active":
        from app.models.finance import ArApRecord
        existing_arap = (await db.execute(
            select(ArApRecord).where(
                ArApRecord.business_id == str(contract.id),
                ArApRecord.business_type == "contract",
                ArApRecord.is_deleted == False,
                ArApRecord.company_id == company_id,
            )
        )).scalar_one_or_none()

        if not existing_arap and contract.total_amount:
            our_role, counterparty, _ = _identify_our_role(contract)
            arap_type = "ar" if our_role == "party_b" else "ap"
            arap = ArApRecord(
                type=arap_type,
                business_type="contract",
                business_id=str(contract.id),
                source_no=contract.contract_no,
                counterparty=counterparty,
                total_amount=float(contract.total_amount),
                settled_amount=0,
                remaining_amount=float(contract.total_amount),
                status="pending",
                project_id=contract.project_id,
                contract_id=contract.id,
                company_id=company_id,
                created_by=user_id,
            )
            db.add(arap)
            synced.append(f"自动创建{'应收 if arap_type == "ar" else 应付'}记录: ¥{float(contract.total_amount):.2f}")

    # ─── Contract completed → trigger project completion check ───
    if new_status in ("completed", "closed") and contract.project_id:
        synced.append(f"合同已{new_status}，请检查项目状态是否需同步更新")

    await db.flush()
    return synced
