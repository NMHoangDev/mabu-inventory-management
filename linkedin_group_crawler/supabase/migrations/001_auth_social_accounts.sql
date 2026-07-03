-- ============================================================
-- MIGRATION SCRIPT: Auth + Social Accounts + Sessions
-- Chạy trong Supabase Dashboard > SQL Editor
-- ============================================================
-- Sau khi chạy xong, bỏ comment dòng cuối để xem tất cả bảng
-- ============================================================

-- ── 1. APP_USERS ─────────────────────────────────────────────
-- Tài khoản đăng nhập ứng dụng (tách biệt tài khoản social crawl)
CREATE TABLE IF NOT EXISTS app_users (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    email       TEXT        NOT NULL UNIQUE,
    password    TEXT        NOT NULL,                       -- hashed bcrypt
    name        TEXT,
    role        TEXT        NOT NULL DEFAULT 'member',       -- 'admin' | 'leader' | 'member'
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for login lookup
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);

-- ── 2. SOCIAL_ACCOUNTS ───────────────────────────────────────
-- Tài khoản social dùng để crawl (Facebook, LinkedIn, ...)
-- Một app_user có thể có NHIỀU tài khoản social
CREATE TABLE IF NOT EXISTS social_accounts (
    id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    app_user_id       UUID        NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    platform          TEXT        NOT NULL,                   -- 'facebook' | 'linkedin'
    account_name      TEXT        NOT NULL,                   -- Tên hiển thị: "FB Thanh Dat", "LI Công ty A"
    account_email     TEXT,                                   -- Email đăng nhập social (null nếu dùng cookie)
    account_password  TEXT,                                   -- Mật khẩu social (encrypted nếu cần)
    two_fa_secret     TEXT,                                   -- Secret 2FA
    two_fa_enabled    BOOLEAN     NOT NULL DEFAULT false,
    session_cookie    TEXT,                                   -- Cookie đăng nhập (JSON string / base64)
    is_active         BOOLEAN     NOT NULL DEFAULT true,
    is_primary        BOOLEAN     NOT NULL DEFAULT false,      -- Tài khoản social mặc định để crawl
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_accounts_app_user_id ON social_accounts(app_user_id);
CREATE INDEX IF NOT EXISTS idx_social_accounts_platform   ON social_accounts(platform);

-- Trigger: tự động set is_primary = false cho các account khác khi 1 account được set primary
CREATE OR REPLACE FUNCTION ensure_single_primary()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_primary = true THEN
        UPDATE social_accounts
        SET is_primary = false
        WHERE app_user_id = NEW.app_user_id
          AND platform    = NEW.platform
          AND id         != COALESCE(NEW.id, gen_random_uuid());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_single_primary ON social_accounts;
CREATE TRIGGER trg_ensure_single_primary
    BEFORE INSERT OR UPDATE ON social_accounts
    FOR EACH ROW EXECUTE FUNCTION ensure_single_primary();

-- ── 3. USER_SESSIONS ─────────────────────────────────────────
-- JWT sessions — cho phép multi-device logout
CREATE TABLE IF NOT EXISTS user_sessions (
    id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id      UUID        NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    token_hash   TEXT        NOT NULL UNIQUE,                 -- SHA-256 hash of JWT
    user_agent   TEXT,
    ip_address   TEXT,
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id     ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Trigger: cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM user_sessions WHERE expires_at < now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cleanup_expired_sessions ON user_sessions;
CREATE TRIGGER trg_cleanup_expired_sessions
    AFTER INSERT ON user_sessions
    EXECUTE FUNCTION cleanup_expired_sessions();

-- ── 4. LEADER_CODES ──────────────────────────────────────────
-- Mã xác nhận để user thường chuyển thành Leader
CREATE TABLE IF NOT EXISTS leader_codes (
    id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    code       TEXT        NOT NULL UNIQUE,
    created_by UUID        REFERENCES app_users(id),
    is_active  BOOLEAN     NOT NULL DEFAULT true,
    max_uses   INTEGER     NOT NULL DEFAULT 1,      -- Số lần có thể sử dụng (null = unlimited)
    used_count INTEGER     NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leader_codes_code ON leader_codes(code);

-- ── 5. TEAM_MEMBERS ──────────────────────────────────────────
-- Thay thế bảng teams cũ — Leader và Member đều là app_users
-- Chỉ cần leader có role='leader', member có role='member'
-- Bảng này lưu thêm metadata về team
CREATE TABLE IF NOT EXISTS team_associations (
    id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    leader_id    UUID        NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    member_id    UUID        NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active    BOOLEAN     NOT NULL DEFAULT true,
    UNIQUE(leader_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_team_associations_leader_id ON team_associations(leader_id);
CREATE INDEX IF NOT EXISTS idx_team_associations_member_id ON team_associations(member_id);

-- ── 6. SEEDING_CONTENT_KPI (thêm cột) ───────────────────────
-- Thêm cột app_user_id để link với app_users thay vì dùng email_member text
ALTER TABLE seeding_content_kpi
    ADD COLUMN IF NOT EXISTS app_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL;

-- ── 7. INSERT DEFAULT LEADER CODE ───────────────────────────
-- Mã leader mặc định (như LEADER_CODE=8888 trong .env)
INSERT INTO leader_codes (code, is_active, max_uses)
VALUES ('8888', true, NULL)
ON CONFLICT (code) DO NOTHING;

-- ── 8. ROW LEVEL SECURITY (RLS) ──────────────────────────────
-- Bật RLS cho tất cả bảng mới
ALTER TABLE app_users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_accounts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE leader_codes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_associations ENABLE ROW LEVEL SECURITY;

-- app_users policies
CREATE POLICY "Users can view own profile"
    ON app_users FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON app_users FOR UPDATE
    USING (auth.uid() = id);

-- social_accounts policies
CREATE POLICY "Users can manage own social accounts"
    ON social_accounts FOR ALL
    USING (auth.uid() = app_user_id);

-- user_sessions policies
CREATE POLICY "Users can view own sessions"
    ON user_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
    ON user_sessions FOR DELETE
    USING (auth.uid() = user_id);

-- leader_codes policies
CREATE POLICY "Anyone can verify leader code"
    ON leader_codes FOR SELECT
    USING (is_active = true);

-- team_associations policies
CREATE POLICY "Leaders can view their team"
    ON team_associations FOR SELECT
    USING (auth.uid() = leader_id OR auth.uid() = member_id);

CREATE POLICY "Leaders can manage their team"
    ON team_associations FOR ALL
    USING (auth.uid() = leader_id);

-- ── 9. VIEWS ─────────────────────────────────────────────────
-- View: thông tin user đầy đủ (flattened)
CREATE OR REPLACE VIEW v_user_full_info AS
SELECT
    u.id,
    u.email,
    u.name,
    u.role,
    u.is_active,
    u.created_at,
    u.updated_at,
    COALESCE(
        (SELECT json_agg(json_build_object(
            'id', sa.id,
            'platform', sa.platform,
            'account_name', sa.account_name,
            'is_primary', sa.is_primary,
            'is_active', sa.is_active
        ))
        FROM social_accounts sa WHERE sa.app_user_id = u.id),
        '[]'
    ) AS social_accounts,
    COALESCE(
        (SELECT json_agg(json_build_object(
            'id', ta.id,
            'leader_id', ta.leader_id,
            'leader_email', lu.email,
            'leader_name', lu.name
        ))
        FROM team_associations ta
        JOIN app_users lu ON lu.id = ta.leader_id
        WHERE ta.member_id = u.id AND ta.is_active = true),
        '[]'
    ) AS leader_info
FROM app_users u;

-- ── 10. MIGRATE EXISTING users → app_users ───────────────────
-- Chuyển dữ liệu từ bảng users cũ sang app_users
-- (chạy riêng nếu bảng users đã có dữ liệu)
-- INSERT INTO app_users (email, name, role, is_active, created_at, updated_at)
-- SELECT email, name, COALESCE(role, 'member'), true, COALESCE(created_at, now()), now()
-- FROM users
-- ON CONFLICT (email) DO NOTHING;

-- ── XEM KẾT QUẢ ──────────────────────────────────────────────
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
