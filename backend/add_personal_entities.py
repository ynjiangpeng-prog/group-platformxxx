import psycopg2
import uuid

# 连接数据库
conn = psycopg2.connect(
    host='localhost',
    database='group_platform',
    user='postgres',
    password='postgres'
)
cur = conn.cursor()

# 检查姜鹏和聂志平是否已存在
cur.execute("""
    SELECT id, entity_name FROM company_entities 
    WHERE entity_name IN ('姜鹏', '聂志平') AND is_deleted = false
""")
existing = {row[1]: str(row[0]) for row in cur.fetchall()}
print(f"已存在的主体: {existing}")

# 获取公司ID
cur.execute("SELECT id FROM companies WHERE is_deleted = false LIMIT 1")
company_id = str(cur.fetchone()[0])
print(f"公司ID: {company_id}")

# 创建缺失的主体
names_to_create = []
if '姜鹏' not in existing:
    names_to_create.append(('姜鹏', 'PERSONAL'))
if '聂志平' not in existing:
    names_to_create.append(('聂志平', 'PERSONAL'))

for name, entity_type in names_to_create:
    entity_id = str(uuid.uuid4())
    cur.execute("""
        INSERT INTO company_entities (id, company_id, entity_name, entity_type, status, is_deleted)
        VALUES (%s, %s, %s, %s, 'active', false)
    """, (entity_id, company_id, name, entity_type))
    print(f"创建主体: {name} ({entity_id})")

conn.commit()
cur.close()
conn.close()
print("完成")