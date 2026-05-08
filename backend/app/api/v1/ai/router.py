import base64
from datetime import date, timedelta, datetime

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.models.project.models import (
    Project, ProjectMilestone, ProjectLine, ConstructionLog, ServiceTicket,
    ProjectProcurementApproval, SafetyInspection,
)
from app.models.erp.models import Contract, PurchaseOrder
from app.services.ai_service import (
    analyze_cross_business,
    analyze_customer_churn,
    analyze_device_health,
    analyze_finance_health,
    analyze_procurement,
    analyze_project_risk,
    analyze_station_revenue,
    generate_daily_briefing,
    execute_ai_task,
)
from app.services.notification_service import send_notification
from app.services.project_cost import ProjectCostService

router = APIRouter(prefix="/ai", tags=["AI决策"])


@router.get("/insights")
async def ai_insights(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    briefing = await generate_daily_briefing(db, current_user.company_id, str(current_user.id))
    items = []
    if isinstance(briefing, dict):
        for k, v in briefing.items():
            items.append({"category": k, "content": str(v), "type": "info"})
    elif isinstance(briefing, list):
        items = briefing
    return {"items": items[:5]}


@router.get("/recommendations")
async def ai_recommendations(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    data = await analyze_cross_business(db, current_user.company_id)
    recs = []
    if isinstance(data, dict):
        for k, v in data.items():
            recs.append({"category": k, "content": str(v), "priority": "medium"})
    elif isinstance(data, list):
        recs = data
    return {"items": recs[:5]}


@router.get("/risk-alerts")
async def ai_risk_alerts(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.services.linkage import check_contract_expiry
    alerts = await check_contract_expiry(db)
    return {"items": alerts[:5]}


@router.get("/project-risk")
async def project_risk_analysis(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await analyze_project_risk(db, current_user.company_id)


@router.get("/station-revenue")
async def station_revenue_analysis(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await analyze_station_revenue(db, current_user.company_id)


@router.get("/finance-health")
async def finance_health_analysis(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await analyze_finance_health(db, current_user.company_id)


@router.get("/procurement")
async def procurement_analysis(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await analyze_procurement(db, current_user.company_id)


@router.get("/device-health")
async def device_health_analysis(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await analyze_device_health(db, current_user.company_id)


@router.get("/customer-churn")
async def customer_churn_analysis(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await analyze_customer_churn(db, current_user.company_id)


@router.get("/project-analysis/{project_id}")
async def project_360_analysis(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = (await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.company_id == current_user.company_id,
            Project.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    today = date.today()

    contracts = (await db.execute(
        select(Contract).where(
            Contract.project_id == project_id,
            Contract.company_id == current_user.company_id,
            Contract.is_deleted == False,
        )
    )).scalars().all()

    cost_summary = await ProjectCostService.get_cost_summary(project_id, db)
    cost_trend = await ProjectCostService.get_monthly_trend(project_id, db)

    cost_lines = (await db.execute(
        select(ProjectLine).where(
            ProjectLine.project_id == project_id,
            ProjectLine.is_deleted == False,
        ).order_by(ProjectLine.record_date.desc()).limit(20)
    )).scalars().all()

    purchase_orders = (await db.execute(
        select(PurchaseOrder).where(
            PurchaseOrder.project_id == project_id,
            PurchaseOrder.company_id == current_user.company_id,
            PurchaseOrder.is_deleted == False,
        )
    )).scalars().all()

    construction_logs = (await db.execute(
        select(ConstructionLog).where(
            ConstructionLog.project_id == project_id,
            ConstructionLog.is_deleted == False,
            ConstructionLog.log_date >= today - timedelta(days=30),
        ).order_by(ConstructionLog.log_date.desc()).limit(10)
    )).scalars().all()

    service_tickets = (await db.execute(
        select(ServiceTicket).where(
            ServiceTicket.project_id == project_id,
            ServiceTicket.company_id == current_user.company_id,
            ServiceTicket.is_deleted == False,
            ServiceTicket.status.in_(["pending", "in_progress"]),
        )
    )).scalars().all()

    milestones = (await db.execute(
        select(ProjectMilestone).where(
            ProjectMilestone.project_id == project_id,
            ProjectMilestone.is_deleted == False,
        ).order_by(ProjectMilestone.sort_order)
    )).scalars().all()

    safety_inspections = (await db.execute(
        select(SafetyInspection).where(
            SafetyInspection.project_id == project_id,
            SafetyInspection.is_deleted == False,
            SafetyInspection.overall_level.in_(["warning", "danger"]),
        )
    )).scalars().all()

    procurement_approvals = (await db.execute(
        select(ProjectProcurementApproval).where(
            ProjectProcurementApproval.project_id == project_id,
            ProjectProcurementApproval.is_deleted == False,
        )
    )).scalars().all()

    delay_days = 0
    if project.end_date and project.end_date < today and project.status not in ["completed", "closed"]:
        delay_days = (today - project.end_date).days

    overdue_milestones = [m for m in milestones if m.planned_date and m.planned_date < today and m.status != "completed"]
    safety_issues = [l for l in construction_logs if l.safety_status != "normal"]

    total_budget = float(project.total_budget or 0)
    actual_cost = float(project.actual_cost or 0)
    budget_rate = round(actual_cost / total_budget * 100, 1) if total_budget > 0 else 0

    total_contract_amount = sum(float(c.total_amount or 0) for c in contracts)
    total_paid = sum(float(c.paid_amount or 0) for c in contracts)

    risks = []
    if delay_days > 0:
        risks.append({"category": "schedule", "level": "high" if delay_days > 30 else "medium", "description": f"项目已逾期{delay_days}天"})
    if budget_rate > 100:
        risks.append({"category": "budget", "level": "high", "description": f"预算超支{budget_rate - 100:.1f}%"})
    elif budget_rate > 85:
        risks.append({"category": "budget", "level": "medium", "description": f"预算使用率{budget_rate:.1f}%，接近上限"})
    if overdue_milestones:
        risks.append({"category": "milestone", "level": "medium", "description": f"{len(overdue_milestones)}个里程碑逾期"})
    if safety_issues:
        risks.append({"category": "safety", "level": "high" if len(safety_issues) > 3 else "medium", "description": f"近期{len(safety_issues)}条施工日志记录安全问题"})
    if safety_inspections:
        risks.append({"category": "safety", "level": "high", "description": f"{len(safety_inspections)}条安全隐患未整改"})
    if service_tickets:
        risks.append({"category": "service", "level": "low", "description": f"{len(service_tickets)}个未关闭的服务工单"})

    recommendations = []
    if delay_days > 0:
        recommendations.append("评估剩余工作量，考虑增加资源或调整工期")
    if budget_rate > 90:
        recommendations.append("审核成本明细，控制非必要支出")
    if overdue_milestones:
        recommendations.append("复核逾期里程碑，制定追赶计划")
    if safety_inspections:
        recommendations.append("优先处理安全隐患整改，避免停工风险")
    pending_procurement = [p for p in procurement_approvals if p.status in ("draft", "pending")]
    if pending_procurement:
        recommendations.append(f"{len(pending_procurement)}个采购审批待处理，加快审批流程")

    return {
        "project": {
            "id": str(project.id),
            "project_code": project.project_code,
            "name": project.name,
            "project_type": project.project_type,
            "status": project.status,
            "priority": project.priority,
            "progress": project.progress,
            "start_date": project.start_date.isoformat() if project.start_date else None,
            "end_date": project.end_date.isoformat() if project.end_date else None,
            "actual_start_date": project.actual_start_date.isoformat() if project.actual_start_date else None,
            "actual_end_date": project.actual_end_date.isoformat() if project.actual_end_date else None,
            "delay_days": delay_days,
            "address": project.address,
        },
        "budget": {
            "total_budget": total_budget,
            "actual_cost": actual_cost,
            "budget_usage_rate": budget_rate,
            "by_type": cost_summary.get("by_type", {}),
            "monthly_trend": cost_trend,
        },
        "contracts": {
            "total": len(contracts),
            "total_amount": total_contract_amount,
            "total_paid": total_paid,
            "payment_rate": round(total_paid / total_contract_amount * 100, 1) if total_contract_amount > 0 else 0,
            "items": [{
                "id": str(c.id),
                "contract_no": c.contract_no,
                "name": c.name,
                "party_a": c.party_a,
                "party_b": c.party_b,
                "total_amount": float(c.total_amount or 0),
                "paid_amount": float(c.paid_amount or 0),
                "status": c.status,
                "end_date": c.end_date.isoformat() if c.end_date else None,
            } for c in contracts],
        },
        "procurement": {
            "orders": [{
                "id": str(po.id),
                "po_no": po.po_no,
                "title": po.title,
                "total_amount": float(po.total_amount or 0),
                "status": po.status,
                "delivery_date": po.delivery_date.isoformat() if po.delivery_date else None,
            } for po in purchase_orders],
            "pending_approvals": len(pending_procurement),
        },
        "construction_logs": {
            "recent_count": len(construction_logs),
            "items": [{
                "log_date": l.log_date.isoformat() if l.log_date else None,
                "work_content": l.work_content,
                "worker_count": l.worker_count,
                "safety_status": l.safety_status,
            } for l in construction_logs],
        },
        "service_tickets": {
            "open_count": len(service_tickets),
            "items": [{
                "id": str(t.id),
                "ticket_no": t.ticket_no,
                "title": t.title,
                "priority": t.priority,
                "status": t.status,
                "assigned_to": str(t.assigned_to) if t.assigned_to else None,
            } for t in service_tickets],
        },
        "milestones": {
            "total": len(milestones),
            "completed": sum(1 for m in milestones if m.status == "completed"),
            "overdue": len(overdue_milestones),
            "items": [{
                "name": m.name,
                "planned_date": m.planned_date.isoformat() if m.planned_date else None,
                "actual_date": m.actual_date.isoformat() if m.actual_date else None,
                "status": m.status,
            } for m in milestones],
        },
        "risks": risks,
        "recommendations": recommendations,
    }


@router.get("/cross-business")
async def cross_business_analysis(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await analyze_cross_business(db, current_user.company_id)


@router.get("/daily-briefing")
async def daily_briefing(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await generate_daily_briefing(db, current_user.company_id, str(current_user.id))


class AIActionRequest(BaseModel):
    task_type: str = Field(..., description="task type: create_alert|generate_report|summarize_module")
    params: dict | None = None


@router.post("/execute")
async def execute_task(body: AIActionRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await execute_ai_task(db, current_user.company_id, str(current_user.id), body.task_type, body.params or {})
    if result.get("notifications"):
        for n in result["notifications"]:
            await send_notification(db, current_user.company_id, n["user_id"], n["category"], n["title"], n.get("content"), n.get("link"), str(current_user.id))
    return result


# ─── Quick Entry (AI快速录入) ───

FORM_TYPES = {
    "petty_cash_expense": "备用金核销",
    "invoice": "发票录入",
    "receipt": "收据/小票",
    "payment_doc": "付款依据",
    "payment_doc_delivery": "送货单",
    "payment_doc_expense": "施工费用记录",
    "payment_doc_labor": "工时记录",
    "payment_doc_material": "材料清单",
    "construction_log": "施工日志",
}


@router.post("/quick-entry")
async def quick_entry_analyze(
    text: str = "",
    voice_transcript: str = "",
    file: UploadFile | None = File(None),
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    """AI快速录入 — 图片/文字/语音识别"""
    from app.services.ai_gateway import ai_gateway
    from app.services.context_builder import context_builder

    extracted = {}
    doc_type = "unknown"
    confidence = 0.0
    suggested_project_id = None
    suggested_project_name = None

    combined_text = f"{text} {voice_transcript}".strip()

    if file:
        content = await file.read()
        if len(content) > 20 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="文件过大")
        image_b64 = base64.b64encode(content).decode("utf-8")

        classify_prompt = (
            "请判断这张图片属于哪种文档类型，只返回以下之一：\n"
            "invoice(正式发票：增值税专票/普票/电子发票), "
            "receipt(收据/小票/停车票/出租车票), "
            "payment_doc(付款依据：含送货单、付款证明单), "
            "construction_cost_record(施工费用记录：手写记录的叉车/沙石料/井盖/人工等费用), "
            "work_hours_record(工时记录：大工/小工人数和工日汇总), "
            "delivery_note(送货单：有送货单号、品名、数量、金额), "
            "material_list(材料清单：电缆/电线型号规格+数量+价格), "
            "construction_log(施工日志：有日期/天气/施工内容/人数), "
            "petty_cash_doc(备用金核销单据/报销单), "
            "other(其他)\n"
            "返回JSON: {\"doc_type\": \"...\", \"confidence\": 0.9}"
        )
        try:
            classify_result = await ai_gateway.provider.vision(image_b64, classify_prompt)
            parsed = ai_gateway._parse_json(classify_result)
            doc_type = parsed.get("doc_type", "other")
            confidence = parsed.get("confidence", 0.5)
        except Exception:
            doc_type = "other"
            confidence = 0.3

        handlers = {
            "invoice": ai_gateway.recognize_invoice,
            "receipt": ai_gateway.recognize_receipt,
            "payment_doc": ai_gateway.recognize_payment_doc,
            "construction_log": ai_gateway.recognize_construction_log,
            "petty_cash_doc": ai_gateway.recognize_petty_cash_doc,
            "construction_cost_record": ai_gateway.recognize_payment_doc,
            "work_hours_record": ai_gateway.recognize_payment_doc,
            "delivery_note": ai_gateway.recognize_payment_doc,
            "material_list": ai_gateway.recognize_payment_doc,
        }
        handler = handlers.get(doc_type)
        if handler:
            try:
                extracted = await handler(image_b64)
            except Exception:
                extracted = {"raw_text": "识别失败"}

    if combined_text and not extracted:
        system_prompt = await context_builder.build_system_prompt(
            db, current_user.company_id, "autopilot",
            "你是经营数据录入助手。用户会用口语描述一笔费用或业务，请提取结构化数据。"
        )
        user_prompt = (
            f"用户说：\"{combined_text}\"\n\n"
            "请提取并返回JSON：\n"
            "{\n"
            "  \"form_type\": \"petty_cash_expense|invoice|receipt|payment_doc|construction_log|construction_cost_record|work_hours_record|delivery_note|material_list\",\n"
            "  \"confidence\": 0.9,\n"
            "  \"extracted_fields\": {\n"
            "    \"category\": \"费用分类\",\n"
            "    \"amount\": 金额数字,\n"
            "    \"description\": \"描述\",\n"
            "    \"counterparty\": \"对方名称\",\n"
            "    \"date\": \"YYYY-MM-DD\",\n"
            "    \"project_name\": \"项目名称\"\n"
            "  }\n"
            "}\n"
            "【重要】直接输出JSON，不要markdown标记。"
        )
        try:
            result = await ai_gateway.provider.chat([
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ])
            parsed = ai_gateway._parse_json(result)
            doc_type = parsed.get("form_type", "petty_cash_expense")
            confidence = parsed.get("confidence", 0.5)
            extracted = parsed.get("extracted_fields", {})
        except Exception:
            doc_type = "petty_cash_expense"
            extracted = {"description": combined_text}

    if extracted.get("project_name"):
        from app.models.project.models import Project
        proj_name = extracted["project_name"]
        proj = (await db.execute(
            select(Project).where(
                Project.company_id == current_user.company_id,
                Project.is_deleted == False,
                Project.name.ilike(f"%{proj_name}%"),
            ).limit(1)
        )).scalar_one_or_none()
        if proj:
            suggested_project_id = str(proj.id)
            suggested_project_name = proj.name

    # Determine form type and possible alternatives (image endpoint)
    form_type, possible_form_types = _resolve_form_type(doc_type, extracted)

    return {
        "document_type": doc_type,
        "form_type": form_type,
        "form_type_label": FORM_TYPES.get(form_type, doc_type),
        "confidence": confidence,
        "extracted_fields": extracted,
        "suggested_project_id": suggested_project_id,
        "suggested_project_name": suggested_project_name,
        "possible_form_types": possible_form_types,
    }


def _resolve_form_type(doc_type: str, extracted: dict) -> tuple:
    """Resolve form_type and possible_form_types from doc_type."""
    form_type = doc_type
    possible_form_types = []

    if doc_type == "invoice":
        form_type = "invoice"
        possible_form_types = [
            {"value": "invoice", "label": "发票录入", "recommended": True},
            {"value": "petty_cash_expense", "label": "备用金核销", "recommended": False},
        ]
    elif doc_type in ("receipt", "petty_cash_doc"):
        form_type = "petty_cash_expense"
        possible_form_types = [
            {"value": "petty_cash_expense", "label": "备用金核销", "recommended": True},
        ]
    elif doc_type in ("payment_doc", "construction_cost_record", "work_hours_record", "delivery_note", "material_list"):
        form_type = "petty_cash_expense"
        possible_form_types = [
            {"value": "petty_cash_expense", "label": "备用金核销", "recommended": True},
            {"value": "payment_doc", "label": "付款依据存档", "recommended": False},
        ]
        if doc_type in ("construction_cost_record", "work_hours_record", "delivery_note", "material_list"):
            extracted["doc_engineer_type"] = doc_type

    return form_type, possible_form_types


class QuickEntrySubmitBody(BaseModel):
    form_type: str
    form_data: dict
    project_id: str | None = None


class QuickEntryTextBody(BaseModel):
    text: str = ""


@router.post("/quick-entry/text")
async def quick_entry_analyze_text(
    body: QuickEntryTextBody,
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    """AI快速录入 — 纯文字/语音识别"""
    from app.services.ai_gateway import ai_gateway
    from app.services.context_builder import context_builder

    combined_text = body.text.strip()
    if not combined_text:
        raise HTTPException(status_code=400, detail="请输入内容")

    doc_type = "petty_cash_expense"
    confidence = 0.5
    extracted: dict = {}
    suggested_project_id = None
    suggested_project_name = None

    system_prompt = await context_builder.build_system_prompt(
        db, current_user.company_id, "autopilot",
        "你是经营数据录入助手。用户会用口语描述一笔费用或业务，请提取结构化数据。"
    )
    user_prompt = (
        f"用户说：\"{combined_text}\"\n\n"
        "请提取并返回JSON：\n"
        "{\n"
        "  \"form_type\": \"petty_cash_expense|invoice|receipt|payment_doc|construction_log\",\n"
        "  \"confidence\": 0.9,\n"
        "  \"extracted_fields\": {\n"
        "    \"category\": \"费用分类\",\n"
        "    \"amount\": 金额数字,\n"
        "    \"description\": \"描述\",\n"
        "    \"counterparty\": \"对方名称\",\n"
        "    \"date\": \"YYYY-MM-DD\",\n"
        "    \"project_name\": \"项目名称\"\n"
        "  }\n"
        "}\n"
        "【重要】直接输出JSON，不要markdown标记。"
    )
    try:
        result = await ai_gateway.provider.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ])
        parsed = ai_gateway._parse_json(result)
        doc_type = parsed.get("form_type", "petty_cash_expense")
        confidence = parsed.get("confidence", 0.5)
        extracted = parsed.get("extracted_fields", {})
    except Exception:
        extracted = {"description": combined_text}

    if extracted.get("project_name"):
        from app.models.project.models import Project
        proj_name = extracted["project_name"]
        proj = (await db.execute(
            select(Project).where(
                Project.company_id == current_user.company_id,
                Project.is_deleted == False,
                Project.name.ilike(f"%{proj_name}%"),
            ).limit(1)
        )).scalar_one_or_none()
        if proj:
            suggested_project_id = str(proj.id)
            suggested_project_name = proj.name

    # Determine form type and possible alternatives (text endpoint)
    form_type, possible_form_types = _resolve_form_type(doc_type, extracted)

    return {
        "document_type": doc_type,
        "form_type": form_type,
        "form_type_label": FORM_TYPES.get(form_type, doc_type),
        "confidence": confidence,
        "extracted_fields": extracted,
        "suggested_project_id": suggested_project_id,
        "suggested_project_name": suggested_project_name,
        "possible_form_types": possible_form_types,
    }


@router.post("/quick-entry/submit")
async def quick_entry_submit(
    body: QuickEntrySubmitBody,
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    """AI快速录入 — 确认提交"""
    from app.models.petty_cash.models import PettyCashExpense, PettyCashPool

    if body.form_type == "petty_cash_expense":
        pool = await _get_or_create_pool_quick(db, current_user)
        fd = body.form_data
        raw_date = fd.get("date") or fd.get("expense_date") or datetime.now().date().isoformat()
        if isinstance(raw_date, str):
            raw_date = datetime.strptime(raw_date, "%Y-%m-%d").date()
        expense = PettyCashExpense(
            pool_id=str(pool.id),
            project_id=body.project_id or fd.get("project_id") or None,
            expense_date=raw_date,
            category=fd.get("category", "other"),
            amount=float(fd.get("amount", 0)),
            description=fd.get("description", ""),
            status="pending",
            company_id=current_user.company_id,
            created_by=current_user.id,
        )
        db.add(expense)
        await db.flush()
        await db.refresh(expense)
        return {"success": True, "id": str(expense.id), "form_type": "petty_cash_expense"}

    if body.form_type == "invoice":
        from app.models.finance.models import Invoice
        fd = body.form_data
        raw_date = fd.get("date") or fd.get("invoice_date") or datetime.now().date().isoformat()
        if isinstance(raw_date, str):
            raw_date = datetime.strptime(raw_date, "%Y-%m-%d").date()
        invoice = Invoice(
            company_id=current_user.company_id,
            project_id=body.project_id or fd.get("project_id") or None,
            invoice_type=fd.get("invoice_type", "增值税普通发票"),
            direction="in",
            invoice_code=fd.get("invoice_code"),
            invoice_no=fd.get("invoice_no"),
            issue_date=raw_date,
            seller_name=fd.get("seller_name"),
            buyer_name=fd.get("buyer_name"),
            amount_before_tax=float(fd.get("amount_without_tax") or fd.get("amount_before_tax", 0)),
            tax_rate=float(fd.get("tax_rate", 0)),
            tax_amount=float(fd.get("tax_amount", 0)),
            total_amount=float(fd.get("total_amount") or fd.get("amount", 0)),
            check_status="unchecked",
            created_by=current_user.id,
        )
        db.add(invoice)
        await db.flush()
        await db.refresh(invoice)
        return {"success": True, "id": str(invoice.id), "form_type": "invoice"}

    if body.form_type == "payment_doc":
        # Store as petty cash expense with engineer doc metadata
        pool = await _get_or_create_pool_quick(db, current_user)
        fd = body.form_data
        raw_date = fd.get("date") or datetime.now().date().isoformat()
        if isinstance(raw_date, str):
            raw_date = datetime.strptime(raw_date, "%Y-%m-%d").date()
        expense = PettyCashExpense(
            pool_id=str(pool.id),
            project_id=body.project_id or fd.get("project_id") or None,
            expense_date=raw_date,
            category=fd.get("doc_subtype", "other"),
            amount=float(fd.get("total_amount") or fd.get("amount", 0)),
            description=fd.get("description", ""),
            status="pending",
            company_id=current_user.company_id,
            created_by=current_user.id,
        )
        db.add(expense)
        await db.flush()
        await db.refresh(expense)
        return {"success": True, "id": str(expense.id), "form_type": "payment_doc"}

    return {"success": False, "error": f"不支持的表单类型: {body.form_type}"}


async def _get_or_create_pool_quick(db, user):
    from app.models.petty_cash.models import PettyCashPool
    result = await db.execute(
        select(PettyCashPool).where(
            PettyCashPool.company_id == user.company_id,
            PettyCashPool.employee_id == user.id,
            PettyCashPool.is_deleted == False,
        )
    )
    pool = result.scalar_one_or_none()
    if pool:
        return pool
    pool = PettyCashPool(
        company_id=user.company_id,
        employee_id=user.id,
        total_received=0, total_used=0, balance=0,
        status="active",
    )
    db.add(pool)
    await db.flush()
    await db.refresh(pool)
    return pool
