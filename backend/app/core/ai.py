import os

AI_API_KEY = os.getenv("AI_API_KEY")
if not AI_API_KEY:
    raise RuntimeError(
        "AI_API_KEY environment variable is required. "
        "Please set it in your environment or .env file."
    )

AI_API_BASE = os.getenv("AI_API_BASE", "https://open.bigmodel.cn/api/paas/v4")
AI_MODEL = os.getenv("AI_MODEL", "glm-5.1")

AVAILABLE_MODELS = [
    {"id": "glm-ocr", "name": "GLM-OCR", "provider": "Zhipu", "category": "vision", "description": "轻量图文解析，SOTA OCR精度"},
    {"id": "glm-5.1", "name": "GLM-5.1", "provider": "Zhipu", "category": "chat", "description": "最新旗舰，200K上下文，128K输出"},
    {"id": "glm-4.6v", "name": "GLM-4.6V", "provider": "Zhipu", "category": "vision", "description": "视觉推理，128K上下文"},
    {"id": "glm-5v-turbo", "name": "GLM-5V-Turbo", "provider": "Zhipu", "category": "vision", "description": "快速视觉理解"},
    {"id": "glm-4.7-flash", "name": "GLM-4.7-Flash", "provider": "Zhipu", "category": "chat", "description": "免费快速模型"},
    {"id": "glm-4-plus", "name": "GLM-4-Plus", "provider": "Zhipu", "category": "chat", "description": "高性能通用模型"},
    {"id": "glm-4-flash", "name": "GLM-4-Flash", "provider": "Zhipu", "category": "chat", "description": "极速响应，低成本"},
    {"id": "glm-4v-flash", "name": "GLM-4V-Flash", "provider": "Zhipu", "category": "vision", "description": "免费视觉模型"},
]
