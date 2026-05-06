"""
Annotation Rule Engine for bank transactions.
Supports multi-condition matching with AND logic and first-match-wins priority.
"""
import json
import logging
import re
from datetime import datetime
from typing import Optional

from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.intelligence.models import BusinessKnowledge

logger = logging.getLogger(__name__)

VALID_OPERATORS = {"equals", "contains", "starts_with", "ends_with", "not_equals", "not_contains"}


def evaluate_condition(value: Optional[str], condition: dict) -> bool:
    """Evaluate a single condition against a transaction field value."""
    if not condition or not condition.get("value"):
        return True  # empty condition = wildcard
    if value is None:
        value = ""

    operator = condition.get("operator", "equals")
    cond_val = str(condition["value"]).lower()
    field_val = str(value).lower()

    if operator == "equals":
        return field_val == cond_val
    elif operator == "contains":
        return cond_val in field_val
    elif operator == "starts_with":
        return field_val.startswith(cond_val)
    elif operator == "ends_with":
        return field_val.endswith(cond_val)
    elif operator == "not_equals":
        return field_val != cond_val
    elif operator == "not_contains":
        return cond_val not in field_val
    return False


def transaction_matches_rule(transaction, rule_value: dict) -> bool:
    """Check if a transaction matches all conditions in a rule (AND logic)."""
    conditions = rule_value.get("conditions", {})
    if not conditions:
        return False

    # Counterparty
    cp_cond = conditions.get("counterparty")
    if cp_cond and not evaluate_condition(getattr(transaction, "counterparty", None), cp_cond):
        return False

    # Summary
    sum_cond = conditions.get("summary")
    if sum_cond and not evaluate_condition(getattr(transaction, "summary", None), sum_cond):
        return False

    # Purpose
    pur_cond = conditions.get("purpose")
    if pur_cond and not evaluate_condition(getattr(transaction, "purpose", None), pur_cond):
        return False

    # Counterparty account
    ca_cond = conditions.get("counterparty_account")
    if ca_cond and not evaluate_condition(getattr(transaction, "counterparty_account", None), ca_cond):
        return False

    # Account name
    an_cond = conditions.get("account_name")
    if an_cond and not evaluate_condition(getattr(transaction, "account_name", None), an_cond):
        return False

    # Transaction type (income/expense)
    tx_type = conditions.get("tx_type")
    if tx_type:
        t_type = getattr(transaction, "tx_type", "")
        if isinstance(tx_type, str):
            if tx_type.lower() not in (t_type or "").lower():
                return False
        elif isinstance(tx_type, dict):
            if not evaluate_condition(t_type, tx_type):
                return False

    # Amount range
    amount = float(getattr(transaction, "tx_amount", 0) or 0)
    min_amt = conditions.get("tx_amount_min")
    if min_amt is not None and amount < float(min_amt):
        return False
    max_amt = conditions.get("tx_amount_max")
    if max_amt is not None and amount > float(max_amt):
        return False

    # Entity
    entity_cond = conditions.get("entity_id")
    if entity_cond:
        tx_entity = str(getattr(transaction, "entity_id", "") or "")
        if str(entity_cond) != tx_entity:
            return False

    return True


async def load_annotation_rules(db: AsyncSession, company_id: str, active_only: bool = True) -> list:
    """Load all annotation rules from BusinessKnowledge table."""
    query = select(BusinessKnowledge).where(
        BusinessKnowledge.company_id == company_id,
        BusinessKnowledge.is_deleted == False,
        BusinessKnowledge.category.in_(["annotation_rule", "counterparty_mapping"]),
    )
    rules = (await db.execute(query)).scalars().all()

    result = []
    for rule in rules:
        try:
            value = rule.value if isinstance(rule.value, dict) else json.loads(rule.value)
            # Migrate legacy counterparty_mapping format
            if rule.category == "counterparty_mapping":
                value = _migrate_legacy_rule(value)
            if active_only and not value.get("is_active", True):
                continue
            value["_rule_id"] = str(rule.id)
            value["_rule_name"] = value.get("rule_name", rule.key or "unnamed")
            value["_category"] = rule.category
            value["_priority"] = value.get("priority", 0)
            result.append(value)
        except Exception as e:
            logger.warning(f"Failed to parse rule {rule.id}: {e}")
            continue

    result.sort(key=lambda r: r.get("_priority", 0), reverse=True)
    return result


