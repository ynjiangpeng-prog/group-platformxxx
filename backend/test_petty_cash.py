import requests

# 登录
login_resp = requests.post('http://127.0.0.1:8000/api/v1/auth/login', json={
    'username': 'admin',
    'password': 'admin123'
}, timeout=10)
token = login_resp.json().get('access_token')

# 测试备用金支出列表
r = requests.get('http://127.0.0.1:8000/api/v1/petty-cash/expenses?status=submitted&page=1&page_size=20', 
                 headers={'Authorization': f'Bearer {token}'}, timeout=10)
print('status:', r.status_code)
data = r.json()
print('total:', data.get('total'))
items = data.get('items', [])
if items:
    first = items[0]
    print('first item keys:', list(first.keys()))
    print('attachments:', first.get('attachments'))
    print('invoice_files:', first.get('invoice_files'))