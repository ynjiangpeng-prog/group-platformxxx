"""
数据导出审计中间件
自动记录数据导出操作
"""
import json
from fastapi import Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware
from app.services.export_audit_service import export_audit

class ExportAuditMiddleware(BaseHTTPMiddleware):
    """导出审计中间件"""
    
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        method = request.method
        
        # 检查是否为导出操作
        is_export = export_audit.is_export_operation(request)
        
        response = await call_next(request)
        
        # 记录导出操作
        if is_export and response.status_code == 200:
            try:
                # 尝试获取用户信息
                user_id = "anonymous"
                user_name = "未知用户"
                
                # 从JWT中获取（简化版）
                auth_header = request.headers.get("Authorization")
                if auth_header and auth_header.startswith("Bearer "):
                    # 这里简化处理，实际应解析JWT
                    user_id = "authenticated"
                    user_name = "已认证用户"
                
                # 获取记录数（如果有的话）
                records_count = 0
                if hasattr(response, 'body'):
                    try:
                        body = json.loads(response.body)
                        if isinstance(body, list):
                            records_count = len(body)
                        elif isinstance(body, dict) and 'items' in body:
                            records_count = len(body['items'])
                        elif isinstance(body, dict) and 'data' in body:
                            records_count = len(body['data'])
                    except:
                        pass
                
                await export_audit.log_export(
                    request=request,
                    user_id=user_id,
                    user_name=user_name,
                    records_count=records_count
                )
            except Exception:
                pass  # 审计失败不影响业务
        
        return response
