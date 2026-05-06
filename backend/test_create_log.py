import requests

login = requests.post('http://127.0.0.1:8000/api/v1/auth/login', json={'username':'admin','password':'admin123'}, timeout=10)
token = login.json().get('access_token')

# 测试创建施工日志
r = requests.post('http://127.0.0.1:8000/api/v1/project/construction-logs', 
    headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
    json={
        'project_id': 'test',
        'log_date': '2024-04-30',
        'content': '测试'
    }, timeout=10)
print('Status:', r.status_code)
print('Response:', r.text[:500])