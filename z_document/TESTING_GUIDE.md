# Stripe Connect 送金システム テストガイド

このガイドでは、実装したStripe Connect送金システムを画面上でテストする手順を説明します。

---

## 📋 目次

1. [前提条件の確認](#前提条件の確認)
2. [Stripe側の設定](#stripe側の設定)
3. [データベースのセットアップ](#データベースのセットアップ)
4. [環境変数の設定](#環境変数の設定)
5. [画面上でのテスト手順](#画面上でのテスト手順)
6. [トラブルシューティング](#トラブルシューティング)

---

## 前提条件の確認

### 必要なもの

- ✅ Stripeアカウント（本番環境 or テスト環境）
- ✅ 管理者権限を持つユーザーアカウント
- ✅ PostgreSQLデータベースへのアクセス
- ✅ サーバーが起動している状態

### 現在の実装状況確認

```bash
# 必要なファイルが存在するか確認
ls -la services/stripe-connect.js
ls -la services/ledger.js
ls -la services/refund.js
ls -la routes-stripe-connect.js
ls -la routes-admin-finance.js
ls -la migrations/005_stripe_connect_payout_system.sql
```

---

## Stripe側の設定

### ステップ 1: Stripe Connect を有効化

1. **Stripe Dashboard にログイン**
   - テスト環境: https://dashboard.stripe.com/test/dashboard
   - 本番環境: https://dashboard.stripe.com/dashboard

2. **Connect を有効化**
   - 左メニューから「Connect」をクリック
   - 「Get started」をクリック
   - プラットフォーム情報を入力（会社名、ウェブサイトURLなど）

3. **Connect Settings を設定**
   - 「Settings」→「Connect settings」に移動
   - **OAuth settings** セクション:
     - 「Add redirect URI」をクリック
     - リダイレクトURIを追加:
       ```
       http://localhost:3000/admin/partners/:partnerId/stripe-return
       https://yourdomain.com/admin/partners/:partnerId/stripe-return
       ```
     - ⚠️ `:partnerId` は実際のIDに置き換わるため、パターンマッチが必要
     - テスト用には `http://localhost:3000/admin/stripe-return-test` なども追加推奨

4. **Client ID を取得**
   - 同じ「Connect settings」ページの「OAuth settings」セクションに表示される
   - **Test mode client ID** をコピー（`ca_` で始まる文字列）
   - 本番環境を使う場合は **Live mode client ID** もコピー

### ステップ 2: Webhook エンドポイントを設定

1. **Webhooks ページに移動**
   - 「Developers」→「Webhooks」をクリック
   - 「Add endpoint」をクリック

2. **エンドポイントURL を入力**
   ```
   https://yourdomain.com/webhook
   ```
   - ローカルテストの場合: Stripe CLI または ngrok を使用（後述）

3. **監視するイベントを選択**
   - 以下のイベントを選択:
     - ✅ `checkout.session.completed`
     - ✅ `charge.refunded`
     - ✅ `account.updated`
     - ✅ `payout.paid` （オプション）
     - ✅ `payout.failed` （オプション）

4. **Webhook signing secret を取得**
   - エンドポイント作成後、「Signing secret」の「Reveal」をクリック
   - `whsec_` で始まる文字列をコピー

### ステップ 3: Stripe CLI でローカルテスト（オプション）

ローカル環境でWebhookをテストする場合:

```bash
# Stripe CLI のインストール（未インストールの場合）
brew install stripe/stripe-cli/stripe

# Stripe にログイン
stripe login

# Webhook をローカルにフォワード
stripe listen --forward-to localhost:3000/webhooks/stripe

# 別のターミナルでイベントをトリガー（テスト用）
stripe trigger checkout.session.completed
```

---

## データベースのセットアップ

### ステップ 1: マイグレーション実行

```bash
# PostgreSQL 接続文字列を環境変数として設定
export PGURL="postgresql://setsumarudb_user:rsw8uBWkcnoSaQMjII0238nHfCs9W48k@dpg-d4k2tea4d50c73d7htd0-a.oregon-postgres.render.com:5432/setsumarudb?sslmode=require"

# マイグレーション実行
psql "$PGURL" -v ON_ERROR_STOP=1 -f migrations/005_stripe_connect_payout_system.sql
```

### ステップ 2: マイグレーション確認

```bash
# テーブルが作成されたか確認
psql "$PGURL" -c "\dt" | grep -E "ledger|payout_runs"

# partners テーブルに新しいカラムが追加されたか確認
psql "$PGURL" -c "\d partners" | grep stripe
```

期待される出力:
```
stripe_account_id          | text
stripe_account_type        | text
stripe_charges_enabled     | boolean
stripe_payouts_enabled     | boolean
...
```

---

## 環境変数の設定

### .env ファイルに追加

```bash
# .env ファイルを編集
nano .env
```

以下を追加:

```env
# Stripe Connect Settings
STRIPE_CONNECT_CLIENT_ID=ca_XXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Webhook Secret（既存のSTRIPE_WEBHOOK_SECRETを使用、または新規追加）
STRIPE_WEBHOOK_SECRET=whsec_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# 既存の設定も確認
STRIPE_SECRET_KEY=sk_test_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### 環境変数の読み込み確認

```bash
# サーバーを再起動して環境変数を読み込む
# Ctrl+C で停止後、再起動
npm start
```

---

## 画面上でのテスト手順

### 🎯 テストシナリオ: 出品者の送金フロー全体をテスト

#### Phase 1: 出品者のStripe Connect オンボーディング

**1. 管理者としてログイン**
- ブラウザで `http://localhost:3000` にアクセス
- 管理者アカウントでログイン

**2. 出品者を選択**
- 管理画面から出品者一覧ページに移動
- テスト対象の出品者を選択

**3. Stripe Connect オンボーディングを開始**

オンボーディング開始には、以下のいずれかの方法を使用:

**方法A: API経由（Postman/curl）**

```bash
# CSRFトークンを取得（ブラウザの開発者ツールでCookieから取得）
# または、Postmanでログイン後のセッションを使用

curl -X POST http://localhost:3000/admin/partners/{partnerId}/stripe-onboarding \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \
  -d '{
    "returnUrl": "http://localhost:3000/admin/partners/{partnerId}/stripe-return",
    "refreshUrl": "http://localhost:3000/admin/partners/{partnerId}/stripe-refresh"
  }'
```

レスポンス例:
```json
{
  "success": true,
  "url": "https://connect.stripe.com/express/oauth/authorize?client_id=ca_XXX&state=...",
  "accountId": "acct_XXXXXXXXXX"
}

```

**方法B: 管理画面にボタンを追加（推奨）**

現在、UI上のボタンがない可能性があるため、以下のHTMLを出品者詳細ページに追加:

```html
<!-- 例: views/admin/partner-detail.ejs に追加 -->
<div class="stripe-connect-section">
  <h3>Stripe Connect 設定</h3>

  <% if (!partner.stripe_account_id) { %>
    <button id="stripe-onboarding-btn" class="btn btn-primary">
      Stripe アカウントに接続
    </button>
  <% } else { %>
    <div class="alert alert-success">
      ✓ Stripe アカウント接続済み: <%= partner.stripe_account_id %>
    </div>

    <% if (partner.details_submitted) { %>
      <span class="badge badge-success">本人確認完了</span>
    <% } else { %>
      <span class="badge badge-warning">本人確認未完了</span>
      <button id="stripe-continue-btn" class="btn btn-warning">
        本人確認を続ける
      </button>
    <% } %>

    <% if (partner.charges_enabled) { %>
      <span class="badge badge-success">決済可能</span>
    <% } %>

    <% if (partner.payouts_enabled) { %>
      <span class="badge badge-success">送金可能</span>
    <% } %>

    <button id="stripe-dashboard-btn" class="btn btn-secondary">
      Stripe ダッシュボードを開く
    </button>
  <% } %>
</div>

<script>
document.getElementById('stripe-onboarding-btn')?.addEventListener('click', async () => {
  try {
    const response = await fetch('/admin/partners/<%= partner.id %>/stripe-onboarding', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': '<%= csrfToken %>'
      },
      body: JSON.stringify({
        returnUrl: window.location.origin + '/admin/partners/<%= partner.id %>/stripe-return',
        refreshUrl: window.location.origin + '/admin/partners/<%= partner.id %>/stripe-refresh'
      })
    });

    const data = await response.json();

    if (data.success && data.url) {
      window.location.href = data.url;
    } else {
      alert('エラー: ' + (data.error || '不明なエラー'));
    }
  } catch (error) {
    alert('エラー: ' + error.message);
  }
});

document.getElementById('stripe-dashboard-btn')?.addEventListener('click', async () => {
  try {
    const response = await fetch('/admin/partners/<%= partner.id %>/stripe-dashboard-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': '<%= csrfToken %>'
      }
    });

    const data = await response.json();

    if (data.success && data.url) {
      window.open(data.url, '_blank');
    } else {
      alert('エラー: ' + (data.error || '不明なエラー'));
    }
  } catch (error) {
    alert('エラー: ' + error.message);
  }
});
</script>
```

**4. Stripe Connect オンボーディング画面で情報入力**

ブラウザが Stripe のオンボーディング画面にリダイレクトされます:

- **個人情報**
  - 氏名
  - 生年月日
  - 住所
  - 電話番号
  - メールアドレス

- **ビジネス情報**
  - ビジネスタイプ（個人 or 法人）
  - ビジネスの説明

- **銀行口座情報**
  - 銀行名
  - 支店名
  - 口座種別（普通 or 当座）
  - 口座番号
  - 口座名義

⚠️ **テスト環境の場合**: Stripeのテストモードでは実際の銀行口座は不要です。ダミーデータで登録可能です。

**5. オンボーディング完了**

- 情報入力完了後、`returnUrl` にリダイレクトされます
- `account.updated` Webhookが送信され、DBが自動更新されます
- 出品者詳細ページで「本人確認完了」「決済可能」「送金可能」のバッジが表示されることを確認

---

#### Phase 2: 注文の作成と決済

**1. 顧客として商品を購入**

- ログアウトして、一般ユーザーとしてログイン（またはゲスト購入）
- テスト対象の出品者の商品をカートに追加
- チェックアウトページに進む

**2. Stripe Checkout で決済**

テストカード番号を使用:
- **成功するカード**: `4242 4242 4242 4242`
- 有効期限: 未来の日付（例: 12/34）
- CVC: 任意の3桁（例: 123）
- 郵便番号: 任意（例: 123-4567）

**3. 決済成功を確認**

- 注文完了ページが表示される
- `checkout.session.completed` Webhookが処理される
- 台帳に自動的に記録される

**確認方法（データベース）**:
```sql
-- 注文が作成されたか確認
SELECT id, order_number, total, payment_status, stripe_payment_intent_id
FROM orders
WHERE seller_id = (SELECT id FROM users WHERE partner_id = 'YOUR_PARTNER_ID')
ORDER BY created_at DESC
LIMIT 5;

-- 台帳に sale と platform_fee が記録されたか確認
SELECT
  l.id,
  l.type,
  l.amount_cents,
  l.status,
  l.note,
  o.order_number
FROM ledger l
LEFT JOIN orders o ON o.id = l.order_id
WHERE l.partner_id = 'YOUR_PARTNER_ID'
ORDER BY l.created_at DESC
LIMIT 10;
```

期待される結果:
- `sale` エントリ: +注文総額（status='pending'）
- `platform_fee` エントリ: -手数料（status='pending'）

---

#### Phase 3: 配送完了と送金可能化

**1. 配送ステータスを更新**

**方法A: API経由**

```bash
curl -X POST http://localhost:3000/api/orders/{orderId}/delivery-status \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \
  -d '{"deliveryStatus": "delivered"}'
```

**方法B: 管理画面から**

- 管理画面の注文詳細ページに移動
- 「配送ステータス」を「配送完了」に変更
- 保存ボタンをクリック

**2. 台帳が available に更新されたか確認**

```sql
-- delivery_completed_at が記録されたか確認
SELECT id, order_number, delivery_status, delivery_completed_at
FROM orders
WHERE id = 'YOUR_ORDER_ID';

-- 台帳のステータスが available に変更されたか確認
SELECT
  id,
  type,
  amount_cents,
  status,
  available_at,
  note
FROM ledger
WHERE order_id = 'YOUR_ORDER_ID'
ORDER BY created_at;
```

期待される結果:
- `delivery_completed_at` が記録されている
- `status` が 'available' に変更されている
- `available_at` が delivery_completed_at + 7日 になっている

**3. テスト用に available_at を現在時刻に変更（オプション）**

実際の7日間を待たずにテストする場合:

```sql
-- available_at を現在時刻に変更
UPDATE ledger
SET available_at = now()
WHERE order_id = 'YOUR_ORDER_ID'
  AND status = 'available';
```

---

#### Phase 4: 送金バッチの実行

**1. 送金可能な出品者を確認**

```sql
-- 送金可能な出品者の一覧
SELECT
  p.id,
  p.name,
  p.stripe_account_id,
  p.payouts_enabled,
  p.debt_cents,
  COALESCE(SUM(CASE WHEN l.status = 'available' AND l.available_at <= now() THEN l.amount_cents ELSE 0 END), 0) AS available_balance
FROM partners p
LEFT JOIN ledger l ON l.partner_id = p.id
WHERE p.stripe_account_id IS NOT NULL
  AND p.payouts_enabled = true
  AND p.debt_cents <= 10000
GROUP BY p.id, p.name, p.stripe_account_id, p.payouts_enabled, p.debt_cents
HAVING COALESCE(SUM(CASE WHEN l.status = 'available' AND l.available_at <= now() THEN l.amount_cents ELSE 0 END), 0) >= 3000;
```

**2. 送金バッチスクリプトを実行**

```bash
# 本日が月曜日の偶数ISO週でない場合、スクリプトはスキップします
# テスト実行する場合は、一時的にスクリプトを修正するか、月曜日まで待ちます

node scripts/payout-batch.js
```

**テスト用に曜日チェックを無効化する場合**:

```javascript
// scripts/payout-batch.js の isValidPayoutDay 関数を一時的に修正
function isValidPayoutDay(date) {
  // テスト用: 常にtrueを返す
  return true;

  // 元のコード（本番環境に戻す際はコメント解除）
  // const dayOfWeek = date.getDay();
  // if (dayOfWeek !== 1) {
  //   logger.info('Not Monday, skipping payout', { dayOfWeek });
  //   return false;
  // }
  // const isoWeek = getISOWeekNumber(date);
  // if (isoWeek % 2 !== 0) {
  //   logger.info('ISO week is odd number, skipping payout', { isoWeek });
  //   return false;
  // }
  // return true;
}
```

**3. 実行結果を確認**

コンソール出力例:
```
=== Payout Batch Execution Started ===
Execution time: 2025-12-27T10:00:00.000Z

=== Payout Batch Completed Successfully ===
Payout Run ID: 123e4567-e89b-12d3-a456-426614174000
ISO Week: 52

Summary:
  Total Partners: 5
  Successful Payouts: 4
  Skipped: 1
  Errors: 0
  Total Amount: ¥125,000

=== End ===
```

**4. データベースで送金実行を確認**

```sql
-- 送金実行履歴を確認
SELECT * FROM payout_runs ORDER BY created_at DESC LIMIT 5;

-- 送金された台帳エントリを確認
SELECT
  l.id,
  l.partner_id,
  l.type,
  l.amount_cents,
  l.status,
  l.stripe_payout_id,
  p.name AS partner_name
FROM ledger l
JOIN partners p ON p.id = l.partner_id
WHERE l.type = 'payout'
ORDER BY l.created_at DESC
LIMIT 10;

-- available エントリが paid に変更されたか確認
SELECT
  id,
  type,
  amount_cents,
  status,
  stripe_payout_id
FROM ledger
WHERE partner_id = 'YOUR_PARTNER_ID'
ORDER BY created_at DESC
LIMIT 10;
```

**5. Stripe Dashboard で確認**

- Stripe Dashboard → Connect → Payouts
- 作成されたPayoutを確認
- ステータスが「Paid」または「In transit」になっていることを確認

---

#### Phase 5: 管理者画面で財務状況を確認

**1. 出品者の残高を確認**

```bash
curl -X GET http://localhost:3000/admin/partners/{partnerId}/balance \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

レスポンス例:
```json
{
  "success": true,
  "partner": {
    "id": "...",
    "name": "テスト出品者",
    "payoutsEnabled": true,
    "debtCents": 0
  },
  "balance": {
    "availableBalance": 0,
    "pendingBalance": 0,
    "paidBalance": 50000,
    "totalBalance": 0,
    "debtCents": 0,
    "netBalance": 0
  }
}
```

**2. プラットフォーム全体のサマリを確認**

```bash
curl -X GET http://localhost:3000/admin/ledger/summary \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

**3. 送金履歴を確認**

```bash
curl -X GET "http://localhost:3000/admin/payouts/history?limit=10" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

---

#### Phase 6: 返金処理のテスト

**1. 返金を実行**

```bash
curl -X POST http://localhost:3000/admin/orders/{orderId}/refund \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \
  -d '{
    "refundAmount": 5000,
    "reason": "テスト返金"
  }'
```

**2. 台帳と負債を確認**

```sql
-- 返金エントリが記録されたか確認
SELECT * FROM ledger
WHERE type = 'refund'
ORDER BY created_at DESC
LIMIT 5;

-- 出品者の負債額を確認
SELECT
  id,
  name,
  debt_cents,
  payouts_enabled,
  stop_reason
FROM partners
WHERE id = 'YOUR_PARTNER_ID';
```

**3. 負債が10,000円を超えた場合の動作確認**

```sql
-- payouts_enabled が false になっているか確認
-- stop_reason が 'debt_over_10000' になっているか確認
```

**4. 負債調整（返済処理）**

```bash
curl -X POST http://localhost:3000/admin/partners/{partnerId}/adjust-debt \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \
  -d '{
    "adjustmentAmount": 5000,
    "note": "返済受領"
  }'
```

---

## トラブルシューティング

### 問題 1: Stripe Connect オンボーディングURLが生成されない

**症状**: `/admin/partners/:partnerId/stripe-onboarding` が500エラーを返す

**原因と対処法**:
1. `STRIPE_CONNECT_CLIENT_ID` が設定されていない
   ```bash
   # .env ファイルを確認
   cat .env | grep STRIPE_CONNECT_CLIENT_ID
   ```

2. Stripe Dashboard で Connect が有効化されていない
   - Stripe Dashboard → Connect → Get started をクリック

3. `lib/stripe.js` が存在しない、または正しく設定されていない
   ```javascript
   // lib/stripe.js の確認
   const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
   module.exports = stripe;
   ```

### 問題 2: Webhook が処理されない

**症状**: 決済完了後、台帳にエントリが作成されない

**原因と対処法**:
1. Webhook署名検証エラー
   ```bash
   # ログを確認
   tail -f logs/combined.log | grep webhook
   ```

2. `STRIPE_WEBHOOK_SECRET` が正しく設定されていない
   - Stripe Dashboard → Developers → Webhooks で signing secret を確認

3. ローカル環境の場合: Stripe CLI でフォワードしていない
   ```bash
   stripe listen --forward-to localhost:3000/webhook
   ```

### 問題 3: 台帳が available にならない

**症状**: 配送完了にしても status='pending' のまま

**原因と対処法**:
1. `delivery_status` が正しく更新されていない
   ```sql
   SELECT delivery_status, delivery_completed_at FROM orders WHERE id = 'ORDER_ID';
   ```

2. `recordDeliveryCompletedAndMarkAvailable` 関数が呼ばれていない
   - `routes-delivery-status.js` の実装を確認

3. `available_at` が未来の日付になっている（7日後）
   ```sql
   -- テスト用に現在時刻に変更
   UPDATE ledger SET available_at = now() WHERE order_id = 'ORDER_ID';
   ```

### 問題 4: 送金バッチが実行されない

**症状**: `node scripts/payout-batch.js` を実行してもスキップされる

**原因と対処法**:
1. 今日が月曜日ではない、またはISO週が奇数
   - テスト用に `isValidPayoutDay` 関数を修正（上記参照）

2. 送金可能な残高が3,000円未満
   ```sql
   -- 残高を確認
   SELECT SUM(amount_cents) FROM ledger
   WHERE partner_id = 'PARTNER_ID'
     AND status = 'available'
     AND available_at <= now();
   ```

3. 出品者の `payouts_enabled` が false
   ```sql
   UPDATE partners SET payouts_enabled = true WHERE id = 'PARTNER_ID';
   ```

### 問題 5: Stripe Payout 作成に失敗

**症状**: 送金バッチ実行時にエラーが発生

**エラー例**:
```
Error: No such account: acct_XXXXXXXXXX
```

**原因と対処法**:
1. Stripe アカウントが存在しない
   - オンボーディングを完了していない
   - `stripe_account_id` がDBに正しく保存されていない

2. アカウントの本人確認が完了していない
   ```sql
   SELECT details_submitted, charges_enabled, payouts_enabled
   FROM partners WHERE id = 'PARTNER_ID';
   ```
   - Stripe Dashboard で対象アカウントの状態を確認

3. テスト環境と本番環境のAPIキーが混在
   - `.env` の `STRIPE_SECRET_KEY` を確認（`sk_test_` または `sk_live_`）

---

## 次のステップ

✅ 全てのテストが成功した場合:
1. 本番環境用の設定を準備
2. Cron ジョブを設定（`CRON_SETUP.md` 参照）
3. 監視・アラートの設定
4. ドキュメントの整備

❌ エラーが発生した場合:
1. ログファイルを確認（`logs/combined.log`, `logs/error.log`）
2. データベースの状態を確認（上記SQLクエリ）
3. Stripe Dashboard でイベントログを確認
4. 必要に応じて開発者に問い合わせ

---

## 参考資料

- [Stripe Connect ドキュメント](https://stripe.com/docs/connect)
- [Stripe Express アカウント](https://stripe.com/docs/connect/express-accounts)
- [Stripe Payouts API](https://stripe.com/docs/api/payouts)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Stripe CLI](https://stripe.com/docs/stripe-cli)
