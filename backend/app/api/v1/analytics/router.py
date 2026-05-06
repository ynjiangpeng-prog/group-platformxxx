from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, text, extract
from datetime import datetime, timedelta
from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.models.project import Project, BankTransaction
from app.models.erp import Contract, Supplier, Customer
from app.models.charging import ChargingOrder, ChargingStation
from app.models.finance import ArApRecord

router = APIRouter(prefix="/analytics", tags=["业绩分析"])


@router.get("/overview")
async def get_business_overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取业绩总览（工程+充电双业务线）"""
    
    # ===== 工程业务线 =====
    contracts_result = await db.execute(text("""
        SELECT 
            COUNT(*) as total_contracts,
            COALESCE(SUM(total_amount), 0) as total_contract_amount,
            COALESCE(SUM(paid_amount), 0) as total_paid_amount,
            COUNT(CASE WHEN status = 'signed' THEN 1 END) as signed_count,
            COUNT(CASE WHEN status = 'executing' THEN 1 END) as executing_count,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count
        FROM contracts 
        WHERE is_deleted = false AND company_id = :company_id
    """), {"company_id": str(current_user.company_id)})
    contracts = contracts_result.fetchone()
    
    # 项目统计
    projects_result = await db.execute(text("""
        SELECT 
            project_type,
            COUNT(*) as count,
            COALESCE(SUM(actual_cost), 0) as total_cost,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
            COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress
        FROM projects 
        WHERE is_deleted = false AND company_id = :company_id
        GROUP BY project_type
    """), {"company_id": str(current_user.company_id)})
    projects = projects_result.fetchall()
    
    # ===== 充电业务线 =====
    stations_result = await db.execute(text("""
        SELECT 
            COUNT(*) as total_stations,
            COUNT(CASE WHEN status = 'operating' THEN 1 END) as operating,
            COUNT(CASE WHEN status = 'building' THEN 1 END) as building,
            COUNT(CASE WHEN status = 'planning' THEN 1 END) as planning
        FROM charging_stations 
        WHERE is_deleted = false AND company_id = :company_id
    """), {"company_id": str(current_user.company_id)})
    stations = stations_result.fetchone()
    
    # 充电订单统计
    orders_result = await db.execute(text("""
        SELECT 
            COUNT(*) as total_orders,
            COALESCE(SUM(charging_kwh), 0) as total_kwh,
            COALESCE(SUM(total_amount), 0) as total_revenue,
            COALESCE(SUM(pay_amount), 0) as total_pay_amount
        FROM charging_orders 
        WHERE is_deleted = false AND company_id = :company_id
    """), {"company_id": str(current_user.company_id)})
    orders = orders_result.fetchone()
    
    # ===== 财务概况 =====
    arap_result = await db.execute(text("""
        SELECT 
            type,
            COUNT(*) as count,
            COALESCE(SUM(remaining_amount), 0) as total_remaining,
            COUNT(CASE WHEN overdue_days > 0 THEN 1 END) as overdue_count,
            COALESCE(SUM(CASE WHEN overdue_days > 0 THEN remaining_amount ELSE 0 END), 0) as overdue_amount
        FROM ar_ap_records 
        WHERE is_deleted = false AND company_id = :company_id
        GROUP BY type
    """), {"company_id": str(current_user.company_id)})
    arap = arap_result.fetchall()
    
    return {
        "engineering": {
            "contracts": {
                "total": contracts[0],
                "total_amount": float(contracts[1]),
                "paid_amount": float(contracts[2]),
                "signed": contracts[3],
                "executing": contracts[4],
                "completed": contracts[5],
                "collection_rate": float(contracts[2]) / float(contracts[1]) * 100 if contracts[1] > 0 else 0
            },
            "projects": [
                {
                    "type": row[0],
                    "count": row[1],
                    "total_cost": float(row[2]),
                    "completed": row[3],
                    "in_progress": row[4]
                }
                for row in projects
            ]
        },
        "charging": {
            "stations": {
                "total": stations[0],
                "operating": stations[1],
                "building": stations[2],
                "planning": stations[3]
            },
            "orders": {
                "total": orders[0],
                "total_kwh": float(orders[1]),
                "total_revenue": float(orders[2]),
                "total_pay_amount": float(orders[3])
            }
        },
        "finance": {
            "arap": [
                {
                    "type": row[0],
                    "count": row[1],
                    "remaining": float(row[2]),
                    "overdue_count": row[3],
                    "overdue_amount": float(row[4])
                }
                for row in arap
            ]
        }
    }


@router.get("/trends")
async def get_monthly_trends(
    months: int = 12,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取月度趋势数据"""
    
    # 银行流水月度统计
    bank_result = await db.execute(text("""
        SELECT 
            DATE_TRUNC('month', tx_date) as month,
            SUM(CASE WHEN tx_amount > 0 THEN tx_amount ELSE 0 END) as income,
            SUM(CASE WHEN tx_amount < 0 THEN ABS(tx_amount) ELSE 0 END) as expense,
            COUNT(*) as transaction_count
        FROM bank_transactions 
        WHERE is_deleted = false AND company_id = :company_id
        GROUP BY DATE_TRUNC('month', tx_date)
        ORDER BY month DESC
        LIMIT :months
    """), {"company_id": str(current_user.company_id), "months": months})
    bank = bank_result.fetchall()
    
    # 充电订单月度统计
    charging_result = await db.execute(text("""
        SELECT 
            DATE_TRUNC('month', start_time) as month,
            COUNT(*) as order_count,
            COALESCE(SUM(charging_kwh), 0) as total_kwh,
            COALESCE(SUM(total_amount), 0) as total_revenue
        FROM charging_orders 
        WHERE is_deleted = false AND company_id = :company_id AND start_time IS NOT NULL
        GROUP BY DATE_TRUNC('month', start_time)
        ORDER BY month DESC
        LIMIT :months
    """), {"company_id": str(current_user.company_id), "months": months})
    charging = charging_result.fetchall()
    
    return {
        "bank_flow": [
            {
                "month": row[0].strftime('%Y-%m') if row[0] else None,
                "income": float(row[1]),
                "expense": float(row[2]),
                "count": row[3]
            }
            for row in bank
        ],
        "charging": [
            {
                "month": row[0].strftime('%Y-%m') if row[0] else None,
                "order_count": row[1],
                "kwh": float(row[2]),
                "revenue": float(row[3])
            }
            for row in charging
        ]
    }


