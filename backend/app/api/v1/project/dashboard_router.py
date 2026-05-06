"""
项目成本看板 API路由
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.services.project_dashboard import project_dashboard

router = APIRouter(prefix="/project/dashboard", tags=["项目成本看板"])


@router.get("/{project_id}")
async def get_project_cost_detail(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取项目成本详情"""
    return await project_dashboard.get_project_cost_detail(
        db, project_id, str(current_user.company_id)
    )


@router.get("/company/summary")
async def get_company_projects_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取公司所有项目汇总"""
    return await project_dashboard.get_company_projects_summary(
        db, str(current_user.company_id)
    )
