-- ============================================================
-- Stripe Connect 出品者送金システム Migration
-- 作成日: 2025-12-27
-- 説明: Stripe Connectを使った出品者への自動送金機能を実装するための
--       データベーススキーマ拡張
-- ============================================================

BEGIN;

-- ============================================================
-- 1. partnersテーブル拡張
-- ============================================================

-- Stripe Connect関連カラム追加
ALTER TABLE partners ADD COLUMN IF NOT EXISTS
  stripe_account_id TEXT UNIQUE;                    -- Stripe ConnectアカウントID

ALTER TABLE partners ADD COLUMN IF NOT EXISTS
  payouts_enabled BOOLEAN DEFAULT FALSE;            -- 送金可能フラグ

ALTER TABLE partners ADD COLUMN IF NOT EXISTS
  debt_cents INTEGER DEFAULT 0;                     -- 負債額（円単位）

ALTER TABLE partners ADD COLUMN IF NOT EXISTS
  stop_reason TEXT;                                 -- 停止理由

ALTER TABLE partners ADD COLUMN IF NOT EXISTS
  stripe_onboarding_completed BOOLEAN DEFAULT FALSE; -- オンボーディング完了フラグ

ALTER TABLE partners ADD COLUMN IF NOT EXISTS
  stripe_details_submitted BOOLEAN DEFAULT FALSE;   -- KYC完了フラグ

ALTER TABLE partners ADD COLUMN IF NOT EXISTS
  stripe_payouts_enabled BOOLEAN DEFAULT FALSE;     -- Stripe側の送金可能フラグ

ALTER TABLE partners ADD COLUMN IF NOT EXISTS
  stripe_charges_enabled BOOLEAN DEFAULT FALSE;     -- Stripe側の決済可能フラグ

ALTER TABLE partners ADD COLUMN IF NOT EXISTS
  stripe_account_updated_at TIMESTAMP;              -- Stripeアカウント最終更新日時

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_partners_stripe_account
  ON partners(stripe_account_id);

CREATE INDEX IF NOT EXISTS idx_partners_payouts_enabled
  ON partners(payouts_enabled);

CREATE INDEX IF NOT EXISTS idx_partners_debt
  ON partners(debt_cents);

-- コメント追加
COMMENT ON COLUMN partners.stripe_account_id IS 'Stripe ConnectアカウントID（Express）';
COMMENT ON COLUMN partners.payouts_enabled IS '自動送金有効フラグ（trueの場合、隔週月曜に自動送金）';
COMMENT ON COLUMN partners.debt_cents IS '負債額（円単位）。返金等で残高不足の場合に計上';
COMMENT ON COLUMN partners.stop_reason IS '送金停止理由（debt_over_10000 等）';

-- ============================================================
-- 2. ordersテーブル拡張
-- ============================================================

-- Stripe・台帳関連カラム追加
ALTER TABLE orders ADD COLUMN IF NOT EXISTS
  stripe_payment_intent_id TEXT;                    -- Stripe PaymentIntent ID

ALTER TABLE orders ADD COLUMN IF NOT EXISTS
  stripe_charge_id TEXT;                            -- Stripe Charge ID

ALTER TABLE orders ADD COLUMN IF NOT EXISTS
  delivery_completed_at TIMESTAMP;                  -- 配送/受取完了日時

ALTER TABLE orders ADD COLUMN IF NOT EXISTS
  ledger_sale_id UUID;                              -- 売上台帳エントリID

ALTER TABLE orders ADD COLUMN IF NOT EXISTS
  ledger_fee_id UUID;                               -- 手数料台帳エントリID

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_orders_delivery_completed
  ON orders(delivery_completed_at);

