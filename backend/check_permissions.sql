SELECT r.name, p.code 
FROM roles r 
JOIN role_permissions rp ON r.id = rp.role_id 
JOIN permissions p ON p.id = rp.permission_id 
WHERE p.code LIKE '%petty%' 
AND rp.is_deleted = false;