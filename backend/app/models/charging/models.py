from sqlalchemy import Boolean, Date, DateTime, Numeric, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TenantBase


class ChargingStation(TenantBase):
    __tablename__ = "charging_stations"
    station_code: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    province: Mapped[str | None] = mapped_column(String(20))
    city: Mapped[str | None] = mapped_column(String(20))
    district: Mapped[str | None] = mapped_column(String(20))
    address: Mapped[str | None] = mapped_column(Text)
    longitude: Mapped[float | None] = mapped_column(Numeric(10, 7))
    latitude: Mapped[float | None] = mapped_column(Numeric(10, 7))
    station_type: Mapped[str] = mapped_column(String(20), default="public")
    status: Mapped[str] = mapped_column(String(20), default="planning")
    total_parking: Mapped[int | None] = mapped_column(SmallInteger)
    construction_cost: Mapped[float | None] = mapped_column(Numeric(18, 2))
    operation_start_date: Mapped[str | None] = mapped_column(Date)
    landlord: Mapped[str | None] = mapped_column(String(100))
    lease_start: Mapped[str | None] = mapped_column(Date)
    lease_end: Mapped[str | None] = mapped_column(Date)
    monthly_rent: Mapped[float | None] = mapped_column(Numeric(18, 2))
    power_capacity: Mapped[float | None] = mapped_column(Numeric(10, 2))
    opening_hours: Mapped[str | None] = mapped_column(String(50))
    photos: Mapped[dict | None] = mapped_column(JSONB)
    facilities: Mapped[dict | None] = mapped_column(JSONB)
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    electricity_payee: Mapped[str | None] = mapped_column(String(200))
    canonical_name: Mapped[str | None] = mapped_column(String(100))


class ChargingDevice(TenantBase):
    __tablename__ = "charging_devices"
    station_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    device_code: Mapped[str] = mapped_column(String(30), nullable=False)
    manufacturer: Mapped[str | None] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(100))
    device_type: Mapped[str] = mapped_column(String(20), default="dc_fast")
    rated_power: Mapped[float | None] = mapped_column(Numeric(8, 2))
    gun_count: Mapped[int] = mapped_column(SmallInteger, default=1)
    status: Mapped[str] = mapped_column(String(20), default="offline")
    install_date: Mapped[str | None] = mapped_column(Date)
    total_charging_kwh: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    total_charging_count: Mapped[int] = mapped_column(SmallInteger, default=0)
    daily_revenue: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    last_online_at: Mapped[str | None] = mapped_column(DateTime)
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))


