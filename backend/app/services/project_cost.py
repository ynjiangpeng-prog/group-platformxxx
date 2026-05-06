import logging
from datetime import date

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project.models import ProjectLine, ProjectLocation, Project

logger = logging.getLogger(__name__)


class ProjectCostService:
    @staticmethod
    async def allocate_cost(
        project_id: str,
        line_type: str,
        amount: float,
        source_id: str | None,
        source_type: str | None,
        source_no: str | None,
        db: AsyncSession,
        company_id: str,
        user_id: str,
        record_date: date | None = None,
        description: str | None = None,
        travel_from: str | None = None,
        travel_to: str | None = None,
        travel_purpose: str | None = None,
    ) -> ProjectLine:
        line = ProjectLine(
            project_id=project_id,
            line_type=line_type,
            amount=amount,
            source_id=source_id,
            source_type=source_type,
            source_no=source_no,
            description=description,
            record_date=record_date or date.today(),
            travel_from=travel_from,
            travel_to=travel_to,
            travel_purpose=travel_purpose,
            company_id=company_id,
            created_by=user_id,
        )
        db.add(line)

        await db.execute(
            text(
                "UPDATE projects SET actual_cost = COALESCE(actual_cost, 0) + :amt "
                "WHERE id = :pid AND company_id = :cid"
            ),
            {"amt": amount, "pid": project_id, "cid": company_id},
        )
        await db.flush()
        return line

    @staticmethod
    async def get_cost_summary(project_id: str, db: AsyncSession) -> dict:
        type_q = select(
            ProjectLine.line_type,
            func.coalesce(func.sum(ProjectLine.amount), 0).label("total"),
            func.count().label("count"),
        ).where(
            ProjectLine.project_id == project_id,
            ProjectLine.is_deleted == False,
        ).group_by(ProjectLine.line_type)

        type_result = (await db.execute(type_q)).all()
        by_type = {}
        total_cost = 0.0
        for r in type_result:
            amt = float(r.total or 0)
            by_type[r.line_type] = amt
            total_cost += amt

        project_result = await db.execute(
            select(Project.total_budget, Project.actual_cost).where(Project.id == project_id)
        )
        proj = project_result.one_or_none()
        total_budget = float(proj.total_budget or 0) if proj else 0

        return {
            "project_id": project_id,
            "total_cost": round(total_cost, 2),
            "total_budget": total_budget,
            "budget_usage_rate": round(total_cost / total_budget * 100, 2) if total_budget > 0 else None,
            "by_type": by_type,
        }

    @staticmethod
    async def get_monthly_trend(project_id: str, db: AsyncSession) -> list[dict]:
        q = select(
            func.to_char(ProjectLine.record_date, text("'YYYY-MM'")).label("month"),
            func.coalesce(func.sum(ProjectLine.amount), 0).label("total"),
        ).where(
            ProjectLine.project_id == project_id,
            ProjectLine.is_deleted == False,
            ProjectLine.record_date.isnot(None),
        ).group_by(
            func.to_char(ProjectLine.record_date, text("'YYYY-MM'")),
        ).order_by(text("month"))

        result = (await db.execute(q)).all()
        return [{"month": r.month, "amount": float(r.total or 0)} for r in result]

    @staticmethod
    async def auto_match_project(
        latitude: float,
        longitude: float,
        db: AsyncSession,
        company_id: str,
        limit: int = 5,
    ) -> list[dict]:
        haversine_sql = text(
            "SELECT pl.project_id, pl.location_name, pl.latitude, pl.longitude, "
            "pl.radius_meters, p.name AS project_name, p.project_type, p.status, "
            "(6371000 * acos(LEAST(1.0, "
            "cos(radians(pl.latitude)) * cos(radians(:lat)) * "
            "cos(radians(pl.longitude) - radians(:lng)) + "
            "sin(radians(pl.latitude)) * sin(radians(:lat))))) AS distance "
            "FROM project_locations pl "
            "JOIN projects p ON p.id = pl.project_id "
            "WHERE pl.company_id = :cid AND pl.is_deleted = false "
            "AND p.is_deleted = false "
            "ORDER BY distance "
            "LIMIT :lim"
        )
        result = await db.execute(
            haversine_sql,
            {"lat": latitude, "lng": longitude, "cid": company_id, "lim": limit},
        )
        rows = result.all()
        matches = []
        for r in rows:
            dist = float(r.distance or 0)
            radius = int(r.radius_meters or 500)
            matches.append({
                "project_id": str(r.project_id),
                "project_name": r.project_name,
                "project_type": r.project_type,
                "project_status": r.status,
                "location_name": r.location_name,
                "distance_meters": round(dist, 1),
                "within_radius": dist <= radius,
                "latitude": float(r.latitude) if r.latitude else None,
                "longitude": float(r.longitude) if r.longitude else None,
            })
        return matches

    @staticmethod
    async def allocate_from_contract(
        project_id: str,
        contract_id: str,
        amount: float,
        db: AsyncSession,
        company_id: str | None = None,
        user_id: str | None = None,
    ) -> ProjectLine:
        if not company_id or not user_id:
            proj = (await db.execute(
                select(Project).where(Project.id == project_id, Project.is_deleted == False)
            )).scalar_one_or_none()
            if not proj:
                raise ValueError("项目不存在")
            company_id = company_id or str(proj.company_id)
            user_id = user_id or str(proj.created_by)

        line = await ProjectCostService.allocate_cost(
            project_id=project_id,
            line_type="contract",
            amount=amount,
            source_id=contract_id,
            source_type="contract",
            source_no=f"CT-{contract_id}",
            db=db,
            company_id=company_id,
            user_id=user_id,
            description="合同金额分配",
        )
        return line

    @staticmethod
    async def allocate_from_petty_cash(
        project_id: str,
        expense_id: str,
        amount: float,
        db: AsyncSession,
        company_id: str | None = None,
        user_id: str | None = None,
    ) -> ProjectLine:
        if not company_id or not user_id:
            proj = (await db.execute(
                select(Project).where(Project.id == project_id, Project.is_deleted == False)
            )).scalar_one_or_none()
            if not proj:
                raise ValueError("项目不存在")
            company_id = company_id or str(proj.company_id)
            user_id = user_id or str(proj.created_by)

        line = await ProjectCostService.allocate_cost(
            project_id=project_id,
            line_type="petty_cash",
            amount=amount,
            source_id=expense_id,
            source_type="petty_cash",
            source_no=f"PC-{expense_id}",
            db=db,
            company_id=company_id,
            user_id=user_id,
            description="备用金支出分配",
        )
        return line

    @staticmethod
    async def allocate_from_salary(
        project_id: str,
        work_hour_id: str,
        hours: float,
        rate: float,
        db: AsyncSession,
        company_id: str | None = None,
        user_id: str | None = None,
    ) -> ProjectLine:
        if not company_id or not user_id:
            proj = (await db.execute(
                select(Project).where(Project.id == project_id, Project.is_deleted == False)
            )).scalar_one_or_none()
            if not proj:
                raise ValueError("项目不存在")
            company_id = company_id or str(proj.company_id)
            user_id = user_id or str(proj.created_by)

        amount = round(hours * rate, 2)
        line = await ProjectCostService.allocate_cost(
            project_id=project_id,
            line_type="salary",
            amount=amount,
            source_id=work_hour_id,
            source_type="work_hour",
            source_no=f"WH-{work_hour_id}",
            db=db,
            company_id=company_id,
            user_id=user_id,
            description=f"人工成本 ({hours}h x {rate}/h)",
        )
        return line

    @staticmethod
    async def allocate_from_invoice(
        project_id: str,
        invoice_id: str,
        amount: float,
        db: AsyncSession,
        company_id: str | None = None,
        user_id: str | None = None,
    ) -> ProjectLine:
        if not company_id or not user_id:
            proj = (await db.execute(
                select(Project).where(Project.id == project_id, Project.is_deleted == False)
            )).scalar_one_or_none()
            if not proj:
                raise ValueError("项目不存在")
            company_id = company_id or str(proj.company_id)
            user_id = user_id or str(proj.created_by)

        line = await ProjectCostService.allocate_cost(
            project_id=project_id,
            line_type="invoice",
            amount=amount,
            source_id=invoice_id,
            source_type="invoice",
            source_no=f"INV-{invoice_id}",
            db=db,
            company_id=company_id,
            user_id=user_id,
            description="发票金额分配",
        )
        return line

    @staticmethod
    async def allocate_from_procurement(
        project_id: str,
        po_id: str,
        amount: float,
        db: AsyncSession,
        company_id: str | None = None,
        user_id: str | None = None,
    ) -> ProjectLine:
        if not company_id or not user_id:
            proj = (await db.execute(
                select(Project).where(Project.id == project_id, Project.is_deleted == False)
            )).scalar_one_or_none()
            if not proj:
                raise ValueError("项目不存在")
            company_id = company_id or str(proj.company_id)
            user_id = user_id or str(proj.created_by)

        line = await ProjectCostService.allocate_cost(
            project_id=project_id,
            line_type="procurement",
            amount=amount,
            source_id=po_id,
            source_type="purchase_order",
            source_no=f"PO-{po_id}",
            db=db,
            company_id=company_id,
            user_id=user_id,
            description="采购到货分配",
        )
        return line

    @staticmethod
    async def allocate_from_electricity(
        project_id: str,
        payment_id: str,
        amount: float,
        period: str,
        db: AsyncSession,
        company_id: str | None = None,
        user_id: str | None = None,
    ) -> ProjectLine:
        if not company_id or not user_id:
            proj = (await db.execute(
                select(Project).where(Project.id == project_id, Project.is_deleted == False)
            )).scalar_one_or_none()
            if not proj:
                raise ValueError("项目不存在")
            company_id = company_id or str(proj.company_id)
            user_id = user_id or str(proj.created_by)

        line = await ProjectCostService.allocate_cost(
            project_id=project_id,
            line_type="electricity",
            amount=amount,
            source_id=payment_id,
            source_type="electricity_payment",
            source_no=f"EP-{payment_id}",
            db=db,
            company_id=company_id,
            user_id=user_id,
            description=f"电费支出分配 ({period})",
        )
        return line

    @staticmethod
    async def allocate_from_settlement(
        project_id: str,
        settlement_id: str,
        amount: float,
        direction: str,
        db: AsyncSession,
        company_id: str | None = None,
        user_id: str | None = None,
    ) -> ProjectLine:
        if not company_id or not user_id:
            proj = (await db.execute(
                select(Project).where(Project.id == project_id, Project.is_deleted == False)
            )).scalar_one_or_none()
            if not proj:
                raise ValueError("项目不存在")
            company_id = company_id or str(proj.company_id)
            user_id = user_id or str(proj.created_by)

        line_type = "settlement_in" if direction == "in" else "settlement_out"
        abs_amount = abs(amount)

        line = await ProjectCostService.allocate_cost(
            project_id=project_id,
            line_type=line_type,
            amount=abs_amount,
            source_id=settlement_id,
            source_type="settlement",
            source_no=f"STL-{settlement_id}",
            db=db,
            company_id=company_id,
            user_id=user_id,
            description=f"{'收款' if direction == 'in' else '付款'}结算分配",
        )

        if direction == "in":
            await db.execute(
                text(
                    "UPDATE projects SET actual_cost = COALESCE(actual_cost, 0) - :amt * 2 "
                    "WHERE id = :pid AND company_id = :cid"
                ),
                {"amt": abs_amount, "pid": project_id, "cid": company_id},
            )
            await db.flush()

        return line

    @staticmethod
    async def get_project_full_cost_breakdown(project_id: str, db: AsyncSession) -> dict:
        type_order = [
            "contract", "invoice", "procurement", "petty_cash",
            "salary", "electricity", "settlement",
        ]
        breakdown = {t: {"count": 0, "total": 0.0, "items": []} for t in type_order}

        lines_q = select(ProjectLine).where(
            ProjectLine.project_id == project_id,
            ProjectLine.is_deleted == False,
        ).order_by(ProjectLine.record_date)
        lines = (await db.execute(lines_q)).scalars().all()

        for line in lines:
            lt = line.line_type
            amt = float(line.amount or 0)
            group = "settlement" if lt.startswith("settlement") else lt
            if group not in breakdown:
                breakdown[group] = {"count": 0, "total": 0.0, "items": []}
            breakdown[group]["count"] += 1
            breakdown[group]["total"] = round(breakdown[group]["total"] + amt, 2)
            breakdown[group]["items"].append({
                "id": str(line.id),
                "line_type": lt,
                "amount": amt,
                "source_type": line.source_type,
                "source_no": line.source_no,
                "description": line.description,
                "record_date": line.record_date.isoformat() if line.record_date else None,
            })

        proj = (await db.execute(
            select(Project.total_budget, Project.actual_cost).where(Project.id == project_id)
        )).one_or_none()
        total_budget = float(proj.total_budget or 0) if proj else 0
        total_actual = float(proj.actual_cost or 0) if proj else 0

        return {
            "breakdown": breakdown,
            "total_budget": round(total_budget, 2),
            "total_actual": round(total_actual, 2),
            "budget_usage_rate": round(total_actual / total_budget * 100, 2) if total_budget > 0 else None,
            "remaining_budget": round(total_budget - total_actual, 2),
        }

    @staticmethod
    async def get_cost_by_stage(project_id: str, db: AsyncSession) -> dict:
        from app.models.workflow.engine import ProjectStage

        stage_result = await db.execute(
            select(ProjectStage).where(
                ProjectStage.project_id == project_id,
                ProjectStage.is_deleted == False,
            ).order_by(ProjectStage.stage_order)
        )
        stages = list(stage_result.scalars().all())

        trans_result = await db.execute(
            select(
                ProjectLine.line_type,
                func.coalesce(func.sum(ProjectLine.amount), 0).label("total"),
                func.count().label("count"),
                func.min(ProjectLine.record_date).label("earliest"),
                func.max(ProjectLine.record_date).label("latest"),
            ).where(
                ProjectLine.project_id == project_id,
                ProjectLine.is_deleted == False,
            ).group_by(ProjectLine.line_type)
        )
        type_rows = trans_result.all()

        by_type = {}
        total_cost = 0.0
        for r in type_rows:
            amt = float(r.total or 0)
            by_type[r.line_type] = {
                "amount": amt,
                "count": r.count,
                "earliest": r.earliest.isoformat() if r.earliest else None,
                "latest": r.latest.isoformat() if r.latest else None,
            }
            total_cost += amt

        proj = (await db.execute(
            select(Project.total_budget, Project.actual_cost).where(Project.id == project_id)
        )).one_or_none()
        total_budget = float(proj.total_budget or 0) if proj else 0

        stage_map = {}
        for s in stages:
            auto_result = s.auto_actions_result or {}
            stage_costs = []
            for action_name, action_data in auto_result.items():
                if isinstance(action_data, dict) and action_data.get("status") == "success":
                    res = action_data.get("result", {})
                    if isinstance(res, dict):
                        cost_amount = res.get("amount") or res.get("ar_amount") or res.get("retention_amount") or 0
                        if cost_amount:
                            stage_costs.append({"action": action_name, "amount": cost_amount})

            stage_map[s.stage_code] = {
                "stage_name": s.stage_name,
                "stage_order": s.stage_order,
                "status": s.status,
                "auto_action_costs": stage_costs,
            }

        return {
            "project_id": project_id,
            "total_cost": round(total_cost, 2),
            "total_budget": total_budget,
            "budget_usage_rate": round(total_cost / total_budget * 100, 2) if total_budget > 0 else None,
            "by_type": by_type,
            "by_stage": stage_map,
        }
