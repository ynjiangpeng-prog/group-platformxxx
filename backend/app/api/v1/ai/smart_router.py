import json
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.models.petty_cash.models import PettyCashFund, PettyCashExpense
from app.models.business.models import WorkHourRecord
from app.services.ai_gateway import ai_gateway
from app.services.project_cost import ProjectCostService

router = APIRouter(prefix="/ai/smart", tags=["AI Smart Assistant"])


class ConfirmRequest(BaseModel):
    intent: str
    form_data: dict
    confirmed: bool = True
    latitude: float | None = None
    longitude: float | None = None


class LocationRequest(BaseModel):
    latitude: float
    longitude: float


INTENT_PROMPT = """你是企业办公助手。根据员工输入判断意图并提取关键信息。

员工输入：{text}

返回JSON：
{{"intent":"意图","confidence":0.95,"form_data":{{}},"suggestions":[]}}

支持意图：
- report_expense: 报销(form_data: amount,category,date,description,project_name)
- submit_invoice: 发票(form_data: invoice_no,amount,seller_name,invoice_type)
- request_advance: 备用金(form_data: amount,purpose,project_name)
- log_work_hours: 工时(form_data: hours,work_type,project_name,date)
- daily_report: 日报(form_data: content,weather,issues,project_name)
- upload_receipt: 收据(form_data: amount,merchant,category,date)

只返回JSON。"""


@router.post("/voice-to-form")
async def voice_to_form(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    content = await file.read()
    text = content.decode("utf-8", errors="replace") if len(content) < 10000 else ""
    if not text.strip():
        text = "[语音内容，请转为文字后提交]"
    try:
        result = await _parse_intent(text)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/image-to-form")
async def image_to_form(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    import base64
    content = await file.read()
    b64 = base64.b64encode(content).decode()
    try:
        ocr = await ai_gateway.recognize_invoice(b64)
        return {
            "intent": "submit_invoice",
            "document_type": "invoice",
            "confidence": 0.9,
            "form_data": ocr,
            "ocr_raw": ocr,
        }
    except Exception:
        try:
            ocr = await ai_gateway.recognize_receipt(b64)
            return {
                "intent": "upload_receipt",
                "document_type": "receipt",
                "confidence": 0.85,
                "form_data": ocr,
                "ocr_raw": ocr,
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@router.post("/process")
async def smart_process(
    text: str | None = None,
    file: UploadFile | None = File(None),
    current_user: User = Depends(get_current_user),
):
    if file:
        return await image_to_form(file, current_user)
    if text:
        return await _parse_intent(text)
    raise HTTPException(status_code=400, detail="请提供文本或图片")


@router.post("/confirm-and-submit")
async def confirm_and_submit(
    body: ConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not body.confirmed:
        return {"success": False, "message": "未确认"}
    intent = body.intent
    data = body.form_data
    result = {"success": True, "intent": intent, "auto_submitted": False, "next_steps": "请等待审核"}

    project_id = data.get("project_id")
    if body.latitude is not None and body.longitude is not None and not project_id:
        matches = await ProjectCostService.auto_match_project(
            latitude=body.latitude,
            longitude=body.longitude,
            db=db,
            company_id=current_user.company_id,
            limit=1,
        )
        if matches and matches[0].get("within_radius"):
            project_id = matches[0]["project_id"]

    if intent == "log_work_hours":
        if not project_id:
            raise HTTPException(status_code=400, detail="缺少project_id，请选择项目或提供定位信息")
        record = WorkHourRecord(
            company_id=current_user.company_id,
            created_by=current_user.id,
            project_id=project_id,
            employee_id=current_user.id,
            work_date=data.get("date", "2026-04-18"),
            hours=float(data.get("hours", 8)),
            work_type=data.get("work_type", "construction"),
            overtime_hours=0,
            status="submitted",
        )
        db.add(record)
        result["auto_submitted"] = True
        result["record_type"] = "work_hour"
        result["project_id"] = str(project_id)
    elif intent == "report_expense":
        if not project_id:
            raise HTTPException(status_code=400, detail="缺少project_id，请选择项目或提供定位信息")
        fund_id = data.get("fund_id")
        if not fund_id:
            fund = (await db.execute(
                select(PettyCashFund).where(
                    PettyCashFund.employee_id == current_user.id,
                    PettyCashFund.company_id == current_user.company_id,
                    PettyCashFund.status == "active",
                    PettyCashFund.is_deleted == False,
                    PettyCashFund.remaining_amount > 0,
                ).order_by(PettyCashFund.remaining_amount.desc()).limit(1)
            )).scalar_one_or_none()
            if not fund:
                raise HTTPException(status_code=400, detail="无可用备用金，请先申请备用金")
            fund_id = str(fund.id)
        expense = PettyCashExpense(
            company_id=current_user.company_id,
            created_by=current_user.id,
            fund_id=fund_id,
            project_id=project_id,
            expense_date=data.get("date", "2026-04-18"),
            category=data.get("category", "other"),
            amount=float(data.get("amount", 0)),
            description=data.get("description", ""),
            status="pending",
        )
        db.add(expense)
        result["auto_submitted"] = True
        result["record_type"] = "petty_cash_expense"
        result["project_id"] = str(project_id)
        result["fund_id"] = str(fund_id)
    await db.commit()
    return result


@router.get("/my-pending")
async def my_pending(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = current_user.id
    cid = current_user.company_id
    expenses = (await db.execute(
        select(func.count()).select_from(PettyCashExpense).where(
            PettyCashExpense.employee_id == uid if hasattr(PettyCashExpense, 'employee_id') else PettyCashExpense.created_by == uid,
            PettyCashExpense.company_id == cid,
            PettyCashExpense.status.in_(["pending", "rejected"]),
            PettyCashExpense.is_deleted == False,
        )
    )).scalar() or 0
    funds = (await db.execute(
        select(func.count()).select_from(PettyCashFund).where(
            PettyCashFund.employee_id == uid if hasattr(PettyCashFund, 'employee_id') else PettyCashFund.created_by == uid,
            PettyCashFund.company_id == cid,
            PettyCashFund.status == "active",
            PettyCashFund.is_deleted == False,
        )
    )).scalar() or 0
    return {"pending_expenses": expenses, "active_funds": funds}


async def _parse_intent(text: str) -> dict:
    prompt = INTENT_PROMPT.format(text=text)
    messages = [{"role": "user", "content": prompt}]
    result = await ai_gateway.provider.chat(messages)
    return ai_gateway._parse_json(result)
