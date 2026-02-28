// services/customerPriceService.js
// 顧客別価格の取得・設定・一括適用

const { dbQuery } = require('./db');
const logger = require('./logger');

/**
 * 特定の購入者・商品（+バリエーション）の顧客別価格を取得
 * @returns {number|null} カスタム価格 or null（標準価格を使用）
 */
async function getCustomerPrice(buyerPartnerId, productId, variantId = null) {
  if (!buyerPartnerId || !productId) return null;
  const rows = await dbQuery(
    `SELECT price FROM customer_prices
     WHERE buyer_partner_id = $1 AND product_id = $2
       AND variant_id IS NOT DISTINCT FROM $3
       AND (starts_at IS NULL OR starts_at <= now())
       AND (expires_at IS NULL OR expires_at > now())
     LIMIT 1`,
    [buyerPartnerId, productId, variantId]
  );
  return rows[0]?.price ?? null;
}

/**
 * 特定取引先の全カスタム価格一覧（seller側から見た場合）
 */
async function getCustomerPricesForPartner(buyerPartnerId, sellerPartnerId) {
  const rows = await dbQuery(
    `SELECT cp.id, cp.product_id, cp.variant_id, cp.price, cp.starts_at, cp.expires_at,
            p.title AS product_title, p.price AS standard_price, p.unit, p.has_variants,
            pv.label AS variant_label, pv.price AS variant_standard_price, pv.unit AS variant_unit,
            (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position LIMIT 1) AS image_url
     FROM customer_prices cp
     JOIN products p ON p.id = cp.product_id
     JOIN users u ON u.id = p.seller_id
     LEFT JOIN product_variants pv ON pv.id = cp.variant_id
     WHERE cp.buyer_partner_id = $1
       AND u.partner_id = $2
     ORDER BY p.title ASC, pv.position ASC NULLS FIRST`,
    [buyerPartnerId, sellerPartnerId]
  );
  return rows;
}

/**
 * 顧客別価格を設定（UPSERT）
 */
async function setCustomerPrice(buyerPartnerId, productId, price, userId, startsAt, expiresAt, variantId = null) {
  const rows = await dbQuery(
    `INSERT INTO customer_prices (buyer_partner_id, product_id, variant_id, price, created_by, starts_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (buyer_partner_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'))
     DO UPDATE SET price = $4, created_by = $5, starts_at = $6, expires_at = $7, updated_at = now()
     RETURNING id`,
    [buyerPartnerId, productId, variantId, price, userId, startsAt || null, expiresAt || null]
  );
  logger.info('Customer price set', { buyerPartnerId, productId, variantId, price });
  return rows[0];
}

/**
 * 顧客別価格を削除
 */
async function deleteCustomerPrice(priceId) {
  await dbQuery(`DELETE FROM customer_prices WHERE id = $1`, [priceId]);
}

/**
 * 商品リストに顧客別価格を一括適用
 * バリエーション対応: variant_id 付きの価格を優先、フォールバックとして商品単位の価格も適用
 * @param {Array} items - 商品配列（price, variant_id プロパティを持つ）
 * @param {string} buyerPartnerId - 購入者のpartner_id
 * @returns {Array} customerPrice プロパティが追加された配列
 */
async function applyCustomerPricing(items, buyerPartnerId) {
  if (!buyerPartnerId || !items?.length) return items;

  const productIds = items.map(it => it.id || it.product_id).filter(Boolean);
  if (!productIds.length) return items;

  const ph = productIds.map((_, i) => `$${i + 2}`).join(',');
  const rows = await dbQuery(
    `SELECT product_id, variant_id, price FROM customer_prices
     WHERE buyer_partner_id = $1
       AND product_id IN (${ph})
       AND (starts_at IS NULL OR starts_at <= now())
       AND (expires_at IS NULL OR expires_at > now())`,
    [buyerPartnerId, ...productIds]
  );

  // キー: "product_id|variant_id_or_empty"
  const priceMap = new Map(rows.map(r => [
    `${r.product_id}|${r.variant_id || ''}`,
    r.price
  ]));

  return items.map(it => {
    const pid = it.id || it.product_id;
    const vid = it.variant_id || '';
    // バリエーション別価格を優先、なければ商品単位の価格をフォールバック
    const cp = priceMap.get(`${pid}|${vid}`) ?? (vid ? priceMap.get(`${pid}|`) : undefined) ?? undefined;
    return cp != null
      ? { ...it, standardPrice: it.price, price: cp, hasCustomerPrice: true }
      : { ...it, hasCustomerPrice: false };
  });
}

module.exports = {
  getCustomerPrice,
  getCustomerPricesForPartner,
  setCustomerPrice,
  deleteCustomerPrice,
  applyCustomerPricing
};
