# セキュリティ強化機能 実装手順書

**作成日**: 2025-12-21
**対象**: 二要素認証（2FA）＋ログイン試行回数制限の強化

---

## 📋 実装済みファイル一覧

### ✅ 作成済みファイル

1. **ユーティリティ関数**
   - `utils/2fa.js` - 2FA関連のヘルパー関数
   - `utils/login-security.js` - ログインセキュリティ関数（※server.jsに直接統合する形式に変更）

2. **ルートコードスニペット**
   - `routes-2fa-login-enhancement.js` - ログイン強化＋2FAログインフロー
   - `routes-2fa-setup.js` - 2FA設定関連ルート

3. **ビューファイル**
   - `views/auth/login-2fa.ejs` - 2FAログイン画面
   - `views/account/2fa-setup.ejs` - 2FA設定画面

4. **パッケージ**
   - speakeasy, qrcode, base32-encode, base32-decode（インストール済み）

---

## 🔧 server.jsへの統合手順

### Step 1: 環境変数の追加

`.env.example` と `.env` に以下を追加：

```bash
# 二要素認証の暗号化キー（32文字以上のランダム文字列）
TWO_FACTOR_ENCRYPTION_KEY=your-random-encryption-key-change-me-32chars-minimum
```

### Step 2: server.jsの冒頭にrequire文を追加

`server.js` のrequire文セクション（約62-80行目あたり）に以下を追加：

```javascript
const twoFA = require('./utils/2fa');
```

### Step 3: ヘルパー関数をserver.jsに追加

`server.js` の適当な場所（例：ログイン処理の直前、960行目あたり）に以下のヘルパー関数を追加：

```javascript
// ============================================================
// ログインセキュリティ: ヘルパー関数
// ============================================================

/**
 * ログイン履歴を記録
 */
async function recordLoginAttempt({
  userId = null,
  email,
  success,
  ipAddress,
  userAgent,
  failureReason = null,
  twoFactorUsed = false
}) {
  try {
    await dbQuery(
      `INSERT INTO login_history
       (user_id, email, success, ip_address, user_agent, failure_reason, two_factor_used)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, email, success, ipAddress, userAgent, failureReason, twoFactorUsed]
    );
  } catch (err) {
    console.error('Failed to record login attempt:', err);
  }
}

/**
 * アカウントがロックされているかチェック
 */
function isAccountLocked(user) {
  return user.account_locked_at !== null && user.account_locked_at !== undefined;
}
```

### Step 4: POST /loginルートを置き換え

`server.js` の既存の `POST /login` ルート（約995-1065行目）を、`routes-2fa-login-enhancement.js` のコードで置き換えます。

**重要な変更点：**
- ユーザー情報取得時に2FA関連カラムを追加
- パスワード検証失敗時にログイン履歴を記録
- 失敗回数のカウントとアカウントロック処理を追加
- アカウントロックチェックを追加
- 2FA有効時は `/login/2fa` にリダイレクト
- 信頼済みデバイスのチェック

### Step 5: 2FAログインルートを追加

`POST /login` の直後に、`routes-2fa-login-enhancement.js` から以下のルートを追加：

```javascript
// GET /login/2fa
// POST /login/2fa/verify
// POST /login/2fa/backup
```

### Step 6: 2FA設定ルートを追加

適当な場所（例：アカウント関連ルートのセクション）に、`routes-2fa-setup.js` のルートを追加：

```javascript
// GET  /account/2fa/setup
// POST /account/2fa/enable
// POST /account/2fa/disable
// POST /account/2fa/regenerate
// GET  /account/trusted-devices
// DELETE /account/trusted-devices/:deviceId
// GET  /account/login-history
```

### Step 7: 管理者用ルートを追加

管理者関連ルートのセクション（`/admin/users` 周辺）に、アカウントロック解除ルートを追加：

```javascript
// POST /admin/users/:id/unlock
```

詳細は `routes-2fa-setup.js` の最後のセクションを参照。

### Step 8: ログイン画面にチェックボックスを追加（オプション）

`views/auth/login.ejs` のパスワード入力欄の下に、以下を追加：

```html
<div style="margin-bottom:16px;">
  <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
    <input type="checkbox" name="trustDevice" value="on">
    <span style="font-size:0.9rem;">このデバイスを信頼する（30日間）</span>
  </label>
  <p style="font-size:0.75rem; color:#666; margin:4px 0 0 26px;">
    信頼済みデバイスでは、次回から二要素認証をスキップします
  </p>
