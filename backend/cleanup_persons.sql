-- 检查是否有姜鹏或聂志平的客户记录
SELECT id, name, code FROM customers WHERE name IN ('姜鹏', '聂志平') AND is_deleted = false;

-- 检查是否有姜鹏或聂志平的供应商记录
SELECT id, name, code FROM suppliers WHERE name IN ('姜鹏', '聂志平') AND is_deleted = false;

-- 如果有，软删除它们
UPDATE customers SET is_deleted = true, updated_at = NOW() WHERE name IN ('姜鹏', '聂志平') AND is_deleted = false;
UPDATE suppliers SET is_deleted = true, updated_at = NOW() WHERE name IN ('姜鹏', '聂志平') AND is_deleted = false;

-- 验证
SELECT 'customers' as table_name, COUNT(*) as count FROM customers WHERE name IN ('姜鹏', '聂志平') AND is_deleted = false
UNION ALL
SELECT 'suppliers' as table_name, COUNT(*) as count FROM suppliers WHERE name IN ('姜鹏', '聂志平') AND is_deleted = false;