import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/group_platform")
DATABASE_URL_SYNC = os.getenv("DATABASE_URL_SYNC", "postgresql://postgres:postgres@localhost:5432/group_platform")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

SECRET_KEY = os.getenv("SECRET_KEY", "change-this-to-a-random-secret-key-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8
REFRESH_TOKEN_EXPIRE_DAYS = 7

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "group-platform")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "change-this-32-byte-key-for-encryption")
