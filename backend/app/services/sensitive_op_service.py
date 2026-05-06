"""
敏感操作二次确认服务
对删除、大额转账等操作要求确认码
"""
import secrets
import hashlib
import time
from typing import Optional, Dict
from datetime import datetime, timedelta
from fastapi import Request, HTTPException, status
import redis
from app.core.config import REDIS_URL

redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)

class SensitiveOperationService:
    """敏感操作确认服务
    
    需要二次确认的操作：
    - DELETE 请求（删除数据）
    - 大额转账（金额 > 10000）
    - 批量操作（影响多条记录）
    - 系统配置修改
    """
    
    # 敏感路径模式
    SENSITIVE_PATTERNS = [
        "/api/v1/erp/contracts/",      # 合同删除
        "/api/v1/finance/vouchers/",   # 凭证删除
        "/api/v1/project/projects/",   # 项目删除
        "/api/v1/charging/stations/",  # 充电站删除
        "/api/v1/system/users/",       # 用户删除
        "/api/v1/crm/customers/",      # 客户删除
    ]
    
    # 大额操作阈值
    LARGE_AMOUNT_THRESHOLD = 10000
    
    # 确认码有效期（分钟）
    CODE_EXPIRE_MINUTES = 10
    
    def is_sensitive_operation(self, request: Request) -> bool:
        """判断是否为敏感操作"""
        path = request.url.path
        method = request.method
        
        # DELETE 请求都是敏感的
        if method == "DELETE":
            return any(path.startswith(p) for p in self.SENSITIVE_PATTERNS)
        
        # POST/PUT 中大额操作
        if method in ["POST", "PUT"]:
            # 检查路径
            if any(path.startswith(p) for p in self.SENSITIVE_PATTERNS):
                return True
            
            # 检查金额（简单检查body中的amount字段）
            # 实际实现应该在具体路由中调用
            pass
        
        return False
    
    async def generate_confirm_code(self, user_id: str, operation: str) -> str:
        """生成确认码"""
        code = secrets.token_hex(3).upper()  # 6位十六进制码
        key = f"confirm:{user_id}:{operation}"
        
        redis_client.setex(
            key,
            self.CODE_EXPIRE_MINUTES * 60,
            code
        )
        
        return code
    
    async def validate_confirm_code(self, user_id: str, operation: str, code: str) -> bool:
        """验证确认码"""
        key = f"confirm:{user_id}:{operation}"
        stored = redis_client.get(key)
        
        if not stored:
            return False
        
        if stored.upper() != code.upper():
            return False
        
        # 验证成功后删除
        redis_client.delete(key)
        return True
    
    async def require_confirmation(self, user_id: str, operation: str, code: Optional[str]) -> None:
        """要求确认码，如果未提供或无效则抛出异常"""
        if not code:
            # 生成新的确认码
            new_code = await self.generate_confirm_code(user_id, operation)
            raise HTTPException(
                status_code=status.HTTP_428_PRECONDITION_REQUIRED,
                detail={
                    "message": "此操作需要二次确认",
                    "operation": operation,
                    "confirm_code": new_code,
                    "expire_minutes": self.CODE_EXPIRE_MINUTES,
                    "instruction": "请在请求头中添加 X-Confirm-Code: " + new_code
                }
            )
        
        if not await self.validate_confirm_code(user_id, operation, code):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="确认码无效或已过期"
            )

# 全局实例
sensitive_op = SensitiveOperationService()
