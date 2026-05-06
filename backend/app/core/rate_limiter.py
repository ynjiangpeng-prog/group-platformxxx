import time
from functools import wraps
from fastapi import HTTPException, Request

# Simple in-memory rate limiter
# In production, use Redis for distributed rate limiting
_rate_limit_store = {}

def rate_limit(max_requests=5, window_seconds=60):
    """Rate limit decorator for FastAPI endpoints.
    
    Args:
        max_requests: Maximum number of requests allowed in the window
        window_seconds: Time window in seconds
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Find request object in args/kwargs
            request = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
            if not request:
                for v in kwargs.values():
                    if isinstance(v, Request):
                        request = v
                        break
            
            if request:
                client_ip = request.client.host if request.client else "unknown"
                key = f"{client_ip}:{func.__name__}"
                now = time.time()
                
                # Clean old entries
                if key in _rate_limit_store:
                    _rate_limit_store[key] = [t for t in _rate_limit_store[key] if now - t < window_seconds]
                else:
                    _rate_limit_store[key] = []
                
                # Check limit
                if len(_rate_limit_store[key]) >= max_requests:
                    raise HTTPException(
                        status_code=429,
                        detail=f"请求过于频繁，请{window_seconds}秒后重试"
                    )
                
                _rate_limit_store[key].append(now)
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator
