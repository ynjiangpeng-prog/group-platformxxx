from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.services.excel_template import (
    APPROVE_CONFIG,
    DEFAULT_APPROVE,
    ENTITY_MODEL_MAP,
    TEMPLATE_REGISTRY,
    batch_importer,
    export_to_excel,
    template_gen,
)

router = APIRouter(prefix="/batch", tags=["批量操作"])

IMPORT_METHOD_MAP = {
    "contract": batch_importer.import_contracts,
    "invoice": batch_importer.import_invoices,
    "expense": batch_importer.import_expenses,
    "project": batch_importer.import_projects,
    "station": batch_importer.import_stations,
    "supplier": batch_importer.import_suppliers,
    "work_hour": batch_importer.import_work_hours,
    "fleet": batch_importer.import_fleets,
    "device": batch_importer.import_devices,
    "construction_log": batch_importer.import_construction_logs,
}


class BatchIdRequest(BaseModel):
    entity_type: str = Field(..., min_length=1)
    ids: list[str] = Field(..., min_length=1)


class BatchExportRequest(BaseModel):
    entity_type: str = Field(..., min_length=1)
    filters: dict | None = None
    columns: list[str] | None = None


@router.get("/templates/{template_type}/download")
async def download_template(
    template_type: str,
    current_user: User = Depends(get_current_user),
):
    if template_type not in TEMPLATE_REGISTRY:
        raise HTTPException(status_code=400, detail=f"不支持模板类型: {template_type}")
    try:
        buffer = template_gen.generate(template_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    filename = TEMPLATE_REGISTRY[template_type]["sheet_name"]
    from urllib.parse import quote
    encoded = quote(f"{filename}.xlsx")
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )


@router.post("/{entity_type}/import")
async def batch_import(
    entity_type: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if entity_type not in IMPORT_METHOD_MAP:
        raise HTTPException(status_code=400, detail=f"不支持导入的实体类型: {entity_type}")
    if not file.filename or not file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="仅支持.xlsx格式文件")
    content = await file.read()
    import_fn = IMPORT_METHOD_MAP[entity_type]
    result = await import_fn(content, db, current_user)
    return result


@router.post("/approve")
async def batch_approve(
    body: BatchIdRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    model_cls = ENTITY_MODEL_MAP.get(body.entity_type)
    if not model_cls:
        raise HTTPException(status_code=400, detail=f"不支持的实体类型: {body.entity_type}")
    approve_cfg = APPROVE_CONFIG.get(body.entity_type, DEFAULT_APPROVE)
    field_name = approve_cfg["field"]
    approve_value = approve_cfg["value"]
    if not hasattr(model_cls, field_name):
        raise HTTPException(status_code=400, detail=f"该实体不支持审批操作")
    result = await db.execute(
        update(model_cls)
        .where(
            model_cls.id.in_(body.ids),
            model_cls.is_deleted == False,
            model_cls.company_id == current_user.company_id,
        )
        .values(**{field_name: approve_value, "updated_by": current_user.id})
    )
    return {"updated": result.rowcount}


@router.post("/delete")
async def batch_delete(
    body: BatchIdRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    model_cls = ENTITY_MODEL_MAP.get(body.entity_type)
    if not model_cls:
        raise HTTPException(status_code=400, detail=f"不支持的实体类型: {body.entity_type}")
    result = await db.execute(
        update(model_cls)
        .where(
            model_cls.id.in_(body.ids),
            model_cls.is_deleted == False,
            model_cls.company_id == current_user.company_id,
        )
        .values(is_deleted=True, updated_by=current_user.id)
    )
    return {"deleted": result.rowcount}


@router.post("/export")
async def batch_export(
    body: BatchExportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.entity_type not in TEMPLATE_REGISTRY:
        raise HTTPException(status_code=400, detail=f"不支持导出的实体类型: {body.entity_type}")
    try:
        buffer = await export_to_excel(db, current_user, body.entity_type, body.filters, body.columns)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    filename = TEMPLATE_REGISTRY[body.entity_type]["sheet_name"]
    from urllib.parse import quote
    encoded = quote(f"{filename}.xlsx")
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )
