from contextlib import asynccontextmanager
import logging
import os
import traceback
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import CORS_ORIGINS
from app.api.v1.auth.router import router as auth_router
from app.api.v1.organization.router import router as org_router
from app.api.v1.project.router import router as project_router
from app.api.v1.project.dashboard_router import router as project_dashboard_router
from app.api.v1.project.location_router import router as project_location_router
from app.api.v1.charging.router import router as charging_router
from app.api.v1.charging.roi_router import router as charging_roi_router
from app.api.v1.finance.router import router as finance_router
from app.api.v1.erp.router import router as erp_router
from app.api.v1.workflow.router import router as workflow_router
from app.api.v1.workflow.engine_router import router as workflow_engine_router
from app.api.v1.system.router import router as system_router
from app.api.v1.ai.router import router as ai_router
from app.api.v1.ai.ocr_router import router as ai_ocr_router
from app.api.v1.ai.gateway_router import router as ai_gateway_router
from app.api.v1.ai.smart_router import router as ai_smart_router
from app.api.v1.business.router import router as business_router
from app.api.v1.petty_cash.router import router as petty_cash_router
from app.api.v1.travel.router import router as travel_router
from app.api.v1.common.batch_router import router as batch_router
from app.api.v1.files.router import router as files_router
from app.api.v1.finance.bank_router import router as bank_router
from app.api.v1.finance.personal_router import router as personal_router
from app.api.v1.system.workflow_router import router as workflow_def_router
from app.api.v1.crm.router import router as crm_router
from app.api.v1.erp.entity_router import router as entity_router
from app.api.v1.audit.router import router as audit_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.autopilot.router import router as autopilot_router
from app.api.v1.alerts.router import router as alerts_router
from app.api.v1.webhook_router import router as webhook_router
from app.api.v1.intelligence.router import router as intelligence_router
# # from app.api.v1.agent.router import router as agent_router
from app.api.v1.code_security.router import router as code_security_router
from app.middleware.operation_log import OperationLogMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.replay_protection import ReplayProtectionMiddleware
from app.middleware.sensitive_operation import SensitiveOperationMiddleware
from app.middleware.export_audit import ExportAuditMiddleware
from app.core.structured_logging import setup_structured_logging
from app.services.sentry_integration import init_sentry
from app.api.v1.predictions.router import router as predictions_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 集团综合管理平台启动中...")
    from app.services.scheduler import scheduler
    await scheduler.start()
    yield
    scheduler.stop()
    print("👋 系统关闭")


app = FastAPI(
    title="集团综合管理平台",
    description="OA + ERP + 财务 一体化管理平台 | 电力工程 · 充电站运营 · 税务服务",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(OperationLogMiddleware)

logger = logging.getLogger("app")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_id = uuid.uuid4().hex[:8]
    logger.error(
        "[UnhandledException] %s %s error_id=%s",
        request.method, request.url.path, error_id,
        exc_info=exc,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": f"内部错误 (ref: {error_id})", "error_id": error_id},
    )


app.include_router(auth_router, prefix="/api/v1")
app.include_router(org_router, prefix="/api/v1")
app.include_router(project_router, prefix="/api/v1")
app.include_router(project_dashboard_router, prefix="/api/v1")
app.include_router(project_location_router, prefix="/api/v1")
app.include_router(charging_router, prefix="/api/v1")
app.include_router(charging_roi_router, prefix="/api/v1")
app.include_router(finance_router, prefix="/api/v1")
app.include_router(erp_router, prefix="/api/v1")
app.include_router(workflow_router, prefix="/api/v1")
app.include_router(workflow_engine_router, prefix="/api/v1")
app.include_router(system_router, prefix="/api/v1")
app.include_router(ai_router, prefix="/api/v1")
app.include_router(ai_ocr_router, prefix="/api/v1")
app.include_router(ai_gateway_router, prefix="/api/v1")
app.include_router(ai_smart_router, prefix="/api/v1")
app.include_router(business_router, prefix="/api/v1")
app.include_router(petty_cash_router, prefix="/api/v1")
app.include_router(travel_router, prefix="/api/v1")
app.include_router(batch_router, prefix="/api/v1")
app.include_router(files_router, prefix="/api/v1")
app.include_router(bank_router, prefix="/api/v1")
app.include_router(personal_router, prefix="/api/v1")
app.include_router(workflow_def_router, prefix="/api/v1")
app.include_router(crm_router, prefix="/api/v1")
app.include_router(entity_router, prefix="/api/v1")
app.include_router(audit_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")
app.include_router(autopilot_router, prefix="/api/v1")
app.include_router(intelligence_router, prefix="/api/v1")
app.include_router(alerts_router, prefix="/api/v1")
app.include_router(webhook_router, prefix="/api/v1")
app.include_router(predictions_router, prefix="/api/v1")
# app.include_router(agent_router, prefix="/api/v1")
# 代码安全扫描（已禁用）
# app.include_router(code_security_router, prefix="/api/v1")


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}
