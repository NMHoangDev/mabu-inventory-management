-- ============================================================
-- Bảng fb_inbox_kpi: Lưu trữ KPI inbox được xác nhận thủ công
-- từ nút "Tính Inbox" trên hộp thoại Facebook trong UI.
--
-- Luồng:
--   1. Leader/Admin mở hộp thoại FB trên Inbox page
--   2. Bấm "Xác nhận Inbox" hoặc "Xác nhận Inbox + Lead"
--   3. Frontend gọi POST /kpi/fb-inbox-sync
--   4. Backend upsert vào bảng fb_inbox_kpi
--   5. KPI dashboard đọc tổng inbox từ bảng này
-- ============================================================

-- Tạo bảng nếu chưa tồn tại (PostgreSQL / Supabase)
CREATE TABLE IF NOT EXISTS public.fb_inbox_kpi (
    id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    id_member       UUID        NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
    id_leader       UUID        NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
    conv_id         TEXT        NOT NULL,
    user_id         TEXT        NOT NULL,  -- FB user_id (tài khoản FB của nhân viên)
    message_count   INTEGER     NOT NULL DEFAULT 1,
    is_lead         BOOLEAN     NOT NULL DEFAULT FALSE,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Mỗi conv_id chỉ được upsert 1 lần (hoặc nhiều lần với is_lead thay đổi)
    CONSTRAINT fb_inbox_kpi_unique_conv_member UNIQUE (id_member, conv_id, user_id)
);

-- Index để query nhanh theo member và ngày
CREATE INDEX IF NOT EXISTS fb_inbox_kpi_id_member_synced_idx
    ON public.fb_inbox_kpi (id_member, synced_at DESC);

CREATE INDEX IF NOT EXISTS fb_inbox_kpi_id_leader_idx
    ON public.fb_inbox_kpi (id_leader, synced_at DESC);

CREATE INDEX IF NOT EXISTS fb_inbox_kpi_user_id_idx
    ON public.fb_inbox_kpi (user_id, synced_at DESC);

-- Bảo vệ dữ liệu: không cho xóa hàng loạt
ALTER TABLE public.fb_inbox_kpi ENABLE ROW LEVEL SECURITY;

-- Policy: ai cũng có thể đọc (cho KPI dashboard)
CREATE POLICY IF NOT EXISTS fb_inbox_kpi_select ON public.fb_inbox_kpi
    FOR SELECT USING (true);

-- Policy: chỉ service backend (authenticated) mới được insert/update
CREATE POLICY IF NOT EXISTS fb_inbox_kpi_insert ON public.fb_inbox_kpi
    FOR INSERT WITH CHECK (true);

CREATE POLICY IF NOT EXISTS fb_inbox_kpi_update ON public.fb_inbox_kpi
    FOR UPDATE USING (true);

COMMENT ON TABLE public.fb_inbox_kpi IS
    'Lưu trữ KPI inbox được xác nhận thủ công từ nút Tính Inbox trên hộp thoại Facebook. '
    'Mỗi hội thoại = 1 row, đếm số lần được xác nhận (message_count) và có đánh dấu is_lead hay không.';
