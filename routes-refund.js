// routes-refund.js
// 返金処理関連のルート定義

const {
  processRefund,
  processPartialRefund,
  getRefundHistory,
  getPartnerDebtInfo,
  adjustPartnerDebt
} = require('./services/refund');
const logger = require('./services/logger');

/**
 * 返金処理ルートを登録
 * @param {Express} app - Expressアプリケーション
 * @param {Function} requireAuth - 認証ミドルウェア
 * @param {Function} requireRole - ロール認証ミドルウェア
 * @param {Function} csrfProtect - CSRFトークン検証ミドルウェア
 */
function registerRefundRoutes(app, requireAuth, requireRole, csrfProtect) {
  // ============================================================
  // 管理者: 返金実行
  // ============================================================
  app.post(
    '/admin/orders/:orderId/refund',
    requireAuth,
    requireRole(['admin']),
    csrfProtect,
    async (req, res, next) => {
      try {
        const { orderId } = req.params;
        const { refundAmount, reason } = req.body;

        // バリデーション
        if (!refundAmount || refundAmount <= 0) {
          return res.status(400).json({
            success: false,
            error: 'Invalid refund amount'
          });
        }

        logger.info('Refund request received', {
          orderId,
          refundAmount,
          reason,
          adminUserId: req.session.user.id
        });

        const result = await processRefund(
          orderId,
          refundAmount,
          reason || '管理者による返金',
          req.session.user.id
        );

        res.json(result);
      } catch (error) {
        logger.error('Refund API error', {
          orderId: req.params.orderId,
          error: error.message,
          stack: error.stack
        });
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }
  );

  // ============================================================
  // 管理者: 部分返金実行
  // ============================================================
  app.post(
    '/admin/orders/:orderId/partial-refund',
    requireAuth,
    requireRole(['admin']),
    csrfProtect,
    async (req, res, next) => {
      try {
        const { orderId } = req.params;
        const { refundAmount, reason } = req.body;

        // バリデーション
        if (!refundAmount || refundAmount <= 0) {
          return res.status(400).json({
            success: false,
            error: 'Invalid refund amount'
          });
        }

        logger.info('Partial refund request received', {
          orderId,
          refundAmount,
          reason,
          adminUserId: req.session.user.id
        });

        const result = await processPartialRefund(
          orderId,
          refundAmount,
          reason || '管理者による部分返金',
          req.session.user.id
        );

        res.json(result);
      } catch (error) {
        logger.error('Partial refund API error', {
          orderId: req.params.orderId,
          error: error.message,
          stack: error.stack
        });
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }
  );

  // ============================================================
  // 管理者: 返金履歴取得
  // ============================================================
  app.get(
    '/admin/orders/:orderId/refund-history',
    requireAuth,
    requireRole(['admin']),
    async (req, res, next) => {
      try {
        const { orderId } = req.params;

        const refunds = await getRefundHistory(orderId);

        res.json({
          success: true,
          refunds
        });
      } catch (error) {
        logger.error('Get refund history error', {
          orderId: req.params.orderId,
          error: error.message
        });
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }
  );

  // ============================================================
  // 管理者: 出品者の負債情報取得
  // ============================================================
  app.get(
    '/admin/partners/:partnerId/debt',
    requireAuth,
    requireRole(['admin']),
    async (req, res, next) => {
      try {
        const { partnerId } = req.params;

        const debtInfo = await getPartnerDebtInfo(partnerId);

        res.json({
          success: true,
          debt: debtInfo
        });
      } catch (error) {
        logger.error('Get partner debt error', {
          partnerId: req.params.partnerId,
          error: error.message
        });
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }
  );

  // ============================================================
  // 管理者: 負債調整（返済処理）
  // ============================================================
  app.post(
    '/admin/partners/:partnerId/adjust-debt',
    requireAuth,
    requireRole(['admin']),
    csrfProtect,
    async (req, res, next) => {
      try {
        const { partnerId } = req.params;
        const { adjustmentAmount, note } = req.body;

        // バリデーション
        if (adjustmentAmount === undefined || adjustmentAmount === null) {
          return res.status(400).json({
            success: false,
            error: 'Adjustment amount is required'
          });
        }

        logger.info('Debt adjustment request received', {
          partnerId,
          adjustmentAmount,
          note,
          adminUserId: req.session.user.id
        });

        const result = await adjustPartnerDebt(
          partnerId,
          adjustmentAmount,
          note || '管理者による負債調整',
          req.session.user.id
        );

        res.json(result);
      } catch (error) {
        logger.error('Adjust debt error', {
          partnerId: req.params.partnerId,
          error: error.message,
          stack: error.stack
        });
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }
  );

  // ============================================================
  // 管理者: 負債超過出品者一覧
  // ============================================================
  app.get(
    '/admin/partners/debt-over-limit',
    requireAuth,
    requireRole(['admin']),
    async (req, res, next) => {
      try {
        const { dbQuery } = require('./services/db');

        const partners = await dbQuery(
          `SELECT
             p.id,
             p.name,
             p.debt_cents,
             p.payouts_enabled,
             p.stop_reason,
             p.updated_at
           FROM partners p
           WHERE p.debt_cents > 10000
           ORDER BY p.debt_cents DESC`
        );

        logger.info('Debt over limit partners retrieved', {
          count: partners.length
        });

        res.json({
          success: true,
          partners
        });
      } catch (error) {
        logger.error('Get debt over limit partners error', {
          error: error.message
        });
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }
  );
}

module.exports = { registerRefundRoutes };
