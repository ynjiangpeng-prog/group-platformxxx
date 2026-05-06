"""
Bank Transaction Cascade Engine
银行流水级联引擎：标注/删除时自动联动下游业务模块

联动模块：合同付款、项目费用归集、备用金创建/核销、税务损失、ARAP自动匹配
支持双向：正向创建 + 回滚删除
所有操作幂等（通过 source_id + source_type 去重）
"""
import logging
import uuid
from datetime import date

from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project.models import BankTransaction, ProjectLine, CompanyEntity
from app.services.project_cost import ProjectCostService

logger = logging.getLogger(__name__)

PERSONAL_ACCOUNT_KEYWORDS = ["姜鹏"]


def capture_tx_snapshot(tx: BankTransaction) -> dict:
    """Capture current annotation state for diff comparison."""
    return {
        "contract_id": str(tx.contract_id) if tx.contract_id else None,
        "project_id": str(tx.project_id) if tx.project_id else None,
        "expense_type": tx.expense_type,
        "expense_subtype": tx.expense_subtype,
        "is_proxy_payment": tx.is_proxy_payment,
        "tax_loss": float(tx.tax_loss) if tx.tax_loss else None,
        "matched": tx.matched,
        "matched_arap_id": str(tx.matched_arap_id) if tx.matched_arap_id else None,
    }


# ─── Forward Cascades ───

async def _cascade_contract_paid(tx: BankTransaction, db: AsyncSession) -> str | None:
    """Idempotent: recalculate Contract.paid_amount from linked settlement records (not bank transactions)."""
    if not tx.contract_id:
        return None
    from app.models.erp.models import Contract
    from app.models.finance import SettlementRecord
    contract = (await db.execute(
        select(Contract).where(Contract.id == tx.contract_id, Contract.is_deleted == False)
    )).scalar_one_or_none()
    if not contract:
        return None

    # Sum all non-deleted settlement records linked to this contract
    # SettlementRecord is the source of truth for contract payments
    total_paid = (await db.execute(
        select(func.coalesce(func.sum(SettlementRecord.amount), 0)).where(
            SettlementRecord.contract_id == tx.contract_id,
            SettlementRecord.direction == "pay",
            SettlementRecord.is_deleted == False,
        )
    )).scalar() or 0

    old_paid = float(contract.paid_amount or 0)
    new_paid = float(total_paid)
    if contract.total_amount and new_paid > float(contract.total_amount):
        new_paid = float(contract.total_amount)
    contract.paid_amount = new_paid
    if abs(old_paid - new_paid) > 0.01:
        return f"合同 {contract.contract_no} 已付: {old_paid:.2f} → {new_paid:.2f}"
    return None


async def _cascade_project_line(tx: BankTransaction, db: AsyncSession, company_id: str, user_id: str) -> str | None:
    """Idempotent: create/update ProjectLine for cost tracking."""
    if not tx.project_id or not tx.expense_type:
        return None

    existing = (await db.execute(
        select(ProjectLine).where(
            ProjectLine.source_id == tx.id,
            ProjectLine.source_type == "bank_transaction",
            ProjectLine.is_deleted == False,
        )
    )).scalar_one_or_none()

    amount = abs(float(tx.tx_amount))
    desc = tx.expense_type
    if tx.expense_subtype:
        desc += f"/{tx.expense_subtype}"
    if tx.counterparty:
        desc += f" ({tx.counterparty})"

    if existing:
        old_amount = float(existing.amount)
        # Update amount diff on project actual_cost
        diff = amount - old_amount
        if abs(diff) > 0.01:
            await db.execute(text(
                "UPDATE projects SET actual_cost = COALESCE(actual_cost, 0) + :diff "
                "WHERE id = :pid AND company_id = :cid"
            ), {"diff": diff, "pid": tx.project_id, "cid": company_id})
        existing.amount = amount
        existing.description = desc
        existing.line_type = tx.expense_type
        return f"项目费用更新: {tx.expense_type} ¥{amount:.2f}"
    else:
        await ProjectCostService.allocate_cost(
            project_id=tx.project_id,
            line_type=tx.expense_type,
            amount=amount,
            source_id=str(tx.id),
            source_type="bank_transaction",
            source_no=tx.source_ref or tx.import_batch,
            db=db,
            company_id=company_id,
            user_id=user_id,
            record_date=tx.tx_date,
            description=desc,
        )
        return f"项目费用归集: {tx.expense_type} ¥{amount:.2f}"


