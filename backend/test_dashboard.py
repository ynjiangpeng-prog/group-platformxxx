import requests, traceback, sys

# 先登录获取token
login_resp = requests.post('http://127.0.0.1:8000/api/v1/auth/login', json={
    'username': 'admin',
    'password': 'admin123'
}, timeout=10)
print('login status:', login_resp.status_code)
if login_resp.status_code == 200:
    token = login_resp.json().get('access_token')
    
    # 测试dashboard/stats
    r = requests.get('http://127.0.0.1:8000/api/v1/system/dashboard/stats', 
                     headers={'Authorization': f'Bearer {token}'}, timeout=10)
    print('dashboard status:', r.status_code)
    print('dashboard body:', r.text)
    
    # 测试其他端点
    endpoints = [
        '/api/v1/system/dashboard',
        '/api/v1/system/dashboard/charts',
        '/api/v1/analytics/overview',
        '/api/v1/analytics/trends?months=12',
    ]
    for ep in endpoints:
        r2 = requests.get(f'http://127.0.0.1:8000{ep}', 
                         headers={'Authorization': f'Bearer {token}'}, timeout=10)
        print(f'{ep}: {r2.status_code}')
        if r2.status_code != 200:
            print('  body:', r2.text[:200])