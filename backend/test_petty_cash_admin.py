import requests

# 登录
login_resp = requests.post('http://127.0.0.1:8000/api/v1/auth/login', json={
    'username': 'admin',
    'password': 'admin123'
}, timeout=10)
token = login_resp.json().get('access_token')

# 获取待审核的备用金支出
r = requests.get('http://127.0.0.1:8000/api/v1/petty-cash/expenses?status=pending_review&page=1&page_size=20', 
                 headers={'Authorization': f'Bearer {token}'}, timeout=10)
items = r.json().get('items', [])
print(f'待审核支出数量: {len(items)}')

if items:
    # 审核第一条
    expense_id = items[0]['id']
    print(f'审核支出ID: {expense_id}')
    print(f'审核前状态: {items[0]["status"]}')
    
    r2 = requests.post(f'http://127.0.0.1:8000/api/v1/petty-cash/expenses/{expense_id}/admin-approve', 
                       headers={'Authorization': f'Bearer {token}'}, timeout=10)
    print(f'审核响应状态: {r2.status_code}')
    print(f'审核响应: {r2.json()}')
    
    # 再次查询
    r3 = requests.get('http://127.0.0.1:8000/api/v1/petty-cash/expenses?status=pending_review&page=1&page_size=20', 
                      headers={'Authorization': f'Bearer {token}'}, timeout=10)
    items_after = r3.json().get('items', [])
    print(f'\n审核后待审核支出数量: {len(items_after)}')
    
    # 查询所有状态
    r4 = requests.get(f'http://127.0.0.1:8000/api/v1/petty-cash/expenses/{expense_id}', 
                      headers={'Authorization': f'Bearer {token}'}, timeout=10)
    print(f'审核后支出状态: {r4.json().get("expense", {}).get("status")}')