def _migrate_legacy_rule(value: dict) -> dict:
    """Convert old counterparty_mapping format to new annotation_rule format."""
    if value.get("version") == 2:
        return value
    return {
        "version": 2,
        "rule_name": value.get("rule_name", "legacy rule"),
        "conditions": {
            "counterparty": {"operator": "contains", "value": value.get("counterparty", "")},
        },
        "actions": {
            "expense_type": value.get("expense_type"),
            "expense_subtype": value.get("expense_subtype"),
            "project_id": value.get("project_id"),
            "contract_id": value.get("contract_id"),
        },
        "is_active": True,
        "priority": 0,
        "match_count": value.get("match_count", 0),
    }


async def apply_rules_to_transactions(
    db: AsyncSession, transactions, rules: list, dry_run: bool = False
) -> dict:
    """Apply annotation rules to transactions. First-match-wins per transaction."""
    annotated = 0
    details = []
    for tx in transactions:
        if getattr(tx, "expense_type", None):
            continue  # already annotated
        for rule in rules:
            if transaction_matches_rule(tx, rule):
                actions = rule.get("actions", {})
                if not dry_run:
                    if actions.get("expense_type"):
                        tx.expense_type = actions["expense_type"]
                    if actions.get("expense_subtype"):
                        tx.expense_subtype = actions["expense_subtype"]
                    if actions.get("project_id"):
                        tx.project_id = actions["project_id"]
                    if actions.get("contract_id"):
                        tx.contract_id = actions["contract_id"]
                    if actions.get("remark"):
                        tx.remark = (tx.remark or "") + f" [规则:{rule.get('_rule_name')}]"
                    # Update rule stats
                    rule["match_count"] = rule.get("match_count", 0) + 1
                    rule["last_matched_at"] = datetime.now().isoformat()

                annotated += 1
                details.append({
                    "tx_id": str(tx.id),
                    "rule_id": rule.get("_rule_id"),
                    "rule_name": rule.get("_rule_name"),
                    "expense_type": actions.get("expense_type"),
                    "project_id": actions.get("project_id"),
                })
                break  # first match wins

    if not dry_run:
        # Persist rule match counts
        for rule in rules:
            if rule.get("match_count", 0) > 0 and rule.get("_rule_id"):
                try:
                    db_rule = (await db.execute(
                        select(BusinessKnowledge).where(BusinessKnowledge.id == rule["_rule_id"])
                    )).scalar_one_or_none()
                    if db_rule:
                        current = db_rule.value if isinstance(db_rule.value, dict) else json.loads(db_rule.value)
                        current["match_count"] = rule.get("match_count", 0)
                        current["last_matched_at"] = rule.get("last_matched_at")
                        db_rule.value = current
                except Exception as e:
                    logger.warning(f"Failed to update rule stats: {e}")
        await db.flush()

    return {
        "rules_applied": len(set(d["rule_id"] for d in details if d.get("rule_id"))),
        "transactions_annotated": annotated,
        "details": details,
    }


def generate_rule_from_transaction(tx, annotation: dict) -> dict:
    """Auto-generate a rule from a single transaction annotation."""
    conditions = {}
    if getattr(tx, "counterparty", None):
        conditions["counterparty"] = {"operator": "contains", "value": tx.counterparty}
    if getattr(tx, "summary", None):
        conditions["summary"] = {"operator": "contains", "value": tx.summary}

    return {
        "version": 2,
        "rule_name": f"{tx.counterparty or '未知'} → {annotation.get('expense_type', '?')}",
        "conditions": conditions,
        "actions": {
            "expense_type": annotation.get("expense_type"),
            "expense_subtype": annotation.get("expense_subtype"),
            "project_id": annotation.get("project_id"),
            "contract_id": annotation.get("contract_id"),
        },
        "is_active": True,
        "priority": 0,
        "match_count": 0,
    }
