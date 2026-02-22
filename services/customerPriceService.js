// services/customerPriceService.js
// 顧客別価格の取得・設定・一括適用

const { dbQuery } = require('./db');
const logger = require('./logger');

/**
 * 特定の購入者・商品の顧客別価格を取得
 * @returns {number|null} カスタム価格 or null（標準価格を使用）
 */
async function getCustomerPrice(buyerPartnerId, productId) {
  if (!buyerPartnerId || !productId) return null;
  const rows = await dbQuery(
    `SELECT price FROM customer_prices
     WHERE buyer_partner_id = $1 AND product_id = $2
       AND (starts_at IS NULL OR starts_at <= now())
       AND (expires_at IS NULL OR expires_at > now())
     LIMIT 1`,
    [buyerPartnerId, productId]
  );
  return rows[0]?.price ?? null;
}

/**
 * 特定取引先の全カスタム価格一覧（seller側から見た場合）
 */
async function getCustomerPricesForPartner(buyerPartnerId, sellerPartnerId) {
  const rows = await dbQuery(
    `SELECT cp.id, cp.product_id, cp.price, cp.starts_at, cp.expires_at,
            p.title AS product_title, p.price AS standard_price, p.unit,
            (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position LIMIT 1) AS image_url
     FROM customer_prices cp
     JOIN products p ON p.id = cp.product_id
     WHERE cp.buyer_partner_id = $1
       AND p.seller_id = $2
     ORDER BY p.title ASC`,
    [buyerPartnerId, sellerPartnerId]
  );
  return rows;
}

/**
 * 顧客別価格を設定（UPSERT）
 */
async function setCustomerPrice(buyerPartnerId, productId, price, userId, startsAt, expiresAt) {
  const rows = await dbQuery(
    `INSERT INTO customer_prices (buyer_partner_id, product_id, price, created_by, starts_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (buyer_partner_id, product_id)
     DO UPDATE SET price = $3, created_by = $4, starts_at = $5, expires_at = $6, updated_at = now()
     RETURNING id`,
    [buyerPartnerId, productId, price, userId, startsAt || null, expiresAt || null]
  );
  logger.info('Customer price set', { buyerPartnerId, productId, price });
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
 * @param {Array} items - 商品配列（price プロパティを持つ）
 * @param {string} buyerPartnerId - 購入者のpartner_id
 * @returns {Array} customerPrice プロパティが追加された配列
 */
async function applyCustomerPricing(items, buyerPartnerId) {
  if (!buyerPartnerId || !items?.length) return items;

  const productIds = items.map(it => it.id || it.product_id).filter(Boolean);
  if (!productIds.length) return items;

  const ph = productIds.map((_, i) => `$${i + 2}`).join(',');
  const rows = await dbQuery(
    `SELECT product_id, price FROM customer_prices
     WHERE buyer_partner_id = $1
       AND product_id IN (${ph})
       AND (starts_at IS NULL OR starts_at <= now())
       AND (expires_at IS NULL OR expires_at > now())`,
    [buyerPartnerId, ...productIds]
  );

  const priceMap = new Map(rows.map(r => [r.product_id, r.price]));

  return items.map(it => {
    const pid = it.id || it.product_id;
    const cp = priceMap.get(pid);
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
