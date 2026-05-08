import time
import uuid
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import generate_no, get_current_user, get_db
from app.models.charging import (
    ChargingDevice, ChargingMember, ChargingOrder, ChargingStation,
    ElectricityPayment, FleetCustomer, FleetInvoiceRequest, FleetPaymentBill,
    FleetRechargeRecord, MonthlyTaskList, OperationMemo, OperationStrategy,
    Partnership, PartnershipGacDetail, PartnershipNioDetail, RevenueSharePlan,
    SiteProspect, SiteVisitRecord, StationFinancialMonthly, TargetCustomer,
)
from app.models.organization import User
from app.services.charging_order_import import ChargingOrderImportService
from app.core.cache import cached, invalidate_cache

router = APIRouter(prefix="/charging", tags=["充电站运营"])


class StationCreate(BaseModel):
    station_code: str = Field(..., max_length=30)
    name: str = Field(..., max_length=100)
    station_type: str = "public"
    project_id: str | None = None
    province: str | None = None
    city: str | None = None
    district: str | None = None
    address: str | None = None
    longitude: float | None = None
    latitude: float | None = None
    total_parking: int | None = None
    construction_cost: float | None = None
    operation_start_date: date | None = None
    landlord: str | None = None
    lease_start: date | None = None
    lease_end: date | None = None
    monthly_rent: float | None = None
    power_capacity: float | None = None
    opening_hours: str | None = None
    photos: dict | None = None
    facilities: dict | None = None
    electricity_payee: str | None = None
    status: str = "planning"


class StationUpdate(BaseModel):
    name: str | None = None
    station_type: str | None = None
    project_id: str | None = None
    province: str | None = None
    city: str | None = None
    district: str | None = None
    address: str | None = None
    longitude: float | None = None
    latitude: float | None = None
    status: str | None = None
    total_parking: int | None = None
    landlord: str | None = None
    monthly_rent: float | None = None
    power_capacity: float | None = None
    opening_hours: str | None = None
    electricity_payee: str | None = None
    canonical_name: str | None = None


class StationOut(BaseModel):
    id: uuid.UUID
    station_code: str
    name: str
    station_type: str
    status: str
    province: str | None
    city: str | None
    district: str | None
    address: str | None
    project_id: uuid.UUID | None = None
    electricity_payee: str | None = None
    canonical_name: str | None = None
    model_config = {"from_attributes": True}


