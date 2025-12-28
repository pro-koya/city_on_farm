# Stripe Connect 出品者送金機能 実装計画書

> **作成日**: 2025-12-27
> **対象システム**: 今日の食卓 ECプラットフォーム
> **目的**: 出品者への自動送金機能（隔週月曜・Stripe Connect）

---

## 📋 目次

1. [概要](#概要)
2. [前提条件・確定要件](#前提条件確定要件)
3. [アーキテクチャ設計](#アーキテクチャ設計)
4. [実装フェーズ](#実装フェーズ)
5. [環境変数・設定](#環境変数設定)
6. [テスト計画](#テスト計画)
7. [運用・監視](#運用監視)

---

## 概要

### 目的
クレジットカード決済で得た売上を、各出品者（partner）に対して**隔週月曜日に自動送金**する機能を構築します。

### 設計方針
- **Stripe Connect (Express)** を使用し、出品者の本人確認・口座管理はStripeに委ねる
- **台帳（Ledger）システム** で金額の整合性・監査可能性を確保
- **冪等性** を徹底し、重複処理・二重送金を防止
- **安全性** を最優先し、負債管理・出品停止ロジックを実装

### 主要機能
1. Stripe Connectオンボーディング（出品者の口座登録）
2. 決済成功時の台帳計上（売上・手数料）
3. 配送完了後7日で送金可能化
4. 返金処理と相殺（出品者負担）
5. 隔週月曜の自動送金バッチ
6. 管理画面API（残高確認・返金実行）

---

## 前提条件・確定要件

### 既存システムの状態

#### ✅ 実装済み
- Stripe Checkout決済
- Webhook処理 (`/webhooks/stripe`)
  - `checkout.session.completed`
  - `payment_intent.succeeded`
  - `charge.refunded`
- 以下のテーブルが存在:
  - `partners` (出品者)
  - `orders` (注文: `seller_id`, `payment_status`, `delivery_status` など)
  - `users` (ユーザー: `partner_id` 参照)
  - `partner_bank_accounts` (既存migration適用済み - 手動送金用)

#### 🔄 既存テーブルとの共存方針
- `partner_bank_accounts` テーブルは残す（手動送金のフォールバック用）
- Stripe Connect利用時は `partners.stripe_account_id` を優先
- `payouts_enabled=true` の場合は自動送金、`false` の場合は手動送金に切り替え可能

### 確定要件

| 項目 | 仕様 |
|------|------|
| 注文単位 | 常に単一出品者（`orders.seller_id` → `users.id` → `users.partner_id`） |
| 決済方法 | Stripe Checkout（既存実装） |
| 送金スケジュール | 隔週月曜日（**ISO週番号が偶数の週のみ**） |
| 送金最低金額 | 3,000円（未満は次回繰越） |
| 送金猶予 | 配送/受取完了（`delivery_status='delivered'`）から**7日後**に送金可能化 |
| プラットフォーム手数料 | **6%（税込）**、最低150円<br>`fee = max(round(orders.total * 0.06), 150)` |
| 返金ポリシー | 全て出品者負担<br>返金額には送料を含む<br>**Stripe手数料は返金額に含めない**（運営負担） |
| 負債管理 | 負債が**10,000円超**で出品停止（`payouts_enabled=false`） |
| Stripe Connect種別 | **Express Connect** |
| 決済フロー | プラットフォームが受取 → 後で出品者にPayout |

---

## アーキテクチャ設計

### データフロー図

```
[購入者]
   ↓ (Stripe Checkout)
[Stripe] → [Webhook: checkout.session.completed]
   ↓
[Orders: payment_status='paid']
   ↓
[Ledger: sale(+total), platform_fee(-fee)] ← 台帳計上（status='pending'）
   ↓
[出品者: 商品発送]
   ↓
[Orders: delivery_status='delivered', delivery_completed_at=now()]
   ↓ (+7日後)
[Ledger: status='available', available_at=now()+7日]
   ↓
[隔週月曜バッチ]
   ↓
[Stripe Connect Payout] → 出品者の銀行口座へ送金
   ↓
[Ledger: payout(-amount), 対象エントリ status='paid']
```

### データベース設計

#### 1. partnersテーブル拡張

```sql
-- Stripe Connect関連カラム追加
ALTER TABLE partners ADD COLUMN IF NOT EXISTS
  stripe_account_id TEXT UNIQUE,                    -- Stripe ConnectアカウントID
  payouts_enabled BOOLEAN DEFAULT FALSE,            -- 送金可能フラグ
  debt_cents INTEGER DEFAULT 0,                     -- 負債額（円単位）
  stop_reason TEXT,                                 -- 停止理由
  stripe_onboarding_completed BOOLEAN DEFAULT FALSE, -- オンボーディング完了フラグ
  stripe_details_submitted BOOLEAN DEFAULT FALSE,   -- KYC完了フラグ
  stripe_payouts_enabled BOOLEAN DEFAULT FALSE,     -- Stripe側の送金可能フラグ
  stripe_charges_enabled BOOLEAN DEFAULT FALSE,     -- Stripe側の決済可能フラグ
  stripe_account_updated_at TIMESTAMP;              -- Stripeアカウント最終更新日時

-- インデックス
CREATE INDEX IF NOT EXISTS idx_partners_stripe_account ON partners(stripe_account_id);
CREATE INDEX IF NOT EXISTS idx_partners_payouts_enabled ON partners(payouts_enabled);
CREATE INDEX IF NOT EXISTS idx_partners_debt ON partners(debt_cents);
```

#### 2. ordersテーブル拡張

```sql
-- Stripe・台帳関連カラム追加
ALTER TABLE orders ADD COLUMN IF NOT EXISTS
  stripe_payment_intent_id TEXT,          -- Stripe PaymentIntent ID
  stripe_charge_id TEXT,                  -- Stripe Charge ID
  delivery_completed_at TIMESTAMP,        -- 配送/受取完了日時
  ledger_sale_id UUID,                    -- 売上台帳エントリID
  ledger_fee_id UUID;                     -- 手数料台帳エントリID

-- インデックス
CREATE INDEX IF NOT EXISTS idx_orders_delivery_completed ON orders(delivery_completed_at);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent ON orders(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_charge ON orders(stripe_charge_id);
CREATE INDEX IF NOT EXISTS idx_orders_ledger_sale ON orders(ledger_sale_id);
```

#### 3. ledgerテーブル新設（売上台帳）

```sql
-- 売上台帳テーブル
CREATE TABLE IF NOT EXISTS ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,

  -- エントリタイプと金額
  type TEXT NOT NULL CHECK (type IN (
    'sale',           -- 売上計上（+）
    'platform_fee',   -- プラットフォーム手数料（-）
    'refund',         -- 返金（-）
    'adjustment',     -- 調整（+/-）
    'payout',         -- 送金実行（-）
    'carry_over'      -- 繰越（+）
  )),
  amount_cents INTEGER NOT NULL,  -- 金額（円単位、+収入 / -控除）
  currency TEXT NOT NULL DEFAULT 'jpy',

  -- ステータス管理
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',    -- 猶予期間中
    'available',  -- 送金可能
    'paid',       -- 送金済み
    'void'        -- 無効（キャンセル等）
  )),
  available_at TIMESTAMP,  -- 送金可能日時（配送完了日+7日）

  -- Stripe関連ID（トレーサビリティ）
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  stripe_refund_id TEXT,
  stripe_transfer_id TEXT,
  stripe_payout_id TEXT,

  -- 冪等性キー（重要！）
  idempotency_key TEXT UNIQUE NOT NULL,  -- 例: "sale-{order_id}", "refund-{refund_id}"

  -- メタデータ
  metadata JSONB DEFAULT '{}',
  note TEXT,

  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),

  -- 金額チェック制約
  CONSTRAINT ledger_amount_check CHECK (
    (type IN ('sale', 'carry_over', 'adjustment') AND amount_cents >= 0) OR
    (type IN ('platform_fee', 'refund', 'payout') AND amount_cents <= 0)
  )
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_ledger_partner_status ON ledger(partner_id, status, available_at);
CREATE INDEX IF NOT EXISTS idx_ledger_order ON ledger(order_id);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger(type);
CREATE INDEX IF NOT EXISTS idx_ledger_idempotency ON ledger(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ledger_stripe_payment_intent ON ledger(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON ledger(created_at DESC);

-- コメント
COMMENT ON TABLE ledger IS '出品者売上台帳（金額の完全なトレーサビリティを確保）';
COMMENT ON COLUMN ledger.idempotency_key IS '二重計上防止用のユニークキー';
COMMENT ON COLUMN ledger.amount_cents IS '金額（円単位）: プラス=収入、マイナス=控除';
COMMENT ON COLUMN ledger.available_at IS '送金可能日時（配送完了+7日後）';
```

#### 4. payout_runsテーブル新設（バッチ実行記録）

```sql
-- 送金バッチ実行記録テーブル
CREATE TABLE IF NOT EXISTS payout_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE NOT NULL UNIQUE,  -- 実行日（同日の重複実行を防止）

  -- ISO週情報（隔週判定用）
  iso_week INTEGER NOT NULL,      -- ISO週番号（1-53）
  iso_year INTEGER NOT NULL,      -- ISO年

  -- 実行ステータス
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',    -- 実行待ち
    'running',    -- 実行中
    'completed',  -- 完了
    'failed'      -- 失敗
  )),

  -- 実行結果サマリー
  partners_processed INTEGER DEFAULT 0,       -- 処理した出品者数
  partners_succeeded INTEGER DEFAULT 0,       -- 送金成功数
  partners_failed INTEGER DEFAULT 0,          -- 送金失敗数
  total_payout_amount_cents INTEGER DEFAULT 0, -- 総送金額

  -- タイムスタンプ
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- ログ・エラー
  log JSONB DEFAULT '[]',  -- 処理ログ（配列形式）
  error_message TEXT,

  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_payout_runs_date ON payout_runs(run_date DESC);
CREATE INDEX IF NOT EXISTS idx_payout_runs_week ON payout_runs(iso_year, iso_week);
CREATE INDEX IF NOT EXISTS idx_payout_runs_status ON payout_runs(status);

-- コメント
COMMENT ON TABLE payout_runs IS '送金バッチ実行履歴（冪等性と監査のため）';
COMMENT ON COLUMN payout_runs.iso_week IS 'ISO週番号（偶数週のみ実行）';
```

---

## 実装フェーズ

### Phase 1: データベース移行（Migration）

**ファイル**: `migrations/005_stripe_connect_payout_system.sql`

```sql
-- ============================================================
-- Stripe Connect 出品者送金システム Migration
-- 作成日: 2025-12-27
-- ============================================================

BEGIN;

-- 1. partnersテーブル拡張
ALTER TABLE partners ADD COLUMN IF NOT EXISTS
  stripe_account_id TEXT UNIQUE,
  payouts_enabled BOOLEAN DEFAULT FALSE,
  debt_cents INTEGER DEFAULT 0,
  stop_reason TEXT,
  stripe_onboarding_completed BOOLEAN DEFAULT FALSE,
  stripe_details_submitted BOOLEAN DEFAULT FALSE,
  stripe_payouts_enabled BOOLEAN DEFAULT FALSE,
  stripe_charges_enabled BOOLEAN DEFAULT FALSE,
  stripe_account_updated_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_partners_stripe_account ON partners(stripe_account_id);
CREATE INDEX IF NOT EXISTS idx_partners_payouts_enabled ON partners(payouts_enabled);
CREATE INDEX IF NOT EXISTS idx_partners_debt ON partners(debt_cents);

-- 2. ordersテーブル拡張
ALTER TABLE orders ADD COLUMN IF NOT EXISTS
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  delivery_completed_at TIMESTAMP,
  ledger_sale_id UUID,
  ledger_fee_id UUID;

CREATE INDEX IF NOT EXISTS idx_orders_delivery_completed ON orders(delivery_completed_at);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent ON orders(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_charge ON orders(stripe_charge_id);
CREATE INDEX IF NOT EXISTS idx_orders_ledger_sale ON orders(ledger_sale_id);

-- 3. ledgerテーブル新設
CREATE TABLE IF NOT EXISTS ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,

  type TEXT NOT NULL CHECK (type IN (
    'sale', 'platform_fee', 'refund', 'adjustment', 'payout', 'carry_over'
  )),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'jpy',

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'available', 'paid', 'void'
  )),
  available_at TIMESTAMP,

  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  stripe_refund_id TEXT,
  stripe_transfer_id TEXT,
  stripe_payout_id TEXT,

  idempotency_key TEXT UNIQUE NOT NULL,
  metadata JSONB DEFAULT '{}',
  note TEXT,

  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),

  CONSTRAINT ledger_amount_check CHECK (
    (type IN ('sale', 'carry_over', 'adjustment') AND amount_cents >= 0) OR
    (type IN ('platform_fee', 'refund', 'payout') AND amount_cents <= 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_ledger_partner_status ON ledger(partner_id, status, available_at);
CREATE INDEX IF NOT EXISTS idx_ledger_order ON ledger(order_id);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger(type);
CREATE INDEX IF NOT EXISTS idx_ledger_idempotency ON ledger(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ledger_stripe_payment_intent ON ledger(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON ledger(created_at DESC);

COMMENT ON TABLE ledger IS '出品者売上台帳（金額の完全なトレーサビリティを確保）';
COMMENT ON COLUMN ledger.idempotency_key IS '二重計上防止用のユニークキー';

-- 4. payout_runsテーブル新設
CREATE TABLE IF NOT EXISTS payout_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE NOT NULL UNIQUE,
  iso_week INTEGER NOT NULL,
  iso_year INTEGER NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'completed', 'failed'
  )),

  partners_processed INTEGER DEFAULT 0,
  partners_succeeded INTEGER DEFAULT 0,
  partners_failed INTEGER DEFAULT 0,
  total_payout_amount_cents INTEGER DEFAULT 0,

  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  log JSONB DEFAULT '[]',
  error_message TEXT,

  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_runs_date ON payout_runs(run_date DESC);
CREATE INDEX IF NOT EXISTS idx_payout_runs_week ON payout_runs(iso_year, iso_week);
CREATE INDEX IF NOT EXISTS idx_payout_runs_status ON payout_runs(status);

COMMENT ON TABLE payout_runs IS '送金バッチ実行履歴（冪等性と監査のため）';
COMMENT ON COLUMN payout_runs.iso_week IS 'ISO週番号（偶数週のみ実行）';

COMMIT;
```

**実行方法**:
```bash
psql "$PGURL" -f migrations/005_stripe_connect_payout_system.sql
```

---

### Phase 2: Stripe Connectオンボーディング実装

#### 2.1 サービスモジュール作成

**ファイル**: `services/stripe-connect.js`

```javascript
// services/stripe-connect.js
const stripe = require('../lib/stripe');
const { dbQuery } = require('./db');
const logger = require('./logger');

/**
 * Stripe Connectアカウントリンク作成（オンボーディング開始）
 * @param {string} partnerId - 出品者（partner）のID
 * @param {string} returnUrl - オンボーディング完了後のリダイレクト先URL
 * @param {string} refreshUrl - オンボーディング再開時のURL
 * @returns {Promise<{accountId: string, url: string}>}
 */
async function createConnectAccountLink(partnerId, returnUrl, refreshUrl) {
  try {
    // 1. partnerを取得
    const partners = await dbQuery(
      'SELECT id, stripe_account_id, email, name FROM partners WHERE id = $1',
      [partnerId]
    );
    const partner = partners[0];
    if (!partner) {
      throw new Error('Partner not found');
    }

    let accountId = partner.stripe_account_id;

    // 2. Stripe Connectアカウントが未作成なら作成
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'JP',
        email: partner.email,
        capabilities: {
          transfers: { requested: true }
        },
        business_type: 'individual', // または 'company'（法人の場合）
        metadata: {
          partner_id: partnerId,
          partner_name: partner.name
        }
      });

      accountId = account.id;

      // DBに保存
      await dbQuery(
        `UPDATE partners
         SET stripe_account_id = $1, updated_at = now()
         WHERE id = $2`,
        [accountId, partnerId]
      );

      logger.info('Stripe Connect account created', {
        partnerId,
        accountId
      });
    }

    // 3. Account Linkを作成
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding'
    });

    logger.info('Stripe Connect account link created', {
      partnerId,
      accountId,
      url: accountLink.url
    });

    return {
      accountId,
      url: accountLink.url
    };
  } catch (error) {
    logger.error('Failed to create Connect account link', {
      partnerId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Stripe Connectアカウント情報を同期
 * @param {string} accountId - Stripe ConnectアカウントID
 */
async function syncConnectAccount(accountId) {
  try {
    const account = await stripe.accounts.retrieve(accountId);

    // DBのpartnerを取得
    const partners = await dbQuery(
      'SELECT id FROM partners WHERE stripe_account_id = $1',
      [accountId]
    );

    if (!partners.length) {
      logger.warn('Partner not found for Stripe account', { accountId });
      return;
    }

    const partnerId = partners[0].id;

    // ステータスを更新
    await dbQuery(
      `UPDATE partners SET
         stripe_details_submitted = $1,
         stripe_charges_enabled = $2,
         stripe_payouts_enabled = $3,
         payouts_enabled = $4,
         stripe_onboarding_completed = $5,
         stripe_account_updated_at = now(),
         updated_at = now()
       WHERE id = $6`,
      [
        account.details_submitted || false,
        account.charges_enabled || false,
        account.payouts_enabled || false,
        account.payouts_enabled || false, // 自動送金フラグもStripe準拠で更新
        account.details_submitted || false,
        partnerId
      ]
    );

    logger.info('Stripe Connect account synced', {
      partnerId,
      accountId,
      payoutsEnabled: account.payouts_enabled
    });
  } catch (error) {
    logger.error('Failed to sync Connect account', {
      accountId,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  createConnectAccountLink,
  syncConnectAccount
};
```

#### 2.2 管理画面API追加

**追加先**: `server.js` (管理者ルート部分)

```javascript
// ============================================================
// Stripe Connectオンボーディング
// ============================================================
const { createConnectAccountLink, syncConnectAccount } = require('./services/stripe-connect');

// 管理者: Stripe Connectオンボーディング開始
app.post('/admin/partners/:partnerId/stripe-onboarding', requireAdmin, async (req, res, next) => {
  try {
    const { partnerId } = req.params;
    const appOrigin = process.env.APP_ORIGIN || 'http://localhost:3000';

    const returnUrl = `${appOrigin}/admin/partners/${partnerId}/stripe-return`;
    const refreshUrl = `${appOrigin}/admin/partners/${partnerId}/stripe-refresh`;

    const { accountId, url } = await createConnectAccountLink(
      partnerId,
      returnUrl,
      refreshUrl
    );

    res.json({
      success: true,
      accountId,
      onboardingUrl: url
    });
  } catch (error) {
    next(error);
  }
});

// Stripe Connectオンボーディング完了後のリダイレクト先
app.get('/admin/partners/:partnerId/stripe-return', requireAdmin, async (req, res) => {
  const { partnerId } = req.params;

  // アカウント情報を同期
  try {
    const partners = await dbQuery(
      'SELECT stripe_account_id FROM partners WHERE id = $1',
      [partnerId]
    );

    if (partners.length && partners[0].stripe_account_id) {
      await syncConnectAccount(partners[0].stripe_account_id);
    }
  } catch (error) {
    logger.error('Failed to sync after onboarding return', { error });
  }

  res.redirect(`/admin/partners/${partnerId}?onboarding=success`);
});

// Stripe Connectオンボーディング再開
app.get('/admin/partners/:partnerId/stripe-refresh', requireAdmin, async (req, res, next) => {
  try {
    const { partnerId } = req.params;
    const appOrigin = process.env.APP_ORIGIN || 'http://localhost:3000';

    const returnUrl = `${appOrigin}/admin/partners/${partnerId}/stripe-return`;
    const refreshUrl = `${appOrigin}/admin/partners/${partnerId}/stripe-refresh`;

    const { url } = await createConnectAccountLink(
      partnerId,
      returnUrl,
      refreshUrl
    );

    res.redirect(url);
  } catch (error) {
    next(error);
  }
});
```

---

### Phase 3: 決済成功時の台帳計上

#### 3.1 台帳サービスモジュール作成

**ファイル**: `services/ledger.js`

```javascript
// services/ledger.js
const { dbQuery } = require('./db');
const logger = require('./logger');

/**
 * プラットフォーム手数料を計算
 * @param {number} totalCents - 注文総額（円）
 * @returns {number} 手数料（円）
 */
function calculatePlatformFee(totalCents) {
  const feeRate = 0.06; // 6%
  const minFee = 150;   // 最低150円

  const calculatedFee = Math.round(totalCents * feeRate);
  return Math.max(calculatedFee, minFee);
}

/**
 * 決済成功時の台帳計上
 * @param {object} order - 注文オブジェクト
 * @param {string} paymentIntentId - Stripe PaymentIntent ID
 * @param {string} chargeId - Stripe Charge ID
 */
async function recordSaleAndFee(order, paymentIntentId, chargeId) {
  const { id: orderId, total, seller_id } = order;

  // seller_id (users.id) から partner_id を取得
  const users = await dbQuery(
    'SELECT partner_id FROM users WHERE id = $1',
    [seller_id]
  );

  if (!users.length || !users[0].partner_id) {
    logger.warn('Partner not found for order seller', { orderId, seller_id });
    return;
  }

  const partnerId = users[0].partner_id;
  const totalCents = total; // ordersテーブルのtotalは既に円単位
  const feeCents = calculatePlatformFee(totalCents);

  // 冪等性キー
  const saleIdempotencyKey = `sale-${orderId}`;
  const feeIdempotencyKey = `platform_fee-${orderId}`;

  try {
    // トランザクション開始
    await dbQuery('BEGIN');

    // 1. 売上エントリ作成（+total）
    const saleResult = await dbQuery(
      `INSERT INTO ledger (
         partner_id, order_id, type, amount_cents, currency,
         status, stripe_payment_intent_id, stripe_charge_id,
         idempotency_key, note
       ) VALUES ($1, $2, 'sale', $3, 'jpy', 'pending', $4, $5, $6, $7)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        partnerId,
        orderId,
        totalCents,
        paymentIntentId,
        chargeId,
        saleIdempotencyKey,
        `決済成功による売上計上 (注文ID: ${orderId})`
      ]
    );

    // 2. 手数料エントリ作成（-fee）
    const feeResult = await dbQuery(
      `INSERT INTO ledger (
         partner_id, order_id, type, amount_cents, currency,
         status, stripe_payment_intent_id, stripe_charge_id,
         idempotency_key, note
       ) VALUES ($1, $2, 'platform_fee', $3, 'jpy', 'pending', $4, $5, $6, $7)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        partnerId,
        orderId,
        -feeCents, // マイナス値
        paymentIntentId,
        chargeId,
        feeIdempotencyKey,
        `プラットフォーム手数料 6% (最低150円)`
      ]
    );

    // 3. ordersテーブルに台帳IDを保存
    if (saleResult.length && feeResult.length) {
      await dbQuery(
        `UPDATE orders SET
           ledger_sale_id = $1,
           ledger_fee_id = $2,
           stripe_payment_intent_id = $3,
           stripe_charge_id = $4,
           updated_at = now()
         WHERE id = $5`,
        [
          saleResult[0].id,
          feeResult[0].id,
          paymentIntentId,
          chargeId,
          orderId
        ]
      );
    }

    await dbQuery('COMMIT');

    logger.info('Sale and fee recorded in ledger', {
      orderId,
      partnerId,
      totalCents,
      feeCents,
      saleId: saleResult[0]?.id,
      feeId: feeResult[0]?.id
    });
  } catch (error) {
    await dbQuery('ROLLBACK');
    logger.error('Failed to record sale and fee', {
      orderId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * 配送完了時の台帳available化
 * @param {string} orderId - 注文ID
 */
async function markLedgerAvailable(orderId) {
  try {
    const orders = await dbQuery(
      `SELECT id, delivery_completed_at, ledger_sale_id, ledger_fee_id
       FROM orders WHERE id = $1`,
      [orderId]
    );

    const order = orders[0];
    if (!order) {
      throw new Error('Order not found');
    }

    const deliveryCompletedAt = order.delivery_completed_at || new Date();
    const availableAt = new Date(deliveryCompletedAt);
    availableAt.setDate(availableAt.getDate() + 7); // +7日

    await dbQuery('BEGIN');

    // sale と platform_fee の両方を available に更新
    if (order.ledger_sale_id) {
      await dbQuery(
        `UPDATE ledger SET
           status = 'available',
           available_at = $1,
           updated_at = now()
         WHERE id = $2 AND status = 'pending'`,
        [availableAt, order.ledger_sale_id]
      );
    }

    if (order.ledger_fee_id) {
      await dbQuery(
        `UPDATE ledger SET
           status = 'available',
           available_at = $1,
           updated_at = now()
         WHERE id = $2 AND status = 'pending'`,
        [availableAt, order.ledger_fee_id]
      );
    }

    await dbQuery('COMMIT');

    logger.info('Ledger marked as available', {
      orderId,
      availableAt
    });
  } catch (error) {
    await dbQuery('ROLLBACK');
    logger.error('Failed to mark ledger available', {
      orderId,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  calculatePlatformFee,
  recordSaleAndFee,
  markLedgerAvailable
};
```

#### 3.2 Webhook拡張（既存の`/webhooks/stripe`に追加）

**追加先**: `server.js` の既存webhook部分

```javascript
// 既存のwebhookハンドラ内に追加
const { recordSaleAndFee } = require('./services/ledger');

// checkout.session.completed ケース内に追加
case 'checkout.session.completed': {
  const session = event.data.object;

  // ... 既存のorder検索処理 ...

  // payment_status更新（既存処理）
  await dbQuery(
    `UPDATE orders
     SET payment_status = 'paid',
         payment_txid = $1,
         updated_at = now()
     WHERE id = $2
       AND payment_status != 'paid'`,
    [session.payment_intent, order.id]
  );

  // ★★★ 台帳計上処理を追加 ★★★
  try {
    const chargeId = session.charges?.data?.[0]?.id || null;
    await recordSaleAndFee(order, session.payment_intent, chargeId);
  } catch (ledgerError) {
    logger.error('Failed to record ledger for order', {
      orderId: order.id,
      error: ledgerError.message
    });
    // 台帳計上失敗してもStripeには成功を返す（後で手動修正可能）
  }

  logger.info('Order payment status updated to paid', {
    orderId: order.id,
    orderNumber: order.order_number
  });
  break;
}
```

#### 3.3 配送完了時の処理追加

**追加先**: `server.js` の配送ステータス更新API

```javascript
const { markLedgerAvailable } = require('./services/ledger');

// 出品者: 配送ステータス更新
app.post('/seller/orders/:orderId/update-delivery-status', requireSeller, async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { deliveryStatus } = req.body; // 例: 'delivered'

    // ... 既存の権限チェック・バリデーション ...

    await dbQuery('BEGIN');

    // ステータス更新
    await dbQuery(
      `UPDATE orders SET
         delivery_status = $1,
         updated_at = now()
       WHERE id = $2`,
      [deliveryStatus, orderId]
    );

    // delivery_status が 'delivered' になったら delivery_completed_at を記録
    if (deliveryStatus === 'delivered') {
      await dbQuery(
        `UPDATE orders SET
           delivery_completed_at = now()
         WHERE id = $1 AND delivery_completed_at IS NULL`,
        [orderId]
      );

      // ★★★ 台帳をavailableに更新 ★★★
      try {
        await markLedgerAvailable(orderId);
      } catch (ledgerError) {
        logger.error('Failed to mark ledger available', {
          orderId,
          error: ledgerError.message
        });
        // エラーでもロールバックせず、後で手動修正可能
      }
    }

    await dbQuery('COMMIT');

    res.json({ success: true });
  } catch (error) {
    await dbQuery('ROLLBACK');
    next(error);
  }
});
```

---

### Phase 4: 返金処理と相殺

#### 4.1 返金サービスモジュール

**ファイル**: `services/refund.js`

```javascript
// services/refund.js
const stripe = require('../lib/stripe');
const { dbQuery } = require('./db');
const logger = require('./logger');

/**
 * 返金実行
 * @param {string} orderId - 注文ID
 * @param {number} refundAmountCents - 返金額（円）
 * @param {string} reason - 返金理由
 * @param {string} adminUserId - 実行者（管理者）のユーザーID
 */
async function processRefund(orderId, refundAmountCents, reason, adminUserId) {
  try {
    await dbQuery('BEGIN');

    // 1. 注文情報取得
    const orders = await dbQuery(
      `SELECT o.id, o.total, o.stripe_payment_intent_id, o.stripe_charge_id,
              o.seller_id, u.partner_id
       FROM orders o
       JOIN users u ON u.id = o.seller_id
       WHERE o.id = $1`,
      [orderId]
    );

    const order = orders[0];
    if (!order) {
      throw new Error('Order not found');
    }

    if (!order.partner_id) {
      throw new Error('Partner not found for order');
    }

    const partnerId = order.partner_id;

    // 2. Stripe返金実行（Stripe手数料は返金額に含めない）
    let stripeRefund;
    if (order.stripe_payment_intent_id) {
      stripeRefund = await stripe.refunds.create({
        payment_intent: order.stripe_payment_intent_id,
        amount: refundAmountCents, // 円単位
        reason: 'requested_by_customer', // または 'fraudulent', 'duplicate'
        metadata: {
          order_id: orderId,
          refund_reason: reason,
          admin_user_id: adminUserId
        }
      });

      logger.info('Stripe refund created', {
        orderId,
        refundId: stripeRefund.id,
        amount: refundAmountCents
      });
    } else {
      throw new Error('No Stripe payment intent found for order');
    }

    // 3. 台帳に返金エントリ作成（マイナス値）
    const idempotencyKey = `refund-${stripeRefund.id}`;
    await dbQuery(
      `INSERT INTO ledger (
         partner_id, order_id, type, amount_cents, currency,
         status, available_at, stripe_refund_id, idempotency_key, note
       ) VALUES ($1, $2, 'refund', $3, 'jpy', 'available', now(), $4, $5, $6)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        partnerId,
        orderId,
        -refundAmountCents, // マイナス値
        stripeRefund.id,
        idempotencyKey,
        `返金処理: ${reason}`
      ]
    );

    // 4. 出品者の未送金残高を計算
    const balanceRows = await dbQuery(
      `SELECT COALESCE(SUM(amount_cents), 0)::int AS balance
       FROM ledger
       WHERE partner_id = $1
         AND status IN ('available', 'pending')`,
      [partnerId]
    );

    const availableBalance = balanceRows[0].balance;

    // 5. 残高がマイナス（不足）なら debt に計上
    if (availableBalance < 0) {
      const debtAmount = Math.abs(availableBalance);

      await dbQuery(
        `UPDATE partners SET
           debt_cents = $1,
           updated_at = now()
         WHERE id = $2`,
        [debtAmount, partnerId]
      );

      // 6. debt が 10,000円超なら出品停止
      if (debtAmount > 10000) {
        await dbQuery(
          `UPDATE partners SET
             payouts_enabled = false,
             stop_reason = 'debt_over_10000',
             updated_at = now()
           WHERE id = $1`,
          [partnerId]
        );

        logger.warn('Partner payouts disabled due to debt', {
          partnerId,
          debtAmount
        });
      }
    }

    // 7. ordersテーブルのステータス更新
    await dbQuery(
      `UPDATE orders SET
         payment_status = 'refunded',
         updated_at = now()
       WHERE id = $1`,
      [orderId]
    );

    await dbQuery('COMMIT');

    logger.info('Refund processed successfully', {
      orderId,
      refundId: stripeRefund.id,
      refundAmount: refundAmountCents,
      partnerId,
      availableBalance
    });

    return {
      success: true,
      refundId: stripeRefund.id,
      refundAmount: refundAmountCents
    };
  } catch (error) {
    await dbQuery('ROLLBACK');
    logger.error('Refund processing failed', {
      orderId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

module.exports = {
  processRefund
};
```

#### 4.2 返金API追加

**追加先**: `server.js` (管理者ルート)

```javascript
const { processRefund } = require('./services/refund');

// 管理者: 返金実行
app.post('/admin/orders/:orderId/refund', requireAdmin, async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { refundAmount, reason } = req.body;

    // バリデーション
    if (!refundAmount || refundAmount <= 0) {
      return res.status(400).json({ error: 'Invalid refund amount' });
    }

    const result = await processRefund(
      orderId,
      refundAmount,
      reason || '管理者による返金',
      req.session.user.id
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});
```

---

### Phase 5: 隔週月曜送金バッチ

#### 5.1 バッチスクリプト

**ファイル**: `scripts/payout-batch.js`

```javascript
#!/usr/bin/env node
// scripts/payout-batch.js
require('dotenv').config();
const stripe = require('../lib/stripe');
const { dbQuery } = require('../services/db');
const logger = require('../services/logger');

/**
 * ISO週番号を取得
 * @param {Date} date
 * @returns {{isoWeek: number, isoYear: number}}
 */
function getISOWeek(date) {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const isoWeek = 1 + Math.ceil((firstThursday - target) / 604800000);
  const isoYear = target.getFullYear();
  return { isoWeek, isoYear };
}

/**
 * メイン処理
 */
async function main() {
  const today = new Date();
  const { isoWeek, isoYear } = getISOWeek(today);
  const runDate = today.toISOString().split('T')[0]; // YYYY-MM-DD

  logger.info('Payout batch started', { runDate, isoWeek, isoYear });

  // 1. 隔週判定（偶数週のみ実行）
  if (isoWeek % 2 !== 0) {
    logger.info('Skipping payout: odd week', { isoWeek });
    console.log(`今週は隔週対象外です (ISO週${isoWeek}は奇数)`);
    process.exit(0);
  }

  // 2. 冪等性チェック（同じrun_dateが既に存在するかチェック）
  const existingRuns = await dbQuery(
    'SELECT run_id, status FROM payout_runs WHERE run_date = $1',
    [runDate]
  );

  if (existingRuns.length > 0) {
    const existingRun = existingRuns[0];
    if (existingRun.status === 'completed') {
      logger.info('Payout already completed for this date', { runDate });
      console.log(`本日分の送金は既に完了しています (run_id: ${existingRun.run_id})`);
      process.exit(0);
    } else if (existingRun.status === 'running') {
      logger.warn('Payout already running for this date', { runDate });
      console.log(`本日分の送金が既に実行中です`);
      process.exit(1);
    }
  }

  // 3. payout_run レコード作成
  const runResult = await dbQuery(
    `INSERT INTO payout_runs (run_date, iso_week, iso_year, status, started_at)
     VALUES ($1, $2, $3, 'running', now())
     RETURNING run_id`,
    [runDate, isoWeek, isoYear]
  );

  const runId = runResult[0].run_id;
  logger.info('Payout run created', { runId });

  let partnersProcessed = 0;
  let partnersSucceeded = 0;
  let partnersFailed = 0;
  let totalPayoutAmountCents = 0;
  const logs = [];

  try {
    // 4. 対象partner抽出: payouts_enabled=true AND debt<10000
    const partners = await dbQuery(
      `SELECT id, name, stripe_account_id, debt_cents
       FROM partners
       WHERE payouts_enabled = true
         AND stripe_account_id IS NOT NULL
         AND stripe_payouts_enabled = true
         AND debt_cents < 10000
       ORDER BY id`
    );

    logger.info(`Found ${partners.length} partners eligible for payout`);

    // 5. 各partnerの送金可能額を計算・送金実行
    for (const partner of partners) {
      partnersProcessed++;

      try {
        // 送金可能額を計算
        const balanceRows = await dbQuery(
          `SELECT COALESCE(SUM(amount_cents), 0)::int AS available_balance
           FROM ledger
           WHERE partner_id = $1
             AND status = 'available'
             AND available_at <= now()`,
          [partner.id]
        );

        const availableBalance = balanceRows[0].available_balance;

        // 最低送金額チェック（3,000円）
        if (availableBalance < 3000) {
          logs.push({
            partnerId: partner.id,
            partnerName: partner.name,
            status: 'skipped',
            reason: `送金可能額が最低額未満 (${availableBalance}円 < 3,000円)`,
            timestamp: new Date().toISOString()
          });
          logger.info('Partner skipped: below minimum payout amount', {
            partnerId: partner.id,
            availableBalance
          });
          continue;
        }

        // Stripe Connect Payout作成
        const payout = await stripe.payouts.create(
          {
            amount: availableBalance,
            currency: 'jpy',
            metadata: {
              partner_id: partner.id,
              partner_name: partner.name,
              run_id: runId,
              run_date: runDate
            }
          },
          {
            stripeAccount: partner.stripe_account_id
          }
        );

        logger.info('Stripe payout created', {
          partnerId: partner.id,
          payoutId: payout.id,
          amount: availableBalance
        });

        // 台帳にpayoutエントリ作成
        const idempotencyKey = `payout-${runId}-${partner.id}`;
        await dbQuery(
          `INSERT INTO ledger (
             partner_id, type, amount_cents, currency,
             status, stripe_payout_id, idempotency_key, note
           ) VALUES ($1, 'payout', $2, 'jpy', 'paid', $3, $4, $5)
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [
            partner.id,
            -availableBalance, // マイナス値
            payout.id,
            idempotencyKey,
            `隔週送金バッチ実行 (run_id: ${runId})`
          ]
        );

        // 対象のavailableエントリをpaidに更新
        await dbQuery(
          `UPDATE ledger SET
             status = 'paid',
             updated_at = now()
           WHERE partner_id = $1
             AND status = 'available'
             AND available_at <= now()`,
          [partner.id]
        );

        partnersSucceeded++;
        totalPayoutAmountCents += availableBalance;

        logs.push({
          partnerId: partner.id,
          partnerName: partner.name,
          status: 'success',
          payoutId: payout.id,
          amount: availableBalance,
          timestamp: new Date().toISOString()
        });

        logger.info('Payout succeeded', {
          partnerId: partner.id,
          payoutId: payout.id,
          amount: availableBalance
        });
      } catch (partnerError) {
        partnersFailed++;

        logs.push({
          partnerId: partner.id,
          partnerName: partner.name,
          status: 'failed',
          error: partnerError.message,
          timestamp: new Date().toISOString()
        });

        logger.error('Payout failed for partner', {
          partnerId: partner.id,
          error: partnerError.message,
          stack: partnerError.stack
        });
      }
    }

    // 6. payout_run完了記録
    await dbQuery(
      `UPDATE payout_runs SET
         status = 'completed',
         partners_processed = $1,
         partners_succeeded = $2,
         partners_failed = $3,
         total_payout_amount_cents = $4,
         completed_at = now(),
         log = $5,
         updated_at = now()
       WHERE run_id = $6`,
      [
        partnersProcessed,
        partnersSucceeded,
        partnersFailed,
        totalPayoutAmountCents,
        JSON.stringify(logs),
        runId
      ]
    );

    logger.info('Payout batch completed', {
      runId,
      partnersProcessed,
      partnersSucceeded,
      partnersFailed,
      totalPayoutAmountCents
    });

    console.log('=====================================');
    console.log('送金バッチ実行完了');
    console.log(`実行ID: ${runId}`);
    console.log(`処理件数: ${partnersProcessed}`);
    console.log(`成功: ${partnersSucceeded}`);
    console.log(`失敗: ${partnersFailed}`);
    console.log(`総送金額: ${totalPayoutAmountCents.toLocaleString()}円`);
    console.log('=====================================');

    process.exit(0);
  } catch (error) {
    // エラー時はpayout_runを失敗状態に更新
    await dbQuery(
      `UPDATE payout_runs SET
         status = 'failed',
         partners_processed = $1,
         partners_succeeded = $2,
         partners_failed = $3,
         total_payout_amount_cents = $4,
         error_message = $5,
         log = $6,
         updated_at = now()
       WHERE run_id = $7`,
      [
        partnersProcessed,
        partnersSucceeded,
        partnersFailed,
        totalPayoutAmountCents,
        error.message,
        JSON.stringify(logs),
        runId
      ]
    );

    logger.error('Payout batch failed', {
      runId,
      error: error.message,
      stack: error.stack
    });

    console.error('送金バッチ実行エラー:', error.message);
    process.exit(1);
  }
}

// 実行
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

#### 5.2 cron設定

**ファイル**: `crontab` (サーバー上で設定)

```cron
# 毎週月曜日 午前9時に送金バッチを実行
0 9 * * 1 cd /path/to/project && /usr/bin/node scripts/payout-batch.js >> /var/log/payout-batch.log 2>&1
```

---

### Phase 6: 管理API

#### 6.1 Partner残高確認API

**追加先**: `server.js`

```javascript
// 管理者: Partner残高確認
app.get('/admin/partners/:partnerId/balance', requireAdmin, async (req, res, next) => {
  try {
    const { partnerId } = req.params;

    // 1. Partner情報取得
    const partners = await dbQuery(
      `SELECT id, name, stripe_account_id, payouts_enabled, debt_cents
       FROM partners WHERE id = $1`,
      [partnerId]
    );

    if (!partners.length) {
      return res.status(404).json({ error: 'Partner not found' });
    }

    const partner = partners[0];

    // 2. 残高計算
    const balanceRows = await dbQuery(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'available' AND available_at <= now() THEN amount_cents ELSE 0 END), 0)::int AS available_balance,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END), 0)::int AS pending_balance,
         COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_cents ELSE 0 END), 0)::int AS paid_balance
       FROM ledger
       WHERE partner_id = $1`,
      [partnerId]
    );

    const {
      available_balance,
      pending_balance,
      paid_balance
    } = balanceRows[0];

    // 3. 次回送金予定日を計算
    const today = new Date();
    const { isoWeek } = getISOWeek(today);

    let nextPayoutDate = new Date(today);
    // 次の偶数週の月曜日を計算
    while (true) {
      nextPayoutDate.setDate(nextPayoutDate.getDate() + 1);
      const dayOfWeek = nextPayoutDate.getDay();
      const { isoWeek: nextWeek } = getISOWeek(nextPayoutDate);

      if (dayOfWeek === 1 && nextWeek % 2 === 0) {
        break;
      }
    }

    res.json({
      partner: {
        id: partner.id,
        name: partner.name,
        stripeAccountId: partner.stripe_account_id,
        payoutsEnabled: partner.payouts_enabled
      },
      balance: {
        availableBalance: available_balance,
        pendingBalance: pending_balance,
        paidBalance: paid_balance,
        debtCents: partner.debt_cents
      },
      nextPayoutDate: nextPayoutDate.toISOString().split('T')[0]
    });
  } catch (error) {
    next(error);
  }
});

// ISO週番号取得関数（バッチと同じ）
function getISOWeek(date) {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const isoWeek = 1 + Math.ceil((firstThursday - target) / 604800000);
  const isoYear = target.getFullYear();
  return { isoWeek, isoYear };
}
```

---

### Phase 7: Webhook追加（account.updated）

**追加先**: `server.js` の既存webhook内

```javascript
// account.updated イベント処理を追加
case 'account.updated': {
  const account = event.data.object;

  try {
    await syncConnectAccount(account.id);
    logger.info('Stripe Connect account synced via webhook', {
      accountId: account.id
    });
  } catch (syncError) {
    logger.error('Failed to sync account via webhook', {
      accountId: account.id,
      error: syncError.message
    });
  }
  break;
}
```

---

## 環境変数・設定

### 必須環境変数

```.env
# 既存
STRIPE_SECRET_KEY=sk_test_... または sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
DATABASE_URL=postgresql://...

# 新規追加
STRIPE_CONNECT_CLIENT_ID=ca_...  # Stripe ConnectのクライアントID（Dashboard→Connect設定で取得）
APP_ORIGIN=https://yourdomain.com  # 本番環境URL（オンボーディングのリダイレクト先）
```

### Stripe Dashboard設定

1. **Connect設定**
   - Dashboard → Connect → Settings
   - Account type: Express
   - Platform profile: Marketplace または Platform
   - Branding: ロゴ・色設定

2. **Webhook設定**
   - 既存のwebhook endpointに以下を追加:
     - `account.updated`

---

## テスト計画

### 単体テスト項目

1. **台帳計上**
   - ✅ 決済成功時にsale・platform_feeが正しく計上される
   - ✅ 冪等性（同じorder_idで2回呼んでも重複しない）
   - ✅ 手数料計算（6%、最低150円）が正しい

2. **配送完了→available化**
   - ✅ delivery_status='delivered'でavailable_at=+7日が設定される
   - ✅ pending→availableへのステータス遷移

3. **返金処理**
   - ✅ Stripe返金が正しく実行される
   - ✅ ledgerにrefundエントリが作成される
   - ✅ 残高不足時にdebt_centsが増加する
   - ✅ debt>10,000円でpayouts_enabled=falseになる

4. **送金バッチ**
   - ✅ ISO週番号の偶数週のみ実行される
   - ✅ 同日の重複実行が防止される（冪等性）
   - ✅ 3,000円未満はスキップされる
   - ✅ Stripe Payoutが正しく作成される
   - ✅ ledgerのステータスがpaidに更新される

### 統合テスト項目

1. **決済→送金の全フロー**
   - 決済 → 台帳計上 → 配送完了 → available化 → バッチ送金 → Stripe Payout

2. **返金フロー**
   - 決済 → 台帳計上 → 返金 → debt計上 → 出品停止

### Stripe CLI テスト

```bash
# Stripe CLIインストール
brew install stripe/stripe-cli/stripe

# ログイン
stripe login

# ローカルでwebhook転送
stripe listen --forward-to localhost:3000/webhooks/stripe

# テストイベント送信
stripe trigger checkout.session.completed
stripe trigger payment_intent.succeeded
stripe trigger charge.refunded
stripe trigger account.updated
```

### テストデータ作成

```sql
-- テスト用partner作成
INSERT INTO partners (id, name, email, payouts_enabled, stripe_account_id)
VALUES (
  gen_random_uuid(),
  'テスト出品者',
  'test@example.com',
  true,
  'acct_test123'  -- Stripe Connectテストアカウント
);
```

---

## 運用・監視

### ログ監視項目

1. **送金バッチ実行ログ**
   - `/var/log/payout-batch.log`
   - 実行日、処理件数、成功/失敗数、総送金額

2. **Webhook処理ログ**
   - `checkout.session.completed`の台帳計上
   - `account.updated`の同期
   - エラー発生時のスタックトレース

3. **アラート設定**
   - 送金バッチ失敗時
   - 台帳計上エラー時
   - debt>10,000円の出品者発生時

### 管理画面で確認すべき項目

1. **Partner一覧**
   - stripe_account_id
   - payouts_enabled
   - debt_cents
   - 残高（available/pending）

2. **送金履歴**
   - payout_runs テーブルの履歴
   - 各partnerのledgerエントリ

3. **異常検知**
   - debt>10,000円の出品者リスト
   - payouts_enabled=falseの出品者
   - 長期間available状態のまま送金されていない台帳エントリ

---

## まとめ

この実装計画に従うことで、以下が実現されます：

✅ **安全性**: Stripe Connectで本人確認・口座管理を委ね、DBに機密情報を保存しない
✅ **整合性**: Ledger台帳で全ての金額変動を記録し、監査可能
✅ **冪等性**: idempotency_keyで二重計上・二重送金を防止
✅ **自動化**: 隔週月曜バッチで自動送金
✅ **負債管理**: 返金時の相殺・debt管理で運営リスクを低減

**次のステップ**: 各フェーズのコードを順次実装し、ローカル環境→ステージング環境→本番環境の順でデプロイします。

---

**作成者**: Claude (Anthropic)
**レビュー**: 要レビュー
**承認**: 未承認
