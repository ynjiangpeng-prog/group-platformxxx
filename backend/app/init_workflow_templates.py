import asyncio
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.models.workflow.engine import ProjectTypeTemplate


PURE_ENGINEERING_STAGES = [
    {"name": "立项", "code": "init", "order": 1, "required_docs": ["立项报告"], "auto_actions": ["create_project"], "approval_required": True},
    {"name": "踏勘", "code": "survey", "order": 2, "required_docs": ["踏勘报告"], "auto_actions": ["notify_survey_team"]},
    {"name": "设计", "code": "design", "order": 3, "required_docs": ["设计图纸", "预算书"]},
    {"name": "许可", "code": "permit", "order": 4, "auto_actions": ["track_permit_status"]},
    {"name": "施工", "code": "construction", "order": 5, "auto_actions": ["create_daily_plan_template", "track_progress"]},
    {"name": "验收", "code": "acceptance", "order": 6, "required_docs": ["验收报告"]},
    {"name": "结算", "code": "settlement", "order": 7, "auto_actions": ["generate_voucher", "create_arap"]},
    {"name": "归档", "code": "archive", "order": 8, "auto_actions": ["archive_docs"]},
]

SELF_INVEST_STAGES = [
    {"name": "立项", "code": "init", "order": 1, "required_docs": ["立项报告"], "auto_actions": ["create_project"], "approval_required": True},
    {"name": "选址", "code": "site_selection", "order": 2, "required_docs": ["选址报告"]},
    {"name": "决策", "code": "decision", "order": 3, "required_docs": ["可行性研究报告", "投资分析报告"], "approval_required": True},
    {"name": "设计", "code": "design", "order": 4, "required_docs": ["设计图纸", "预算书"]},
    {"name": "施工", "code": "construction", "order": 5, "auto_actions": ["create_daily_plan_template", "track_progress"]},
    {"name": "运营", "code": "operation", "order": 6, "auto_actions": ["create_station"]},
    {"name": "回本分析", "code": "roi_analysis", "order": 7, "auto_actions": ["generate_roi_report"]},
    {"name": "归档", "code": "archive", "order": 8, "auto_actions": ["archive_docs"]},
]

CO_BUILD_STAGES = [
    {"name": "立项", "code": "init", "order": 1, "required_docs": ["立项报告"], "auto_actions": ["create_project"], "approval_required": True},
    {"name": "合作方管理", "code": "partner_mgmt", "order": 2, "required_docs": ["合作协议"], "auto_actions": ["notify_partners"]},
    {"name": "投资分摊", "code": "investment_split", "order": 3, "required_docs": ["投资分摊方案"], "approval_required": True},
    {"name": "设计", "code": "design", "order": 4, "required_docs": ["设计图纸", "预算书"]},
    {"name": "施工", "code": "construction", "order": 5, "auto_actions": ["create_daily_plan_template", "track_progress"]},
    {"name": "验收", "code": "acceptance", "order": 6, "required_docs": ["验收报告"]},
    {"name": "收益分成", "code": "revenue_share", "order": 7, "auto_actions": ["generate_voucher", "create_arap", "calculate_revenue_share"]},
    {"name": "归档", "code": "archive", "order": 8, "auto_actions": ["archive_docs"]},
]

TEMPLATES = [
    {"name": "纯工程", "code": "pure_engineering", "description": "纯工程项目流程：立项→踏勘→设计→许可→施工→验收→结算→归档", "stages": PURE_ENGINEERING_STAGES},
    {"name": "自投", "code": "self_invest", "description": "自投项目流程：立项→选址→决策→设计→施工→运营→回本分析→归档", "stages": SELF_INVEST_STAGES},
    {"name": "共建", "code": "co_build", "description": "共建项目流程：立项→合作方管理→投资分摊→设计→施工→验收→收益分成→归档", "stages": CO_BUILD_STAGES},
]


async def seed_templates(company_id: str | None = None):
    async with async_session_factory() as db:
        for tpl_data in TEMPLATES:
            result = await db.execute(
                select(ProjectTypeTemplate).where(
                    ProjectTypeTemplate.code == tpl_data["code"],
                    ProjectTypeTemplate.is_deleted == False,
                )
            )
            existing = result.scalar_one_or_none()
            if existing:
                existing.name = tpl_data["name"]
                existing.description = tpl_data["description"]
                existing.stages = tpl_data["stages"]
                print(f"✓ 更新模板: {tpl_data['name']} ({tpl_data['code']})")
            else:
                template = ProjectTypeTemplate(
                    name=tpl_data["name"],
                    code=tpl_data["code"],
                    description=tpl_data["description"],
                    stages=tpl_data["stages"],
                    company_id=company_id or "00000000-0000-0000-0000-000000000000",
                )
                db.add(template)
                print(f"✓ 创建模板: {tpl_data['name']} ({tpl_data['code']})")

        await db.commit()
        print("✓ 模板数据初始化完成")


if __name__ == "__main__":
    import sys
    cid = sys.argv[1] if len(sys.argv) > 1 else None
    asyncio.run(seed_templates(cid))
