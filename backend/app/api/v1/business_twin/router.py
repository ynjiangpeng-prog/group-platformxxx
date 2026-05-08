"""业务数字孪生API路由"""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.services.business_digital_twin.event_collector import event_collector
from app.services.business_digital_twin.metric_aggregator import metric_aggregator
from app.services.business_digital_twin.knowledge_graph import business_kg
from app.services.business_digital_twin.simulation_engine import simulation_engine
from app.services.business_digital_twin.nl_query import business_nl_query

router = APIRouter(prefix="/business-twin", tags=["业务数字孪生"])


@router.get("/events")
async def list_events(
    event_type: str | None = None,
    source_module: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """查询事件流"""
    offset = (page - 1) * page_size
    items, total = await event_collector.query_events(
        db, str(current_user.company_id),
        event_type=event_type,
        source_module=source_module,
        start_date=start_date,
        end_date=end_date,
        limit=page_size,
        offset=offset,
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/entities")
async def list_entities(
    entity_type: str | None = None,
    search: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """查询业务实体"""
    items = await event_collector.query_entities(
        db, str(current_user.company_id),
        entity_type=entity_type,
        search=search,
    )
    return {"items": items, "total": len(items)}


@router.get("/relations")
async def list_relations(
    entity_id: str | None = None,
    relation_type: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """查询实体关系"""
    items = await event_collector.query_relations(
        db, str(current_user.company_id),
        entity_id=entity_id,
        relation_type=relation_type,
    )
    return {"items": items, "total": len(items)}


@router.get("/metrics")
async def list_metrics(
    metric_type: str | None = None,
    period_type: str | None = None,
    period: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """查询聚合指标"""
    items = await metric_aggregator.query_metrics(
        db, str(current_user.company_id),
        metric_type=metric_type,
        period_type=period_type,
        period=period,
    )
    return {"items": items, "total": len(items)}


@router.post("/replay")
async def replay_events(
    start_date: datetime,
    end_date: datetime,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """回放指定时间段的业务事件"""
    events = await event_collector.replay_events(
        db, str(current_user.company_id), start_date, end_date,
    )
    return {"events": events, "count": len(events)}


@router.get("/timeline")
async def get_timeline(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    event_types: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """时间轴视图"""
    types_list = event_types.split(",") if event_types else None
    items = await metric_aggregator.get_timeline(
        db, str(current_user.company_id),
        start_date=start_date,
        end_date=end_date,
        event_types=types_list,
        limit=limit,
    )
    return {"items": items, "total": len(items)}


# ─── 知识图谱 ───

@router.get("/graph")
async def get_graph(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取完整图谱数据（nodes + edges）"""
    return await business_kg.build_graph(db, str(current_user.company_id))


@router.get("/graph/query")
async def query_graph(
    entity_name: str,
    depth: int = Query(2, ge=1, le=5),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """查询实体的关联网络"""
    return await business_kg.query_graph(
        db, str(current_user.company_id), entity_name, depth,
    )


@router.get("/graph/path")
async def find_path(
    from_entity: str,
    to_entity: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """两个实体间的关系路径"""
    path = await business_kg.find_path(
        db, str(current_user.company_id), from_entity, to_entity,
    )
    return {"path": path, "found": len(path) > 0}


@router.get("/graph/profile/{entity_id}")
async def get_entity_profile(
    entity_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """实体360度画像"""
    return await business_kg.get_entity_profile(
        db, str(current_user.company_id), entity_id,
    )


# ─── 模拟沙盘 ───

@router.get("/simulations/templates")
async def get_simulation_templates():
    """获取预置模拟模板"""
    return simulation_engine.get_templates()


@router.post("/simulate")
async def run_simulation(
    scenario: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """运行What-If模拟"""
    return await simulation_engine.simulate_scenario(
        db, str(current_user.company_id), scenario,
    )


# ─── 自然语言问答 ───

@router.post("/ask")
async def nl_ask(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """自然语言业务问答"""
    question = body.get("question", "")
    history = body.get("history", [])
    if not question:
        return {"question": "", "answer": "请输入问题", "data": None, "intent": "empty"}

    return await business_nl_query.query(
        db, str(current_user.company_id), str(current_user.id),
        question, history,
    )