class ChargingOrder(TenantBase):
    __tablename__ = "charging_orders"
    order_no: Mapped[str] = mapped_column(String(30), nullable=False)
    station_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), index=True)
    device_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    gun_index: Mapped[int] = mapped_column(SmallInteger, default=1)
    user_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    charging_kwh: Mapped[float | None] = mapped_column(Numeric(10, 2))
    energy_price: Mapped[float | None] = mapped_column(Numeric(8, 4))
    service_price: Mapped[float | None] = mapped_column(Numeric(8, 4))
    total_amount: Mapped[float | None] = mapped_column(Numeric(10, 2))
    pay_amount: Mapped[float | None] = mapped_column(Numeric(10, 2))
    pay_method: Mapped[str | None] = mapped_column(String(50))
    pay_status: Mapped[str] = mapped_column(String(20), default="unpaid")
    status: Mapped[str] = mapped_column(String(20), default="charging")
    order_type: Mapped[str | None] = mapped_column(String(20))
    business_order_no: Mapped[str | None] = mapped_column(String(50))
    station_name: Mapped[str | None] = mapped_column(String(200))
    channel: Mapped[str | None] = mapped_column(String(50))
    gun_code: Mapped[str | None] = mapped_column(String(30))
    device_type: Mapped[str | None] = mapped_column(String(20))
    user_code: Mapped[str | None] = mapped_column(String(100))
    enterprise_name: Mapped[str | None] = mapped_column(String(200))
    plate_number: Mapped[str | None] = mapped_column(String(30))
    vin: Mapped[str | None] = mapped_column(String(50))
    start_time: Mapped[str | None] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[str | None] = mapped_column(DateTime(timezone=True))
    duration_minutes: Mapped[int | None] = mapped_column(SmallInteger)
    original_amount: Mapped[float | None] = mapped_column(Numeric(10, 2))
    energy_cost: Mapped[float | None] = mapped_column(Numeric(10, 2))
    service_cost: Mapped[float | None] = mapped_column(Numeric(10, 2))
    discount_amount: Mapped[float | None] = mapped_column(Numeric(10, 2))
    source_order_no: Mapped[str | None] = mapped_column(String(50), index=True)
    start_soc: Mapped[int | None] = mapped_column(SmallInteger)
    end_soc: Mapped[int | None] = mapped_column(SmallInteger)
    stop_reason: Mapped[str | None] = mapped_column(String(50))
    start_mode: Mapped[str | None] = mapped_column(String(30))
    peak_kwh: Mapped[float | None] = mapped_column(Numeric(10, 2))
    peak_cost: Mapped[float | None] = mapped_column(Numeric(10, 2))
    flat_kwh: Mapped[float | None] = mapped_column(Numeric(10, 2))
    flat_cost: Mapped[float | None] = mapped_column(Numeric(10, 2))
    valley_kwh: Mapped[float | None] = mapped_column(Numeric(10, 2))
    valley_cost: Mapped[float | None] = mapped_column(Numeric(10, 2))
    sharp_kwh: Mapped[float | None] = mapped_column(Numeric(10, 2))
    sharp_cost: Mapped[float | None] = mapped_column(Numeric(10, 2))
    extra_data: Mapped[dict | None] = mapped_column(JSONB)
    fleet_customer_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    adjusted_unit_price: Mapped[float | None] = mapped_column(Numeric(10, 4))
    adjusted_total: Mapped[float | None] = mapped_column(Numeric(10, 2))
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))


class ChargingMember(TenantBase):
    __tablename__ = "charging_members"
    member_no: Mapped[str] = mapped_column(String(20), nullable=False)
    nickname: Mapped[str | None] = mapped_column(String(50))
    phone: Mapped[str | None] = mapped_column(String(255))
    member_level: Mapped[str] = mapped_column(String(20), default="normal")
    balance: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    points: Mapped[int] = mapped_column(SmallInteger, default=0)
    total_charged_kwh: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    total_orders: Mapped[int] = mapped_column(SmallInteger, default=0)
    status: Mapped[str] = mapped_column(String(20), default="active")


class Partnership(TenantBase):
    __tablename__ = "partnerships"
    partner_name: Mapped[str] = mapped_column(String(100), nullable=False)
    partner_type: Mapped[str] = mapped_column(String(20), nullable=False)
    cooperation_type: Mapped[str] = mapped_column(String(30), nullable=False)
    contact_person: Mapped[str | None] = mapped_column(String(50))
    contact_phone: Mapped[str | None] = mapped_column(String(20))
    contract_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    start_date: Mapped[str | None] = mapped_column(Date)
    end_date: Mapped[str | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="negotiating")
    remark: Mapped[str | None] = mapped_column(Text)
    detail_config: Mapped[dict | None] = mapped_column(JSONB)


class RevenueSharePlan(TenantBase):
    __tablename__ = "revenue_share_plans"
    partnership_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    station_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    period: Mapped[str] = mapped_column(String(7), nullable=False)
    total_revenue: Mapped[float | None] = mapped_column(Numeric(18, 2))
    our_share_ratio: Mapped[float | None] = mapped_column(Numeric(5, 2))
    our_share_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    partner_share_ratio: Mapped[float | None] = mapped_column(Numeric(5, 2))
    partner_share_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    deduct_electricity: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    deduct_rent: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    deduct_maintenance: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    net_share_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    payment_due_date: Mapped[str | None] = mapped_column(Date)
    payment_status: Mapped[str] = mapped_column(String(20), default="pending")
    voucher_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    remark: Mapped[str | None] = mapped_column(Text)


