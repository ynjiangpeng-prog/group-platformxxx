from uuid import uuid4

from sqlalchemy import Boolean, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TenantBase


class Company(TenantBase):
    __tablename__ = "companies"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    short_name: Mapped[str | None] = mapped_column(String(50))
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    unified_credit_code: Mapped[str | None] = mapped_column(String(18))
    legal_person: Mapped[str | None] = mapped_column(String(50))
    address: Mapped[str | None] = mapped_column(Text)
    business_scope: Mapped[str | None] = mapped_column(Text)
    company_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[int] = mapped_column(SmallInteger, default=1)
    parent_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    contact_phone: Mapped[str | None] = mapped_column(String(20))
    logo_url: Mapped[str | None] = mapped_column(String(500))


class Department(TenantBase):
    __tablename__ = "departments"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str | None] = mapped_column(String(20))
    parent_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    manager_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    sort_order: Mapped[int] = mapped_column(SmallInteger, default=0)
    status: Mapped[int] = mapped_column(SmallInteger, default=1)


class User(TenantBase):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    real_name: Mapped[str | None] = mapped_column(String(50))
    phone: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(100))
    id_card: Mapped[str | None] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    gender: Mapped[int] = mapped_column(SmallInteger, default=0)
    status: Mapped[int] = mapped_column(SmallInteger, default=1)
    is_super_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login_ip: Mapped[str | None] = mapped_column(String(50))


class UserCompanyDepartment(TenantBase):
    __tablename__ = "user_company_departments"

    user_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    department_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    position: Mapped[str | None] = mapped_column(String(50))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[int] = mapped_column(SmallInteger, default=1)


class Role(TenantBase):
    __tablename__ = "roles"

    name: Mapped[str] = mapped_column(String(50), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    data_scope: Mapped[int] = mapped_column(SmallInteger, default=2)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)


class Permission(TenantBase):
    __tablename__ = "permissions"

    parent_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    type: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    path: Mapped[str | None] = mapped_column(String(200))
    icon: Mapped[str | None] = mapped_column(String(50))
    sort_order: Mapped[int] = mapped_column(SmallInteger, default=0)
    status: Mapped[int] = mapped_column(SmallInteger, default=1)


class RolePermission(TenantBase):
    __tablename__ = "role_permissions"

    role_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    permission_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)


class UserRole(TenantBase):
    __tablename__ = "user_roles"

    user_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    role_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    scope: Mapped[str | None] = mapped_column(String(50))


class UserPermission(TenantBase):
    __tablename__ = "user_permissions"

    user_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    permission_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
