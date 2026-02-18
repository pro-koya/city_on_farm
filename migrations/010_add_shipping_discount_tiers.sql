-- 出品者ごとの送料割引（購入金額に応じた割引率）を設定するテーブル
-- 例: 3000円以上で送料50%割引、5000円以上で送料無料
CREATE TABLE IF NOT EXISTS seller_shipping_discount_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  threshold_min INT NOT NULL,       -- 購入金額（円）のしきい値（この金額以上で適用）
  discount_percent INT NOT NULL DEFAULT 0,  -- 送料の割引率 0-100（100=無料）
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_discount_pct CHECK (discount_percent >= 0 AND discount_percent <= 100),
  CONSTRAINT chk_threshold CHECK (threshold_min >= 0)
);

CREATE INDEX IF NOT EXISTS idx_shipping_discount_tiers_seller
  ON seller_shipping_discount_tiers(seller_id);

COMMENT ON TABLE seller_shipping_discount_tiers IS '購入金額に応じた送料割引率。例: 3000円以上50%割引、5000円以上100%無料';