</div>
```

---

## 🗄️ データベースマイグレーション

以下のマイグレーションSQLを実行してください（既にご自身で実施予定とのことですが、念のため記載）：

### 1. usersテーブルの拡張

```sql
-- 2FA関連カラム
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_backup_codes TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled_at TIMESTAMP;

-- アカウントロック関連
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_locked_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_locked_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMP;

-- インデックス
CREATE INDEX IF NOT EXISTS idx_users_two_factor_enabled ON users(two_factor_enabled);
CREATE INDEX IF NOT EXISTS idx_users_account_locked ON users(account_locked_at) WHERE account_locked_at IS NOT NULL;
```

### 2. login_historyテーブルの作成

```sql
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

### 3. trusted_devicesテーブルの作成

```sql
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

---

## ✅ 動作確認チェックリスト

### ログイン試行制限

- [ ] 5回パスワードを間違えると、15分間ロックされる（IPベース）
- [ ] 10回パスワードを間違えると、アカウントがロックされる
- [ ] アカウントロック時にメール通知が届く
- [ ] ログイン成功時に失敗回数がリセットされる

### 二要素認証

- [ ] `/account/2fa/setup` で2FA設定画面が表示される
- [ ] QRコードをGoogle Authenticatorでスキャンできる
- [ ] 正しいトークンで2FAが有効化される
- [ ] バックアップコードが10個生成される
- [ ] 2FA有効化後、ログイン時に2FA検証画面が表示される
- [ ] 正しいトークンでログインできる
- [ ] バックアップコードでログインできる
- [ ] バックアップコード使用後、そのコードが無効化される
- [ ] 「このデバイスを信頼する」をチェックすると、30日間2FAをスキップできる
- [ ] 2FAを無効化できる

### 管理機能

- [ ] 管理者がアカウントロックを解除できる
- [ ] ログイン履歴が記録・閲覧できる
- [ ] 信頼済みデバイス一覧が閲覧できる
- [ ] 信頼済みデバイスを削除できる

---

## 🎨 プロフィール画面への2FA設定ボタン追加（オプション）

`views/account/profile.ejs` に2FA設定セクションを追加する例：

```html
<section id="security" style="margin-top:32px;">
  <h2>セキュリティ設定</h2>

  <div class="setting-item">
    <div>
      <h3>二要素認証</h3>
      <p>ログイン時に認証アプリで生成されたコードの入力を必須にします</p>
    </div>

    <% if (user.two_factor_enabled) { %>
      <div>
        <span class="badge badge-success">✓ 有効</span>
        <button type="button" onclick="disable2FA()" class="btn btn-secondary">
          無効化
        </button>
        <button type="button" onclick="regenerateBackupCodes()" class="btn btn-secondary">
          バックアップコード再生成
        </button>
      </div>
    <% } else { %>
      <a href="/account/2fa/setup" class="btn btn-primary">設定する</a>
    <% } %>
  </div>

  <div class="setting-item">
    <div>
      <h3>ログイン履歴</h3>
      <p>最近のログイン履歴を確認できます</p>
    </div>
    <button type="button" onclick="showLoginHistory()" class="btn btn-secondary">
      履歴を見る
    </button>
  </div>

  <div class="setting-item">
    <div>
      <h3>信頼済みデバイス</h3>
      <p>二要素認証をスキップするデバイスを管理します</p>
    </div>
    <button type="button" onclick="showTrustedDevices()" class="btn btn-secondary">
      管理する
    </button>
  </div>
