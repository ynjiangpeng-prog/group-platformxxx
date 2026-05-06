-- 查看工程师角色的ID
SELECT id, name FROM roles WHERE name = '工程师' AND is_deleted = false;

-- 查看工程师角色的备用金权限
SELECT rp.id, p.code 
FROM role_permissions rp 
JOIN permissions p ON p.id = rp.permission_id 
JOIN roles r ON r.id = rp.role_id 
WHERE r.name = '工程师' 
AND p.code LIKE '%petty%' 
AND rp.is_deleted = false;

-- 软删除工程师角色的备用金权限
UPDATE role_permissions 
SET is_deleted = true, updated_at = NOW()
WHERE role_id IN (SELECT id FROM roles WHERE name = '工程师' AND is_deleted = false)
AND permission_id IN (SELECT id FROM permissions WHERE code LIKE '%petty%')
AND is_deleted = false;

-- 验证
SELECT r.name, p.code 
FROM roles r 
JOIN role_permissions rp ON r.id = rp.role_id 
JOIN permissions p ON p.id = rp.permission_id 
WHERE r.name = '工程师' 
AND p.code LIKE '%petty%' 
AND rp.is_deleted = false;