async def _cascade_tax_loss_line(tx: BankTransaction, db: AsyncSession, company_id: str, user_id: str) -> str | None:
    """Idempotent: create ProjectLine for tax loss on proxy payments."""
    if not tx.tax_loss or float(tx.tax_loss) <= 0 or not tx.project_id:
        return None

    existing = (await db.execute(
        select(ProjectLine).where(
            ProjectLine.source_id == tx.id,
            ProjectLine.source_type == "bank_tax_loss",
            ProjectLine.is_deleted == False,
        )
    )).scalar_one_or_none()

    tax_amount = float(tx.tax_loss)
    if existing:
        diff = tax_amount - float(existing.amount)
        if abs(diff) > 0.01:
            await db.execute(text(
                "UPDATE projects SET actual_cost = COALESCE(actual_cost, 0) + :diff "
                "WHERE id = :pid AND company_id = :cid"
            ), {"diff": diff, "pid": tx.project_id, "cid": company_id})
        existing.amount = tax_amount
        return f"税务损失更新: ¥{tax_amount:.2f}"
    else:
        await ProjectCostService.allocate_cost(
            project_id=tx.project_id,
            line_type="税务损失",
            amount=tax_amount,
            source_id=str(tx.id),
            source_type="bank_tax_loss",
            source_no=tx.import_batch,
            db=db,
            company_id=company_id,
            user_id=user_id,
            record_date=tx.tx_date,
            description=f"代收代付税务损失 (税率{tx.tax_rate}%)",
        )
        return f"税务损失归集: ¥{tax_amount:.2f}"


async def _cascade_petty_cash_fund(tx: BankTransaction, db: AsyncSession, company_id: str, user_id: str) -> str | None:
    """Auto-create PettyCashFund when corporate pays to 姜鹏 (boss/personal card)."""
    if tx.fund_level != 2 or float(tx.tx_amount) >= 0:
        return None
    counterparty = (tx.counterparty or "").strip()
    is_personal = any(kw in counterparty for kw in PERSONAL_ACCOUNT_KEYWORDS)
    if not is_personal or not tx.expense_type or tx.expense_type != "备用金":
        return None
    if not tx.project_id:
        return None

    from app.models.petty_cash.models import PettyCashFund

    # Check if active fund already exists for this project + boss
    existing_fund = (await db.execute(
        select(PettyCashFund).where(
            PettyCashFund.project_id == tx.project_id,
            PettyCashFund.status == "active",
            PettyCashFund.is_deleted == False,
            PettyCashFund.company_id == company_id,
        )
    )).scalar_one_or_none()

    if existing_fund:
        # Add to existing fund
        amount = abs(float(tx.tx_amount))
        existing_fund.amount = float(existing_fund.amount) + amount
        existing_fund.remaining_amount = float(existing_fund.remaining_amount) + amount
        return f"追加备用金: ¥{amount:.2f} → 累计 ¥{float(existing_fund.amount):.2f}"

    # Find boss user_id (system admin)
    from app.models.organization import User
    boss = (await db.execute(
        select(User).where(User.is_super_admin == True, User.company_id == company_id)
    )).scalar_one_or_none()
    if not boss:
        return None

    amount = abs(float(tx.tx_amount))
    fund_no = f"BYJ-{tx.tx_date.strftime('%Y%m')}-{str(uuid.uuid4())[:6]}"
    fund = PettyCashFund(
        fund_no=fund_no,
        project_id=tx.project_id,
        employee_id=boss.id,
        amount=amount,
        used_amount=0,
        remaining_amount=amount,
        purpose=f"备用金-{counterparty}",
        issue_date=tx.tx_date,
        status="active",
        company_id=company_id,
        created_by=user_id,
    )
    db.add(fund)
    return f"自动创建备用金: {fund_no} ¥{amount:.2f}"


