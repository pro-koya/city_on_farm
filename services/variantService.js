// services/variantService.js
// 商品バリエーションの取得・作成・更新サービス

const { dbQuery } = require('./db');

/**
 * 商品のアクティブなバリエーション一覧を取得
 */
async function getVariantsForProduct(productId) {
  if (!productId) return [];
  return dbQuery(
    `SELECT id, label, price, unit, stock, position, active
     FROM product_variants
     WHERE product_id = $1 AND active = true
     ORDER BY position ASC, created_at ASC`,
    [productId]
  );
}

/**
 * 単一バリエーションを取得（product_id チェック付き）
 */
async function getVariant(variantId, productId) {
  if (!variantId) return null;
  const rows = await dbQuery(
    `SELECT id, product_id, label, price, unit, stock, position, active
     FROM product_variants
     WHERE id = $1::uuid AND product_id = $2::uuid`,
    [variantId, productId]
  );
  return rows[0] || null;
}

/**
 * バリエーションの一括作成・更新
 * @param {object} client - トランザクション用 DB クライアント（なければ dbQuery を使用）
 * @param {string} productId
 * @param {Array} variantsData - [{ id?, label, price, unit, stock }]
 */
async function upsertVariants(client, productId, variantsData) {
  const query = client ? client.query.bind(client) : async (sql, params) => {
    const rows = await dbQuery(sql, params);
    return { rows };
  };

  const existingIds = variantsData
    .filter(v => v.id)
    .map(v => v.id);

  // 送信されなかったバリエーションを無効化
  if (existingIds.length) {
    const ph = existingIds.map((_, i) => `$${i + 2}`).join(',');
    await query(
      `UPDATE product_variants SET active = false, updated_at = now()
       WHERE product_id = $1 AND id NOT IN (${ph})`,
      [productId, ...existingIds]
    );
  } else {
    await query(
      `UPDATE product_variants SET active = false, updated_at = now()
       WHERE product_id = $1`,
      [productId]
    );
  }

  // 各バリエーションを UPSERT
  for (let i = 0; i < variantsData.length; i++) {
    const v = variantsData[i];
    const price = parseInt(v.price, 10) || 0;
    const stock = parseInt(v.stock, 10) || 0;
    if (v.id) {
      await query(
        `UPDATE product_variants
         SET label = $2, price = $3, unit = $4, stock = $5,
             position = $6, active = true, updated_at = now()
         WHERE id = $1::uuid`,
        [v.id, v.label, price, v.unit || '', stock, i]
      );
    } else {
      await query(
        `INSERT INTO product_variants (product_id, label, price, unit, stock, position)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [productId, v.label, price, v.unit || '', stock, i]
      );
    }
  }
}

/**
 * 商品のバリエーションから products テーブルの表示用 price/stock を同期
 * price = 最小価格（一覧で「¥100〜」表示用）
 * stock = 全バリエーションの在庫合計
 */
async function syncProductDisplayValues(client, productId) {
  const query = client ? client.query.bind(client) : async (sql, params) => {
    const rows = await dbQuery(sql, params);
    return { rows };
  };

  await query(
    `UPDATE products SET
       price = COALESCE((SELECT MIN(price) FROM product_variants WHERE product_id = $1 AND active = true), price),
       stock = COALESCE((SELECT SUM(stock) FROM product_variants WHERE product_id = $1 AND active = true), 0),
       updated_at = now()
     WHERE id = $1 AND has_variants = true`,
    [productId]
  );
}

module.exports = {
  getVariantsForProduct,
  getVariant,
  upsertVariants,
  syncProductDisplayValues
};
