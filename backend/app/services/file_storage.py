import io
import uuid
from datetime import datetime

from minio import Minio

from app.core.config import MINIO_ACCESS_KEY, MINIO_BUCKET, MINIO_ENDPOINT, MINIO_SECRET_KEY, MINIO_SECURE


class FileStorageService:
    def __init__(self):
        self.client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_SECURE,
        )
        self.bucket = MINIO_BUCKET

    def ensure_bucket(self):
        if not self.client.bucket_exists(self.bucket):
            self.client.make_bucket(self.bucket)

    async def upload_file(self, file_data: bytes, original_filename: str, folder: str = "uploads") -> dict:
        self.ensure_bucket()
        ext = original_filename.rsplit(".", 1)[-1] if "." in original_filename else ""
        date_prefix = datetime.now().strftime("%Y/%m/%d")
        file_id = str(uuid.uuid4())
        object_name = f"{folder}/{date_prefix}/{file_id}.{ext}" if ext else f"{folder}/{date_prefix}/{file_id}"
        content_type = self._guess_content_type(original_filename)
        self.client.put_object(
            self.bucket,
            object_name,
            io.BytesIO(file_data),
            length=len(file_data),
            content_type=content_type,
        )
        return {
            "file_id": file_id,
            "object_name": object_name,
            "original_filename": original_filename,
            "size": len(file_data),
            "content_type": content_type,
            "url": f"/api/v1/files/{object_name}",
        }

    async def get_file(self, object_name: str) -> tuple[bytes, str]:
        response = self.client.get_object(self.bucket, object_name)
        data = response.read()
        response.close()
        response.release_conn()
        return data, self._guess_content_type(object_name)

    async def delete_file(self, object_name: str):
        self.client.remove_object(self.bucket, object_name)

    async def list_files(self, folder: str = "uploads") -> list[dict]:
        self.ensure_bucket()
        objects = self.client.list_objects(self.bucket, prefix=folder + "/", recursive=True)
        result = []
        for obj in objects:
            result.append({
                "object_name": obj.object_name,
                "size": obj.size,
                "last_modified": obj.last_modified.isoformat() if obj.last_modified else None,
                "url": f"/api/v1/files/{obj.object_name}",
            })
        return result

    def _guess_content_type(self, filename: str) -> str:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        types = {
            "pdf": "application/pdf",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "png": "image/png",
            "gif": "image/gif",
            "doc": "application/msword",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "xls": "application/vnd.ms-excel",
            "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "ppt": "application/vnd.ms-powerpoint",
            "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "zip": "application/zip",
            "rar": "application/x-rar-compressed",
            "txt": "text/plain",
            "csv": "text/csv",
            "mp4": "video/mp4",
            "mp3": "audio/mpeg",
            "wav": "audio/wav",
            "webp": "image/webp",
            "svg": "image/svg+xml",
            "html": "text/html",
            "json": "application/json",
            "xml": "application/xml",
        }
        return types.get(ext, "application/octet-stream")


file_storage = FileStorageService()
