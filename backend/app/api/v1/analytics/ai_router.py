from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
import base64
from datetime import datetime
import json
import httpx
import os
from pydantic import BaseModel

from fastapi import File, UploadFile
from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User

router = APIRouter(prefix="/ai", tags=["AI业绩分析"])

# 智谱AI配置
ZHIPU_API_KEY = os.environ.get("ZHIPU_API_KEY", "")
ZHIPU_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"


async def call_ai(prompt: str) -> str:
    """调用AI模型进行分析"""
    headers = {
        "Authorization": f"Bearer {ZHIPU_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "glm-4-plus",
        "messages": [
            {
                "role": "system",
                "content": "你是一位资深的企业经营分析顾问，擅长分析新能源充电站和电力工程企业的业绩数据。请用中文给出专业、简洁的分析报告。"
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": 0.7,
        "max_tokens": 2000
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(ZHIPU_API_URL, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        return f"AI分析暂不可用: {str(e)}"


@router.post("/analyze")
async def ai_business_analysis(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI智能业绩分析"""
    
    # 获取总览数据
    from ..analytics.router import get_business_overview
    overview = await get_business_overview(current_user, db)
    
    # 获取趋势数据
    from ..analytics.router import get_monthly_trends
    trends = await get_monthly_trends(12, current_user, db)
    
    # 构建分析提示词
    prompt = f"""请分析以下新能源企业的业绩数据，给出专业的经营分析报告：

## 企业概况
- 业务类型：充电站运营 + 电力工程建设
- 分析时间：{datetime.now().strftime('%Y年%m月')}

## 工程业务线数据
{json.dumps(overview.get('engineering', {}), ensure_ascii=False, indent=2)}

## 充电业务线数据
{json.dumps(overview.get('charging', {}), ensure_ascii=False, indent=2)}

## 财务概况
{json.dumps(overview.get('finance', {}), ensure_ascii=False, indent=2)}

## 近12个月趋势
银行流水趋势：
{json.dumps(trends.get('bank_flow', [])[:6], ensure_ascii=False, indent=2)}

充电趋势：
{json.dumps(trends.get('charging', [])[:6], ensure_ascii=False, indent=2)}

## 请从以下维度分析：

1. **整体业绩评价**：企业当前经营状况总体评价（优/良/一般/差）

2. **工程业务分析**：
   - 合同签约情况分析
   - 项目执行进度评估
   - 回款风险预警
   - 成本控制能力评估

3. **充电业务分析**：
   - 充电站运营状况
   - 充电量/收入趋势
   - 单站盈利能力评估
   - 市场拓展建议

4. **财务健康度**：
   - 现金流状况
   - 应收应付风险
   - 资金周转效率

5. **风险提示**：
   - 主要风险点识别
   - 逾期应收预警
   - 成本超支预警

6. **改进建议**：
   - 短期行动建议（1-3个月）
   - 中期优化建议（3-6个月）
   - 长期战略规划（6-12个月）

请用清晰的结构输出，每个部分给出具体的数据支撑和可量化的建议。"""

    # 调用AI
    analysis = await call_ai(prompt)
    
    return {
        "analysis": analysis,
        "data_summary": overview,
        "generated_at": datetime.now().isoformat()
    }


@router.post("/forecast")
async def ai_business_forecast(
    months: int = 3,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI业绩预测"""
    
    # 获取趋势数据
    trends = await get_monthly_trends(12, current_user, db)
    
    prompt = f"""请基于以下历史数据，预测未来{months}个月的业绩走势：

## 历史数据（近12个月）

### 资金流水
{json.dumps(trends.get('bank_flow', []), ensure_ascii=False, indent=2)}

### 充电业务
{json.dumps(trends.get('charging', []), ensure_ascii=False, indent=2)}

## 预测要求
1. 预测未来{months}个月的：
   - 月收入/支出
   - 充电量/收入（如有数据）
   - 现金流状况

2. 给出预测依据和置信度

3. 识别季节性规律和趋势

4. 给出达成预测目标的关键行动建议

请用表格形式展示预测结果。"""

    forecast = await call_ai(prompt)
    
    return {
        "forecast": forecast,
        "historical_data": trends,
        "forecast_months": months,
        "generated_at": datetime.now().isoformat()
    }


@router.post("/anomaly-detection")
async def ai_anomaly_detection(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI异常检测"""
    
    # 获取银行流水异常
    result = await db.execute(text("""
        SELECT 
            tx_date,
            counterparty,
            tx_amount,
            summary,
            ABS(tx_amount) as abs_amount
        FROM bank_transactions
        WHERE is_deleted = false AND company_id = :company_id
        ORDER BY abs_amount DESC
        LIMIT 20
    """), {"company_id": str(current_user.company_id)})
    
    top_transactions = result.fetchall()
    
    # 获取月度同比数据
    monthly_result = await db.execute(text("""
        SELECT 
            DATE_TRUNC('month', tx_date) as month,
            SUM(CASE WHEN tx_amount > 0 THEN tx_amount ELSE 0 END) as income,
            SUM(CASE WHEN tx_amount < 0 THEN ABS(tx_amount) ELSE 0 END) as expense
        FROM bank_transactions
        WHERE is_deleted = false AND company_id = :company_id
        GROUP BY DATE_TRUNC('month', tx_date)
        ORDER BY month
    """), {"company_id": str(current_user.company_id)})
    
    monthly = monthly_result.fetchall()
    
    prompt = f"""请检测以下财务数据中的异常和风险：

## 大额交易Top20
{json.dumps([{"date": str(row[0]), "counterparty": row[1], "amount": float(row[2]), "summary": row[3]} for row in top_transactions], ensure_ascii=False, indent=2)}

## 月度收支趋势
{json.dumps([{"month": str(row[0]), "income": float(row[1]), "expense": float(row[2])} for row in monthly], ensure_ascii=False, indent=2)}

## 检测要求
1. 识别异常大额交易（超过月度平均值3倍以上）
2. 发现收支异常波动月份
3. 检测可能的重复付款/收款
4. 识别现金流断裂风险
5. 发现潜在的资金挪用或 fraud 风险

请给出具体的异常交易列表和风险等级评估。"""

    anomalies = await call_ai(prompt)
    
    return {
        "anomalies": anomalies,
        "top_transactions": [{"date": str(row[0]), "counterparty": row[1], "amount": float(row[2]), "summary": row[3]} for row in top_transactions],
        "generated_at": datetime.now().isoformat()
    }


# ─── Quick Entry (AI快速录入) ───

FORM_TYPES = {
    "petty_cash_expense": "备用金核销",
    "invoice": "发票录入",
    "receipt": "收据/小票",
    "payment_doc": "付款依据",
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
            "invoice(发票), receipt(收据/小票), payment_doc(付款依据/送货单/开支明细), "
            "construction_log(施工日志), petty_cash_doc(备用金核销单据), other(其他)\n"
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
            doc_type = "petty_cash_expense"
            extracted = {"description": combined_text}

    if extracted.get("project_name"):
        from sqlalchemy import select, func
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

    form_type = doc_type
    if doc_type in ("invoice", "receipt", "payment_doc", "petty_cash_doc"):
        form_type = "petty_cash_expense"

    return {
        "document_type": doc_type,
        "form_type": form_type,
        "form_type_label": FORM_TYPES.get(form_type, doc_type),
        "confidence": confidence,
        "extracted_fields": extracted,
        "suggested_project_id": suggested_project_id,
        "suggested_project_name": suggested_project_name,
    }


class QuickEntrySubmit(BaseModel):
    form_type: str
    form_data: dict
    project_id: str | None = None


@router.post("/quick-entry/submit")
async def quick_entry_submit(
    body: QuickEntrySubmit,
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    """AI快速录入 — 确认提交"""
    from app.models.petty_cash.models import PettyCashExpense, PettyCashPool

    if body.form_type == "petty_cash_expense":
        pool = await _get_or_create_pool_quick(db, current_user)
        fd = body.form_data
        expense = PettyCashExpense(
            pool_id=str(pool.id),
            project_id=body.project_id or fd.get("project_id", ""),
            expense_date=fd.get("date") or fd.get("expense_date") or datetime.now().date().isoformat(),
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
