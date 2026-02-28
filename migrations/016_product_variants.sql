-- 016: 商品バリエーション機能
-- 1つの商品に複数の規格（価格・在庫・単位が異なる）を持たせる

-- ============================================================
-- 1. product_variants テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  price INTEGER NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  stock INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pv_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_pv_product_active ON product_variants(product_id, active);

-- ============================================================
-- 2. products に has_variants フラグ追加
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'has_variants'
  ) THEN
    ALTER TABLE products ADD COLUMN has_variants BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- ============================================================
-- 3. order_items に variant_id 追加
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_items' AND column_name = 'variant_id'
  ) THEN
    ALTER TABLE order_items ADD COLUMN variant_id UUID REFERENCES product_variants(id);
  END IF;
END $$;

-- ============================================================
-- 4. cart_items に variant_id 追加 + ユニーク制約更新
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cart_items' AND column_name = 'variant_id'
  ) THEN
    ALTER TABLE cart_items ADD COLUMN variant_id UUID REFERENCES product_variants(id);
  END IF;
END $$;

-- 旧ユニーク制約を削除して新しいものを作成
ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_cart_id_product_id_key;
DROP INDEX IF EXISTS cart_items_cart_product_variant_uniq;
CREATE UNIQUE INDEX cart_items_cart_product_variant_uniq
  ON cart_items (cart_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'));

-- ============================================================
-- 5. customer_prices に variant_id 追加 + ユニーク制約更新
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_prices' AND column_name = 'variant_id'
  ) THEN
    ALTER TABLE customer_prices ADD COLUMN variant_id UUID REFERENCES product_variants(id);
  END IF;
END $$;

ALTER TABLE customer_prices DROP CONSTRAINT IF EXISTS customer_prices_buyer_partner_id_product_id_key;
DROP INDEX IF EXISTS customer_prices_buyer_product_variant_uniq;
CREATE UNIQUE INDEX customer_prices_buyer_product_variant_uniq
  ON customer_prices (buyer_partner_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'));

-- ============================================================
-- 6. order_template_items に variant_id 追加
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_template_items' AND column_name = 'variant_id'
  ) THEN
    ALTER TABLE order_template_items ADD COLUMN variant_id UUID REFERENCES product_variants(id);
  END IF;
END $$;
