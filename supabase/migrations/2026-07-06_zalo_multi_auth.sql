-- Migration: Auth cho multi-account Zalo + phân quyền staff
-- Chạy trong Supabase SQL Editor.
--
-- Bối cảnh: Trước đó hệ thống hardcode 1 account_id = "shop-owner". Nay cần:
--   1) Nhiều tài khoản Zalo (mỗi nhân viên 1 hoặc nhiều)
--   2) Phân biệt tài khoản Zalo của ai, conversations của ai
--   3) Phân quyền: admin thấy tất cả, staff chỉ thấy assigned
--
-- Thiết kế:
--   staff               — người dùng nội bộ, 1 row / nhân viên
--   zalo_accounts       — metadata của từng TK Zalo đang quản lý (mirror từ
--                         file data/sessions/<id>.json của zalo-bridge)
--   staff_zalo_assignments — RBAC: staff xem được những TK nào
--
-- Backward compat: mọi cột mới đều nullable / có default "shop-owner".
-- Cột `account_id` đã có ở bảng zalo_messages/zalo_groups/zalo_conversations_ui/
-- zalo_message_drafts nên không phải thêm lại.
--
-- Indexes + RLS giữ cùng pattern với zalo migration trước:
--   - RLS ON, policy "using (true) with check (true)" cho anon full access
--   - Service role bypass RLS (dùng cho zalo-bridge → upsert metadata).

-- ============================================================================
-- 0. Đảm bảo function set_updated_at() tồn tại (một số DB cũ thiếu)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. staff
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  -- Role cho phép phân quyền ở backend:
  --   admin: thấy tất cả TK Zalo, thêm/xoá/assign
  --   staff: chỉ thấy các TK trong staff_zalo_assignments
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_role_active
  ON public.staff(role, is_active);
CREATE TRIGGER trg_staff_updated
  BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_staff" ON public.staff;
CREATE POLICY "anon_all_staff"
  ON public.staff FOR ALL
  USING (true) WITH CHECK (true);

-- Seed 1 admin mặc định nếu bảng rỗng — tránh "no admin" lockout khi triển khai
-- lần đầu. Owner có thể vào SQL Editor hoặc /zalo/accounts để tạo thêm.
INSERT INTO public.staff (email, full_name, role, is_active)
  SELECT 'admin@local', 'System Admin', 'admin', TRUE
  WHERE NOT EXISTS (SELECT 1 FROM public.staff);

-- ============================================================================
-- 2. zalo_accounts
-- ============================================================================
-- Bảng này đã được tạo từ migration Zalo trước đó với schema:
--   id, account_id, owner_id, phone, label, status, is_active, avatar_url,
--   zalo_id, last_seen_at, last_login_at, created_at, updated_at
-- Migration này chỉ ADD COLUMN mới (owner_staff_id, display_name,
-- zalo_display_name, last_error, metadata) để tương thích với code mới.

ALTER TABLE public.zalo_accounts
  ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.zalo_accounts
  ADD COLUMN IF NOT EXISTS owner_staff_id UUID;
ALTER TABLE public.zalo_accounts
  ADD COLUMN IF NOT EXISTS zalo_display_name TEXT;
ALTER TABLE public.zalo_accounts
  ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE public.zalo_accounts
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Backfill display_name = label cho row đã có (nếu NULL).
UPDATE public.zalo_accounts
  SET display_name = label
  WHERE display_name IS NULL AND label IS NOT NULL;

