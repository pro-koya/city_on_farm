// services/gardenMemberService.js
// 市民農園メンバーの取得・作成・更新・商品紐付けサービス

const { dbQuery } = require('./db');

/**
 * 農家（partner）のアクティブなメンバー一覧を取得
 */
async function getMembersForPartner(partnerId) {
  if (!partnerId) return [];
  return dbQuery(
    `SELECT id, partner_id, name, intro, icon_url, farming_years, position
     FROM community_garden_members
     WHERE partner_id = $1 AND active = true
     ORDER BY position ASC, created_at ASC`,
    [partnerId]
  );
}

/**
 * 単一メンバーを取得
 */
async function getMember(memberId) {
  if (!memberId) return null;
  const rows = await dbQuery(
    `SELECT id, partner_id, name, intro, icon_url, icon_r2_key, farming_years, position, active, created_at
     FROM community_garden_members
     WHERE id = $1::uuid AND active = true`,
    [memberId]
  );
  return rows[0] || null;
}

/**
 * メンバー作成
 */
async function createMember(partnerId, data) {
  const { name, intro, icon_url, icon_r2_key, farming_years } = data;
  const rows = await dbQuery(
    `INSERT INTO community_garden_members (partner_id, name, intro, icon_url, icon_r2_key, farming_years, position)
     VALUES ($1, $2, $3, $4, $5, $6,
       COALESCE((SELECT MAX(position) + 1 FROM community_garden_members WHERE partner_id = $1 AND active = true), 0))
     RETURNING id`,
    [partnerId, name, intro || '', icon_url || null, icon_r2_key || null, Math.max(0, parseInt(farming_years, 10) || 0)]
  );
  return rows[0];
}

/**
 * メンバー更新（所有権チェック付き）
 */
async function updateMember(memberId, partnerId, data) {
  const { name, intro, icon_url, icon_r2_key, farming_years, icon_changed } = data;
  // icon_changed が true の場合は明示的に値をセット（削除も含む）
  // false の場合は既存値を維持（COALESCE）
  const sql = icon_changed
    ? `UPDATE community_garden_members
       SET name = $3, intro = $4, icon_url = $5, icon_r2_key = $6,
           farming_years = $7, updated_at = now()
       WHERE id = $1::uuid AND partner_id = $2::uuid AND active = true
       RETURNING id`
    : `UPDATE community_garden_members
       SET name = $3, intro = $4, icon_url = COALESCE($5, icon_url), icon_r2_key = COALESCE($6, icon_r2_key),
           farming_years = $7, updated_at = now()
       WHERE id = $1::uuid AND partner_id = $2::uuid AND active = true
       RETURNING id`;
  const rows = await dbQuery(sql,
    [memberId, partnerId, name, intro || '', icon_url || null, icon_r2_key || null, Math.max(0, parseInt(farming_years, 10) || 0)]
  );
  return rows[0] || null;
}

/**
 * メンバーをソフトデリート（所有権チェック付き）
 */
async function deleteMember(memberId, partnerId) {
  const rows = await dbQuery(
    `UPDATE community_garden_members
     SET active = false, updated_at = now()
     WHERE id = $1::uuid AND partner_id = $2::uuid AND active = true
     RETURNING id`,
    [memberId, partnerId]
  );
  return rows[0] || null;
}

/**
 * 商品に紐づくメンバー一覧を取得（商品詳細ページ用）
 */
async function getMembersForProduct(productId) {
  if (!productId) return [];
  return dbQuery(
    `SELECT cgm.id, cgm.name, cgm.intro, cgm.icon_url, cgm.farming_years
     FROM product_garden_members pgm
     JOIN community_garden_members cgm ON cgm.id = pgm.member_id
     WHERE pgm.product_id = $1 AND cgm.active = true
     ORDER BY pgm.position ASC`,
    [productId]
  );
}

/**
 * 商品とメンバーの紐付けを更新（トランザクション対応）
 * DELETE→INSERT パターン（product_tags と同じ）
 * @param {string} partnerId - メンバーの所有権チェック用（省略時はチェックなし）
 */
async function linkMembersToProduct(client, productId, memberIds, partnerId) {
  const query = client ? client.query.bind(client) : async (sql, params) => {
    const rows = await dbQuery(sql, params);
    return { rows };
  };

  // 既存リンクを削除
  await query(
    `DELETE FROM product_garden_members WHERE product_id = $1`,
    [productId]
  );

  // 新しいリンクをバッチ挿入
  if (memberIds && memberIds.length) {
    // 所有権チェック: 指定されたメンバーが自分の partner に属しているか検証
    if (partnerId) {
      const ph = memberIds.map((_, i) => `$${i + 2}`).join(',');
      const check = await query(
        `SELECT id FROM community_garden_members
         WHERE id IN (${ph}) AND partner_id = $1 AND active = true`,
        [partnerId, ...memberIds]
      );
      const validIds = new Set(check.rows.map(r => r.id));
      memberIds = memberIds.filter(id => validIds.has(id));
    }

    if (memberIds.length) {
      const params = [productId];
      const values = memberIds.map((id, i) => {
        params.push(id, i);
        return `($1, $${i * 2 + 2}, $${i * 2 + 3})`;
      }).join(',');
      await query(
        `INSERT INTO product_garden_members (product_id, member_id, position)
         VALUES ${values}
         ON CONFLICT DO NOTHING`,
        params
      );
    }
  }
}

module.exports = {
  getMembersForPartner,
  getMember,
  createMember,
  updateMember,
  deleteMember,
  getMembersForProduct,
  linkMembersToProduct
};
