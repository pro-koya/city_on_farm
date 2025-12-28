-- migrations/006_verify_and_add_missing_columns.sql
-- 不足しているカラムを確認して追加するマイグレーション

-- ============================================================
-- partnersテーブルに必要なカラムを追加
-- ============================================================

-- stripe_account_id が存在しない場合は追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'stripe_account_id'
  ) THEN
    ALTER TABLE partners ADD COLUMN stripe_account_id TEXT;
    RAISE NOTICE 'Added column: partners.stripe_account_id';
  ELSE
    RAISE NOTICE 'Column already exists: partners.stripe_account_id';
  END IF;
END $$;

-- stripe_account_type が存在しない場合は追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'stripe_account_type'
  ) THEN
    ALTER TABLE partners ADD COLUMN stripe_account_type TEXT DEFAULT 'express';
    RAISE NOTICE 'Added column: partners.stripe_account_type';
  ELSE
    RAISE NOTICE 'Column already exists: partners.stripe_account_type';
  END IF;
END $$;

-- stripe_charges_enabled が存在しない場合は追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'stripe_charges_enabled'
  ) THEN
    ALTER TABLE partners ADD COLUMN stripe_charges_enabled BOOLEAN DEFAULT false;
    RAISE NOTICE 'Added column: partners.stripe_charges_enabled';
  ELSE
    RAISE NOTICE 'Column already exists: partners.stripe_charges_enabled';
  END IF;
END $$;

-- stripe_payouts_enabled が存在しない場合は追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'stripe_payouts_enabled'
  ) THEN
    ALTER TABLE partners ADD COLUMN stripe_payouts_enabled BOOLEAN DEFAULT false;
    RAISE NOTICE 'Added column: partners.stripe_payouts_enabled';
  ELSE
    RAISE NOTICE 'Column already exists: partners.stripe_payouts_enabled';
  END IF;
END $$;

-- stripe_payouts_enabled_at が存在しない場合は追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'stripe_payouts_enabled_at'
  ) THEN
    ALTER TABLE partners ADD COLUMN stripe_payouts_enabled_at TIMESTAMP;
    RAISE NOTICE 'Added column: partners.stripe_payouts_enabled_at';
  ELSE
    RAISE NOTICE 'Column already exists: partners.stripe_payouts_enabled_at';
  END IF;
END $$;

-- details_submitted が存在しない場合は追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'details_submitted'
  ) THEN
    ALTER TABLE partners ADD COLUMN details_submitted BOOLEAN DEFAULT false;
    RAISE NOTICE 'Added column: partners.details_submitted';
  ELSE
    RAISE NOTICE 'Column already exists: partners.details_submitted';
  END IF;
END $$;

-- charges_enabled が存在しない場合は追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'charges_enabled'
  ) THEN
    ALTER TABLE partners ADD COLUMN charges_enabled BOOLEAN DEFAULT false;
    RAISE NOTICE 'Added column: partners.charges_enabled';
  ELSE
    RAISE NOTICE 'Column already exists: partners.charges_enabled';
  END IF;
END $$;

-- payouts_enabled が存在しない場合は追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'payouts_enabled'
  ) THEN
    ALTER TABLE partners ADD COLUMN payouts_enabled BOOLEAN DEFAULT false;
    RAISE NOTICE 'Added column: partners.payouts_enabled';
  ELSE
    RAISE NOTICE 'Column already exists: partners.payouts_enabled';
  END IF;
END $$;

-- debt_cents が存在しない場合は追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'debt_cents'
  ) THEN
    ALTER TABLE partners ADD COLUMN debt_cents INTEGER DEFAULT 0 NOT NULL;
    RAISE NOTICE 'Added column: partners.debt_cents';
  ELSE
    RAISE NOTICE 'Column already exists: partners.debt_cents';
  END IF;
END $$;

-- stop_reason が存在しない場合は追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'stop_reason'
  ) THEN
    ALTER TABLE partners ADD COLUMN stop_reason TEXT;
    RAISE NOTICE 'Added column: partners.stop_reason';
  ELSE
    RAISE NOTICE 'Column already exists: partners.stop_reason';
  END IF;
END $$;

