-- Hạ tầng Supabase cho service riêng `services/zalo-forward-module` — module
-- tách hẳn phần điều phối forward (detect + match rule + rate-limit + log) ra
-- khỏi services/zalo-bridge. Bridge chỉ còn thực thi gửi (endpoint mới
-- /api/all-platform/zalo/forward/{text,media,sticker}, xem
-- services/zalo-bridge/src/routes/zalo-client.js), module mới poll bảng
-- zalo_messages thay vì nhận trực tiếp object message sống từ WS listener.
--
-- KHÔNG tự apply — chạy tay (SQL editor / psql $DATABASE_URL -f ...) trước
-- khi deploy zalo-forward-module, giống mọi migration Zalo khác trong thư mục
-- này (xem CLAUDE.md).

-- 1) zalo_messages.raw_content — cột `content` hiện tại chỉ lưu string, nên
-- payload sticker (object {id, cateId, type}) bị bỏ qua khi persist (xem
-- persistIncomingMessage() trong supabaseSync.js). Không có cột này thì
-- zalo-forward-module không tái tạo được sticker để forward khi poll từ DB.
ALTER TABLE public.zalo_messages ADD COLUMN IF NOT EXISTS raw_content JSONB;

-- 1b) zalo_messages.mentions — trước đây hoàn toàn không persist, nên tag
-- @All (sentinel uid="-1") không thể phát hiện lại được khi poll từ DB thay
-- vì đọc trực tiếp object message sống như forwardEngine.js cũ.
ALTER TABLE public.zalo_messages ADD COLUMN IF NOT EXISTS mentions JSONB;

-- 2) Watermark cho poller — module poll `zalo_messages where ts > cursor`
-- theo từng account, cần persist để restart module không xử lý trùng/sót.
CREATE TABLE IF NOT EXISTS public.zalo_forward_cursor (
  account_id TEXT PRIMARY KEY REFERENCES public.zalo_accounts(account_id) ON DELETE CASCADE,
  last_message_ts BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.zalo_forward_cursor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_zalo_forward_cursor" ON public.zalo_forward_cursor;
CREATE POLICY "anon_all_zalo_forward_cursor"
  ON public.zalo_forward_cursor FOR ALL
  USING (true) WITH CHECK (true);

-- 3) 'dry_run' là status hợp lệ mới ở zalo_forward_logs (module mới ghi log
-- dạng dry-run trước khi cutover thật — xem Rollout trong plan) — cột status
-- hiện là TEXT tự do (không có CHECK constraint), nên không cần ALTER gì
-- thêm, chỉ ghi chú lại ở đây để rõ ý nghĩa giá trị mới.
