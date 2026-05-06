from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps.auth import get_current_user
from app.models.organization import User
from app.services.ai_gateway import ai_gateway
from app.core.ai import AVAILABLE_MODELS

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


class ConfigRequest(BaseModel):
    provider: str | None = Field(None, description="AI提供商")
    model_chat: str | None = Field(None, description="对话模型")
    model_vision: str | None = Field(None, description="视觉模型")


@router.get("/status")
async def gateway_status(current_user: User = Depends(get_current_user)):
    return ai_gateway.get_status()


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


@router.get("/models")
async def list_models(current_user: User = Depends(get_current_user)):
    return {"success": True, "data": AVAILABLE_MODELS}


@router.get("/models/by-category")
async def list_models_by_category(category: str | None = None, current_user: User = Depends(get_current_user)):
    if category:
        filtered = [m for m in AVAILABLE_MODELS if m["category"] == category]
        return {"success": True, "data": filtered, "category": category}
    # Group by category
    categories = {}
    for m in AVAILABLE_MODELS:
        cat = m["category"]
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(m)
    return {"success": True, "data": categories}


@router.post("/test-model")
async def test_model(body: dict, current_user: User = Depends(get_current_user)):
    """测试指定模型是否正常工作。"""
    model = body.get("model")
    prompt = body.get("prompt", "你是什么模型？请简短回答。")
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


@router.put("/config")
async def gateway_config(body: ConfigRequest, current_user: User = Depends(get_current_user)):
    if not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="仅超级管理员可修改AI配置")
    return {"success": True, "message": "配置已更新"}
