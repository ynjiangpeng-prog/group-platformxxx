
import json
import hashlib
from functools import wraps
from typing import Optional, Any
import redis
from app.core.config import REDIS_URL

redis_pool = redis.ConnectionPool.from_url(REDIS_URL, decode_responses=True)
redis_client = redis.Redis(connection_pool=redis_pool)

def cache_key(prefix, *args, **kwargs):
    key_data = f'{prefix}:' + json.dumps(args, sort_keys=True, default=str) + ':' + json.dumps(kwargs, sort_keys=True, default=str)
    return f'yc:{prefix}:' + hashlib.md5(key_data.encode()).hexdigest()

def cached(ttl=300, prefix='default'):
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            cache_args = [a for a in args if not hasattr(a, 'execute')]
            cache_kwargs = {k: v for k, v in kwargs.items() if k not in ('db', 'session')}
            key = cache_key(prefix, func.__name__, *cache_args, **cache_kwargs)
            try:
                cached_data = redis_client.get(key)
                if cached_data:
                    return json.loads(cached_data)
            except Exception:
                pass
            result = await func(*args, **kwargs)
            try:
                redis_client.setex(key, ttl, json.dumps(result, default=str))
            except Exception:
                pass
            return result
        return async_wrapper
    return decorator

def invalidate_cache(pattern):
    try:
        keys = redis_client.scan_iter(match=f'yc:{pattern}:*')
        for key in keys:
            redis_client.delete(key)
    except Exception:
        pass

def get_cache_status():
    try:
        info = redis_client.info()
        return {
            'status': 'connected',
            'used_memory_human': info.get('used_memory_human', 'N/A'),
            'connected_clients': info.get('connected_clients', 0),
            'total_keys': redis_client.dbsize(),
        }
    except Exception as e:
        return {'status': 'error', 'error': str(e)}
