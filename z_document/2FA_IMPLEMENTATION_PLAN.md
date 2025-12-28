# 2FA実装計画書

**作成日**: 2025-12-21  
**対象**: server.jsへの2FA機能統合  
**前提**: データベースマイグレーションは実施済み

---

## 📋 実装概要

レビュー結果に基づき、以下の作業を実施します：

1. **server.jsへの2FA機能統合**（最優先）
2. **環境変数の確認・設定**
3. **Rate Limitingの実装確認**
4. **動作確認**

---

## 🔧 実装手順

### Phase 1: 必要なモジュールのrequire追加

**場所**: `server.js`の冒頭（既存のrequire文の後）

**追加内容**:
```javascript
// 2FA関連ユーティリティ
const twoFA = require('./utils/2fa');
const loginSecurity = require('./utils/login-security');
```

**確認ポイント**:
- [ ] `utils/2fa.js`が存在する
- [ ] `utils/login-security.js`が存在する
- [ ] require文が正しく追加された

---

### Phase 2: ログイン履歴記録関数の追加

**場所**: `server.js`内、ログイン処理の前（約995行目前後）

**追加内容**:
`routes-2fa-login-enhancement.js`の17-46行目の関数を追加

```javascript
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

**確認ポイント**:
- [ ] 関数が正しく追加された
- [ ] `dbQuery`が利用可能なスコープに配置された

---

### Phase 3: 既存のPOST /loginルートの置き換え

**場所**: `server.js`の約995行目付近（既存の`POST /login`ルート）

**作業内容**:
1. 既存の`POST /login`ルートを特定
2. `routes-2fa-login-enhancement.js`の52-285行目のコードで置き換え

**重要な変更点**:
- ユーザー情報取得時に2FA関連カラムを追加
- ログイン履歴の記録
- アカウントロックチェック
- 失敗回数のカウントとロック処理
- 2FA有効時の処理（信頼済みデバイスチェック、2FA検証画面へのリダイレクト）

**確認ポイント**:
- [ ] 既存の`POST /login`ルートが正しく置き換えられた
- [ ] バリデーション（express-validator）が維持されている
- [ ] CSRF保護が維持されている
- [ ] Rate Limiting（loginLimiter）が維持されている
- [ ] 既存の機能（カート統合、最近閲覧商品統合等）が維持されている

**注意事項**:
- `routes-2fa-login-enhancement.js`のコードでは`loginLimiter`を使用しているが、既存のコードで`loginLimiter`が定義されている（約963行目）
- 既存の`loginLimiter`をそのまま使用可能

---

### Phase 4: 2FAログイン検証ルートの追加

**場所**: `server.js`内、`POST /login`ルートの直後

**追加内容**:
`routes-2fa-login-enhancement.js`の287-500行目のルートを追加

1. **GET /login/2fa** - 2FA検証画面表示
2. **POST /login/2fa/verify** - 2FAトークン検証
3. **POST /login/2fa/backup** - バックアップコード検証

**Rate Limiting設定**:
```javascript
// 2FA検証用のRate Limiter
const twoFALimiter = rateLimit({
  windowMs: 60 * 1000,  // 1分
  max: 5,                // 最大5回
  message: '試行回数が上限に達しました。1分後に再試行してください。',
  standardHeaders: true,
  legacyHeaders: false,
});

const backupCodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: '試行回数が上限に達しました。1分後に再試行してください。',
  standardHeaders: true,
  legacyHeaders: false,
});
```

**確認ポイント**:
- [ ] 3つのルートが正しく追加された
- [ ] Rate Limitingが設定されている
- [ ] CSRF保護が設定されている
- [ ] エラーハンドリングが適切

---

### Phase 5: 2FA設定ルートの追加

**場所**: `server.js`内、アカウント関連ルートのセクション（適切な場所）

**追加内容**:
`routes-2fa-setup.js`の全ルートを追加

1. **GET /account/2fa/setup** - 2FA設定画面
2. **POST /account/2fa/enable** - 2FA有効化
3. **POST /account/2fa/disable** - 2FA無効化
4. **POST /account/2fa/regenerate** - バックアップコード再生成
5. **GET /account/trusted-devices** - 信頼済みデバイス一覧（API）
6. **DELETE /account/trusted-devices/:deviceId** - 信頼済みデバイス削除
7. **GET /account/login-history** - ログイン履歴（API）

**確認ポイント**:
- [ ] すべてのルートが正しく追加された
- [ ] `requireAuth`ミドルウェアが設定されている
- [ ] CSRF保護が設定されている（POST/DELETE）
- [ ] エラーハンドリングが適切

---

### Phase 6: 管理者用アカウントロック解除ルートの追加

**場所**: `server.js`内、管理者関連ルートのセクション

**追加内容**:
`routes-2fa-setup.js`の268-313行目のルートを追加

**POST /admin/users/:id/unlock** - アカウントロック解除（管理者のみ）

**確認ポイント**:
- [ ] ルートが正しく追加された
- [ ] `requireAuth`と`requireRole(['admin'])`が設定されている
- [ ] CSRF保護が設定されている
- [ ] メール通知が送信される

---

### Phase 7: 環境変数の確認

**確認項目**:
- [ ] `.env`ファイルに`TWO_FACTOR_ENCRYPTION_KEY`が設定されている
- [ ] 値が32文字以上である
- [ ] 本番環境ではデフォルト値ではない

**設定方法**:
```bash
# .env に追加
TWO_FACTOR_ENCRYPTION_KEY=your-random-32-chars-minimum-key-change-me-in-production
```

**生成方法**:
```bash
# Node.jsで生成
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**確認ポイント**:
- [ ] 環境変数が設定されている
- [ ] サーバー起動時にエラーが出ない