</section>
```

対応するJavaScriptも追加してください。

---

## 🔒 セキュリティ注意事項

### 暗号化キーの管理

1. `.env` の `TWO_FACTOR_ENCRYPTION_KEY` は必ず変更してください
2. 本番環境では環境変数で管理し、ソースコードにコミットしないでください
3. キーは32文字以上のランダムな文字列を使用してください

生成例（Node.jsで実行）：
```javascript
require('crypto').randomBytes(32).toString('hex')
```

### レート制限

以下のエンドポイントにはrate limitingが適用されています：
- `/login/2fa/verify`: 5回/分
- `/login/2fa/backup`: 3回/分

### HTTPS必須

本番環境では必ずHTTPSを使用してください。信頼済みデバイスのCookieは `secure: true` で設定されます。

---

## 📊 定期メンテナンス

以下のクリーンアップ処理を定期的に実行することを推奨します：

### 1. 古いログイン履歴の削除（90日以上）

```javascript
// 例：毎日午前2時に実行（node-cronなどを使用）
const cron = require('node-cron');

cron.schedule('0 2 * * *', async () => {
  try {
    const result = await dbQuery(
      `DELETE FROM login_history
       WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
       RETURNING id`
    );
    console.log(`Deleted ${result.length} old login history records`);
  } catch (err) {
    console.error('Failed to cleanup login history:', err);
  }
});
```

### 2. 期限切れの信頼済みデバイスの削除

```javascript
cron.schedule('0 3 * * *', async () => {
  try {
    const result = await dbQuery(
      `DELETE FROM trusted_devices
       WHERE expires_at < CURRENT_TIMESTAMP
       RETURNING id`
    );
    console.log(`Deleted ${result.length} expired trusted devices`);
  } catch (err) {
    console.error('Failed to cleanup trusted devices:', err);
  }
});
```

---

## 🐛 トラブルシューティング

### QRコードが生成されない

- `qrcode` パッケージが正しくインストールされているか確認
- `utils/2fa.js` のパスが正しいか確認

### 2FAトークンが常に無効になる

- サーバーとクライアントの時刻が同期しているか確認
- TOTPのwindowパラメータを増やす（デフォルト1 → 2に変更）

### アカウントロックメールが送信されない

- `gmailSend` 関数が正しく設定されているか確認
- Gmail APIの認証情報が有効か確認

### 暗号化エラーが発生する

- `TWO_FACTOR_ENCRYPTION_KEY` が正しく設定されているか確認
- キーが32文字以上あるか確認

---

## 📝 コードスニペットファイルの使用方法

以下のファイルには、server.jsに統合するためのコードが含まれています：

1. **routes-2fa-login-enhancement.js**
   - ファイルを開いてコメントに従ってコピー＆ペースト
   - 既存の `POST /login` を置き換え
   - 2FAログインフローのルートを追加

2. **routes-2fa-setup.js**
   - 2FA設定関連のルートをコピー＆ペースト
   - 管理者用ルートも含まれています

これらのファイルは統合後、削除しても構いません。

---

## ✨ 完了後の確認

すべての実装が完了したら、以下を確認してください：

1. ✅ サーバーが正常に起動する
2. ✅ ログイン画面が表示される
3. ✅ 2FA設定画面にアクセスできる
4. ✅ Google Authenticatorで2FAを設定できる
5. ✅ 2FAログインが動作する
6. ✅ バックアップコードでログインできる
7. ✅ アカウントロック機能が動作する

---

## 📚 参考資料

- [Speakeasy Documentation](https://github.com/speakeasyjs/speakeasy)
- [RFC 6238: TOTP](https://tools.ietf.org/html/rfc6238)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

---

**更新履歴**
- 2025-12-21: 初版作成

**質問・サポート**
実装中に問題が発生した場合は、お気軽にお問い合わせください。
