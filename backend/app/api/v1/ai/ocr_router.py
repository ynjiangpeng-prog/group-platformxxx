import base64
import logging
from datetime import date, datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.models.erp.models import Contract
from app.models.project.models import Project, CompanyEntity, ConstructionLog, ProjectLine
from app.models.finance.models import Invoice
from app.models.petty_cash.models import PettyCashExpense, PettyCashPool
from app.services.ai_gateway import ai_gateway

router = APIRouter(prefix="/ai/ocr", tags=["AI-OCR识别"])
logger = logging.getLogger(__name__)


async def match_entity_from_ocr(ocr_data: dict, company_id: str, db: AsyncSession) -> dict:
    """Match party_a/party_b against company entities to identify which one is ours."""
    entities = (await db.execute(
        select(CompanyEntity).where(
            CompanyEntity.company_id == company_id,
            CompanyEntity.is_deleted == False,
        )
    )).scalars().all()

    if not entities:
        return {}

    party_a = (ocr_data.get("party_a") or "").strip()
    party_b = (ocr_data.get("party_b") or "").strip()
    party_c = (ocr_data.get("party_c") or "").strip()
    all_parties = [p for p in [party_a, party_b, party_c] if p]

    matched_entity_id = None
    matched_entity_name = None
    is_party_a = False
    is_party_b = False

    for entity in entities:
        name = entity.entity_name
        # Fuzzy match: check if entity name keywords appear in party name
        entity_keywords = name.replace("有限公司", "").replace("股份公司", "").replace("有限责任公司", "").strip()
        for party in all_parties:
            if not party:
                continue
            # Direct containment
            if name in party or party in name:
                matched_entity_id = str(entity.id)
                matched_entity_name = name
                if party == party_a:
                    is_party_a = True
                elif party == party_b:
                    is_party_b = True
                break
            # Keyword match (at least 3 chars overlap)
            if len(entity_keywords) >= 3 and entity_keywords in party:
                matched_entity_id = str(entity.id)
                matched_entity_name = name
                if party == party_a:
                    is_party_a = True
                elif party == party_b:
                    is_party_b = True
                break
        if matched_entity_id:
            break

    result = {"suggested_entity_id": matched_entity_id, "suggested_entity_name": matched_entity_name}

    if matched_entity_id:
        if is_party_a:
            result["direction"] = "out"
            result["counterparty"] = party_b
        elif is_party_b:
            result["direction"] = "in"
            result["counterparty"] = party_a

    return result


async def file_to_base64(file: UploadFile) -> str:
    content = await file.read()
    if len(content) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="文件大小不能超过100MB")
    return base64.b64encode(content).decode("utf-8")


class SmartFillRequest(BaseModel):
    form_type: str = Field(..., description="表单类型: contract|invoice|receipt")
    extracted_data: dict = Field(..., description="OCR识别数据")
    existing_data: dict | None = Field(None, description="已有表单数据")


class BatchRequest(BaseModel):
    process_type: str = Field(..., description="处理类型: invoice|contract|receipt")


