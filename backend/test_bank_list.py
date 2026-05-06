import requests

# 登录
login_resp = requests.post('http://127.0.0.1:8000/api/v1/auth/login', json={
    'username': 'admin',
    'password': 'admin123'
}, timeout=10)
token = login_resp.json().get('access_token')

# 测试银行流水列表
r = requests.get('http://127.0.0.1:8000/api/v1/finance/bank/list?page=1&page_size=20', 
                 headers={'Authorization': f'Bearer {token}'}, timeout=30)
print('status:', r.status_code)
data = r.json()
print('total:', data.get('total'))
print('items count:', len(data.get('items', [])))
print('page:', data.get('page'))
print('page_size:', data.get('page_size'))