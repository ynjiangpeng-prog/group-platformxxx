"""
全局API限流中间件
为所有API路由提供统一的限流保护
"""
import time
import hashlib
from typing import Optional, Dict
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import redis
from app.core.config import REDIS_URL

redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)

class RateLimitMiddleware(BaseHTTPMiddleware):
    """全局限流中间件
    
    按IP地址限流：
    - 普通API: 100次/分钟
    - 认证相关: 10次/分钟
    - 文件上传: 20次/分钟
    """
    
    # 限流规则: (prefix, max_requests, window_seconds)
    RULES = [
        ("/api/v1/auth/", 30, 60),      # 认证: 30次/分钟
        ("/api/v1/files/", 20, 60),     # 文件: 20次/分钟
        ("/api/v1/", 100, 60),          # 普通API: 100次/分钟
    ]
    
    async def dispatch(self, request: Request, call_next):
        # 跳过健康检查
        if request.url.path == "/api/health":
            return await call_next(request)
        
        # 获取客户端IP
        client_ip = self._get_client_ip(request)
        path = request.url.path
        
        # 找到匹配的限流规则
        rule = self._find_rule(path)
        if rule:
            prefix, max_requests, window = rule
            key = f"rate_limit:{client_ip}:{prefix}"
            
            current = redis_client.get(key)
            if current and int(current) >= max_requests:
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": "请求过于频繁，请稍后再试",
                        "retry_after": window,
                        "limit": max_requests,
                    }
                )
            
            # 增加计数
            pipe = redis_client.pipeline()
            pipe.incr(key)
            pipe.expire(key, window)
            pipe.execute()
        
        response = await call_next(request)
        
        # 添加限流响应头
        if rule:
            prefix, max_requests, window = rule
            key = f"rate_limit:{client_ip}:{prefix}"
            current = redis_client.get(key) or 0
            remaining = max(0, max_requests - int(current))
            response.headers["X-RateLimit-Limit"] = str(max_requests)
            response.headers["X-RateLimit-Remaining"] = str(remaining)
            response.headers["X-RateLimit-Window"] = str(window)
        
        return response
    
    def _get_client_ip(self, request: Request) -> str:
        """获取客户端真实IP"""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"
    
    def _find_rule(self, path: str) -> Optional[tuple]:
        """查找匹配的限流规则"""
        for prefix, max_req, window in self.RULES:
            if path.startswith(prefix):
                return (prefix, max_req, window)
        return None