@router.get("/top-customers")
async def get_top_customers(
    limit: int = 10,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取Top客户（按交易金额）"""
    
    result = await db.execute(text("""
        SELECT 
            c.name,
            c.contact_person,
            COUNT(bt.id) as transaction_count,
            COALESCE(SUM(CASE WHEN bt.tx_amount > 0 THEN bt.tx_amount ELSE 0 END), 0) as total_income,
            COALESCE(SUM(CASE WHEN bt.tx_amount < 0 THEN ABS(bt.tx_amount) ELSE 0 END), 0) as total_expense
        FROM customers c
        LEFT JOIN bank_transactions bt ON bt.counterparty_id = c.id AND bt.is_deleted = false
        WHERE c.is_deleted = false AND c.company_id = :company_id
        GROUP BY c.id, c.name, c.contact_person
        ORDER BY total_income DESC
        LIMIT :limit
    """), {"company_id": str(current_user.company_id), "limit": limit})
    
    rows = result.fetchall()
    return {
        "items": [
            {
                "name": row[0],
                "contact_person": row[1],
                "transaction_count": row[2],
                "total_income": float(row[3]),
                "total_expense": float(row[4])
            }
            for row in rows
        ]
    }


@router.get("/top-suppliers")
async def get_top_suppliers(
    limit: int = 10,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取Top供应商（按交易金额）"""
    
    result = await db.execute(text("""
        SELECT 
            s.name,
            s.contact_person,
            COUNT(bt.id) as transaction_count,
            COALESCE(SUM(CASE WHEN bt.tx_amount > 0 THEN bt.tx_amount ELSE 0 END), 0) as total_income,
            COALESCE(SUM(CASE WHEN bt.tx_amount < 0 THEN ABS(bt.tx_amount) ELSE 0 END), 0) as total_expense
        FROM suppliers s
        LEFT JOIN bank_transactions bt ON bt.counterparty_id = s.id AND bt.is_deleted = false
        WHERE s.is_deleted = false AND s.company_id = :company_id
        GROUP BY s.id, s.name, s.contact_person
        ORDER BY total_expense DESC
        LIMIT :limit
    """), {"company_id": str(current_user.company_id), "limit": limit})
    
    rows = result.fetchall()
    return {
        "items": [
            {
                "name": row[0],
                "contact_person": row[1],
                "transaction_count": row[2],
                "total_income": float(row[3]),
                "total_expense": float(row[4])
            }
            for row in rows
        ]
    }
