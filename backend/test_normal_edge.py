"""
正常+异常业务全流程测试
"""
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import requests, json, time
from datetime import date, timedelta

BASE = "http://localhost:8000/api/v1"
s = requests.Session()
failures = 0

def login():
    r = s.post(f"{BASE}/auth/login", json={"username": "admin", "password": "admin123"})
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})

def api(method, path, data=None, **kw):
    try:
        r = getattr(s, method)(f"{BASE}{path}", json=data, params=kw, timeout=15)
        return r.json(), r.status_code
    except Exception as e:
        return {"detail": str(e)}, 0

def check(label, cond, detail=""):
    global failures
    st = "PASS" if cond else "FAIL"
    print(f"  [{st}] {label}" + (f" — {detail}" if detail else ""))
    if not cond:
        failures += 1

def section(t):
    print(f"\n{'='*60}\n  {t}\n{'='*60}")

YSD = "a0000000-0000-0000-0000-000000000001"
YCNE = "a0000000-0000-0000-0000-000000000002"
LINCANG = "216a480f-4db5-4ed7-8f11-b36d060ef5cc"
CHENGGONG = "13eb2ba8-04aa-48e1-ba8a-2540b80c56fd"
DALI = "884f4c99-13d4-4ed1-8a8c-247ccaf2b092"
PUER = "64be9f70-95b7-412d-88e8-4961089f0dd8"
BYQ = "96c95a97-2d8b-4389-935d-83d659e18112"  # 云南变压器厂
DLJT = "25b83bbe-fed1-4f00-b905-771282ccfcfb"  # 昆明电缆集团
BAITUO = "b5583169-ce1d-4f75-9413-b695239d1dff"  # 百拓

login()

UNIQUE = f"T-{int(time.time())}"

# ================================================================
section("1. 正常流程：创建合同 → 激活 → 创建AR/AP")
# ================================================================
r, code = api("post", "/erp/contracts", {
    "contract_no": f"CT-{UNIQUE}-001",
    "name": "临沧站电气材料采购合同",
    "contract_type": "electrical_material_purchase",
    "total_amount": 60000,
    "party_a": "云南雅诗达科技有限公司",
    "party_b": DLJT,
    "start_date": str(date.today()),
    "end_date": str(date.today() + timedelta(days=60)),
    "project_id": LINCANG,
    "entity_id": YSD,
})
cid = (r.get("id") or r.get("data", {}).get("id", ""))
check("合同创建200", code == 200, f"code={code}")
check("合同有ID", bool(cid), f"id={str(cid)[:8]}...")

# 激活
r2, code2 = api("put", f"/erp/contracts/{cid}/status", {"status": "active"})
check("合同激活200", code2 == 200, f"code={code2}")

# 验证AR/AP自动创建
araps, _ = api("get", "/finance/ar-ap", page_size=100)
items = araps.get("items", [])
contract_arap = [a for a in items if a.get("business_id") == cid]
check("激活自动创建AP", len(contract_arap) > 0, f"找到{len(contract_arap)}条")
if contract_arap:
    a = contract_arap[0]
    check("AP金额=合同金额", float(a.get("total_amount", 0)) == 60000)
    check("AP继承project_id", a.get("project_id") is not None, f"pid={str(a.get('project_id',''))[:8]}...")
    check("AP状态=pending", a.get("status") == "pending")

# ================================================================
section("2. 正常流程：创建发票 → 勾选 → AR/AP → 匹配银行")
# ================================================================
# 先导银行流水
r3, code3 = api("post", "/finance/bank/import", {
    "transactions": [{
        "tx_date": str(date.today() - timedelta(days=2)),
        "tx_amount": -60000,
        "counterparty": "昆明电缆集团",
        "summary": "电气材料采购款",
        "tx_type": "expense",
    }],
    "source": "normal_test",
    "entity_id": YSD,
})
check("银行导入200", code3 == 200, f"imported={r3.get('imported',0)}")

# 银行导入应自动触发finance_chain
chain = r3.get("finance_chain", {})
check("银行导入自动匹配AP", chain.get("arap_matched", 0) >= 1,
      f"matched={chain.get('arap_matched',0)} settled={chain.get('arap_settled',0)}")

# 验证银行流水project_id
banks, _ = api("get", "/finance/bank/list", page_size=100)
bk60 = [b for b in banks.get("items", []) if abs(float(b.get("tx_amount",0)) + 60000) < 1]
if bk60:
    check("银行流水继承project_id", bk60[0].get("project_id") is not None)
    check("银行流水matched=True", bk60[0].get("matched") == True)

# 创建发票
r4, code4 = api("post", "/finance/invoices", {
    "invoice_type": "增值税专用发票",
    "direction": "in",
    "invoice_code": "5300261888",
    "invoice_no": f"1122{UNIQUE[-4:]}",
    "issue_date": str(date.today() - timedelta(days=3)),
    "seller_name": "昆明电缆集团",
    "buyer_name": "云南雅诗达科技有限公司",
    "amount_before_tax": 53097.35,
    "tax_rate": 13.0,
    "tax_amount": 6902.65,
    "total_amount": 60000,
    "project_id": LINCANG,
    "contract_id": cid,
})
inv_id = r4.get("id", "")
check("发票创建200", code4 == 200, f"code={code4}")
if cid:
    check("发票关联合同", r4.get("contract_id") == cid, f"got={r4.get('contract_id','')[:8] if r4.get('contract_id') else 'None'}")

# 勾选
r5, code5 = api("put", f"/finance/invoices/{inv_id}/check")
check("发票勾选200", code5 == 200, f"status={r5.get('check_status','')}")

# ================================================================
section("3. 正常流程：项目财务主线完整性")
# ================================================================
summary, _ = api("get", f"/autopilot/project/{LINCANG}/financial-summary")
check("项目汇总200", "project" in summary)
p = summary.get("project", {})
print(f"  临沧: budget={p.get('budget',0):,.0f} cost={p.get('actual_cost',0):,.0f}")
print(f"  contracts={summary.get('contracts_total',0):,.0f} invoices={summary.get('invoices_total',0):,.0f}")
print(f"  AP settled={summary.get('ap',{}).get('settled',0):,.0f} bank_out={summary.get('bank',{}).get('outflow',0):,.0f}")
check("临沧有合同数据", summary.get("contracts_total", 0) > 0)
check("临沧有发票数据", summary.get("invoices_total", 0) > 0)

# ================================================================
section("4. 异常：重复合同编号")
# ================================================================
r6, code6 = api("post", "/erp/contracts", {
    "contract_no": f"CT-{UNIQUE}-001",  # 刚创建的编号
    "name": "重复编号合同",
    "contract_type": "other",
    "project_id": LINCANG,
    "entity_id": YSD,
})
check("重复编号被拒绝", code6 in (400, 409, 422), f"code={code6}")

# ================================================================
section("5. 异常：空UUID字段")
# ================================================================
r7, code7 = api("post", "/finance/invoices", {
    "invoice_type": "增值税专用发票",
    "direction": "in",
    "total_amount": 10000,
    "contract_id": "",  # 空字符串
    "project_id": "",   # 空字符串
})
check("空UUID被拒绝或安全处理", code7 in (400, 422) or r7.get("id"), f"code={code7}")

# ================================================================
section("6. 异常：金额为0或负数")
# ================================================================
r8, code8 = api("post", "/finance/bank/import", {
    "transactions": [{
        "tx_date": str(date.today()),
        "tx_amount": 0,
        "counterparty": "测试",
    }],
    "source": "edge_test",
})
check("金额0的流水被导入(不崩溃)", code8 == 200, f"code={code8}")

# ================================================================
section("7. 异常：不存在的ID操作")
# ================================================================
r9, code9 = api("put", "/erp/contracts/00000000-0000-0000-0000-000000000000/status", {"status": "active"})
check("不存在合同返回404", code9 == 404, f"code={code9}")

r10, code10 = api("put", "/finance/invoices/00000000-0000-0000-0000-000000000000/check")
check("不存在发票返回404或400", code10 in (404, 400), f"code={code10}")

# ================================================================
section("8. 异常：同一发票重复勾选")
# ================================================================
if inv_id:
    r11, code11 = api("put", f"/finance/invoices/{inv_id}/check")
    check("重复勾选被拒绝", code11 == 400, f"code={code11} detail={r11.get('detail','')[:30]}")

