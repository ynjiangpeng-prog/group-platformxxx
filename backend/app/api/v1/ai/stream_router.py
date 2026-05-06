"""
AI流式输出API
支持打字机效果的流式响应
"""
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
import json

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User

router = APIRouter(prefix="/ai", tags=["AI流式对话"])


@router.post("/chat")
async def chat_stream(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    AI流式对话
    返回SSE格式的流式响应
    """
    message = body.get("message", "")
    
    async def generate():
        """模拟流式输出（实际应调用AI API）"""
        import asyncio
        
        # 模拟AI思考过程
        response_text = f"收到您的问题：{message}\n\n这是AI的流式回复示例。在实际环境中，这里会调用真实的AI API，并以打字机效果逐字输出。\n\n系统状态：运行正常\n时间：{datetime.now().isoformat()}"
        
        words = response_text.split(" ")
        for i, word in enumerate(words):
            chunk = {
                "id": f"chat-{i}",
                "role": "assistant",
                "content": word + " ",
                "done": False
            }
            yield f"data: {json.dumps(chunk)}\n\n"
            await asyncio.sleep(0.05)  # 模拟打字机效果
        
        # 结束标记
        yield f"data: {json.dumps({'done': True})}\n\n"
    
    from datetime import datetime
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )
