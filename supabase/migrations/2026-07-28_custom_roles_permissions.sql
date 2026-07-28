-- Migration: Vai trò tuỳ chỉnh + phân quyền chi tiết theo module (business permissions)
-- Chạy tay trong Supabase SQL Editor (hoặc `psql $DATABASE_URL -f ...`) — KHÔNG tự apply.
--
-- Bối cảnh: staff.role (admin/staff) chỉ là RBAC cứng cho riêng module Zalo
-- (staff_zalo_assignments, requireAdmin ở lib/zalo/auth.ts) — KHÔNG đụng tới,
-- giữ nguyên 100%. Hệ thống roles/role_permissions dưới đây là lớp phân quyền
-- MỚI, độc lập, cho các module nghiệp vụ (products/orders/inventory/...),
-- catalog quyền định nghĩa ở code (lib/permissions/catalog.ts) — permission_key
-- ở đây là text tự do, validate ở API layer (Zod), không có FK/CHECK vì catalog
-- có thể mở rộng bằng cách sửa code mà không cần migration mới.
--
-- staff.role_id (thêm ở mục 3) hoàn toàn TÁCH RIÊNG khỏi staff.role cũ.

-- ============================================================================
-- 0. Đảm bảo function set_updated_at() tồn tại
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. roles
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_name_lower ON public.roles (lower(name));

DROP TRIGGER IF EXISTS trg_roles_updated ON public.roles;
CREATE TRIGGER trg_roles_updated
  BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_roles" ON public.roles;
CREATE POLICY "anon_all_roles"
  ON public.roles FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. role_permissions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions(role_id);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_role_permissions" ON public.role_permissions;
CREATE POLICY "anon_all_role_permissions"
  ON public.role_permissions FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. staff.role_id — liên kết staff ↔ vai trò tuỳ chỉnh (TÁCH RIÊNG staff.role cũ)
-- ============================================================================
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.roles(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_staff_role_id ON public.staff(role_id);

-- ============================================================================
-- 4. Seed 3 vai trò mẫu: Chủ / Nhân viên kho / Nhân viên bán hàng
-- ============================================================================
INSERT INTO public.roles (name, description, is_system)
  SELECT 'Chủ', 'Toàn quyền quản trị hệ thống.', TRUE
  WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE lower(name) = lower('Chủ'));

INSERT INTO public.roles (name, description, is_system)
  SELECT 'Nhân viên kho', 'Quản lý sản phẩm, đặt/nhập hàng, kiểm hàng, tồn kho.', TRUE
  WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE lower(name) = lower('Nhân viên kho'));

INSERT INTO public.roles (name, description, is_system)
  SELECT 'Nhân viên bán hàng', 'Bán hàng, quản lý đơn hàng, đơn trả hàng và khách hàng.', TRUE
  WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE lower(name) = lower('Nhân viên bán hàng'));

-- --- Chủ: toàn bộ permission_key trong catalog (lib/permissions/catalog.ts) ---
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, perm
FROM public.roles r
CROSS JOIN LATERAL unnest(ARRAY[
  'products.view','products.create','products.edit','products.delete','products.export','products.import',
  'inventory.view','inventory.create','inventory.edit',
  'purchase_orders.view','purchase_orders.create','purchase_orders.edit',
  'goods_receipts.view','goods_receipts.create','goods_receipts.edit','goods_receipts.pay',
  'stock_checks.view','stock_checks.create','stock_checks.balance',
  'cost_adjustments.view','cost_adjustments.create','cost_adjustments.edit',
  'suppliers.view','suppliers.create','suppliers.edit','suppliers.delete',
  'orders.view','orders.create','orders.edit','orders.delete','orders.export','orders.import','orders.approve','orders.fulfill',
  'order_returns.view','order_returns.create',
  'customers.view','customers.create','customers.edit','customers.delete',
  'promotions.view','promotions.create','promotions.edit','promotions.delete',
  'shipping.view','shipping.create','shipping.edit','shipping.delete','shipping.manage_settings',
  'receipt_vouchers.view','receipt_vouchers.create','receipt_vouchers.edit','receipt_vouchers.delete',
  'payment_vouchers.view','payment_vouchers.create','payment_vouchers.edit','payment_vouchers.delete',
  'reports.view_sales','reports.view_purchases','reports.view_inventory','reports.view_finance','reports.view_customers','reports.export_inventory',
  'automations.view','automations.create','automations.edit','automations.delete',
  'settings.manage_staff','settings.manage_roles','settings.manage_storefront'
]) AS perm
WHERE r.name = 'Chủ'
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- --- Nhân viên kho ---
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, perm
FROM public.roles r
CROSS JOIN LATERAL unnest(ARRAY[
  'products.view','products.create','products.edit','products.delete','products.export','products.import',
  'inventory.view','inventory.create','inventory.edit',
  'purchase_orders.view','purchase_orders.create','purchase_orders.edit',
  'goods_receipts.view','goods_receipts.create','goods_receipts.edit','goods_receipts.pay',
  'stock_checks.view','stock_checks.create','stock_checks.balance',
  'suppliers.view',
  'receipt_vouchers.view','receipt_vouchers.create','receipt_vouchers.edit','receipt_vouchers.delete',
  'payment_vouchers.view','payment_vouchers.create','payment_vouchers.edit','payment_vouchers.delete',
  'reports.view_purchases','reports.view_inventory','reports.export_inventory'
]) AS perm
WHERE r.name = 'Nhân viên kho'
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- --- Nhân viên bán hàng ---
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, perm
FROM public.roles r
CROSS JOIN LATERAL unnest(ARRAY[
  'products.view','products.create','products.edit','products.delete','products.export','products.import',
  'orders.view','orders.create','orders.edit','orders.delete','orders.export','orders.import','orders.approve','orders.fulfill',
  'order_returns.view','order_returns.create',
  'customers.view','customers.create','customers.edit','customers.delete',
  'shipping.view',
  'receipt_vouchers.view','receipt_vouchers.create','receipt_vouchers.edit','receipt_vouchers.delete',
  'payment_vouchers.view','payment_vouchers.create','payment_vouchers.edit','payment_vouchers.delete',
  'reports.view_sales'
]) AS perm
WHERE r.name = 'Nhân viên bán hàng'
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- ============================================================================
-- 5. Backfill 2 staff hiện có → role "Chủ" (tránh lockout: hiện tại cả 2 đều
--    gọi API không giới hạn gì, vì chưa hề có permission check nào tồn tại).
-- ============================================================================
UPDATE public.staff
  SET role_id = (SELECT id FROM public.roles WHERE name = 'Chủ')
  WHERE email IN ('admin@local', 'dev@local') AND role_id IS NULL;
