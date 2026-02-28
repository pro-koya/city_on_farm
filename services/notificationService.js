// services/notificationService.js
// お知らせ通知の作成ヘルパー

const { dbQuery } = require('./db');
const logger = require('./logger');

/**
 * 通知を作成し、指定ユーザーに配信する
 * @param {Object} params
 * @param {string} params.type - 通知種別 (order, invoice, order_update, payment_update, shipping_update)
 * @param {string} params.title - タイトル
 * @param {string} params.body - 本文
 * @param {string} [params.linkUrl] - リンクURL
 * @param {string[]} params.userIds - 配信対象ユーザーIDの配列
 * @param {string} [params.excludeUserId] - 除外するユーザーID（操作者自身）
 */
async function createNotification({ type, title, body, linkUrl, userIds, excludeUserId }) {
  try {
    if (!userIds || !userIds.length) return null;

    // 操作者自身を除外
    const targetIds = excludeUserId
      ? userIds.filter(id => id !== excludeUserId)
      : userIds;

    if (!targetIds.length) return null;

    // 通知レコード作成
    const rows = await dbQuery(
      `INSERT INTO notifications (type, title, body, link_url, visible_from)
       VALUES ($1, $2, $3, $4, now())
       RETURNING id`,
      [type, title, body, linkUrl || null]
    );

    const notificationId = rows[0]?.id;
    if (!notificationId) return null;

    // 各ユーザーにターゲット登録
    const values = [];
    const params = [];
    for (let i = 0; i < targetIds.length; i++) {
      params.push(notificationId, targetIds[i]);
      values.push(`($${params.length - 1}::uuid, $${params.length}::uuid)`);
    }

    await dbQuery(
      `INSERT INTO notification_targets (notification_id, user_id)
       VALUES ${values.join(',')}
       ON CONFLICT DO NOTHING`,
      params
    );

    logger.info('Notification created', {
      notificationId,
      type,
      targetCount: targetIds.length
    });

    return notificationId;
  } catch (err) {
    // 通知失敗は業務処理に影響させない
    logger.error('Failed to create notification', { type, error: err.message });
    return null;
  }
}

/**
 * パートナーIDから所属ユーザーIDを取得
 */
async function getUserIdsByPartnerId(partnerId) {
  if (!partnerId) return [];
  const rows = await dbQuery(
    `SELECT id FROM users WHERE partner_id = $1::uuid`,
    [partnerId]
  );
  return rows.map(r => r.id);
}

module.exports = {
  createNotification,
  getUserIdsByPartnerId
};
