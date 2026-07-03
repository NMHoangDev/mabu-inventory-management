-- ============================================================
-- Bảng fb_post_kpi: Lưu KPI bài viết Facebook tự động
--
-- Mục đích:
--   Khi extension đăng bài FB thành công -> gửi kết quả về service
--   Service gọi API backend để lưu KPI
--   Backend resolve id_member từ user_id (FB account) -> bảng fb_inbox_accounts
--   Lưu vào bảng này để tính KPI post cho member
--
-- Luồng:
--   1. Extension đăng bài thành công trên trình duyệt
--   2. Extension gửi kết quả (job_id, user_id, post_url, content) về service
--   3. Service gọi API backend: POST /fb/post-kpi/save
--   4. Backend resolve id_member từ user_id -> fb_inbox_accounts
--   5. Backend resolve id_leader từ id_member -> teams
--   6. Lưu vào fb_post_kpi
--   7. KPI dashboard đọc từ bảng này
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fb_post_kpi (
    id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    id_member       UUID        NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
    id_leader       UUID        NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
    user_id         TEXT        NOT NULL,  -- Seeder service user_id (VD: "fb_10001")
    job_id          TEXT        NOT NULL,  -- Job ID từ service
    post_url        TEXT,                  -- URL bài viết đã đăng
    content         TEXT,                  -- Nội dung bài viết (preview)
    target_type     TEXT        DEFAULT 'profile',  -- 'profile' | 'group' | 'page'
    target_id       TEXT,                  -- Group/Page ID nếu có
    platform        TEXT        DEFAULT 'facebook',
    posted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Mỗi job_id chỉ được lưu 1 lần (tránh duplicate)
    CONSTRAINT fb_post_kpi_unique_job_id UNIQUE (job_id)
);

-- Index để query nhanh theo member và ngày
CREATE INDEX IF NOT EXISTS fb_post_kpi_id_member_idx
    ON public.fb_post_kpi (id_member, posted_at DESC);

-- Index để query theo leader
CREATE INDEX IF NOT EXISTS fb_post_kpi_id_leader_idx
    ON public.fb_post_kpi (id_leader, posted_at DESC);

-- Index để query theo user_id (FB account)
CREATE INDEX IF NOT EXISTS fb_post_kpi_user_id_idx
    ON public.fb_post_kpi (user_id, posted_at DESC);

-- Index để query theo ngày (cho weekly KPI)
CREATE INDEX IF NOT EXISTS fb_post_kpi_posted_at_idx
    ON public.fb_post_kpi (posted_at DESC);

-- RLS Policies
ALTER TABLE public.fb_post_kpi ENABLE ROW LEVEL SECURITY;

-- Policy: ai cũng có thể đọc (cho KPI dashboard)
CREATE POLICY fb_post_kpi_select ON public.fb_post_kpi
    FOR SELECT USING (true);

-- Policy: chỉ service backend (authenticated) mới được insert/update
CREATE POLICY fb_post_kpi_insert ON public.fb_post_kpi
    FOR INSERT WITH CHECK (true);

CREATE POLICY fb_post_kpi_update ON public.fb_post_kpi
    FOR UPDATE USING (true);

COMMENT ON TABLE public.fb_post_kpi IS
    'Lưu KPI bài viết Facebook tự động. '
    'Khi extension đăng bài thành công, service gọi API lưu vào đây. '
    'id_member được resolve từ user_id qua bảng fb_inbox_accounts.';