async def _cascade_petty_cash_expense(tx: BankTransaction, db: AsyncSession, company_id: str, user_id: str) -> str | None:
    """Auto-create PettyCashExpense when L3 (WeChat/Alipay) expense is annotated with project."""
    if tx.fund_level != 3 or float(tx.tx_amount) >= 0 or not tx.project_id:
        return None

    from app.models.petty_cash.models import PettyCashFund, PettyCashExpense

    # Check idempotency
    idempotency_key = f"bank_tx:{tx.id}"
    existing_exp = (await db.execute(
        select(PettyCashExpense).where(
            PettyCashExpense.remark == idempotency_key,
            PettyCashExpense.is_deleted == False,
        )
    )).scalar_one_or_none()
    if existing_exp:
        return None  # Already created

    # Find active fund for this project
    fund = (await db.execute(
        select(PettyCashFund).where(
            PettyCashFund.project_id == tx.project_id,
            PettyCashFund.status == "active",
            PettyCashFund.is_deleted == False,
            PettyCashFund.company_id == company_id,
        )
    )).scalar_one_or_none()
    if not fund:
        return None  # No active fund to expense against

    amount = abs(float(tx.tx_amount))
    if amount > float(fund.remaining_amount) + 0.01:
        return f"备用金不足 (余额¥{float(fund.remaining_amount):.2f}, 需¥{amount:.2f})"

    # Find boss user_id
    from app.models.organization import User
    boss = (await db.execute(
        select(User).where(User.is_super_admin == True, User.company_id == company_id)
    )).scalar_one_or_none()

    exp = PettyCashExpense(
        fund_id=fund.id,
        project_id=tx.project_id,
        expense_date=tx.tx_date,
        category=tx.expense_type or "其他",
        amount=amount,
        description=tx.summary or tx.counterparty or "微信/支付宝支出",
        status="pending",
        remark=idempotency_key,
        company_id=company_id,
        created_by=user_id,
    )
    db.add(exp)
    await db.flush()

    # Update fund amounts
    fund.used_amount = float(fund.used_amount) + amount
    fund.remaining_amount = float(fund.remaining_amount) - amount
    if float(fund.remaining_amount) <= 0.01:
        fund.status = "settled"

    # Also allocate to project cost
    await ProjectCostService.allocate_cost(
        project_id=tx.project_id,
        line_type="petty_cash",
        amount=amount,
        source_id=str(exp.id),
        source_type="PettyCashExpense",
        source_no=None,
        db=db,
        company_id=company_id,
        user_id=user_id,
        record_date=tx.tx_date,
        description=f"备用金核销: {tx.summary or tx.counterparty or ''}",
    )

    return f"备用金核销: ¥{amount:.2f} (余额 ¥{float(fund.remaining_amount):.2f})"


async def _cascade_arap_auto_match(tx: BankTransaction, db: AsyncSession, company_id: str, user_id: str) -> str | None:
    """Auto-match bank transaction to ArApRecord if counterparty+amount matches."""
    if tx.matched or float(tx.tx_amount) >= 0:
        return None

    from app.models.finance import ArApRecord
    tx_amount = abs(float(tx.tx_amount))

    # Find unmatched AP records with similar amount and counterparty
    candidates = (await db.execute(
        select(ArApRecord).where(
            ArApRecord.is_deleted == False,
            ArApRecord.company_id == company_id,
            ArApRecord.remaining_amount > 0,
            ArApRecord.type == "ap",
        )
    )).scalars().all()

    best = None
    best_score = 0
    for arap in candidates:
        arap_amount = float(arap.remaining_amount)
        if abs(tx_amount - arap_amount) > 0.01:
            continue
        score = 1
        if tx.contract_id and arap.contract_id and str(tx.contract_id) == str(arap.contract_id):
            score += 5  # Contract match is very strong signal
        if tx.counterparty and arap.counterparty:
            if tx.counterparty in arap.counterparty or arap.counterparty in tx.counterparty:
                score += 3
        if tx.project_id and arap.project_id and str(tx.project_id) == str(arap.project_id):
            score += 2
        if score > best_score:
            best_score = score
            best = arap

    if best and best_score >= 3:
        tx.matched = True
        tx.matched_arap_id = best.id
        best.settled_amount = float(best.settled_amount) + tx_amount
        best.remaining_amount = float(best.total_amount) - float(best.settled_amount)
        if float(best.remaining_amount) <= 0.01:
            best.status = "settled"
        return f"自动匹配AR/AP: {best.source_no or best.id}"

    return None


