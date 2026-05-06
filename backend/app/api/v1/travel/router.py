import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db
from app.models.organization import User
from app.models.business.models import TravelTrip, TravelProjectAllocation, TravelExpense
from app.models.project.models import Project, ProjectLine
from app.services.project_cost import ProjectCostService

router = APIRouter(prefix="/travel", tags=["差旅管理"])


class TripCreate(BaseModel):
    title: str = Field(..., max_length=200)
    employee_id: str | None = None
    departure_date: date
    return_date: date
    origin: str = Field(..., max_length=200)
    destination: str = Field(..., max_length=200)
    vehicle: str = "car"
    objectives: str | None = None
    planned_budget: float | None = None
    project_allocations: list[dict] | None = None


class TripUpdate(BaseModel):
    title: str | None = None
    departure_date: date | None = None
    return_date: date | None = None
    origin: str | None = None
    destination: str | None = None
    vehicle: str | None = None
    objectives: str | None = None
    planned_budget: float | None = None
    status: str | None = None
    project_allocations: list[dict] | None = None


class TripFeedback(BaseModel):
    feedback: str
    completion_summary: str | None = None
    result_rating: int | None = Field(None, ge=1, le=5)


class TravelExpenseCreate(BaseModel):
    trip_id: str
    expense_type: str = Field(..., max_length=30)
    amount: float = Field(..., gt=0)
    expense_date: date
    description: str | None = None
    receipt_url: str | None = None


class AllocationUpdate(BaseModel):
    allocations: list[dict]