# ================================================================
section("9. 正常：部分付款场景")
# ================================================================
# 创建一个大额AR（百拓销项发票）
r12, code12 = api("post", "/finance/invoices", {
    "invoice_type": "增值税专用发票",
    "direction": "out",
    "invoice_code": "5300261999",
    "invoice_no": "99887711",
    "issue_date": str(date.today()),
    "seller_name": "云南永充新能源科技有限公司",
    "buyer_name": "云南百拓新能源科技有限公司",
    "total_amount": 200000,
    "project_id": PUER,
})
inv2 = r12.get("id", "")
if inv2:
    api("put", f"/finance/invoices/{inv2}/check")

    # 导入第一笔部分付款80000
    r13, _ = api("post", "/finance/bank/import", {
        "transactions": [{
            "tx_date": str(date.today()),
            "tx_amount": 80000,
            "counterparty": "云南百拓新能源科技有限公司",
            "summary": "设备款-第一笔",
            "tx_type": "income",
        }],
        "source": "partial_test",
    })
    chain13 = r13.get("finance_chain", {})
    check("部分付款80000匹配AR200000", chain13.get("arap_matched", 0) >= 1,
          f"matched={chain13.get('arap_matched',0)}")

    # 验证AR被部分核销
    araps2, _ = api("get", "/finance/ar-ap", page_size=100)
    inv2_ar = [a for a in araps2.get("items", []) if a.get("business_id") == inv2 and a.get("business_type") == "invoice"]
    if inv2_ar:
        ar = inv2_ar[0]
        check("AR部分核销 settled>=80000", float(ar.get("settled_amount", 0)) >= 80000,
              f"settled={ar.get('settled_amount',0)} remaining={ar.get('remaining_amount',0)}")
        check("AR状态仍为pending", ar.get("status") == "pending", f"status={ar.get('status','')}")

    # 导入第二笔120000
    r14, _ = api("post", "/finance/bank/import", {
        "transactions": [{
            "tx_date": str(date.today()),
            "tx_amount": 120000,
            "counterparty": "云南百拓新能源科技有限公司",
            "summary": "设备款-尾款",
            "tx_type": "income",
        }],
        "source": "partial_test",
    })
    chain14 = r14.get("finance_chain", {})
    check("第二笔120000匹配剩余AR", chain14.get("arap_matched", 0) >= 1,
          f"matched={chain14.get('arap_matched',0)}")

    # 验证AR完全核销
    araps3, _ = api("get", "/finance/ar-ap", page_size=100)
    inv2_ar2 = [a for a in araps3.get("items", []) if a.get("business_id") == inv2 and a.get("business_type") == "invoice"]
    if inv2_ar2:
        ar2 = inv2_ar2[0]
        check("AR完全核销 settled=200000", float(ar2.get("settled_amount", 0)) == 200000,
              f"settled={ar2.get('settled_amount',0)}")
        check("AR状态=settled", ar2.get("status") == "settled", f"status={ar2.get('status','')}")

# ================================================================
section("10. 正常：删除操作不破坏关联")
# ================================================================
# 创建然后删除一个发票
r15, _ = api("post", "/finance/invoices", {
    "invoice_type": "增值税普通发票",
    "direction": "in",
    "invoice_code": "5300262000",
    "invoice_no": "55667788",
    "issue_date": str(date.today()),
    "seller_name": "测试供应商",
    "buyer_name": "云南雅诗达科技有限公司",
    "total_amount": 1000,
})
del_inv = r15.get("id", "")
if del_inv:
    r16, code16 = api("delete", f"/finance/invoices/{del_inv}")
    check("发票删除200", code16 == 200, f"code={code16}")

    # 再试操作已删除的
    r17, code17 = api("put", f"/finance/invoices/{del_inv}/check")
    check("已删除发票操作返回404", code17 == 404, f"code={code17}")

# ================================================================
section("11. 正常：智能引擎API")
# ================================================================
r18, _ = api("get", "/intelligence/dashboard")
check("智能引擎dashboard", "alerts_total" in r18, f"alerts={r18.get('alerts_total',0)}")

r19, _ = api("post", "/intelligence/alerts/scan")
check("智能扫描200", "new_alerts" in r19, f"new={r19.get('new_alerts',0)}")

r20, _ = api("get", "/intelligence/alerts", status="active", page_size=10)
check("智能预警列表", "items" in r20, f"count={len(r20.get('items',[]))}")

r21, _ = api("get", "/intelligence/knowledge", page_size=10)
check("知识库列表", "items" in r21, f"total={r21.get('total',0)}")

# ================================================================
section("12. 正常：Autopilot API")
# ================================================================
r22, _ = api("get", "/autopilot/dashboard")
check("驾驶舱dashboard", "quick_metrics" in r22)

r23, _ = api("get", "/autopilot/alerts")
check("autopilot alerts", "alerts" in r23)

r24, _ = api("get", "/autopilot/finance/check")
check("财务检查", "ar" in r24 and "ap" in r24)

r25, _ = api("get", "/autopilot/finance/tax")
check("税务汇总", "net_vat" in r25)

# ================================================================
section("13. 正常：银行流水手动匹配/取消")
# ================================================================
banks2, _ = api("get", "/finance/bank/list", page_size=100)
unmatched = [b for b in banks2.get("items", []) if not b.get("matched")]
print(f"  未匹配银行流水: {len(unmatched)}条")
for b in unmatched[:5]:
    print(f"    ¥{float(b.get('tx_amount',0)):>10,.0f} {b.get('counterparty','')}")

# ================================================================
# SUMMARY
# ================================================================
section("测试总结")
print(f"  总失败: {failures}")
print("  全部通过!" if failures == 0 else f"  有{failures}项失败")
print()
