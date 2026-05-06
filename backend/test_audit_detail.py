import requests

# 登录
login_resp = requests.post('http://127.0.0.1:8000/api/v1/auth/login', json={
    'username': 'admin',
    'password': 'admin123'
}, timeout=10)
token = login_resp.json().get('access_token')

# 获取长水机场项目的ID
pid = None
r = requests.get('http://127.0.0.1:8000/api/v1/project/projects?page=1&page_size=500', 
                 headers={'Authorization': f'Bearer {token}'}, timeout=10)
for p in r.json().get('items', []):
    if '长水机场' in p['name']:
        pid = p['id']
        break

if pid:
    # 获取该项目的银行流水
    r2 = requests.get(f'http://127.0.0.1:8000/api/v1/finance/bank/list?project_id={pid}&page=1&page_size=100', 
                      headers={'Authorization': f'Bearer {token}'}, timeout=10)
    banks = r2.json().get('items', [])
    print(f'项目银行流水数量: {len(banks)}')
    print('\n所有银行流水:')
    for b in banks:
        cp = b['counterparty'][:25] if b['counterparty'] else ''
        summary = b['summary'][:30] if b['summary'] else ''
        print(f"  {b['tx_date']} | {cp:25} | {b['tx_amount']:10.2f} | {summary}")

# 检查全局审计接口
if pid:
    r3 = requests.get(f'http://127.0.0.1:8000/api/v1/audit/project-links/{pid}', 
                      headers={'Authorization': f'Bearer {token}'}, timeout=10)
    data = r3.json()
    bank_module = data.get('modules', {}).get('bank', {})
    print(f"\n全局审计 - 银行流水数量: {bank_module.get('count')}")
    print(f"总收入: {bank_module.get('total_income')}")
    print(f"总支出: {bank_module.get('total_expense')}")