# 二要素認証（2FA）実装レビュー結果

**レビュー日**: 2025-12-21  
**対象**: SECURITY_ENHANCEMENT_PLAN.mdに基づく実装

---

## ✅ 実装済み項目

### 1. ユーティリティ関数
- ✅ `utils/2fa.js` - 2FA関連のヘルパー関数が実装済み
  - TOTP秘密鍵生成
  - QRコード生成
  - トークン検証
  - バックアップコード生成・検証
  - 秘密鍵の暗号化・復号化（AES-256-GCM）
  - デバイストークン生成
  - デバイス名パース

- ✅ `utils/login-security.js` - ログインセキュリティ関連関数が実装済み
  - ログイン履歴記録
  - 失敗回数管理
  - アカウントロック・解除
  - 信頼済みデバイス管理

### 2. ビューテンプレート
- ✅ `views/account/2fa-setup.ejs` - 2FA設定画面
- ✅ `views/auth/login-2fa.ejs` - 2FAログイン画面

### 3. ルート定義ファイル
- ✅ `routes-2fa-setup.js` - 2FA設定関連ルート
- ✅ `routes-2fa-login-enhancement.js` - 2FAログイン強化ルート

### 4. 依存ライブラリ
- ✅ `package.json`に必要なライブラリがインストール済み
  - speakeasy (^2.0.0)
  - qrcode (^1.5.4)
  - base32-encode (^2.0.0)
  - base32-decode (^1.0.0)

---

## ❌ 未実装・要確認項目

### 1. データベースマイグレーション
**重要度: 🔴 高**

- ❌ `users`テーブルに2FA関連カラムが追加されていない
  - `two_factor_secret`
  - `two_factor_enabled`
  - `two_factor_backup_codes`
  - `two_factor_enabled_at`
  - `account_locked_at`
  - `account_locked_reason`
  - `failed_login_attempts`
  - `last_failed_login_at`

- ❌ `login_history`テーブルが作成されていない
- ❌ `trusted_devices`テーブルが作成されていない

**対応方法**: マイグレーションファイルを作成して実行する必要があります。

### 2. server.jsへの統合
**重要度: 🔴 高**

- ❌ `server.js`に2FA関連のルートが統合されていない
  - `/account/2fa/setup`
  - `/account/2fa/enable`
  - `/account/2fa/disable`
  - `/account/2fa/regenerate`
  - `/login/2fa`
  - `/login/2fa/verify`
  - `/login/2fa/backup`

- ❌ `server.js`の`POST /login`が2FA対応版に置き換えられていない
- ❌ `utils/2fa.js`と`utils/login-security.js`のrequireが追加されていない

**対応方法**: `routes-2fa-setup.js`と`routes-2fa-login-enhancement.js`のコードを`server.js`に統合する必要があります。

### 3. 環境変数
**重要度: 🟡 中**

- ⚠️ `TWO_FACTOR_ENCRYPTION_KEY`が設定されているか確認が必要
  - 32文字以上のランダムな文字列
  - 本番環境では必ず変更すること

### 4. Rate Limiting
**重要度: 🟡 中**

- ⚠️ 2FA検証エンドポイントのRate Limitingが実装されているか確認が必要
  - `/login/2fa/verify`: 5回/分
  - `/login/2fa/backup`: 3回/分

---

## 🔍 実装品質レビュー

### 良い点

1. **セキュリティ実装**
   - ✅ 秘密鍵の暗号化（AES-256-GCM）が実装されている
   - ✅ バックアップコードのハッシュ化（bcrypt）が実装されている
   - ✅ タイミング攻撃対策（windowパラメータ）が考慮されている

2. **コード品質**
   - ✅ エラーハンドリングが適切
   - ✅ 関数の責務が明確
   - ✅ コメントが充実

3. **ユーザー体験**
   - ✅ QRコードと手動入力の両方に対応
   - ✅ バックアップコードの表示・ダウンロード機能
   - ✅ 信頼済みデバイス機能

### 改善点

1. **エラーメッセージ**
   - ⚠️ エラーメッセージが日本語のみ（国際化対応は未実装）

2. **ログ記録**
   - ⚠️ 2FA設定・無効化時のログ記録が不足している可能性

3. **テスト**
   - ⚠️ 単体テスト・統合テストが未実装

---

## 📋 次のステップ（優先順位順）

### 1. データベースマイグレーションの作成と実行
```sql
-- migrations/add_2fa_columns.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_backup_codes TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_locked_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_locked_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_two_factor_enabled ON users(two_factor_enabled);
CREATE INDEX IF NOT EXISTS idx_users_account_locked ON users(account_locked_at) WHERE account_locked_at IS NOT NULL;
```

```sql
-- migrations/create_login_history.sql
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

CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_created_at ON login_history(created_at);
CREATE INDEX IF NOT EXISTS idx_login_history_ip ON login_history(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_history_success ON login_history(success, created_at);
```

```sql
-- migrations/create_trusted_devices.sql
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

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_id ON trusted_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_token ON trusted_devices(device_token);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_expires ON trusted_devices(expires_at);
```

### 2. server.jsへの統合

1. **ファイル冒頭にrequireを追加**
```javascript
const twoFA = require('./utils/2fa');
const loginSecurity = require('./utils/login-security');
```

2. **既存のPOST /loginを置き換え**
   - `routes-2fa-login-enhancement.js`のコードを使用

3. **2FA設定ルートを追加**
   - `routes-2fa-setup.js`のコードをコピー

4. **2FAログインルートを追加**
   - `routes-2fa-login-enhancement.js`の2FA検証ルートを追加

### 3. 環境変数の設定
```bash
# .env に追加
TWO_FACTOR_ENCRYPTION_KEY=your-random-encryption-key-change-me-32chars-minimum
```

### 4. Rate Limitingの確認
- `express-rate-limit`を使用して2FA検証エンドポイントに制限を追加

---

## 🧪 動作確認手順

### 前提条件
1. データベースマイグレーションが実行済み
2. `server.js`にルートが統合済み
3. 環境変数`TWO_FACTOR_ENCRYPTION_KEY`が設定済み
4. サーバーが起動している

---

## 📱 二要素認証の動作確認手順

### Phase 1: 2FA設定

#### 1.1 2FA設定画面へのアクセス
1. ブラウザでログイン
2. `/account/2fa/setup`にアクセス
3. **期待結果**: QRコードが表示される

#### 1.2 認証アプリでの設定
1. スマートフォンで認証アプリを開く（Google Authenticator推奨）
2. QRコードをスキャン
3. **期待結果**: アプリに6桁のコードが表示される

#### 1.3 2FA有効化
1. 認証アプリに表示されている6桁のコードを入力
2. 「2FAを有効化」ボタンをクリック
3. **期待結果**: 
   - バックアップコードが表示される
   - バックアップコードをダウンロードできる
   - 2FAが有効化される

#### 1.4 バックアップコードの保存確認
1. 表示されたバックアップコードをコピーまたはダウンロード
2. **期待結果**: 10個のバックアップコードが表示される

---

### Phase 2: 2FAログイン（通常のトークン）

#### 2.1 ログアウト
1. 現在のセッションからログアウト

#### 2.2 通常のログイン
1. メールアドレスとパスワードを入力
2. 「ログイン」ボタンをクリック
3. **期待結果**: `/login/2fa`にリダイレクトされる

#### 2.3 2FAコード入力
1. 認証アプリに表示されている6桁のコードを入力
2. 「認証する」ボタンをクリック
3. **期待結果**: 
   - ログイン成功
   - ダッシュボードにリダイレクト

#### 2.4 信頼済みデバイス機能（オプション）
1. ログアウト
2. 再度ログイン
3. 2FAコード入力画面で「このデバイスを信頼する」にチェック
4. ログイン成功
5. **期待結果**: 
   - Cookieに`trusted_device`が保存される
   - 次回ログイン時は2FAがスキップされる（30日間）

