INSERT INTO company_entities (id, company_id, entity_name, status, is_deleted, created_at)
SELECT 
    'd32aecfa-de67-4e05-8af5-3f619b144a2b'::uuid,
    id,
    '姜鹏',
    'active',
    false,
    NOW()
FROM companies 
WHERE is_deleted = false 
LIMIT 1;

INSERT INTO company_entities (id, company_id, entity_name, status, is_deleted, created_at)
SELECT 
    'c3ee6bd5-265c-4745-b130-90672da1fa65'::uuid,
    id,
    '聂志平',
    'active',
    false,
    NOW()
FROM companies 
WHERE is_deleted = false 
LIMIT 1;
