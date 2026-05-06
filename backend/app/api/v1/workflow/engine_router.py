import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.models.workflow.engine import ProjectTypeTemplate, ProjectStage, StageTransition
from app.services.workflow_engine import WorkflowEngine

router = APIRouter(prefix="/workflow/engine", tags=["项目流程引擎"])


class TemplateStageItem(BaseModel):
    name: str
    code: str
    order: int
    required_docs: list[str] | None = None
    auto_actions: list[str] | None = None
    approval_required: bool | None = None
    location_required: bool | None = None
    warranty_months: int | None = None
    decision_fields: dict | None = None


class TypeTemplateCreate(BaseModel):
    name: str = Field(..., max_length=100)
    code: str = Field(..., max_length=50)
    description: str | None = None
    closure_type: str | None = None
    stages: list[TemplateStageItem]


class TypeTemplateOut(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    description: str | None
    closure_type: str | None
    stages: list | dict | None
    model_config = {"from_attributes": True}


class ProjectFromTemplateCreate(BaseModel):
    project_type_code: str
    project_data: dict


class AdvanceStageRequest(BaseModel):
    target_stage_code: str
    action: str = Field(..., pattern="^(start|complete|skip|rollback)$")
    data: dict | None = None


class StageDocumentUpload(BaseModel):
    stage_code: str
    doc_type: str
    file_name: str
    file_url: str
    file_size: int | None = None
    mime_type: str | None = None


@router.get("/templates")
async def list_templates(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ProjectTypeTemplate).where(
        ProjectTypeTemplate.is_deleted == False,
        ProjectTypeTemplate.company_id == current_user.company_id,
    )
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(ProjectTypeTemplate.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.get("/templates/{code}", response_model=TypeTemplateOut)
async def get_template(
    code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectTypeTemplate).where(
            ProjectTypeTemplate.code == code,
            ProjectTypeTemplate.company_id == current_user.company_id,
            ProjectTypeTemplate.is_deleted == False,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    return template


@router.post("/templates", response_model=TypeTemplateOut)
async def create_or_update_template(
    body: TypeTemplateCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectTypeTemplate).where(
            ProjectTypeTemplate.code == body.code,
            ProjectTypeTemplate.company_id == current_user.company_id,
            ProjectTypeTemplate.is_deleted == False,
        )
    )
    existing = result.scalar_one_or_none()
    stages_data = [s.model_dump() for s in body.stages]

    if existing:
        existing.name = body.name
        existing.description = body.description
        existing.closure_type = body.closure_type
        existing.stages = stages_data
        existing.updated_by = current_user.id
        await db.flush()
        await db.refresh(existing)
        return existing

    template = ProjectTypeTemplate(
        name=body.name,
        code=body.code,
        description=body.description,
        closure_type=body.closure_type,
        stages=stages_data,
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return template


@router.post("/projects/create")
async def create_project_from_template(
    body: ProjectFromTemplateCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    engine = WorkflowEngine(db)
    try:
        result = await engine.create_project_from_template(
            project_type_code=body.project_type_code,
            project_data=body.project_data,
            company_id=current_user.company_id,
            user_id=current_user.id,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/projects/{project_id}/progress")
async def get_project_progress(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    engine = WorkflowEngine(db)
    return await engine.get_project_progress(project_id, current_user.company_id)


@router.post("/projects/{project_id}/advance")
async def advance_stage(
    project_id: str,
    body: AdvanceStageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    engine = WorkflowEngine(db)
    try:
        result = await engine.advance_stage(
            project_id=project_id,
            target_stage_code=body.target_stage_code,
            action=body.action,
            data=body.data,
            company_id=current_user.company_id,
            user_id=current_user.id,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/projects/{project_id}/skip-stage")
async def skip_stage(
    project_id: str,
    body: AdvanceStageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    body.action = "skip"
    engine = WorkflowEngine(db)
    try:
        result = await engine.advance_stage(
            project_id=project_id,
            target_stage_code=body.target_stage_code,
            action="skip",
            data=body.data,
            company_id=current_user.company_id,
            user_id=current_user.id,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/projects/{project_id}/rollback")
async def rollback_stage(
    project_id: str,
    body: AdvanceStageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    engine = WorkflowEngine(db)
    try:
        result = await engine.advance_stage(
            project_id=project_id,
            target_stage_code=body.target_stage_code,
            action="rollback",
            data=body.data,
            company_id=current_user.company_id,
            user_id=current_user.id,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/projects/{project_id}/timeline")
async def get_project_timeline(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    engine = WorkflowEngine(db)
    return await engine.get_project_timeline(project_id, current_user.company_id)


@router.get("/projects/{project_id}/stage-documents")
async def list_stage_documents(
    project_id: str,
    stage_code: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    engine = WorkflowEngine(db)
    progress = await engine.get_project_progress(project_id, current_user.company_id)
    stages = progress.get("stages", [])

    if stage_code:
        return await engine.get_stage_documents(project_id, stage_code, current_user.company_id)

    all_docs = []
    for s in stages:
        docs = await engine.get_stage_documents(project_id, s["stage_code"], current_user.company_id)
        all_docs.extend(docs)
    return all_docs


@router.post("/projects/{project_id}/stage-documents")
async def upload_stage_document(
    project_id: str,
    body: StageDocumentUpload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    engine = WorkflowEngine(db)
    return await engine.upload_stage_document(
        project_id=project_id,
        stage_code=body.stage_code,
        doc_data=body.model_dump(),
        company_id=current_user.company_id,
        user_id=current_user.id,
    )


@router.get("/projects/{project_id}/cost-breakdown")
async def get_cost_breakdown(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    engine = WorkflowEngine(db)
    return await engine.get_cost_breakdown_by_stage(project_id, current_user.company_id)
