-- Hạ tầng cho 2 tính năng mới trên zalo-account-module ("Quản lý Zalo tập
-- trung"): (1) thao tác hàng loạt theo danh sách SỐ ĐIỆN THOẠI (nhắn tin/kết
-- bạn/mời vào nhóm) — chạy 1 lần, có tiến độ; (2) chiến dịch nhắn tin tự động
-- LẶP LỊCH hàng ngày (giờ gửi, tần suất, giãn cách, giới hạn/ngày, xoay vòng
-- nội dung + chèn tên khách, đính kèm ảnh).
--
-- Convention giống các migration Zalo trước (2026-07-09 zalo_forward_rules):
--   - account_id TEXT REFERENCES zalo_accounts(account_id)
--   - RLS bật nhưng permissive ("anon_all_*") — auth thật nằm ở Next.js API
--   - set_updated_at() trigger tái sử dụng từ migration 2026-07-06
--
-- KHÔNG tự apply — chạy tay (psql $SELFHOST_DATABASE_URL -f ...) trước khi
-- deploy code dùng các bảng này, giống mọi migration Zalo khác. Áp cho DB
-- SELF-HOST (chat-module-zalo.db.markeeai.com), không phải DB app chính.

-- ═══════════════════════════════════════════════════════════════════════
-- 1) THAO TÁC HÀNG LOẠT THEO SỐ ĐIỆN THOẠI (chạy 1 lần, không lặp lịch)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.zalo_bulk_jobs (
  id BIGSERIAL PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES public.zalo_accounts(account_id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('send_message', 'add_friend', 'invite_group')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'cancelled')),
  message TEXT,
  image_urls JSONB NOT NULL DEFAULT '[]',
  target_group_id TEXT,
  target_group_name TEXT,
  delay_seconds_min INT NOT NULL DEFAULT 2,
  delay_seconds_max INT NOT NULL DEFAULT 10,
  total_count INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zalo_bulk_jobs_account ON public.zalo_bulk_jobs(account_id, created_at DESC);
-- Runner poll đúng 1 job "running" tại 1 thời điểm/account — index hỗ trợ query đó.
CREATE INDEX IF NOT EXISTS idx_zalo_bulk_jobs_running ON public.zalo_bulk_jobs(account_id) WHERE status IN ('pending', 'running');

DROP TRIGGER IF EXISTS trg_zalo_bulk_jobs_updated ON public.zalo_bulk_jobs;
CREATE TRIGGER trg_zalo_bulk_jobs_updated
  BEFORE UPDATE ON public.zalo_bulk_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.zalo_bulk_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_zalo_bulk_jobs" ON public.zalo_bulk_jobs;
CREATE POLICY "anon_all_zalo_bulk_jobs" ON public.zalo_bulk_jobs FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.zalo_bulk_job_items (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES public.zalo_bulk_jobs(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  uid TEXT,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'not_found', 'skipped')),
  error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zalo_bulk_job_items_job ON public.zalo_bulk_job_items(job_id, id);
-- Runner poll "item tiếp theo cần xử lý" theo job — cần nhanh cho vòng lặp tick.
CREATE INDEX IF NOT EXISTS idx_zalo_bulk_job_items_pending ON public.zalo_bulk_job_items(job_id) WHERE status = 'pending';

ALTER TABLE public.zalo_bulk_job_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_zalo_bulk_job_items" ON public.zalo_bulk_job_items;
CREATE POLICY "anon_all_zalo_bulk_job_items" ON public.zalo_bulk_job_items FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════
-- 2) CHIẾN DỊCH NHẮN TIN TỰ ĐỘNG — lặp lịch hàng ngày
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.zalo_campaigns (
  id BIGSERIAL PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES public.zalo_accounts(account_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- Lịch chạy: chỉ gửi trong khung [start_time, end_time) của các ngày trong
  -- days_of_week (1=Thứ 2 ... 7=Chủ nhật, ISO). Giờ theo local time của server
  -- (Asia/Ho_Chi_Minh — server production chạy múi giờ UTC, quy đổi ở tầng app).
  start_time TEXT NOT NULL DEFAULT '09:00',
  end_time TEXT NOT NULL DEFAULT '17:00',
  days_of_week INT[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}',

  -- Giãn cách + giới hạn — an toàn tài khoản Zalo cá nhân, tránh bị flag spam.
  interval_seconds_min INT NOT NULL DEFAULT 2,
  interval_seconds_max INT NOT NULL DEFAULT 10,
  daily_limit INT NOT NULL DEFAULT 50,

  -- Nội dung: mảng {text, image_urls[]} — mỗi lần gửi lấy phần tử tiếp theo
  -- (round-robin qua next_template_index), text hỗ trợ biến {{ten}} = tên
  -- Zalo của người nhận (display_name đã lưu ở zalo_campaign_recipients).
  message_templates JSONB NOT NULL DEFAULT '[]',
  next_template_index INT NOT NULL DEFAULT 0,

  -- Đếm theo ngày — reset khi sent_today_date khác ngày hiện tại (xử lý ở app,
  -- không dùng cron Postgres để tránh phụ thuộc thêm timezone DB).
  sent_today INT NOT NULL DEFAULT 0,
  sent_today_date DATE,
  last_sent_at TIMESTAMPTZ,

  created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zalo_campaigns_account ON public.zalo_campaigns(account_id);
CREATE INDEX IF NOT EXISTS idx_zalo_campaigns_enabled ON public.zalo_campaigns(account_id) WHERE is_enabled;

DROP TRIGGER IF EXISTS trg_zalo_campaigns_updated ON public.zalo_campaigns;
CREATE TRIGGER trg_zalo_campaigns_updated
  BEFORE UPDATE ON public.zalo_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.zalo_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_zalo_campaigns" ON public.zalo_campaigns;
CREATE POLICY "anon_all_zalo_campaigns" ON public.zalo_campaigns FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.zalo_campaign_recipients (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES public.zalo_campaigns(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  uid TEXT,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'not_found', 'skipped')),
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_zalo_campaign_recipients_campaign ON public.zalo_campaign_recipients(campaign_id);
-- Scheduler poll "người nhận PENDING tiếp theo" theo campaign mỗi tick.
CREATE INDEX IF NOT EXISTS idx_zalo_campaign_recipients_pending ON public.zalo_campaign_recipients(campaign_id, id) WHERE status = 'pending';

ALTER TABLE public.zalo_campaign_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_zalo_campaign_recipients" ON public.zalo_campaign_recipients;
CREATE POLICY "anon_all_zalo_campaign_recipients" ON public.zalo_campaign_recipients FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.zalo_campaign_logs (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT REFERENCES public.zalo_campaigns(id) ON DELETE CASCADE,
  recipient_id BIGINT REFERENCES public.zalo_campaign_recipients(id) ON DELETE SET NULL,
  phone TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  error TEXT,
  message_sent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zalo_campaign_logs_campaign ON public.zalo_campaign_logs(campaign_id, created_at DESC);

ALTER TABLE public.zalo_campaign_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_zalo_campaign_logs" ON public.zalo_campaign_logs;
CREATE POLICY "anon_all_zalo_campaign_logs" ON public.zalo_campaign_logs FOR ALL USING (true) WITH CHECK (true);