class FleetCustomer(TenantBase):
    __tablename__ = "fleet_customers"
    fleet_name: Mapped[str] = mapped_column(String(100), nullable=False)
    fleet_code: Mapped[str] = mapped_column(String(20), nullable=False)
    contact_person: Mapped[str | None] = mapped_column(String(50))
    contact_phone: Mapped[str | None] = mapped_column(String(20))
    fleet_size: Mapped[int | None] = mapped_column(SmallInteger)
    plate_numbers: Mapped[dict | None] = mapped_column(JSONB)
    credit_limit: Mapped[float | None] = mapped_column(Numeric(18, 2))
    balance: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    total_charged_kwh: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    total_payment: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    status: Mapped[str] = mapped_column(String(20), default="active")
    remark: Mapped[str | None] = mapped_column(Text)
    billing_type: Mapped[str] = mapped_column(String(20), default="prepay")
    service_fee_type: Mapped[str] = mapped_column(String(20), default="per_kwh")
    service_fee_rate: Mapped[float | None] = mapped_column(Numeric(10, 4), default=0)
    virtual_balance: Mapped[float] = mapped_column(Numeric(12, 2), default=0)


class FleetRechargeRecord(TenantBase):
    __tablename__ = "fleet_recharge_records"
    fleet_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    recharge_no: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    bonus_amount: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    payment_method: Mapped[str | None] = mapped_column(String(20))
    payment_proof: Mapped[dict | None] = mapped_column(JSONB)
    balance_before: Mapped[float | None] = mapped_column(Numeric(12, 2))
    balance_after: Mapped[float | None] = mapped_column(Numeric(12, 2))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    confirmed_by: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    remark: Mapped[str | None] = mapped_column(Text)


class FleetPaymentBill(TenantBase):
    __tablename__ = "fleet_payment_bills"
    fleet_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    bill_no: Mapped[str] = mapped_column(String(20), nullable=False)
    period: Mapped[str] = mapped_column(String(7), nullable=False)
    total_orders: Mapped[int] = mapped_column(SmallInteger, default=0)
    total_kwh: Mapped[float | None] = mapped_column(Numeric(12, 2))
    total_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    net_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    deducted_from_balance: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    actual_pay_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    payment_due_date: Mapped[str | None] = mapped_column(Date)
    payment_status: Mapped[str] = mapped_column(String(20), default="unpaid")
    remark: Mapped[str | None] = mapped_column(Text)
    energy_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    service_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    adjusted_energy_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    price_adjustment: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    station_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    billing_type: Mapped[str] = mapped_column(String(20), default="monthly")
    peak_kwh: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    flat_kwh: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    valley_kwh: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    sharp_kwh: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    peak_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    flat_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    valley_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    sharp_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    avg_energy_price: Mapped[float] = mapped_column(Numeric(8, 4), default=0)
    avg_service_price: Mapped[float] = mapped_column(Numeric(8, 4), default=0)
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))


class FleetInvoiceRequest(TenantBase):
    __tablename__ = "fleet_invoice_requests"
    fleet_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    request_no: Mapped[str] = mapped_column(String(20), nullable=False)
    invoice_type: Mapped[str] = mapped_column(String(20), nullable=False)
    invoice_title: Mapped[str] = mapped_column(String(200), nullable=False)
    tax_no: Mapped[str | None] = mapped_column(String(18))
    bank_name: Mapped[str | None] = mapped_column(String(100))
    bank_account: Mapped[str | None] = mapped_column(String(50))
    amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    invoice_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    remark: Mapped[str | None] = mapped_column(Text)


