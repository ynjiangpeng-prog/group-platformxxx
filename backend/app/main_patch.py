
# 在 lifespan 函数中添加事件总线初始化
from app.services.event_bus import bus
from app.services.charging_auto_link import charging_auto_link
from app.services.workflow_actions import execute_workflow_action
