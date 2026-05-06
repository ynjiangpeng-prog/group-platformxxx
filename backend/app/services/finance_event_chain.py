import logging
from datetime import date

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance.models import ArApRecord, Invoice
from app.models.project.models import BankTransaction, Project

logger = logging.getLogger(__name__)

_COMPANY_SUFFIXES = ["有限责任公司", "有限公司", "股份有限公司", "股份公司", "有限合伙", "普通合伙"]


def _strip_company_suffix(name: str) -> str:
    for s in _COMPANY_SUFFIXES:
        if name.endswith(s):
            return name[: -len(s)]
    return name


class FinanceEventChain:

    async def _load_counterparty_map(self, db: AsyncSession, company_id: str) -> dict[str, str]:
        from app.models.erp.models import Supplier, Customer
        cp_name_map = {}
        for s in (await db.execute(
            select(Supplier).where(Supplier.company_id == company_id, Supplier.is_deleted == False)
        )).scalars().all():
            cp_name_map[str(s.id)] = s.name
        for c in (await db.execute(
            select(Customer).where(Customer.company_id == company_id, Customer.is_deleted == False)
        )).scalars().all():
            cp_name_map[str(c.id)] = c.name
        return cp_name_map

    async def on_bank_import(self, db: AsyncSession, company_id: str) -> dict:
        result = await self._auto_match_and_settle(db, company_id)

        unmatched = (await db.execute(
            select(BankTransaction).where(
                BankTransaction.company_id == company_id, BankTransaction.is_deleted == False,
                BankTransaction.matched == False, BankTransaction.project_id == None,
            )
        )).scalars().all()

        cp_map = await self._load_counterparty_map(db, company_id)

        auto_linked = 0
        for bt in unmatched:
            project_id = await self._infer_project_from_counterparty(db, company_id, bt, cp_map)
            if project_id:
                bt.project_id = project_id
                auto_linked += 1

        if auto_linked > 0:
            await db.flush()

        auto_annotated = await self._apply_learned_mappings(db, company_id)

        return {
            "arap_matched": result["matched"],
            "arap_settled": result["settled"],
            "auto_linked_to_project": auto_linked,
            "auto_annotated": auto_annotated,
        }

    async def _auto_match_and_settle(self, db: AsyncSession, company_id: str) -> dict:
        unmatched_banks = (await db.execute(
            select(BankTransaction).where(
                BankTransaction.company_id == company_id, BankTransaction.is_deleted == False,
                BankTransaction.matched == False,
            )
        )).scalars().all()

        if not unmatched_banks:
            return {"matched": 0, "settled": 0}

        unmatched_araps = (await db.execute(
            select(ArApRecord).where(
                ArApRecord.company_id == company_id, ArApRecord.is_deleted == False,
                ArApRecord.remaining_amount > 0,
            )
        )).scalars().all()

        if not unmatched_araps:
            return {"matched": 0, "settled": 0}

        cp_name_map = await self._load_counterparty_map(db, company_id)

        def resolve_name(val: str | None) -> str:
            if not val:
                return ""
            return cp_name_map.get(val.strip(), val.strip())

        matched = 0
        settled = 0

        for bt in unmatched_banks:
            tx_amount = abs(float(bt.tx_amount or 0))
            if tx_amount == 0:
                continue

            best_match = None
            best_score = 0.0
            best_cp_exact = False

            for arap in unmatched_araps:
                remaining = float(arap.remaining_amount or 0)
                if remaining <= 0:
                    continue

                score = 0.0

                if abs(tx_amount - remaining) < 0.01:
                    score += 0.5
                elif abs(tx_amount - remaining) / max(remaining, 1) < 0.02:
                    score += 0.35
                elif abs(tx_amount - remaining) / max(remaining, 1) < 0.05:
                    score += 0.2

                cp_bt = resolve_name(bt.counterparty)
                cp_arap = resolve_name(arap.counterparty)
                counterparty_exact = False
                if cp_bt and cp_arap:
                    if cp_bt == cp_arap:
                        score += 0.4
                        counterparty_exact = True
                    elif cp_bt in cp_arap or cp_arap in cp_bt:
                        score += 0.3
                    elif self._fuzzy_match_name(cp_bt, cp_arap):
                        score += 0.2

                if bt.tx_date and arap.due_date:
                    try:
                        days_diff = abs((bt.tx_date - arap.due_date).days)
                    except (TypeError, ValueError):
                        days_diff = 999
                    if days_diff <= 3:
                        score += 0.2
                    elif days_diff <= 7:
                        score += 0.1

                is_correct_direction = (
                    (float(bt.tx_amount) < 0 and arap.type == "ap") or
                    (float(bt.tx_amount) > 0 and arap.type == "ar")
                )
                if is_correct_direction:
                    score += 0.1

                if arap.project_id and bt.project_id and str(arap.project_id) == str(bt.project_id):
                    score += 0.15

                if score > best_score:
                    best_score = score
                    best_match = arap
                    best_cp_exact = counterparty_exact

            if best_match and (best_score >= 0.6 or (best_cp_exact and best_score >= 0.45)):
                settle_amount = min(tx_amount, float(best_match.remaining_amount))
                best_match.settled_amount = float(best_match.settled_amount or 0) + settle_amount
                best_match.remaining_amount = float(best_match.total_amount or 0) - float(best_match.settled_amount)
                if float(best_match.remaining_amount) <= 0.01:
                    best_match.remaining_amount = 0
                    best_match.status = "settled"
                    settled += 1

                bt.matched = True
                bt.matched_arap_id = str(best_match.id)

                if best_match.project_id and not bt.project_id:
                    bt.project_id = best_match.project_id
                if best_match.contract_id and not bt.contract_id:
                    bt.contract_id = best_match.contract_id

                if not bt.project_id:
                    inferred = await self._infer_project_from_counterparty(db, company_id, bt, cp_name_map)
                    if inferred:
                        bt.project_id = inferred
                        if not best_match.project_id:
                            best_match.project_id = inferred

                if float(best_match.remaining_amount) <= 0:
                    unmatched_araps = [a for a in unmatched_araps if a.id != best_match.id]

                matched += 1

        await db.flush()
        return {"matched": matched, "settled": settled}

    def _fuzzy_match_name(self, name1: str, name2: str) -> bool:
        n1 = _strip_company_suffix(name1).replace("科技", "").replace("集团", "").strip()[:4]
        n2 = _strip_company_suffix(name2).replace("科技", "").replace("集团", "").strip()[:4]
        return n1 and n2 and (n1 in n2 or n2 in n1)

    async def _infer_project_from_counterparty(
        self, db: AsyncSession, company_id: str, bt: BankTransaction,
        cp_map: dict[str, str] | None = None,
    ) -> str | None:
        if not bt.counterparty:
            return None
        cp = bt.counterparty.strip()

        from app.models.erp.models import Contract

        if not cp_map:
            cp_map = await self._load_counterparty_map(db, company_id)

        def resolve(val: str | None) -> str:
            if not val:
                return ""
            return cp_map.get(val.strip(), val.strip())

        contracts = (await db.execute(
            select(Contract).where(
                Contract.company_id == company_id, Contract.is_deleted == False,
                Contract.project_id != None,
            ).order_by(Contract.created_at.desc()).limit(20)
        )).scalars().all()

        for c in contracts:
            party_a_name = c.party_a or ""
            party_b_name = resolve(c.party_b)

            if party_a_name and (cp in party_a_name or party_a_name in cp) and c.project_id:
                return str(c.project_id)
            if party_b_name and (cp in party_b_name or party_b_name in cp) and c.project_id:
                return str(c.project_id)

        similar_arap = (await db.execute(
            select(ArApRecord).where(
                ArApRecord.company_id == company_id, ArApRecord.is_deleted == False,
                ArApRecord.project_id != None,
            ).order_by(ArApRecord.created_at.desc()).limit(50)
        )).scalars().all()

        for arap in similar_arap:
            if not arap.counterparty:
                continue
            arap_cp_name = resolve(arap.counterparty)
            if arap_cp_name and (cp in arap_cp_name or arap_cp_name in cp) and arap.project_id:
                return str(arap.project_id)

        return None

    async def _apply_learned_mappings(self, db: AsyncSession, company_id: str) -> int:
        try:
            from app.models.intelligence.models import BusinessKnowledge
            import json
            patterns = (await db.execute(
                select(BusinessKnowledge).where(
                    BusinessKnowledge.category == "counterparty_mapping",
                    BusinessKnowledge.is_active == True,
                    BusinessKnowledge.company_id == company_id,
                )
            )).scalars().all()
            if not patterns:
                return 0

            unannotated = (await db.execute(
                select(BankTransaction).where(
                    BankTransaction.company_id == company_id,
                    BankTransaction.is_deleted == False,
                    BankTransaction.expense_type == None,
                )
            )).scalars().all()

            annotated = 0
            for bt in unannotated:
                if not bt.counterparty:
                    continue
                cp = bt.counterparty.strip()
                for kp in patterns:
                    key = kp.key
                    if key and (key in cp or cp in key):
                        mapping = json.loads(kp.value) if isinstance(kp.value, str) else (kp.value or {})
                        if mapping.get("expense_type"):
                            bt.expense_type = mapping["expense_type"]
                        if mapping.get("project_id") and not bt.project_id:
                            bt.project_id = mapping["project_id"]
                        annotated += 1
                        break

            if annotated > 0:
                await db.flush()
            return annotated
        except Exception:
            return 0

    async def on_invoice_verified(self, db: AsyncSession, invoice_id: str) -> dict:
        invoice = (await db.execute(
            select(Invoice).where(Invoice.id == invoice_id)
        )).scalar_one_or_none()
        if not invoice:
            return {"error": "invoice not found"}

        matching_banks = await self._find_matching_bank_transactions(db, invoice)

        result = {"matching_bank_count": len(matching_banks), "auto_settled": 0}

        for bt in matching_banks:
            arap = (await db.execute(
                select(ArApRecord).where(
                    ArApRecord.business_type == "invoice",
                    ArApRecord.business_id == invoice_id,
                    ArApRecord.is_deleted == False,
                    ArApRecord.remaining_amount > 0,
                )
            )).scalar_one_or_none()

            if arap:
                settle_amount = min(abs(float(bt.tx_amount)), float(arap.remaining_amount))
                arap.settled_amount = float(arap.settled_amount or 0) + settle_amount
                arap.remaining_amount = float(arap.total_amount or 0) - float(arap.settled_amount)
                if float(arap.remaining_amount) <= 0.01:
                    arap.remaining_amount = 0
                    arap.status = "settled"

                bt.matched = True
                bt.matched_arap_id = str(arap.id)
                if arap.project_id and not bt.project_id:
                    bt.project_id = arap.project_id
                if invoice.contract_id and not bt.contract_id:
                    bt.contract_id = invoice.contract_id

                result["auto_settled"] += 1

        if result["auto_settled"] > 0:
            await db.flush()

        return result

    async def _find_matching_bank_transactions(self, db: AsyncSession, invoice: Invoice) -> list:
        amount = float(invoice.total_amount or 0)
        if amount <= 0:
            return []

        direction = invoice.direction
        counterparty = invoice.seller_name if direction == "in" else invoice.buyer_name

        query = select(BankTransaction).where(
            BankTransaction.company_id == invoice.company_id,
            BankTransaction.is_deleted == False,
            BankTransaction.matched == False,
        )

        if direction == "in":
            query = query.where(BankTransaction.tx_amount < 0)
        else:
            query = query.where(BankTransaction.tx_amount > 0)

        candidates = (await db.execute(query)).scalars().all()

        matched = []
        for bt in candidates:
            tx_amt = abs(float(bt.tx_amount))
            if abs(tx_amt - amount) / max(amount, 1) > 0.05:
                continue

            if counterparty and bt.counterparty:
                cp_clean = counterparty.strip()
                bt_clean = bt.counterparty.strip()
                if cp_clean in bt_clean or bt_clean in cp_clean:
                    matched.append(bt)
                    continue
                if self._fuzzy_match_name(cp_clean, bt_clean):
                    matched.append(bt)
                    continue

            if invoice.issue_date and bt.tx_date:
                try:
                    days = abs((bt.tx_date - invoice.issue_date).days)
                    if days <= 7 and abs(tx_amt - amount) < 0.01:
                        matched.append(bt)
                except (TypeError, ValueError):
                    pass

        return matched

    async def get_project_financial_summary(self, db: AsyncSession, company_id: str, project_id: str) -> dict:
        from app.models.erp.models import Contract
        contract_rows = (await db.execute(
            select(Contract.name, Contract.total_amount, Contract.status, Contract.entity_id).where(
                Contract.project_id == project_id, Contract.is_deleted == False,
            )
        )).all()

        invoices_total = float((await db.execute(
            select(func.coalesce(func.sum(Invoice.total_amount), 0)).where(
                Invoice.project_id == project_id, Invoice.is_deleted == False,
            )
        )).scalar() or 0)

        ar_rows = (await db.execute(
            select(
                func.coalesce(func.sum(ArApRecord.remaining_amount), 0),
                func.coalesce(func.sum(ArApRecord.settled_amount), 0),
            ).where(
                ArApRecord.project_id == project_id, ArApRecord.is_deleted == False,
                ArApRecord.type == "ar",
            )
        )).one()
        ar_remaining, ar_settled = float(ar_rows[0] or 0), float(ar_rows[1] or 0)

        ap_rows = (await db.execute(
            select(
                func.coalesce(func.sum(ArApRecord.remaining_amount), 0),
                func.coalesce(func.sum(ArApRecord.settled_amount), 0),
            ).where(
                ArApRecord.project_id == project_id, ArApRecord.is_deleted == False,
                ArApRecord.type == "ap",
            )
        )).one()
        ap_remaining, ap_settled = float(ap_rows[0] or 0), float(ap_rows[1] or 0)

        bank_in = float((await db.execute(
            select(func.coalesce(func.sum(BankTransaction.tx_amount), 0)).where(
                BankTransaction.project_id == project_id, BankTransaction.is_deleted == False,
                BankTransaction.tx_amount > 0,
            )
        )).scalar() or 0)

        bank_out = float((await db.execute(
            select(func.coalesce(func.sum(BankTransaction.tx_amount), 0)).where(
                BankTransaction.project_id == project_id, BankTransaction.is_deleted == False,
                BankTransaction.tx_amount < 0,
            )
        )).scalar() or 0)

        project = (await db.execute(
            select(Project).where(Project.id == project_id)
        )).scalar_one_or_none()

        return {
            "project": {
                "id": str(project.id) if project else None,
                "name": project.name if project else None,
                "budget": float(project.total_budget or 0) if project else 0,
                "actual_cost": float(project.actual_cost or 0) if project else 0,
            },
            "contracts": [{"name": r[0], "amount": float(r[1] or 0), "status": r[2], "entity_id": str(r[3]) if r[3] else None} for r in contract_rows],
            "contracts_total": sum(float(r[1] or 0) for r in contract_rows),
            "invoices_total": invoices_total,
            "ar": {"total": ar_remaining + ar_settled, "settled": ar_settled, "remaining": ar_remaining},
            "ap": {"total": ap_remaining + ap_settled, "settled": ap_settled, "remaining": ap_remaining},
            "bank": {"inflow": bank_in, "outflow": abs(bank_out), "net": bank_in + bank_out},
            "collection_rate": round(ar_settled / (ar_remaining + ar_settled) * 100, 1) if (ar_remaining + ar_settled) > 0 else 0,
            "payment_rate": round(ap_settled / (ap_remaining + ap_settled) * 100, 1) if (ap_remaining + ap_settled) > 0 else 0,
        }


finance_event_chain = FinanceEventChain()
