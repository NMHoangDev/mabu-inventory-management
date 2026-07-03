-- ============================================================
-- MIGRATION 002: Update existing tables
-- Chạy trong Supabase Dashboard > SQL Editor (sau 001_auth_social_accounts.sql)
-- ============================================================

-- ── 1. Add app_user_id to existing tables ──────────────────
-- Link các bảng cũ với app_users

-- kpi_tracker: link đến app_users
ALTER TABLE kpi_tracker
    ADD COLUMN IF NOT EXISTS app_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL;

-- facebook_posts: link đến app_users (ai đã crawl)
ALTER TABLE facebook_posts
    ADD COLUMN IF NOT EXISTS app_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL;

-- linkedin_posts: link đến app_users
ALTER TABLE linkedin_posts
    ADD COLUMN IF NOT EXISTS app_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL;

-- categories: link đến app_users (ai tạo)
ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS app_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL;

-- facebook_groups: link đến app_users
ALTER TABLE facebook_groups
    ADD COLUMN IF NOT EXISTS app_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL;

-- linkedin_groups: link đến app_users
ALTER TABLE linkedin_groups
    ADD COLUMN IF NOT EXISTS app_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL;

-- ── 2. Add indexes ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kpi_tracker_app_user_id    ON kpi_tracker(app_user_id);
CREATE INDEX IF NOT EXISTS idx_facebook_posts_app_user_id ON facebook_posts(app_user_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_posts_app_user_id ON linkedin_posts(app_user_id);
CREATE INDEX IF NOT EXISTS idx_categories_app_user_id     ON categories(app_user_id);
CREATE INDEX IF NOT EXISTS idx_facebook_groups_app_user_id ON facebook_groups(app_user_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_groups_app_user_id ON linkedin_groups(app_user_id);

-- ── 3. Add updated_at trigger for all tables ───────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for tables that don't have them
DROP TRIGGER IF EXISTS trg_app_users_updated_at ON app_users;
CREATE TRIGGER trg_app_users_updated_at BEFORE UPDATE ON app_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_social_accounts_updated_at ON social_accounts;
CREATE TRIGGER trg_social_accounts_updated_at BEFORE UPDATE ON social_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_facebook_groups_updated_at ON facebook_groups;
CREATE TRIGGER trg_facebook_groups_updated_at BEFORE UPDATE ON facebook_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_linkedin_groups_updated_at ON linkedin_groups;
CREATE TRIGGER trg_linkedin_groups_updated_at BEFORE UPDATE ON linkedin_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_categories_updated_at ON categories;
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 4. Fix kpi_tracker: ensure platform column exists ────────
ALTER TABLE kpi_tracker
    ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'facebook';

-- ── 5. Fix seeding_content_kpi: ensure all required columns ──
ALTER TABLE seeding_content_kpi
    ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'facebook';

-- ── 6. Drop old teams table if exists (replace with team_associations) ──
-- Chỉ chạy dòng dưới nếu bạn muốn xóa bảng teams cũ
-- DROP TABLE IF EXISTS teams CASCADE;
