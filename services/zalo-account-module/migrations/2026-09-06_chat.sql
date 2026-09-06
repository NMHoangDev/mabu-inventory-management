-- zalo-account-module — bảng cache thread list cho tính năng nhắn tin mới
-- thêm (2026-09-06). Nguồn: supabase/migrations/2026-07-03_zalo_schema_normalize.sql
-- của app chính (phần 3 — zalo_conversations_ui), copy nguyên DDL gốc vì bảng
-- này predate migrations/ folder ở DB gốc nhưng file 2026-07-03 có ghi lại
-- đầy đủ CREATE TABLE (khác zalo_accounts/zalo_messages phải reconstruct).
--
-- AN TOÀN chạy nhiều lần (IF NOT EXISTS) và an toàn chạy nhầm lên DB gốc.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.zalo_conversations_ui (
  id BIGSERIAL PRIMARY KEY,
  account_id TEXT NOT NULL DEFAULT 'shop-owner',
  thread_id TEXT NOT NULL,
  thread_type TEXT NOT NULL DEFAULT 'user',
  conversation_id TEXT NOT NULL,
  conversation_name TEXT,
  avatar_url TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_message_ts BIGINT,
  latest_message_at TIMESTAMPTZ,
  latest_content TEXT,
  latest_sender_id TEXT,
  latest_is_self BOOLEAN NOT NULL DEFAULT FALSE,
  message_count INTEGER NOT NULL DEFAULT 0,
  has_messages BOOLEAN NOT NULL DEFAULT FALSE,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_zalo_conv_ui_account
  ON public.zalo_conversations_ui(account_id);
CREATE INDEX IF NOT EXISTS idx_zalo_conv_ui_last_ts
  ON public.zalo_conversations_ui(account_id, last_message_ts DESC NULLS LAST);

DROP TRIGGER IF EXISTS trg_zalo_conv_ui_updated ON public.zalo_conversations_ui;
CREATE TRIGGER trg_zalo_conv_ui_updated
  BEFORE UPDATE ON public.zalo_conversations_ui
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.zalo_conversations_ui ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_zalo_conv_ui" ON public.zalo_conversations_ui;
CREATE POLICY "anon_all_zalo_conv_ui"
  ON public.zalo_conversations_ui FOR ALL
  USING (true) WITH CHECK (true);
