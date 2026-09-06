-- zalo-account-module — schema khởi tạo cho self-hosted Supabase RIÊNG của
-- module này (vd chat-module-zalo.db.markeeai.com) — không phải project
-- Supabase gốc dùng chung với app chính InvoiceFlow Manager.
--
-- Chạy 1 lần trước khi dùng module: SQL Editor / `psql $DATABASE_URL -f ...`.
-- AN TOÀN chạy nhiều lần (mọi CREATE/ADD COLUMN đều IF NOT EXISTS) và an toàn
-- chạy nhầm lên DB gốc đã có sẵn data thật — sẽ no-op ở phần đã tồn tại, chỉ
-- bổ sung phần thật sự thiếu.
--
-- Gộp nội dung từ 3 migration gốc của app chính (staff + zalo_accounts +
-- staff_zalo_assignments), vì zalo_accounts bản gốc (id, account_id, owner_id,
-- phone, label, status, is_active, avatar_url, zalo_id, last_seen_at,
-- last_login_at, created_at, updated_at) predate luôn cả migrations/ folder
-- của app chính (tạo tay trong Supabase Studio từ trước) — reconstruct lại ở
-- đây cho instance mới hoàn toàn trống.
-- Nguồn tham khảo: supabase/migrations/2026-07-06_zalo_multi_auth.sql,
-- 2026-07-10_staff_password.sql (repo app chính).

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
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  avatar_url TEXT,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_staff_role_active
  ON public.staff(role, is_active);

DROP TRIGGER IF EXISTS trg_staff_updated ON public.staff;
CREATE TRIGGER trg_staff_updated
  BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_staff" ON public.staff;
CREATE POLICY "anon_all_staff"
  ON public.staff FOR ALL
  USING (true) WITH CHECK (true);

-- Seed 1 admin mặc định nếu bảng rỗng — bootstrap-on-first-login (xem
-- app/api/auth/login/route.ts) sẽ đặt mật khẩu ngay lần đăng nhập đầu tiên,
-- KHÔNG cần set password_hash sẵn ở đây.
INSERT INTO public.staff (email, full_name, role, is_active)
  SELECT 'admin@local', 'System Admin', 'admin', TRUE
  WHERE NOT EXISTS (SELECT 1 FROM public.staff);

-- ============================================================================
-- 2. zalo_accounts
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.zalo_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT UNIQUE NOT NULL,
  owner_id TEXT,
  phone TEXT,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  avatar_url TEXT,
  zalo_id TEXT,
  last_seen_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.zalo_accounts ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.zalo_accounts ADD COLUMN IF NOT EXISTS owner_staff_id UUID;
ALTER TABLE public.zalo_accounts ADD COLUMN IF NOT EXISTS zalo_display_name TEXT;
ALTER TABLE public.zalo_accounts ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE public.zalo_accounts ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.zalo_accounts
  SET display_name = label
  WHERE display_name IS NULL AND label IS NOT NULL;

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

-- Seed 1 account mặc định ("shop-owner") nếu bảng rỗng — để UI không trống
-- lúc mới triển khai. Owner để NULL, admin gán sau trong UI.
INSERT INTO public.zalo_accounts (account_id, display_name, owner_id, status, last_seen_at, is_active)
  SELECT 'shop-owner', 'Shop chính', 'shop-owner', 'disconnected', NOW(), TRUE
  WHERE NOT EXISTS (
    SELECT 1 FROM public.zalo_accounts WHERE account_id = 'shop-owner'
  );

-- ============================================================================
-- 3. staff_zalo_assignments — RBAC nhân viên ↔ tài khoản Zalo
-- ============================================================================
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

-- Backfill: auto-assign mọi admin hiện có ↔ mọi TK hiện có.
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
-- 4. Helper view
-- ============================================================================
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

-- Sau khi chạy: đăng nhập lần đầu ở /login bằng email admin@local (mật khẩu
-- bất kỳ ≥4 ký tự — sẽ được lưu làm mật khẩu chính thức luôn).
