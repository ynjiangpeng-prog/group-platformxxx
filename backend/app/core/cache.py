
import json
import hashlib
import asyncio
import logging
from functools import wraps
from typing import Optional, Any
import redis
import redis.asyncio as aioredis
from app.core.config import REDIS_URL

logger = logging.getLogger(__name__)

_redis_pool = aioredis.ConnectionPool.from_url(REDIS_URL, decode_responses=True)
redis_async = aioredis.Redis(connection_pool=_redis_pool)

# Sync client for non-async contexts
_redis_sync = redis.Redis.from_url(REDIS_URL, decode_responses=True)
redis_client = _redis_sync  # backward compat alias


def cache_key(prefix, *args, **kwargs):
    key_data = f'{prefix}:' + json.dumps(args, sort_keys=True, default=str) + ':' + json.dumps(kwargs, sort_keys=True, default=str)
    return f'yc:{prefix}:' + hashlib.md5(key_data.encode()).hexdigest()


def cached(ttl=300, prefix='default'):
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            cache_args = [a for a in args if not hasattr(a, 'execute') and not hasattr(a, 'id')]
            cache_kwargs = {k: v for k, v in kwargs.items()
                            if k not in ('db', 'session', 'current_user') and
                            not hasattr(v, 'execute') and not hasattr(v, 'id')}
            key = cache_key(prefix, func.__name__, *cache_args, **cache_kwargs)
            try:
                cached_data = await redis_async.get(key)
                if cached_data:
                    return json.loads(cached_data)
            except Exception:
                pass
            result = await func(*args, **kwargs)
            try:
                await redis_async.setex(key, ttl, json.dumps(result, default=str))
            except Exception:
                pass
            return result
        return async_wrapper
    return decorator


def invalidate_cache(pattern):
    try:
        keys = _redis_sync.scan_iter(match=f'yc:{pattern}:*')
        for key in keys:
            _redis_sync.delete(key)
    except Exception:
        pass


def get_cache_status():
    try:
        info = _redis_sync.info()
        return {
            'status': 'connected',
            'used_memory_human': info.get('used_memory_human', 'N/A'),
            'connected_clients': info.get('connected_clients', 0),
            'total_keys': _redis_sync.dbsize(),
        }
    except Exception as e:
        return {'status': 'error', 'error': str(e)}
