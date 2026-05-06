from datetime import datetime

PREFIXES = {
    "contract": "HT",
    "invoice_in": "FP-IN",
    "invoice_out": "FP-OUT",
    "voucher": "PZ",
    "arap": "AR",
    "settlement": "JS",
    "purchase_order": "PO",
    "procurement_request": "PR",
    "goods_receipt": "GR",
    "work_order": "GD",
    "inspection": "XC",
    "construction_log": "SG",
    "safety_inspection": "AQ",
    "ticket": "ST",
}


async def generate_number(session, model_class, number_field: str | None, prefix_key: str, company_id: str):
    from sqlalchemy import select, func

    today = datetime.now()
    date_str = today.strftime("%Y%m%d")
    prefix = PREFIXES.get(prefix_key, "XX")

    if number_field:
        pattern = f"{prefix}-{date_str}%"
        count_q = select(func.count()).select_from(model_class).where(
            model_class.company_id == company_id,
            model_class.is_deleted == False,
            getattr(model_class, number_field).like(pattern),
        )
    else:
        start = today.replace(hour=0, minute=0, second=0, microsecond=0)
        count_q = select(func.count()).select_from(model_class).where(
            model_class.company_id == company_id,
            model_class.is_deleted == False,
            model_class.created_at >= start,
        )

    result = await session.execute(count_q)
    count = result.scalar() or 0
    seq = str(count + 1).zfill(3)
    return f"{prefix}-{date_str}-{seq}"
