import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.agent.memory_service import recall_memories, get_or_create_profile

logger = logging.getLogger(__name__)

ROLE_PROMPTS = {
    "project_manager": (
        "你是一个资深工程项目经理AI助手，专精于充电站电力工程建设管理。\n"
        "你的关注点：项目进度、成本控制、施工质量、安全合规、资源调度。\n"
        "回答风格：简洁务实，关注关键路径和风险点，给出可操作的下一步建议。\n"
        "数据偏好：优先展示项目进度百分比、预算使用率、工期偏差天数。\n"
    ),
    "finance": (
        "你是一个企业财务总监AI助手，专精于充电站运营的财务管理。\n"
        "你的关注点：现金流、应收应付、成本归集、税务筹划、预算执行。\n"
        "回答风格：数据驱动，关注金额和比率，给出明确的财务建议。\n"
        "数据偏好：优先展示应收余额、逾期金额、利润率、预算偏差。\n"
    ),
    "operations": (
        "你是一个充电站运营总监AI助手，专精于充电站日常运营优化。\n"
        "你的关注点：充电量、利用率、设备状态、客户满意度、运营成本。\n"
        "回答风格：关注运营效率和客户体验，善于发现优化空间。\n"
        "数据偏好：优先展示充电量趋势、平均单价、设备利用率、峰平谷分布。\n"
    ),
    "engineer": (
        "你是一个电力工程高级工程师AI助手，专精于充电站电气施工。\n"
        "你的关注点：施工质量、电气安全、设备安装规范、调试流程。\n"
        "回答风格：严谨专业，引用标准和规范，关注安全隐患。\n"
        "数据偏好：优先展示施工日志、巡检结果、安全事件、设备参数。\n"
    ),
    "default": (
        "你是一个企业智能管理助手，帮助用户高效管理充电站投建运营全流程。\n"
        "回答简洁可操作，涉及具体数据时建议用户查看对应管理页面。\n"
    ),
}


def detect_user_role(user) -> str:
    if user.is_super_admin:
        return "default"
    dept = getattr(user, "department_id", None) or ""
    dept = str(dept).lower()
    if "财务" in dept or "financ" in dept:
        return "finance"
    if "运营" in dept or "operat" in dept:
        return "operations"
    if "工程" in dept or "engineer" in dept or "施工" in dept:
        return "engineer"
    if "项目" in dept or "project" in dept:
        return "project_manager"
    return "default"


async def build_role_prompt(
    db: AsyncSession,
    company_id: str,
    user_id: str,
    user,
    module: str = "autopilot",
) -> str:
    from app.services.context_builder import context_builder

    role = detect_user_role(user)
    base = ROLE_PROMPTS.get(role, ROLE_PROMPTS["default"])
    system_prompt = await context_builder.build_system_prompt(db, company_id, module, base)

    memories = await recall_memories(db, company_id, user_id, category="preference", limit=5)
    if memories:
        mem_lines = ["\n## 用户偏好"]
        for m in memories:
            content = m.value or {}
            if isinstance(content, dict) and content.get("content"):
                mem_lines.append(f"- {content['content']}")
        if len(mem_lines) > 1:
            system_prompt += "\n".join(mem_lines)

    corrections = await recall_memories(db, company_id, user_id, category="correction", limit=3)
    if corrections:
        corr_lines = ["\n## 已知的用户纠正"]
        for c in corrections:
            content = c.value or {}
            if isinstance(content, dict) and content.get("content"):
                corr_lines.append(f"- {content['content']}")
        if len(corr_lines) > 1:
            system_prompt += "\n".join(corr_lines)

    return system_prompt
