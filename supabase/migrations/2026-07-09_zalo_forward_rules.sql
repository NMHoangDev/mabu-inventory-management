-- Zalo auto-forward: "nhóm chính" → tự động chuyển tiếp tin nhắn sang các
-- nhóm đích khác. Xem đề xuất trong hội thoại 2026-07-09.
--
-- 3 bảng:
--   zalo_forward_rules   — 1 rule = 1 nhóm chính (master_thread_id) của 1 account
--   zalo_forward_targets — danh sách nhóm đích của rule
--   zalo_forward_logs    — audit log mỗi lần forward tới 1 target (success/failed)
--
-- Convention giống các migration Zalo trước (2026-07-03 / 2026-07-06):
--   - account_id / thread_id là TEXT (map trực tiếp id của bridge/Zalo, không phải UUID)
--   - RLS bật nhưng permissive ("anon_all_*" USING true) — auth thực tế nằm ở
--     lớp Next.js API route (lib/zalo/auth.ts), không ở Postgres RLS.
--   - set_updated_at() trigger tái sử dụng từ migration 2026-07-06.

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

-- View phẳng để bridge/FE đọc 1 query: rule + targets đã enable.
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
