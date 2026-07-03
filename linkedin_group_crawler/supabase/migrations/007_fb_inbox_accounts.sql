-- ============================================================
-- Bảng fb_inbox_accounts: Map FB inbox account với app_users.id
--
-- Mục đích:
--   Member tự thêm FB inbox account vào app
--   Hệ thống resolve id_member TỪ BẢNG NÀY (chính xác 100%)
--   Khi Admin/Leader bấm "Xác nhận Inbox", dùng bảng này
--   để lấy id_member chính xác cho fb_inbox_kpi
--
-- Luồng:
--   1. Member thêm FB account → POST /inbox-accounts (gửi JWT)
--   2. Backend decode JWT → lấy id_member → lưu vào đây
--   3. Admin bấm "Xác nhận Inbox" → resolve id_member TỪ ĐÂY
--   4. Lưu vào fb_inbox_kpi
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fb_inbox_accounts (
    id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    id_member       UUID        NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
    user_id         TEXT        NOT NULL,  -- Seeder service user_id (VD: "fb_10001")
    fb_user_id      TEXT,                 -- Facebook UID thật (VD: "100000123456")
    account_label   TEXT,                 -- Tên hiển thị do member đặt
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Mỗi user_id chỉ thuộc về 1 member (không trùng lặp)
    CONSTRAINT fb_inbox_accounts_unique_user_id UNIQUE (user_id)
);

-- Index để resolve nhanh: user_id → id_member
CREATE INDEX IF NOT EXISTS fb_inbox_accounts_user_id_idx
    ON public.fb_inbox_accounts (user_id);

-- Index để query theo member
CREATE INDEX IF NOT EXISTS fb_inbox_accounts_id_member_idx
    ON public.fb_inbox_accounts (id_member);

-- RLS Policies
ALTER TABLE public.fb_inbox_accounts ENABLE ROW LEVEL SECURITY;

-- Policy: ai cũng đọc được (cho việc resolve id_member)
CREATE POLICY fb_inbox_accounts_select ON public.fb_inbox_accounts
    FOR SELECT USING (true);

-- Policy: member chỉ tạo account cho mình (id_member = owner)
CREATE POLICY fb_inbox_accounts_insert ON public.fb_inbox_accounts
    FOR INSERT WITH CHECK (true);  -- Backend sẽ validate via JWT

-- Policy: member chỉ update account của mình
CREATE POLICY fb_inbox_accounts_update ON public.fb_inbox_accounts
    FOR UPDATE USING (true);  -- Backend sẽ validate via JWT

-- Policy: member chỉ xóa account của mình
CREATE POLICY fb_inbox_accounts_delete ON public.fb_inbox_accounts
    FOR DELETE USING (true);  -- Backend sẽ validate via JWT

COMMENT ON TABLE public.fb_inbox_accounts IS
    'Map FB inbox account (user_id từ seeder) với app_users.id. '
    'Member tự thêm account, hệ thống dùng bảng này để resolve id_member khi xác nhận KPI.';