@router.get("/trips")
async def list_trips(
    project_id: str | None = None,
    employee_id: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(TravelTrip).where(
        TravelTrip.is_deleted == False,
        TravelTrip.company_id == current_user.company_id,
    )
    if status:
        query = query.where(TravelTrip.status == status)
    if employee_id:
        query = query.where(TravelTrip.employee_id == employee_id)
    if project_id:
        alloc_sub = select(TravelProjectAllocation.trip_id).where(
            TravelProjectAllocation.project_id == project_id,
            TravelProjectAllocation.is_deleted == False,
        )
        query = query.where(TravelTrip.id.in_(alloc_sub))

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(TravelTrip.departure_date.desc()).offset((page - 1) * page_size).limit(page_size)
    trips = (await db.execute(query)).scalars().all()
    trip_ids = [t.id for t in trips]

    alloc_map: dict = {}
    if trip_ids:
        allocs = (await db.execute(
            select(TravelProjectAllocation).where(
                TravelProjectAllocation.trip_id.in_(trip_ids),
                TravelProjectAllocation.is_deleted == False,
            )
        )).scalars().all()
        for a in allocs:
            alloc_map.setdefault(str(a.trip_id), []).append({
                "id": str(a.id), "project_id": str(a.project_id),
                "share_ratio": float(a.share_ratio), "allocated_amount": float(a.allocated_amount),
            })

    expense_map: dict = {}
    if trip_ids:
        exps = (await db.execute(
            select(TravelExpense.trip_id, func.count(TravelExpense.id), func.coalesce(func.sum(TravelExpense.amount), 0)).where(
                TravelExpense.trip_id.in_(trip_ids),
                TravelExpense.is_deleted == False,
            ).group_by(TravelExpense.trip_id)
        )).all()
        for e in exps:
            expense_map[str(e[0])] = {"count": e[1], "total": float(e[2])}

    items = []
    for t in trips:
        tid = str(t.id)
        items.append({
            "id": tid, "trip_no": t.trip_no, "title": t.title,
            "employee_id": str(t.employee_id),
            "departure_date": str(t.departure_date), "return_date": str(t.return_date),
            "origin": t.origin, "destination": t.destination, "vehicle": t.vehicle,
            "objectives": t.objectives, "planned_budget": float(t.planned_budget) if t.planned_budget else None,
            "actual_amount": float(t.actual_amount),
            "status": t.status, "feedback": t.feedback,
            "completion_summary": t.completion_summary, "result_rating": t.result_rating,
            "allocations": alloc_map.get(tid, []),
            "expense_summary": expense_map.get(tid, {"count": 0, "total": 0}),
        })
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/trips")
async def create_trip(body: TripCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    today = date.today()
    seq_q = select(func.count()).select_from(TravelTrip.__table__).where(
        TravelTrip.company_id == current_user.company_id,
    )
    seq = (await db.execute(seq_q)).scalar() or 0
    trip_no = f"TR-{today.strftime('%Y%m')}-{seq + 1:04d}"

    employee_id = body.employee_id or str(current_user.id)
    trip = TravelTrip(
        trip_no=trip_no, title=body.title, employee_id=employee_id,
        departure_date=body.departure_date, return_date=body.return_date,
        origin=body.origin, destination=body.destination, vehicle=body.vehicle,
        objectives=body.objectives, planned_budget=body.planned_budget,
        company_id=current_user.company_id, created_by=current_user.id,
    )
    db.add(trip)
    await db.flush()
    await db.refresh(trip)

    allocations = []
    if body.project_allocations:
        for alloc in body.project_allocations:
            a = TravelProjectAllocation(
                trip_id=trip.id, project_id=alloc["project_id"],
                share_ratio=alloc.get("share_ratio", 100),
                allocated_amount=0,
                company_id=current_user.company_id, created_by=current_user.id,
            )
            db.add(a)
            allocations.append({"project_id": alloc["project_id"], "share_ratio": alloc.get("share_ratio", 100)})

    await db.flush()
    return {
        "id": str(trip.id), "trip_no": trip.trip_no, "title": trip.title,
        "status": trip.status, "allocations": allocations,
    }


@router.get("/trips/{trip_id}")
async def get_trip(trip_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    trip = (await db.execute(select(TravelTrip).where(
        TravelTrip.id == trip_id, TravelTrip.is_deleted == False,
        TravelTrip.company_id == current_user.company_id,
    ))).scalar_one_or_none()
    if not trip:
        raise HTTPException(404, "出差记录不存在")

    allocs = (await db.execute(select(TravelProjectAllocation).where(
        TravelProjectAllocation.trip_id == trip_id, TravelProjectAllocation.is_deleted == False,
    ))).scalars().all()

    expenses = (await db.execute(select(TravelExpense).where(
        TravelExpense.trip_id == trip_id, TravelExpense.is_deleted == False,
    ).order_by(TravelExpense.expense_date))).scalars().all()

    project_ids = [str(a.project_id) for a in allocs]
    project_names = {}
    if project_ids:
        projs = (await db.execute(select(Project).where(Project.id.in_(project_ids)))).scalars().all()
        project_names = {str(p.id): p.name for p in projs}

    return {
        "id": str(trip.id), "trip_no": trip.trip_no, "title": trip.title,
        "employee_id": str(trip.employee_id),
        "departure_date": str(trip.departure_date), "return_date": str(trip.return_date),
        "origin": trip.origin, "destination": trip.destination, "vehicle": trip.vehicle,
        "objectives": trip.objectives, "planned_budget": float(trip.planned_budget) if trip.planned_budget else None,
        "actual_amount": float(trip.actual_amount), "status": trip.status,
        "feedback": trip.feedback, "completion_summary": trip.completion_summary,
        "result_rating": trip.result_rating,
        "allocations": [
            {"id": str(a.id), "project_id": str(a.project_id),
             "project_name": project_names.get(str(a.project_id), "-"),
             "share_ratio": float(a.share_ratio), "allocated_amount": float(a.allocated_amount)}
            for a in allocs
        ],
        "expenses": [
            {"id": str(e.id), "expense_type": e.expense_type, "amount": float(e.amount),
             "expense_date": str(e.expense_date), "description": e.description,
             "receipt_url": e.receipt_url}
            for e in expenses
        ],
    }


@router.put("/trips/{trip_id}")
async def update_trip(trip_id: str, body: TripUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    trip = (await db.execute(select(TravelTrip).where(
        TravelTrip.id == trip_id, TravelTrip.is_deleted == False,
        TravelTrip.company_id == current_user.company_id,
    ))).scalar_one_or_none()
    if not trip:
        raise HTTPException(404, "出差记录不存在")

    data = body.model_dump(exclude_unset=True)
    allocs_data = data.pop("project_allocations", None)
    for k, v in data.items():
        setattr(trip, k, v)
    trip.updated_by = current_user.id

    if allocs_data is not None:
        existing = (await db.execute(select(TravelProjectAllocation).where(
            TravelProjectAllocation.trip_id == trip_id, TravelProjectAllocation.is_deleted == False,
        ))).scalars().all()
        for e in existing:
            await db.delete(e)

        for alloc in allocs_data:
            a = TravelProjectAllocation(
                trip_id=trip.id, project_id=alloc["project_id"],
                share_ratio=alloc.get("share_ratio", 100), allocated_amount=0,
                company_id=current_user.company_id, created_by=current_user.id,
            )
            db.add(a)

    await db.flush()
    return {"id": str(trip.id), "status": trip.status}


@router.post("/trips/{trip_id}/feedback")
async def submit_feedback(trip_id: str, body: TripFeedback, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    trip = (await db.execute(select(TravelTrip).where(
        TravelTrip.id == trip_id, TravelTrip.is_deleted == False,
        TravelTrip.company_id == current_user.company_id,
    ))).scalar_one_or_none()
    if not trip:
        raise HTTPException(404, "出差记录不存在")

    if trip.status not in ("in_progress", "planned"):
        raise HTTPException(400, "当前状态不允许提交反馈")
    trip.feedback = body.feedback
    trip.completion_summary = body.completion_summary
    trip.result_rating = body.result_rating
    trip.status = "completed"
    trip.updated_by = current_user.id
    await db.flush()
    return {"id": str(trip.id), "status": "completed"}


@router.put("/trips/{trip_id}/allocations")
async def update_allocations(trip_id: str, body: AllocationUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    trip = (await db.execute(select(TravelTrip).where(
        TravelTrip.id == trip_id, TravelTrip.is_deleted == False,
        TravelTrip.company_id == current_user.company_id,
    ))).scalar_one_or_none()
    if not trip:
        raise HTTPException(404, "出差记录不存在")

    existing = (await db.execute(select(TravelProjectAllocation).where(
        TravelProjectAllocation.trip_id == trip_id, TravelProjectAllocation.is_deleted == False,
    ))).scalars().all()
    for e in existing:
        await db.delete(e)

    total_ratio = sum(a.get("share_ratio", 0) for a in body.allocations)
    total_amount = float(trip.actual_amount)

    results = []
    for alloc in body.allocations:
        ratio = alloc.get("share_ratio", 0)
        allocated = (ratio / total_ratio * total_amount) if total_ratio > 0 else 0
        a = TravelProjectAllocation(
            trip_id=trip.id, project_id=alloc["project_id"],
            share_ratio=ratio, allocated_amount=allocated,
            company_id=current_user.company_id, created_by=current_user.id,
        )
        db.add(a)
        results.append({"project_id": alloc["project_id"], "share_ratio": ratio, "allocated_amount": round(allocated, 2)})

    await db.flush()
    return {"allocations": results}


@router.post("/expenses")
async def create_travel_expense(body: TravelExpenseCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    trip = (await db.execute(select(TravelTrip).where(
        TravelTrip.id == body.trip_id, TravelTrip.is_deleted == False,
        TravelTrip.company_id == current_user.company_id,
    ))).scalar_one_or_none()
    if not trip:
        raise HTTPException(404, "出差记录不存在")
    if trip.status == "completed":
        raise HTTPException(400, "已完成的出差不能添加费用")

    exp = TravelExpense(
        trip_id=body.trip_id, expense_type=body.expense_type,
        amount=body.amount, expense_date=body.expense_date,
        description=body.description, receipt_url=body.receipt_url,
        company_id=current_user.company_id, created_by=current_user.id,
    )
    db.add(exp)

    new_total = float(trip.actual_amount) + body.amount
    trip.actual_amount = new_total
    trip.status = "in_progress"

    allocs = (await db.execute(select(TravelProjectAllocation).where(
        TravelProjectAllocation.trip_id == body.trip_id, TravelProjectAllocation.is_deleted == False,
    ))).scalars().all()

    total_ratio = sum(float(a.share_ratio) for a in allocs)
    for a in allocs:
        old_allocated = float(a.allocated_amount)
        new_allocated = (float(a.share_ratio) / total_ratio * new_total) if total_ratio > 0 else 0
        diff = new_allocated - old_allocated
        a.allocated_amount = new_allocated

        if diff != 0 and a.project_id:
            try:
                await ProjectCostService.allocate_cost(
                    project_id=str(a.project_id), line_type="travel",
                    amount=abs(diff), source_id=str(trip.id),
                    source_type="TravelTrip", source_no=trip.trip_no,
                    db=db, company_id=current_user.company_id,
                    user_id=current_user.id, record_date=body.expense_date,
                    description=f"差旅分摊: {trip.title} → {trip.destination}",
                    travel_from=trip.origin, travel_to=trip.destination,
                    travel_purpose=trip.objectives,
                )
            except Exception:
                pass

    await db.flush()
    return {"id": str(exp.id), "trip_actual_amount": new_total}


@router.delete("/expenses/{expense_id}")
async def delete_travel_expense(expense_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    exp = (await db.execute(select(TravelExpense).where(
        TravelExpense.id == expense_id, TravelExpense.is_deleted == False,
        TravelExpense.company_id == current_user.company_id,
    ))).scalar_one_or_none()
    if not exp:
        raise HTTPException(404, "费用记录不存在")
    deleted_amount = float(exp.amount)
    exp.is_deleted = True

    trip = (await db.execute(select(TravelTrip).where(
        TravelTrip.id == exp.trip_id, TravelTrip.is_deleted == False,
        TravelTrip.company_id == current_user.company_id,
    ))).scalar_one_or_none()
    if trip:
        trip.actual_amount = float(trip.actual_amount) - deleted_amount

    await db.flush()
    return {"ok": True, "trip_actual_amount": float(trip.actual_amount) if trip else None}
