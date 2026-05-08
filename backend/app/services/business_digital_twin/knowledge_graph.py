"""业务知识图谱

基于biz_entities + biz_relations构建全业务知识图谱。
支持实体查询、关系路径搜索、360度画像。
LLM三元组提取走ai_gateway.routed_chat(task="memory_extract")。
"""

import json
import logging
from collections import defaultdict, deque
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business.models import BizEntity, BizRelation

logger = logging.getLogger(__name__)


class BusinessKnowledgeGraph:
    """业务知识图谱"""

    async def extract_from_document(
        self,
        db: AsyncSession,
        company_id: str,
        user_id: str,
        doc_type: str,
        doc_text: str,
    ) -> list[dict]:
        """从业务文档提取实体关系"""
        from app.services.ai_gateway import ai_gateway

        prompt = (
            f"从以下{doc_type}文档中提取业务实体和关系。\n\n"
            f"文档内容：{doc_text[:3000]}\n\n"
            f"提取规则：\n"
            f"1. 实体类型：company/project/contract/supplier/customer/station\n"
            f"2. 关系类型：supplies/contracts_with/pays/belongs_to/invests/charges_at\n"
            f"3. 每个实体需要name和type\n\n"
            f"返回JSON：\n"
            f'{{"entities": [{{"name": "...", "type": "..."}}], '
            f'"relations": [{{"source": "...", "target": "...", "type": "..."}}]}}\n'
            f"直接输出JSON。"
        )

        try:
            result = await ai_gateway.routed_chat(
                [{"role": "user", "content": prompt}],
                task="memory_extract",
            )
            parsed = ai_gateway.parse_json_response(result)

            entities_data = parsed.get("entities", [])
            relations_data = parsed.get("relations", [])

            # 创建实体
            created_entities = {}
            for e in entities_data:
                name = e.get("name", "").strip()
                etype = e.get("type", "company")
                if not name:
                    continue

                existing = (await db.execute(
                    select(BizEntity).where(
                        BizEntity.company_id == company_id,
                        BizEntity.entity_type == etype,
                        BizEntity.entity_name == name,
                        BizEntity.is_deleted == False,
                    )
                )).scalar_one_or_none()

                if existing:
                    created_entities[name] = str(existing.id)
                else:
                    entity = BizEntity(
                        company_id=company_id,
                        created_by=user_id,
                        entity_type=etype,
                        entity_name=name,
                        properties={"doc_type": doc_type},
                        status="active",
                    )
                    db.add(entity)
                    await db.flush()
                    created_entities[name] = str(entity.id)

            # 创建关系
            created_relations = []
            for r in relations_data:
                src_name = r.get("source", "").strip()
                tgt_name = r.get("target", "").strip()
                rel_type = r.get("type", "belongs_to")
                src_id = created_entities.get(src_name)
                tgt_id = created_entities.get(tgt_name)
                if not src_id or not tgt_id:
                    continue

                relation = BizRelation(
                    company_id=company_id,
                    created_by=user_id,
                    source_entity_id=src_id,
                    target_entity_id=tgt_id,
                    relation_type=rel_type,
                    confidence=0.7,
                )
                db.add(relation)
                created_relations.append({
                    "source": src_name, "target": tgt_name, "type": rel_type,
                })

            await db.flush()
            return {
                "entities_created": len(created_entities),
                "relations_created": len(created_relations),
                "relations": created_relations,
            }
        except Exception as e:
            logger.exception("文档实体提取失败: %s", e)
            return {"entities_created": 0, "relations_created": 0, "error": str(e)}

    async def build_graph(
        self,
        db: AsyncSession,
        company_id: str,
    ) -> dict:
        """从biz_entities + biz_relations构建完整图谱"""
        entities = (await db.execute(
            select(BizEntity).where(
                BizEntity.company_id == company_id,
                BizEntity.is_deleted == False,
            )
        )).scalars().all()

        relations = (await db.execute(
            select(BizRelation).where(
                BizRelation.company_id == company_id,
                BizRelation.is_deleted == False,
            )
        )).scalars().all()

        nodes = []
        for e in entities:
            nodes.append({
                "id": str(e.id),
                "name": e.entity_name,
                "type": e.entity_type,
                "status": e.status,
                "properties": e.properties,
            })

        edges = []
        for r in relations:
            edges.append({
                "id": str(r.id),
                "source": str(r.source_entity_id),
                "target": str(r.target_entity_id),
                "type": r.relation_type,
                "confidence": r.confidence,
                "properties": r.properties,
            })

        return {"nodes": nodes, "edges": edges}

    async def query_graph(
        self,
        db: AsyncSession,
        company_id: str,
        entity_name: str,
        depth: int = 2,
    ) -> dict:
        """查询某实体的关联网络（BFS扩展）"""
        graph = await self.build_graph(db, company_id)

        # 找到起始实体
        start_nodes = [n for n in graph["nodes"] if entity_name.lower() in n["name"].lower()]
        if not start_nodes:
            return {"nodes": [], "edges": []}

        start_id = start_nodes[0]["id"]

        # BFS
        visited_nodes = {start_id}
        visited_edges = set()
        queue = deque([(start_id, 0)])

        edge_map = defaultdict(list)
        for e in graph["edges"]:
            edge_map[e["source"]].append(e)
            edge_map[e["target"]].append(e)

        node_map = {n["id"]: n for n in graph["nodes"]}

        while queue:
            current_id, current_depth = queue.popleft()
            if current_depth >= depth:
                continue

            for edge in edge_map.get(current_id, []):
                edge_key = edge["id"]
                if edge_key in visited_edges:
                    continue
                visited_edges.add(edge_key)

                neighbor_id = edge["target"] if edge["source"] == current_id else edge["source"]
                if neighbor_id not in visited_nodes and neighbor_id in node_map:
                    visited_nodes.add(neighbor_id)
                    queue.append((neighbor_id, current_depth + 1))

        return {
            "nodes": [node_map[nid] for nid in visited_nodes if nid in node_map],
            "edges": [e for e in graph["edges"] if e["id"] in visited_edges],
            "center": start_nodes[0],
        }

    async def find_path(
        self,
        db: AsyncSession,
        company_id: str,
        from_entity: str,
        to_entity: str,
    ) -> list[dict]:
        """两个实体间的关系路径（BFS最短路径）"""
        graph = await self.build_graph(db, company_id)

        from_nodes = [n for n in graph["nodes"] if from_entity.lower() in n["name"].lower()]
        to_nodes = [n for n in graph["nodes"] if to_entity.lower() in n["name"].lower()]
        if not from_nodes or not to_nodes:
            return []

        from_id = from_nodes[0]["id"]
        to_id = to_nodes[0]["id"]

        # 构建邻接表
        adj = defaultdict(list)
        for e in graph["edges"]:
            adj[e["source"]].append((e["target"], e))
            adj[e["target"]].append((e["source"], e))

        # BFS找最短路径
        visited = {from_id}
        queue = deque([(from_id, [])])

        while queue:
            current, path = queue.popleft()
            if current == to_id:
                return path

            for neighbor, edge in adj.get(current, []):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append((neighbor, path + [edge]))

        return []

    async def get_entity_profile(
        self,
        db: AsyncSession,
        company_id: str,
        entity_id: str,
    ) -> dict:
        """实体360度画像"""
        entity = (await db.execute(
            select(BizEntity).where(
                BizEntity.id == entity_id,
                BizEntity.is_deleted == False,
            )
        )).scalar_one_or_none()

        if not entity:
            return {}

        # 关联关系
        relations = (await db.execute(
            select(BizRelation).where(
                BizRelation.company_id == company_id,
                BizRelation.is_deleted == False,
                (BizRelation.source_entity_id == entity_id) |
                (BizRelation.target_entity_id == entity_id),
            )
        )).scalars().all()

        # 收集关联实体
        related_ids = set()
        for r in relations:
            related_ids.add(str(r.source_entity_id))
            related_ids.add(str(r.target_entity_id))
        related_ids.discard(str(entity.id))

        related_entities = []
        if related_ids:
            from sqlalchemy import or_
            rows = (await db.execute(
                select(BizEntity).where(
                    BizEntity.id.in_(related_ids),
                    BizEntity.is_deleted == False,
                )
            )).scalars().all()
            related_entities = [
                {"id": str(e.id), "name": e.entity_name, "type": e.entity_type}
                for e in rows
            ]

        # 统计
        outgoing = [r for r in relations if str(r.source_entity_id) == str(entity.id)]
        incoming = [r for r in relations if str(r.target_entity_id) == str(entity.id)]

        return {
            "entity": {
                "id": str(entity.id),
                "name": entity.entity_name,
                "type": entity.entity_type,
                "status": entity.status,
                "properties": entity.properties,
                "tags": entity.tags,
            },
            "stats": {
                "total_relations": len(relations),
                "outgoing": len(outgoing),
                "incoming": len(incoming),
                "related_entities": len(related_entities),
            },
            "relations": [
                {
                    "id": str(r.id),
                    "direction": "outgoing" if str(r.source_entity_id) == str(entity.id) else "incoming",
                    "type": r.relation_type,
                    "target_entity": str(r.target_entity_id) if str(r.source_entity_id) == str(entity.id) else str(r.source_entity_id),
                    "confidence": r.confidence,
                }
                for r in relations
            ],
            "related_entities": related_entities,
        }


# 全局单例
business_kg = BusinessKnowledgeGraph()
