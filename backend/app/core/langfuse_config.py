"""Langfuse追踪配置 — LLM可观测性

空key时自动禁用，不产生任何开销。
用于追踪agent执行、进化过程的LLM调用链路。"""

import os
import logging
from functools import wraps

logger = logging.getLogger(__name__)

LANGFUSE_PUBLIC_KEY = os.getenv("LANGFUSE_PUBLIC_KEY", "")
LANGFUSE_SECRET_KEY = os.getenv("LANGFUSE_SECRET_KEY", "")
LANGFUSE_HOST = os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com")

_enabled = bool(LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY)
_client = None

if _enabled:
    try:
        from langfuse import Langfuse
        _client = Langfuse(
            publicKey=LANGFUSE_PUBLIC_KEY,
            secretKey=LANGFUSE_SECRET_KEY,
            host=LANGFUSE_HOST,
        )
        logger.info("Langfuse追踪已启用")
    except ImportError:
        logger.warning("langfuse未安装，追踪禁用")
        _enabled = False
    except Exception as e:
        logger.warning("Langfuse初始化失败: %s", e)
        _enabled = False


def get_client():
    """获取Langfuse客户端（可能为None）"""
    return _client if _enabled else None


def is_enabled() -> bool:
    return _enabled


def trace(name: str, **kwargs):
    """创建trace上下文管理器，未启用时返回noop"""
    client = get_client()
    if client:
        return client.trace(name=name, **kwargs)
    return _NoopTrace()


class _NoopTrace:
    """Langfuse未启用时的空操作替代"""

    def span(self, **kwargs):
        return _NoopSpan()

    def update(self, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


class _NoopSpan:
    def update(self, **kwargs):
        pass

    def end(self, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass
