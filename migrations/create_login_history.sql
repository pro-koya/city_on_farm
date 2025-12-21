-- ログイン履歴テーブルの作成
-- 実行方法: psql "$DATABASE_URL" -f migrations/create_login_history.sql

CREATE TABLE IF NOT EXISTS login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  success BOOLEAN NOT NULL,
  ip_address INET,
  user_agent TEXT,
  failure_reason TEXT,
  two_factor_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_created_at ON login_history(created_at);
CREATE INDEX IF NOT EXISTS idx_login_history_ip ON login_history(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_history_success ON login_history(success, created_at);

-- コメント追加
COMMENT ON TABLE login_history IS 'ログイン試行履歴（成功/失敗を記録）';
COMMENT ON COLUMN login_history.user_id IS 'ユーザーID（失敗時はNULLの場合あり）';
COMMENT ON COLUMN login_history.email IS 'ログイン試行時のメールアドレス';
COMMENT ON COLUMN login_history.success IS 'ログイン成功/失敗';
COMMENT ON COLUMN login_history.two_factor_used IS '2FA使用有無';


