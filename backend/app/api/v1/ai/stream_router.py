"""
AI流式输出API
支持打字机效果的流式响应，使用真实AI提供商
"""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.services.ai_gateway import ai_gateway

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI流式对话"])


class StreamChatRequest(BaseModel):
    message: str = Field(..., description="用户消息")
    model: str | None = Field(None, description="模型名称(可选)")
    history: list[dict] | None = Field(None, description="对话历史")


@router.post("/chat")
async def chat_stream(
    body: StreamChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI流式对话，返回SSE格式的流式响应"""
    messages = body.history or []
    messages.append({"role": "user", "content": body.message})

    async def generate():
        try:
            stream = ai_gateway.provider.stream_chat(
                messages,
                model=body.model,
            )
            async for content in stream:
                chunk = {"role": "assistant", "content": content, "done": False}
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            logger.error(f"Stream chat error: {e}")
            error_chunk = {
                "role": "assistant",
                "content": f"\n\n[错误] AI服务暂时不可用: {str(e)}",
                "done": True,
            }
            yield f"data: {json.dumps(error_chunk, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
