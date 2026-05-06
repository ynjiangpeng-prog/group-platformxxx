from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import datetime
import json
import httpx
import os

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
