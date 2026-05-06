from fastapi import APIRouter
from .router import router
from .ai_router import router as ai_router

router.include_router(ai_router)