---

### Phase 3: バックアップコードでのログイン

#### 3.1 バックアップコードを使用
1. ログアウト
2. 通常のログイン（メールアドレス・パスワード）
3. 2FA画面で「バックアップコードを使用」をクリック
4. 保存しておいたバックアップコードを入力
5. **期待結果**: 
   - ログイン成功
   - 使用したバックアップコードが無効化される

---

### Phase 4: 2FA無効化

#### 4.1 2FA無効化
1. ログイン状態で`/account/2fa/setup`にアクセス（またはプロフィール画面から）
2. 「2FAを無効化」ボタンをクリック
3. パスワードを入力
4. **期待結果**: 
   - 2FAが無効化される
   - 信頼済みデバイスも削除される

---

### Phase 5: ログイン試行回数制限

#### 5.1 失敗回数のカウント
1. ログアウト
2. 間違ったパスワードで5回ログイン試行
3. **期待結果**: 
   - 各試行でエラーメッセージが表示される
   - `login_history`テーブルに失敗記録が追加される
   - `users.failed_login_attempts`がインクリメントされる

#### 5.2 アカウントロック
1. 間違ったパスワードでさらに5回ログイン試行（合計10回）
2. **期待結果**: 
   - アカウントがロックされる
   - ロック通知メールが送信される
   - ログイン画面にロックメッセージが表示される

#### 5.3 ロック解除（管理者）
1. 管理者でログイン
2. ユーザー詳細画面で「アカウントロック解除」を実行
3. **期待結果**: 
   - アカウントロックが解除される
   - ユーザーに通知メールが送信される

---

### Phase 6: ログイン履歴の確認

#### 6.1 ログイン履歴の閲覧
1. ログイン状態で`/account/login-history`にアクセス（API）
2. **期待結果**: 
   - ログイン履歴（成功/失敗）が表示される
   - IPアドレス、User-Agent、日時が記録されている
   - 2FA使用有無が記録されている

---

## 🐛 トラブルシューティング

### 問題1: QRコードが表示されない
- **原因**: `qrcode`ライブラリのエラー
- **確認**: サーバーログを確認
- **対処**: `npm install qrcode`を実行

### 問題2: 2FAコードが常に無効になる
- **原因**: サーバーとクライアントの時刻がずれている
- **確認**: サーバーの時刻を確認
- **対処**: NTPで時刻同期、または`window`パラメータを増やす

### 問題3: バックアップコードが検証できない
- **原因**: ハッシュ化の不一致
- **確認**: `utils/2fa.js`の`hashBackupCodes`と`verifyBackupCode`を確認
- **対処**: コードを再確認

### 問題4: データベースエラー
- **原因**: マイグレーション未実行
- **確認**: テーブル・カラムの存在確認
- **対処**: マイグレーションを実行

---

## ✅ チェックリスト

### 実装前
- [ ] データベースマイグレーションの作成
- [ ] マイグレーションの実行
- [ ] 環境変数の設定

### 実装後
- [ ] `server.js`へのルート統合
- [ ] 2FA設定画面の表示確認
- [ ] QRコードの生成確認
- [ ] 2FA有効化の動作確認
- [ ] 2FAログインの動作確認
- [ ] バックアップコードの動作確認
- [ ] 信頼済みデバイス機能の動作確認
- [ ] ログイン試行回数制限の動作確認
- [ ] アカウントロック機能の動作確認
- [ ] ログイン履歴の記録確認

---

## 📝 まとめ

実装ファイルは作成されていますが、以下の作業が必要です：

1. **データベースマイグレーションの作成と実行**（最優先）
2. **server.jsへのルート統合**（最優先）
3. **環境変数の設定**
4. **動作確認**

実装品質は高く、セキュリティ面でも適切な実装となっています。上記の作業を完了すれば、2FA機能が利用可能になります。

