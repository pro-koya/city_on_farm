// routes-stripe-connect.js
// Stripe Connect関連のルート定義
// server.jsからrequireして使用する

const {
  createConnectAccountLink,
  syncConnectAccount,
  getConnectAccountDetails,
  createConnectDashboardLink 
} = require('./services/stripe-connect');
const logger = require('./services/logger');

/**
 * Stripe Connectルートを登録
 * @param {Express} app - Expressアプリケーション
 * @param {Function} requireAuth - 認証ミドルウェア
 * @param {Function} requireRole - ロール認証ミドルウェア
 */
function registerStripeConnectRoutes(app, requireAuth, requireRole) {
  // ============================================================
  // 管理者: Stripe Connectオンボーディング開始
  // ============================================================
  app.post(
    '/admin/partners/:partnerId/stripe-onboarding',
    requireAuth,
    requireRole(['admin']),
    async (req, res, next) => {
      console.log('[DEBUG] ========================================');
      console.log('[DEBUG] Stripe onboarding endpoint HIT!');
      console.log('[DEBUG] partnerId:', req.params.partnerId);
      console.log('[DEBUG] user:', req.session?.user);
      console.log('[DEBUG] body:', req.body);
      console.log('[DEBUG] ========================================');

      try {
        const { partnerId } = req.params;
        const appOrigin = process.env.APP_ORIGIN || 'http://localhost:3000';

        const returnUrl = `${appOrigin}/admin/partners/${partnerId}/stripe-return`;
        const refreshUrl = `${appOrigin}/admin/partners/${partnerId}/stripe-refresh`;

        console.log('[DEBUG] returnUrl:', returnUrl);
        console.log('[DEBUG] refreshUrl:', refreshUrl);

        logger.info('Starting Stripe Connect onboarding', {
          partnerId,
          adminUserId: req.session?.user?.id
        });

        const { accountId, url } = await createConnectAccountLink(
          partnerId,
          returnUrl,
          refreshUrl
        );

        res.json({
          success: true,
          accountId,
          onboardingUrl: url
        });
      } catch (error) {
        logger.error('Failed to start Stripe Connect onboarding', {
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
  // Stripe Connectオンボーディング完了後のリダイレクト先
  // ============================================================
  app.get(
    '/admin/partners/:partnerId/stripe-return',
    requireAuth,
    requireRole(['admin']),
    async (req, res) => {
      const { partnerId } = req.params;

      logger.info('Stripe Connect onboarding return', { partnerId });

      // アカウント情報を同期
      try {
        const { dbQuery } = require('./services/db');
        const partners = await dbQuery(
          'SELECT stripe_account_id FROM partners WHERE id = $1',
          [partnerId]
        );

        if (partners.length && partners[0].stripe_account_id) {
          await syncConnectAccount(partners[0].stripe_account_id);
          logger.info('Account synced after onboarding return', {
            partnerId,
            accountId: partners[0].stripe_account_id
          });
        }
      } catch (error) {
        logger.error('Failed to sync after onboarding return', {
          partnerId,
          error: error.message
        });
      }

      res.redirect(`/admin/partners/${partnerId}?onboarding=success`);
    }
  );

  // ============================================================
  // Stripe Connectオンボーディング再開
  // ============================================================
  app.get(
    '/admin/partners/:partnerId/stripe-refresh',
    requireAuth,
    requireRole(['admin']),
    async (req, res, next) => {
      try {
        const { partnerId } = req.params;
        const appOrigin = process.env.APP_ORIGIN || 'http://localhost:3000';

        const returnUrl = `${appOrigin}/admin/partners/${partnerId}/stripe-return`;
        const refreshUrl = `${appOrigin}/admin/partners/${partnerId}/stripe-refresh`;

        logger.info('Refreshing Stripe Connect onboarding', { partnerId });

        const { url } = await createConnectAccountLink(
          partnerId,
          returnUrl,
          refreshUrl
        );

        res.redirect(url);
      } catch (error) {
        logger.error('Failed to refresh Stripe Connect onboarding', {
          partnerId: req.params.partnerId,
          error: error.message
        });
        next(error);
      }
    }
  );

  // ============================================================
  // 管理者: Stripe Connectアカウント情報取得
  // ============================================================
  app.get(
    '/admin/partners/:partnerId/stripe-account',
    requireAuth,
    requireRole(['admin']),
    async (req, res, next) => {
      try {
        const { partnerId } = req.params;

        const accountDetails = await getConnectAccountDetails(partnerId);

        res.json({
          success: true,
          account: accountDetails
        });
      } catch (error) {
        logger.error('Failed to get Stripe Connect account details', {
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
  // 管理者: Stripe Connectダッシュボードリンク作成
  // ============================================================
  app.post(
    '/admin/partners/:partnerId/stripe-dashboard-link',
    requireAuth,
    requireRole(['admin']),
    async (req, res, next) => {
      try {
        const { partnerId } = req.params;

        const { url } = await createConnectDashboardLink(partnerId);

        res.json({
          success: true,
          dashboardUrl: url
        });
      } catch (error) {
        logger.error('Failed to create Stripe dashboard link', {
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
  // 管理者: Stripe Connectアカウント手動同期
  // ============================================================
  app.post(
    '/admin/partners/:partnerId/stripe-sync',
    requireAuth,
    requireRole(['admin']),
    async (req, res, next) => {
      try {
        const { partnerId } = req.params;
        const { dbQuery } = require('./services/db');

        const partners = await dbQuery(
          'SELECT stripe_account_id FROM partners WHERE id = $1',
          [partnerId]
        );

        if (!partners.length) {
          return res.status(404).json({
            success: false,
            error: 'Partner not found'
          });
        }

        const partner = partners[0];
        if (!partner.stripe_account_id) {
          return res.status(400).json({
            success: false,
            error: 'Stripe account not created yet'
          });
        }

        const result = await syncConnectAccount(partner.stripe_account_id);

        res.json({
          success: true,
          result
        });
      } catch (error) {
        logger.error('Failed to sync Stripe account', {
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
}

module.exports = { registerStripeConnectRoutes };
