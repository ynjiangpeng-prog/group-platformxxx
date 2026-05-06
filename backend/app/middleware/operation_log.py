import json
import uuid
from datetime import datetime

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.types import ASGIApp

from app.core.database import async_session_factory
from app.models.system.models import OperationLog

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
SKIP_PATHS = {"/api/docs", "/api/redoc", "/api/openapi.json", "/api/health", "/api/v1/auth/login", "/api/v1/auth/refresh"}


class OperationLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        path = request.url.path

        if request.method not in WRITE_METHODS or any(path.startswith(s) for s in SKIP_PATHS):
            return response

        try:
            company_id = None
            user_id = None
            username = None
            auth_header = request.headers.get("authorization", "")
            if auth_header.startswith("Bearer "):
                from app.core.security import decode_token
                payload = decode_token(auth_header[7:])
                if payload:
                    user_id = payload.get("sub")
                    from sqlalchemy import select
                    from app.models.organization import User
                    async with async_session_factory() as db:
                        result = await db.execute(select(User).where(User.id == user_id))
                        user = result.scalar_one_or_none()
                        if user:
                            company_id = str(user.company_id)
                            username = user.username

            parts = path.strip("/").split("/")
            module = parts[2] if len(parts) > 2 else "unknown"
            target_id = parts[-1] if len(parts) > 3 and parts[-1] != parts[2] else None

            action_map = {"POST": "create", "PUT": "update", "PATCH": "update", "DELETE": "delete"}
            action = action_map.get(request.method, request.method)

            log = OperationLog(
                id=str(uuid.uuid4()),
                company_id=company_id or "00000000-0000-0000-0000-000000000001",
                user_id=user_id,
                username=username,
                module=module,
                action=action,
                target_type=parts[3] if len(parts) > 3 else None,
                target_id=target_id,
                detail=path,
                ip=request.client.host if request.client else None,
            )
            async with async_session_factory() as db:
                db.add(log)
                await db.commit()
        except Exception:
            pass

        return response
