-- Migration: Bổ sung schema cho Zalo UI cache + messages persistence
-- Chạy trong Supabase SQL Editor: https://biivymfjjmcvxtbtsraw.supabase.co/project/default/sql
--
-- Chiến lược: TÁI SỬ DỤNG bảng hiện có (zalo_groups + zalo_messages), CHỈ THÊM
-- cột helper. Không DROP bảng đang có data.
--
-- Sau migration:
--   1. zalo_groups: thêm cột cho UI hiển thị 1:1 conversation (user + group)
--   2. zalo_messages: thêm cột ts + thread_type + UNIQUE index để tránh duplicate
--   3. zalo_conversations_ui: cache CỦA RIÊNG UI thread list (sort, last_ts)
--   4. zalo_message_drafts: lưu nháp chưa gửi (optional)
--
-- Tất cả RLS ON + anon policy "using (true)" để frontend anon key đọc/ghi trực tiếp.

-- ============================================================================
-- 0. Helper: trigger updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. zalo_groups: Bổ sung cột cho UI 1:1 conversation (người lạ cũng hiển thị).
--    Lưu ý: bảng này hiện dùng "user_id" + "is_friend" cho user thread — đổi tên
--    nghĩa: user_id = account_id của account đang chat (shop-owner), group_id = thread id.
-- ============================================================================

-- Thêm cột account_id để chuyển từ user_id (chỉ 1 user duy nhất hiện tại) -> multi-account.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='zalo_groups' AND column_name='account_id'
  ) THEN
    ALTER TABLE public.zalo_groups
      ADD COLUMN account_id TEXT NOT NULL DEFAULT 'shop-owner';
  END IF;
END $$;

-- thread_type để biết user/group.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='zalo_groups' AND column_name='thread_type'
  ) THEN
    ALTER TABLE public.zalo_groups
      ADD COLUMN thread_type TEXT NOT NULL DEFAULT 'group';
  END IF;
END $$;

-- conversation_id format "u:<id>" | "g:<id>" — dùng UI để match.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='zalo_groups' AND column_name='conversation_id'
  ) THEN
    ALTER TABLE public.zalo_groups
      ADD COLUMN conversation_id TEXT;
  END IF;
END $$;

-- last_message_ts kiểu BIGINT (epoch ms) — sort nhanh hơn timestamp with zone.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='zalo_groups' AND column_name='last_message_ts'
  ) THEN
    ALTER TABLE public.zalo_groups
      ADD COLUMN last_message_ts BIGINT;
  END IF;
END $$;

-- latest_is_self để UI phân biệt tin nhắn mình/khác.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='zalo_groups' AND column_name='latest_is_self'
  ) THEN
    ALTER TABLE public.zalo_groups
      ADD COLUMN latest_is_self BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_zalo_groups_account
  ON public.zalo_groups(account_id);
CREATE INDEX IF NOT EXISTS idx_zalo_groups_last_ts
  ON public.zalo_groups(account_id, last_message_ts DESC NULLS LAST);

-- Trigger updated_at cho zalo_groups.
DROP TRIGGER IF EXISTS trg_zalo_groups_updated ON public.zalo_groups;
CREATE TRIGGER trg_zalo_groups_updated
  BEFORE UPDATE ON public.zalo_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 2. zalo_messages: thêm cột ts BIGINT + thread_type + thread_id cho deduplication + sort.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='zalo_messages' AND column_name='thread_id'
  ) THEN
    -- Cột alias cho group_id hiện có (giữ group_id để backward-compatible với code cũ).
    ALTER TABLE public.zalo_messages
      ADD COLUMN thread_id TEXT;
    -- Backfill: copy giá trị từ group_id sang thread_id cho row hiện có.
    UPDATE public.zalo_messages SET thread_id = group_id WHERE thread_id IS NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='zalo_messages' AND column_name='ts'
  ) THEN
    ALTER TABLE public.zalo_messages
      ADD COLUMN ts BIGINT;
    -- Backfill từ timestamp hiện có (nếu có).
    UPDATE public.zalo_messages
      SET ts = (EXTRACT(EPOCH FROM timestamp) * 1000)::BIGINT
      WHERE ts IS NULL AND timestamp IS NOT NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='zalo_messages' AND column_name='thread_type'
  ) THEN
    ALTER TABLE public.zalo_messages
      ADD COLUMN thread_type TEXT NOT NULL DEFAULT 'user';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='zalo_messages' AND column_name='account_id'
  ) THEN
    ALTER TABLE public.zalo_messages
      ADD COLUMN account_id TEXT NOT NULL DEFAULT 'shop-owner';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='zalo_messages' AND column_name='attachments'
  ) THEN
    ALTER TABLE public.zalo_messages
      ADD COLUMN attachments JSONB;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_zalo_messages_ts
  ON public.zalo_messages(account_id, thread_id, ts ASC);

