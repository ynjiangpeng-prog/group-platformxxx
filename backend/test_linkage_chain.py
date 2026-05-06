"""
全模块联动测试脚本 - 通过API模拟真实业务流程
测试举一反三：1能联动3，3也能联动1
"""
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import requests
import json
import time as _time
from datetime import date, timedelta

UID = str(int(_time.time()))

BASE = "http://localhost:8000/api/v1"
s = requests.Session()

def login(username="admin", password="admin123"):
    r = s.post(f"{BASE}/auth/login", json={"username": username, "password": password})
    token = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    return token

def get(path, **kw):
    r = s.get(f"{BASE}{path}", params=kw)
    return r.json()

def post(path, data):
    r = s.post(f"{BASE}{path}", json=data)
    return r.json()

def put(path, data=None):
    r = s.put(f"{BASE}{path}", json=data or {})
    return r.json()

def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

def check(label, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    print(f"  [{status}] {label}" + (f" — {detail}" if detail else ""))
    if not condition:
        global failures
        failures += 1

failures = 0

section("0. 准备 — 登录")
login()
print("  登录成功")

# 获取已有数据ID
suppliers = {
    "云南变压器厂": "96c95a97-2d8b-4389-935d-83d659e18112",
    "昆明电缆集团": "25b83bbe-fed1-4f00-b905-771282ccfcfb",
    "深圳充电桩科技": "9ebf9437-d092-41b3-a9d9-d3a79e679bd5",
    "云南建工集团": "17b59019-e9a1-4633-9fa8-689812d3a3e1",
    "南方电网": "6eedcccc-0626-4816-b907-6ef5570b5f2a",
}
customers = {
    "云南百拓新能源科技有限公司": "b5583169-ce1d-4f75-9413-b695239d1dff",
}
YSD = "a0000000-0000-0000-0000-000000000001"
YCNE = "a0000000-0000-0000-0000-000000000002"
PUER = "64be9f70-95b7-412d-88e8-4961089f0dd8"
LINCANG = "216a480f-4db5-4ed7-8f11-b36d060ef5cc"
CHENGGONG = "13eb2ba8-04aa-48e1-ba8a-2540b80c56fd"
DALI = "884f4c99-13d4-4ed1-8a8c-247ccaf2b092"
print(f"  Suppliers: {list(suppliers.keys())}")
print(f"  Entities: YSD(雅诗达) + YCNE(永充)")

# ============================================================
# TEST 1: 合同创建 → 项目自动创建 → 成本自动归集
# ============================================================
section("TEST 1: 创建新合同 → 自动创建项目 → 自动成本归集")

# 创建一个新合同（我们是甲方，采购电缆）
new_contract = post("/erp/contracts", {
    "contract_no": f"CT-{UID}-L001",
    "name": "普洱站电缆采购合同",
    "contract_type": "cable_purchase",
    "total_amount": 150000,
    "party_a": "云南雅诗达科技有限公司",
    "party_b": suppliers.get("昆明电缆集团", ""),
    "start_date": str(date.today()),
    "end_date": str(date.today() + timedelta(days=90)),
    "status": "draft",
    "project_id": PUER,
    "entity_id": YSD,
})
contract_id = new_contract.get("id") or new_contract.get("data", {}).get("id", "")
contract_obj = new_contract.get("data", new_contract)
if not contract_id:
    print(f"  ERROR: {json.dumps(new_contract, ensure_ascii=False)[:200]}")
check("合同创建成功", bool(contract_id), f"id={contract_id[:8]}...")
check("合同关联项目", contract_obj.get("project_id") is not None, f"project_id={str(contract_obj.get('project_id',''))[:8] if contract_obj.get('project_id') else 'None'}...")

# ============================================================
# TEST 2: 合同激活 → 自动创建AR/AP
# ============================================================
section("TEST 2: 激活合同 → 自动创建AR/AP")

result = put(f"/erp/contracts/{contract_id}/status", {"status": "active"})
check("合同状态更新", result.get("status") == "active" or "status" in str(result))

# 检查AR/AP是否创建
arap_list = get("/finance/ar-ap", page_size=50).get("items", [])
contract_araps = [a for a in arap_list if a.get("business_id") == contract_id or (a.get("source_no") or "").endswith(contract_id[:8])]
check("合同激活自动创建AR/AP", len(contract_araps) > 0, f"找到{len(contract_araps)}条AR/AP")

for a in contract_araps:
    print(f"    → {a['type'].upper()} ¥{a['total_amount']:,.0f} project={str(a.get('project_id',''))[:8] if a.get('project_id') else 'None'}...")

# ============================================================
# TEST 3: 上传发票 → 自动关联到已有AR/AP和银行流水
# ============================================================
section("TEST 3: 创建进项发票 → 勾选核验 → 创建AR/AP → 自动匹配银行流水")

# 先导入一笔银行流水（模拟付款给昆明电缆集团）
bank_import = post("/finance/bank/import", {
    "transactions": [{
        "tx_date": str(date.today() - timedelta(days=2)),
        "tx_amount": -150000,
        "counterparty": "昆明电缆集团",
        "summary": "电缆采购款",
        "tx_type": "expense",
    }],
    "source": "test_linkage",
    "entity_id": YSD,
})
check("银行流水导入", bank_import.get("imported", 0) > 0, f"导入{bank_import.get('imported',0)}条")

# 检查finance_chain是否自动触发
chain_result = bank_import.get("finance_chain", {})
if chain_result:
    check("银行导入自动触发finance_chain", True, f"matched={chain_result.get('arap_matched',0)} settled={chain_result.get('arap_settled',0)} linked={chain_result.get('auto_linked_to_project',0)}")

# 创建发票（关联普洱项目和新合同）
try:
    invoice_result = post("/finance/invoices", {
        "direction": "in",
        "invoice_type": "增值税专用发票",
        "invoice_code": "5300261099",
        "invoice_no": f"9988{UID[-4:]}",
        "issue_date": str(date.today() - timedelta(days=3)),
        "seller_name": "昆明电缆集团",
        "buyer_name": "云南雅诗达科技有限公司",
        "amount_before_tax": 132743.36,
        "tax_rate": 13.0,
        "tax_amount": 17256.64,
        "total_amount": 150000,
        "project_id": PUER,
        **({"contract_id": contract_id} if contract_id else {}),
    })
    invoice_id = invoice_result.get("id", "")
    if not invoice_id:
        print(f"  ERROR creating invoice: {json.dumps(invoice_result, ensure_ascii=False)[:200]}")
except Exception as e:
    invoice_id = ""
    print(f"  EXCEPTION creating invoice: {e}")
check("发票创建成功", bool(invoice_id), f"id={invoice_id[:8] if invoice_id else 'None'}...")
check("发票关联合同", invoice_result.get("contract_id") == contract_id if contract_id else True)
check("发票关联项目", invoice_result.get("project_id") is not None)

# 勾选发票
try:
    check_result = put(f"/finance/invoices/{invoice_id}/check") if invoice_id else {}
except Exception as e:
    check_result = {}
    print(f"  EXCEPTION checking invoice: {e}")
    import time; time.sleep(3)  # wait for backend restart if crashed

# 检查发票创建的AR/AP
try:
    arap_list2 = get("/finance/ar-ap", page_size=100).get("items", [])
except:
    import time; time.sleep(5)
    arap_list2 = get("/finance/ar-ap", page_size=100).get("items", [])
check("发票勾选成功", check_result.get("check_status") == "checked")

# 检查发票创建的AR/AP
arap_list2 = get("/finance/ar-ap", page_size=100).get("items", [])
invoice_araps = [a for a in arap_list2 if a.get("business_type") == "invoice" and a.get("business_id") == invoice_id]
check("发票勾选自动创建AR/AP", len(invoice_araps) > 0, f"找到{len(invoice_araps)}条")

# 检查银行流水是否被自动匹配
bank_list = get("/finance/bank/list", page_size=100).get("items", [])
matched_150k = [b for b in bank_list if abs(float(b.get("tx_amount", 0)) + 150000) < 1]
check("发票核验自动匹配银行流水(反向联动)", len(matched_150k) > 0 and matched_150k[0].get("matched") == True,
      f"matched={matched_150k[0].get('matched') if matched_150k else 'N/A'}")

# ============================================================
# TEST 4: 部分付款 — 银行只付了一部分
# ============================================================
section("TEST 4: 部分付款 — 银行80%付款 → AR/AP部分核销")

# 导入一笔部分付款（百拓只付了50000，但AR是135600）
bank_partial = post("/finance/bank/import", {
    "transactions": [{
        "tx_date": str(date.today()),
        "tx_amount": 50000,
        "counterparty": "云南百拓新能源科技有限公司",
        "summary": "充电桩设备款-部分付款",
        "tx_type": "income",
    }],
    "source": "test_linkage",
})
check("部分付款银行导入", bank_partial.get("imported", 0) > 0)

# 检查百拓的AR是否被部分核销
arap_list3 = get("/finance/ar-ap", page_size=100).get("items", [])
baituo_ar = [a for a in arap_list3 if "百拓" in (a.get("counterparty") or "")]
if baituo_ar:
    ar = baituo_ar[0]
    check("百拓AR被部分核销", float(ar.get("settled_amount", 0)) > 0,
          f"settled={ar.get('settled_amount',0)} remaining={ar.get('remaining_amount',0)}")

# ============================================================
# TEST 5: 银行导入 → 反向推断项目（举一反三）
# ============================================================
section("TEST 5: 银行导入 → 反向推断项目和合同（举一反三）")

# 导入一笔新银行流水（付给云南建工集团），没有对应AR/AP
bank_infer = post("/finance/bank/import", {
    "transactions": [{
        "tx_date": str(date.today() - timedelta(days=5)),
        "tx_amount": -200000,
        "counterparty": "云南建工集团",
        "summary": "土建施工款",
        "tx_type": "expense",
    }],
    "source": "test_linkage",
})
chain5 = bank_infer.get("finance_chain", {})
check("无AR/AP的银行流水通过对手方推断项目",
      chain5.get("auto_linked_to_project", 0) > 0 or chain5.get("arap_matched", 0) > 0,
      f"auto_linked={chain5.get('auto_linked_to_project', 0)} matched={chain5.get('arap_matched',0)}")

# 检查银行流水是否有project_id
bank_list2 = get("/finance/bank/list", page_size=100).get("items", [])
jg_bank = [b for b in bank_list2 if b.get("counterparty") == "云南建工集团" and abs(float(b.get("tx_amount", 0)) + 200000) < 1]
if jg_bank:
    check("建工银行流水关联到项目", jg_bank[0].get("project_id") is not None,
          f"project_id={str(jg_bank[0].get('project_id', ''))[:8]}...")

# ============================================================
# TEST 6: 同供应商多合同 — 云南变压器厂在临沧和呈贡都有合同
# ============================================================
section("TEST 6: 同供应商多合同场景 — 云南变压器厂")

# 创建呈贡站的变压器采购合同
cg_transformer = post("/erp/contracts", {
    "contract_no": f"CT-{UID}-CG001",
    "name": "呈贡站变压器采购合同",
    "contract_type": "transformer_purchase",
    "total_amount": 120000,
    "party_a": "云南雅诗达科技有限公司",
    "party_b": suppliers.get("云南变压器厂", ""),
    "start_date": str(date.today()),
    "end_date": str(date.today() + timedelta(days=60)),
    "project_id": CHENGGONG,
    "entity_id": YSD,
})
cg_id = cg_transformer.get("id") or cg_transformer.get("data", {}).get("id", "")
if cg_id:
    cg_activated = put(f"/erp/contracts/{cg_id}/status", {"status": "active"})
    cg_status = cg_activated.get("status") or cg_activated.get("data", {}).get("status", "")
    check("呈贡变压器合同创建并激活", cg_status == "active", f"status={cg_status}")
else:
    check("呈贡变压器合同创建并激活", False, "合同创建失败")

# 导入呈贡变压器付款的银行流水
bank_cg = post("/finance/bank/import", {
    "transactions": [{
        "tx_date": str(date.today() - timedelta(days=1)),
        "tx_amount": -120000,
        "counterparty": "云南变压器厂",
        "summary": "呈贡站变压器货款",
        "tx_type": "expense",
    }],
    "source": "test_linkage",
})
chain6 = bank_cg.get("finance_chain", {})
check("同供应商(变压器厂)不同项目正确匹配",
      chain6.get("arap_matched", 0) > 0 or chain6.get("auto_linked_to_project", 0) > 0,
      f"matched={chain6.get('arap_matched',0)} linked={chain6.get('auto_linked_to_project',0)}")

# 检查120000是否关联到呈贡项目（而非临沧）
bank_list3 = get("/finance/bank/list", page_size=100).get("items", [])
byq_120 = [b for b in bank_list3 if abs(float(b.get("tx_amount", 0)) + 120000) < 1]
if byq_120:
    proj_id = str(byq_120[0].get("project_id", ""))
    check("120000变压器付款关联到呈贡项目(非临沧)",
          "13eb2ba8" in proj_id,
          f"project_id={proj_id[:8]}...")

# ============================================================
# TEST 7: 跨主体联动 — 雅诗达付工程款 + 永充付运营款
# ============================================================
section("TEST 7: 跨主体联动 — 不同主体分别付款")

# 永充付租地款（给南方电网）
bank_lease = post("/finance/bank/import", {
    "transactions": [{
        "tx_date": str(date.today() - timedelta(days=10)),
        "tx_amount": -40000,
        "counterparty": "南方电网",
        "summary": "临沧站电费",
        "tx_type": "expense",
    }],
    "source": "test_linkage",
    "entity_id": YCNE,  # 永充主体
})
check("永充主体银行导入", bank_lease.get("imported", 0) > 0)

chain7 = bank_lease.get("finance_chain", {})
# 南方电网是utility类型，有合同party_b是南方电网的关联到临沧项目
bank_list4 = get("/finance/bank/list", page_size=200).get("items", [])
nd_bank = [b for b in bank_list4 if "南方电网" in (b.get("counterparty") or "")]
if nd_bank:
    check("南方电网流水推断到临沧项目",
          nd_bank[0].get("project_id") is not None,
          f"project={str(nd_bank[0].get('project_id',''))[:8] if nd_bank[0].get('project_id') else 'None'}...")

# ============================================================
# TEST 8: 完整项目财务主线验证
# ============================================================
section("TEST 8: 项目财务主线验证 — 全链路数据一致性")

for pid, pname in [
    (LINCANG, "临沧"),
    (CHENGGONG, "呈贡"),
    (DALI, "大理"),
    (PUER, "普洱"),
]:
    summary = get(f"/autopilot/project/{pid}/financial-summary")
    p = summary.get("project", {})
    print(f"\n  [{pname}] 预算={p.get('budget',0):,.0f} 成本={p.get('actual_cost',0):,.0f}")
    print(f"    合同={summary.get('contracts_total',0):,.0f} 发票={summary.get('invoices_total',0):,.0f}")
    ar = summary.get("ar", {})
    ap = summary.get("ap", {})
    bank = summary.get("bank", {})
    print(f"    AR total={ar.get('total',0):,.0f} settled={ar.get('settled',0):,.0f}")
    print(f"    AP total={ap.get('total',0):,.0f} settled={ap.get('settled',0):,.0f}")
    print(f"    Bank in={bank.get('inflow',0):,.0f} out={bank.get('outflow',0):,.0f} net={bank.get('net',0):,.0f}")
    print(f"    回款率={summary.get('collection_rate',0)}% 付款率={summary.get('payment_rate',0)}%")

# 临沧项目应该有：银行流出 = AP已付总额
linchang = get(f"/autopilot/project/{LINCANG}/financial-summary")
bank_out_lc = abs(linchang.get("bank", {}).get("outflow", 0))
ap_settled_lc = linchang.get("ap", {}).get("settled", 0)
check("临沧项目：银行流出 ≈ AP已付", abs(bank_out_lc - ap_settled_lc) < 1,
      f"bank_out={bank_out_lc:,.0f} ap_settled={ap_settled_lc:,.0f}")

# ============================================================
# TEST 9: 反向联动 — 从银行反查发票和合同
# ============================================================
section("TEST 9: 反向联动 — 银行流水 → AR/AP → 发票 → 合同 → 项目")

bank_list5 = get("/finance/bank/list", page_size=200, matched=True).get("items", [])
print(f"  已匹配银行流水: {len(bank_list5)}条")
for b in bank_list5:
    arap_id = b.get("matched_arap_id", "")
    proj_id = str(b.get("project_id", ""))[:8]
    print(f"    ¥{float(b['tx_amount']):>10,.0f} {b['counterparty']:<20} → project={proj_id}... arap={str(arap_id)[:8] if arap_id else 'N/A'}...")

    # 反查AR/AP详情
    if arap_id:
        arap_detail = get(f"/finance/ar-ap/{arap_id}")
        if arap_detail and not arap_detail.get("detail"):
            print(f"      AR/AP: {arap_detail.get('type','?').upper()} ¥{arap_detail.get('total_amount',0):,.0f} "
                  f"status={arap_detail.get('status','?')} business={arap_detail.get('business_type','')}")

check("所有已匹配银行流水都有project_id", all(b.get("project_id") for b in bank_list5),
      f"{sum(1 for b in bank_list5 if b.get('project_id'))}/{len(bank_list5)}条有project_id")

# ============================================================
# SUMMARY
# ============================================================
section("测试总结")
print(f"\n  总失败数: {failures}")
if failures == 0:
    print("  全部通过!")
else:
    print(f"  有 {failures} 个测试失败，请检查上述 [FAIL] 项")
print()