CREATE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent
  ON orders(stripe_payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_orders_stripe_charge
  ON orders(stripe_charge_id);

CREATE INDEX IF NOT EXISTS idx_orders_ledger_sale
  ON orders(ledger_sale_id);

-- コメント追加
COMMENT ON COLUMN orders.stripe_payment_intent_id IS 'Stripe PaymentIntent ID（決済識別用）';
COMMENT ON COLUMN orders.stripe_charge_id IS 'Stripe Charge ID（返金時に使用）';
COMMENT ON COLUMN orders.delivery_completed_at IS '配送/受取完了日時（delivery_status=deliveredになった日時）';
COMMENT ON COLUMN orders.ledger_sale_id IS '売上台帳エントリのID（ledger.idを参照）';
COMMENT ON COLUMN orders.ledger_fee_id IS '手数料台帳エントリのID（ledger.idを参照）';

-- ============================================================
-- 3. ledgerテーブル新設（売上台帳）
-- ============================================================

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
    'pending',    -- 猶予期間中（配送完了後7日以内）
    'available',  -- 送金可能
    'paid',       -- 送金済み
    'void'        -- 無効（キャンセル等）
  )),
  available_at TIMESTAMP,  -- 送金可能日時（配送完了日+7日）

  -- Stripe関連ID（トレーサビリティ確保）
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  stripe_refund_id TEXT,
  stripe_transfer_id TEXT,
  stripe_payout_id TEXT,

  -- 冪等性キー（重要！二重計上を防ぐ）
  idempotency_key TEXT UNIQUE NOT NULL,  -- 例: "sale-{order_id}", "refund-{refund_id}"

  -- メタデータ
  metadata JSONB DEFAULT '{}',
  note TEXT,

  -- タイムスタンプ
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),

  -- 金額チェック制約
  CONSTRAINT ledger_amount_check CHECK (
    (type IN ('sale', 'carry_over', 'adjustment') AND amount_cents >= 0) OR
    (type IN ('platform_fee', 'refund', 'payout') AND amount_cents <= 0)
  )
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_ledger_partner_status
  ON ledger(partner_id, status, available_at);

CREATE INDEX IF NOT EXISTS idx_ledger_order
  ON ledger(order_id);

CREATE INDEX IF NOT EXISTS idx_ledger_type
  ON ledger(type);

CREATE INDEX IF NOT EXISTS idx_ledger_idempotency
  ON ledger(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_ledger_stripe_payment_intent
  ON ledger(stripe_payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_ledger_created_at
  ON ledger(created_at DESC);

-- コメント追加
COMMENT ON TABLE ledger IS '出品者売上台帳テーブル。金額の完全なトレーサビリティを確保するため、全ての金額変動を記録';
COMMENT ON COLUMN ledger.idempotency_key IS '二重計上防止用のユニークキー。webhook再実行時も安全';
COMMENT ON COLUMN ledger.amount_cents IS '金額（円単位）: プラス=収入、マイナス=控除';
COMMENT ON COLUMN ledger.available_at IS '送金可能日時（配送完了+7日後に設定される）';
COMMENT ON COLUMN ledger.type IS 'sale:売上, platform_fee:手数料, refund:返金, payout:送金実行, adjustment:調整, carry_over:繰越';
COMMENT ON COLUMN ledger.status IS 'pending:猶予中, available:送金可能, paid:送金済み, void:無効';

-- ============================================================
-- 4. payout_runsテーブル新設（送金バッチ実行記録）
-- ============================================================

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
  total_payout_amount_cents INTEGER DEFAULT 0, -- 総送金額（円）

  -- タイムスタンプ
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- ログ・エラー
  log JSONB DEFAULT '[]',  -- 処理ログ（配列形式）
  error_message TEXT,

  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_payout_runs_date
  ON payout_runs(run_date DESC);

CREATE INDEX IF NOT EXISTS idx_payout_runs_week
  ON payout_runs(iso_year, iso_week);

CREATE INDEX IF NOT EXISTS idx_payout_runs_status
  ON payout_runs(status);

-- コメント追加
COMMENT ON TABLE payout_runs IS '送金バッチ実行履歴テーブル。冪等性と監査のため、全実行を記録';
COMMENT ON COLUMN payout_runs.iso_week IS 'ISO週番号。偶数週のみ実行される（2, 4, 6, ...）';
COMMENT ON COLUMN payout_runs.run_date IS '実行日。UNIQUE制約により同日の重複実行を防止';
COMMENT ON COLUMN payout_runs.log IS '各出品者の処理結果を記録したJSON配列';

COMMIT;

-- ============================================================
-- Migration完了
-- ============================================================

-- 確認クエリ（実行後に手動で確認）
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'partners' AND column_name LIKE 'stripe%';

-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'orders' AND column_name IN ('stripe_payment_intent_id', 'stripe_charge_id', 'delivery_completed_at', 'ledger_sale_id', 'ledger_fee_id');

-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name IN ('ledger', 'payout_runs');
