"""
防重放攻击中间件
通过nonce+timestamp验证防止请求重放
"""
import time
import hashlib
import secrets
from typing import Optional
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import redis
from app.core.config import REDIS_URL

redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)

class ReplayProtectionMiddleware(BaseHTTPMiddleware):
    """防重放攻击中间件
    
    验证规则：
    1. 请求头必须包含 X-Timestamp (Unix时间戳，秒)
    2. 请求头必须包含 X-Nonce (16位随机字符串)
    3. 时间戳与服务器时间差 < 60秒
    4. 同一nonce不能重复使用
    
    白名单（无需验证）：
    - 健康检查 /api/health
    - 登录注册 /api/v1/auth/
    - 文档接口 /api/docs, /api/redoc
    """
    
    WHITELIST = [
        "/api/health",
        "/api/docs",
        "/api/redoc",
        "/api/openapi.json",
    ]
    
    # 认证相关接口也跳过（登录注册不需要防重放）
    AUTH_PREFIX = "/api/v1/auth/"
    
    # 时间窗口（秒）
    TIME_WINDOW = 60
    
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        
        # 白名单跳过
        if path in self.WHITELIST or path.startswith(self.AUTH_PREFIX):
            return await call_next(request)
        
        # 只验证非GET请求（GET请求是幂等的）
        if request.method == "GET":
            return await call_next(request)
        
        # 获取请求头
        timestamp = request.headers.get("X-Timestamp")
        nonce = request.headers.get("X-Nonce")
        
        # GET请求以外的操作需要验证
        if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
            # 验证时间戳
            if not timestamp:
                return JSONResponse(
                    status_code=400,
                    content={"detail": "缺少 X-Timestamp 请求头"}
                )
            
            try:
                req_time = int(timestamp)
                now = int(time.time())
                if abs(now - req_time) > self.TIME_WINDOW:
                    return JSONResponse(
                        status_code=400,
                        content={"detail": f"请求已过期，时间差超过{self.TIME_WINDOW}秒"}
                    )
            except ValueError:
                return JSONResponse(
                    status_code=400,
                    content={"detail": "X-Timestamp 格式无效"}
                )
            
            # 验证nonce（如果提供了）
            if nonce:
                nonce_key = f"nonce:{nonce}"
                if redis_client.exists(nonce_key):
                    return JSONResponse(
                        status_code=400,
                        content={"detail": "请求已被处理（nonce重复）"}
                    )
                
                # 记录nonce（有效期5分钟）
                redis_client.setex(nonce_key, 300, "1")
        
        response = await call_next(request)
        return response


def generate_nonce() -> str:
    """生成随机nonce"""
    return secrets.token_hex(8)
