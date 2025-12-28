// services/refund.js
// 返金処理サービスモジュール
// Stripe返金、台帳計上、負債管理、出品停止ロジックを管理

const stripe = require('../lib/stripe');
const { dbQuery } = require('./db');
const logger = require('./logger');

/**
 * 返金実行
 * Stripe返金を実行し、台帳に記録、出品者残高から差し引く
 * 残高不足の場合は負債（debt）として計上し、10,000円超で出品停止
 *
 * @param {string} orderId - 注文ID
 * @param {number} refundAmountCents - 返金額（円）
 * @param {string} reason - 返金理由
 * @param {string} adminUserId - 実行者（管理者）のユーザーID
 * @returns {Promise<object>} 返金結果
 */
async function processRefund(orderId, refundAmountCents, reason, adminUserId) {
  try {
    logger.info('Starting refund process', {
      orderId,
      refundAmountCents,
      reason,
      adminUserId
    });

    await dbQuery('BEGIN');

    // 1. 注文情報取得
    const orders = await dbQuery(
      `SELECT o.id, o.total, o.stripe_payment_intent_id, o.stripe_charge_id,
              o.seller_id, u.partner_id
       FROM orders o
       JOIN users u ON u.id = o.seller_id
       WHERE o.id = $1`,
      [orderId]
    );

    const order = orders[0];
    if (!order) {
      throw new Error('Order not found');
    }

    if (!order.partner_id) {
      throw new Error('Partner not found for order');
    }

    const partnerId = order.partner_id;

    // 2. Stripe返金実行（Stripe手数料は返金額に含めない）
    let stripeRefund;
    if (order.stripe_payment_intent_id) {
      logger.info('Creating Stripe refund', {
        orderId,
        paymentIntentId: order.stripe_payment_intent_id,
        amount: refundAmountCents
      });

      stripeRefund = await stripe.refunds.create({
        payment_intent: order.stripe_payment_intent_id,
        amount: refundAmountCents, // 円単位
        reason: 'requested_by_customer', // または 'fraudulent', 'duplicate'
        metadata: {
          order_id: orderId,
          refund_reason: reason,
          admin_user_id: adminUserId
        }
      });

      logger.info('Stripe refund created successfully', {
        orderId,
        refundId: stripeRefund.id,
        amount: refundAmountCents
      });
    } else {
      throw new Error('No Stripe payment intent found for order');
    }

    // 3. 台帳に返金エントリ作成（マイナス値）
    const idempotencyKey = `refund-${stripeRefund.id}`;
    const refundLedgerResult = await dbQuery(
      `INSERT INTO ledger (
         partner_id, order_id, type, amount_cents, currency,
         status, available_at, stripe_refund_id, idempotency_key, note
       ) VALUES ($1, $2, 'refund', $3, 'jpy', 'available', now(), $4, $5, $6)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        partnerId,
        orderId,
        -refundAmountCents, // マイナス値
        stripeRefund.id,
        idempotencyKey,
        `返金処理: ${reason}`
      ]
    );

    logger.info('Refund ledger entry created', {
      orderId,
      refundId: stripeRefund.id,
      ledgerId: refundLedgerResult[0]?.id
    });

    // 4. 出品者の未送金残高を計算
    const balanceRows = await dbQuery(
      `SELECT COALESCE(SUM(amount_cents), 0)::int AS balance
       FROM ledger
       WHERE partner_id = $1
         AND status IN ('available', 'pending')`,
      [partnerId]
    );

    const availableBalance = balanceRows[0].balance;

    logger.info('Partner balance calculated after refund', {
      partnerId,
      availableBalance
    });

    // 5. 残高がマイナス（不足）なら debt に計上
    if (availableBalance < 0) {
      const debtAmount = Math.abs(availableBalance);

      logger.warn('Partner has negative balance, recording debt', {
        partnerId,
        debtAmount
      });

      await dbQuery(
        `UPDATE partners SET
           debt_cents = $1,
           updated_at = now()
         WHERE id = $2`,
        [debtAmount, partnerId]
      );

      // 6. debt が 10,000円超なら出品停止
      if (debtAmount > 10000) {
        await dbQuery(
          `UPDATE partners SET
             payouts_enabled = false,
             stop_reason = 'debt_over_10000',
             updated_at = now()
           WHERE id = $1`,
          [partnerId]
        );

        logger.warn('Partner payouts disabled due to debt over 10,000', {
          partnerId,
          debtAmount
        });
      }
    } else {
      // 残高がプラスの場合はdebtをクリア
      await dbQuery(
        `UPDATE partners SET
           debt_cents = 0,
           updated_at = now()
         WHERE id = $1 AND debt_cents > 0`,
        [partnerId]
      );
    }

    // 7. ordersテーブルのステータス更新
    await dbQuery(
      `UPDATE orders SET
         payment_status = 'refunded',
         updated_at = now()
       WHERE id = $1`,
      [orderId]
    );

    await dbQuery('COMMIT');

    logger.info('Refund processed successfully', {
      orderId,
      refundId: stripeRefund.id,
      refundAmount: refundAmountCents,
      partnerId,
      availableBalance,
      debtAmount: availableBalance < 0 ? Math.abs(availableBalance) : 0
    });

    return {
      success: true,
      refundId: stripeRefund.id,
      refundAmount: refundAmountCents,
      partnerId,
      availableBalance,
      debtAmount: availableBalance < 0 ? Math.abs(availableBalance) : 0,
      payoutsDisabled: availableBalance < -10000
    };
  } catch (error) {
    await dbQuery('ROLLBACK');
    logger.error('Refund processing failed', {
      orderId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * 部分返金実行
 * 注文の一部金額のみを返金する
 *
 * @param {string} orderId - 注文ID
 * @param {number} refundAmountCents - 返金額（円）
 * @param {string} reason - 返金理由
 * @param {string} adminUserId - 実行者（管理者）のユーザーID
 * @returns {Promise<object>} 返金結果
 */
async function processPartialRefund(orderId, refundAmountCents, reason, adminUserId) {
  // 部分返金も processRefund で処理可能
  return processRefund(orderId, refundAmountCents, reason, adminUserId);
}

/**
 * 返金履歴を取得
 *
 * @param {string} orderId - 注文ID
 * @returns {Promise<Array>} 返金履歴
 */
async function getRefundHistory(orderId) {
  try {
    const refunds = await dbQuery(
      `SELECT
         l.id,
         l.type,
         l.amount_cents,
         l.stripe_refund_id,
         l.note,
         l.created_at
       FROM ledger l
       WHERE l.order_id = $1
         AND l.type = 'refund'
       ORDER BY l.created_at DESC`,
      [orderId]
    );

    logger.info('Refund history retrieved', {
      orderId,
      refundCount: refunds.length
    });

    return refunds;
  } catch (error) {
    logger.error('Failed to get refund history', {
      orderId,
      error: error.message
    });
    throw error;
  }
}

/**
 * 出品者の負債情報を取得
 *
 * @param {string} partnerId - 出品者ID
 * @returns {Promise<object>} 負債情報
 */
async function getPartnerDebtInfo(partnerId) {
  try {
    const partners = await dbQuery(
      `SELECT
         id,
         name,
         debt_cents,
         payouts_enabled,
         stop_reason
       FROM partners
       WHERE id = $1`,
      [partnerId]
    );

    const partner = partners[0];
    if (!partner) {
      throw new Error('Partner not found');
    }

    // 未送金残高を計算
    const balanceRows = await dbQuery(
      `SELECT COALESCE(SUM(amount_cents), 0)::int AS balance
       FROM ledger
       WHERE partner_id = $1
         AND status IN ('available', 'pending')`,
      [partnerId]
    );

    const availableBalance = balanceRows[0].balance;

    logger.info('Partner debt info retrieved', {
      partnerId,
      debtCents: partner.debt_cents,
      availableBalance
    });

    return {
      partnerId: partner.id,
      partnerName: partner.name,
      debtCents: partner.debt_cents,
      availableBalance,
      payoutsEnabled: partner.payouts_enabled,
      stopReason: partner.stop_reason,
      isOverLimit: partner.debt_cents > 10000
    };
  } catch (error) {
    logger.error('Failed to get partner debt info', {
      partnerId,
      error: error.message
    });
    throw error;
  }
}

/**
 * 負債を手動で調整（管理者用）
 * 出品者が振込などで負債を返済した場合に使用
 *
 * @param {string} partnerId - 出品者ID
 * @param {number} adjustmentAmountCents - 調整額（プラス=負債減少、マイナス=負債増加）
 * @param {string} note - 調整理由
 * @param {string} adminUserId - 実行者（管理者）のユーザーID
 * @returns {Promise<object>} 調整結果
 */
async function adjustPartnerDebt(partnerId, adjustmentAmountCents, note, adminUserId) {
  try {
    logger.info('Adjusting partner debt', {
      partnerId,
      adjustmentAmountCents,
      note,
      adminUserId
    });

    await dbQuery('BEGIN');

    // 現在の負債額を取得
    const partners = await dbQuery(
      'SELECT debt_cents FROM partners WHERE id = $1',
      [partnerId]
    );

    if (!partners.length) {
      throw new Error('Partner not found');
    }

    const currentDebt = partners[0].debt_cents;
    const newDebt = Math.max(0, currentDebt - adjustmentAmountCents);

    // 負債額を更新
    await dbQuery(
      `UPDATE partners SET
         debt_cents = $1,
         updated_at = now()
       WHERE id = $2`,
      [newDebt, partnerId]
    );

    // 負債が10,000円以下になったら送金再開
    if (currentDebt > 10000 && newDebt <= 10000) {
      await dbQuery(
        `UPDATE partners SET
           payouts_enabled = true,
           stop_reason = NULL,
           updated_at = now()
         WHERE id = $1`,
        [partnerId]
      );

      logger.info('Partner payouts re-enabled after debt adjustment', {
        partnerId,
        newDebt
      });
    }

    // 台帳に調整エントリを作成
    const idempotencyKey = `adjustment-${partnerId}-${Date.now()}`;
    await dbQuery(
      `INSERT INTO ledger (
         partner_id, type, amount_cents, currency,
         status, idempotency_key, note
       ) VALUES ($1, 'adjustment', $2, 'jpy', 'paid', $3, $4)`,
      [
        partnerId,
        adjustmentAmountCents,
        idempotencyKey,
        `負債調整: ${note} (管理者: ${adminUserId})`
      ]
    );

    await dbQuery('COMMIT');

    logger.info('Partner debt adjusted successfully', {
      partnerId,
      oldDebt: currentDebt,
      newDebt,
      adjustment: adjustmentAmountCents
    });

    return {
      success: true,
      partnerId,
      oldDebt: currentDebt,
      newDebt,
      adjustment: adjustmentAmountCents,
      payoutsReEnabled: currentDebt > 10000 && newDebt <= 10000
    };
  } catch (error) {
    await dbQuery('ROLLBACK');
    logger.error('Failed to adjust partner debt', {
      partnerId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

module.exports = {
  processRefund,
  processPartialRefund,
  getRefundHistory,
  getPartnerDebtInfo,
  adjustPartnerDebt
};
