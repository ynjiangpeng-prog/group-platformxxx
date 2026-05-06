from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.core.security import decode_token
from app.models.organization import User
from app.services.file_storage import file_storage
import io

router = APIRouter(prefix="/files", tags=["文件管理"])


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    folder: str = Query("uploads"),
    current_user: User = Depends(get_current_user),
):
    data = await file.read()
    if len(data) > 100 * 1024 * 1024:
        raise HTTPException(400, "文件不能超过100MB")
    result = await file_storage.upload_file(data, file.filename or "unnamed", folder)
    return result


@router.post("/upload-batch")
async def upload_batch(
    files: list[UploadFile] = File(...),
    folder: str = Query("uploads"),
    current_user: User = Depends(get_current_user),
):
    if len(files) > 20:
        raise HTTPException(400, "最多20个文件")
    results = []
    for f in files:
        data = await f.read()
        result = await file_storage.upload_file(data, f.filename or "unnamed", folder)
        results.append(result)
    return results


@router.get("/{object_name:path}")
async def get_file(
    object_name: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    auth_header = request.headers.get("authorization", "")
    token_param = request.query_params.get("token")
    token_str = None

    if auth_header.startswith("Bearer "):
        token_str = auth_header[7:]
    elif token_param:
        token_str = token_param

    if not token_str:
        raise HTTPException(status_code=401, detail="未认证")

    payload = decode_token(token_str)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="无效凭证")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="无效凭证")

    result = await db.execute(select(User).where(User.id == user_id, User.is_deleted == False))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    if user.status != 1:
        raise HTTPException(status_code=403, detail="账号已禁用")

    data, content_type = await file_storage.get_file(object_name)
    return StreamingResponse(io.BytesIO(data), media_type=content_type)


@router.delete("/{object_name:path}")
async def delete_file(object_name: str, current_user: User = Depends(get_current_user)):
    await file_storage.delete_file(object_name)
    return {"success": True}
