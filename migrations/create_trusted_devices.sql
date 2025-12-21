-- 信頼済みデバイステーブルの作成
-- 実行方法: psql "$DATABASE_URL" -f migrations/create_trusted_devices.sql

CREATE TABLE IF NOT EXISTS trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_token VARCHAR(255) UNIQUE NOT NULL,
  device_name TEXT,
  ip_address INET,
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_id ON trusted_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_token ON trusted_devices(device_token);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_expires ON trusted_devices(expires_at);

-- コメント追加
COMMENT ON TABLE trusted_devices IS '信頼済みデバイス（「このデバイスを信頼する」機能用）';
COMMENT ON COLUMN trusted_devices.device_token IS 'デバイストークン（Cookieに保存）';
COMMENT ON COLUMN trusted_devices.expires_at IS '有効期限（30日）';


