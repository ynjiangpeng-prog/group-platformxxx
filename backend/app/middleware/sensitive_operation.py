"""
敏感操作二次确认中间件
拦截敏感操作，要求确认码
"""
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from app.services.sensitive_op_service import sensitive_op

class SensitiveOperationMiddleware(BaseHTTPMiddleware):
    """敏感操作二次确认中间件"""
    
    # 白名单路径（不需要确认）
    WHITELIST = [
        "/api/health",
        "/api/docs",
        "/api/v1/auth/",
        "/api/v1/webhooks/",
        "/api/v1/alerts/",
    ]
    
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        method = request.method
        
        # 白名单跳过
        if any(path.startswith(w) for w in self.WHITELIST):
            return await call_next(request)
        
        # 只拦截DELETE请求和敏感POST/PUT
        if method == "DELETE" or (method in ["POST", "PUT"] and sensitive_op.is_sensitive_operation(request)):
            # 获取确认码
            confirm_code = request.headers.get("X-Confirm-Code")
            
            # 获取用户信息（如果已认证）
            user_id = "anonymous"
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                # 简化处理，实际应解析JWT
                user_id = "authenticated"
            
            operation = f"{method}:{path}"
            
            try:
                await sensitive_op.require_confirmation(user_id, operation, confirm_code)
            except Exception as e:
                if hasattr(e, 'status_code') and e.status_code == 428:
                    # 需要确认码
                    return JSONResponse(
                        status_code=428,
                        content=e.detail
                    )
                elif hasattr(e, 'status_code') and e.status_code == 403:
                    return JSONResponse(
                        status_code=403,
                        content={"detail": e.detail}
                    )
        
        return await call_next(request)