@router.post("/contract")
async def ocr_contract(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    image_b64 = await file_to_base64(file)
    result = await ai_gateway.recognize_contract(image_b64)
    entity_match = await match_entity_from_ocr(result, str(current_user.company_id), db)
    result.update(entity_match)
    return {"success": True, "data": result}


@router.post("/invoice")
async def ocr_invoice(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    image_b64 = await file_to_base64(file)
    result = await ai_gateway.recognize_invoice(image_b64)
    return {"success": True, "data": result}


@router.post("/receipt")
async def ocr_receipt(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    image_b64 = await file_to_base64(file)
    result = await ai_gateway.recognize_receipt(image_b64)
    return {"success": True, "data": result}


@router.post("/batch")
async def ocr_batch(
    files: list[UploadFile] = File(...),
    process_type: str = "invoice",
    current_user: User = Depends(get_current_user),
):
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="单次最多处理20张图片")
    images = [await file_to_base64(f) for f in files]
    results = await ai_gateway.batch_process(images, process_type)
    return {"success": True, "data": results}


@router.post("/smart-fill")
async def smart_fill(
    body: SmartFillRequest,
    current_user: User = Depends(get_current_user),
):
    result = await ai_gateway.smart_fill(body.form_type, body.extracted_data, body.existing_data)
    return {"success": True, "data": result}


@router.post("/contract-auto-save")
async def ocr_contract_auto_save(
    file: UploadFile = File(...),
    contract_type: str = "auto",
    project_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    image_b64 = await file_to_base64(file)
    ocr_data = await ai_gateway.recognize_contract(image_b64)
    if ocr_data.get("parse_error"):
        raise HTTPException(status_code=422, detail="OCR识别结果解析失败")

    entity_match = await match_entity_from_ocr(ocr_data, str(current_user.company_id), db)
    ocr_data.update(entity_match)

    if contract_type == "auto":
        try:
            classify_prompt = (
                "根据以下合同信息，判断合同类型。"
                "类型选项及判定规则：\n"
                "1. land_lease - 租地合同：涉及土地租赁、场地租赁、租金\n"
                "2. hv_construction - 高压工程施工：涉及高压线路、外线工程、10kV、35kV、架空线、外电接入\n"
                "3. lv_construction - 低压工程施工：涉及低压配电、内线工程、0.4kV、低压柜、低压安装\n"
                "4. civil_construction - 土建施工合同：涉及土建、基础施工、场地平整、浇筑、混凝土、不含高压或低压关键词的普通施工\n"
                "5. ancillary_construction - 附属设施施工：涉及雨棚、监控、消防、照明、围墙、硬化、绿化、附属工程\n"
                "6. epc - EPC总承包：合同名含EPC或总承包\n"
                "7. transformer_purchase - 变压器采购：涉及变压器、箱变、厢变、配电变压器\n"
                "8. cable_purchase - 电缆采购：涉及电缆、线缆、电线\n"
                "9. charging_pile_purchase - 充电桩采购：涉及充电桩、充电机、充电设备、充电终端、整流柜\n"
                "10. electrical_material_purchase - 电气材料采购：涉及开关柜、配电柜、桥架、母线、电气材料\n"
                "11. equipment_sale - 设备销售合同：销售充电桩或变压器等设备（非采购）\n"
                "12. service - 服务合同：涉及设计、监理、咨询、检测、勘察、运维\n"
                "13. cooperation - 合作协议：涉及合作、合资、分成、共建\n"
                "14. supplement - 补充协议：补充、变更、追加\n"
                "15. other - 其他\n"
                "判定优先级：先看是否租地→是否EPC/总包→是否高压/低压/附属施工→是否土建施工→采购具体类型→其他\n"
                "注意：高压施工合同必须归为hv_construction而非civil_construction\n\n"
                f"合同信息：名称={ocr_data.get('contract_name', '')} 甲方={ocr_data.get('party_a', '')} 乙方={ocr_data.get('party_b', '')} "
                f"金额={ocr_data.get('amount', '')} 付款条款={ocr_data.get('payment_terms', '')}\n"
                '返回JSON：{"contract_type":"类型代码","confidence":0.9,"reason":"判断理由"}'
                "只返回JSON。"
            )
            classify_result = await ai_gateway.provider.chat([{"role": "user", "content": classify_prompt}])
            classify_data = ai_gateway._parse_json(classify_result)
            contract_type = classify_data.get("contract_type", "other")
        except Exception:
            contract_type = "other"

    contract = Contract(
        company_id=current_user.company_id,
        created_by=str(current_user.id),
        contract_no=ocr_data.get("contract_no") or "",
        name=ocr_data.get("contract_name") or "",
        contract_type=contract_type,
        party_a=ocr_data.get("party_a"),
        party_b=ocr_data.get("party_b"),
        signing_date=ocr_data.get("sign_date"),
        start_date=ocr_data.get("start_date"),
        end_date=ocr_data.get("end_date"),
        total_amount=ocr_data.get("amount"),
        project_id=project_id,
        entity_id=ocr_data.get("suggested_entity_id"),
        direction=ocr_data.get("direction"),
        counterparty=ocr_data.get("counterparty"),
        payment_terms={"terms": ocr_data.get("payment_terms")} if ocr_data.get("payment_terms") else None,
        key_clauses={"clauses": ocr_data.get("key_clauses")} if ocr_data.get("key_clauses") else None,
        status="draft",
    )

    try:
        from app.services.file_storage import file_storage
        file_content = await file.read()
        result = await file_storage.upload_file(
            file_content, file.filename or "contract.jpg", folder="contracts"
        )
        contract.attachments = [{
            "file_id": result.get("file_id", ""),
            "object_name": result.get("object_name", ""),
            "original_filename": file.filename or "contract.jpg",
            "size": len(file_content),
            "content_type": file.content_type or "image/jpeg",
            "url": result.get("url", ""),
        }]
    except Exception:
        pass

    db.add(contract)
    await db.flush()
    return {
        "success": True,
        "data": ocr_data,
        "record_id": str(contract.id),
        "message": "合同已创建为草稿，请核对后提交",
    }


@router.post("/invoice-auto-save")
async def ocr_invoice_auto_save(
    file: UploadFile = File(...),
    direction: str = "in",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    image_b64 = await file_to_base64(file)
    ocr_data = await ai_gateway.recognize_invoice(image_b64)
    if ocr_data.get("parse_error"):
        raise HTTPException(status_code=422, detail="OCR识别结果解析失败")

    invoice = Invoice(
        company_id=current_user.company_id,
        created_by=str(current_user.id),
        invoice_type=ocr_data.get("invoice_type") or "增值税发票",
        direction=direction,
        invoice_code=ocr_data.get("invoice_code"),
        invoice_no=ocr_data.get("invoice_no"),
        issue_date=ocr_data.get("invoice_date"),
        seller_name=ocr_data.get("seller_name"),
        buyer_name=ocr_data.get("buyer_name"),
        amount_before_tax=ocr_data.get("amount_without_tax"),
        tax_rate=ocr_data.get("tax_rate"),
        tax_amount=ocr_data.get("tax_amount"),
        total_amount=ocr_data.get("total_amount"),
        items=ocr_data.get("items"),
        check_status="unchecked",
    )
    db.add(invoice)
    await db.flush()
    return {
        "success": True,
        "data": ocr_data,
        "record_id": str(invoice.id),
        "message": "发票已创建，请核对后确认",
    }


@router.post("/smart-classify")
async def ocr_smart_classify(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    image_b64 = await file_to_base64(file)

    classify_prompt = (
        "你是一个企业财务单据分类专家。请仔细观察这张图片，判断它属于以下哪一类文档。\n\n"
        "文档类型定义：\n"
        "1. contract — 正式合同/协议书：有「合同编号」「甲方/乙方」「签章」等正式合同要素\n"
        "2. invoice — 税务发票：有「发票代码」「发票号码」「税率」「税额」「价税合计」，包括增值税专用发票、增值税普通发票、电子发票、机动车发票等\n"
        "   注意：电子发票PDF通常只有半页或一页，有明确的购买方/销售方信息栏和税额明细\n"
        "3. receipt — 日常消费小票：餐饮/交通/购物等非正式消费凭证，无税额明细，通常是热敏纸打印的小票\n"
        "4. payment_doc — 工程付款依据：送货单、付款证明单、开支明细、人工工时记录、材料清单等工程相关凭据\n"
        "5. construction_log — 施工日志/施工记录表：有日期+天气+工作内容+施工人数等结构化字段，通常是表格形式\n"
        "6. petty_cash_settlement — 备用金核销单/报销单：有报销人、费用明细、金额汇总、部门审批等报销流程要素\n"
        "   注意：报销单通常有「报销单」「费用报销」「借款单」等标题，且有审批签字栏\n\n"
        "判定优先级（从高到低）：\n"
        "  有天气+施工人数字段 → construction_log\n"
        "  有报销人+部门+费用明细表+审批栏 → petty_cash_settlement\n"
        "  有合同编号+甲乙方+签章 → contract\n"
        "  有发票代码/号码+税率+税额+价税合计 → invoice\n"
        "  有送货/材料/人工等工程要素+无发票税额 → payment_doc\n"
        "  非正式消费凭证、无税额明细 → receipt\n\n"
        "常见误判注意：\n"
        "- 电子发票（invoice）不要误判为receipt，电子发票有完整的购买方/销售方信息\n"
        "- 报销单不要误判为invoice，报销单没有发票代码/号码\n"
        "- 有表格结构的付款凭据优先判断为payment_doc而非receipt\n\n"
        "只返回JSON，不要任何解释：\n"
        '{"document_type":"类型","confidence":0.95,"reason":"判定理由(一句话)"}'
    )
    classify_result = await ai_gateway.provider.vision(image_b64, classify_prompt)
    logger.info(f"[smart-classify] raw classify: {classify_result[:500]}")
    classify_data = ai_gateway._parse_json(classify_result)

    doc_type = classify_data.get("document_type", "invoice")
    confidence = classify_data.get("confidence", 0.5)

    handlers = {
        "contract": ai_gateway.recognize_contract,
        "invoice": ai_gateway.recognize_invoice,
        "receipt": ai_gateway.recognize_receipt,
        "report": ai_gateway.recognize_construction_log,
        "payment_doc": ai_gateway.recognize_payment_doc,
        "construction_log": ai_gateway.recognize_construction_log,
        "petty_cash_settlement": ai_gateway.recognize_petty_cash_doc,
    }
    handler = handlers.get(doc_type, ai_gateway.recognize_invoice)
    ocr_data = await handler(image_b64)
    logger.info(f"[smart-classify] doc_type={doc_type} ocr_data={ocr_data}")

    # Auto-match entity for contracts
    entity_match = {}
    if doc_type == "contract":
        entity_match = await match_entity_from_ocr(ocr_data, str(current_user.company_id), db)
        ocr_data.update(entity_match)

    if doc_type == "invoice" and "direction" not in ocr_data:
        buyer = (ocr_data.get("buyer_name") or "").strip()
        seller = (ocr_data.get("seller_name") or "").strip()
        our_keywords = ["雅诗达", "永充", "云南雅诗达", "云南永充"]
        buyer_is_us = any(kw in buyer for kw in our_keywords)
        seller_is_us = any(kw in seller for kw in our_keywords)
        if seller_is_us and not buyer_is_us:
            ocr_data["direction"] = "out"
        else:
            ocr_data["direction"] = "in"

        amt = ocr_data.get("total_amount")
        pretax = ocr_data.get("amount_without_tax")
        tax = ocr_data.get("tax_amount")
        if amt and pretax and tax:
            try:
                diff = abs(float(amt) - (float(pretax) + float(tax)))
                if diff > 1:
                    logger.warning(f"[smart-classify] invoice amount mismatch: total={amt} pretax={pretax} tax={tax}")
            except (ValueError, TypeError):
                pass
        if isinstance(ocr_data.get("tax_rate"), str):
            tr = ocr_data["tax_rate"].replace("%", "").strip()
            try:
                ocr_data["tax_rate"] = float(tr) / 100 if float(tr) > 1 else float(tr)
            except (ValueError, TypeError):
                pass

    suggested_project_id = None
    suggested_project_name = None
    matched_by = None

    party_names = []
    for field in ("party_a", "party_b", "seller_name", "buyer_name", "merchant_name",
                   "counterparty", "receiver", "project_location"):
        val = ocr_data.get(field)
        if val and isinstance(val, str):
            party_names.append(val.strip())

    if party_names:
        company_id = current_user.company_id
        name_filters = []
        for name in party_names:
            name_filters.append(Project.name.ilike(f"%{name}%"))
            name_filters.append(Contract.name.ilike(f"%{name}%"))
            name_filters.append(Contract.party_a.ilike(f"%{name}%"))
            name_filters.append(Contract.party_b.ilike(f"%{name}%"))

        matching_contracts = (await db.execute(
            select(Contract).where(
                Contract.company_id == company_id,
                Contract.is_deleted == False,
                or_(*[Contract.party_a.ilike(f"%{n}%") for n in party_names]
                    + [Contract.party_b.ilike(f"%{n}%") for n in party_names]
                    + [Contract.name.ilike(f"%{n}%") for n in party_names]),
            ).limit(5)
        )).scalars().all()

        if matching_contracts:
            best_match = matching_contracts[0]
            if best_match.project_id:
                suggested_project_id = str(best_match.project_id)
                proj = (await db.execute(
                    select(Project.name).where(Project.id == best_match.project_id)
                )).scalar_one_or_none()
                suggested_project_name = proj
                matched_by = "contract_party"

        if not suggested_project_id:
            matching_projects = (await db.execute(
                select(Project).where(
                    Project.company_id == company_id,
                    Project.is_deleted == False,
                    or_(*[Project.name.ilike(f"%{n}%") for n in party_names]
                        + [Project.address.ilike(f"%{n}%") for n in party_names]),
                ).limit(5)
            )).scalars().all()
            if matching_projects:
                suggested_project_id = str(matching_projects[0].id)
                suggested_project_name = matching_projects[0].name
                matched_by = "project_name"

    form_type_map = {
        "contract": "contract",
        "invoice": "invoice",
        "receipt": "petty_cash_expense",
        "report": "construction_log",
        "payment_doc": "payment_doc",
        "construction_log": "construction_log",
        "petty_cash_settlement": "petty_cash_expense",
    }

    return {
        "success": True,
        "document_type": doc_type,
        "classify_confidence": confidence,
        "ocr_data": ocr_data,
        "suggested_project_id": suggested_project_id,
        "suggested_project_name": suggested_project_name,
        "matched_by": matched_by,
        "suggested_form_type": form_type_map.get(doc_type, "other"),
        "pre_fill": {
            "project_id": suggested_project_id,
            "contract_no": ocr_data.get("contract_no") or ocr_data.get("invoice_no"),
            "amount": ocr_data.get("amount") or ocr_data.get("total_amount"),
            "date": ocr_data.get("sign_date") or ocr_data.get("invoice_date") or ocr_data.get("date"),
            "party_a": ocr_data.get("party_a"),
            "party_b": ocr_data.get("party_b"),
            "seller_name": ocr_data.get("seller_name"),
            "description": ocr_data.get("contract_name") or ocr_data.get("merchant_name") or ocr_data.get("description"),
            "doc_subtype": ocr_data.get("doc_subtype"),
            "doc_subtype_label": ocr_data.get("doc_subtype_label"),
            "counterparty": ocr_data.get("counterparty"),
            "project_location": ocr_data.get("project_location"),
            "amount_cn": ocr_data.get("amount_cn"),
            "items": ocr_data.get("items"),
            "labor_summary": ocr_data.get("labor_summary"),
            "material_summary": ocr_data.get("material_summary"),
            "weather": ocr_data.get("weather"),
            "temperature": ocr_data.get("temperature"),
            "work_content": ocr_data.get("work_content"),
            "worker_count": ocr_data.get("worker_count"),
            "equipment_used": ocr_data.get("equipment_used"),
            "materials_used": ocr_data.get("materials_used"),
            "safety_status": ocr_data.get("safety_status"),
            "execution_unit": ocr_data.get("execution_unit"),
            "category": ocr_data.get("category"),
            "invoice_count": ocr_data.get("invoice_count"),
        },
    }


async def _upload_and_get_url(file: UploadFile, folder: str) -> dict | None:
    """Upload file to MinIO and return attachment info."""
    try:
        from app.services.file_storage import file_storage
        content = await file.read()
        result = await file_storage.upload_file(content, file.filename or f"{folder}.jpg", folder=folder)
        return {
            "file_id": result.get("file_id", ""),
            "object_name": result.get("object_name", ""),
            "original_filename": file.filename or f"{folder}.jpg",
            "size": len(content),
            "content_type": file.content_type or "image/jpeg",
            "url": result.get("url", ""),
        }
    except Exception:
        return None


async def _find_project_by_location(ocr_data: dict, company_id: str, db: AsyncSession) -> tuple[str | None, str | None]:
    """Try to match OCR data to a project by location/counterparty names."""
    keywords = []
    for field in ("project_location", "counterparty", "receiver", "execution_unit"):
        val = ocr_data.get(field)
        if val and isinstance(val, str):
            keywords.append(val.strip())
    if not keywords:
        return None, None
    conditions = []
    for kw in keywords:
        conditions.extend([
            Project.name.ilike(f"%{kw}%"),
            Project.address.ilike(f"%{kw}%"),
        ])
    matches = (await db.execute(
        select(Project).where(
            Project.company_id == company_id,
            Project.is_deleted == False,
            or_(*conditions),
        ).limit(3)
    )).scalars().all()
    if matches:
        return str(matches[0].id), matches[0].name
    return None, None


# ─── Construction Log Auto-Save ───────────────────────────────────

@router.post("/construction-log-auto-save")
async def ocr_construction_log_auto_save(
    file: UploadFile = File(...),
    project_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """拍照→AI识别施工日志→自动创建记录。返回记录ID供确认修改。"""
    image_b64 = await file_to_base64(file)
    ocr_data = await ai_gateway.recognize_construction_log(image_b64)
    if ocr_data.get("parse_error"):
        raise HTTPException(status_code=422, detail="OCR识别结果解析失败")

    # Resolve project_id
    resolved_pid = project_id
    if not resolved_pid:
        pid, pname = await _find_project_by_location(ocr_data, str(current_user.company_id), db)
        resolved_pid = pid

    if not resolved_pid:
        return {
            "success": False,
            "data": ocr_data,
            "message": "无法匹配项目，请手动选择项目后重试",
            "ocr_data": ocr_data,
        }

    log_date = ocr_data.get("date")
    if isinstance(log_date, str):
        try:
            log_date = date.fromisoformat(log_date)
        except ValueError:
            log_date = date.today()
    else:
        log_date = date.today()

    worker_count = ocr_data.get("worker_count") or 0
    if isinstance(worker_count, str):
        try:
            worker_count = int(worker_count)
        except ValueError:
            worker_count = 0

    log = ConstructionLog(
        company_id=current_user.company_id,
        created_by=str(current_user.id),
        project_id=resolved_pid,
        log_date=log_date,
        weather=ocr_data.get("weather"),
        temperature=ocr_data.get("temperature"),
        work_content=ocr_data.get("work_content"),
        worker_count=worker_count,
        equipment_used=ocr_data.get("equipment_used"),
        materials_used=ocr_data.get("materials_used"),
        safety_status=ocr_data.get("safety_status") or "normal",
        quality_issues=ocr_data.get("quality_issues"),
        execution_unit=ocr_data.get("execution_unit"),
        recorder_id=str(current_user.id),
    )

    # Attach photo
    attachment = await _upload_and_get_url(file, "construction_logs")
    if attachment:
        log.photos = [attachment]

    db.add(log)
    await db.flush()

    # Cost insight: estimate daily labor cost
    project = (await db.execute(
        select(Project).where(Project.id == resolved_pid)
    )).scalar_one_or_none()
    project_name = project.name if project else None

    return {
        "success": True,
        "record_id": str(log.id),
        "project_id": resolved_pid,
        "project_name": project_name,
        "ocr_data": ocr_data,
        "log_date": log_date.isoformat(),
        "worker_count": worker_count,
        "message": "施工日志已创建，请核对内容",
    }


# ─── Petty Cash Expense Auto-Save ─────────────────────────────────

@router.post("/petty-cash-auto-save")
async def ocr_petty_cash_auto_save(
    file: UploadFile = File(...),
    project_id: str | None = None,
    pool_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """拍照→AI识别备用金单据→自动创建报销记录。"""
    image_b64 = await file_to_base64(file)
    ocr_data = await ai_gateway.recognize_petty_cash_doc(image_b64)
    if ocr_data.get("parse_error"):
        raise HTTPException(status_code=422, detail="OCR识别结果解析失败")

    # Resolve project
    resolved_pid = project_id
    if not resolved_pid:
        pid, _ = await _find_project_by_location(ocr_data, str(current_user.company_id), db)
        resolved_pid = pid

    if not resolved_pid:
        return {"success": False, "data": ocr_data, "message": "无法匹配项目，请手动选择"}

    # Find or use provided pool
    resolved_pool_id = pool_id
    if not resolved_pool_id:
        pool = (await db.execute(
            select(PettyCashPool).where(
                PettyCashPool.employee_id == str(current_user.id),
                PettyCashPool.company_id == current_user.company_id,
                PettyCashPool.status == "active",
                PettyCashPool.is_deleted == False,
            ).limit(1)
        )).scalar_one_or_none()
        if pool:
            resolved_pool_id = str(pool.id)

    expense_date = ocr_data.get("date")
    if isinstance(expense_date, str):
        try:
            expense_date = date.fromisoformat(expense_date)
        except ValueError:
            expense_date = date.today()
    else:
        expense_date = date.today()

    amount = ocr_data.get("amount") or 0
    if isinstance(amount, str):
        try:
            amount = float(amount.replace(",", "").replace("¥", "").replace("￥", ""))
        except ValueError:
            amount = 0

    expense = PettyCashExpense(
        company_id=current_user.company_id,
        created_by=str(current_user.id),
        pool_id=resolved_pool_id,
        project_id=resolved_pid,
        expense_date=expense_date,
        category=ocr_data.get("category") or "其他",
        amount=amount,
        description=ocr_data.get("description"),
        invoice_count=ocr_data.get("invoice_count") or 0,
        status="pending",
        remark=ocr_data.get("remark"),
    )

    attachment = await _upload_and_get_url(file, "petty_cash")
    if attachment:
        expense.attachments = [attachment]

    db.add(expense)
    await db.flush()

    return {
        "success": True,
        "record_id": str(expense.id),
        "project_id": resolved_pid,
        "ocr_data": ocr_data,
        "amount": amount,
        "expense_date": expense_date.isoformat(),
        "message": "备用金报销已创建，请核对后提交",
    }


# ─── Payment Doc Auto-Save (creates ProjectLine) ──────────────────

@router.post("/payment-doc-auto-save")
async def ocr_payment_doc_auto_save(
    file: UploadFile = File(...),
    project_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """拍照→AI识别付款凭证→自动创建项目成本记录。"""
    image_b64 = await file_to_base64(file)
    ocr_data = await ai_gateway.recognize_payment_doc(image_b64)
    if ocr_data.get("parse_error"):
        raise HTTPException(status_code=422, detail="OCR识别结果解析失败")

    resolved_pid = project_id
    if not resolved_pid:
        pid, _ = await _find_project_by_location(ocr_data, str(current_user.company_id), db)
        resolved_pid = pid

    if not resolved_pid:
        return {"success": False, "data": ocr_data, "message": "无法匹配项目，请手动选择"}

    amount = ocr_data.get("total_amount") or 0
    if isinstance(amount, str):
        try:
            amount = float(amount.replace(",", "").replace("¥", "").replace("￥", ""))
        except ValueError:
            amount = 0

    record_date = ocr_data.get("date")
    if isinstance(record_date, str):
        try:
            record_date = date.fromisoformat(record_date)
        except ValueError:
            record_date = date.today()
    else:
        record_date = date.today()

    doc_subtype = ocr_data.get("doc_subtype") or "other"
    line_type_map = {
        "delivery_note": "material",
        "expense_record": "expense",
        "payment_proof": "expense",
        "labor_record": "labor",
        "material_list": "material",
        "other": "expense",
    }

    description_parts = []
    if ocr_data.get("counterparty"):
        description_parts.append(ocr_data["counterparty"])
    if ocr_data.get("description"):
        description_parts.append(ocr_data["description"])
    if ocr_data.get("doc_subtype_label"):
        description_parts.append(f"[{ocr_data['doc_subtype_label']}]")
    description = " - ".join(description_parts) or ocr_data.get("remark") or "付款凭证"

    line = ProjectLine(
        company_id=current_user.company_id,
        created_by=str(current_user.id),
        project_id=resolved_pid,
        line_type=line_type_map.get(doc_subtype, "expense"),
        amount=amount,
        source_type="ocr_payment_doc",
        description=description,
        record_date=record_date,
    )

    db.add(line)
    await db.flush()

    return {
        "success": True,
        "record_id": str(line.id),
        "project_id": resolved_pid,
        "ocr_data": ocr_data,
        "amount": amount,
        "line_type": line.line_type,
        "record_date": record_date.isoformat(),
        "message": "付款凭证已创建为成本记录，请核对",
    }


# ─── One-Click: Smart Classify + Auto-Save ────────────────────────

@router.post("/scan-and-save")
async def ocr_scan_and_save(
    file: UploadFile = File(...),
    project_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """拍照→AI自动判断类型→识别→直接创建对应记录。一个接口完成全流程。"""
    image_b64 = await file_to_base64(file)

    # Step 1: Classify document type
    classify_prompt = (
        "判断这张图片属于哪类文档，只返回JSON：\n"
        '{"document_type":"contract|invoice|receipt|payment_doc|construction_log|petty_cash_settlement"}\n'
        "类型定义：contract=合同 invoice=发票 payment_doc=送货单/付款凭据 "
        "construction_log=施工日志 petty_cash_settlement=报销单 receipt=小票"
    )
    classify_result = await ai_gateway.provider.vision(image_b64, classify_prompt)
    classify_data = ai_gateway._parse_json(classify_result)
    doc_type = classify_data.get("document_type", "invoice")

    # Step 2: Route to appropriate handler
    route_map = {
        "contract": _auto_save_contract,
        "invoice": _auto_save_invoice,
        "construction_log": _auto_save_construction_log,
        "payment_doc": _auto_save_payment_doc,
        "petty_cash_settlement": _auto_save_petty_cash,
        "receipt": _auto_save_petty_cash,
    }
    handler = route_map.get(doc_type, _auto_save_invoice)
    return await handler(image_b64, file, project_id, current_user, db, doc_type)


async def _auto_save_contract(image_b64, file, project_id, current_user, db, doc_type):
    ocr_data = await ai_gateway.recognize_contract(image_b64)
    if ocr_data.get("parse_error"):
        return {"success": False, "document_type": doc_type, "message": "OCR解析失败", "ocr_data": ocr_data}
    entity_match = await match_entity_from_ocr(ocr_data, str(current_user.company_id), db)
    ocr_data.update(entity_match)
    contract = Contract(
        company_id=current_user.company_id, created_by=str(current_user.id),
        contract_no=ocr_data.get("contract_no") or "", name=ocr_data.get("contract_name") or "",
        contract_type="other", party_a=ocr_data.get("party_a"), party_b=ocr_data.get("party_b"),
        signing_date=ocr_data.get("sign_date"), start_date=ocr_data.get("start_date"),
        end_date=ocr_data.get("end_date"), total_amount=ocr_data.get("amount"),
        project_id=project_id, entity_id=ocr_data.get("suggested_entity_id"),
        direction=ocr_data.get("direction"), counterparty=ocr_data.get("counterparty"),
        status="draft",
    )
    db.add(contract)
    await db.flush()
    return {"success": True, "document_type": doc_type, "record_id": str(contract.id),
            "record_type": "contract", "ocr_data": ocr_data, "message": "合同已创建为草稿"}


async def _auto_save_invoice(image_b64, file, project_id, current_user, db, doc_type):
    ocr_data = await ai_gateway.recognize_invoice(image_b64)
    if ocr_data.get("parse_error"):
        return {"success": False, "document_type": doc_type, "message": "OCR解析失败", "ocr_data": ocr_data}
    invoice = Invoice(
        company_id=current_user.company_id, created_by=str(current_user.id),
        invoice_type=ocr_data.get("invoice_type") or "增值税发票", direction="in",
        invoice_code=ocr_data.get("invoice_code"), invoice_no=ocr_data.get("invoice_no"),
        issue_date=ocr_data.get("invoice_date"), seller_name=ocr_data.get("seller_name"),
        buyer_name=ocr_data.get("buyer_name"), amount_before_tax=ocr_data.get("amount_without_tax"),
        tax_rate=ocr_data.get("tax_rate"), tax_amount=ocr_data.get("tax_amount"),
        total_amount=ocr_data.get("total_amount"), items=ocr_data.get("items"),
        check_status="unchecked", project_id=project_id,
    )
    db.add(invoice)
    await db.flush()
    return {"success": True, "document_type": doc_type, "record_id": str(invoice.id),
            "record_type": "invoice", "ocr_data": ocr_data, "message": "发票已创建"}


async def _auto_save_construction_log(image_b64, file, project_id, current_user, db, doc_type):
    ocr_data = await ai_gateway.recognize_construction_log(image_b64)
    if ocr_data.get("parse_error"):
        return {"success": False, "document_type": doc_type, "message": "OCR解析失败", "ocr_data": ocr_data}
    resolved_pid = project_id
    if not resolved_pid:
        pid, _ = await _find_project_by_location(ocr_data, str(current_user.company_id), db)
        resolved_pid = pid
    if not resolved_pid:
        return {"success": False, "document_type": doc_type, "ocr_data": ocr_data, "message": "无法匹配项目"}
    log_date = ocr_data.get("date")
    try:
        log_date = date.fromisoformat(log_date) if isinstance(log_date, str) else date.today()
    except ValueError:
        log_date = date.today()
    worker_count = ocr_data.get("worker_count") or 0
    try:
        worker_count = int(worker_count)
    except (ValueError, TypeError):
        worker_count = 0
    log = ConstructionLog(
        company_id=current_user.company_id, created_by=str(current_user.id),
        project_id=resolved_pid, log_date=log_date, weather=ocr_data.get("weather"),
        temperature=ocr_data.get("temperature"), work_content=ocr_data.get("work_content"),
        worker_count=worker_count, equipment_used=ocr_data.get("equipment_used"),
        materials_used=ocr_data.get("materials_used"),
        safety_status=ocr_data.get("safety_status") or "normal",
        execution_unit=ocr_data.get("execution_unit"), recorder_id=str(current_user.id),
    )
    db.add(log)
    await db.flush()
    return {"success": True, "document_type": doc_type, "record_id": str(log.id),
            "record_type": "construction_log", "project_id": resolved_pid,
            "worker_count": worker_count, "ocr_data": ocr_data, "message": "施工日志已创建"}


async def _auto_save_payment_doc(image_b64, file, project_id, current_user, db, doc_type):
    ocr_data = await ai_gateway.recognize_payment_doc(image_b64)
    if ocr_data.get("parse_error"):
        return {"success": False, "document_type": doc_type, "message": "OCR解析失败", "ocr_data": ocr_data}
    resolved_pid = project_id
    if not resolved_pid:
        pid, _ = await _find_project_by_location(ocr_data, str(current_user.company_id), db)
        resolved_pid = pid
    if not resolved_pid:
        return {"success": False, "document_type": doc_type, "ocr_data": ocr_data, "message": "无法匹配项目"}
    amount = ocr_data.get("total_amount") or 0
    try:
        amount = float(str(amount).replace(",", "").replace("¥", "").replace("￥", ""))
    except (ValueError, TypeError):
        amount = 0
    record_date = ocr_data.get("date")
    try:
        record_date = date.fromisoformat(record_date) if isinstance(record_date, str) else date.today()
    except ValueError:
        record_date = date.today()
    subtype = ocr_data.get("doc_subtype") or "other"
    line_type = {"delivery_note": "material", "labor_record": "labor"}.get(subtype, "expense")
    description = f"{ocr_data.get('counterparty', '')} - {ocr_data.get('description', '')}".strip(" -")
    line = ProjectLine(
        company_id=current_user.company_id, created_by=str(current_user.id),
        project_id=resolved_pid, line_type=line_type, amount=amount,
        source_type="ocr_payment_doc", description=description or "付款凭证",
        record_date=record_date,
    )
    db.add(line)
    await db.flush()
    return {"success": True, "document_type": doc_type, "record_id": str(line.id),
            "record_type": "project_line", "project_id": resolved_pid,
            "amount": amount, "ocr_data": ocr_data, "message": "付款凭证已创建为成本记录"}


async def _auto_save_petty_cash(image_b64, file, project_id, current_user, db, doc_type):
    ocr_data = await ai_gateway.recognize_petty_cash_doc(image_b64)
    if ocr_data.get("parse_error"):
        return {"success": False, "document_type": doc_type, "message": "OCR解析失败", "ocr_data": ocr_data}
    resolved_pid = project_id
    if not resolved_pid:
        pid, _ = await _find_project_by_location(ocr_data, str(current_user.company_id), db)
        resolved_pid = pid
    if not resolved_pid:
        return {"success": False, "document_type": doc_type, "ocr_data": ocr_data, "message": "无法匹配项目"}
    pool = (await db.execute(
        select(PettyCashPool).where(
            PettyCashPool.employee_id == str(current_user.id),
            PettyCashPool.company_id == current_user.company_id,
            PettyCashPool.status == "active", PettyCashPool.is_deleted == False,
        ).limit(1)
    )).scalar_one_or_none()
    amount = ocr_data.get("amount") or 0
    try:
        amount = float(str(amount).replace(",", "").replace("¥", "").replace("￥", ""))
    except (ValueError, TypeError):
        amount = 0
    expense_date = ocr_data.get("date")
    try:
        expense_date = date.fromisoformat(expense_date) if isinstance(expense_date, str) else date.today()
    except ValueError:
        expense_date = date.today()
    expense = PettyCashExpense(
        company_id=current_user.company_id, created_by=str(current_user.id),
        pool_id=str(pool.id) if pool else None, project_id=resolved_pid,
        expense_date=expense_date, category=ocr_data.get("category") or "其他",
        amount=amount, description=ocr_data.get("description"),
        status="pending", remark=ocr_data.get("remark"),
    )
    db.add(expense)
    await db.flush()
    return {"success": True, "document_type": doc_type, "record_id": str(expense.id),
            "record_type": "petty_cash_expense", "project_id": resolved_pid,
            "amount": amount, "ocr_data": ocr_data, "message": "报销记录已创建"}