class TargetCustomer(TenantBase):
    __tablename__ = "target_customers"
    customer_name: Mapped[str] = mapped_column(String(100), nullable=False)
    customer_type: Mapped[str] = mapped_column(String(20), nullable=False)
    source: Mapped[str | None] = mapped_column(String(20))
    contact_person: Mapped[str | None] = mapped_column(String(50))
    contact_phone: Mapped[str | None] = mapped_column(String(20))
    estimated_fleet_size: Mapped[int | None] = mapped_column(SmallInteger)
    estimated_monthly_kwh: Mapped[float | None] = mapped_column(Numeric(10, 2))
    estimated_monthly_revenue: Mapped[float | None] = mapped_column(Numeric(18, 2))
    nearby_station_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    follow_up_records: Mapped[dict | None] = mapped_column(JSONB)
    current_stage: Mapped[str] = mapped_column(String(20), default="initial")
    win_probability: Mapped[int] = mapped_column(SmallInteger, default=0)
    assigned_to: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    status: Mapped[str] = mapped_column(String(20), default="active")
    remark: Mapped[str | None] = mapped_column(Text)


class MonthlyTaskList(TenantBase):
    __tablename__ = "monthly_task_lists"
    month: Mapped[str] = mapped_column(String(7), nullable=False)
    task_type: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    assignee_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    station_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    priority: Mapped[int] = mapped_column(SmallInteger, default=2)
    planned_start: Mapped[str | None] = mapped_column(Date)
    planned_end: Mapped[str | None] = mapped_column(Date)
    actual_start: Mapped[str | None] = mapped_column(Date)
    actual_end: Mapped[str | None] = mapped_column(Date)
    completion_rate: Mapped[int] = mapped_column(SmallInteger, default=0)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    deliverables: Mapped[dict | None] = mapped_column(JSONB)
    remark: Mapped[str | None] = mapped_column(Text)


class StationFinancialMonthly(TenantBase):
    __tablename__ = "station_financial_monthly"
    station_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    month: Mapped[str] = mapped_column(String(7), nullable=False)
    total_orders: Mapped[int] = mapped_column(SmallInteger, default=0)
    total_kwh: Mapped[float | None] = mapped_column(Numeric(12, 2))
    total_energy_revenue: Mapped[float | None] = mapped_column(Numeric(18, 2))
    total_service_revenue: Mapped[float | None] = mapped_column(Numeric(18, 2))
    total_revenue: Mapped[float | None] = mapped_column(Numeric(18, 2))
    electricity_cost: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    rent_cost: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    depreciation: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    maintenance_cost: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    labor_cost: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    total_cost: Mapped[float | None] = mapped_column(Numeric(18, 2))
    gross_profit: Mapped[float | None] = mapped_column(Numeric(18, 2))
    gross_margin: Mapped[float | None] = mapped_column(Numeric(5, 2))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    adjusted_energy_revenue: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    price_adjustment_total: Mapped[float] = mapped_column(Numeric(18, 2), default=0)


class PartnershipGacDetail(TenantBase):
    __tablename__ = "partnership_gac_details"
    partnership_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    cooperation_mode: Mapped[str] = mapped_column(String(30), default="self_build_cooperate")
    revenue_share_ratio: Mapped[float | None] = mapped_column(Numeric(5, 2))
    settlement_cycle: Mapped[str] = mapped_column(String(20), default="monthly")
    monthly_min_guarantee: Mapped[float | None] = mapped_column(Numeric(18, 2))
    station_count: Mapped[int | None] = mapped_column(SmallInteger)
    total_gun_count: Mapped[int | None] = mapped_column(SmallInteger)
    contract_period_start: Mapped[str | None] = mapped_column(Date)
    contract_period_end: Mapped[str | None] = mapped_column(Date)
    remark: Mapped[str | None] = mapped_column(Text)


class PartnershipNioDetail(TenantBase):
    __tablename__ = "partnership_nio_details"
    partnership_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    cooperation_mode: Mapped[str] = mapped_column(String(30), default="joint_charge")
    nio_power_integration: Mapped[bool] = mapped_column(Boolean, default=False)
    revenue_share_ratio: Mapped[float | None] = mapped_column(Numeric(5, 2))
    settlement_cycle: Mapped[str] = mapped_column(String(20), default="monthly")
    monthly_min_guarantee: Mapped[float | None] = mapped_column(Numeric(18, 2))
    station_count: Mapped[int | None] = mapped_column(SmallInteger)
    total_gun_count: Mapped[int | None] = mapped_column(SmallInteger)
    contract_period_start: Mapped[str | None] = mapped_column(Date)
    contract_period_end: Mapped[str | None] = mapped_column(Date)
    remark: Mapped[str | None] = mapped_column(Text)


