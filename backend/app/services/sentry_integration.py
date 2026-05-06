"""
Sentry错误跟踪集成
自动捕获和报告异常
"""
import os
import logging

logger = logging.getLogger(__name__)

# 检查是否安装了sentry-sdk
try:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
    from sentry_sdk.integrations.redis import RedisIntegration
    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False
    logger.warning("sentry-sdk 未安装，错误跟踪功能不可用")

def init_sentry(dsn: str = None, environment: str = "production"):
    """初始化Sentry"""
    if not SENTRY_AVAILABLE:
        return False
    
    dsn = dsn or os.getenv("SENTRY_DSN")
    if not dsn:
        logger.info("SENTRY_DSN 未配置，跳过Sentry初始化")
        return False
    
    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        integrations=[
            FastApiIntegration(),
            SqlalchemyIntegration(),
            RedisIntegration(),
        ],
        traces_sample_rate=0.1,  # 10%的请求进行性能追踪
        profiles_sample_rate=0.05,  # 5%的请求进行性能分析
        send_default_pii=False,  # 不发送个人身份信息
        before_send=before_send_event,
    )
    
    logger.info(f"Sentry 已初始化，环境: {environment}")
    return True

def before_send_event(event, hint):
    """发送前过滤敏感信息"""
    # 移除请求头中的敏感信息
    if event.get("request", {}).get("headers"):
        headers = event["request"]["headers"]
        sensitive_headers = ["authorization", "cookie", "x-confirm-code"]
        for header in sensitive_headers:
            if header in headers:
                headers[header] = "[FILTERED]"
    
    # 移除请求体中的敏感信息
    if event.get("request", {}).get("data"):
        data = event["request"]["data"]
        if isinstance(data, dict):
            sensitive_keys = ["password", "token", "secret", "credit_card"]
            for key in sensitive_keys:
                if key in data:
                    data[key] = "[FILTERED]"
    
    return event

def capture_exception(exc, user_id: str = None, extra: dict = None):
    """捕获并报告异常"""
    if not SENTRY_AVAILABLE:
        return
    
    with sentry_sdk.push_scope() as scope:
        if user_id:
            scope.set_user({"id": user_id})
        if extra:
            for key, value in extra.items():
                scope.set_extra(key, value)
        sentry_sdk.capture_exception(exc)

def capture_message(message: str, level: str = "info", user_id: str = None):
    """发送消息"""
    if not SENTRY_AVAILABLE:
        return
    
    with sentry_sdk.push_scope() as scope:
        if user_id:
            scope.set_user({"id": user_id})
        sentry_sdk.capture_message(message, level=level)
