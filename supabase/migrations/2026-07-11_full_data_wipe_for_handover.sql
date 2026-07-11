-- Migration: Xóa TOÀN BỘ dữ liệu nghiệp vụ để chuẩn bị bàn giao hệ thống
-- cho khách hàng/đối tác mới — giữ nguyên schema (mọi CREATE TABLE/INDEX ở
-- các migration trước) và chỉ giữ lại 1 tài khoản admin để còn đăng nhập
-- được vào hệ thống rỗng.
--
-- ⚠️  KHÔNG CÓ ROLLBACK. Đây là hành động không thể hoàn tác trên database
--     production thật. Chỉ chạy khi đã chắc chắn muốn xóa sạch để bàn giao.
--     (Migration 2026-07-06_reset_business_data.sql trước đó không đụng
--     Zalo — lần này xóa TẤT CẢ, kể cả hội thoại/tin nhắn/forward-rules Zalo,
--     vì mục đích là bàn giao cho chủ mới, không phải reset môi trường demo.)
--
-- GIỮ LẠI:
--   • Toàn bộ schema (bảng, cột, index, trigger, view).
--   • Bảng `staff`: xóa hết trừ tài khoản role='admin' (System Admin), và
--     reset password_hash về NULL để chủ mới tự đặt mật khẩu ở lần đăng
--     nhập đầu tiên (cơ chế bootstrap-on-first-login có sẵn, xem lib/auth).
--
-- XÓA SẠCH (TRUNCATE ... CASCADE — thứ tự không quan trọng, Postgres tự
-- giải quyết theo FK):
--   Đơn hàng/khách hàng, sản phẩm/kho, nhà cung cấp/nhập hàng, tài chính,
--   scan hóa đơn, Zalo (hội thoại/tin nhắn/forward-rules/broadcast/tài
--   khoản Zalo), activity logs, automation, v.v.

BEGIN;

TRUNCATE TABLE
  -- Đơn hàng / khách hàng
  order_items,
  orders,
  customer_addresses,
  customer_sessions,
  customers,
  customer_groups,
  identity_documents,
  identity_profiles,
  -- Vận chuyển
  shipping_events,
  shippings,
  shipping_settings,
  -- Sản phẩm / kho
  product_images,
  product_batches,
  product_search_usage,
  product_suppliers,
  inventory_levels,
  product_variants,
  product_options,
  product_catalog,
  catalog_products,
  reorder_suggestions,
  products,
  categories,
  brands,
  product_types,
  quick_options,
  -- Nhà cung cấp / nhập hàng
  goods_receipt_items,
  goods_receipts,
  purchase_order_items,
  purchase_orders,
  stock_receipt_items,
  stock_receipts,
  stock_check_items,
  stock_checks,
  cost_adjustment_items,
  cost_adjustments,
  supplier_groups,
  suppliers,
  -- Scan hóa đơn
  invoice_rows,
  invoice_documents,
  -- Tài chính
  cash_book,
  -- Automation / logs
  activity_logs,
  automation_runs,
  automation_rules,
  -- Zalo — xóa toàn bộ (khác migration 2026-07-06 trước đó)
  zalo_message_assets,
  zalo_message_drafts,
  zalo_messages,
  zalo_conversations_ui,
  zalo_conversation_permissions,
  zalo_forward_logs,
  zalo_forward_targets,
  zalo_forward_rules,
  zalo_broadcast_logs,
  zalo_broadcast_campaigns,
  zalo_groups,
  zalo_users,
  zalo_sessions,
  staff_zalo_assignments,
  zalo_accounts,
  -- Site / shipping config (chủ mới tự cấu hình lại)
  site_settings
RESTART IDENTITY CASCADE;

-- Locations: không truncate (nhiều bảng vẫn tham chiếu qua session hiện tại),
-- nhưng đảm bảo luôn có đúng 1 location mặc định cho hệ thống rỗng.
DELETE FROM locations WHERE is_default IS NOT TRUE;
INSERT INTO locations (name, is_default, is_active, created_at, updated_at)
SELECT 'Cửa hàng chính', true, true, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM locations WHERE is_default = true);

-- Staff: chỉ giữ tài khoản admin, reset password để chủ mới tự bootstrap.
DELETE FROM staff WHERE role <> 'admin';
UPDATE staff SET password_hash = NULL WHERE role = 'admin';

COMMIT;

-- ---------------------------------------------------------------------------
-- Sau khi chạy file này:
--   • Toàn bộ UI (đơn hàng, sản phẩm, NCC, kho, Zalo, tài chính...) sẽ trống.
--   • Đăng nhập bằng email admin@local — mật khẩu sẽ được đặt ở lần đăng
--     nhập đầu tiên (bootstrap-on-first-login).
--   • Cần đăng nhập lại tài khoản Zalo thật qua extension để dùng lại tính
--     năng Zalo (session cookie cũ trên server KHÔNG bị xóa bởi migration
--     này — nếu cần logout Zalo thật, phải xóa riêng file session ở
--     services/zalo-bridge/data/sessions/ trên server).
-- ---------------------------------------------------------------------------