async def _cascade_auto_remark(tx: BankTransaction, db: AsyncSession) -> str | None:
    """Auto-set remark for personal card transactions."""
    if tx.remark:
        return None
    counterparty = (tx.counterparty or "").strip()
    for kw in PERSONAL_ACCOUNT_KEYWORDS:
        if kw in counterparty and tx.expense_type == "备用金":
            tx.remark = f"备用金-{counterparty}"
            return f"自动备注: 备用金-{counterparty}"
    return None


# ─── Reverse Cascades ───

async def _reverse_contract_paid(tx: BankTransaction, db: AsyncSession) -> str | None:
    """Recalculate contract paid_amount after removing this tx's contribution."""
    if not tx.contract_id:
        return None
    # Just recalculate from scratch (idempotent)
    from app.models.erp.models import Contract
    contract = (await db.execute(
        select(Contract).where(Contract.id == tx.contract_id, Contract.is_deleted == False)
    )).scalar_one_or_none()
    if not contract:
        return None
    old = float(contract.paid_amount)
    result = await _cascade_contract_paid(tx, db)
    return result or f"合同 {contract.contract_no} 已付回滚: {old:.2f}"


async def _reverse_project_lines(tx: BankTransaction, db: AsyncSession, company_id: str) -> list[str]:
    """Soft-delete all ProjectLines created by this transaction and reverse project actual_cost."""
    results = []
    lines = (await db.execute(
        select(ProjectLine).where(
            ProjectLine.source_id == tx.id,
            ProjectLine.source_type.in_(["bank_transaction", "bank_tax_loss"]),
            ProjectLine.is_deleted == False,
        )
    )).scalars().all()

    for line in lines:
        # Reverse project actual_cost
        if line.project_id:
            await db.execute(text(
                "UPDATE projects SET actual_cost = COALESCE(actual_cost, 0) - :amt "
                "WHERE id = :pid AND company_id = :cid"
            ), {"amt": float(line.amount), "pid": line.project_id, "cid": company_id})
        line.is_deleted = True
        results.append(f"回滚项目费用: {line.line_type} ¥{float(line.amount):.2f}")

    return results


async def _reverse_petty_cash(tx: BankTransaction, db: AsyncSession, company_id: str) -> list[str]:
    """Reverse petty cash expense created by this transaction."""
    results = []
    idempotency_key = f"bank_tx:{tx.id}"

    from app.models.petty_cash.models import PettyCashExpense
    expenses = (await db.execute(
        select(PettyCashExpense).where(
            PettyCashExpense.remark == idempotency_key,
            PettyCashExpense.is_deleted == False,
        )
    )).scalars().all()

    for exp in expenses:
        # Reverse fund amounts
        from app.models.petty_cash.models import PettyCashFund
        fund = (await db.execute(
            select(PettyCashFund).where(PettyCashFund.id == exp.fund_id)
        )).scalar_one_or_none()
        if fund:
            fund.used_amount = float(fund.used_amount) - float(exp.amount)
            fund.remaining_amount = float(fund.remaining_amount) + float(exp.amount)
            if fund.status == "settled" and float(fund.remaining_amount) > 0.01:
                fund.status = "active"
            results.append(f"回滚备用金核销: ¥{float(exp.amount):.2f}")

        # Reverse ProjectLine for petty cash
        plines = (await db.execute(
            select(ProjectLine).where(
                ProjectLine.source_id == str(exp.id),
                ProjectLine.source_type == "PettyCashExpense",
                ProjectLine.is_deleted == False,
            )
        )).scalars().all()
        for pl in plines:
            if pl.project_id:
                await db.execute(text(
                    "UPDATE projects SET actual_cost = COALESCE(actual_cost, 0) - :amt "
                    "WHERE id = :pid AND company_id = :cid"
                ), {"amt": float(pl.amount), "pid": pl.project_id, "cid": company_id})
            pl.is_deleted = True

        exp.is_deleted = True

    return results


