import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db, require_permissions
from app.core.security import get_password_hash
from app.models.organization import (
    Company, Department, Permission, Role, RolePermission, User,
    UserCompanyDepartment, UserPermission, UserRole,
)

router = APIRouter(prefix="/organization", tags=["组织架构"])


class CompanyCreate(BaseModel):
    name: str = Field(..., max_length=200)
    short_name: str | None = None
    code: str = Field(..., max_length=20)
    company_type: str
    unified_credit_code: str | None = None
    legal_person: str | None = None
    address: str | None = None
    business_scope: str | None = None
    parent_id: str | None = None
    contact_phone: str | None = None
    logo_url: str | None = None


class CompanyUpdate(BaseModel):
    name: str | None = None
    short_name: str | None = None
    company_type: str | None = None
    unified_credit_code: str | None = None
    legal_person: str | None = None
    address: str | None = None
    business_scope: str | None = None
    parent_id: str | None = None
    contact_phone: str | None = None
    logo_url: str | None = None
    status: int | None = None


class CompanyOut(BaseModel):
    id: uuid.UUID
    name: str
    short_name: str | None
    code: str
    company_type: str
    unified_credit_code: str | None
    legal_person: str | None
    address: str | None
    status: int
    parent_id: uuid.UUID | None
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


@router.get("/companies")
async def list_companies(
    keyword: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Company).where(Company.is_deleted == False)
    if keyword:
        query = query.where(Company.name.ilike(f"%{keyword}%"))
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(Company.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/companies", response_model=CompanyOut)
async def create_company(body: CompanyCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not current_user.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权创建公司")
    company = Company(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(company)
    await db.flush()
    await db.refresh(company)
    return company


@router.get("/companies/{company_id}", response_model=CompanyOut)
async def get_company(company_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Company).where(Company.id == company_id, Company.is_deleted == False))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="公司不存在")
    return company


@router.put("/companies/{company_id}", response_model=CompanyOut)
async def update_company(company_id: str, body: CompanyUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not current_user.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权修改公司")
    result = await db.execute(select(Company).where(Company.id == company_id, Company.is_deleted == False))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="公司不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(company, k, v)
    company.updated_by = current_user.id
    await db.flush()
    await db.refresh(company)
    return company


@router.delete("/companies/{company_id}")
async def delete_company(company_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not current_user.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权删除公司")
    await db.execute(update(Company).where(Company.id == company_id).values(is_deleted=True))
    return {"message": "删除成功"}


class DepartmentCreate(BaseModel):
    name: str = Field(..., max_length=100)
    code: str | None = None
    parent_id: str | None = None
    manager_id: str | None = None
    sort_order: int = 0


class DepartmentUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    parent_id: str | None = None
    manager_id: str | None = None
    sort_order: int | None = None
    status: int | None = None


class DepartmentOut(BaseModel):
    id: uuid.UUID
    name: str
    code: str | None
    parent_id: uuid.UUID | None
    manager_id: uuid.UUID | None
    sort_order: int
    status: int
    model_config = {"from_attributes": True}


@router.get("/departments")
async def list_departments(
    parent_id: str | None = None,
    keyword: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Department).where(Department.is_deleted == False, Department.company_id == current_user.company_id)
    if parent_id is not None:
        query = query.where(Department.parent_id == parent_id)
    if keyword:
        query = query.where(Department.name.ilike(f"%{keyword}%"))
    query = query.order_by(Department.sort_order, Department.created_at)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/departments", response_model=DepartmentOut)
async def create_department(body: DepartmentCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    dept = Department(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(dept)
    await db.flush()
    await db.refresh(dept)
    return dept


@router.get("/departments/{dept_id}", response_model=DepartmentOut)
async def get_department(dept_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Department).where(Department.id == dept_id, Department.is_deleted == False))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="部门不存在")
    return dept


@router.put("/departments/{dept_id}", response_model=DepartmentOut)
async def update_department(dept_id: str, body: DepartmentUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Department).where(Department.id == dept_id, Department.is_deleted == False))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="部门不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(dept, k, v)
    dept.updated_by = current_user.id
    await db.flush()
    await db.refresh(dept)
    return dept


@router.delete("/departments/{dept_id}")
async def delete_department(dept_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(Department).where(Department.id == dept_id).values(is_deleted=True))
    return {"message": "删除成功"}


class UserCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    password: str = Field(..., min_length=6)
    real_name: str | None = None
    phone: str | None = None
    email: str | None = None
    gender: int = 0
    status: int = 1
    is_super_admin: bool = False


class UserUpdate(BaseModel):
    real_name: str | None = None
    phone: str | None = None
    email: str | None = None
    gender: int | None = None
    status: int | None = None
    is_super_admin: bool | None = None


class UserOut(BaseModel):
    id: uuid.UUID
    username: str
    real_name: str | None
    phone: str | None
    email: str | None
    avatar_url: str | None
    gender: int
    status: int
    is_super_admin: bool
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


@router.get("/users")
async def list_users(
    keyword: str | None = None,
    user_status: int | None = None,
    department_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(User).where(User.is_deleted == False, User.company_id == current_user.company_id)
    if keyword:
        query = query.where((User.username.ilike(f"%{keyword}%")) | (User.real_name.ilike(f"%{keyword}%")) | (User.phone.ilike(f"%{keyword}%")))
    if user_status is not None:
        query = query.where(User.status == user_status)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/users", response_model=UserOut)
async def create_user(body: UserCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="用户名已存在")
    user = User(
        username=body.username, password_hash=get_password_hash(body.password),
        real_name=body.real_name, phone=body.phone, email=body.email,
        gender=body.gender, status=body.status, is_super_admin=body.is_super_admin,
        company_id=current_user.company_id, created_by=current_user.id,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.get("/users/{user_id}", response_model=UserOut)
async def get_user(user_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id, User.is_deleted == False))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user


@router.put("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: str, body: UserUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id, User.is_deleted == False))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(user, k, v)
    user.updated_by = current_user.id
    await db.flush()
    await db.refresh(user)
    return user


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(User).where(User.id == user_id).values(is_deleted=True))
    return {"message": "删除成功"}


@router.put("/users/{user_id}/reset-password")
async def reset_password(user_id: str, body: dict, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
                         _perm=Depends(require_permissions("user:reset_password"))):
    new_password = body.get("password") or body.get("new_password", "")
    if not new_password:
        raise HTTPException(status_code=400, detail="密码不能为空")
    await db.execute(update(User).where(User.id == user_id).values(password_hash=get_password_hash(new_password)))
    return {"message": "密码重置成功"}


@router.put("/users/{user_id}/status")
async def toggle_user_status(user_id: str, body: dict, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
                             _perm=Depends(require_permissions("user:update"))):
    new_status = body.get("status", body.get("new_status", 1))
    await db.execute(update(User).where(User.id == user_id).values(status=new_status))
    return {"message": "状态更新成功"}


@router.put("/users/{user_id}/roles")
async def assign_user_roles(user_id: str, body: dict, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    role_ids = body.get("role_ids", [])
    await db.execute(update(UserRole).where(UserRole.user_id == user_id).values(is_deleted=True))
    for rid in role_ids:
        db.add(UserRole(user_id=user_id, role_id=rid, company_id=current_user.company_id, created_by=current_user.id))
    return {"message": "角色分配成功"}


@router.get("/users/{user_id}/permissions")
async def get_user_direct_permissions(user_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(UserPermission.permission_id).where(
            UserPermission.user_id == user_id,
            UserPermission.is_deleted == False,
        )
    )
    return [str(r[0]) for r in result.all()]


@router.put("/users/{user_id}/permissions")
async def assign_user_direct_permissions(user_id: str, body: dict, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    permission_ids = body.get("permission_ids", [])
    await db.execute(update(UserPermission).where(UserPermission.user_id == user_id).values(is_deleted=True))
    for pid in permission_ids:
        db.add(UserPermission(user_id=user_id, permission_id=pid, company_id=current_user.company_id, created_by=current_user.id))
    return {"message": "权限分配成功"}


class RoleCreate(BaseModel):
    name: str = Field(..., max_length=50)
    code: str = Field(..., max_length=50)
    description: str | None = None
    data_scope: int = 2


class RoleUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    description: str | None = None
    data_scope: int | None = None


class RoleOut(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    description: str | None
    data_scope: int
    is_system: bool
    model_config = {"from_attributes": True}


@router.get("/roles")
async def list_roles(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Role).where(Role.is_deleted == False, Role.company_id == current_user.company_id)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(Role.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/roles", response_model=RoleOut)
async def create_role(body: RoleCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    role = Role(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(role)
    await db.flush()
    await db.refresh(role)
    return role


@router.get("/roles/{role_id}", response_model=RoleOut)
async def get_role(role_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Role).where(Role.id == role_id, Role.is_deleted == False))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    return role


@router.get("/roles/{role_id}/permissions")
async def get_role_permissions(role_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RolePermission.permission_id).where(RolePermission.role_id == role_id, RolePermission.is_deleted == False)
    )
    return [str(r[0]) for r in result.all()]


@router.put("/roles/{role_id}", response_model=RoleOut)
async def update_role(role_id: str, body: RoleUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Role).where(Role.id == role_id, Role.is_deleted == False))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(role, k, v)
    role.updated_by = current_user.id
    await db.flush()
    await db.refresh(role)
    return role


@router.delete("/roles/{role_id}")
async def delete_role(role_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if role and role.is_system:
        raise HTTPException(status_code=400, detail="系统角色不可删除")
    await db.execute(update(Role).where(Role.id == role_id).values(is_deleted=True))
    return {"message": "删除成功"}


@router.put("/roles/{role_id}/permissions")
async def assign_role_permissions(role_id: str, body: dict, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    permission_ids = body.get("permission_ids", [])
    await db.execute(update(RolePermission).where(RolePermission.role_id == role_id).values(is_deleted=True))
    for pid in permission_ids:
        db.add(RolePermission(role_id=role_id, permission_id=pid, company_id=current_user.company_id, created_by=current_user.id))
    return {"message": "权限分配成功"}


class PermissionCreate(BaseModel):
    parent_id: str | None = None
    name: str = Field(..., max_length=50)
    code: str = Field(..., max_length=100)
    type: int
    path: str | None = None
    icon: str | None = None
    sort_order: int = 0


class PermissionUpdate(BaseModel):
    parent_id: str | None = None
    name: str | None = None
    code: str | None = None
    type: int | None = None
    path: str | None = None
    icon: str | None = None
    sort_order: int | None = None
    status: int | None = None


class PermissionOut(BaseModel):
    id: uuid.UUID
    parent_id: uuid.UUID | None
    name: str
    code: str
    type: int
    path: str | None
    icon: str | None
    sort_order: int
    status: int
    model_config = {"from_attributes": True}


@router.get("/permissions")
async def list_permissions(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    query = select(Permission).where(Permission.is_deleted == False, Permission.company_id == current_user.company_id)
    query = query.order_by(Permission.sort_order, Permission.created_at)
    result = await db.execute(query)
    perms = result.scalars().all()
    out = []
    for p in perms:
        d = {
            "id": str(p.id),
            "name": p.name,
            "code": p.code,
            "type": p.type,
            "module": p.code.split(":")[0] if ":" in p.code else p.code,
            "action": p.code.split(":")[1] if ":" in p.code else "",
            "sort_order": p.sort_order,
            "status": p.status,
        }
        out.append(d)
    return out


@router.post("/permissions", response_model=PermissionOut)
async def create_permission(body: PermissionCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    perm = Permission(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(perm)
    await db.flush()
    await db.refresh(perm)
    return perm


@router.put("/permissions/{perm_id}", response_model=PermissionOut)
async def update_permission(perm_id: str, body: PermissionUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Permission).where(Permission.id == perm_id, Permission.is_deleted == False))
    perm = result.scalar_one_or_none()
    if not perm:
        raise HTTPException(status_code=404, detail="权限不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(perm, k, v)
    perm.updated_by = current_user.id
    await db.flush()
    await db.refresh(perm)
    return perm


@router.delete("/permissions/{perm_id}")
async def delete_permission(perm_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(Permission).where(Permission.id == perm_id).values(is_deleted=True))
    return {"message": "删除成功"}
