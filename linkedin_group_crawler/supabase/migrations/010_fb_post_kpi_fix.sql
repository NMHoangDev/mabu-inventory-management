-- ============================================================
-- FIX: Sửa lỗi syntax trong migration 009_fb_post_kpi.sql
-- Chạy file này sau khi chạy 009_fb_post_kpi.sql
-- ============================================================

-- Kiểm tra xem bảng đã tồn tại chưa
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'fb_post_kpi') THEN
        RAISE NOTICE 'Bảng fb_post_kpi chưa tồn tại. Chạy 009_fb_post_kpi.sql trước!';
    END IF;
END $$;

-- Thêm index nếu chưa có
CREATE INDEX IF NOT EXISTS fb_post_kpi_id_member_idx
    ON public.fb_post_kpi (id_member, posted_at DESC);

CREATE INDEX IF NOT EXISTS fb_post_kpi_id_leader_idx
    ON public.fb_post_kpi (id_leader, posted_at DESC);

CREATE INDEX IF NOT EXISTS fb_post_kpi_user_id_idx
    ON public.fb_post_kpi (user_id, posted_at DESC);

CREATE INDEX IF NOT EXISTS fb_post_kpi_posted_at_idx
    ON public.fb_post_kpi (posted_at DESC);

-- Enable RLS nếu chưa có
ALTER TABLE public.fb_post_kpi ENABLE ROW LEVEL SECURITY;

-- Tạo policies nếu chưa có
DO $$
BEGIN
    CREATE POLICY fb_post_kpi_select ON public.fb_post_kpi
        FOR SELECT USING (true);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY fb_post_kpi_insert ON public.fb_post_kpi
        FOR INSERT WITH CHECK (true);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY fb_post_kpi_update ON public.fb_post_kpi
        FOR UPDATE USING (true);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Verify: đếm số dòng trong bảng
SELECT 'fb_post_kpi rows: ' || COUNT(*) FROM public.fb_post_kpi;
