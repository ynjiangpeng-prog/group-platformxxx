import requests

# 登录
login_resp = requests.post('http://127.0.0.1:8000/api/v1/auth/login', json={
    'username': 'admin',
    'password': 'admin123'
}, timeout=10)
token = login_resp.json().get('access_token')

# 获取长水机场项目的银行流水
pid = None
r = requests.get('http://127.0.0.1:8000/api/v1/project/projects?page=1&page_size=500', 
                 headers={'Authorization': f'Bearer {token}'}, timeout=10)
for p in r.json().get('items', []):
    if '长水机场' in p['name']:
        pid = p['id']
        break

if pid:
    r2 = requests.get(f'http://127.0.0.1:8000/api/v1/finance/bank/list?project_id={pid}&page=1&page_size=100', 
                      headers={'Authorization': f'Bearer {token}'}, timeout=10)
    banks = r2.json().get('items', [])
    print(f'项目银行流水数量: {len(banks)}')
    print('\n前20条银行流水:')
    for b in banks[:20]:
        print(f"  {b['tx_date']} | {b['counterparty'][:20]:20} | {b['tx_amount']:10.2f} | {b['summary'][:30]}")

# 检查没有 project_id 的银行流水
r3 = requests.get('http://127.0.0.1:8000/api/v1/finance/bank/list?page=1&page_size=50000', 
                  headers={'Authorization': f'Bearer {token}'}, timeout=30)
all_banks = r3.json().get('items', [])
no_project = [b for b in all_banks if not b.get('project_id')]
print(f'\n未关联项目的银行流水: {len(no_project)}')

# 检查有 project_id 的银行流水的 expense_type
with_project = [b for b in all_banks if b.get('project_id')]
from collections import Counter
expense_types = Counter([b.get('expense_type', '未分类') for b in with_project])
print('\n已关联项目的银行流水费用类型分布:')
for et, count in expense_types.most_common():
    print(f'  {et}: {count}')