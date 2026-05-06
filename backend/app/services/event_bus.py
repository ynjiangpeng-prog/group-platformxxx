"""
统一业务事件总线
替代分散的cascade函数，实现松耦合的业务联动
"""
import logging
from typing import Callable, Dict, List
from functools import wraps

logger = logging.getLogger(__name__)


class EventBus:
    """业务事件总线"""
    
    def __init__(self):
        self.handlers: Dict[str, List[Callable]] = {}
    
    def on(self, event: str):
        """注册事件处理器"""
        def decorator(fn: Callable):
            if event not in self.handlers:
                self.handlers[event] = []
            self.handlers[event].append(fn)
            return fn
        return decorator
    
    async def emit(self, event: str, **kwargs):
        """触发事件"""
        handlers = self.handlers.get(event, [])
        for handler in handlers:
            try:
                await handler(**kwargs)
            except Exception as e:
                logger.error(f"事件处理器 {handler.__name__} 处理 {event} 失败: {e}")


# 全局事件总线
bus = EventBus()


# 注册核心业务事件处理器
@bus.on('contract_created')
async def on_contract_created(contract_id: str, company_id: str, **kwargs):
    """合同创建后自动创建AR/AP"""
    from app.services.contract_cascade import contract_cascade
    from app.core.database import async_session_factory
    
    async with async_session_factory() as db:
        await contract_cascade.cascade_on_contract_create(db, contract_id)
        await db.commit()


@bus.on('invoice_checked')
async def on_invoice_checked(invoice_id: str, **kwargs):
    """发票勾选后自动匹配银行流水"""
    from app.services.finance_event_chain import finance_event_chain
    from app.core.database import async_session_factory
    
    async with async_session_factory() as db:
        await finance_event_chain.on_invoice_verified(db, invoice_id)
        await db.commit()


@bus.on('bank_imported')
async def on_bank_imported(company_id: str, **kwargs):
    """银行流水导入后自动匹配"""
    from app.services.finance_event_chain import finance_event_chain
    from app.core.database import async_session_factory
    
    async with async_session_factory() as db:
        await finance_event_chain.on_bank_import(db, company_id)
        await db.commit()


@bus.on('order_created')
async def on_order_created(order_id: str, **kwargs):
    """充电订单创建后自动关联项目"""
    from app.services.charging_auto_link import charging_auto_link
    from app.core.database import async_session_factory
    
    async with async_session_factory() as db:
        await charging_auto_link.auto_link_order_to_project(db, order_id)
        await db.commit()
