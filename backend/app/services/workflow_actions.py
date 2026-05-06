
# 在工作流审批通过后自动执行业务动作
async def execute_workflow_action(db: AsyncSession, instance_id: str, action: str, params: dict):
    """根据工作流审批结果执行业务动作"""
    logger = logging.getLogger(__name__)
    
    action_handlers = {
        'update_project_status': _handle_update_project_status,
        'create_purchase_order': _handle_create_purchase_order,
        'approve_budget': _handle_approve_budget,
        'notify_stakeholders': _handle_notify_stakeholders,
    }
    
    handler = action_handlers.get(action)
    if handler:
        try:
            await handler(db, params)
            logger.info(f"工作流动作 {action} 执行成功")
        except Exception as e:
            logger.error(f"工作流动作 {action} 执行失败: {e}")
    else:
        logger.warning(f"未找到工作流动作处理器: {action}")


async def _handle_update_project_status(db, params):
    from app.models.project.models import Project
    project_id = params.get('project_id')
    new_status = params.get('status')
    
    await db.execute(
        update(Project)
        .where(Project.id == project_id)
        .values(status=new_status)
    )


async def _handle_create_purchase_order(db, params):
    # 创建采购订单的逻辑
    pass


async def _handle_approve_budget(db, params):
    # 审批预算的逻辑
    pass


async def _handle_notify_stakeholders(db, params):
    # 发送通知的逻辑
    pass