@router.get("/stations")
@cached(ttl=300, prefix="charging")
async def list_stations(
    status: str | None = None,
    keyword: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ChargingStation).where(ChargingStation.is_deleted == False, ChargingStation.company_id == current_user.company_id)
    if status:
        query = query.where(ChargingStation.status == status)
    if keyword:
        query = query.where((ChargingStation.name.ilike(f"%{keyword}%")) | (ChargingStation.station_code.ilike(f"%{keyword}%")))
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(ChargingStation.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/stations", response_model=StationOut)
async def create_station(body: StationCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    station = ChargingStation(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(station)
    await db.flush()
    await db.refresh(station)
    invalidate_cache("charging")
    return station


@router.post("/stations/auto-from-orders")
async def auto_create_stations_from_orders(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Find unique station_name values in orders that have no station_id match,
    and return them for review. Does NOT auto-create - returns suggestions."""
    # Get distinct station_names from orders without station_id
    unmatched_names = (await db.execute(
        select(ChargingOrder.station_name).where(
            ChargingOrder.is_deleted == False,
            ChargingOrder.company_id == current_user.company_id,
            ChargingOrder.station_name != None,
            ChargingOrder.station_name != "",
        ).distinct()
    )).scalars().all()

    # Get existing station names
    existing_stations = (await db.execute(
        select(ChargingStation.name, ChargingStation.id, ChargingStation.station_code).where(
            ChargingStation.is_deleted == False,
            ChargingStation.company_id == current_user.company_id,
        )
    )).all()
    existing_names = {r.name.strip(): {"id": str(r.id), "code": r.station_code} for r in existing_stations}

    suggestions = []
    for name in unmatched_names:
        if not name or not name.strip():
            continue
        clean_name = name.strip()

        # Exact match
        if clean_name in existing_names:
            continue

        # Check for similar names (substring match)
        similar = []
        for ename, einfo in existing_names.items():
            if clean_name in ename or ename in clean_name:
                similar.append({"id": einfo["id"], "name": ename, "code": einfo["code"]})

        # Count orders for this name
        order_count = (await db.execute(
            select(func.count()).select_from(
                select(ChargingOrder.id).where(
                    ChargingOrder.station_name == name,
                    ChargingOrder.is_deleted == False,
                    ChargingOrder.company_id == current_user.company_id,
                ).subquery()
            )
        )).scalar()

        suggestions.append({
            "station_name": clean_name,
            "order_count": order_count,
            "similar_stations": similar,
            "action": "create",  # default action: create new
        })

    suggestions.sort(key=lambda x: x["order_count"], reverse=True)
    return {"suggestions": suggestions}


@router.post("/stations/confirm-auto-create")
async def confirm_auto_create_stations(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Execute the confirmed auto-create / merge actions.
    Body: { actions: [{ station_name: str, action: "create"|"merge", merge_to_id?: str }] }
    """
    actions = body.get("actions", [])
    existing_stations = (await db.execute(
        select(ChargingStation.name, ChargingStation.id).where(
            ChargingStation.is_deleted == False,
            ChargingStation.company_id == current_user.company_id,
        )
    )).all()
    existing_name_map = {r.name.strip(): str(r.id) for r in existing_stations}

    created = 0
    merged = 0
    linked_orders = 0

    for act in actions:
        station_name = act.get("station_name", "").strip()
        action = act.get("action", "create")
        if not station_name:
            continue

        if action == "merge":
            merge_to_id = act.get("merge_to_id")
            if not merge_to_id:
                continue
            # Link all orders with this station_name to the target station
            result = await db.execute(
                update(ChargingOrder).where(
                    ChargingOrder.station_name == station_name,
                    ChargingOrder.is_deleted == False,
                    ChargingOrder.company_id == current_user.company_id,
                ).values(station_id=merge_to_id)
            )
            linked_orders += result.rowcount
            merged += 1

        elif action == "create":
            code = generate_no("STN")
            station = ChargingStation(
                station_code=code,
                name=station_name,
                status="operating",
                company_id=current_user.company_id,
                created_by=current_user.id,
            )
            db.add(station)
            await db.flush()
            # Link all orders with this station_name to the new station
            result = await db.execute(
                update(ChargingOrder).where(
                    ChargingOrder.station_name == station_name,
                    ChargingOrder.is_deleted == False,
                    ChargingOrder.company_id == current_user.company_id,
                ).values(station_id=station.id)
            )
            linked_orders += result.rowcount
            created += 1

    return {"created": created, "merged": merged, "linked_orders": linked_orders}


@router.get("/stations/{station_id}", response_model=StationOut)
async def get_station(station_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChargingStation).where(ChargingStation.id == station_id, ChargingStation.is_deleted == False, ChargingStation.company_id == current_user.company_id))
    station = result.scalar_one_or_none()
    if not station:
        raise HTTPException(status_code=404, detail="站点不存在")
    return station


@router.put("/stations/{station_id}", response_model=StationOut)
async def update_station(station_id: str, body: StationUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChargingStation).where(ChargingStation.id == station_id, ChargingStation.is_deleted == False, ChargingStation.company_id == current_user.company_id))
    station = result.scalar_one_or_none()
    if not station:
        raise HTTPException(status_code=404, detail="站点不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(station, k, v)
    station.updated_by = current_user.id
    await db.flush()
    await db.refresh(station)
    return station


@router.delete("/stations/{station_id}")
async def delete_station(station_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChargingStation).where(
            ChargingStation.id == station_id,
            ChargingStation.is_deleted == False,
            ChargingStation.company_id == current_user.company_id,
        )
    )
    station = result.scalar_one_or_none()
    if not station:
        raise HTTPException(status_code=404, detail="充电站不存在")

    station.is_deleted = True
    station.updated_by = current_user.id

    cid = current_user.company_id
    cascade_models = [
        ChargingDevice, ChargingOrder, ChargingMember,
        StationFinancialMonthly, ElectricityPayment,
    ]
    for model in cascade_models:
        if not hasattr(model, 'station_id'):
            continue
        await db.execute(
            update(model).where(
                model.station_id == station_id,
                model.is_deleted == False,
                model.company_id == cid,
            ).values(is_deleted=True)
        )

    await db.flush()
    return {"message": "删除成功"}


class DeviceCreate(BaseModel):
    station_id: str
    device_code: str = Field(..., max_length=30)
    manufacturer: str | None = None
    model: str | None = None
    device_type: str = "dc_fast"
    rated_power: float | None = None
    gun_count: int = 1
    install_date: date | None = None
    project_id: str | None = None


class DeviceUpdate(BaseModel):
    manufacturer: str | None = None
    model: str | None = None
    device_type: str | None = None
    rated_power: float | None = None
    gun_count: int | None = None
    status: str | None = None
    install_date: date | None = None


class DeviceOut(BaseModel):
    id: uuid.UUID
    station_id: uuid.UUID
    device_code: str
    device_type: str
    rated_power: float | None
    gun_count: int
    status: str
    project_id: uuid.UUID | None = None
    model_config = {"from_attributes": True}
    model_config = {"from_attributes": True}


@router.get("/devices")
@cached(ttl=300, prefix="charging")
async def list_devices(
    station_id: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ChargingDevice).where(ChargingDevice.is_deleted == False, ChargingDevice.company_id == current_user.company_id)
    if station_id:
        query = query.where(ChargingDevice.station_id == station_id)
    if status:
        query = query.where(ChargingDevice.status == status)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(ChargingDevice.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/devices", response_model=DeviceOut)
async def create_device(body: DeviceCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    device = ChargingDevice(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(device)
    await db.flush()
    await db.refresh(device)
    return device


@router.get("/devices/{device_id}", response_model=DeviceOut)
async def get_device(device_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChargingDevice).where(ChargingDevice.id == device_id, ChargingDevice.is_deleted == False, ChargingDevice.company_id == current_user.company_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="设备不存在")
    return device


@router.put("/devices/{device_id}", response_model=DeviceOut)
async def update_device(device_id: str, body: DeviceUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChargingDevice).where(ChargingDevice.id == device_id, ChargingDevice.is_deleted == False, ChargingDevice.company_id == current_user.company_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="设备不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(device, k, v)
    device.updated_by = current_user.id
    await db.flush()
    await db.refresh(device)
    return device


@router.delete("/devices/{device_id}")
async def delete_device(device_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(ChargingDevice).where(ChargingDevice.id == device_id, ChargingDevice.company_id == current_user.company_id).values(is_deleted=True))
    return {"message": "删除成功"}


class OrderCreate(BaseModel):
    station_id: str | None = None
    device_id: str | None = None
    gun_index: int = 1
    user_id: str | None = None
    charging_kwh: float | None = None
    energy_price: float | None = None
    service_price: float | None = None
    total_amount: float | None = None
    pay_amount: float | None = None
    pay_method: str | None = None
    order_type: str | None = None
    business_order_no: str | None = None
    station_name: str | None = None
    channel: str | None = None
    gun_code: str | None = None
    device_type: str | None = None
    user_code: str | None = None
    enterprise_name: str | None = None
    plate_number: str | None = None
    vin: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    duration_minutes: int | None = None
    original_amount: float | None = None
    energy_cost: float | None = None
    service_cost: float | None = None
    discount_amount: float | None = None
    source_order_no: str | None = None
    pay_status: str = "unpaid"
    status: str = "completed"


class OrderUpdate(BaseModel):
    pay_status: str | None = None
    status: str | None = None


class OrderOut(BaseModel):
    id: uuid.UUID
    order_no: str
    station_id: uuid.UUID | None
    station_name: str | None = None
    device_id: uuid.UUID | None
    charging_kwh: float | None
    energy_cost: float | None
    service_cost: float | None
    total_amount: float | None
    pay_amount: float | None
    pay_status: str
    status: str
    plate_number: str | None = None
    start_time: Any = None
    model_config = {"from_attributes": True}


@router.get("/orders")
@cached(ttl=300, prefix="charging")
async def list_orders(
    station_id: str | None = None,
    project_id: str | None = None,
    status: str | None = None,
    pay_status: str | None = None,
    order_type: str | None = None,
    pay_method: str | None = None,
    channel: str | None = None,
    device_type: str | None = None,
    keyword: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    sort_by: str | None = None,
    sort_order: str = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ChargingOrder).where(ChargingOrder.is_deleted == False, ChargingOrder.company_id == current_user.company_id)
    if station_id:
        query = query.where(ChargingOrder.station_id == station_id)
    if project_id:
        query = query.where(ChargingOrder.project_id == project_id)
    if status:
        query = query.where(ChargingOrder.status == status)
    if pay_status:
        query = query.where(ChargingOrder.pay_status == pay_status)
    if order_type:
        query = query.where(ChargingOrder.order_type == order_type)
    if pay_method:
        query = query.where(ChargingOrder.pay_method == pay_method)
    if channel:
        query = query.where(ChargingOrder.channel == channel)
    if device_type:
        query = query.where(ChargingOrder.device_type == device_type)
    if keyword:
        kw = f"%{keyword}%"
        query = query.where(
            (ChargingOrder.order_no.ilike(kw))
            | (ChargingOrder.plate_number.ilike(kw))
            | (ChargingOrder.enterprise_name.ilike(kw))
            | (ChargingOrder.station_name.ilike(kw))
            | (ChargingOrder.user_code.ilike(kw))
        )
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()

    SORTABLE = {
        "order_no": ChargingOrder.order_no,
        "start_time": ChargingOrder.start_time,
        "end_time": ChargingOrder.end_time,
        "charging_kwh": ChargingOrder.charging_kwh,
        "energy_price": ChargingOrder.energy_price,
        "service_price": ChargingOrder.service_price,
        "energy_cost": ChargingOrder.energy_cost,
        "service_cost": ChargingOrder.service_cost,
        "total_amount": ChargingOrder.total_amount,
        "pay_amount": ChargingOrder.pay_amount,
        "original_amount": ChargingOrder.original_amount,
        "discount_amount": ChargingOrder.discount_amount,
        "duration_minutes": ChargingOrder.duration_minutes,
        "pay_status": ChargingOrder.pay_status,
        "status": ChargingOrder.status,
        "created_at": ChargingOrder.created_at,
        "peak_kwh": ChargingOrder.peak_kwh,
        "flat_kwh": ChargingOrder.flat_kwh,
        "valley_kwh": ChargingOrder.valley_kwh,
        "sharp_kwh": ChargingOrder.sharp_kwh,
        "peak_cost": ChargingOrder.peak_cost,
        "flat_cost": ChargingOrder.flat_cost,
        "valley_cost": ChargingOrder.valley_cost,
        "sharp_cost": ChargingOrder.sharp_cost,
        "start_soc": ChargingOrder.start_soc,
        "end_soc": ChargingOrder.end_soc,
        "station_name": ChargingOrder.station_name,
        "plate_number": ChargingOrder.plate_number,
        "enterprise_name": ChargingOrder.enterprise_name,
        "pay_method": ChargingOrder.pay_method,
        "order_type": ChargingOrder.order_type,
        "channel": ChargingOrder.channel,
        "device_type": ChargingOrder.device_type,
    }
    sort_col = SORTABLE.get(sort_by, ChargingOrder.created_at)
    query = query.order_by(sort_col.desc() if sort_order == "desc" else sort_col.asc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    orders = result.scalars().all()

    station_ids = {str(o.station_id) for o in orders if o.station_id}
    canonical_map = {}
    if station_ids:
        rows = (await db.execute(
            select(ChargingStation.id, ChargingStation.name, ChargingStation.canonical_name).where(
                ChargingStation.id.in_(station_ids), ChargingStation.is_deleted == False
            )
        )).all()
        for r in rows:
            canonical_map[str(r.id)] = r.canonical_name or r.name

    items = []
    for o in orders:
        d = {c.name: getattr(o, c.name) for c in o.__table__.columns}
        d["canonical_station_name"] = canonical_map.get(str(o.station_id), o.station_name or "-")
        items.append(d)

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/orders", response_model=OrderOut)
async def create_order(body: OrderCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from datetime import datetime as dt
    dump = body.model_dump()
    for field in ("start_time", "end_time"):
        v = dump.get(field)
        if v and isinstance(v, str):
            try:
                dump[field] = dt.fromisoformat(v)
            except (ValueError, TypeError):
                pass
    dump.pop("project_id", None)
    order = ChargingOrder(**dump, order_no=generate_no("CO"), company_id=current_user.company_id, created_by=current_user.id)
    db.add(order)
    await db.flush()
    await db.refresh(order)
    return order


@router.get("/orders/{order_id}", response_model=OrderOut)
async def get_order(order_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChargingOrder).where(ChargingOrder.id == order_id, ChargingOrder.is_deleted == False, ChargingOrder.company_id == current_user.company_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    return order


@router.put("/orders/{order_id}", response_model=OrderOut)
async def update_order(order_id: str, body: OrderUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChargingOrder).where(ChargingOrder.id == order_id, ChargingOrder.is_deleted == False))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(order, k, v)
    order.updated_by = current_user.id
    await db.flush()
    await db.refresh(order)
    return order


class MemberCreate(BaseModel):
    member_no: str
    nickname: str | None = None
    phone: str | None = None
    member_level: str = "normal"


class MemberUpdate(BaseModel):
    nickname: str | None = None
    phone: str | None = None
    member_level: str | None = None
    status: str | None = None


class MemberOut(BaseModel):
    id: uuid.UUID
    member_no: str
    nickname: str | None
    phone: str | None
    member_level: str
    balance: float
    status: str
    model_config = {"from_attributes": True}


@router.get("/members")
@cached(ttl=300, prefix="charging")
async def list_members(
    keyword: str | None = None,
    member_level: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ChargingMember).where(ChargingMember.is_deleted == False, ChargingMember.company_id == current_user.company_id)
    if keyword:
        query = query.where((ChargingMember.nickname.ilike(f"%{keyword}%")) | (ChargingMember.phone.ilike(f"%{keyword}%")) | (ChargingMember.member_no.ilike(f"%{keyword}%")))
    if member_level:
        query = query.where(ChargingMember.member_level == member_level)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(ChargingMember.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/members", response_model=MemberOut)
async def create_member(body: MemberCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    member = ChargingMember(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(member)
    await db.flush()
    await db.refresh(member)
    return member


@router.get("/members/{member_id}", response_model=MemberOut)
async def get_member(member_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChargingMember).where(ChargingMember.id == member_id, ChargingMember.is_deleted == False))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="会员不存在")
    return member


@router.put("/members/{member_id}", response_model=MemberOut)
async def update_member(member_id: str, body: MemberUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChargingMember).where(ChargingMember.id == member_id, ChargingMember.is_deleted == False))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="会员不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(member, k, v)
    member.updated_by = current_user.id
    await db.flush()
    await db.refresh(member)
    return member


class PartnershipCreate(BaseModel):
    partner_name: str
    partner_type: str
    cooperation_type: str
    contact_person: str | None = None
    contact_phone: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    remark: str | None = None


class PartnershipUpdate(BaseModel):
    partner_name: str | None = None
    cooperation_type: str | None = None
    contact_person: str | None = None
    contact_phone: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: str | None = None
    remark: str | None = None


class PartnershipOut(BaseModel):
    id: uuid.UUID
    partner_name: str
    partner_type: str
    cooperation_type: str
    contact_person: str | None
    status: str
    model_config = {"from_attributes": True}


@router.get("/partnerships")
@cached(ttl=300, prefix="charging")
async def list_partnerships(
    partner_type: str | None = None,
    keyword: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Partnership).where(Partnership.is_deleted == False, Partnership.company_id == current_user.company_id)
    if partner_type:
        query = query.where(Partnership.partner_type == partner_type)
    if keyword:
        query = query.where(Partnership.partner_name.ilike(f"%{keyword}%"))
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(Partnership.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/partnerships", response_model=PartnershipOut)
async def create_partnership(body: PartnershipCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = Partnership(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(p)
    await db.flush()
    await db.refresh(p)
    return p


@router.get("/partnerships/{p_id}", response_model=PartnershipOut)
async def get_partnership(p_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Partnership).where(Partnership.id == p_id, Partnership.is_deleted == False))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="合作方不存在")
    return p


@router.put("/partnerships/{p_id}", response_model=PartnershipOut)
async def update_partnership(p_id: str, body: PartnershipUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Partnership).where(Partnership.id == p_id, Partnership.is_deleted == False))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="合作方不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    p.updated_by = current_user.id
    await db.flush()
    await db.refresh(p)
    return p


@router.delete("/partnerships/{p_id}")
async def delete_partnership(p_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(Partnership).where(Partnership.id == p_id).values(is_deleted=True))
    return {"message": "删除成功"}


class GacDetailCreate(BaseModel):
    partnership_id: str
    cooperation_mode: str = "self_build_cooperate"
    revenue_share_ratio: float | None = None
    settlement_cycle: str = "monthly"
    monthly_min_guarantee: float | None = None
    station_count: int | None = None
    total_gun_count: int | None = None
    contract_period_start: date | None = None
    contract_period_end: date | None = None
    remark: str | None = None


class GacDetailOut(BaseModel):
    id: uuid.UUID
    partnership_id: uuid.UUID
    cooperation_mode: str
    revenue_share_ratio: float | None
    settlement_cycle: str
    monthly_min_guarantee: float | None
    model_config = {"from_attributes": True}


@router.post("/partnerships/gac", response_model=GacDetailOut)
async def create_gac_detail(body: GacDetailCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    d = PartnershipGacDetail(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(d)
    await db.flush()
    await db.refresh(d)
    return d


@router.get("/partnerships/{p_id}/gac", response_model=GacDetailOut)
async def get_gac_detail(p_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PartnershipGacDetail).where(PartnershipGacDetail.partnership_id == p_id, PartnershipGacDetail.is_deleted == False))
    d = result.scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="广汽详情不存在")
    return d


@router.put("/partnerships/gac/{detail_id}", response_model=GacDetailOut)
async def update_gac_detail(detail_id: str, body: GacDetailCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PartnershipGacDetail).where(PartnershipGacDetail.id == detail_id, PartnershipGacDetail.is_deleted == False))
    d = result.scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(d, k, v)
    d.updated_by = current_user.id
    await db.flush()
    await db.refresh(d)
    return d


class NioDetailCreate(BaseModel):
    partnership_id: str
    cooperation_mode: str = "joint_charge"
    nio_power_integration: bool = False
    revenue_share_ratio: float | None = None
    settlement_cycle: str = "monthly"
    monthly_min_guarantee: float | None = None
    station_count: int | None = None
    total_gun_count: int | None = None
    contract_period_start: date | None = None
    contract_period_end: date | None = None
    remark: str | None = None


class NioDetailOut(BaseModel):
    id: uuid.UUID
    partnership_id: uuid.UUID
    cooperation_mode: str
    nio_power_integration: bool
    revenue_share_ratio: float | None
    settlement_cycle: str
    model_config = {"from_attributes": True}


@router.post("/partnerships/nio", response_model=NioDetailOut)
async def create_nio_detail(body: NioDetailCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    d = PartnershipNioDetail(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(d)
    await db.flush()
    await db.refresh(d)
    return d


@router.get("/partnerships/{p_id}/nio", response_model=NioDetailOut)
async def get_nio_detail(p_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PartnershipNioDetail).where(PartnershipNioDetail.partnership_id == p_id, PartnershipNioDetail.is_deleted == False))
    d = result.scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="蔚来详情不存在")
    return d


@router.put("/partnerships/nio/{detail_id}", response_model=NioDetailOut)
async def update_nio_detail(detail_id: str, body: NioDetailCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PartnershipNioDetail).where(PartnershipNioDetail.id == detail_id, PartnershipNioDetail.is_deleted == False))
    d = result.scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(d, k, v)
    d.updated_by = current_user.id
    await db.flush()
    await db.refresh(d)
    return d


class RevenueShareCreate(BaseModel):
    partnership_id: str
    station_id: str
    period: str
    total_revenue: float
    our_share_ratio: float
    partner_share_ratio: float
    deduct_electricity: float = 0
    deduct_rent: float = 0
    deduct_maintenance: float = 0


class RevenueShareOut(BaseModel):
    id: uuid.UUID
    partnership_id: uuid.UUID
    station_id: uuid.UUID
    period: str
    total_revenue: float | None
    net_share_amount: float | None
    payment_status: str
    model_config = {"from_attributes": True}


@router.get("/revenue-share-plans")
async def list_revenue_share_plans(
    partnership_id: str | None = None,
    station_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(RevenueSharePlan).where(RevenueSharePlan.is_deleted == False, RevenueSharePlan.company_id == current_user.company_id)
    if partnership_id:
        query = query.where(RevenueSharePlan.partnership_id == partnership_id)
    if station_id:
        query = query.where(RevenueSharePlan.station_id == station_id)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(RevenueSharePlan.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/revenue-share-plans", response_model=RevenueShareOut)
async def create_revenue_share_plan(body: RevenueShareCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    our_amount = body.total_revenue * body.our_share_ratio / 100
    partner_amount = body.total_revenue * body.partner_share_ratio / 100
    net = our_amount - body.deduct_electricity - body.deduct_rent - body.deduct_maintenance
    plan = RevenueSharePlan(
        partnership_id=body.partnership_id, station_id=body.station_id, period=body.period,
        total_revenue=body.total_revenue, our_share_ratio=body.our_share_ratio,
        our_share_amount=our_amount, partner_share_ratio=body.partner_share_ratio,
        partner_share_amount=partner_amount, deduct_electricity=body.deduct_electricity,
        deduct_rent=body.deduct_rent, deduct_maintenance=body.deduct_maintenance,
        net_share_amount=net, company_id=current_user.company_id, created_by=current_user.id,
    )
    db.add(plan)
    await db.flush()
    await db.refresh(plan)
    return plan


@router.get("/revenue-share-plans/{plan_id}", response_model=RevenueShareOut)
async def get_revenue_share_plan(plan_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RevenueSharePlan).where(RevenueSharePlan.id == plan_id, RevenueSharePlan.is_deleted == False))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="不存在")
    return plan


@router.put("/revenue-share-plans/{plan_id}", response_model=RevenueShareOut)
async def update_revenue_share_plan(plan_id: str, body: RevenueShareCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RevenueSharePlan).where(RevenueSharePlan.id == plan_id, RevenueSharePlan.is_deleted == False))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="不存在")
    our_amount = body.total_revenue * body.our_share_ratio / 100
    partner_amount = body.total_revenue * body.partner_share_ratio / 100
    net = our_amount - body.deduct_electricity - body.deduct_rent - body.deduct_maintenance
    plan.partnership_id = body.partnership_id
    plan.station_id = body.station_id
    plan.period = body.period
    plan.total_revenue = body.total_revenue
    plan.our_share_ratio = body.our_share_ratio
    plan.our_share_amount = our_amount
    plan.partner_share_ratio = body.partner_share_ratio
    plan.partner_share_amount = partner_amount
    plan.deduct_electricity = body.deduct_electricity
    plan.deduct_rent = body.deduct_rent
    plan.deduct_maintenance = body.deduct_maintenance
    plan.net_share_amount = net
    plan.updated_by = current_user.id
    await db.flush()
    await db.refresh(plan)
    return plan


class FleetCustomerCreate(BaseModel):
    fleet_name: str
    fleet_code: str
    contact_person: str | None = None
    contact_phone: str | None = None
    fleet_size: int | None = None
    plate_numbers: list[str] | None = None
    credit_limit: float | None = None
    billing_type: str = "prepay"
    service_fee_type: str = "per_kwh"
    service_fee_rate: float | None = None
    remark: str | None = None


class FleetCustomerUpdate(BaseModel):
    fleet_name: str | None = None
    contact_person: str | None = None
    contact_phone: str | None = None
    fleet_size: int | None = None
    plate_numbers: list[str] | None = None
    credit_limit: float | None = None
    billing_type: str | None = None
    service_fee_type: str | None = None
    service_fee_rate: float | None = None
    status: str | None = None
    remark: str | None = None


class FleetCustomerOut(BaseModel):
    id: uuid.UUID
    fleet_name: str
    fleet_code: str
    contact_person: str | None
    contact_phone: str | None
    fleet_size: int | None
    plate_numbers: list[str] | None
    balance: float | None
    virtual_balance: float | None
    billing_type: str
    service_fee_type: str | None
    service_fee_rate: float | None
    status: str
    model_config = {"from_attributes": True}


@router.get("/fleet-customers")
@cached(ttl=300, prefix="charging")
async def list_fleet_customers(
    keyword: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(FleetCustomer).where(FleetCustomer.is_deleted == False, FleetCustomer.company_id == current_user.company_id)
    if keyword:
        query = query.where((FleetCustomer.fleet_name.ilike(f"%{keyword}%")) | (FleetCustomer.fleet_code.ilike(f"%{keyword}%")))
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(FleetCustomer.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/fleet-customers", response_model=FleetCustomerOut)
async def create_fleet_customer(body: FleetCustomerCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    fleet = FleetCustomer(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(fleet)
    await db.flush()
    await db.refresh(fleet)
    return fleet


@router.get("/fleet-customers/{fleet_id}", response_model=FleetCustomerOut)
async def get_fleet_customer(fleet_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FleetCustomer).where(FleetCustomer.id == fleet_id, FleetCustomer.is_deleted == False))
    fleet = result.scalar_one_or_none()
    if not fleet:
        raise HTTPException(status_code=404, detail="车队不存在")
    return fleet


@router.put("/fleet-customers/{fleet_id}", response_model=FleetCustomerOut)
async def update_fleet_customer(fleet_id: str, body: FleetCustomerUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FleetCustomer).where(FleetCustomer.id == fleet_id, FleetCustomer.is_deleted == False))
    fleet = result.scalar_one_or_none()
    if not fleet:
        raise HTTPException(status_code=404, detail="车队不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(fleet, k, v)
    fleet.updated_by = current_user.id
    await db.flush()
    await db.refresh(fleet)
    return fleet


@router.delete("/fleet-customers/{fleet_id}")
async def delete_fleet_customer(fleet_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(FleetCustomer).where(FleetCustomer.id == fleet_id).values(is_deleted=True))
    return {"message": "删除成功"}


class FleetRechargeCreate(BaseModel):
    fleet_id: str
    amount: float
    bonus_amount: float = 0
    payment_method: str | None = None


class FleetRechargeOut(BaseModel):
    id: uuid.UUID
    fleet_id: uuid.UUID
    recharge_no: str
    amount: float
    bonus_amount: float
    balance_after: float | None
    status: str
    model_config = {"from_attributes": True}


@router.get("/fleet-recharges")
async def list_fleet_recharges(
    fleet_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(FleetRechargeRecord).where(FleetRechargeRecord.is_deleted == False, FleetRechargeRecord.company_id == current_user.company_id)
    if fleet_id:
        query = query.where(FleetRechargeRecord.fleet_id == fleet_id)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(FleetRechargeRecord.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/fleet-recharges", response_model=FleetRechargeOut)
async def create_fleet_recharge(body: FleetRechargeCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    fleet_result = await db.execute(select(FleetCustomer).where(FleetCustomer.id == body.fleet_id))
    fleet = fleet_result.scalar_one_or_none()
    if not fleet:
        raise HTTPException(status_code=404, detail="车队不存在")
    balance_before = float(fleet.balance)
    balance_after = balance_before + body.amount + body.bonus_amount
    record = FleetRechargeRecord(
        fleet_id=body.fleet_id, recharge_no=generate_no("FR"), amount=body.amount,
        bonus_amount=body.bonus_amount, payment_method=body.payment_method,
        balance_before=balance_before, balance_after=balance_after,
        company_id=current_user.company_id, created_by=current_user.id,
        status="confirmed", confirmed_by=current_user.id,
    )
    db.add(record)
    fleet.balance = balance_after
    await db.flush()
    await db.refresh(record)
    return record


@router.get("/fleet-recharges/{record_id}", response_model=FleetRechargeOut)
async def get_fleet_recharge(record_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FleetRechargeRecord).where(FleetRechargeRecord.id == record_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="不存在")
    return record


class FleetBillCreate(BaseModel):
    fleet_id: str
    period: str
    total_orders: int = 0
    total_kwh: float | None = None
    total_amount: float | None = None
    net_amount: float | None = None
    deducted_from_balance: float = 0
    actual_pay_amount: float | None = None
    payment_due_date: date | None = None


class FleetBillOut(BaseModel):
    id: uuid.UUID
    fleet_id: uuid.UUID
    bill_no: str
    period: str
    total_orders: int
    total_kwh: float | None
    total_amount: float | None
    energy_amount: float | None
    service_amount: float | None
    net_amount: float | None
    deducted_from_balance: float | None
    actual_pay_amount: float | None
    payment_due_date: date | None
    payment_status: str
    billing_type: str
    station_id: uuid.UUID | None
    created_at: str | None
    model_config = {"from_attributes": True}


@router.put("/orders/{order_id}")
async def update_order_project(
    order_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChargingOrder).where(ChargingOrder.id == order_id, ChargingOrder.is_deleted == False, ChargingOrder.company_id == current_user.company_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "订单不存在")
    if "project_id" in body:
        order.project_id = body["project_id"] or None
    if "fleet_customer_id" in body:
        order.fleet_customer_id = body["fleet_customer_id"] or None
    order.updated_by = current_user.id
    await db.flush()
    return {"id": str(order.id), "project_id": str(order.project_id) if order.project_id else None, "fleet_customer_id": str(order.fleet_customer_id) if order.fleet_customer_id else None}


@router.post("/orders/batch-assign-project")
async def batch_assign_project(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    station_id = body.get("station_id")
    fleet_id = body.get("fleet_customer_id")
    project_id = body.get("project_id")
    if not project_id:
        raise HTTPException(400, "project_id必填")
    conditions = [ChargingOrder.is_deleted == False, ChargingOrder.company_id == current_user.company_id, ChargingOrder.project_id == None]
    if station_id:
        conditions.append(ChargingOrder.station_id == station_id)
    if fleet_id:
        conditions.append(ChargingOrder.fleet_customer_id == fleet_id)
    result = await db.execute(update(ChargingOrder).where(*conditions).values(project_id=project_id))
    return {"updated": result.rowcount}


@router.get("/fleet-bills")
@cached(ttl=300, prefix="charging")
async def list_fleet_bills(
    fleet_id: str | None = None,
    period: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(FleetPaymentBill).where(FleetPaymentBill.is_deleted == False, FleetPaymentBill.company_id == current_user.company_id)
    if fleet_id:
        query = query.where(FleetPaymentBill.fleet_id == fleet_id)
    if period:
        query = query.where(FleetPaymentBill.period == period)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(FleetPaymentBill.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    bills = result.scalars().all()

    fleet_ids = {str(b.fleet_id) for b in bills}
    fleet_map = {}
    if fleet_ids:
        fleets = (await db.execute(
            select(FleetCustomer.id, FleetCustomer.fleet_name).where(FleetCustomer.id.in_(fleet_ids))
        )).all()
        fleet_map = {str(f[0]): f[1] for f in fleets}

    items = []
    for b in bills:
        d = {
            "id": str(b.id), "fleet_id": str(b.fleet_id), "bill_no": b.bill_no,
            "period": b.period, "total_orders": b.total_orders,
            "total_kwh": float(b.total_kwh or 0), "total_amount": float(b.total_amount or 0),
            "energy_amount": float(b.energy_amount or 0), "service_amount": float(b.service_amount or 0),
            "net_amount": float(b.net_amount or 0), "deducted_from_balance": float(b.deducted_from_balance or 0),
            "actual_pay_amount": float(b.actual_pay_amount or 0),
            "payment_due_date": str(b.payment_due_date) if b.payment_due_date else None,
            "payment_status": b.payment_status, "billing_type": b.billing_type,
            "station_id": str(b.station_id) if b.station_id else None,
            "fleet_name": fleet_map.get(str(b.fleet_id), ""),
            "created_at": str(b.created_at) if b.created_at else None,
        }
        items.append(d)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/fleet-bills/preview")
async def preview_fleet_bill(
    fleet_id: str = Query(...),
    period: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from calendar import monthrange
    fleet = (await db.execute(
        select(FleetCustomer).where(FleetCustomer.id == fleet_id, FleetCustomer.is_deleted == False)
    )).scalar_one_or_none()
    if not fleet:
        raise HTTPException(404, "车队不存在")

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
            func.coalesce(func.sum(ChargingOrder.peak_cost), 0),
            func.coalesce(func.sum(ChargingOrder.flat_cost), 0),
            func.coalesce(func.sum(ChargingOrder.valley_cost), 0),
        ).where(
            ChargingOrder.fleet_customer_id == fleet_id,
            ChargingOrder.is_deleted == False,
            ChargingOrder.company_id == current_user.company_id,
            ChargingOrder.start_time >= start,
            ChargingOrder.start_time < end + timedelta(days=1),
        )
    )).one()

    existing = (await db.execute(
        select(FleetPaymentBill).where(
            FleetPaymentBill.fleet_id == fleet_id, FleetPaymentBill.period == period,
            FleetPaymentBill.is_deleted == False,
        )
    )).scalar_one_or_none()

    total_amount = float(result[4] or 0)
    deduct = 0.0
    if fleet.billing_type == "prepay":
        deduct = min(total_amount, float(fleet.virtual_balance or 0))

    return {
        "fleet": {
            "id": str(fleet.id), "fleet_name": fleet.fleet_name,
            "billing_type": fleet.billing_type, "balance": float(fleet.balance or 0),
            "virtual_balance": float(fleet.virtual_balance or 0),
            "service_fee_type": fleet.service_fee_type, "service_fee_rate": float(fleet.service_fee_rate or 0),
        },
        "period": period,
        "total_orders": result[0],
        "total_kwh": float(result[1] or 0),
        "energy_amount": float(result[2] or 0),
        "service_amount": float(result[3] or 0),
        "total_amount": total_amount,
        "peak_kwh": float(result[5] or 0), "flat_kwh": float(result[6] or 0), "valley_kwh": float(result[7] or 0),
        "peak_cost": float(result[8] or 0), "flat_cost": float(result[9] or 0), "valley_cost": float(result[10] or 0),
        "deducted_from_balance": deduct,
        "actual_pay_amount": total_amount - deduct,
        "bill_already_exists": existing is not None,
        "existing_bill_no": existing.bill_no if existing else None,
    }


@router.post("/fleet-bills")
async def create_fleet_bill(body: FleetBillCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.services.fleet_billing import fleet_billing_service
    bill = await fleet_billing_service.generate_monthly_bill(
        db, current_user.company_id, body.fleet_id, body.period, current_user.id,
    )
    return bill


@router.post("/fleet-bills/generate-all")
async def generate_all_fleet_bills(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.fleet_billing import fleet_billing_service
    period = body.get("period", "")
    if not period or len(period) != 7:
        raise HTTPException(400, "period格式应为YYYY-MM")
    results = await fleet_billing_service.generate_all_monthly_bills(
        db, current_user.company_id, period, current_user.id,
    )
    return {"results": results}


@router.post("/fleet-bills/{bill_id}/price-adjust")
async def adjust_bill_price(
    bill_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.fleet_billing import fleet_billing_service
    actual_price = body.get("actual_price_per_kwh")
    if actual_price is None:
        raise HTTPException(400, "缺少actual_price_per_kwh")
    bill = (await db.execute(
        select(FleetPaymentBill).where(FleetPaymentBill.id == bill_id, FleetPaymentBill.is_deleted == False)
    )).scalar_one_or_none()
    if not bill:
        raise HTTPException(404, "账单不存在")
    if not bill.station_id:
        raise HTTPException(400, "账单未关联充电站，无法调价")
    result = await fleet_billing_service.apply_electricity_price_adjustment(
        db, current_user.company_id, str(bill.station_id), bill.period, float(actual_price), current_user.id,
    )
    return result


@router.get("/fleet-bills/{bill_id}", response_model=FleetBillOut)
async def get_fleet_bill(bill_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FleetPaymentBill).where(FleetPaymentBill.id == bill_id))
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="不存在")
    return bill


@router.put("/fleet-bills/{bill_id}", response_model=FleetBillOut)
async def update_fleet_bill(bill_id: str, body: FleetBillCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FleetPaymentBill).where(FleetPaymentBill.id == bill_id))
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(bill, k, v)
    bill.updated_by = current_user.id
    await db.flush()
    await db.refresh(bill)
    return bill


class FleetInvoiceCreate(BaseModel):
    fleet_id: str
    invoice_type: str
    invoice_title: str
    tax_no: str | None = None
    bank_name: str | None = None
    bank_account: str | None = None
    amount: float | None = None


class FleetInvoiceOut(BaseModel):
    id: uuid.UUID
    fleet_id: uuid.UUID
    request_no: str
    invoice_type: str
    invoice_title: str
    amount: float | None
    status: str
    model_config = {"from_attributes": True}


@router.get("/fleet-invoice-requests")
async def list_fleet_invoice_requests(
    fleet_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(FleetInvoiceRequest).where(FleetInvoiceRequest.is_deleted == False, FleetInvoiceRequest.company_id == current_user.company_id)
    if fleet_id:
        query = query.where(FleetInvoiceRequest.fleet_id == fleet_id)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(FleetInvoiceRequest.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/fleet-invoice-requests", response_model=FleetInvoiceOut)
async def create_fleet_invoice_request(body: FleetInvoiceCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    req = FleetInvoiceRequest(**body.model_dump(), request_no=generate_no("FI"), company_id=current_user.company_id, created_by=current_user.id)
    db.add(req)
    await db.flush()
    await db.refresh(req)
    return req


@router.get("/fleet-invoice-requests/{req_id}", response_model=FleetInvoiceOut)
async def get_fleet_invoice_request(req_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FleetInvoiceRequest).where(FleetInvoiceRequest.id == req_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="不存在")
    return req


@router.put("/fleet-invoice-requests/{req_id}", response_model=FleetInvoiceOut)
async def update_fleet_invoice_request(req_id: str, body: FleetInvoiceCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FleetInvoiceRequest).where(FleetInvoiceRequest.id == req_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(req, k, v)
    req.updated_by = current_user.id
    await db.flush()
    await db.refresh(req)
    return req


class TargetCustomerCreate(BaseModel):
    customer_name: str
    customer_type: str
    source: str | None = None
    contact_person: str | None = None
    contact_phone: str | None = None
    estimated_fleet_size: int | None = None
    estimated_monthly_kwh: float | None = None
    estimated_monthly_revenue: float | None = None
    current_stage: str = "initial"
    win_probability: int = 0
    remark: str | None = None


class TargetCustomerUpdate(BaseModel):
    customer_name: str | None = None
    customer_type: str | None = None
    source: str | None = None
    contact_person: str | None = None
    contact_phone: str | None = None
    estimated_fleet_size: int | None = None
    estimated_monthly_kwh: float | None = None
    current_stage: str | None = None
    win_probability: int | None = None
    status: str | None = None
    remark: str | None = None


class TargetCustomerOut(BaseModel):
    id: uuid.UUID
    customer_name: str
    customer_type: str
    contact_person: str | None
    current_stage: str
    win_probability: int
    status: str
    model_config = {"from_attributes": True}


@router.get("/target-customers")
@cached(ttl=300, prefix="charging")
async def list_target_customers(
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(TargetCustomer).where(TargetCustomer.is_deleted == False, TargetCustomer.company_id == current_user.company_id)
    if status:
        query = query.where(TargetCustomer.status == status)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(TargetCustomer.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/target-customers", response_model=TargetCustomerOut)
async def create_target_customer(body: TargetCustomerCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    c = TargetCustomer(**body.model_dump(), company_id=current_user.company_id, assigned_to=current_user.id, created_by=current_user.id)
    db.add(c)
    await db.flush()
    await db.refresh(c)
    return c


@router.get("/target-customers/{c_id}", response_model=TargetCustomerOut)
async def get_target_customer(c_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TargetCustomer).where(TargetCustomer.id == c_id, TargetCustomer.is_deleted == False))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="不存在")
    return c


@router.put("/target-customers/{c_id}", response_model=TargetCustomerOut)
async def update_target_customer(c_id: str, body: TargetCustomerUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TargetCustomer).where(TargetCustomer.id == c_id, TargetCustomer.is_deleted == False))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    c.updated_by = current_user.id
    await db.flush()
    await db.refresh(c)
    return c


@router.delete("/target-customers/{c_id}")
async def delete_target_customer(c_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(TargetCustomer).where(TargetCustomer.id == c_id).values(is_deleted=True))
    return {"message": "删除成功"}


class MonthlyTaskCreate(BaseModel):
    month: str
    task_type: str
    title: str
    description: str | None = None
    assignee_id: str | None = None
    station_id: str | None = None
    priority: int = 2
    planned_start: date | None = None
    planned_end: date | None = None


class MonthlyTaskUpdate(BaseModel):
    task_type: str | None = None
    title: str | None = None
    description: str | None = None
    assignee_id: str | None = None
    station_id: str | None = None
    priority: int | None = None
    planned_start: date | None = None
    planned_end: date | None = None
    actual_start: date | None = None
    actual_end: date | None = None
    completion_rate: int | None = None
    status: str | None = None


class MonthlyTaskOut(BaseModel):
    id: uuid.UUID
    month: str
    task_type: str
    title: str
    assignee_id: uuid.UUID | None
    station_id: uuid.UUID | None
    priority: int
    completion_rate: int
    status: str
    model_config = {"from_attributes": True}


@router.get("/monthly-tasks")
@cached(ttl=300, prefix="charging")
async def list_monthly_tasks(
    month: str | None = None,
    station_id: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(MonthlyTaskList).where(MonthlyTaskList.is_deleted == False, MonthlyTaskList.company_id == current_user.company_id)
    if month:
        query = query.where(MonthlyTaskList.month == month)
    if station_id:
        query = query.where(MonthlyTaskList.station_id == station_id)
    if status:
        query = query.where(MonthlyTaskList.status == status)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(MonthlyTaskList.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/monthly-tasks", response_model=MonthlyTaskOut)
async def create_monthly_task(body: MonthlyTaskCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    task = MonthlyTaskList(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(task)
    await db.flush()
    await db.refresh(task)
    return task


@router.get("/monthly-tasks/{task_id}", response_model=MonthlyTaskOut)
async def get_monthly_task(task_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MonthlyTaskList).where(MonthlyTaskList.id == task_id, MonthlyTaskList.is_deleted == False))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="不存在")
    return task


@router.put("/monthly-tasks/{task_id}", response_model=MonthlyTaskOut)
async def update_monthly_task(task_id: str, body: MonthlyTaskUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MonthlyTaskList).where(MonthlyTaskList.id == task_id, MonthlyTaskList.is_deleted == False))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(task, k, v)
    task.updated_by = current_user.id
    await db.flush()
    await db.refresh(task)
    return task


@router.delete("/monthly-tasks/{task_id}")
async def delete_monthly_task(task_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(MonthlyTaskList).where(MonthlyTaskList.id == task_id).values(is_deleted=True))
    return {"message": "删除成功"}


class ElectricityPaymentCreate(BaseModel):
    station_id: str
    period: str
    project_id: str | None = None
    meter_reading_start: float | None = None
    meter_reading_end: float | None = None
    total_kwh: float | None = None
    total_amount: float | None = None
    price_segments: dict | None = None
    due_date: date | None = None
    remark: str | None = None


class ElectricityPaymentUpdate(BaseModel):
    meter_reading_start: float | None = None
    meter_reading_end: float | None = None
    total_kwh: float | None = None
    total_amount: float | None = None
    due_date: date | None = None
    payment_date: date | None = None
    payment_status: str | None = None


class ElectricityPaymentOut(BaseModel):
    id: uuid.UUID
    station_id: uuid.UUID
    period: str
    total_kwh: float | None
    total_amount: float | None
    payment_status: str
    project_id: uuid.UUID | None = None
    model_config = {"from_attributes": True}


@router.get("/electricity-payments")
@cached(ttl=300, prefix="charging")
async def list_electricity_payments(
    station_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ElectricityPayment).where(ElectricityPayment.is_deleted == False, ElectricityPayment.company_id == current_user.company_id)
    if station_id:
        query = query.where(ElectricityPayment.station_id == station_id)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(ElectricityPayment.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/electricity-payments", response_model=ElectricityPaymentOut)
async def create_electricity_payment(body: ElectricityPaymentCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    dump = body.model_dump()
    if not dump.get("project_id"):
        station = (await db.execute(select(ChargingStation).where(ChargingStation.id == body.station_id))).scalar_one_or_none()
        if station and station.project_id:
            dump["project_id"] = str(station.project_id)
    payment = ElectricityPayment(**dump, company_id=current_user.company_id, created_by=current_user.id)
    db.add(payment)
    await db.flush()
    await db.refresh(payment)
    try:
        from app.services.linkage import electricity_payment_to_project_cost
        await electricity_payment_to_project_cost(payment.id, db)
    except Exception:
        pass
    return payment


@router.get("/electricity-payments/{payment_id}", response_model=ElectricityPaymentOut)
async def get_electricity_payment(payment_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ElectricityPayment).where(ElectricityPayment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="不存在")
    return payment


@router.put("/electricity-payments/{payment_id}", response_model=ElectricityPaymentOut)
async def update_electricity_payment(payment_id: str, body: ElectricityPaymentUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ElectricityPayment).where(ElectricityPayment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(payment, k, v)
    payment.updated_by = current_user.id
    await db.flush()
    await db.refresh(payment)
    return payment


@router.delete("/electricity-payments/{payment_id}")
async def delete_electricity_payment(payment_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(ElectricityPayment).where(ElectricityPayment.id == payment_id).values(is_deleted=True))
    return {"message": "删除成功"}


class StationFinancialCreate(BaseModel):
    station_id: str
    month: str
    project_id: str | None = None
    total_orders: int = 0
    total_kwh: float | None = None
    total_energy_revenue: float | None = None
    total_service_revenue: float | None = None
    total_revenue: float | None = None
    electricity_cost: float = 0
    rent_cost: float = 0
    depreciation: float = 0
    maintenance_cost: float = 0
    labor_cost: float = 0


class StationFinancialOut(BaseModel):
    id: uuid.UUID
    station_id: uuid.UUID
    month: str
    total_orders: int
    total_revenue: float | None
    total_cost: float | None
    gross_profit: float | None
    gross_margin: float | None
    project_id: uuid.UUID | None = None
    status: str
    model_config = {"from_attributes": True}


@router.get("/station-financial-monthly")
async def list_station_financial(
    station_id: str | None = None,
    month: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(StationFinancialMonthly).where(StationFinancialMonthly.is_deleted == False, StationFinancialMonthly.company_id == current_user.company_id)
    if station_id:
        query = query.where(StationFinancialMonthly.station_id == station_id)
    if month:
        query = query.where(StationFinancialMonthly.month == month)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(StationFinancialMonthly.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/station-financial-monthly", response_model=StationFinancialOut)
async def create_station_financial(body: StationFinancialCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    dump = body.model_dump()
    if not dump.get("project_id"):
        station = (await db.execute(select(ChargingStation).where(ChargingStation.id == body.station_id))).scalar_one_or_none()
        if station and station.project_id:
            dump["project_id"] = str(station.project_id)
    total_cost = body.electricity_cost + body.rent_cost + body.depreciation + body.maintenance_cost + body.labor_cost
    gross_profit = (body.total_revenue or 0) - total_cost
    gross_margin = (gross_profit / body.total_revenue * 100) if body.total_revenue else 0
    report = StationFinancialMonthly(
        **dump, total_cost=total_cost, gross_profit=gross_profit,
        gross_margin=round(gross_margin, 2), company_id=current_user.company_id, created_by=current_user.id,
    )
    db.add(report)
    await db.flush()
    await db.refresh(report)
    return report


@router.get("/station-financial-monthly/{report_id}", response_model=StationFinancialOut)
async def get_station_financial(report_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StationFinancialMonthly).where(StationFinancialMonthly.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="不存在")
    return report


@router.put("/station-financial-monthly/{report_id}", response_model=StationFinancialOut)
async def update_station_financial(report_id: str, body: StationFinancialCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StationFinancialMonthly).where(StationFinancialMonthly.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="不存在")
    total_cost = body.electricity_cost + body.rent_cost + body.depreciation + body.maintenance_cost + body.labor_cost
    gross_profit = (body.total_revenue or 0) - total_cost
    gross_margin = (gross_profit / body.total_revenue * 100) if body.total_revenue else 0
    for k, v in body.model_dump().items():
        setattr(report, k, v)
    report.total_cost = total_cost
    report.gross_profit = gross_profit
    report.gross_margin = round(gross_margin, 2)
    report.updated_by = current_user.id
    await db.flush()
    await db.refresh(report)
    return report


@router.delete("/station-financial-monthly/{report_id}")
async def delete_station_financial(report_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(StationFinancialMonthly).where(StationFinancialMonthly.id == report_id).values(is_deleted=True))
    return {"message": "删除成功"}


@router.put("/station-financial-monthly/{report_id}/confirm")
async def confirm_station_financial(report_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StationFinancialMonthly).where(StationFinancialMonthly.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="不存在")
    report.status = "confirmed"
    report.updated_by = current_user.id
    await db.flush()
    try:
        from app.services.linkage import charging_monthly_to_voucher
        await charging_monthly_to_voucher(str(report.station_id), report.month, db)
    except Exception as exc:
        import logging
        logging.exception("联动-月度确认生成凭证失败: %s", exc)
    try:
        from app.services.notification_service import broadcast_notification
        users = (await db.execute(select(User.id).where(User.company_id == current_user.company_id, User.is_deleted == False))).scalars().all()
        await broadcast_notification(db, current_user.company_id, [str(u) for u in users], "finance", "充电站月度财务已确认", f"充电站月度财务 {report.month} 已确认", None, str(current_user.id))
    except Exception as exc:
        import logging
        logging.exception("通知推送失败: %s", exc)
    await db.flush()
    await db.refresh(report)
    return report


class SiteProspectCreate(BaseModel):
    name: str = Field(..., max_length=200)
    province: str | None = None
    city: str | None = None
    district: str | None = None
    address: str | None = None
    longitude: float | None = None
    latitude: float | None = None
    area_size: float | None = None
    land_type: str | None = None
    owner_name: str | None = None
    owner_phone: str | None = None
    owner_company: str | None = None
    expected_rent: float | None = None
    lease_term_months: int | None = None
    traffic_flow_score: int | None = None
    parking_demand_score: int | None = None
    competition_score: int | None = None
    power_supply_score: int | None = None
    nearby_facilities: dict | None = None
    estimated_investment: float | None = None
    estimated_monthly_revenue: float | None = None
    estimated_roi_months: int | None = None
    status: str = "initial"
    assigned_to: str | None = None
    remark: str | None = None


class SiteProspectUpdate(BaseModel):
    name: str | None = None
    province: str | None = None
    city: str | None = None
    district: str | None = None
    address: str | None = None
    longitude: float | None = None
    latitude: float | None = None
    area_size: float | None = None
    land_type: str | None = None
    owner_name: str | None = None
    owner_phone: str | None = None
    owner_company: str | None = None
    expected_rent: float | None = None
    lease_term_months: int | None = None
    traffic_flow_score: int | None = None
    parking_demand_score: int | None = None
    competition_score: int | None = None
    power_supply_score: int | None = None
    overall_score: int | None = None
    nearby_facilities: dict | None = None
    estimated_investment: float | None = None
    estimated_monthly_revenue: float | None = None
    estimated_roi_months: int | None = None
    status: str | None = None
    assigned_to: str | None = None
    follow_up_records: dict | None = None
    remark: str | None = None


@router.get("/site-prospects")
async def list_site_prospects(
    status: str | None = None,
    city: str | None = None,
    keyword: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(SiteProspect).where(SiteProspect.is_deleted == False, SiteProspect.company_id == current_user.company_id)
    if status:
        query = query.where(SiteProspect.status == status)
    if city:
        query = query.where(SiteProspect.city.ilike(f"%{city}%"))
    if keyword:
        query = query.where(SiteProspect.name.ilike(f"%{keyword}%"))
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar()
    query = query.order_by(SiteProspect.overall_score.desc().nullslast(), SiteProspect.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/site-prospects")
async def create_site_prospect(body: SiteProspectCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    scores = [s for s in [body.traffic_flow_score, body.parking_demand_score, body.competition_score, body.power_supply_score] if s is not None]
    overall = round(sum(scores) / len(scores)) if scores else None
    obj = SiteProspect(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id, overall_score=overall)
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.get("/site-prospects/{site_id}")
async def get_site_prospect(site_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SiteProspect).where(SiteProspect.id == site_id))
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="不存在")
    return site


@router.put("/site-prospects/{site_id}")
async def update_site_prospect(site_id: str, body: SiteProspectUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SiteProspect).where(SiteProspect.id == site_id))
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="不存在")
    data = body.model_dump(exclude_unset=True)
    score_fields = ["traffic_flow_score", "parking_demand_score", "competition_score", "power_supply_score"]
    if any(f in data for f in score_fields):
        scores = [getattr(site, f) if f not in data else data[f] for f in score_fields]
        valid = [s for s in scores if s is not None]
        data["overall_score"] = round(sum(valid) / len(valid)) if valid else None
    for k, v in data.items():
        setattr(site, k, v)
    site.updated_by = current_user.id
    await db.flush()
    if data.get("status") == "signed":
        try:
            from app.services.linkage import site_signed_to_project, site_signed_to_station
            await site_signed_to_project(site_id, db)
            await site_signed_to_station(site_id, db)
        except Exception as exc:
            import logging
            logging.exception("联动-场地签约自动创建失败: %s", exc)
        try:
            from app.services.notification_service import broadcast_notification
            users = (await db.execute(select(User.id).where(User.company_id == current_user.company_id, User.is_deleted == False))).scalars().all()
            await broadcast_notification(db, current_user.company_id, [str(u) for u in users], "charging", "新场地已签约", f"{site.name} 已签约，已自动创建工程项目和充电站", None, str(current_user.id))
        except Exception as exc:
            import logging
            logging.exception("通知推送失败: %s", exc)
        await db.flush()
    await db.refresh(site)
    return site


@router.delete("/site-prospects/{site_id}")
async def delete_site_prospect(site_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(SiteProspect).where(SiteProspect.id == site_id).values(is_deleted=True))
    return {"message": "删除成功"}


class SiteVisitCreate(BaseModel):
    site_id: str = Field(...)
    visit_date: date | None = None
    visitors: str | None = None
    findings: str | None = None
    power_condition: str | None = None
    traffic_condition: str | None = None
    competition_nearby: str | None = None
    recommendation: str | None = None
    next_action: str | None = None
    visit_score: int | None = None


class SiteVisitUpdate(BaseModel):
    visit_date: date | None = None
    visitors: str | None = None
    findings: str | None = None
    power_condition: str | None = None
    traffic_condition: str | None = None
    competition_nearby: str | None = None
    recommendation: str | None = None
    next_action: str | None = None
    visit_score: int | None = None


@router.get("/site-visits")
async def list_site_visits(
    site_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(SiteVisitRecord).where(SiteVisitRecord.is_deleted == False, SiteVisitRecord.company_id == current_user.company_id)
    if site_id:
        query = query.where(SiteVisitRecord.site_id == site_id)
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar()
    query = query.order_by(SiteVisitRecord.visit_date.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/site-visits")
async def create_site_visit(body: SiteVisitCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obj = SiteVisitRecord(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.put("/site-visits/{visit_id}")
async def update_site_visit(visit_id: str, body: SiteVisitUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SiteVisitRecord).where(SiteVisitRecord.id == visit_id))
    visit = result.scalar_one_or_none()
    if not visit:
        raise HTTPException(status_code=404, detail="不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(visit, k, v)
    visit.updated_by = current_user.id
    await db.flush()
    await db.refresh(visit)
    return visit


@router.delete("/site-visits/{visit_id}")
async def delete_site_visit(visit_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(SiteVisitRecord).where(SiteVisitRecord.id == visit_id).values(is_deleted=True))
    return {"message": "删除成功"}


@router.post("/orders/import-file")
async def import_charging_orders_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    file_data = await file.read()
    orders = ChargingOrderImportService.parse_xlsx(file_data)
    if not orders:
        raise HTTPException(status_code=400, detail="文件中无有效订单数据")

    existing_refs_result = await db.execute(
        select(ChargingOrder.source_order_no).where(
            ChargingOrder.company_id == current_user.company_id,
            ChargingOrder.source_order_no != None,
            ChargingOrder.is_deleted == False,
        )
    )
    existing_refs = set(existing_refs_result.scalars().all())

    new_orders = ChargingOrderImportService.deduplicate(orders, existing_refs)
    skipped = len(orders) - len(new_orders)

    station_rows = (await db.execute(
        select(ChargingStation.id, ChargingStation.name, ChargingStation.project_id).where(
            ChargingStation.company_id == current_user.company_id,
            ChargingStation.is_deleted == False,
        )
    )).all()
    station_map = {row.name.strip(): row for row in station_rows}

    fleet_rows = (await db.execute(
        select(FleetCustomer).where(
            FleetCustomer.company_id == current_user.company_id,
            FleetCustomer.is_deleted == False,
        )
    )).scalars().all()
    fleet_by_name = {fc.fleet_name.strip(): fc for fc in fleet_rows if fc.fleet_name}
    fleet_plates = {}
    for fc in fleet_rows:
        if fc.plate_numbers and isinstance(fc.plate_numbers, list):
            for p in fc.plate_numbers:
                fleet_plates[p.strip()] = fc

    matched = 0
    for od in new_orders:
        extra_data = od.pop("extra_data", {})
        sid = None
        pid = None
        sname = od.get("station_name", "")
        if sname:
            row = station_map.get(sname.strip())
            if not row:
                for name, r in station_map.items():
                    if sname in name or name in sname:
                        row = r
                        break
            if row:
                sid = row.id
                pid = row.project_id
                matched += 1

        fleet_id = None
        ename = (od.get("enterprise_name") or "").strip()
        plate = (od.get("plate_number") or "").strip()
        if ename:
            fc = fleet_by_name.get(ename)
            if not fc:
                for fn, f in fleet_by_name.items():
                    if ename in fn or fn in ename:
                        fc = f
                        break
            if fc:
                fleet_id = str(fc.id)
        if not fleet_id and plate:
            fc = fleet_plates.get(plate)
            if fc:
                fleet_id = str(fc.id)

        order = ChargingOrder(
            **od,
            station_id=sid,
            device_id=None,
            fleet_customer_id=fleet_id,
            project_id=pid,
            company_id=current_user.company_id,
            created_by=current_user.id,
        )
        db.add(order)

    await db.flush()

    preview = []
    for od in new_orders[:5]:
        preview.append({
            "order_no": od.get("order_no"),
            "station_name": od.get("station_name"),
            "charging_kwh": od.get("charging_kwh"),
            "total_amount": od.get("total_amount"),
            "status": od.get("status"),
        })

    return {"imported": len(new_orders), "skipped": skipped, "matched": matched, "preview": preview}


# ── 运营备忘录 ──────────────────────────────────────────────────

class MemoCreate(BaseModel):
    title: str = Field(..., max_length=200)
    station_id: str | None = None
    memo_type: str = "maintenance"
    content: str | None = None
    priority: str = "normal"
    status: str = "open"
    remark: str | None = None


class MemoUpdate(BaseModel):
    title: str | None = None
    station_id: str | None = None
    memo_type: str | None = None
    content: str | None = None
    priority: str | None = None
    status: str | None = None
    remark: str | None = None


@router.get("/operation-memos")
async def list_operation_memos(
    memo_type: str | None = None,
    status: str | None = None,
    station_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(OperationMemo).where(OperationMemo.is_deleted == False, OperationMemo.company_id == current_user.company_id)
    if memo_type:
        query = query.where(OperationMemo.memo_type == memo_type)
    if status:
        query = query.where(OperationMemo.status == status)
    if station_id:
        query = query.where(OperationMemo.station_id == station_id)
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar()
    query = query.order_by(OperationMemo.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/operation-memos")
async def create_operation_memo(body: MemoCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obj = OperationMemo(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.put("/operation-memos/{memo_id}")
async def update_operation_memo(memo_id: str, body: MemoUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(OperationMemo).where(OperationMemo.id == memo_id, OperationMemo.is_deleted == False))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/operation-memos/{memo_id}")
async def delete_operation_memo(memo_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(OperationMemo).where(OperationMemo.id == memo_id).values(is_deleted=True))
    return {"message": "删除成功"}


# ── 运营策略 ──────────────────────────────────────────────────

class StrategyCreate(BaseModel):
    title: str = Field(..., max_length=200)
    station_id: str | None = None
    strategy_type: str = "pricing"
    content: str | None = None
    effective_date: date | None = None
    expiry_date: date | None = None
    status: str = "active"
    remark: str | None = None


class StrategyUpdate(BaseModel):
    title: str | None = None
    station_id: str | None = None
    strategy_type: str | None = None
    content: str | None = None
    effective_date: date | None = None
    expiry_date: date | None = None
    status: str | None = None
    remark: str | None = None


@router.get("/operation-strategies")
async def list_operation_strategies(
    strategy_type: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(OperationStrategy).where(OperationStrategy.is_deleted == False, OperationStrategy.company_id == current_user.company_id)
    if strategy_type:
        query = query.where(OperationStrategy.strategy_type == strategy_type)
    if status:
        query = query.where(OperationStrategy.status == status)
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar()
    query = query.order_by(OperationStrategy.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return {"items": result.scalars().all(), "total": total, "page": page, "page_size": page_size}


@router.post("/operation-strategies")
async def create_operation_strategy(body: StrategyCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obj = OperationStrategy(**body.model_dump(), company_id=current_user.company_id, created_by=current_user.id)
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.put("/operation-strategies/{strategy_id}")
async def update_operation_strategy(strategy_id: str, body: StrategyUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(OperationStrategy).where(OperationStrategy.id == strategy_id, OperationStrategy.is_deleted == False))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    obj.updated_by = current_user.id
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/operation-strategies/{strategy_id}")
async def delete_operation_strategy(strategy_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(OperationStrategy).where(OperationStrategy.id == strategy_id).values(is_deleted=True))
    return {"message": "删除成功"}