---

### Phase 8: Rate Limitingの確認

**確認項目**:
- [ ] `express-rate-limit`がインストールされている（既存）
- [ ] 2FA検証エンドポイントにRate Limitingが設定されている
- [ ] 既存の`loginLimiter`が定義されているか確認

**既存のRate Limiting設定を確認**:
```javascript
// server.js内で検索
grep -n "loginLimiter\|rateLimit" server.js
```

**確認ポイント**:
- [ ] 必要なRate Limiterが定義されている
- [ ] 2FA検証エンドポイントに適用されている

---

## 📝 実装チェックリスト

### 準備
- [x] データベースマイグレーション実施済み（ユーザー実施）
- [ ] `utils/2fa.js`の存在確認
- [ ] `utils/login-security.js`の存在確認
- [ ] `views/account/2fa-setup.ejs`の存在確認
- [ ] `views/auth/login-2fa.ejs`の存在確認

### 実装
- [ ] Phase 1: require文の追加
- [ ] Phase 2: ログイン履歴記録関数の追加
- [ ] Phase 3: POST /loginルートの置き換え
- [ ] Phase 4: 2FAログイン検証ルートの追加
- [ ] Phase 5: 2FA設定ルートの追加
- [ ] Phase 6: 管理者用アカウントロック解除ルートの追加
- [ ] Phase 7: 環境変数の確認
- [ ] Phase 8: Rate Limitingの確認

### 動作確認
- [ ] サーバーが正常に起動する
- [ ] `/account/2fa/setup`にアクセスできる
- [ ] QRコードが表示される
- [ ] 2FA有効化が動作する
- [ ] 2FAログインが動作する
- [ ] バックアップコードが動作する
- [ ] ログイン履歴が記録される
- [ ] アカウントロックが動作する

---

## 🔍 実装時の注意事項

### 1. 既存コードとの統合

- **カート統合**: `mergeSessionCartToDb(req, user.id)`が維持されているか確認
- **最近閲覧商品統合**: `mergeSessionRecentToDb(req)`が維持されているか確認
- **連絡先統合**: `attachContactsToUserAfterLogin(user)`が維持されているか確認

### 2. エラーハンドリング

- すべてのルートで`try-catch`と`next(err)`が適切に設定されているか確認
- エラーメッセージが適切に表示されるか確認

### 3. セッション管理

- `req.session.pending2FA`の使用箇所を確認
- セッションの有効期限を確認

### 4. セキュリティ

- CSRF保護がすべてのPOST/DELETEルートに設定されているか確認
- Rate Limitingが適切に設定されているか確認
- 秘密鍵の暗号化が正しく動作しているか確認

---

## 🐛 トラブルシューティング

### 問題1: `twoFA is not defined`
- **原因**: require文が追加されていない
- **対処**: Phase 1を確認

### 問題2: `dbQuery is not defined`
- **原因**: `dbQuery`のスコープ外で使用している
- **対処**: `dbQuery`が利用可能な場所にコードを配置

### 問題3: `loginLimiter is not defined`
- **原因**: 既存のRate Limiterが定義されていない
- **対処**: 既存のRate Limiting設定を確認し、必要に応じて定義

### 問題4: 2FAコードが常に無効
- **原因**: 時刻のずれ、または`window`パラメータが小さい
- **対処**: サーバーの時刻を確認、`window`パラメータを調整

### 問題5: データベースエラー
- **原因**: テーブル・カラムが存在しない
- **対処**: データベースマイグレーションを確認（ユーザー実施済みのため、テーブル名・カラム名の確認）

---

## 📊 実装順序の推奨

1. **Phase 1-2**: 準備（require文、関数追加）
2. **Phase 7**: 環境変数確認（早めに確認）
3. **Phase 3**: ログインルート置き換え（最重要）
4. **Phase 4**: 2FAログイン検証ルート追加
5. **Phase 5**: 2FA設定ルート追加
6. **Phase 6**: 管理者用ルート追加
7. **Phase 8**: Rate Limiting確認
8. **動作確認**: 各機能の動作確認

---

## ✅ 完了基準

以下の条件をすべて満たした場合、実装完了とします：

1. サーバーが正常に起動する
2. 2FA設定画面にアクセスできる
3. 2FA有効化が動作する
4. 2FAログインが動作する
5. バックアップコードが動作する
6. ログイン履歴が記録される
7. アカウントロックが動作する
8. エラーが発生しない

---

## 📚 参考資料

- `routes-2fa-setup.js` - 2FA設定ルートのソースコード
- `routes-2fa-login-enhancement.js` - 2FAログイン強化ルートのソースコード
- `utils/2fa.js` - 2FAユーティリティ関数
- `utils/login-security.js` - ログインセキュリティ関数
- `2FA_IMPLEMENTATION_REVIEW.md` - レビュー結果と動作確認手順

---

**実装完了後は、`2FA_IMPLEMENTATION_REVIEW.md`の「動作確認手順」に従って動作確認を実施してください。**

