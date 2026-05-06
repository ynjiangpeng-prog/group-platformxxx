"""
结构化日志配置
支持JSON格式日志输出，便于ELK/Loki收集
"""
import json
import logging
import sys
from datetime import datetime
from typing import Any, Dict

class JSONFormatter(logging.Formatter):
    """JSON格式日志格式化器"""
    
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        
        # 添加额外字段
        if hasattr(record, "request_id"):
            log_data["request_id"] = record.request_id
        if hasattr(record, "user_id"):
            log_data["user_id"] = record.user_id
        if hasattr(record, "path"):
            log_data["path"] = record.path
        if hasattr(record, "method"):
            log_data["method"] = record.method
        if hasattr(record, "status_code"):
            log_data["status_code"] = record.status_code
        if hasattr(record, "duration_ms"):
            log_data["duration_ms"] = record.duration_ms
        if hasattr(record, "error_id"):
            log_data["error_id"] = record.error_id
        
        # 添加异常信息
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        
        # 添加自定义字段
        for key, value in record.__dict__.items():
            if key not in log_data and not key.startswith("_"):
                log_data[key] = str(value)
        
        return json.dumps(log_data, ensure_ascii=False, default=str)


def setup_structured_logging(log_level: str = "INFO"):
    """配置结构化日志"""
    
    # 根日志器
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper()))
    
    # 清除现有处理器
    root_logger.handlers.clear()
    
    # 创建JSON格式处理器
    json_handler = logging.StreamHandler(sys.stdout)
    json_handler.setFormatter(JSONFormatter())
    root_logger.addHandler(json_handler)
    
    # 访问日志处理器
    access_logger = logging.getLogger("uvicorn.access")
    access_logger.handlers.clear()
    access_handler = logging.StreamHandler(sys.stdout)
    access_handler.setFormatter(JSONFormatter())
    access_logger.addHandler(access_handler)
    
    # 错误日志处理器
    error_logger = logging.getLogger("uvicorn.error")
    error_logger.handlers.clear()
    error_handler = logging.StreamHandler(sys.stderr)
    error_handler.setFormatter(JSONFormatter())
    error_logger.addHandler(error_handler)
    
    return root_logger


# 便捷函数
def log_request(request_id: str, method: str, path: str, user_id: str = None, 
                status_code: int = None, duration_ms: float = None):
    """记录请求日志"""
    logger = logging.getLogger("app.request")
    extra = {
        "request_id": request_id,
        "method": method,
        "path": path,
        "user_id": user_id,
        "status_code": status_code,
        "duration_ms": duration_ms
    }
    logger.info(f"{method} {path} - {status_code}", extra=extra)


def log_error(error_id: str, message: str, exc_info=None, **kwargs):
    """记录错误日志"""
    logger = logging.getLogger("app.error")
    extra = {"error_id": error_id, **kwargs}
    logger.error(message, extra=extra, exc_info=exc_info)
