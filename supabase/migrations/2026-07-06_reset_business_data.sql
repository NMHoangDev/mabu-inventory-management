-- Migration: Reset toàn bộ business data — chuẩn bị môi trường thực tế.
--
-- ⚠️  FILE NÀY XÓA HẾT DATA NGHIỆP VỤ. CHỈ CHẠY KHI ĐÃ XÁC NHẬN.
--     Không có rollback. Nếu cần giữ lại, hãy backup trước:
--       pg_dump -t 'public.*' <DATABASE_URL> > backup_$(date +%F).sql
--
-- GIỮ LẠI:
--   • Schema (toàn bộ CREATE TABLE/INDEX ở các migration trước)
--   • Locations mặc định (để GR / scan có nơi upsert inventory_levels)
--   • Zalo multi-auth (staff, zalo_accounts, staff_zalo_assignments, ...)
--   • Supabase Auth (auth.users, ..)
--
-- XÓA (theo thứ tự CASCADE):
--   • Receipts / orders / customers
--   • Products / variants / catalog / images / batches / options / inventory_levels
--   • Suppliers / purchase_orders / stock_receipts / stock_checks / cost_adjustments
--   • Invoice / orders / order_items / shippings
--   • Customers / customer_groups / customer_addresses
--   • Activity logs / automation rules / automation runs / reorder suggestions
--   • Cash book
--
-- Reset sequences (goods_receipts.code, purchase_orders.code, ...) để mã
-- PNH/PON/NK bắt đầu lại từ đầu thay vì nối tiếp số cũ.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Zalo tables — KHÔNG đụng (multi-auth migration giữ lại)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 2. Invoice / scan
-- ---------------------------------------------------------------------------
TRUNCATE TABLE
  invoice_rows,
  invoice_documents,
  quick_options
RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Customers / groups / addresses
-- ---------------------------------------------------------------------------
TRUNCATE TABLE
  customer_addresses,
  customers,
  customer_groups
RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Suppliers (trước vì goods_receipts / purchase_orders FK tới nó)
-- ---------------------------------------------------------------------------
TRUNCATE TABLE
  suppliers
RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- 5. Orders / shipping / payments
-- ---------------------------------------------------------------------------
TRUNCATE TABLE
  shipping_events,
  shippings,
  shipping_settings,
  order_items,
  orders
RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- 6. Stock receipts / stock checks / cost adjustments / reorder / automation
-- ---------------------------------------------------------------------------
TRUNCATE TABLE
  stock_receipt_items,
  stock_receipts,
  stock_check_items,
  stock_checks,
  cost_adjustment_items,
  cost_adjustments,
  reorder_suggestions,
  automation_runs,
  automation_rules
RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- 7. Goods receipts / purchase orders (goods_receipt_items có FK tới cả 2)
-- ---------------------------------------------------------------------------
TRUNCATE TABLE
  goods_receipt_items,
  goods_receipts,
  purchase_order_items,
  purchase_orders
RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- 8. Cash book
-- ---------------------------------------------------------------------------
TRUNCATE TABLE
  cash_book
RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- 9. Activity logs
-- ---------------------------------------------------------------------------
TRUNCATE TABLE
  activity_logs
RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- 10. Products — đây là nhóm cuối, các bảng kho trên đều đã truncate
-- ---------------------------------------------------------------------------
TRUNCATE TABLE
  product_images,
  product_batches,
  inventory_levels,    -- cần sạch vì nếu còn variant "ma" sẽ bị lệch
  product_variants,
  product_options,
  product_catalog,
  products,
  categories,
  brands,
  product_types
RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- 11. Locations — KHÔNG truncate, nhưng đảm bảo luôn có 1 location mặc định
--     (idempotent — chạy lại vẫn OK).
-- ---------------------------------------------------------------------------
INSERT INTO locations (name, is_default, is_active, created_at, updated_at)
SELECT 'Cửa hàng chính', true, true, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM locations WHERE is_default = true);

COMMIT;

-- ---------------------------------------------------------------------------
-- Sau khi chạy file này:
--   • UI /products sẽ trống (0 sản phẩm) — đúng.
--   • /products/goods-receipts sẽ trống.
--   • Khi tạo GR mới và bấm "Thanh toán hoàn thành", flow fix mới sẽ chạy:
--       - update products.stock += qty
--       - applyInventoryLevelDelta: tạo variant "Mặc định" nếu chưa,
--         upsert inventory_levels.quantity += qty → UI "Khả dụng" tăng đúng.
-- ---------------------------------------------------------------------------