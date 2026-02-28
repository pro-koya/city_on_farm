-- migrations/012_approval_requests.sql
-- 承認リクエストテーブル: カートから承認申請→承認→注文の新フロー

-- ============================================================
-- 1. approval_requests テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_partner_id UUID NOT NULL REFERENCES partners(id),
  seller_partner_id UUID,
  requester_id UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','ordered','cancelled')),
  current_approval_step INTEGER DEFAULT 1,
  cart_items JSONB NOT NULL,
  subtotal INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_buyer ON approval_requests(buyer_partner_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_requester ON approval_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);

-- ============================================================
-- 2. approval_request_steps テーブル (承認リクエストの各ステップ記録)
-- ============================================================
CREATE TABLE IF NOT EXISTS approval_request_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  approver_id UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  comment TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_request_steps_request ON approval_request_steps(request_id);
CREATE INDEX IF NOT EXISTS idx_approval_request_steps_approver ON approval_request_steps(approver_id);
CREATE INDEX IF NOT EXISTS idx_approval_request_steps_status ON approval_request_steps(status);

-- ============================================================
-- 完了メッセージ
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 012_approval_requests completed!';
  RAISE NOTICE '========================================';
END $$;
