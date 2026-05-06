#!/usr/bin/env python3
import os
import sys
import re
from pathlib import Path

BASE_DIR = '/opt/group-platform/backend'
os.chdir(BASE_DIR)

print("=" * 60)
print("深入代码审计")
print("=" * 60)

# 1. 检查JWT密钥配置
print()
print("1. JWT/安全密钥配置")
print("-" * 40)
config_files = list(Path('app/core').rglob('*.py')) + list(Path('app').glob('config*.py'))
for f in config_files:
    content = f.read_text(encoding='utf-8', errors='ignore')
    if 'SECRET' in content or 'ALGORITHM' in content or 'secret' in content:
        for i, line in enumerate(content.split('\n'), 1):
            if 'SECRET' in line or 'ALGORITHM' in line or ('secret' in line.lower() and '=' in line):
                print(f"  {f}:{i}: {line.strip()}")

# 2. 检查数据库连接池配置
print()
print("2. 数据库连接配置")
print("-" * 40)
db_files = list(Path('app/core').rglob('*.py'))
for f in db_files:
    content = f.read_text(encoding='utf-8', errors='ignore')
    if 'pool_size' in content or 'max_overflow' in content or 'echo' in content:
        for i, line in enumerate(content.split('\n'), 1):
            if any(k in line for k in ['pool_size', 'max_overflow', 'echo', 'pool_recycle', 'connect_args']):
                print(f"  {f}:{i}: {line.strip()}")

# 3. 检查异常处理
print()
print("3. 路由异常处理检查")
print("-" * 40)
router_files = list(Path('app/api').rglob('router.py')) + list(Path('app/api').rglob('*.py'))
try_except_count = 0
no_try_except_routes = []
for f in router_files:
    content = f.read_text(encoding='utf-8', errors='ignore')
    # 检查是否有try-except
    if '@router.' in content and 'async def ' in content:
        has_try = 'try:' in content and 'except' in content
        if not has_try:
            # 只统计有路由定义的较大文件
            routes = content.count('@router.')
            if routes > 2:
                no_try_except_routes.append(f"{f} ({routes} 个路由)")

print(f"  未加 try-except 的路由文件: {len(no_try_except_routes)}")
for r in no_try_except_routes[:10]:
    print(f"    - {r}")

# 4. 检查同步IO调用
print()
print("4. 异步代码中同步IO检查")
print("-" * 40)
sync_issues = []
for f in Path('app').rglob('*.py'):
    content = f.read_text(encoding='utf-8', errors='ignore')
    # 在async函数中检查同步阻塞调用
    lines = content.split('\n')
    in_async = False
    for i, line in enumerate(lines):
        if 'async def ' in line:
            in_async = True
        elif line.strip() and not line.startswith(' ') and not line.startswith('\t'):
            in_async = False
        
        if in_async and any(x in line for x in ['open(', 'os.', 'shutil.', 'subprocess.', 'requests.']):
            sync_issues.append(f"{f}:{i+1}: {line.strip()}")

if sync_issues:
    print(f"  发现 {len(sync_issues)} 处异步函数中的同步调用:")
    for issue in sync_issues[:15]:
        print(f"    - {issue}")
else:
    print("  未发现明显问题")

# 5. 检查大查询（缺少分页）
print()
print("5. 缺少分页的大查询检查")
print("-" * 40)
page_issues = []
for f in Path('app/api').rglob('*.py'):
    content = f.read_text(encoding='utf-8', errors='ignore')
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if '.all()' in line or 'scalars().all()' in line:
            # 检查前面是否有limit/offset
            prev_lines = '\n'.join(lines[max(0, i-10):i])
            if 'limit' not in prev_lines.lower() and 'offset' not in prev_lines.lower():
                page_issues.append(f"{f}:{i+1}: {line.strip()}")

if page_issues:
    print(f"  发现 {len(page_issues)} 处可能缺少分页的查询:")
    for issue in page_issues[:10]:
        print(f"    - {issue}")
else:
    print("  未发现明显问题")

# 6. 检查循环中的数据库操作
print()
print("6. 循环中的数据库操作（N+1）")
print("-" * 40)
n1_detail = []
for f in Path('app/api').rglob('*.py'):
    content = f.read_text(encoding='utf-8', errors='ignore')
    lines = content.split('\n')
    for i in range(len(lines)):
        if 'for ' in lines[i] and ':' in lines[i]:
            # 检查后续几行是否有await db.execute
            for j in range(i+1, min(i+5, len(lines))):
                if 'await' in lines[j] and 'db.' in lines[j]:
                    n1_detail.append(f"{f}:{i+1}-{j+1}: 循环内查询")
                    break

print(f"  API层发现 {len(n1_detail)} 处循环内查询")
for d in n1_detail:
    print(f"    - {d}")

# 7. 检查模型关系定义
print()
print("7. 模型关系检查")
print("-" * 40)
model_files = list(Path('app/models').rglob('*.py'))
cascade_issues = []
for f in model_files:
    content = f.read_text(encoding='utf-8', errors='ignore')
    # 检查relationship是否配置了lazy
    if 'relationship(' in content:
        for i, line in enumerate(content.split('\n'), 1):
            if 'relationship(' in line and 'lazy=' not in content[max(0, i-1):i+2]:
                cascade_issues.append(f"{f}:{i}: relationship 缺少 lazy 配置")

if cascade_issues:
    print(f"  发现 {len(cascade_issues)} 个relationship缺少lazy配置:")
    for issue in cascade_issues[:10]:
        print(f"    - {issue}")
else:
    print("  未发现明显问题")

# 8. 检查docker-compose配置
print()
print("8. Docker配置检查")
print("-" * 40)
docker_compose = Path('/opt/group-platform/docker-compose.yml')
if docker_compose.exists():
    content = docker_compose.read_text(encoding='utf-8', errors='ignore')
    if 'restart' in content:
        print("  Docker配置中包含restart策略")
    if 'ports' in content:
        print("  Docker端口映射已配置")

print()
print("=" * 60)
print("审计完成")
print("=" * 60)