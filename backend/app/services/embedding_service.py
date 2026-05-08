"""Embedding生成服务

调用智谱的embedding API生成文本向量。
降级方案：无API时返回None，记忆系统自动降级为关键词检索。
"""

import logging

logger = logging.getLogger(__name__)

# 智谱embedding API的向量维度
EMBEDDING_DIM = 1024


async def get_embedding(text: str) -> list[float] | None:
    """生成文本embedding向量"""
    if not text or len(text.strip()) < 2:
        return None

    try:
        from app.services.ai_gateway import ai_gateway
        from app.core.ai import PROVIDERS

        # 尝试使用智谱embedding API
        zhipu_config = PROVIDERS.get("zhipu")
        if not zhipu_config:
            return None

        api_key = zhipu_config.get("api_key")
        if not api_key:
            return None

        import httpx
        resp = await httpx.AsyncClient(timeout=30).post(
            "https://open.bigmodel.cn/api/paas/v4/embeddings",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": "embedding-3", "input": text[:512]},
        )

        if resp.status_code == 200:
            data = resp.json()
            embedding = data.get("data", [{}])[0].get("embedding")
            if embedding and len(embedding) > 0:
                return embedding
        else:
            logger.warning("Embedding API返回非200: %d", resp.status_code)
        return None
    except Exception as e:
        logger.warning("Embedding生成失败: %s", e)
        return None


async def get_embeddings_batch(texts: list[str]) -> list[list[float] | None]:
    """批量生成embedding"""
    return [await get_embedding(t) for t in texts]
