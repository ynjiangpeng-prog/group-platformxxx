INSERT INTO permissions (id, company_id, name, code, type, sort_order, status, is_deleted, created_at)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001', name, code, 2, 0, 1, false, now()
FROM (VALUES
  ('project:view', '查看项目'), ('project:create', '创建项目'), ('project:update', '编辑项目'), ('project:delete', '删除项目'),
  ('contract:view', '查看合同'), ('contract:create', '创建合同'), ('contract:update', '编辑合同'), ('contract:delete', '删除合同'),
  ('supplier:view', '查看供应商'), ('supplier:create', '创建供应商'), ('supplier:update', '编辑供应商'),
  ('procurement:view', '查看采购'), ('procurement:create', '创建采购'), ('procurement:update', '编辑采购'),
  ('station:view', '查看充电站'), ('station:create', '创建充电站'), ('station:update', '编辑充电站'),
  ('device:view', '查看设备'), ('device:create', '创建设备'), ('device:update', '编辑设备'),
  ('fleet:view', '查看车队客户'), ('fleet:create', '创建车队客户'), ('fleet:update', '编辑车队客户'),
  ('invoice:view', '查看发票'), ('invoice:create', '创建发票'), ('invoice:update', '编辑发票'),
  ('voucher:view', '查看凭证'), ('voucher:create', '创建凭证'), ('voucher:update', '编辑凭证'),
  ('finance:view', '查看财务'), ('finance:create', '创建财务记录'),
  ('user:view', '查看用户'), ('user:create', '创建用户'), ('user:update', '编辑用户'), ('user:reset_password', '重置密码'),
  ('role:view', '查看角色'), ('role:create', '创建角色'), ('role:update', '编辑角色'),
  ('permission:view', '查看权限'), ('permission:manage', '管理权限')
) AS t(code, name)
WHERE NOT EXISTS (
  SELECT 1 FROM permissions p WHERE p.code = t.code AND p.is_deleted = false
);
