-- ============================================================
-- Migration: Add is_confirmed field to fb_inbox_kpi
-- 
-- Flow mới:
--   1. Member bấm "Đề xuất KPI" 
--      -> Backend: Tìm member thuộc team nào -> Lấy id_leader của team đó
--      -> Insert vào fb_inbox_kpi với is_confirmed = FALSE
--   
--   2. Leader/Admin bấm "Xác nhận KPI"
--      -> Backend: Update is_confirmed = TRUE cho các row liên quan
--
--   3. Filter "Chưa tính KPI":
--      -> is_confirmed = FALSE (chưa được duyệt)
-- ============================================================

-- Thêm cột is_confirmed
ALTER TABLE public.fb_inbox_kpi 
ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

-- Index cho query filter theo trạng thái confirmed
CREATE INDEX IF NOT EXISTS fb_inbox_kpi_confirmed_idx 
ON public.fb_inbox_kpi (id_member, is_confirmed, synced_at DESC);

CREATE INDEX IF NOT EXISTS fb_inbox_kpi_leader_confirmed_idx 
ON public.fb_inbox_kpi (id_leader, is_confirmed, synced_at DESC);

-- Comment
COMMENT ON COLUMN public.fb_inbox_kpi.is_confirmed IS 
    'FALSE = member đã đề xuất nhưng leader chưa duyệt. '
    'TRUE = leader đã xác nhận KPI này.';
