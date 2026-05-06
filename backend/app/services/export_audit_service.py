"""
数据导出审计服务
记录所有数据导出操作
"""
import uuid
import json
from datetime import datetime
from typing import Dict, Optional, List
from fastapi import Request
import redis
from app.core.config import REDIS_URL

redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)

class ExportAuditService:
    """数据导出审计服务"""
    
    # 导出相关路径模式
    EXPORT_PATTERNS = [
        "/api/v1/erp/contracts",
        "/api/v1/finance/vouchers",
        "/api/v1/project/projects",
        "/api/v1/charging/stations",
        "/api/v1/crm/customers",
        "/api/v1/analytics",
    ]
    
    # 导出操作类型
    EXPORT_METHODS = ["GET"]  # 大数据量GET视为导出
    
    def is_export_operation(self, request: Request) -> bool:
        """判断是否为导出操作"""
        path = request.url.path
        method = request.method
        
        if method not in self.EXPORT_METHODS:
            return False
        
        # 检查是否有导出参数
        query = str(request.query_params)
        export_indicators = [
            "export=", "download=", "format=csv", "format=xlsx",
            "page_size=999", "limit=999", "all=true"
        ]
        
        # 路径匹配且有大查询量
        if any(path.startswith(p) for p in self.EXPORT_PATTERNS):
            # 如果请求大数据量或显式导出参数
            if any(ind in query for ind in export_indicators):
                return True
            
            # 如果没有分页参数，可能是一次性查询大量数据
            if "page=" not in query and "limit=" not in query and "page_size=" not in query:
                return True
        
        return False
    
    async def log_export(self, request: Request, user_id: str, user_name: str, 
                        records_count: int = 0, file_size: int = 0) -> str:
        """记录导出操作"""
        audit_id = str(uuid.uuid4())
        
        log_entry = {
            "id": audit_id,
            "timestamp": datetime.now().isoformat(),
            "user_id": user_id,
            "user_name": user_name,
            "ip_address": self._get_client_ip(request),
            "user_agent": request.headers.get("User-Agent", ""),
            "path": request.url.path,
            "query": str(request.query_params),
            "method": request.method,
            "records_count": records_count,
            "file_size": file_size,
            "type": "data_export"
        }
        
        # 保存到Redis（保留30天）
        key = f"export_audit:{audit_id}"
        redis_client.setex(key, 30 * 24 * 3600, json.dumps(log_entry))
        
        # 添加到用户导出记录列表
        user_key = f"user_exports:{user_id}"
        redis_client.lpush(user_key, audit_id)
        redis_client.ltrim(user_key, 0, 99)  # 保留最近100条
        redis_client.expire(user_key, 30 * 24 * 3600)
        
        # 添加今日统计
        today = datetime.now().strftime("%Y-%m-%d")
        daily_key = f"export_stats:{today}"
        redis_client.hincrby(daily_key, "total_exports", 1)
        redis_client.hincrby(daily_key, "total_records", records_count)
        redis_client.expire(daily_key, 7 * 24 * 3600)
        
        return audit_id
    
    async def get_user_exports(self, user_id: str, limit: int = 20) -> List[Dict]:
        """获取用户的导出记录"""
        user_key = f"user_exports:{user_id}"
        audit_ids = redis_client.lrange(user_key, 0, limit - 1)
        
        results = []
        for audit_id in audit_ids:
            key = f"export_audit:{audit_id}"
            data = redis_client.get(key)
            if data:
                results.append(json.loads(data))
        
        return results
    
    async def get_export_stats(self, days: int = 7) -> Dict:
        """获取导出统计"""
        stats = []
        for i in range(days):
            day = (datetime.now() - __import__('datetime').timedelta(days=i)).strftime("%Y-%m-%d")
            key = f"export_stats:{day}"
            data = redis_client.hgetall(key)
            if data:
                stats.append({
                    "date": day,
                    "total_exports": int(data.get("total_exports", 0)),
                    "total_records": int(data.get("total_records", 0))
                })
        
        return {
            "days": days,
            "daily_stats": stats,
            "total_exports": sum(s["total_exports"] for s in stats),
            "total_records": sum(s["total_records"] for s in stats)
        }
    
    def _get_client_ip(self, request: Request) -> str:
        """获取客户端IP"""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

# 全局实例
export_audit = ExportAuditService()
