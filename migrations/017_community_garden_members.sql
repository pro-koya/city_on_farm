-- 017: 市民農園メンバー機能
-- 農家（partner）に紐づく市民農園メンバーのマスタデータと、
-- 商品との多対多リレーションを管理する

-- ============================================================
-- 1. community_garden_members テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS community_garden_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  intro TEXT NOT NULL DEFAULT '',
  icon_url TEXT,
  icon_r2_key TEXT,
  farming_years INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cgm_partner ON community_garden_members(partner_id);
CREATE INDEX IF NOT EXISTS idx_cgm_partner_active ON community_garden_members(partner_id, active);

-- ============================================================
-- 2. product_garden_members 中間テーブル（商品×市民農園メンバー）
-- ============================================================
CREATE TABLE IF NOT EXISTS product_garden_members (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES community_garden_members(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_pgm_product ON product_garden_members(product_id);
CREATE INDEX IF NOT EXISTS idx_pgm_member ON product_garden_members(member_id);
