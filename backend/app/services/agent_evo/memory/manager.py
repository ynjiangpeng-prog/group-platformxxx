"""Letta三层记忆管理器

Core Memory: 直接注入system prompt，上限2KB/10条，手动编辑
Recall Memory: 近期对话摘要，PostgreSQL+关键词过滤，30天过期
Archival Memory: pgvector语义检索，长期存储，向量相似度匹配

auto_manage_memory: 根据quality_score自动分层存储
"""

import json
import logging
import re
from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_evolution.models import EvoMemory

logger = logging.getLogger(__name__)

CORE_MEMORY_MAX_COUNT = 10
CORE_MEMORY_MAX_CHARS = 2048
RECALL_MEMORY_DAYS = 30
ARCHIVAL_SEARCH_LIMIT = 5


class LettaMemoryManager:
    """Letta三层记忆管理器"""

    # ─── Core Memory（核心记忆）───

    async def get_core_memories(
        self, db: AsyncSession, agent_id: str, company_id: str,
    ) -> list[str]:
        """获取agent的核心记忆（直接注入system prompt）"""
        rows = (await db.execute(
            select(EvoMemory).where(
                EvoMemory.agent_id == agent_id,
                EvoMemory.company_id == company_id,
                EvoMemory.memory_type == "core",
                EvoMemory.is_deleted == False,
            ).order_by(EvoMemory.score.desc()).limit(CORE_MEMORY_MAX_COUNT)
        )).scalars().all()
        return [m.content for m in rows]

    async def add_core_memory(
        self, db: AsyncSession, agent_id: str, company_id: str, user_id: str,
        content: str, score: float = 0.9,
    ) -> EvoMemory:
        """添加核心记忆"""
        # 检查数量上限
        count = (await db.execute(
            select(func.count()).select_from(EvoMemory).where(
                EvoMemory.agent_id == agent_id,
                EvoMemory.company_id == company_id,
                EvoMemory.memory_type == "core",
                EvoMemory.is_deleted == False,
            )
        )).scalar()

        if count >= CORE_MEMORY_MAX_COUNT:
            # 替换最低分的
            lowest = (await db.execute(
                select(EvoMemory).where(
                    EvoMemory.agent_id == agent_id,
                    EvoMemory.company_id == company_id,
                    EvoMemory.memory_type == "core",
                    EvoMemory.is_deleted == False,
                ).order_by(EvoMemory.score.asc()).limit(1)
            )).scalar_one_or_none()
            if lowest:
                lowest.is_deleted = True

        # 截断超长内容
        if len(content) > CORE_MEMORY_MAX_CHARS:
            content = content[:CORE_MEMORY_MAX_CHARS - 3] + "..."

        memory = EvoMemory(
            company_id=company_id,
            created_by=user_id,
            agent_id=agent_id,
            memory_type="core",
            content=content,
            score=score,
            access_count=0,
        )
        db.add(memory)
        await db.flush()
        return memory

    async def format_core_for_prompt(
        self, db: AsyncSession, agent_id: str, company_id: str,
    ) -> str:
        """格式化核心记忆注入到system prompt"""
        memories = await self.get_core_memories(db, agent_id, company_id)
        if not memories:
            return ""
        lines = "\n".join(f"- {m}" for m in memories)
        return f"\n核心知识：\n{lines}"

    # ─── Recall Memory（回溯记忆）───

    async def add_recall(
        self, db: AsyncSession, agent_id: str, company_id: str, user_id: str,
        content: str, score: float = 0.5, source_execution_id: str | None = None,
    ) -> EvoMemory:
        """添加回溯记忆（近期对话摘要）"""
        memory = EvoMemory(
            company_id=company_id,
            created_by=user_id,
            agent_id=agent_id,
            memory_type="recall",
            content=content,
            source_execution_id=source_execution_id,
            score=score,
            expires_at=datetime.now() + timedelta(days=RECALL_MEMORY_DAYS),
            access_count=0,
        )
        db.add(memory)
        await db.flush()
        return memory

    async def search_recall(
        self, db: AsyncSession, agent_id: str, company_id: str,
        query: str, limit: int = 5,
    ) -> list[str]:
        """关键词搜索回溯记忆"""
        # 提取查询关键词
        keywords = re.findall(r'[一-鿿]{2,}|[a-zA-Z]{2,}', query.lower())
        if not keywords:
            # 无关键词时按最近访问返回
            rows = (await db.execute(
                select(EvoMemory).where(
                    EvoMemory.agent_id == agent_id,
                    EvoMemory.company_id == company_id,
                    EvoMemory.memory_type == "recall",
                    EvoMemory.is_deleted == False,
                    or_(
                        EvoMemory.expires_at.is_(None),
                        EvoMemory.expires_at > datetime.now(),
                    ),
                ).order_by(EvoMemory.created_at.desc()).limit(limit)
            )).scalars().all()
            return [m.content for m in rows]

        # 按关键词匹配数量排序
        rows = (await db.execute(
            select(EvoMemory).where(
                EvoMemory.agent_id == agent_id,
                EvoMemory.company_id == company_id,
                EvoMemory.memory_type == "recall",
                EvoMemory.is_deleted == False,
                or_(
                    EvoMemory.expires_at.is_(None),
                    EvoMemory.expires_at > datetime.now(),
                ),
            ).order_by(EvoMemory.score.desc()).limit(limit * 3)
        )).scalars().all()

        scored = []
        for m in rows:
            text_lower = m.content.lower()
            overlap = sum(1 for kw in keywords if kw in text_lower)
            if overlap > 0:
                # 记忆衰减：每天衰减2%
                days_since = (datetime.now() - (m.last_used_at or m.created_at or datetime.now())).days
                effective_score = m.score * (0.98 ** max(0, days_since))
                scored.append((overlap, effective_score, m.content))

        scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
        return [s[2] for s in scored[:limit]]

    # ─── Archival Memory（归档记忆）───

    async def add_archival(
        self, db: AsyncSession, agent_id: str, company_id: str, user_id: str,
        content: str, embedding: list[float] | None = None,
        score: float = 0.5, source_execution_id: str | None = None,
        tags: list[str] | None = None,
    ) -> EvoMemory:
        """添加归档记忆（长期存储，支持向量检索）"""
        # 记忆去重：检查内容相似度
        existing = (await db.execute(
            select(EvoMemory).where(
                EvoMemory.agent_id == agent_id,
                EvoMemory.company_id == company_id,
                EvoMemory.memory_type == "archival",
                EvoMemory.is_deleted == False,
            ).limit(100)
        )).scalars().all()

        for m in existing:
            # 简单文本相似度检查
            if m.content and self._text_similarity(m.content, content) > 0.9:
                # 合并：更新分数和访问计数
                m.score = max(m.score, score)
                m.access_count += 1
                m.last_used_at = datetime.now()
                await db.flush()
                return m

        memory = EvoMemory(
            company_id=company_id,
            created_by=user_id,
            agent_id=agent_id,
            memory_type="archival",
            content=content,
            source_execution_id=source_execution_id,
            score=score,
            tags=tags,
            access_count=0,
        )
        # 单独设置向量列（如果可用）
        if embedding:
            try:
                from pgvector.sqlalchemy import Vector
                memory.content_vector = embedding
            except ImportError:
                pass

        db.add(memory)
        await db.flush()
        return memory

    async def search_archival(
        self, db: AsyncSession, agent_id: str, company_id: str,
        query_embedding: list[float] | None = None,
        query_text: str | None = None,
        limit: int = ARCHIVAL_SEARCH_LIMIT,
    ) -> list[str]:
        """语义检索归档记忆（优先向量检索，降级为关键词）"""
        if query_embedding:
            try:
                return await self._vector_search(db, agent_id, company_id, query_embedding, limit)
            except Exception:
                logger.warning("向量检索失败，降级为关键词检索")

        # 关键词降级检索
        if query_text:
            return await self._keyword_search_archival(db, agent_id, company_id, query_text, limit)
        return []

    async def _vector_search(
        self, db: AsyncSession, agent_id: str, company_id: str,
        embedding: list[float], limit: int,
    ) -> list[str]:
        """pgvector余弦相似度检索"""
        from pgvector.sqlalchemy import Vector

        rows = (await db.execute(
            select(EvoMemory).where(
                EvoMemory.agent_id == agent_id,
                EvoMemory.company_id == company_id,
                EvoMemory.memory_type == "archival",
                EvoMemory.is_deleted == False,
            ).order_by(
                EvoMemory.content_vector.cosine_distance(embedding)
            ).limit(limit)
        )).scalars().all()

        result = []
        for m in rows:
            result.append(m.content)
            m.access_count += 1
            m.last_used_at = datetime.now()
        return result

    async def _keyword_search_archival(
        self, db: AsyncSession, agent_id: str, company_id: str,
        query: str, limit: int,
    ) -> list[str]:
        """关键词降级检索归档记忆"""
        keywords = re.findall(r'[一-鿿]{2,}|[a-zA-Z]{2,}', query.lower())
        if not keywords:
            return []

        rows = (await db.execute(
            select(EvoMemory).where(
                EvoMemory.agent_id == agent_id,
                EvoMemory.company_id == company_id,
                EvoMemory.memory_type == "archival",
                EvoMemory.is_deleted == False,
            ).order_by(EvoMemory.score.desc()).limit(limit * 3)
        )).scalars().all()

        scored = []
        for m in rows:
            text_lower = m.content.lower()
            overlap = sum(1 for kw in keywords if kw in text_lower)
            if overlap > 0:
                m.access_count += 1
                m.last_used_at = datetime.now()
                scored.append((overlap, m.score, m.content))

        scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
        return [s[2] for s in scored[:limit]]

    # ─── 自动记忆管理 ───

    async def auto_manage_memory(
        self,
        db: AsyncSession,
        agent_id: str,
        company_id: str,
        user_id: str,
        execution_id: str | None,
        input_data: dict,
        output_data: dict,
        quality_score: float,
    ) -> list[EvoMemory]:
        """根据质量分自动分层存储记忆"""
        query = input_data.get("query") or input_data.get("text", "")
        response = output_data.get("response", "") if output_data else ""

        if not query:
            return []

        memories = []

        if quality_score >= 0.85:
            # 高质量 → 核心记忆（精炼版）
            summary = f"成功经验：{query[:50]} → {response[:80]}"
            m = await self.add_core_memory(db, agent_id, company_id, user_id, summary, score=quality_score)
            memories.append(m)

        if quality_score >= 0.6:
            # 中等质量 → 回溯记忆
            content = f"[{quality_score:.1f}] Q: {query[:100]} | A: {response[:150]}"
            m = await self.add_recall(db, agent_id, company_id, user_id, content, score=quality_score, source_execution_id=execution_id)
            memories.append(m)

        if quality_score < 0.4:
            # 低质量 → 归档为失败教训
            content = f"失败案例(评分{quality_score:.1f}): Q: {query[:100]} | 问题: 回答质量差"
            m = await self.add_archival(db, agent_id, company_id, user_id, content, score=quality_score, source_execution_id=execution_id, tags=["failure"])
            memories.append(m)

        return memories

    # ─── 清理过期记忆 ───

    async def cleanup_expired(self, db: AsyncSession, agent_id: str, company_id: str) -> int:
        """清理过期的回溯记忆"""
        result = (await db.execute(
            select(EvoMemory).where(
                EvoMemory.agent_id == agent_id,
                EvoMemory.company_id == company_id,
                EvoMemory.memory_type == "recall",
                EvoMemory.is_deleted == False,
                EvoMemory.expires_at < datetime.now(),
            )
        )).scalars().all()

        count = 0
        for m in result:
            m.is_deleted = True
            count += 1

        await db.flush()
        return count

    # ─── 工具方法 ───

    @staticmethod
    def _text_similarity(text1: str, text2: str) -> float:
        """简单文本相似度（字符级Jaccard系数）"""
        if not text1 or not text2:
            return 0.0
        set1 = set(text1)
        set2 = set(text2)
        intersection = len(set1 & set2)
        union = len(set1 | set2)
        return intersection / union if union > 0 else 0.0
