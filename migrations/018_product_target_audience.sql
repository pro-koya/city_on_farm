-- 商品の個人向け/法人向け表示出し分け
ALTER TABLE products
  ADD COLUMN for_individual BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN for_corporate  BOOLEAN NOT NULL DEFAULT true;

-- 少なくとも一方はtrueであることを保証
ALTER TABLE products
  ADD CONSTRAINT chk_target_audience CHECK (for_individual OR for_corporate);
