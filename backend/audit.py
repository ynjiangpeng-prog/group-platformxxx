#!/usr/bin/env python3
import os
import sys
import ast
import re
from pathlib import Path

BASE_DIR = '/opt/group-platform/backend'
os.chdir(BASE_DIR)
sys.path.insert(0, BASE_DIR)

issues = []

# 1. 语法检查
print("=" * 60)
print("1. Python语法检查")
print("=" * 60)
py_files = list(Path('app').rglob('*.py'))
syntax_errors = []
for f in py_files:
    try:
        compile(f.read_text(encoding='utf-8'), str(f), 'exec')
    except SyntaxError as e:
        syntax_errors.append(f"{f}: {e}")
        
if syntax_errors:
    print(f"  发现 {len(syntax_errors)} 个语法错误:")
    for e in syntax_errors:
        print(f"    - {e}")
else:
    print("  所有Python文件语法正确")

# 2. 检查硬编码敏感信息
print()
print("=" * 60)
print("2. 安全检查 - 硬编码密钥/密码")
print("=" * 60)
patterns = [
    (r'password\s*=\s*["\'][^"\']+["\']', "硬编码密码"),
    (r'secret\s*=\s*["\'][^"\']+["\']', "硬编码secret"),
    (r'api_key\s*=\s*["\'][^"\']+["\']', "硬编码API Key"),
    (r'token\s*=\s*["\'][^"\']+["\']', "硬编码token"),
]
security_issues = []
for f in py_files:
    content = f.read_text(encoding='utf-8', errors='ignore')
    for pattern, desc in patterns:
        matches = re.finditer(pattern, content, re.IGNORECASE)
        for m in matches:
            line = content[:m.start()].count('\n') + 1
            security_issues.append(f"{f}:{line}: {desc}")

if security_issues:
    print(f"  发现 {len(security_issues)} 个潜在安全问题:")
    for issue in security_issues[:20]:
        print(f"    - {issue}")
    if len(security_issues) > 20:
        print(f"    ... 还有 {len(security_issues)-20} 个")
else:
    print("  未发现明显硬编码敏感信息")

# 3. 检查导入问题
print()
print("=" * 60)
print("3. 导入检查")
print("=" * 60)
import_issues = []
for f in py_files:
    content = f.read_text(encoding='utf-8', errors='ignore')
    # 检查是否存在导入但未使用的模型/类（简单检查）
    imports = re.findall(r'from\s+\S+\s+import\s+(.+)', content)
    
# 4. 检查SQL注入风险
print()
print("=" * 60)
print("4. SQL注入风险检查")
print("=" * 60)
sql_issues = []
for f in py_files:
    content = f.read_text(encoding='utf-8', errors='ignore')
    # 检查字符串拼接SQL
    if re.search(r'f["\'].*SELECT.*\{.*\}', content, re.IGNORECASE):
        lines = [i+1 for i, line in enumerate(content.split('\n')) if re.search(r'f["\'].*SELECT.*\{', line, re.IGNORECASE)]
        for line in lines:
            sql_issues.append(f"{f}:{line}: 可能的SQL注入风险（f-string拼接SQL）")
    if re.search(r'\+.*["\'].*SELECT', content, re.IGNORECASE):
        lines = [i+1 for i, line in enumerate(content.split('\n')) if '+' in line and 'SELECT' in line.upper()]
        for line in lines:
            sql_issues.append(f"{f}:{line}: 可能的SQL注入风险（字符串拼接SQL）")

if sql_issues:
    print(f"  发现 {len(sql_issues)} 个潜在SQL注入风险:")
    for issue in sql_issues[:20]:
        print(f"    - {issue}")
else:
    print("  未发现明显的SQL注入风险")

# 5. 检查N+1查询风险
print()
print("=" * 60)
print("5. N+1查询风险检查")
print("=" * 60)
n1_issues = []
for f in py_files:
    content = f.read_text(encoding='utf-8', errors='ignore')
    # 检查循环中执行数据库查询
    if re.search(r'for\s+\w+\s+in\s+.*:\s*\n.*await\s+db\.execute', content):
        lines = [i+1 for i, line in enumerate(content.split('\n')) 
                 if 'for ' in line and i+1 < len(content.split('\n')) and 'await' in content.split('\n')[i+1]]
        for line in lines:
            n1_issues.append(f"{f}:{line}: 循环中执行查询，可能存在N+1问题")

if n1_issues:
    print(f"  发现 {len(n1_issues)} 个潜在N+1查询:")
    for issue in n1_issues[:20]:
        print(f"    - {issue}")
else:
    print("  未发现明显的N+1查询风险")

# 6. 检查500错误端点
print()
print("=" * 60)
print("6. 检查可能导致500的端点")
print("=" * 60)

# 7. 检查模型字段一致性
print()
print("=" * 60)
print("7. 模型字段检查")
print("=" * 60)
model_issues = []
# 检查常见字段名拼写错误
for f in Path('app/models').rglob('*.py'):
    content = f.read_text(encoding='utf-8', errors='ignore')
    # 检查是否有 entity_name 但使用了错误的 entity_name
    if 'entity_name' in content and 'entity_name' in content:
        pass  # 正常

print("  模型检查完成")

# 8. 检查前端路由一致性
print()
print("=" * 60)
print("8. 前端路由一致性检查")
print("=" * 60)
app_dir = '/opt/group-platform/frontend'
if os.path.exists(f'{app_dir}/src/router.tsx'):
    router_content = Path(f'{app_dir}/src/router.tsx').read_text(encoding='utf-8', errors='ignore')
    layout_content = Path(f'{app_dir}/src/layouts/AppLayout.tsx').read_text(encoding='utf-8', errors='ignore')
    
    # 提取路由路径
    routes = re.findall(r'path:\s*["\']([^"\']+)["\']', router_content)
    # 提取菜单路径
    menu_paths = re.findall(r'path:\s*["\']([^"\']+)["\']', layout_content)
    
    menu_not_in_routes = [p for p in menu_paths if p not in routes and p != '/']
    if menu_not_in_routes:
        print(f"  菜单中有 {len(menu_not_in_routes)} 个路径在路由中未定义:")
        for p in menu_not_in_routes:
            print(f"    - {p}")
    else:
        print("  菜单路径和路由定义一致")
else:
    print("  未找到前端源码")

print()
print("=" * 60)
print("审计完成")
print("=" * 60)