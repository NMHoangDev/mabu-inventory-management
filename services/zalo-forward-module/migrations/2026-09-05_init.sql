-- zalo-forward-module — schema khởi tạo cho self-hosted Supabase RIÊNG của
-- module này (vd chat-module-zalo.db.markeeai.com).
--
-- PHỤ THUỘC: chạy SAU services/zalo-account-module/migrations/2026-09-05_init.sql
-- trên CÙNG DB đó (cần bảng staff + zalo_accounts đã tồn tại cho FK bên dưới).
--
-- AN TOÀN chạy nhiều lần và an toàn chạy nhầm lên DB gốc của app chính (mọi
-- CREATE/ADD COLUMN đều IF NOT EXISTS — no-op nếu đã tồn tại).
--
-- Gộp nội dung từ 2 migration gốc của app chính:
--   supabase/migrations/2026-07-09_zalo_forward_rules.sql
--   supabase/migrations/2026-09-04_zalo_forward_module.sql
-- + reconstruct tối thiểu bảng zalo_messages (bảng gốc predate cả
-- migrations/ folder của app chính — tạo tay từ trước, không có SQL nguồn).
-- Chỉ tái tạo đúng các cột mà worker/poller.js thực sự đọc + supabaseSync.js
-- (zalo-bridge) ghi — KHÔNG đầy đủ như bản gốc (thiếu vài cột UI-only như
-- zalo_conversations_ui/zalo_groups vì zalo-forward-module không đọc chúng).

-- ============================================================================
-- 0. zalo_messages (tối thiểu — chỉ đủ cột cho poller + supabaseSync ghi)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.zalo_messages (
  id BIGSERIAL PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES public.zalo_accounts(account_id) ON DELETE CASCADE,
  user_id TEXT,
  group_id TEXT,
  thread_id TEXT,
  thread_type TEXT NOT NULL DEFAULT 'user',
  source_message_id TEXT,
  sender_id TEXT,
  sender_name TEXT,
  content TEXT,
  ts BIGINT,
  timestamp TIMESTAMPTZ,
  type TEXT,
  is_sent BOOLEAN NOT NULL DEFAULT FALSE,
  image_urls JSONB,
  raw_content JSONB,
  mentions JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- raw_content/mentions cũng cần ADD COLUMN IF NOT EXISTS riêng vì trên DB gốc
-- (app chính) bảng zalo_messages ĐÃ TỒN TẠI từ trước migration này — CREATE
-- TABLE IF NOT EXISTS ở trên sẽ no-op ở đó, nên 2 cột mới phải add riêng.
ALTER TABLE public.zalo_messages ADD COLUMN IF NOT EXISTS raw_content JSONB;
ALTER TABLE public.zalo_messages ADD COLUMN IF NOT EXISTS mentions JSONB;

CREATE INDEX IF NOT EXISTS idx_zalo_messages_ts
  ON public.zalo_messages(account_id, thread_id, ts ASC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'zalo_messages_user_src_unique'
  ) THEN
    BEGIN
      ALTER TABLE public.zalo_messages
        ADD CONSTRAINT zalo_messages_user_src_unique UNIQUE (user_id, source_message_id);
    EXCEPTION WHEN duplicate_table THEN NULL;
    END;
  END IF;
END $$;

ALTER TABLE public.zalo_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_zalo_msgs" ON public.zalo_messages;
CREATE POLICY "anon_all_zalo_msgs"
  ON public.zalo_messages FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 1. zalo_forward_rules / targets / logs
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.zalo_forward_rules (
  id BIGSERIAL PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES public.zalo_accounts(account_id) ON DELETE CASCADE,
  name TEXT,
  master_thread_id TEXT NOT NULL,
  master_thread_name TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, master_thread_id)
);

CREATE INDEX IF NOT EXISTS idx_zalo_forward_rules_account
  ON public.zalo_forward_rules(account_id);
CREATE INDEX IF NOT EXISTS idx_zalo_forward_rules_master_enabled
  ON public.zalo_forward_rules(account_id, master_thread_id)
  WHERE is_enabled;

DROP TRIGGER IF EXISTS trg_zalo_forward_rules_updated ON public.zalo_forward_rules;
CREATE TRIGGER trg_zalo_forward_rules_updated
  BEFORE UPDATE ON public.zalo_forward_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.zalo_forward_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_zalo_forward_rules" ON public.zalo_forward_rules;
CREATE POLICY "anon_all_zalo_forward_rules"
  ON public.zalo_forward_rules FOR ALL
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.zalo_forward_targets (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT NOT NULL REFERENCES public.zalo_forward_rules(id) ON DELETE CASCADE,
  target_thread_id TEXT NOT NULL,
  target_thread_name TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rule_id, target_thread_id)
);

CREATE INDEX IF NOT EXISTS idx_zalo_forward_targets_rule
  ON public.zalo_forward_targets(rule_id);

ALTER TABLE public.zalo_forward_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_zalo_forward_targets" ON public.zalo_forward_targets;
CREATE POLICY "anon_all_zalo_forward_targets"
  ON public.zalo_forward_targets FOR ALL
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.zalo_forward_logs (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT REFERENCES public.zalo_forward_rules(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  source_thread_id TEXT NOT NULL,
  source_msg_id TEXT,
  target_thread_id TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text',
  status TEXT NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zalo_forward_logs_rule
  ON public.zalo_forward_logs(rule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zalo_forward_logs_account
  ON public.zalo_forward_logs(account_id, created_at DESC);

ALTER TABLE public.zalo_forward_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_zalo_forward_logs" ON public.zalo_forward_logs;
CREATE POLICY "anon_all_zalo_forward_logs"
  ON public.zalo_forward_logs FOR ALL
  USING (true) WITH CHECK (true);

CREATE OR REPLACE VIEW public.v_zalo_forward_rules_active AS
SELECT
  r.id AS rule_id,
  r.account_id,
  r.master_thread_id,
  r.master_thread_name,
  r.name,
  t.target_thread_id,
  t.target_thread_name
FROM public.zalo_forward_rules r
JOIN public.zalo_forward_targets t ON t.rule_id = r.id
WHERE r.is_enabled AND t.is_enabled;

GRANT SELECT ON public.v_zalo_forward_rules_active TO anon, authenticated;

-- ============================================================================
-- 2. zalo_forward_cursor — watermark cho poller (worker/poller.js)
-- ============================================================================
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

-- Sau khi chạy: /api/forward-rules và poller (FORWARD_DRY_RUN=true mặc định)
-- sẽ chạy được, dù zalo_messages sẽ trống cho tới khi có 1 zalo-bridge thật
-- ghi dữ liệu vào account_id tương ứng.
