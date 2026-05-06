import random
import time
from functools import wraps
from typing import AsyncGenerator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.core.security import decode_token
from app.models.organization import Permission, RolePermission, User, UserPermission, UserRole

security = HTTPBearer()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except BaseException:
            await session.rollback()
            raise


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效的认证凭证")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效的认证凭证")

    result = await db.execute(select(User).where(User.id == user_id, User.is_deleted == False))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在")

    if user.status != 1:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已被禁用")

    return user


async def get_user_permissions(user: User, db: AsyncSession) -> set[str]:
    if user.is_super_admin:
        return {"*"}
    result = await db.execute(
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(UserRole, UserRole.role_id == RolePermission.role_id)
        .where(
            UserRole.user_id == user.id,
            UserRole.is_deleted == False,
            RolePermission.is_deleted == False,
            Permission.is_deleted == False,
            Permission.status == 1,
        )
    )
    perms = {row[0] for row in result.all()}

    direct_result = await db.execute(
        select(Permission.code)
        .join(UserPermission, UserPermission.permission_id == Permission.id)
        .where(
            UserPermission.user_id == user.id,
            UserPermission.is_deleted == False,
            Permission.is_deleted == False,
            Permission.status == 1,
        )
    )
    perms.update(row[0] for row in direct_result.all())
    return perms


def require_permissions(*permission_codes: str):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db), **kwargs):
            if current_user.is_super_admin:
                return await func(*args, current_user=current_user, **kwargs)
            user_perms = await get_user_permissions(current_user, db)
            if "*" in user_perms:
                return await func(*args, current_user=current_user, **kwargs)
            for code in permission_codes:
                if code in user_perms:
                    return await func(*args, current_user=current_user, **kwargs)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"权限不足，需要: {', '.join(permission_codes)}",
            )
        return wrapper
    return decorator


def generate_no(prefix: str) -> str:
    ts = int(time.time() * 1000) % 1_000_000_000
    rand = random.randint(100, 999)
    return f"{prefix}{ts:09d}{rand}"
