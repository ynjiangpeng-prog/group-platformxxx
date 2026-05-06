import requests

# 登录
login_resp = requests.post('http://127.0.0.1:8000/api/v1/auth/login', json={
    'username': 'admin',
    'password': 'admin123'
}, timeout=10)
token = login_resp.json().get('access_token')

# 获取项目列表
r = requests.get('http://127.0.0.1:8000/api/v1/project/projects?page=1&page_size=500', 
                 headers={'Authorization': f'Bearer {token}'}, timeout=10)
projects = r.json().get('items', [])
print(f'项目总数: {len(projects)}')

# 检查每个项目的银行流水数量
for p in projects[:5]:
    pid = p['id']
    r2 = requests.get(f'http://127.0.0.1:8000/api/v1/audit/project-links/{pid}', 
                      headers={'Authorization': f'Bearer {token}'}, timeout=10)
    data = r2.json()
    bank_count = data.get('modules', {}).get('bank', {}).get('count', 0)
    project_name = p['name']
    print(f'{project_name}: {bank_count} 条银行流水')

# 获取银行流水统计
r3 = requests.get('http://127.0.0.1:8000/api/v1/finance/bank/list?page=1&page_size=1', 
                  headers={'Authorization': f'Bearer {token}'}, timeout=10)
total_bank = r3.json().get('total', 0)
print(f'\n银行流水总数: {total_bank}')

# 统计有 project_id 的银行流水
r4 = requests.get('http://127.0.0.1:8000/api/v1/finance/bank/list?page=1&page_size=50000', 
                  headers={'Authorization': f'Bearer {token}'}, timeout=30)
all_banks = r4.json().get('items', [])
with_project = [b for b in all_banks if b.get('project_id')]
print(f'已关联项目的银行流水: {len(with_project)}')

# 统计每个项目的银行流水数量
from collections import Counter
project_counts = Counter([b['project_id'] for b in with_project])
print('\n前10个项目（按银行流水数量排序）:')
for pid, count in project_counts.most_common(10):
    pname = next((p['name'] for p in projects if p['id'] == pid), 'Unknown')
    print(f'  {pname}: {count} 条')