-- FK owner_staff_id → staff.id (chỉ add nếu chưa có).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'zalo_accounts_owner_staff_id_fkey'
      AND conrelid = 'public.zalo_accounts'::regclass
  ) THEN
    ALTER TABLE public.zalo_accounts
      ADD CONSTRAINT zalo_accounts_owner_staff_id_fkey
      FOREIGN KEY (owner_staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Relax CHECK constraint status nếu có (cho phép các giá trị legacy).
ALTER TABLE public.zalo_accounts
  DROP CONSTRAINT IF EXISTS zalo_accounts_status_check;

CREATE INDEX IF NOT EXISTS idx_zalo_accounts_owner
  ON public.zalo_accounts(owner_staff_id);
CREATE INDEX IF NOT EXISTS idx_zalo_accounts_status_idx
  ON public.zalo_accounts(status);

CREATE INDEX IF NOT EXISTS idx_zalo_accounts_owner
  ON public.zalo_accounts(owner_staff_id);
CREATE INDEX IF NOT EXISTS idx_zalo_accounts_status
  ON public.zalo_accounts(status);

DROP TRIGGER IF EXISTS trg_zalo_accounts_updated ON public.zalo_accounts;
CREATE TRIGGER trg_zalo_accounts_updated
  BEFORE UPDATE ON public.zalo_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.zalo_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_zalo_accounts" ON public.zalo_accounts;
CREATE POLICY "anon_all_zalo_accounts"
  ON public.zalo_accounts FOR ALL
  USING (true) WITH CHECK (true);

-- Backfill: nếu đã có session "shop-owner" đang chạy, tạo row zalo_accounts tương ứng
-- để UI không trống lúc triển khai. Owner để NULL — admin có thể assign sau.
-- Lưu ý: bảng zalo_accounts cũ yêu cầu owner_id NOT NULL → set = account_id.
INSERT INTO public.zalo_accounts (account_id, display_name, owner_id, status, last_seen_at, is_active)
  SELECT 'shop-owner', 'Shop chính', 'shop-owner', 'disconnected', NOW(), TRUE
  WHERE NOT EXISTS (
    SELECT 1 FROM public.zalo_accounts WHERE account_id = 'shop-owner'
  );

-- ============================================================================
-- 3. staff_zalo_assignments — RBAC nhân viên ↔ tài khoản Zalo
-- ============================================================================
-- Một nhân viên có thể phụ trách nhiều TK Zalo và ngược lại. Bảng này lưu
-- cặp (staff_id, account_id) + quyền cụ thể (xem/gửi/broadcast).
CREATE TABLE IF NOT EXISTS public.staff_zalo_assignments (
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES public.zalo_accounts(account_id) ON DELETE CASCADE,
  can_view BOOLEAN NOT NULL DEFAULT TRUE,
  can_send BOOLEAN NOT NULL DEFAULT TRUE,
  can_broadcast BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (staff_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_assignments_account
  ON public.staff_zalo_assignments(account_id);

ALTER TABLE public.staff_zalo_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_staff_assignments" ON public.staff_zalo_assignments;
CREATE POLICY "anon_all_staff_assignments"
  ON public.staff_zalo_assignments FOR ALL
  USING (true) WITH CHECK (true);

-- Auto-assign admin ↔ mọi TK khi tạo — admin xem được hết.
-- Trigger AFTER INSERT trên zalo_accounts: nếu owner_staff_id là admin
-- (role='admin') → ensure assignment row can_view=true, can_send=true,
-- can_broadcast=true.
CREATE OR REPLACE FUNCTION public.zalo_accounts_assign_admin()
RETURNS TRIGGER AS $$
DECLARE
  v_staff_role TEXT;
BEGIN
  IF NEW.owner_staff_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT role INTO v_staff_role FROM public.staff WHERE id = NEW.owner_staff_id;
  IF v_staff_role = 'admin' THEN
    INSERT INTO public.staff_zalo_assignments (staff_id, account_id, can_view, can_send, can_broadcast)
      VALUES (NEW.owner_staff_id, NEW.account_id, TRUE, TRUE, TRUE)
      ON CONFLICT (staff_id, account_id)
      DO UPDATE SET can_view = TRUE, can_send = TRUE, can_broadcast = TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_zalo_accounts_assign_admin ON public.zalo_accounts;
CREATE TRIGGER trg_zalo_accounts_assign_admin
  AFTER INSERT OR UPDATE OF owner_staff_id ON public.zalo_accounts
  FOR EACH ROW EXECUTE FUNCTION public.zalo_accounts_assign_admin();

-- Backfill: auto-assign admin system ↔ mọi TK hiện có.
INSERT INTO public.staff_zalo_assignments (staff_id, account_id, can_view, can_send, can_broadcast)
  SELECT s.id, a.account_id, TRUE, TRUE, TRUE
  FROM public.staff s
  CROSS JOIN public.zalo_accounts a
  WHERE s.role = 'admin'
    AND NOT EXISTS (
      SELECT 1 FROM public.staff_zalo_assignments
      WHERE staff_id = s.id AND account_id = a.account_id
    );

-- ============================================================================
-- 4. Helper view: v_staff_zalo_accounts — flatten cho query nhanh
-- ============================================================================
-- UI / API chỉ cần query 1 view duy nhất thay vì join 3 bảng mỗi request.
CREATE OR REPLACE VIEW public.v_staff_zalo_accounts AS
SELECT
  a.account_id,
  COALESCE(a.display_name, a.label) AS display_name,
  a.phone,
  a.zalo_id AS zalo_user_id,
  a.zalo_display_name,
  a.status,
  a.last_error,
  a.last_seen_at,
  a.owner_staff_id,
  s.email AS owner_email,
  s.full_name AS owner_full_name,
  s.role AS owner_role,
  asm.staff_id,
  asm.can_view,
  asm.can_send,
  asm.can_broadcast
FROM public.zalo_accounts a
LEFT JOIN public.staff s ON s.id = a.owner_staff_id
LEFT JOIN public.staff_zalo_assignments asm
  ON asm.account_id = a.account_id;

GRANT SELECT ON public.v_staff_zalo_accounts TO anon, authenticated;
