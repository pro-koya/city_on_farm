// services/creditService.js
// 与信管理（credit limit / usage）

const { dbQuery } = require('./db');
const logger = require('./logger');

/**
 * 与信状況を取得
 */
async function getCreditStatus(partnerId) {
  const rows = await dbQuery(
    `SELECT credit_limit, credit_used, payment_terms_days FROM partners WHERE id = $1`,
    [partnerId]
  );
  if (!rows.length) return null;
  const { credit_limit, credit_used, payment_terms_days } = rows[0];
  return {
    limit: credit_limit || 0,
    used: credit_used || 0,
    remaining: (credit_limit || 0) - (credit_used || 0),
    paymentTermsDays: payment_terms_days || 30
  };
}

/**
 * 注文額が与信枠内か確認
 */
async function checkCreditAvailable(partnerId, amount) {
  const status = await getCreditStatus(partnerId);
  if (!status) return { available: true, reason: null };
  if (status.limit <= 0) return { available: true, reason: null }; // 与信限度なし = 無制限
  if (status.remaining >= amount) return { available: true, reason: null };
  return {
    available: false,
    reason: `与信残高が不足しています（残高: ¥${status.remaining.toLocaleString()}、注文額: ¥${amount.toLocaleString()}）`
  };
}

/**
 * 与信利用額を加算（注文確定時）
 */
async function addCreditUsage(partnerId, amount) {
  await dbQuery(
    `UPDATE partners SET credit_used = COALESCE(credit_used, 0) + $1 WHERE id = $2`,
    [amount, partnerId]
  );
  logger.info('Credit usage added', { partnerId, amount });
}

/**
 * 与信利用額を減算（入金消込時）
 */
async function releaseCreditUsage(partnerId, amount) {
  await dbQuery(
    `UPDATE partners SET credit_used = GREATEST(0, COALESCE(credit_used, 0) - $1) WHERE id = $2`,
    [amount, partnerId]
  );
  logger.info('Credit usage released', { partnerId, amount });
}

/**
 * 管理者が与信限度額を変更
 */
async function updateCreditLimit(partnerId, limit) {
  await dbQuery(
    `UPDATE partners SET credit_limit = $1 WHERE id = $2`,
    [limit, partnerId]
  );
  logger.info('Credit limit updated', { partnerId, limit });
}

module.exports = {
  getCreditStatus,
  checkCreditAvailable,
  addCreditUsage,
  releaseCreditUsage,
  updateCreditLimit
};
