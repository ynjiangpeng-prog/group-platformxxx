"""Agent生命周期管理

管理agent从创建到执行的完整生命周期，集成hook系统和记忆系统。
所有agent共享的生命周期：pre_execute → 执行 → post_execute/on_error。
集成Langfuse追踪 + Token成本优化。
"""

import logging
import time
from datetime import datetime
from uuid import uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_evolution.models import (
    EvoAgent, EvoExecution, EvoMemory,
)
from app.services.agent_evo.hooks import hook_manager
from app.core.langfuse_config import is_enabled as langfuse_enabled, trace as lf_trace, get_client as lf_client

logger = logging.getLogger(__name__)


class AgentLifecycle:
    """Agent生命周期管理器 — 包裹每次agent执行"""

    async def execute_agent(
        self,
        db: AsyncSession,
        agent_id: str,
        company_id: str,
        user_id: str,
        input_data: dict,
        task_type: str | None = None,
        workflow_instance_id: str | None = None,
    ) -> dict:
        """执行agent的完整生命周期

        流程：pre_execute hooks → 执行 → post_execute hooks / on_error hooks
        返回：{execution_id, output, quality_score, duration_ms, status}
        """
        execution_id = uuid4()
        started_at = datetime.now()
        t0 = time.monotonic()

        # Langfuse trace
        _trace = lf_trace(
            name=f"agent:{agent_id}",
            metadata={"company_id": company_id, "task_type": task_type},
        ) if langfuse_enabled() else None

        # 创建执行记录
        execution = EvoExecution(
            id=execution_id,
            company_id=company_id,
            created_by=user_id,
            agent_id=agent_id,
            workflow_instance_id=workflow_instance_id,
            task_type=task_type,
            input_data=input_data,
            status="running",
            started_at=started_at,
        )
        db.add(execution)

        # 查询agent并提前校验存在性和状态
        agent = (await db.execute(
            select(EvoAgent).where(EvoAgent.id == agent_id)
        )).scalar_one_or_none()

        if not agent:
            raise ValueError(f"Agent {agent_id} 不存在")

        if agent.status == "disabled":
            raise ValueError(f"Agent「{agent.name}」已禁用，请先启用后再执行")

        agent.execution_count = (agent.execution_count or 0) + 1

        await db.flush()

        try:
            # ── pre_execute hooks ──
            _span_pre = _trace.span(name="pre_execute") if _trace else None

            hook_result = await hook_manager.fire_hooks(
                db, "pre_execute", agent_id, company_id, user_id,
                {"input_data": input_data, "execution_id": execution_id},
            )
            # hook可能修改输入
            effective_input = hook_result.get("modified_input", input_data) if hook_result else input_data

            if _span_pre:
                _span_pre.end()

            # ── 注入记忆上下文 ──
            memories = await self._retrieve_memories(db, agent_id, company_id, input_data)
            enriched_input = {**effective_input, "_memories": memories}

            # ── 执行agent逻辑（调用AI网关）──
            _span_llm = _trace.span(name="llm_call") if _trace else None
            output_data = await self._run_agent_logic(db, agent, enriched_input, company_id)
            if _span_llm:
                _span_llm.end()

            # ── post_execute hooks ──
            duration_ms = int((time.monotonic() - t0) * 1000)
            completed_at = datetime.now()

            _span_post = _trace.span(name="post_execute") if _trace else None
            hook_result = await hook_manager.fire_hooks(
                db, "post_execute", agent_id, company_id, user_id,
                {
                    "input_data": effective_input,
                    "output_data": output_data,
                    "execution_id": execution_id,
                    "duration_ms": duration_ms,
                },
            )
            if _span_post:
                _span_post.end()

            effective_output = hook_result.get("modified_output", output_data) if hook_result else output_data
            quality_score = hook_result.get("quality_score") if hook_result else None

            # 更新执行记录
            execution.output_data = effective_output
            execution.status = "completed"
            execution.duration_ms = duration_ms
            execution.completed_at = completed_at
            execution.quality_score = quality_score

            # 更新agent成功计数
            agent.success_count = (agent.success_count or 0) + 1
            if quality_score is not None:
                agent.quality_score = quality_score

            # 从成功执行中提取记忆
            await self._extract_memory_from_execution(
                db, agent_id, company_id, user_id, execution_id,
                effective_input, effective_output, quality_score or 0.5,
            )

            # Reflexion反思（中等质量时触发）
            if quality_score is not None:
                await self._self_reflect(
                    db, agent_id, company_id, user_id, execution_id,
                    effective_input, effective_output, quality_score,
                )

            if _trace:
                _trace.update(output={"quality_score": quality_score, "status": "completed"})

            await db.flush()

            return {
                "execution_id": execution_id,
                "output": effective_output,
                "quality_score": quality_score,
                "duration_ms": duration_ms,
                "status": "completed",
            }

        except Exception as e:
            duration_ms = int((time.monotonic() - t0) * 1000)
            logger.exception("Agent执行失败: agent=%s error=%s", agent_id, e)

            execution.status = "failed"
            execution.error_message = str(e)
            execution.duration_ms = duration_ms
            execution.completed_at = datetime.now()

            # ── on_error hooks ──
            try:
                await hook_manager.fire_hooks(
                    db, "on_error", agent_id, company_id, user_id,
                    {
                        "error": str(e),
                        "execution_id": execution_id,
                        "input_data": input_data,
                        "duration_ms": duration_ms,
                    },
                )
            except Exception:
                logger.exception("on_error hook执行失败")

            # 自动调试
            debug_suggestion = await self._auto_debug(
                db, agent_id, company_id, user_id, str(e), input_data, agent.config,
            )
            if debug_suggestion:
                logger.info("自动调试建议: %s", debug_suggestion)

            if _trace:
                _trace.update(output={"error": str(e), "status": "failed"})

            await db.flush()

            return {
                "execution_id": execution_id,
                "output": None,
                "error": str(e),
                "duration_ms": duration_ms,
                "status": "failed",
            }

    async def _run_agent_logic(
        self, db: AsyncSession, agent: EvoAgent, enriched_input: dict, company_id: str,
    ) -> dict:
        """执行agent的核心逻辑 — 调用AI网关 + Token优化"""
        from app.services.ai_gateway import ai_gateway
        from app.services.agent_evo.token_optimizer import (
            route_model, compress_prompt, estimate_tokens,
        )

        config = agent.config or {}
        model = route_model(enriched_input, config)

        # 压缩system prompt
        raw_prompt = agent.system_prompt or "你是一个智能助手。"
        prompt = compress_prompt(raw_prompt, max_tokens=3000)

        # 构建消息
        messages = [{"role": "system", "content": prompt}]

        # 注入记忆上下文（经过相关性过滤）
        memories = enriched_input.pop("_memories", [])
        if memories:
            from app.services.agent_evo.token_optimizer import filter_memories_by_relevance
            query_text = enriched_input.get("query") or enriched_input.get("text", "")
            filtered = filter_memories_by_relevance(memories, query_text, max_tokens=800)
            if filtered:
                memory_text = "\n".join(f"- {m}" for m in filtered[:5])
                messages.append({
                    "role": "system",
                    "content": f"相关经验记忆：\n{memory_text}",
                })

        # 用户输入
        user_input = enriched_input.get("query") or enriched_input.get("text", "")
        if isinstance(user_input, str) and user_input:
            messages.append({"role": "user", "content": user_input})
        elif enriched_input:
            messages.append({
                "role": "user",
                "content": f"请处理以下数据：{str(enriched_input)[:2000]}",
            })

        input_tokens = sum(estimate_tokens(m["content"]) for m in messages)
        result = await ai_gateway.provider.chat(messages, model=model)
        return {"response": result, "model": model, "input_tokens": input_tokens}

    async def _retrieve_memories(
        self, db: AsyncSession, agent_id: str, company_id: str, input_data: dict,
    ) -> list[str]:
        """Letta三层记忆检索：Core + Recall + Archival"""
        from app.services.agent_evo.memory.manager import memory_manager

        query_text = input_data.get("query") or input_data.get("text", "")

        # Core Memory（最重要，直接注入）
        core = await memory_manager.get_core_memories(db, agent_id, company_id)

        # Recall Memory（关键词匹配近期记忆）
        recall = await memory_manager.search_recall(db, agent_id, company_id, query_text, limit=3)

        # Archival Memory（语义检索长期记忆，暂无embedding时降级为关键词）
        archival = await memory_manager.search_archival(
            db, agent_id, company_id, query_text=query_text, limit=2,
        )

        # 合并去重
        seen = set()
        result = []
        for m in core + recall + archival:
            if m not in seen:
                seen.add(m)
                result.append(m)

        return result[:10]

    async def _extract_memory_from_execution(
        self,
        db: AsyncSession,
        agent_id: str,
        company_id: str,
        user_id: str,
        execution_id: str,
        input_data: dict,
        output_data: dict,
        quality_score: float,
    ):
        """Letta三层记忆自动管理：根据质量分分层存储"""
        try:
            from app.services.agent_evo.memory.manager import memory_manager

            await memory_manager.auto_manage_memory(
                db, agent_id, company_id, user_id, execution_id,
                input_data, output_data, quality_score,
            )
        except Exception:
            logger.exception("记忆提取失败")

    async def _self_reflect(
        self,
        db: AsyncSession,
        agent_id: str,
        company_id: str,
        user_id: str,
        execution_id: str,
        input_data: dict,
        output_data: dict,
        quality_score: float,
    ):
        """Reflexion反思：质量分在0.2~0.7之间时触发自我反思"""
        if quality_score < 0.2 or quality_score > 0.7:
            return

        try:
            from app.services.ai_gateway import ai_gateway
            from app.services.agent_evo.memory.manager import memory_manager

            query = input_data.get("query") or input_data.get("text", "")
            response = output_data.get("response", "") if output_data else ""

            reflect_prompt = (
                f"你刚完成了一个任务，质量评分为{quality_score:.1f}/1.0（中等偏低）。\n"
                f"请反思这次执行的问题：\n\n"
                f"用户输入：{query[:300]}\n"
                f"你的输出：{response[:300]}\n\n"
                f"请回答：\n"
                f"1. 输出哪里不够好？\n"
                f"2. 如何改进？\n"
                f"3. 下次遇到类似任务应该注意什么？\n\n"
                f"用一句话总结反思结论（不超过50字）。"
            )

            result = await ai_gateway.routed_chat(
                [{"role": "user", "content": reflect_prompt}],
                task="reflexion",
            )

            reflection = result.strip()[:200]
            if reflection:
                await memory_manager.add_recall(
                    db, agent_id, company_id, user_id,
                    f"[反思] {reflection}", score=quality_score * 0.8,
                    source_execution_id=execution_id,
                )
        except Exception:
            logger.exception("Reflexion反思失败")

    async def _auto_debug(
        self,
        db: AsyncSession,
        agent_id: str,
        company_id: str,
        user_id: str,
        error: str,
        input_data: dict,
        agent_config: dict | None = None,
    ) -> str | None:
        """自动调试：用LLM分析错误并生成修复建议"""
        config = agent_config or {}
        if not config.get("auto_debug"):
            return None

        try:
            from app.services.ai_gateway import ai_gateway

            debug_prompt = (
                f"Agent执行出错，请分析原因并给出修复建议：\n\n"
                f"错误信息：{error[:500]}\n"
                f"用户输入：{str(input_data)[:500]}\n"
                f"Agent配置：{str(config)[:300]}\n\n"
                f"返回JSON: {{\"cause\": \"原因\", \"fix\": \"修复建议\", \"severity\": \"low/medium/high\"}}"
            )

            result = await ai_gateway.routed_chat(
                [{"role": "user", "content": debug_prompt}],
                task="error_recovery",
            )
            parsed = ai_gateway.parse_json_response(result)
            return f"[自动调试] {parsed.get('cause', '未知')} → {parsed.get('fix', '无建议')}"
        except Exception:
            return None


# 全局单例
agent_lifecycle = AgentLifecycle()
