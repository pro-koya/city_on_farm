-- 2FA関連カラムの追加
-- 実行方法: psql "$DATABASE_URL" -f migrations/add_2fa_columns.sql

-- usersテーブルに2FA関連カラムを追加
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_backup_codes TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled_at TIMESTAMP;

-- アカウントロック関連カラムを追加
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_locked_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_locked_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMP;

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_users_two_factor_enabled ON users(two_factor_enabled);
CREATE INDEX IF NOT EXISTS idx_users_account_locked ON users(account_locked_at) WHERE account_locked_at IS NOT NULL;

-- 既存データの初期化（オプション）
UPDATE users SET 
  two_factor_enabled = FALSE,
  failed_login_attempts = 0
WHERE two_factor_enabled IS NULL OR failed_login_attempts IS NULL;


