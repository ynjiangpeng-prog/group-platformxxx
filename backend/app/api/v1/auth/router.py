from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db, require_permissions
from app.core.security import (
    create_access_token, create_refresh_token, decode_token,
    verify_password, get_password_hash,
)
from app.core.rate_limiter import rate_limit
from app.models.organization import User

router = APIRouter(prefix="/auth", tags=["认证"])


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=6)


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    password: str = Field(..., min_length=6)
    real_name: str | None = None
    phone: str | None = None
    company_id: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str
    real_name: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == req.username, User.is_deleted == False))
    user = result.scalar_one_or_none()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    if user.status != 1:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已被禁用")
    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})
    return TokenResponse(access_token=access_token, refresh_token=refresh_token, user_id=str(user.id), real_name=user.real_name)


@router.post("/register", response_model=TokenResponse)
@rate_limit(max_requests=3, window_seconds=300)
async def register(req: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.username == req.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="用户名已存在")
    company_id = req.company_id or "00000000-0000-0000-0000-000000000001"
    user = User(
        company_id=company_id, username=req.username,
        password_hash=get_password_hash(req.password),
        real_name=req.real_name, phone=req.phone, status=1,
    )
    db.add(user)
    await db.flush()
    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})
    return TokenResponse(access_token=access_token, refresh_token=refresh_token, user_id=str(user.id), real_name=user.real_name)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(req.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="无效的刷新令牌")
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id, User.is_deleted == False))
    user = result.scalar_one_or_none()
    if not user or user.status != 1:
        raise HTTPException(status_code=401, detail="用户不存在或已禁用")
    return TokenResponse(
        access_token=create_access_token(data={"sub": str(user.id)}),
        refresh_token=create_refresh_token(data={"sub": str(user.id)}),
        user_id=str(user.id), real_name=user.real_name,
    )


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.api.deps.auth import get_user_permissions
    from app.models.organization import Company, UserRole, Role

    perms = await get_user_permissions(current_user, db)

    company_result = await db.execute(select(Company).where(Company.id == current_user.company_id))
    company = company_result.scalar_one_or_none()

    role_result = await db.execute(
        select(Role.name).join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == current_user.id, UserRole.is_deleted == False)
    )
    roles = [r[0] for r in role_result.all()]

    return {
        "id": str(current_user.id), "username": current_user.username,
        "real_name": current_user.real_name, "phone": current_user.phone,
        "email": current_user.email, "avatar_url": current_user.avatar_url,
        "is_super_admin": current_user.is_super_admin, "status": current_user.status,
        "company_id": str(current_user.company_id),
        "company_name": company.name if company else None,
        "roles": roles,
        "permissions": list(perms),
    }


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6)


@router.put("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="原密码错误")
    await db.execute(
        update(User).where(User.id == current_user.id).values(password_hash=get_password_hash(body.new_password))
    )
    return {"message": "密码修改成功"}