class ElectricityPayment(TenantBase):
    __tablename__ = "electricity_payments"
    station_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    period: Mapped[str] = mapped_column(String(7), nullable=False)
    meter_reading_start: Mapped[float | None] = mapped_column(Numeric(12, 2))
    meter_reading_end: Mapped[float | None] = mapped_column(Numeric(12, 2))
    total_kwh: Mapped[float | None] = mapped_column(Numeric(12, 2))
    price_segments: Mapped[dict | None] = mapped_column(JSONB)
    total_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    due_date: Mapped[str | None] = mapped_column(Date)
    payment_date: Mapped[str | None] = mapped_column(Date)
    payment_status: Mapped[str] = mapped_column(String(20), default="unpaid")
    voucher_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    project_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    remark: Mapped[str | None] = mapped_column(Text)


class SiteProspect(TenantBase):
    __tablename__ = "site_prospects"
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    province: Mapped[str | None] = mapped_column(String(20))
    city: Mapped[str | None] = mapped_column(String(20))
    district: Mapped[str | None] = mapped_column(String(20))
    address: Mapped[str | None] = mapped_column(Text)
    longitude: Mapped[float | None] = mapped_column(Numeric(10, 7))
    latitude: Mapped[float | None] = mapped_column(Numeric(10, 7))
    area_size: Mapped[float | None] = mapped_column(Numeric(10, 2))
    land_type: Mapped[str | None] = mapped_column(String(30))
    owner_name: Mapped[str | None] = mapped_column(String(100))
    owner_phone: Mapped[str | None] = mapped_column(String(20))
    owner_company: Mapped[str | None] = mapped_column(String(200))
    expected_rent: Mapped[float | None] = mapped_column(Numeric(18, 2))
    lease_term_months: Mapped[int | None] = mapped_column(SmallInteger)
    traffic_flow_score: Mapped[int | None] = mapped_column(SmallInteger)
    parking_demand_score: Mapped[int | None] = mapped_column(SmallInteger)
    competition_score: Mapped[int | None] = mapped_column(SmallInteger)
    power_supply_score: Mapped[int | None] = mapped_column(SmallInteger)
    overall_score: Mapped[int | None] = mapped_column(SmallInteger)
    nearby_facilities: Mapped[dict | None] = mapped_column(JSONB)
    estimated_investment: Mapped[float | None] = mapped_column(Numeric(18, 2))
    estimated_monthly_revenue: Mapped[float | None] = mapped_column(Numeric(18, 2))
    estimated_roi_months: Mapped[int | None] = mapped_column(SmallInteger)
    status: Mapped[str] = mapped_column(String(20), default="initial")
    assigned_to: Mapped[str | None] = mapped_column(UUID(as_uuid=True))
    follow_up_records: Mapped[dict | None] = mapped_column(JSONB)
    photos: Mapped[dict | None] = mapped_column(JSONB)
    remark: Mapped[str | None] = mapped_column(Text)


class SiteVisitRecord(TenantBase):
    __tablename__ = "site_visit_records"
    site_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    visit_date: Mapped[str | None] = mapped_column(Date)
    visitors: Mapped[str | None] = mapped_column(String(200))
    findings: Mapped[str | None] = mapped_column(Text)
    power_condition: Mapped[str | None] = mapped_column(String(20))
    traffic_condition: Mapped[str | None] = mapped_column(String(20))
    competition_nearby: Mapped[str | None] = mapped_column(Text)
    recommendation: Mapped[str | None] = mapped_column(String(20))
    photos: Mapped[dict | None] = mapped_column(JSONB)
    next_action: Mapped[str | None] = mapped_column(Text)
    visit_score: Mapped[int | None] = mapped_column(SmallInteger)
