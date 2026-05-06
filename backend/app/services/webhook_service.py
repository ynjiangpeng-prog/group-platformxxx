import json
import urllib.request
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)

class WebhookService:
    """Webhook通知服务"""
    
    def __init__(self):
        self.dingtalk_webhook = None
        self.wechat_webhook = None
        self.enabled = False
    
    def configure(self, dingtalk_url: Optional[str] = None, wechat_url: Optional[str] = None):
        """配置webhook地址"""
        self.dingtalk_webhook = dingtalk_url
        self.wechat_webhook = wechat_url
        self.enabled = bool(dingtalk_url or wechat_url)
    
    async def send_alert(self, alert: Dict) -> bool:
        """发送告警通知"""
        if not self.enabled:
            return False
        
        success = True
        
        if self.dingtalk_webhook and alert.get('severity') in ['critical', 'high']:
            try:
                await self._send_dingtalk(alert)
            except Exception as e:
                logger.error(f"DingTalk发送失败: {e}")
                success = False
        
        if self.wechat_webhook and alert.get('severity') in ['critical', 'high']:
            try:
                await self._send_wechat(alert)
            except Exception as e:
                logger.error(f"WeChat发送失败: {e}")
                success = False
        
        return success
    
    async def _send_dingtalk(self, alert: Dict):
        """发送钉钉通知"""
        severity_emoji = {
            'critical': '🔴',
            'high': '🟠',
            'medium': '🟡',
            'low': '🟢'
        }
        
        emoji = severity_emoji.get(alert.get('severity', 'low'), '⚪')
        
        message = {
            "msgtype": "markdown",
            "markdown": {
                "title": f"{emoji} 永充平台业务告警",
                "text": f"### {emoji} {alert.get('title', '告警通知')}\n\n"
                        f"**类型**: {alert.get('type', '未知')}\n\n"
                        f"**级别**: {alert.get('severity', '未知')}\n\n"
                        f"**内容**: {alert.get('message', '')}\n\n"
                        f"**建议**: {alert.get('suggestion', '无')}\n\n"
                        f"**时间**: {alert.get('created_at', '')}"
            }
        }
        
        req = urllib.request.Request(
            self.dingtalk_webhook,
            data=json.dumps(message).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        
        with urllib.request.urlopen(req) as resp:
            resp.read()
    
    async def _send_wechat(self, alert: Dict):
        """发送企业微信通知"""
        message = {
            "msgtype": "text",
            "text": {
                "content": f"【永充平台告警】\n"
                          f"标题: {alert.get('title', '')}\n"
                          f"级别: {alert.get('severity', '')}\n"
                          f"内容: {alert.get('message', '')}\n"
                          f"建议: {alert.get('suggestion', '')}"
            }
        }
        
        req = urllib.request.Request(
            self.wechat_webhook,
            data=json.dumps(message).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        
        with urllib.request.urlopen(req) as resp:
            resp.read()
    
    async def send_batch_alerts(self, alerts: List[Dict]) -> int:
        """批量发送告警，返回成功数"""
        success_count = 0
        for alert in alerts:
            if await self.send_alert(alert):
                success_count += 1
        return success_count

# 全局实例
webhook_service = WebhookService()
