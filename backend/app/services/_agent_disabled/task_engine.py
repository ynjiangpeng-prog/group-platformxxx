import asyncio
import logging
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system.agent_models import AgentTask
from app.services.agent.skill_engine import execute_skill, SKILL_ACTION_REGISTRY

logger = logging.getLogger(__name__)


async def delegate_task(
    db: AsyncSession,
    company_id: str,
    user_id: str,
    title: str,
    subtasks: list[dict],
    agent_model: str | None = None,
) -> AgentTask:
    parent = AgentTask(
        task_type="delegation",
        status="running",
        title=title,
        input={"subtask_count": len(subtasks)},
        agent_model=agent_model,
        company_id=company_id,
        created_by=user_id,
        started_at=datetime.now(),
    )
    db.add(parent)
    await db.flush()

    child_tasks = []
    for i, sub in enumerate(subtasks):
        deps = sub.get("depends_on", [])
        dep_uuids = [UUID(d) if isinstance(d, str) else d for d in deps] if deps else []

        child = AgentTask(
            parent_id=str(parent.id),
            task_type=sub.get("type", "analysis"),
            status="pending",
            title=sub.get("desc", f"子任务 {i+1}"),
            input=sub.get("params", {}),
            depends_on=dep_uuids,
            agent_model=agent_model,
            company_id=company_id,
            created_by=user_id,
        )
        db.add(child)
        child_tasks.append(child)

    await db.flush()

    child_ids = [str(t.id) for t in child_tasks]
    subtask_map = {i: child_ids[i] for i in range(len(child_tasks))}
    for i, sub in enumerate(subtasks):
        resolved_deps = [subtask_map[d] for d in sub.get("depends_on", []) if d in subtask_map]
        child_tasks[i].depends_on = [UUID(d) for d in resolved_deps] if resolved_deps else []
    await db.flush()

    asyncio.create_task(_run_dag(db, parent, child_tasks, company_id, user_id))

    return parent


async def _run_dag(
    db_parent_session: AsyncSession,
    parent: AgentTask,
    children: list[AgentTask],
    company_id: str,
    user_id: str,
):
    from app.core.database import async_session_factory

    async with async_session_factory() as db:
        try:
            task_map = {str(t.id): t for t in children}
            completed = set()
            failed = set()

            while len(completed) + len(failed) < len(children):
                ready = []
                for tid, task in task_map.items():
                    if tid in completed or tid in failed:
                        continue
                    deps = [str(d) for d in (task.depends_on or [])]
                    if all(d in completed for d in deps):
                        ready.append(task)

                if not ready:
                    remaining = [t for t in task_map if t not in completed and t not in failed]
                    if remaining:
                        for tid in remaining:
                            task_map[tid].status = "failed"
                            task_map[tid].error_message = "依赖任务失败，无法执行"
                            failed.add(tid)
                    break

                results = await asyncio.gather(
                    *[_execute_child(db, task, company_id, user_id) for task in ready],
                    return_exceptions=True,
                )

                for task, result in zip(ready, results):
                    if isinstance(result, Exception):
                        task.status = "failed"
                        task.error_message = str(result)
                        failed.add(str(task.id))
                    else:
                        completed.add(str(task.id))

                await db.flush()

            parent_update = await db.get(AgentTask, str(parent.id))
            if parent_update:
                parent_update.status = "completed" if not failed else "partial"
                parent_update.progress = 100
                parent_update.completed_at = datetime.now()
                parent_update.output = {
                    "completed": list(completed),
                    "failed": list(failed),
                    "total": len(children),
                }

                progress = int((len(completed) / max(len(children), 1)) * 100)
                parent_update.progress = progress

            await db.flush()
            await db.commit()

        except Exception as e:
            logger.exception("DAG执行失败: %s", e)
            await db.rollback()


async def _execute_child(db: AsyncSession, task: AgentTask, company_id: str, user_id: str) -> dict:
    task.status = "running"
    task.started_at = datetime.now()
    await db.flush()

    action_name = task.input.get("action", "") if task.input else ""
    params = task.input.get("params", {}) if task.input else {}

    handler = SKILL_ACTION_REGISTRY.get(action_name)
    if handler:
        result = await handler(db, company_id, user_id, params)
    else:
        result = await _ai_analyze(db, company_id, user_id, task)

    task.status = "completed"
    task.output = result
    task.completed_at = datetime.now()
    await db.flush()
    return result


async def _ai_analyze(db: AsyncSession, company_id: str, user_id: str, task: AgentTask) -> dict:
    from app.services.ai_gateway import ai_gateway
    prompt = (
        f"请分析以下任务并返回结果：\n"
        f"任务类型: {task.task_type}\n"
        f"任务描述: {task.title}\n"
        f"输入参数: {task.input}\n"
        f"返回JSON格式结果。"
    )
    try:
        result = await ai_gateway.provider.chat(
            [{"role": "user", "content": prompt}],
            model=task.agent_model or "glm-4-flash",
        )
        return {"analysis": result}
    except Exception as e:
        return {"error": str(e)}
