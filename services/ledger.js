// services/ledger.js
// 台帳（Ledger）管理サービスモジュール
// 出品者への売上計上・手数料計算・送金可能化を管理

const { dbQuery } = require('./db');
const logger = require('./logger');

/**
 * プラットフォーム手数料を計算
 * 6%（税込）、最低150円
 *
 * @param {number} totalCents - 注文総額（円）
 * @returns {number} 手数料（円）
 */
function calculatePlatformFee(totalCents) {
  const feeRate = 0.06; // 6%
  const minFee = 150;   // 最低150円

  const calculatedFee = Math.round(totalCents * feeRate);
  return Math.max(calculatedFee, minFee);
}

/**
 * 決済成功時の台帳計上
 * 売上（sale）と手数料（platform_fee）のエントリを作成
 *
 * @param {object} order - 注文オブジェクト
 * @param {string} paymentIntentId - Stripe PaymentIntent ID
 * @param {string} chargeId - Stripe Charge ID
 */
async function recordSaleAndFee(order, paymentIntentId, chargeId) {
  const { id: orderId, total, seller_id } = order;

  try {
    // ★ seller_id は既に partner_id として保存されている
    // ordersテーブルのseller_idにはpartner_id（パートナー組織のID）が入っている
    const partnerId = seller_id;

    if (!partnerId) {
      logger.warn('Partner ID not found in order', {
        orderId
      });
      return;
    }

    // partner_idの存在確認
    const partners = await dbQuery(
      'SELECT id, name FROM partners WHERE id = $1',
      [partnerId]
    );

    if (!partners.length) {
      logger.warn('Partner not found', {
        orderId,
        partnerId
      });
      return;
    }
    const totalCents = total; // ordersテーブルのtotalは既に円単位
    const feeCents = calculatePlatformFee(totalCents);

    // 冪等性キー
    const saleIdempotencyKey = `sale-${orderId}`;
    const feeIdempotencyKey = `platform_fee-${orderId}`;

    logger.info('Recording sale and fee in ledger', {
      orderId,
      partnerId,
      totalCents,
      feeCents,
      paymentIntentId
    });

    // トランザクション開始
    await dbQuery('BEGIN');

    // 1. 売上エントリ作成（+total）
    const saleResult = await dbQuery(
      `INSERT INTO ledger (
         partner_id, order_id, type, amount_cents, currency,
         status, stripe_payment_intent_id, stripe_charge_id,
         idempotency_key, note
       ) VALUES ($1, $2, 'sale', $3, 'jpy', 'pending', $4, $5, $6, $7)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        partnerId,
        orderId,
        totalCents,
        paymentIntentId,
        chargeId,
        saleIdempotencyKey,
        `決済成功による売上計上 (注文ID: ${orderId})`
      ]
    );

    // 2. 手数料エントリ作成（-fee）
    const feeResult = await dbQuery(
      `INSERT INTO ledger (
         partner_id, order_id, type, amount_cents, currency,
         status, stripe_payment_intent_id, stripe_charge_id,
         idempotency_key, note
       ) VALUES ($1, $2, 'platform_fee', $3, 'jpy', 'pending', $4, $5, $6, $7)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        partnerId,
        orderId,
        -feeCents, // マイナス値
        paymentIntentId,
        chargeId,
        feeIdempotencyKey,
        `プラットフォーム手数料 6% (最低150円)`
      ]
    );

    // 3. ordersテーブルに台帳IDを保存
    if (saleResult.length && feeResult.length) {
      await dbQuery(
        `UPDATE orders SET
           ledger_sale_id = $1,
           ledger_fee_id = $2,
           stripe_payment_intent_id = $3,
           stripe_charge_id = $4,
           updated_at = now()
         WHERE id = $5`,
        [
          saleResult[0].id,
          feeResult[0].id,
          paymentIntentId,
          chargeId,
          orderId
        ]
      );

      logger.info('Sale and fee recorded in ledger successfully', {
        orderId,
        partnerId,
        totalCents,
        feeCents,
        saleId: saleResult[0].id,
        feeId: feeResult[0].id
      });
    } else {
      logger.info('Sale and fee already recorded (idempotency)', {
        orderId,
        saleExists: saleResult.length === 0,
        feeExists: feeResult.length === 0
      });
    }

    await dbQuery('COMMIT');
  } catch (error) {
    await dbQuery('ROLLBACK');
    logger.error('Failed to record sale and fee', {
      orderId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * 配送完了時の台帳available化
 * delivery_completed_at + 7日後に送金可能状態にする
 *
 * @param {string} orderId - 注文ID
 */
async function markLedgerAvailable(orderId) {
  try {
    const orders = await dbQuery(
      `SELECT id, delivery_completed_at, ledger_sale_id, ledger_fee_id
       FROM orders WHERE id = $1`,
      [orderId]
    );

    const order = orders[0];
    if (!order) {
      throw new Error('Order not found');
    }

    if (!order.ledger_sale_id && !order.ledger_fee_id) {
      logger.warn('No ledger entries found for order', { orderId });
      return;
    }

    const deliveryCompletedAt = order.delivery_completed_at || new Date();
    const availableAt = new Date(deliveryCompletedAt);
    availableAt.setDate(availableAt.getDate() + 7); // +7日

    logger.info('Marking ledger as available', {
      orderId,
      deliveryCompletedAt,
      availableAt
    });

    await dbQuery('BEGIN');

    // sale と platform_fee の両方を available に更新
    if (order.ledger_sale_id) {
      await dbQuery(
        `UPDATE ledger SET
           status = 'available',
           available_at = $1,
           updated_at = now()
         WHERE id = $2 AND status = 'pending'`,
        [availableAt, order.ledger_sale_id]
      );
    }

    if (order.ledger_fee_id) {
      await dbQuery(
        `UPDATE ledger SET
           status = 'available',
           available_at = $1,
           updated_at = now()
         WHERE id = $2 AND status = 'pending'`,
        [availableAt, order.ledger_fee_id]
      );
    }

    await dbQuery('COMMIT');

    logger.info('Ledger marked as available successfully', {
      orderId,
      availableAt: availableAt.toISOString()
    });
  } catch (error) {
    await dbQuery('ROLLBACK');
    logger.error('Failed to mark ledger available', {
      orderId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * 出品者の残高を取得
 *
 * @param {string} partnerId - 出品者ID
 * @returns {Promise<object>} 残高情報
 */
async function getPartnerBalance(partnerId) {
  try {
    const balanceRows = await dbQuery(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'available' AND available_at <= now() THEN amount_cents ELSE 0 END), 0)::int AS available_balance,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END), 0)::int AS pending_balance,
         COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_cents ELSE 0 END), 0)::int AS paid_balance,
         COALESCE(SUM(amount_cents), 0)::int AS total_balance
       FROM ledger
       WHERE partner_id = $1`,
      [partnerId]
    );

    const balance = balanceRows[0];

    logger.info('Partner balance retrieved', {
      partnerId,
      availableBalance: balance.available_balance,
      pendingBalance: balance.pending_balance
    });

    return {
      partnerId,
      availableBalance: balance.available_balance,
      pendingBalance: balance.pending_balance,
      paidBalance: balance.paid_balance,
      totalBalance: balance.total_balance
    };
  } catch (error) {
    logger.error('Failed to get partner balance', {
      partnerId,
      error: error.message
    });
    throw error;
  }
}

/**
 * 台帳エントリの一覧を取得
 *
 * @param {string} partnerId - 出品者ID
 * @param {object} options - オプション（limit, offset, status）
 * @returns {Promise<Array>} 台帳エントリ一覧
 */
async function getLedgerEntries(partnerId, options = {}) {
  try {
    const { limit = 50, offset = 0, status = null } = options;

    let query = `
      SELECT
        l.id, l.type, l.amount_cents, l.currency, l.status,
        l.available_at, l.note, l.created_at,
        l.stripe_payment_intent_id, l.stripe_charge_id,
        l.stripe_refund_id, l.stripe_payout_id,
        o.order_number, o.total AS order_total, o.id AS order_id
      FROM ledger l
      LEFT JOIN orders o ON o.id = l.order_id
      WHERE l.partner_id = $1
    `;

    const params = [partnerId];
    let paramIndex = 2;

    if (status) {
      query += ` AND l.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY l.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const entries = await dbQuery(query, params);

    logger.info('Ledger entries retrieved', {
      partnerId,
      count: entries.length,
      status
    });

    return entries;
  } catch (error) {
    logger.error('Failed to get ledger entries', {
      partnerId,
      error: error.message
    });
    throw error;
  }
}

/**
 * 配送完了日時を記録し、台帳をavailableに更新
 * delivery_statusが'delivered'になったときに呼び出される
 *
 * @param {string} orderId - 注文ID
 */
async function recordDeliveryCompletedAndMarkAvailable(orderId) {
  try {
    await dbQuery('BEGIN');

    // 1. delivery_completed_at を記録
    const updateResult = await dbQuery(
      `UPDATE orders SET
         delivery_completed_at = now(),
         updated_at = now()
       WHERE id = $1 AND delivery_completed_at IS NULL
       RETURNING id, delivery_completed_at`,
      [orderId]
    );

    if (updateResult.length === 0) {
      // 既に記録済み
      logger.info('Delivery completed already recorded', { orderId });
      await dbQuery('COMMIT');
      return;
    }

    logger.info('Delivery completed recorded', {
      orderId,
      deliveryCompletedAt: updateResult[0].delivery_completed_at
    });

    // 2. 台帳をavailableに更新
    await markLedgerAvailable(orderId);

    await dbQuery('COMMIT');
  } catch (error) {
    await dbQuery('ROLLBACK');
    logger.error('Failed to record delivery completed', {
      orderId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

module.exports = {
  calculatePlatformFee,
  recordSaleAndFee,
  markLedgerAvailable,
  getPartnerBalance,
  getLedgerEntries,
  recordDeliveryCompletedAndMarkAvailable
};
