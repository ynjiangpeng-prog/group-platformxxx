import uuid

# 生成UUID
jiang_peng_id = str(uuid.uuid4())
nie_zhiping_id = str(uuid.uuid4())

print(f"姜鹏 ID: {jiang_peng_id}")
print(f"聂志平 ID: {nie_zhiping_id}")

# 生成SQL
sql = f"""
INSERT INTO company_entities (id, company_id, entity_name, entity_type, status, is_deleted, created_at)
SELECT 
    '{jiang_peng_id}'::uuid,
    id,
    '姜鹏',
    'personal',
    'active',
    false,
    NOW()
FROM companies 
WHERE is_deleted = false 
LIMIT 1;

INSERT INTO company_entities (id, company_id, entity_name, entity_type, status, is_deleted, created_at)
SELECT 
    '{nie_zhiping_id}'::uuid,
    id,
    '聂志平',
    'personal',
    'active',
    false,
    NOW()
FROM companies 
WHERE is_deleted = false 
LIMIT 1;
"""

print(sql)