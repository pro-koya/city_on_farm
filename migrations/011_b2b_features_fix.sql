-- migrations/011_b2b_features_fix.sql
-- 本番DB用: 011_b2b_features.sql で転送時破損により失敗した項目の修正
-- ローカルDBでは全項目適用済みのため、本番専用

-- ============================================================
-- 1. option_labels に invoice の日本語ラベルを追加
-- ============================================================
INSERT INTO option_labels (category, value, label_ja, label_en, sort, active)
VALUES ('payment_method', 'invoice', '掛売（請求書払い）', 'Invoice', 60, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. orders.buyer_partner_id カラム追加
-- ============================================================
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

-- ============================================================
-- 3. orders.current_approval_step カラム追加
-- ============================================================
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

-- ============================================================
-- 4. orders インデックス
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orders_buyer_partner_id ON orders(buyer_partner_id);

-- ============================================================
-- 5. partners.approval_workflow_enabled カラム追加
-- ============================================================
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

-- ============================================================
-- 6. partners.payment_terms_days カラム追加
-- ============================================================
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
-- 7. monthly_invoices buyer インデックス
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_monthly_invoices_buyer ON monthly_invoices(buyer_partner_id);

-- ============================================================
-- 8. partner_member_roles テーブル + インデックス
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
-- 9. orders.approval_status カラム追加
-- ============================================================
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

CREATE INDEX IF NOT EXISTS idx_orders_approval_status ON orders(approval_status);

-- ============================================================
-- 10. orders.submitted_by カラム追加
-- ============================================================
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

-- ============================================================
-- 11. approval_workflow_steps テーブル
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
-- 12. order_approvals テーブル
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
  RAISE NOTICE 'Migration 011_b2b_features_fix completed!';
  RAISE NOTICE 'All missing B2B items applied successfully.';
  RAISE NOTICE '========================================';
END $$;
