from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.services.ai_gateway import ai_gateway, TASK_MODELS
from app.core.ai import PROVIDERS, AVAILABLE_MODELS

router = APIRouter(prefix="/ai/gateway", tags=["AI网关"])


class ChatRequest(BaseModel):
    messages: list[dict] = Field(..., description="对话消息列表")
    model: str = Field("glm-4-flash", description="模型名称")


class AnalyzeRequest(BaseModel):
    document_text: str = Field(..., description="文档内容")
    analysis_type: str = Field("summary", description="分析类型: risk|compliance|summary")


class ReportRequest(BaseModel):
    report_type: str = Field(..., description="报告类型")
    data: dict = Field(..., description="报告数据")
    template: str | None = Field(None, description="报告模板")


class SwitchProviderRequest(BaseModel):
    provider_id: str = Field(..., description="提供商ID: zhipu|openai|kimi|nvidia")
    api_key: str | None = Field(None, description="API密钥(可选,不填则从环境变量读取)")


class UpdateConfigRequest(BaseModel):
    provider: str | None = Field(None, description="AI提供商ID")
    api_key: str | None = Field(None, description="API密钥")
    api_base: str | None = Field(None, description="API地址")
    model_chat: str | None = Field(None, description="对话模型")
    model_vision: str | None = Field(None, description="视觉模型")


# ─── Provider Management ─────────────────────────────────────────

@router.get("/status")
async def gateway_status(current_user: User = Depends(get_current_user)):
    return ai_gateway.get_status()


@router.get("/providers")
async def list_providers(current_user: User = Depends(get_current_user)):
    """List all supported AI providers and their status."""
    return {"success": True, "data": ai_gateway.get_provider_info()}


