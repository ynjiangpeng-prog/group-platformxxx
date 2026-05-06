import logging
from datetime import date, timedelta
from calendar import monthrange

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.charging.models import (
    ChargingOrder, FleetCustomer, FleetPaymentBill, FleetRechargeRecord,
    ChargingStation, StationFinancialMonthly,
)
from app.models.finance.models import ArApRecord, Invoice
from app.api.deps.auth import generate_no

logger = logging.getLogger(__name__)


class FleetBillingService:

    async def generate_monthly_bill(
        self, db: AsyncSession, company_id: str, fleet_id: str, period: str, user_id: str,
    ) -> FleetPaymentBill:
        fleet = (await db.execute(
            select(FleetCustomer).where(
                FleetCustomer.id == fleet_id,
                FleetCustomer.is_deleted == False,
                FleetCustomer.company_id == company_id,
            )
        )).scalar_one_or_none()
        if not fleet:
            raise ValueError("车队客户不存在")

        existing = (await db.execute(
            select(FleetPaymentBill).where(
                FleetPaymentBill.fleet_id == fleet_id,
                FleetPaymentBill.period == period,
                FleetPaymentBill.is_deleted == False,
            )
        )).scalar_one_or_none()
        if existing:
            raise ValueError(f"{period}账单已存在")

        year, month = int(period[:4]), int(period[5:7])
        last_day = monthrange(year, month)[1]
        start = date(year, month, 1)
        end = date(year, month, last_day)

        result = (await db.execute(
            select(
                func.count(ChargingOrder.id),
                func.coalesce(func.sum(ChargingOrder.charging_kwh), 0),
                func.coalesce(func.sum(ChargingOrder.energy_cost), 0),
                func.coalesce(func.sum(ChargingOrder.service_cost), 0),
                func.coalesce(func.sum(ChargingOrder.pay_amount), 0),
                func.coalesce(func.sum(ChargingOrder.peak_kwh), 0),
                func.coalesce(func.sum(ChargingOrder.flat_kwh), 0),
                func.coalesce(func.sum(ChargingOrder.valley_kwh), 0),
                func.coalesce(func.sum(ChargingOrder.sharp_kwh), 0),
                func.coalesce(func.sum(ChargingOrder.peak_cost), 0),
                func.coalesce(func.sum(ChargingOrder.flat_cost), 0),
                func.coalesce(func.sum(ChargingOrder.valley_cost), 0),
                func.coalesce(func.sum(ChargingOrder.sharp_cost), 0),
            ).where(
                ChargingOrder.fleet_customer_id == fleet_id,
                ChargingOrder.is_deleted == False,
                ChargingOrder.company_id == company_id,
                ChargingOrder.start_time >= start,
                ChargingOrder.start_time < end + timedelta(days=1),
            )
        )).one()

        total_orders = result[0]
        total_kwh = float(result[1] or 0)
        energy_amount = float(result[2] or 0)
        service_amount = float(result[3] or 0)
        total_amount = float(result[4] or 0)
        peak_kwh = float(result[5] or 0)
        flat_kwh = float(result[6] or 0)
        valley_kwh = float(result[7] or 0)
        sharp_kwh = float(result[8] or 0)
        peak_cost = float(result[9] or 0)
        flat_cost = float(result[10] or 0)
        valley_cost = float(result[11] or 0)
        sharp_cost = float(result[12] or 0)

        avg_energy_price = round(energy_amount / total_kwh, 4) if total_kwh > 0 else 0
        avg_service_price = round(service_amount / total_kwh, 4) if total_kwh > 0 else 0

        service_fee_rate = float(fleet.service_fee_rate or 0)
        recalculated_service = round(total_kwh * service_fee_rate, 2) if service_fee_rate > 0 else service_amount

        # 自动关联项目：查找该车队订单关联最多的 station 的 project_id
        bill_project_id = None
        top_station = (await db.execute(
            select(ChargingOrder.station_id, func.count(ChargingOrder.id).label("cnt")).where(
                ChargingOrder.fleet_customer_id == fleet_id,
                ChargingOrder.is_deleted == False,
                ChargingOrder.company_id == company_id,
                ChargingOrder.start_time >= start,
                ChargingOrder.start_time < end + timedelta(days=1),
                ChargingOrder.station_id != None,
            ).group_by(ChargingOrder.station_id).order_by(func.count(ChargingOrder.id).desc()).limit(1)
        )).first()
        if top_station and top_station[0]:
            station = (await db.execute(
                select(ChargingStation).where(ChargingStation.id == top_station[0])
            )).scalar_one_or_none()
            if station and station.project_id:
                bill_project_id = str(station.project_id)

        if fleet.billing_type == "prepay":
            deduct = min(total_amount, float(fleet.balance or 0))
            fleet.balance = float(fleet.balance or 0) - deduct
            fleet.virtual_balance = float(fleet.virtual_balance or 0) - deduct
        else:
            deduct = 0.0

        actual_pay = total_amount - deduct
        due_date = date(year, month, 20) if month < 12 else date(year + 1, 1, 20)
        if due_date < date.today():
            due_date = date.today() + timedelta(days=15)

        bill = FleetPaymentBill(
            fleet_id=fleet_id,
            bill_no=generate_no("FB"),
            period=period,
            total_orders=total_orders,
            total_kwh=total_kwh,
            total_amount=total_amount,
            energy_amount=energy_amount,
            service_amount=service_amount,
            net_amount=total_amount,
            deducted_from_balance=deduct,
            actual_pay_amount=actual_pay,
            payment_due_date=due_date,
            payment_status="paid" if actual_pay <= 0 else "unpaid",
            billing_type=fleet.billing_type or "monthly",
            peak_kwh=peak_kwh, flat_kwh=flat_kwh, valley_kwh=valley_kwh, sharp_kwh=sharp_kwh,
            peak_cost=peak_cost, flat_cost=flat_cost, valley_cost=valley_cost, sharp_cost=sharp_cost,
            avg_energy_price=avg_energy_price,
            avg_service_price=avg_service_price,
            project_id=bill_project_id,
            company_id=company_id,
            created_by=user_id,
        )
        db.add(bill)
        await db.flush()

        if actual_pay > 0 and fleet.billing_type == "monthly":
            arap = ArApRecord(
                type="ar",
                business_type="fleet_bill",
                business_id=str(bill.id),
                source_no=bill.bill_no,
                counterparty=fleet.fleet_name,
                counterparty_id=fleet_id,
                total_amount=actual_pay,
                settled_amount=0,
                remaining_amount=actual_pay,
                due_date=due_date,
                status="pending",
                project_id=bill_project_id,
                company_id=company_id,
                created_by=user_id,
            )
            db.add(arap)

        await db.flush()
        return bill

    async def generate_all_monthly_bills(
        self, db: AsyncSession, company_id: str, period: str, user_id: str,
    ) -> list[dict]:
        fleets = (await db.execute(
            select(FleetCustomer).where(
                FleetCustomer.is_deleted == False,
                FleetCustomer.company_id == company_id,
                FleetCustomer.billing_type == "monthly",
            )
        )).scalars().all()

        results = []
        for fleet in fleets:
            try:
                bill = await self.generate_monthly_bill(db, company_id, str(fleet.id), period, user_id)
                results.append({"fleet": fleet.fleet_name, "bill_no": bill.bill_no, "amount": float(bill.actual_pay_amount or 0), "status": "ok"})
            except ValueError as e:
                results.append({"fleet": fleet.fleet_name, "status": "skip", "reason": str(e)})
            except Exception as e:
                logger.exception("生成车队账单失败 %s: %s", fleet.fleet_name, e)
                results.append({"fleet": fleet.fleet_name, "status": "error", "reason": str(e)})

        await db.commit()
        return results

    async def deduct_prepay_balance(
        self, db: AsyncSession, company_id: str, order_id: str,
    ) -> dict:
        order = (await db.execute(
            select(ChargingOrder).where(ChargingOrder.id == order_id)
        )).scalar_one_or_none()
        if not order or not order.fleet_customer_id:
            return {"deducted": False}

        fleet = (await db.execute(
            select(FleetCustomer).where(FleetCustomer.id == order.fleet_customer_id)
        )).scalar_one_or_none()
        if not fleet or fleet.billing_type != "prepay":
            return {"deducted": False}

        amount = float(order.pay_amount or order.total_amount or 0)
        if amount <= 0:
            return {"deducted": False}

        vb = float(fleet.virtual_balance or 0)
        if vb >= amount:
            fleet.virtual_balance = vb - amount
            order.pay_status = "paid"
            order.pay_method = "fleet_prepay"
            await db.flush()
            return {"deducted": True, "amount": amount, "remaining": float(fleet.virtual_balance)}
        else:
            return {"deducted": False, "reason": "余额不足", "virtual_balance": vb, "required": amount}

    async def generate_platform_revenue_ar(
        self, db: AsyncSession, company_id: str, station_id: str | None,
        amount: float, counterparty: str, tx_date: date, user_id: str,
    ) -> ArApRecord:
        arap = ArApRecord(
            type="ar",
            business_type="platform_revenue",
            counterparty=counterparty,
            total_amount=amount,
            settled_amount=0,
            remaining_amount=amount,
            due_date=tx_date + timedelta(days=30),
            status="pending",
            company_id=company_id,
            created_by=user_id,
        )
        if station_id:
            station = (await db.execute(
                select(ChargingStation).where(ChargingStation.id == station_id)
            )).scalar_one_or_none()
            if station and station.project_id:
                arap.project_id = str(station.project_id)

        db.add(arap)
        await db.flush()
        return arap

    async def apply_electricity_price_adjustment(
        self, db: AsyncSession, company_id: str, station_id: str,
        period: str, actual_price_per_kwh: float, user_id: str,
    ) -> dict:
        year, month = int(period[:4]), int(period[5:7])
        last_day = monthrange(year, month)[1]
        start = date(year, month, 1)
        end = date(year, month, last_day)

        orders = (await db.execute(
            select(ChargingOrder).where(
                ChargingOrder.station_id == station_id,
                ChargingOrder.is_deleted == False,
                ChargingOrder.start_time >= start,
                ChargingOrder.start_time < end + timedelta(days=1),
            )
        )).scalars().all()

        if not orders:
            return {"adjusted": 0, "total_diff": 0}

        total_kwh = 0.0
        total_diff = 0.0
        for order in orders:
            kwh = float(order.charging_kwh or 0)
            if kwh <= 0:
                continue
            total_kwh += kwh
            old_price = float(order.energy_price or 0)
            if old_price <= 0:
                continue
            new_energy_cost = round(kwh * actual_price_per_kwh, 2)
            old_energy_cost = float(order.energy_cost or 0)
            diff = new_energy_cost - old_energy_cost
            order.adjusted_unit_price = actual_price_per_kwh
            order.adjusted_total = float(order.pay_amount or 0) + diff
            total_diff += diff

        sfm = (await db.execute(
            select(StationFinancialMonthly).where(
                StationFinancialMonthly.station_id == station_id,
                StationFinancialMonthly.month == period,
                StationFinancialMonthly.is_deleted == False,
            )
        )).scalar_one_or_none()
        if sfm:
            sfm.adjusted_energy_revenue = float(sfm.total_energy_revenue or 0) + total_diff
            sfm.price_adjustment_total = total_diff
            sfm.updated_by = user_id

        await db.flush()
        return {"adjusted": len(orders), "total_kwh": total_kwh, "total_diff": round(total_diff, 2)}


fleet_billing_service = FleetBillingService()
