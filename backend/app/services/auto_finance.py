import json
import logging
from datetime import date, datetime, timedelta
from uuid import uuid4

from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project.models import BankTransaction
from app.models.finance.models import ArApRecord, Invoice

logger = logging.getLogger(__name__)


class AutoFinanceEngine:

    async def auto_reconcile_daily(self, db: AsyncSession, company_id: str) -> dict:
        from app.services.finance_event_chain import finance_event_chain
        result = await finance_event_chain.on_bank_import(db, company_id)
        return {
            "total_unmatched": result.get("arap_matched", 0) + result.get("auto_linked_to_project", 0),
            "auto_matched": result.get("arap_matched", 0),
            "remaining_unmatched": 0,
        }

    async def auto_tax_summary(self, db: AsyncSession, company_id: str, month: str | None = None) -> dict:
        today = date.today()
        if not month:
            month = f"{today.year}-{today.month:02d}"

        month_start = datetime.strptime(month + "-01", "%Y-%m-%d").date()
        if month_start.month == 12:
            month_end = date(month_start.year + 1, 1, 1) - timedelta(days=1)
        else:
            month_end = date(month_start.year, month_start.month + 1, 1) - timedelta(days=1)

        from app.models.finance.models import Invoice
        invoices = (await db.execute(
            select(Invoice).where(
                Invoice.company_id == company_id, Invoice.is_deleted == False,
                Invoice.issue_date >= month_start, Invoice.issue_date <= month_end,
            )
        )).scalars().all()

        input_tax = 0.0
        output_tax = 0.0
        input_amount = 0.0
        output_amount = 0.0

        for inv in invoices:
            amt = float(inv.total_amount or 0)
            tax = float(inv.tax_amount or 0)
            if inv.direction == "in":
                input_tax += tax
                input_amount += amt
            else:
                output_tax += tax
                output_amount += amt

        vat_rate = 0.13
        net_vat = output_tax - input_tax

        return {
            "month": month,
            "input_invoices": {"count": sum(1 for i in invoices if i.direction == "in"), "amount": round(input_amount, 2), "tax": round(input_tax, 2)},
            "output_invoices": {"count": sum(1 for i in invoices if i.direction == "out"), "amount": round(output_amount, 2), "tax": round(output_tax, 2)},
            "net_vat": round(net_vat, 2),
            "city_tax": round(net_vat * 0.07, 2) if net_vat > 0 else 0,
            "education_surcharge": round(net_vat * 0.03, 2) if net_vat > 0 else 0,
            "local_education_surcharge": round(net_vat * 0.02, 2) if net_vat > 0 else 0,
        }

    async def auto_daily_finance_check(self, db: AsyncSession, company_id: str) -> dict:
        today = date.today()

        total_ar = float((await db.execute(
            select(func.coalesce(func.sum(ArApRecord.remaining_amount), 0)).where(
                ArApRecord.company_id == company_id, ArApRecord.is_deleted == False,
                ArApRecord.type == "ar", ArApRecord.remaining_amount > 0,
            )
        )).scalar() or 0)

        overdue_ar = float((await db.execute(
            select(func.coalesce(func.sum(ArApRecord.remaining_amount), 0)).where(
                ArApRecord.company_id == company_id, ArApRecord.is_deleted == False,
                ArApRecord.type == "ar", ArApRecord.due_date < today, ArApRecord.remaining_amount > 0,
            )
        )).scalar() or 0)

        total_ap = float((await db.execute(
            select(func.coalesce(func.sum(ArApRecord.remaining_amount), 0)).where(
                ArApRecord.company_id == company_id, ArApRecord.is_deleted == False,
                ArApRecord.type == "ap", ArApRecord.remaining_amount > 0,
            )
        )).scalar() or 0)

        overdue_ap = float((await db.execute(
            select(func.coalesce(func.sum(ArApRecord.remaining_amount), 0)).where(
                ArApRecord.company_id == company_id, ArApRecord.is_deleted == False,
                ArApRecord.type == "ap", ArApRecord.due_date < today, ArApRecord.remaining_amount > 0,
            )
        )).scalar() or 0)

        recon_result = await self.auto_reconcile_daily(db, company_id)
        tax_summary = await self.auto_tax_summary(db, company_id)

        return {
            "ar": {"total": total_ar, "overdue": overdue_ar, "healthy_pct": round((1 - overdue_ar / total_ar) * 100, 1) if total_ar > 0 else 100},
            "ap": {"total": total_ap, "overdue": overdue_ap, "healthy_pct": round((1 - overdue_ap / total_ap) * 100, 1) if total_ap > 0 else 100},
            "reconciliation": recon_result,
            "tax": tax_summary,
        }


auto_finance = AutoFinanceEngine()