@router.post("/providers/switch")
async def switch_provider(
    body: SwitchProviderRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Switch the active AI provider."""
    if not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="仅超级管理员可切换AI提供商")

    if body.provider_id not in PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的提供商: {body.provider_id}。可选: {', '.join(PROVIDERS.keys())}"
        )

    try:
        await ai_gateway.switch_provider(body.provider_id, body.api_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"切换失败: {str(e)}")

    # Persist to database
    await _save_config(db, "ai_provider", body.provider_id)
    if body.api_key:
        await _save_config(db, "ai_api_key", body.api_key)
    config = PROVIDERS[body.provider_id]
    await _save_config(db, "ai_api_base", config["base_url"])
    await _save_config(db, "ai_vision_model", TASK_MODELS.get("ocr_vision", ""))
    await _save_config(db, "ai_reasoning_model", TASK_MODELS.get("reasoning", ""))

    return {
        "success": True,
        "message": f"已切换到 {config['name']}",
        "provider": ai_gateway.get_status(),
    }


@router.post("/providers/{provider_id}/test")
async def test_provider(
    provider_id: str,
    current_user: User = Depends(get_current_user),
):
    """Test connectivity to a specific provider."""
    if provider_id not in PROVIDERS:
        raise HTTPException(status_code=400, detail=f"不支持的提供商: {provider_id}")

    import os
    config = PROVIDERS[provider_id]
    api_key = os.getenv(config["api_key_env"])

    if not api_key:
        return {
            "success": False,
            "provider": provider_id,
            "error": f"未配置 {config['api_key_env']} 环境变量",
            "hint": f"请在系统配置中设置 {config['api_key_env']} 或通过 /providers/switch 接口传入 api_key",
        }

    # Temporarily create a provider to test
    from app.services.ai_gateway import OpenAICompatibleProvider
    test_provider = OpenAICompatibleProvider(api_key=api_key, base_url=config["base_url"])
    result = await test_provider.test_connection(config["default_model"])
    await test_provider.close()
    return {"success": result["success"], "provider": provider_id, "data": result}


# ─── Chat & Analysis ──────────────────────────────────────────────

@router.post("/chat")
async def gateway_chat(body: ChatRequest, current_user: User = Depends(get_current_user)):
    try:
        result = await ai_gateway.provider.chat(body.messages, model=body.model)
        return {"success": True, "data": {"reply": result}}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI服务调用失败: {str(e)}")


@router.post("/analyze")
async def gateway_analyze(body: AnalyzeRequest, current_user: User = Depends(get_current_user)):
    try:
        result = await ai_gateway.analyze_document(body.document_text, body.analysis_type)
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI分析失败: {str(e)}")


@router.post("/report")
async def gateway_report(body: ReportRequest, current_user: User = Depends(get_current_user)):
    try:
        result = await ai_gateway.generate_report(body.report_type, body.data, body.template)
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"报告生成失败: {str(e)}")


# ─── Models ────────────────────────────────────────────────────────

@router.get("/models")
async def list_models(current_user: User = Depends(get_current_user)):
    return {"success": True, "data": AVAILABLE_MODELS}


@router.get("/models/by-category")
async def list_models_by_category(category: str | None = None, current_user: User = Depends(get_current_user)):
    if category:
        filtered = [m for m in AVAILABLE_MODELS if m["category"] == category]
        return {"success": True, "data": filtered, "category": category}
    categories = {}
    for m in AVAILABLE_MODELS:
        cat = m["category"]
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(m)
    return {"success": True, "data": categories}


@router.post("/test-model")
async def test_model(body: dict, current_user: User = Depends(get_current_user)):
    """Test if a specific model works with the current provider."""
    model = body.get("model")
    prompt = body.get("prompt", "你好，请简短回答确认连接正常。")
    if not model:
        raise HTTPException(status_code=400, detail="请提供model参数")
    try:
        result = await ai_gateway.provider.chat(
            [{"role": "user", "content": prompt}],
            model=model
        )
        return {"success": True, "model": model, "reply": result}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"模型测试失败: {str(e)}")


# ─── Config ────────────────────────────────────────────────────────

@router.put("/config")
async def gateway_config(
    body: UpdateConfigRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="仅超级管理员可修改AI配置")

    changes = []
    if body.provider and body.provider in PROVIDERS:
        await ai_gateway.switch_provider(body.provider)
        await _save_config(db, "ai_provider", body.provider)
        changes.append(f"provider={body.provider}")

    if body.api_key:
        ai_gateway.provider.api_key = body.api_key
        if ai_gateway.provider._client and not ai_gateway.provider._client.is_closed:
            await ai_gateway.provider._client.aclose()
            ai_gateway.provider._client = None
        await _save_config(db, "ai_api_key", body.api_key)
        changes.append("api_key=***")

    if body.api_base:
        ai_gateway.provider.base_url = body.api_base
        await _save_config(db, "ai_api_base", body.api_base)
        changes.append(f"api_base={body.api_base}")

    if body.model_chat:
        TASK_MODELS["chat"] = body.model_chat
        TASK_MODELS["reasoning"] = body.model_chat
        TASK_MODELS["code"] = body.model_chat
        TASK_MODELS["default"] = body.model_chat
        await _save_config(db, "ai_reasoning_model", body.model_chat)
        changes.append(f"model_chat={body.model_chat}")

    if body.model_vision:
        TASK_MODELS["ocr_vision"] = body.model_vision
        TASK_MODELS["ocr_extract"] = body.model_vision
        await _save_config(db, "ai_vision_model", body.model_vision)
        changes.append(f"model_vision={body.model_vision}")

    return {"success": True, "message": f"配置已更新: {', '.join(changes)}", "status": ai_gateway.get_status()}


async def _save_config(db: AsyncSession, key: str, value: str):
    from app.models.system.models import SystemConfigKV
    result = await db.execute(select(SystemConfigKV).where(SystemConfigKV.key == key))
    row = result.scalar_one_or_none()
    if row:
        row.value = value
    else:
        db.add(SystemConfigKV(key=key, value=value))
