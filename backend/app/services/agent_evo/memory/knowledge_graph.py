"""时序知识图谱

从文本中提取实体关系，存储为memory_type="knowledge_graph"。
支持：冲突检测（新知识标记旧知识为possibly_outdated）、实体查询。
"""

import json
import logging
import re
from datetime import datetime

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_evolution.models import EvoMemory

logger = logging.getLogger(__name__)


class TemporalKnowledgeGraph:
    """时序知识图谱"""

    def _make_kg_content(self, subject: str, relation: str, obj: str, confidence: float = 1.0) -> str:
        return json.dumps({
            "type": "triple",
            "subject": subject,
            "relation": relation,
            "object": obj,
            "confidence": confidence,
        }, ensure_ascii=False)

    def _parse_triple(self, content: str) -> dict | None:
        try:
            data = json.loads(content)
            if data.get("type") == "triple":
                return data
        except (json.JSONDecodeError, TypeError):
            pass
        return None

    async def extract_triples(
        self, text: str, agent_id: str | None = None,
    ) -> list[dict]:
        """从文本中提取三元组（用LLM）"""
        from app.services.ai_gateway import ai_gateway

        prompt = (
            f"从以下文本中提取实体关系三元组。每个三元组格式为：(主体, 关系, 客体)。\n\n"
            f"文本：{text[:2000]}\n\n"
            f"返回JSON数组：[{{\"subject\": \"...\", \"relation\": \"...\", \"object\": \"...\"}}]\n"
            f"直接输出JSON，不要其他文字。最多提取10个三元组。"
        )

        try:
            result = await ai_gateway.routed_chat(
                [{"role": "user", "content": prompt}],
                task="memory_extract",
            )
            parsed = ai_gateway.parse_json_response(result)
            if isinstance(parsed, list):
                return [t for t in parsed if "subject" in t and "relation" in t and "object" in t][:10]
            return []
        except Exception as e:
            logger.warning("知识图谱三元组提取失败: %s", e)
            return []

    async def add_triple(
        self,
        db: AsyncSession,
        agent_id: str,
        company_id: str,
        user_id: str,
        subject: str,
        relation: str,
        obj: str,
        confidence: float = 1.0,
        source_execution_id: str | None = None,
    ) -> EvoMemory:
        """添加三元组，检测冲突"""
        # 冲突检测：同subject+relation的旧知识标记为possibly_outdated
        existing = (await db.execute(
            select(EvoMemory).where(
                EvoMemory.agent_id == agent_id,
                EvoMemory.company_id == company_id,
                EvoMemory.memory_type == "knowledge_graph",
                EvoMemory.is_deleted == False,
            )
        )).scalars().all()

        for m in existing:
            triple = self._parse_triple(m.content)
            if triple and triple["subject"] == subject and triple["relation"] == relation:
                if triple.get("object") != obj:
                    # 冲突：标记旧知识
                    m.tags = (m.tags or []) + ["possibly_outdated"]
                    m.score *= 0.5

        content = self._make_kg_content(subject, relation, obj, confidence)
        memory = EvoMemory(
            company_id=company_id,
            created_by=user_id,
            agent_id=agent_id,
            memory_type="knowledge_graph",
            content=content,
            source_execution_id=source_execution_id,
            score=confidence,
            tags=["knowledge_graph"],
            access_count=0,
        )
        db.add(memory)
        await db.flush()
        return memory

    async def query_entity(
        self, db: AsyncSession, agent_id: str, company_id: str, entity: str,
    ) -> list[dict]:
        """查询与实体相关的所有三元组"""
        rows = (await db.execute(
            select(EvoMemory).where(
                EvoMemory.agent_id == agent_id,
                EvoMemory.company_id == company_id,
                EvoMemory.memory_type == "knowledge_graph",
                EvoMemory.is_deleted == False,
            )
        )).scalars().all()

        results = []
        for m in rows:
            triple = self._parse_triple(m.content)
            if triple and (triple["subject"] == entity or triple["object"] == entity):
                results.append({
                    **triple,
                    "memory_id": str(m.id),
                    "score": m.score,
                    "tags": m.tags or [],
                })
        return results

    async def get_all_triples(
        self, db: AsyncSession, agent_id: str, company_id: str, limit: int = 50,
    ) -> list[dict]:
        """获取agent的所有三元组"""
        rows = (await db.execute(
            select(EvoMemory).where(
                EvoMemory.agent_id == agent_id,
                EvoMemory.company_id == company_id,
                EvoMemory.memory_type == "knowledge_graph",
                EvoMemory.is_deleted == False,
            ).order_by(EvoMemory.score.desc()).limit(limit)
        )).scalars().all()

        results = []
        for m in rows:
            triple = self._parse_triple(m.content)
            if triple:
                results.append({**triple, "memory_id": str(m.id), "score": m.score})
        return results


# 全局单例
knowledge_graph = TemporalKnowledgeGraph()
