-- Migration: WebAuthn（生体認証・パスキー）サポート追加
-- 実行方法: psql "$DATABASE_URL" -f migrations/009_add_webauthn_support.sql

BEGIN;

-- WebAuthn認証器（デバイス）情報テーブル
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- WebAuthn固有フィールド
  credential_id TEXT UNIQUE NOT NULL,          -- Base64エンコードされた認証器ID
  public_key TEXT NOT NULL,                    -- Base64エンコードされた公開鍵
  counter BIGINT DEFAULT 0,                    -- リプレイ攻撃防止カウンター

  -- 認証器情報
  aaguid TEXT,                                 -- Authenticator Attestation GUID
  credential_type VARCHAR(50) DEFAULT 'public-key',
  transports TEXT[],                           -- ['usb', 'nfc', 'ble', 'internal']

  -- ユーザー管理用
  device_name TEXT NOT NULL,                   -- ユーザーが設定するデバイス名（例: "iPhone 14"）
  device_type VARCHAR(50),                     -- 'mobile', 'desktop', 'tablet', 'security_key'
  last_used_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_webauthn_user_id ON webauthn_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_credential_id ON webauthn_credentials(credential_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_last_used ON webauthn_credentials(last_used_at);

-- usersテーブルにWebAuthn関連カラムを追加
ALTER TABLE users ADD COLUMN IF NOT EXISTS webauthn_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS webauthn_enabled_at TIMESTAMP;

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_users_webauthn_enabled ON users(webauthn_enabled) WHERE webauthn_enabled = TRUE;

-- WebAuthnチャレンジ一時保存テーブル（セキュリティ強化）
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,                     -- Base64エンコードされたチャレンジ
  type VARCHAR(20) NOT NULL,                   -- 'registration' or 'authentication'
  used BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,               -- 有効期限（5分後）
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_user ON webauthn_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expires ON webauthn_challenges(expires_at);

-- コメント追加
COMMENT ON TABLE webauthn_credentials IS 'WebAuthn認証器（生体認証・セキュリティキー）情報';
COMMENT ON COLUMN webauthn_credentials.credential_id IS '認証器の一意識別子';
COMMENT ON COLUMN webauthn_credentials.public_key IS '認証器の公開鍵（署名検証用）';
COMMENT ON COLUMN webauthn_credentials.counter IS 'リプレイ攻撃防止用カウンター';
COMMENT ON COLUMN webauthn_credentials.device_name IS 'ユーザーが設定したデバイス名';

COMMENT ON TABLE webauthn_challenges IS 'WebAuthn認証用チャレンジ一時保存';
COMMENT ON COLUMN webauthn_challenges.challenge IS '認証時のチャレンジ（ランダム文字列）';
COMMENT ON COLUMN webauthn_challenges.type IS 'チャレンジの種類（registration/authentication）';

COMMIT;
