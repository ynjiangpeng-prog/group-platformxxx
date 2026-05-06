import requests

# 登录
login_resp = requests.post('http://127.0.0.1:8000/api/v1/auth/login', json={
    'username': 'admin',
    'password': 'admin123'
}, timeout=10)
token = login_resp.json().get('access_token')

# 获取所有备用金支出
r = requests.get('http://127.0.0.1:8000/api/v1/petty-cash/expenses?page=1&page_size=500', 
                 headers={'Authorization': f'Bearer {token}'}, timeout=10)
items = r.json().get('items', [])
print(f'总支出数量: {len(items)}')

from collections import Counter
status_counts = Counter([item['status'] for item in items])
print('\n状态分布:')
for status, count in status_counts.most_common():
    print(f'  {status}: {count}')

# 显示前10条
print('\n前10条支出:')
for item in items[:10]:
    print(f"  {item['id'][:8]}... | {item['status']:15} | {item.get('employee_name', 'N/A'):10} | ¥{item['amount']}")