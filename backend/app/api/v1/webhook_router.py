'''
Webhook配置API
'''
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

from app.api.deps.auth import get_current_user
from app.models.organization import User
from app.services.webhook_service import webhook_service

router = APIRouter(prefix='/webhooks', tags=['Webhook通知'])

class WebhookConfig(BaseModel):
    dingtalk_url: Optional[str] = None
    wechat_url: Optional[str] = None

@router.post('/config')
async def configure_webhooks(
    config: WebhookConfig,
    current_user: User = Depends(get_current_user),
):
    '''配置Webhook地址'''
    webhook_service.configure(
        dingtalk_url=config.dingtalk_url,
        wechat_url=config.wechat_url
    )
    return {
        'status': 'success',
        'dingtalk_enabled': bool(config.dingtalk_url),
        'wechat_enabled': bool(config.wechat_url),
    }

@router.get('/status')
async def get_webhook_status(
    current_user: User = Depends(get_current_user),
):
    '''获取Webhook状态'''
    return {
        'enabled': webhook_service.enabled,
        'dingtalk_configured': bool(webhook_service.dingtalk_webhook),
        'wechat_configured': bool(webhook_service.wechat_webhook),
    }

@router.post('/test')
async def test_webhook(
    current_user: User = Depends(get_current_user),
):
    '''测试Webhook发送'''
    test_alert = {
        'type': 'test',
        'severity': 'high',
        'title': 'Webhook测试通知',
        'message': '这是一条测试消息，用于验证Webhook配置是否正确',
        'suggestion': '如果收到此消息，说明Webhook配置成功',
        'created_at': '2024-01-01T00:00:00'
    }
    
    import asyncio
    success = await webhook_service.send_alert(test_alert)
    
    return {
        'success': success,
        'message': '测试消息已发送' if success else '发送失败，请检查Webhook配置'
    }