-- requirements_due_by が存在しない場合は追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'requirements_due_by'
  ) THEN
    ALTER TABLE partners ADD COLUMN requirements_due_by TIMESTAMP;
    RAISE NOTICE 'Added column: partners.requirements_due_by';
  ELSE
    RAISE NOTICE 'Column already exists: partners.requirements_due_by';
  END IF;
END $$;

-- ============================================================
-- ordersテーブルに必要なカラムを追加
-- ============================================================

-- ledger_sale_id が存在しない場合は追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'ledger_sale_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN ledger_sale_id UUID;
    RAISE NOTICE 'Added column: orders.ledger_sale_id';
  ELSE
    RAISE NOTICE 'Column already exists: orders.ledger_sale_id';
  END IF;
END $$;

-- ledger_fee_id が存在しない場合は追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'ledger_fee_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN ledger_fee_id UUID;
    RAISE NOTICE 'Added column: orders.ledger_fee_id';
  ELSE
    RAISE NOTICE 'Column already exists: orders.ledger_fee_id';
  END IF;
END $$;

-- delivery_completed_at が存在しない場合は追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'delivery_completed_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN delivery_completed_at TIMESTAMP;
    RAISE NOTICE 'Added column: orders.delivery_completed_at';
  ELSE
    RAISE NOTICE 'Column already exists: orders.delivery_completed_at';
  END IF;
END $$;

-- stripe_charge_id が存在しない場合は追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'stripe_charge_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN stripe_charge_id TEXT;
    RAISE NOTICE 'Added column: orders.stripe_charge_id';
  ELSE
    RAISE NOTICE 'Column already exists: orders.stripe_charge_id';
  END IF;
END $$;

-- stripe_refund_id が存在しない場合は追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'stripe_refund_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN stripe_refund_id TEXT;
    RAISE NOTICE 'Added column: orders.stripe_refund_id';
  ELSE
    RAISE NOTICE 'Column already exists: orders.stripe_refund_id';
  END IF;
END $$;

-- ============================================================
-- ledgerテーブルを作成（存在しない場合）
-- ============================================================

CREATE TABLE IF NOT EXISTS ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('sale', 'platform_fee', 'refund', 'adjustment', 'payout', 'carry_over')),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'jpy',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'paid', 'void')),
  available_at TIMESTAMP,
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  stripe_refund_id TEXT,
  stripe_payout_id TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- ledgerテーブルのインデックス作成
CREATE INDEX IF NOT EXISTS idx_ledger_partner_id ON ledger(partner_id);
CREATE INDEX IF NOT EXISTS idx_ledger_order_id ON ledger(order_id);
CREATE INDEX IF NOT EXISTS idx_ledger_status ON ledger(status);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger(type);
CREATE INDEX IF NOT EXISTS idx_ledger_available_at ON ledger(available_at);
CREATE INDEX IF NOT EXISTS idx_ledger_stripe_payment_intent_id ON ledger(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_ledger_stripe_payout_id ON ledger(stripe_payout_id);

-- ============================================================
-- payout_runsテーブルを作成（存在しない場合）
-- ============================================================

CREATE TABLE IF NOT EXISTS payout_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iso_week INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  total_partners INTEGER DEFAULT 0,
  successful_payouts INTEGER DEFAULT 0,
  failed_payouts INTEGER DEFAULT 0,
  total_amount_cents INTEGER DEFAULT 0,
  error_message TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT now(),
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- payout_runsテーブルのインデックス作成
CREATE INDEX IF NOT EXISTS idx_payout_runs_iso_week ON payout_runs(iso_week);
CREATE INDEX IF NOT EXISTS idx_payout_runs_status ON payout_runs(status);
CREATE INDEX IF NOT EXISTS idx_payout_runs_created_at ON payout_runs(created_at DESC);

-- ============================================================
-- 完了メッセージ
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration completed successfully!';
  RAISE NOTICE 'All required columns have been verified and added.';
  RAISE NOTICE '========================================';
END $$;

-- ============================================================
-- 確認クエリ: partnersテーブルのStripe関連カラム一覧
-- ============================================================

SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'partners'
  AND column_name IN (
    'stripe_account_id',
    'stripe_account_type',
    'stripe_charges_enabled',
    'stripe_payouts_enabled',
    'stripe_payouts_enabled_at',
    'details_submitted',
    'charges_enabled',
    'payouts_enabled',
    'debt_cents',
    'stop_reason',
    'requirements_due_by'
  )
ORDER BY column_name;
