"""评估数据集自动构建

来源：
1. 真实执行历史：从evo_executions挖掘
2. LLM合成：根据agent能力描述生成测试用例
3. 人工标注：API接口供前端提交

评估方式：LLM-as-judge（按rubric 0-10分）
自动分割train/val/holdout（60/20/20）
"""

import logging
import random
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_evolution.models import (
    EvoAgent, EvoExecution, EvoEvalDataset,
)

logger = logging.getLogger(__name__)


class DatasetBuilder:
    """评估数据集构建器"""

    async def build_from_executions(
        self,
        db: AsyncSession,
        agent_id: str,
        company_id: str,
        user_id: str,
        name: str | None = None,
        min_count: int = 10,
    ) -> EvoEvalDataset | None:
        """从执行历史构建评估集"""
        execs = (await db.execute(
            select(EvoExecution).where(
                EvoExecution.agent_id == agent_id,
                EvoExecution.company_id == company_id,
                EvoExecution.is_deleted == False,
                EvoExecution.input_data.isnot(None),
            ).order_by(EvoExecution.created_at.desc()).limit(100)
        )).scalars().all()

        if len(execs) < min_count:
            logger.info("执行历史不足%d条，跳过构建", min_count)
            return None

        agent = (await db.execute(
            select(EvoAgent).where(EvoAgent.id == agent_id)
        )).scalar_one_or_none()
        agent_name = agent.name if agent else "unknown"

        cases = []
        for e in execs:
            cases.append({
                "input": e.input_data,
                "expected_behavior": self._infer_expected(e),
                "rubric": "准确性/完整性/实用性各3-3-4分",
                "source_execution_id": str(e.id),
                "historical_score": e.quality_score,
            })

        # 分割
        split = self._split_dataset(len(cases))

        name = name or f"{agent_name}评估集-历史{len(cases)}条"
        dataset = EvoEvalDataset(
            company_id=company_id,
            created_by=user_id,
            name=name,
            description=f"从{len(cases)}条执行历史自动构建",
            target_type="agent",
            target_id=agent_id,
            cases=cases,
            source="real",
            split=split,
            case_count=len(cases),
        )
        db.add(dataset)
        await db.flush()
        await db.refresh(dataset)
        return dataset

    async def build_from_llm(
        self,
        db: AsyncSession,
        agent_id: str,
        company_id: str,
        user_id: str,
        num_cases: int = 20,
        name: str | None = None,
    ) -> EvoEvalDataset:
        """Self-questioning冷启动：让Agent根据自身能力描述生成测试任务"""
        from app.services.ai_gateway import ai_gateway

        agent = (await db.execute(
            select(EvoAgent).where(EvoAgent.id == agent_id)
        )).scalar_one_or_none()
        if not agent:
            raise ValueError(f"Agent {agent_id} 不存在")

        # Self-questioning: 让Agent自己思考应该被如何测试
        self_question_prompt = (
            f"你是「{agent.name}」，一个AI Agent。以下是你对自己的了解：\n\n"
            f"描述：{agent.description or '无'}\n"
            f"能力：{str(agent.capabilities or {})}\n"
            f"系统提示词（摘要）：{(agent.system_prompt or '')[:500]}\n\n"
            f"请从自身能力出发，生成{num_cases}个能充分测试你能力的任务。\n"
            f"要求覆盖三类场景：\n"
            f"1. 正常场景（easy，占40%）：你应该能轻松完成的任务\n"
            f"2. 边界场景（medium，占40%）：需要谨慎处理的边缘情况\n"
            f"3. 困难场景（hard，占20%）：可能超出能力范围的挑战\n\n"
            f"每个用例包含：\n"
            f"- input: 模拟的用户输入（JSON对象）\n"
            f"- expected_behavior: 你期望自己给出什么样的回答\n"
            f"- difficulty: easy/medium/hard\n"
            f"- category: accuracy/completeness/edge_case/error_handling\n\n"
            f"返回JSON数组，直接输出不要其他文字。"
        )

        try:
            result = await ai_gateway.routed_chat(
                [{"role": "user", "content": self_question_prompt}],
                task="dataset_build",
            )
            parsed = ai_gateway.parse_json_response(result)
            if not isinstance(parsed, list):
                parsed = [parsed] if isinstance(parsed, dict) else []
        except Exception:
            parsed = []

        cases = []
        for i, case in enumerate(parsed[:num_cases]):
            cases.append({
                "input": case.get("input", {}),
                "expected_behavior": case.get("expected_behavior", ""),
                "rubric": case.get("difficulty", "medium"),
                "category": case.get("category", "accuracy"),
            })

        # 如果LLM生成不足，补充基础用例
        while len(cases) < 5:
            cases.append({
                "input": {"query": f"测试用例{len(cases) + 1}"},
                "expected_behavior": "应给出有意义的回答",
                "rubric": "medium",
                "category": "accuracy",
            })

        split = self._split_dataset(len(cases))
        name = name or f"{agent.name}评估集-自问{len(cases)}条"

        dataset = EvoEvalDataset(
            company_id=company_id,
            created_by=user_id,
            name=name,
            description=f"Self-questioning生成{len(cases)}个测试用例",
            target_type="agent",
            target_id=agent_id,
            cases=cases,
            source="synthetic",
            split=split,
            case_count=len(cases),
        )
        db.add(dataset)
        await db.flush()
        await db.refresh(dataset)
        return dataset

    async def add_manual_case(
        self,
        db: AsyncSession,
        dataset_id: str,
        company_id: str,
        user_id: str,
        case: dict,
    ) -> EvoEvalDataset | None:
        """手动添加测试用例"""
        dataset = (await db.execute(
            select(EvoEvalDataset).where(EvoEvalDataset.id == dataset_id)
        )).scalar_one_or_none()
        if not dataset:
            return None

        cases = dataset.cases or []
        cases.append(case)
        dataset.cases = cases
        dataset.case_count = len(cases)
        dataset.split = self._split_dataset(len(cases))
        await db.flush()
        await db.refresh(dataset)
        return dataset

    async def evaluate_with_llm(
        self,
        db: AsyncSession,
        agent_id: str,
        company_id: str,
        user_id: str,
        dataset_id: str,
        prompt: str,
    ) -> list[dict]:
        """用LLM-as-judge评估agent在数据集上的表现"""
        from app.services.ai_gateway import ai_gateway

        dataset = (await db.execute(
            select(EvoEvalDataset).where(EvoEvalDataset.id == dataset_id)
        )).scalar_one_or_none()
        if not dataset:
            return []

        results = []
        for case in dataset.cases[:20]:  # 限制最多20个case
            judge_prompt = (
                f"评估以下AI回答的质量(0-10分)：\n\n"
                f"输入：{str(case.get('input', ''))[:500]}\n"
                f"期望行为：{case.get('expected_behavior', '无')}\n"
                f"评估标准：{case.get('rubric', '准确性、完整性、实用性')}\n\n"
                f"Agent的Prompt：{prompt[:500]}\n\n"
                f"请根据prompt判断该agent能否正确处理这个输入。\n"
                f"只返回JSON: {{\"score\": 数字, \"reason\": \"简短原因\"}}"
            )
            try:
                result = await ai_gateway.routed_chat(
                    [{"role": "user", "content": judge_prompt}],
                    task="dataset_build",
                )
                parsed = ai_gateway.parse_json_response(result)
                results.append({
                    "input": case.get("input"),
                    "score": parsed.get("score", 5),
                    "reason": parsed.get("reason", ""),
                })
            except Exception as e:
                results.append({
                    "input": case.get("input"),
                    "score": 0,
                    "reason": f"评估失败: {e}",
                })

        return results

    def _split_dataset(self, total: int) -> dict:
        """按60/20/20分割数据集"""
        indices = list(range(total))
        random.shuffle(indices)

        train_end = int(total * 0.6)
        val_end = int(total * 0.8)

        return {
            "train": indices[:train_end],
            "val": indices[train_end:val_end],
            "holdout": indices[val_end:],
        }

    def _infer_expected(self, execution: EvoExecution) -> str:
        """从执行结果推断期望行为"""
        if execution.quality_score and execution.quality_score >= 0.7:
            return f"高质量回答（参考得分{execution.quality_score:.1f}的输出）"
        elif execution.error_message:
            return "应避免出错"
        return "应给出有意义的回答"


# 全局单例
dataset_builder = DatasetBuilder()
