import requests

login_resp = requests.post('http://127.0.0.1:8000/api/v1/auth/login', json={
    'username': 'admin',
    'password': 'admin123'
}, timeout=10)
token = login_resp.json().get('access_token')

r = requests.get('http://127.0.0.1:8000/api/v1/finance/bank/list', 
                 headers={'Authorization': f'Bearer {token}'}, timeout=30)
print('响应大小:', len(r.content), '字节', '约', round(len(r.content)/1024, 2), 'KB')