-- Cho phép upsert theo (user_id, source_message_id) — tạo unique constraint nếu chưa có.
-- Thử tạo unique constraint; nếu đã tồn tại bỏ qua. Nếu có duplicate data, cần dedupe trước.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'zalo_messages_user_src_unique'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='zalo_messages' AND indexname='zalo_messages_user_src_unique'
  ) THEN
    BEGIN
      ALTER TABLE public.zalo_messages
        ADD CONSTRAINT zalo_messages_user_src_unique UNIQUE (user_id, source_message_id);
    EXCEPTION WHEN duplicate_table THEN NULL;
      -- Nếu fail vì duplicate data, tạo unique index thay thế sau khi dedupe.
    END;
  END IF;
END $$;

-- ============================================================================
-- 3. zalo_conversations_ui: Bảng cache CỦA RIÊNG UI thread list — tách khỏi
--    zalo_groups để tránh nhiễu logic broadcast. Chỉ chứa metadata UI:
--    thread_id, thread_type, name, avatar, unread, last_ts, latest preview.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.zalo_conversations_ui (
  id BIGSERIAL PRIMARY KEY,
  account_id TEXT NOT NULL DEFAULT 'shop-owner',
  thread_id TEXT NOT NULL,                    -- Zalo thread id (string)
  thread_type TEXT NOT NULL DEFAULT 'user',    -- 'user' | 'group'
  conversation_id TEXT NOT NULL,              -- 'u:<id>' | 'g:<id>' (unique với account_id)
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

-- ============================================================================
-- 4. zalo_message_drafts: Nháp tin nhắn chưa gửi (UX: giữ text khi F5 trang).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.zalo_message_drafts (
  id BIGSERIAL PRIMARY KEY,
  account_id TEXT NOT NULL DEFAULT 'shop-owner',
  thread_id TEXT NOT NULL,
  content TEXT,
  reply_to TEXT,
  attachments JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, thread_id)
);

DROP TRIGGER IF EXISTS trg_zalo_drafts_updated ON public.zalo_message_drafts;
CREATE TRIGGER trg_zalo_drafts_updated
  BEFORE UPDATE ON public.zalo_message_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 5. zalo_users: thêm updated_at trigger + index nếu thiếu.
-- ============================================================================
DROP TRIGGER IF EXISTS trg_zalo_users_updated ON public.zalo_users;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='zalo_users' AND column_name='updated_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_zalo_users_updated'
  ) THEN
    CREATE TRIGGER trg_zalo_users_updated
      BEFORE UPDATE ON public.zalo_users
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_zalo_users_id_member
  ON public.zalo_users(id_member);

-- ============================================================================
-- 6. RLS + policies: anon full access để frontend gọi trực tiếp qua REST API.
--    Service role bypass RLS.
-- ============================================================================
ALTER TABLE public.zalo_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zalo_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zalo_conversations_ui ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zalo_message_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_zalo_groups" ON public.zalo_groups;
CREATE POLICY "anon_all_zalo_groups"
  ON public.zalo_groups FOR ALL
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_zalo_msgs" ON public.zalo_messages;
CREATE POLICY "anon_all_zalo_msgs"
  ON public.zalo_messages FOR ALL
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_zalo_conv_ui" ON public.zalo_conversations_ui;
CREATE POLICY "anon_all_zalo_conv_ui"
  ON public.zalo_conversations_ui FOR ALL
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_zalo_drafts" ON public.zalo_message_drafts;
CREATE POLICY "anon_all_zalo_drafts"
  ON public.zalo_message_drafts FOR ALL
  USING (true) WITH CHECK (true);