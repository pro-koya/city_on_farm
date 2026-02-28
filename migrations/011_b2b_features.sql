-- migrations/011_b2b_features.sql
-- B2B機能追加マイグレーション
-- P0: 掛売、リピート注文、注文テンプレート
-- P1: 顧客別価格、組織内ロール、承認ワークフロー、与信管理

-- ============================================================
-- 1. payment_method enum に 'invoice'（掛売）を追加
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'payment_method' AND e.enumlabel = 'invoice'
  ) THEN
    ALTER TYPE payment_method ADD VALUE 'invoice';
    RAISE NOTICE 'Added enum value: payment_method.invoice';
  ELSE
    RAISE NOTICE 'Enum value already exists: payment_method.invoice';
  END IF;
END $$;

-- ============================================================
-- 2. option_labels に invoice の日本語ラベルを追加
-- ============================================================
INSERT INTO option_labels (category, value, label_ja, label_en, sort, active)
VALUES ('payment_method', 'invoice', '掛売（請求書払い）', 'Invoice', 60, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. orders テーブルにB2Bカラムを追加
-- ============================================================

-- 購入者のpartner_id（掛売の月次集計用）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'buyer_partner_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN buyer_partner_id UUID REFERENCES partners(id);
    RAISE NOTICE 'Added column: orders.buyer_partner_id';
  END IF;
END $$;

-- 承認ステータス
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'approval_status'
  ) THEN
    ALTER TABLE orders ADD COLUMN approval_status TEXT DEFAULT 'none'
      CHECK (approval_status IN ('none','pending','approved','rejected'));
    RAISE NOTICE 'Added column: orders.approval_status';
  END IF;
END $$;

-- 現在の承認ステップ番号
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'current_approval_step'
  ) THEN
    ALTER TABLE orders ADD COLUMN current_approval_step INTEGER DEFAULT 0;
    RAISE NOTICE 'Added column: orders.current_approval_step';
  END IF;
END $$;

-- 発注者（承認ワークフロー用: 誰が注文を起票したか）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'submitted_by'
  ) THEN
    ALTER TABLE orders ADD COLUMN submitted_by UUID REFERENCES users(id);
    RAISE NOTICE 'Added column: orders.submitted_by';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_buyer_partner_id ON orders(buyer_partner_id);
CREATE INDEX IF NOT EXISTS idx_orders_approval_status ON orders(approval_status);

-- ============================================================
-- 4. partners テーブルにB2Bカラムを追加
-- ============================================================

-- 承認ワークフロー有効/無効
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'approval_workflow_enabled'
  ) THEN
    ALTER TABLE partners ADD COLUMN approval_workflow_enabled BOOLEAN DEFAULT false;
    RAISE NOTICE 'Added column: partners.approval_workflow_enabled';
  END IF;
END $$;

-- 与信限度額（円）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'credit_limit'
  ) THEN
    ALTER TABLE partners ADD COLUMN credit_limit INTEGER DEFAULT 0;
    RAISE NOTICE 'Added column: partners.credit_limit';
  END IF;
END $$;

-- 与信利用額（円）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'credit_used'
  ) THEN
    ALTER TABLE partners ADD COLUMN credit_used INTEGER DEFAULT 0;
    RAISE NOTICE 'Added column: partners.credit_used';
  END IF;
END $$;

-- 支払条件（日数: 30=翌月末、60=翌々月末）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'payment_terms_days'
  ) THEN
    ALTER TABLE partners ADD COLUMN payment_terms_days INTEGER DEFAULT 30;
    RAISE NOTICE 'Added column: partners.payment_terms_days';
  END IF;
END $$;

-- ============================================================
-- 5. 月次請求書テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS monthly_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  buyer_partner_id UUID NOT NULL REFERENCES partners(id),
  seller_partner_id UUID NOT NULL REFERENCES partners(id),
  year_month TEXT NOT NULL,
  subtotal INTEGER NOT NULL DEFAULT 0,
  tax INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (status IN ('unpaid','partial','paid','void','overdue')),
  due_date DATE NOT NULL,
  paid_amount INTEGER NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  note TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(buyer_partner_id, seller_partner_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_invoices_buyer ON monthly_invoices(buyer_partner_id);
CREATE INDEX IF NOT EXISTS idx_monthly_invoices_seller ON monthly_invoices(seller_partner_id);
CREATE INDEX IF NOT EXISTS idx_monthly_invoices_status ON monthly_invoices(status);
CREATE INDEX IF NOT EXISTS idx_monthly_invoices_year_month ON monthly_invoices(year_month);

-- ============================================================
-- 6. 入金消込テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES monthly_invoices(id),
  amount INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT 'bank_transfer',
  recorded_by UUID REFERENCES users(id),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_records_invoice ON payment_records(invoice_id);

-- ============================================================
-- 7. 注文テンプレートテーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS order_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  partner_id UUID REFERENCES partners(id),
  name TEXT NOT NULL,
  seller_partner_id UUID NOT NULL REFERENCES partners(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES order_templates(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_order_templates_user ON order_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_order_templates_partner ON order_templates(partner_id);
CREATE INDEX IF NOT EXISTS idx_order_template_items_template ON order_template_items(template_id);

-- ============================================================
-- 8. 顧客別価格テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_partner_id UUID NOT NULL REFERENCES partners(id),
  product_id UUID NOT NULL REFERENCES products(id),
  price INTEGER NOT NULL,
  created_by UUID REFERENCES users(id),
  starts_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(buyer_partner_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_prices_buyer ON customer_prices(buyer_partner_id);
CREATE INDEX IF NOT EXISTS idx_customer_prices_product ON customer_prices(product_id);

-- ============================================================
-- 9. 組織内ロールテーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS partner_member_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'orderer'
    CHECK (role IN ('orderer','approver','accountant','org_admin')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(partner_id, user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_partner_member_roles_partner ON partner_member_roles(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_member_roles_user ON partner_member_roles(user_id);

-- ============================================================
-- 10. 承認ワークフローステップテーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS approval_workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id),
  step_order INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('approver','org_admin')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(partner_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_approval_workflow_steps_partner ON approval_workflow_steps(partner_id);

-- ============================================================
-- 11. 注文承認テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS order_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  step_order INTEGER NOT NULL,
  approver_id UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  comment TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_approvals_order ON order_approvals(order_id);
CREATE INDEX IF NOT EXISTS idx_order_approvals_approver ON order_approvals(approver_id);
CREATE INDEX IF NOT EXISTS idx_order_approvals_status ON order_approvals(status);

-- ============================================================
-- 完了メッセージ
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 011_b2b_features completed!';
  RAISE NOTICE 'B2B tables and columns added successfully.';
  RAISE NOTICE '========================================';
END $$;