async def _reverse_arap_match(tx: BankTransaction, db: AsyncSession) -> str | None:
    """Reverse AR/AP match."""
    if not tx.matched or not tx.matched_arap_id:
        return None

    from app.models.finance import ArApRecord
    arap = (await db.execute(
        select(ArApRecord).where(ArApRecord.id == tx.matched_arap_id)
    )).scalar_one_or_none()
    if not arap:
        return None

    amount = abs(float(tx.tx_amount))
    arap.settled_amount = max(0, float(arap.settled_amount) - amount)
    arap.remaining_amount = float(arap.total_amount) - float(arap.settled_amount)
    if arap.status == "settled" and float(arap.remaining_amount) > 0.01:
        arap.status = "partial_paid" if float(arap.settled_amount) > 0 else "pending"

    tx.matched = False
    tx.matched_arap_id = None
    return f"回滚AR/AP匹配: {arap.source_no or str(arap.id)}"


# ─── Main Entry Points ───

async def cascade_on_annotate(
    tx: BankTransaction,
    before: dict,
    db: AsyncSession,
    company_id: str,
    user_id: str,
) -> list[str]:
    """Run all forward cascades after annotation update.
    Receives 'before' snapshot to detect changes for reverse+rebuild."""
    synced = []

    # Step 1: If key fields changed, reverse old cascades first
    if before["contract_id"] and before["contract_id"] != (str(tx.contract_id) if tx.contract_id else None):
        old_tx = BankTransaction.__new__(BankTransaction)
        old_tx.id = tx.id
        old_tx.contract_id = uuid.UUID(before["contract_id"]) if before["contract_id"] else None
        r = await _reverse_contract_paid(old_tx, db)
        if r:
            synced.append(r)

    if before["project_id"] != (str(tx.project_id) if tx.project_id else None):
        reversals = await _reverse_project_lines(tx, db, company_id)
        synced.extend(reversals)
        reversals_pc = await _reverse_petty_cash(tx, db, company_id)
        synced.extend(reversals_pc)

    if before["matched"] and not tx.matched:
        r = await _reverse_arap_match(tx, db)
        if r:
            synced.append(r)

    # Step 2: Run forward cascades
    r = await _cascade_auto_remark(tx, db)
    if r:
        synced.append(r)

    r = await _cascade_contract_paid(tx, db)
    if r:
        synced.append(r)

    r = await _cascade_project_line(tx, db, company_id, user_id)
    if r:
        synced.append(r)

    r = await _cascade_tax_loss_line(tx, db, company_id, user_id)
    if r:
        synced.append(r)

    r = await _cascade_petty_cash_fund(tx, db, company_id, user_id)
    if r:
        synced.append(r)

    r = await _cascade_petty_cash_expense(tx, db, company_id, user_id)
    if r:
        synced.append(r)

    # Step 3: Try AR/AP auto-match if still unmatched
    if not tx.matched:
        r = await _cascade_arap_auto_match(tx, db, company_id, user_id)
        if r:
            synced.append(r)

    await db.flush()
    return synced


async def cascade_on_delete(
    tx: BankTransaction,
    db: AsyncSession,
    company_id: str,
    user_id: str,
) -> list[str]:
    """Reverse all cascades before soft-deleting the transaction."""
    reversed_items = []

    r = await _reverse_arap_match(tx, db)
    if r:
        reversed_items.append(r)

    reversals = await _reverse_project_lines(tx, db, company_id)
    reversed_items.extend(reversals)

    reversals_pc = await _reverse_petty_cash(tx, db, company_id)
    reversed_items.extend(reversals_pc)

    # Recalculate contract paid
    if tx.contract_id:
        r = await _reverse_contract_paid(tx, db)
        if r:
            reversed_items.append(r)

    await db.flush()
    return reversed_items
