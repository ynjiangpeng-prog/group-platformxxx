import os
import logging

logger = logging.getLogger(__name__)

# Provider definitions: each supports OpenAI-compatible /chat/completions
PROVIDERS = {
    "zhipu": {
        "name": "智谱AI (Zhipu)",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "api_key_env": "AI_API_KEY",
        "default_model": "glm-5.1",
        "models": [
            {"id": "glm-ocr", "name": "GLM-OCR", "category": "vision", "description": "轻量图文解析，SOTA OCR精度"},
            {"id": "glm-5.1", "name": "GLM-5.1", "category": "chat", "description": "最新旗舰，200K上下文，128K输出"},
            {"id": "glm-4.6v", "name": "GLM-4.6V", "category": "vision", "description": "视觉推理，128K上下文"},
            {"id": "glm-5v-turbo", "name": "GLM-5V-Turbo", "category": "vision", "description": "快速视觉理解"},
            {"id": "glm-4.7-flash", "name": "GLM-4.7-Flash", "category": "chat", "description": "免费快速模型"},
            {"id": "glm-4-plus", "name": "GLM-4-Plus", "category": "chat", "description": "高性能通用模型"},
            {"id": "glm-4-flash", "name": "GLM-4-Flash", "category": "chat", "description": "极速响应，低成本"},
            {"id": "glm-4v-flash", "name": "GLM-4V-Flash", "category": "vision", "description": "免费视觉模型"},
        ],
    },
    "openai": {
        "name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "api_key_env": "OPENAI_API_KEY",
        "default_model": "gpt-4o",
        "models": [
            {"id": "gpt-4o", "name": "GPT-4o", "category": "chat", "description": "最新多模态旗舰模型"},
            {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "category": "chat", "description": "低成本高效模型"},
            {"id": "gpt-4-turbo", "name": "GPT-4 Turbo", "category": "chat", "description": "高性能推理模型"},
            {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo", "category": "chat", "description": "快速经济模型"},
            {"id": "o1", "name": "o1", "category": "reasoning", "description": "深度推理模型"},
            {"id": "o3-mini", "name": "o3-mini", "category": "reasoning", "description": "轻量推理模型"},
        ],
    },
    "deepseek": {
        "name": "DeepSeek",
        "base_url": "https://api.deepseek.com/v1",
        "api_key_env": "DEEPSEEK_API_KEY",
        "default_model": "deepseek-chat",
        "models": [
            {"id": "deepseek-chat", "name": "DeepSeek V4", "category": "chat", "description": "MoE架构，推理能力强"},
            {"id": "deepseek-reasoner", "name": "DeepSeek R1", "category": "reasoning", "description": "深度推理模型"},
        ],
    },
    "kimi": {
        "name": "Kimi (Moonshot)",
        "base_url": "https://api.moonshot.cn/v1",
        "api_key_env": "KIMI_API_KEY",
        "default_model": "moonshot-v1-128k",
        "models": [
            {"id": "moonshot-v1-8k", "name": "Moonshot V1 8K", "category": "chat", "description": "8K上下文，快速响应"},
            {"id": "moonshot-v1-32k", "name": "Moonshot V1 32K", "category": "chat", "description": "32K上下文"},
            {"id": "moonshot-v1-128k", "name": "Moonshot V1 128K", "category": "chat", "description": "128K长上下文"},
        ],
    },
    "local": {
        "name": "本地模型 (Ollama)",
        "base_url": "http://localhost:11434/v1",
        "api_key_env": "OLLAMA_HOST",  # Ollama不需要key，用占位变量
        "default_model": "gemma4:26b",
        "models": [
            {"id": "gemma4:26b", "name": "Gemma 4 26B", "category": "chat", "description": "本地隐私模型，任务隧道专用"},
            {"id": "gemma4:26b-q5_K_M", "name": "Gemma 4 26B Q5", "category": "chat", "description": "5-bit量化，平衡速度和质量"},
            {"id": "gemma4:26b-q4_K_M", "name": "Gemma 4 26B Q4", "category": "chat", "description": "4-bit量化，最快速度"},
        ],
    },
    "nvidia": {
        "name": "NVIDIA NIM",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "api_key_env": "NVIDIA_API_KEY",
        "default_model": "meta/llama-3.1-405b-instruct",
        "models": [
            {"id": "meta/llama-3.1-405b-instruct", "name": "Llama 3.1 405B", "category": "chat", "description": "Meta最大开源模型"},
            {"id": "meta/llama-3.1-70b-instruct", "name": "Llama 3.1 70B", "category": "chat", "description": "高性能通用模型"},
            {"id": "meta/llama-3.1-8b-instruct", "name": "Llama 3.1 8B", "category": "chat", "description": "轻量快速模型"},
            {"id": "nvidia/llama-3.1-nemotron-70b-instruct", "name": "Nemotron 70B", "category": "chat", "description": "NVIDIA定制优化模型"},
            {"id": "mistralai/mixtral-8x22b-instruct-v0.1", "name": "Mixtral 8x22B", "category": "chat", "description": "MoE架构高效模型"},
            {"id": "google/gemma-2-27b-it", "name": "Gemma 2 27B", "category": "chat", "description": "Google开源模型"},
        ],
    },
}

# Backward compatibility: active provider determined by env vars
AI_API_KEY = os.getenv("AI_API_KEY")
AI_API_BASE = os.getenv("AI_API_BASE", PROVIDERS["zhipu"]["base_url"])
AI_MODEL = os.getenv("AI_MODEL", PROVIDERS["zhipu"]["default_model"])

# Detect which provider is active based on base URL
def _detect_provider() -> str:
    base = AI_API_BASE.rstrip("/")
    for pid, p in PROVIDERS.items():
        if base == p["base_url"].rstrip("/"):
            return pid
    return "custom"

ACTIVE_PROVIDER = _detect_provider()

# Build AVAILABLE_MODELS from active provider (backward compat)
AVAILABLE_MODELS = PROVIDERS.get(ACTIVE_PROVIDER, PROVIDERS["zhipu"])["models"]

if not AI_API_KEY:
    logger.warning("AI_API_KEY not set - AI features will be unavailable until configured")
