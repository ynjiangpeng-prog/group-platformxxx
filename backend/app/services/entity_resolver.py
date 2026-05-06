from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project.models import CompanyEntity

_YSYD_ENTITY_CODE = "YSD"
_YCNE_ENTITY_CODE = "YCNE"

_ENGINEERING_CONTRACT_TYPES = {
    "epc", "civil_construction", "hv_construction", "lv_construction",
    "ancillary_construction", "transformer_purchase", "cable_purchase",
    "charging_pile_purchase", "electrical_material_purchase",
    "equipment_sale", "service", "supplement",
}

_OPERATION_CONTRACT_TYPES = {
    "land_lease", "cooperation",
}

_PROJECTS_WITH_OPERATION = {"self_invest_build", "cooperative_build"}


async def _get_entity_by_code(db: AsyncSession, company_id: str, code: str) -> str | None:
    result = await db.execute(
        select(CompanyEntity.id).where(
            CompanyEntity.company_id == company_id,
            CompanyEntity.entity_code == code,
            CompanyEntity.is_deleted == False,
        )
    )
    return result.scalar_one_or_none()


async def resolve_project_entities(db: AsyncSession, company_id: str, project_type: str) -> dict:
    eng_entity = await _get_entity_by_code(db, company_id, _YSYD_ENTITY_CODE)
    op_entity = None
    if project_type in _PROJECTS_WITH_OPERATION:
        op_entity = await _get_entity_by_code(db, company_id, _YCNE_ENTITY_CODE)
    return {"entity_id": eng_entity, "operation_entity_id": op_entity}


async def resolve_contract_entity(db: AsyncSession, company_id: str, contract_type: str) -> str | None:
    if contract_type in _OPERATION_CONTRACT_TYPES:
        return await _get_entity_by_code(db, company_id, _YCNE_ENTITY_CODE)
    entity = await _get_entity_by_code(db, company_id, _YSYD_ENTITY_CODE)
    if not entity:
        entity = await _get_entity_by_code(db, company_id, _YCNE_ENTITY_CODE)
    return entity
