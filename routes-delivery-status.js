// routes-delivery-status.js
// 配送ステータス更新関連のルート定義
// delivery_status が 'delivered' になったときに台帳を送金可能にする

const { recordDeliveryCompletedAndMarkAvailable } = require('./services/ledger');
const logger = require('./services/logger');
const { dbQuery } = require('./services/db');

/**
 * 配送ステータス更新ルートを登録
 * @param {Express} app - Expressアプリケーション
 * @param {Function} requireAuth - 認証ミドルウェア
 * @param {Function} requireRole - ロール認証ミドルウェア
 */
function registerDeliveryStatusRoutes(app, requireAuth, requireRole) {
  // ============================================================
  // 出品者/管理者: 配送ステータス更新
  // ============================================================
  app.post(
    '/api/orders/:orderId/delivery-status',
    requireAuth,
    requireRole(['seller', 'admin']),
    async (req, res, next) => {
      try {
        const { orderId } = req.params;
        const { deliveryStatus } = req.body;

        logger.info('Updating delivery status', {
          orderId,
          deliveryStatus,
          userId: req.session?.user?.id
        });

        // 1. 注文を取得して権限チェック
        // ★ ordersテーブルのseller_idにはpartner_id（パートナー組織のID）が入っている
        const orders = await dbQuery(
          `SELECT o.id, o.seller_id, o.delivery_status
           FROM orders o
           WHERE o.id = $1`,
          [orderId]
        );

        if (!orders.length) {
          return res.status(404).json({
            success: false,
            error: 'Order not found'
          });
        }

        const order = orders[0];
        const currentUser = req.session.user;

        // 権限チェック: 管理者 または 出品者本人
        // ★ 現在のユーザーのpartner_idと、注文のseller_id（= partner_id）を比較
        const isAdmin = currentUser.roles && currentUser.roles.includes('admin');

        let isSeller = false;
        if (currentUser.partner_id && currentUser.partner_id === order.seller_id) {
          isSeller = true;
        }

        if (!isAdmin && !isSeller) {
          return res.status(403).json({
            success: false,
            error: 'Forbidden'
          });
        }

        // 2. delivery_status を更新
        await dbQuery(
          `UPDATE orders SET
             delivery_status = $1,
             updated_at = now()
           WHERE id = $2`,
          [deliveryStatus, orderId]
        );

        logger.info('Delivery status updated', {
          orderId,
          oldStatus: order.delivery_status,
          newStatus: deliveryStatus
        });

        // 3. delivery_status が 'delivered' になったら台帳をavailableに更新
        if (deliveryStatus === 'delivered') {
          try {
            await recordDeliveryCompletedAndMarkAvailable(orderId);
            logger.info('Ledger marked as available after delivery completed', {
              orderId
            });
          } catch (ledgerError) {
            logger.error('Failed to mark ledger available', {
              orderId,
              error: ledgerError.message,
              stack: ledgerError.stack
            });
            // エラーでもレスポンスは成功を返す（後で手動修正可能）
          }
        }

        res.json({
          success: true,
          orderId,
          deliveryStatus
        });
      } catch (error) {
        logger.error('Failed to update delivery status', {
          orderId: req.params.orderId,
          error: error.message,
          stack: error.stack
        });
        next(error);
      }
    }
  );

  // ============================================================
  // 管理者: 複数注文の配送ステータス一括更新
  // ============================================================
  app.post(
    '/api/orders/bulk-delivery-status',
    requireAuth,
    requireRole(['admin']),
    async (req, res, next) => {
      try {
        const { orderIds, deliveryStatus } = req.body;

        if (!Array.isArray(orderIds) || orderIds.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'Invalid orderIds'
          });
        }

        logger.info('Bulk updating delivery status', {
          orderCount: orderIds.length,
          deliveryStatus,
          adminUserId: req.session?.user?.id
        });

        const results = [];

        for (const orderId of orderIds) {
          try {
            // 配送ステータス更新
            await dbQuery(
              `UPDATE orders SET
                 delivery_status = $1,
                 updated_at = now()
               WHERE id = $2`,
              [deliveryStatus, orderId]
            );

            // delivered になったら台帳更新
            if (deliveryStatus === 'delivered') {
              await recordDeliveryCompletedAndMarkAvailable(orderId);
            }

            results.push({
              orderId,
              success: true
            });
          } catch (error) {
            logger.error('Failed to update order in bulk', {
              orderId,
              error: error.message
            });
            results.push({
              orderId,
              success: false,
              error: error.message
            });
          }
        }

        const successCount = results.filter(r => r.success).length;

        logger.info('Bulk delivery status update completed', {
          total: orderIds.length,
          success: successCount,
          failed: orderIds.length - successCount
        });

        res.json({
          success: true,
          results,
          summary: {
            total: orderIds.length,
            success: successCount,
            failed: orderIds.length - successCount
          }
        });
      } catch (error) {
        logger.error('Failed to bulk update delivery status', {
          error: error.message,
          stack: error.stack
        });
        next(error);
      }
    }
  );
}

module.exports = { registerDeliveryStatusRoutes };
