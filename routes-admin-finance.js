// routes-admin-finance.js
// 管理者用の財務・残高管理API
// 出品者の残高、台帳、送金履歴などを管理

const { getPartnerBalance, getLedgerEntries } = require('./services/ledger');
const { dbQuery } = require('./services/db');
const logger = require('./services/logger');

/**
 * 管理者用財務管理ルートを登録
 * @param {Express} app - Expressアプリケーション
 * @param {Function} requireAuth - 認証ミドルウェア
 * @param {Function} requireRole - ロール認証ミドルウェア
 */
function registerAdminFinanceRoutes(app, requireAuth, requireRole) {
  // ============================================================
  // 管理者: 出品者の残高詳細取得（JSON API）
  // ============================================================
  app.get(
    '/admin/partners/:partnerId/balance/api',
    requireAuth,
    requireRole(['admin']),
    async (req, res, next) => {
      try {
        const { partnerId } = req.params;

        logger.info('Fetching partner balance', {
          partnerId,
          adminUserId: req.session.user.id
        });

        const balance = await getPartnerBalance(partnerId);

        // 出品者情報も取得
        const partners = await dbQuery(
          `SELECT
             id,
             name,
             stripe_account_id,
             payouts_enabled,
             charges_enabled,
             details_submitted,
             debt_cents,
             created_at
           FROM partners
           WHERE id = $1`,
          [partnerId]
        );

        if (!partners.length) {
          return res.status(404).json({
            success: false,
            error: 'Partner not found'
          });
        }

        const partner = partners[0];

        res.json({
          success: true,
          partner: {
            id: partner.id,
            name: partner.name,
            stripeAccountId: partner.stripe_account_id,
            payoutsEnabled: partner.payouts_enabled,
            chargesEnabled: partner.charges_enabled,
            detailsSubmitted: partner.details_submitted,
            debtCents: partner.debt_cents,
            createdAt: partner.created_at
          },
          balance: {
            availableBalance: balance.availableBalance,
            pendingBalance: balance.pendingBalance,
            paidBalance: balance.paidBalance,
            totalBalance: balance.totalBalance,
            debtCents: partner.debt_cents,
            netBalance: balance.availableBalance - partner.debt_cents
          }
        });
      } catch (error) {
        logger.error('Failed to fetch partner balance', {
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
  // 管理者: 出品者の台帳エントリ一覧取得（JSON API）
  // ============================================================
  app.get(
    '/admin/partners/:partnerId/ledger/api',
    requireAuth,
    requireRole(['admin']),
    async (req, res, next) => {
      try {
        const { partnerId } = req.params;
        const { limit = 50, offset = 0, status = null } = req.query;

        logger.info('Fetching partner ledger entries', {
          partnerId,
          limit,
          offset,
          status,
          adminUserId: req.session.user.id
        });

        const options = {
          limit: parseInt(limit, 10),
          offset: parseInt(offset, 10),
          status
        };

        const entries = await getLedgerEntries(partnerId, options);

        // 総件数を取得
        let countQuery = `SELECT COUNT(*) AS total FROM ledger WHERE partner_id = $1`;
        const countParams = [partnerId];

        if (status) {
          countQuery += ` AND status = $2`;
          countParams.push(status);
        }

        const countResult = await dbQuery(countQuery, countParams);
        const total = parseInt(countResult[0].total, 10);

        res.json({
          success: true,
          entries,
          pagination: {
            total,
            limit: options.limit,
            offset: options.offset,
            hasMore: options.offset + options.limit < total
          }
        });
      } catch (error) {
        logger.error('Failed to fetch ledger entries', {
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
  // 管理者: プラットフォーム全体の財務サマリ
  // ============================================================
  app.get(
    '/admin/ledger/summary',
    requireAuth,
    requireRole(['admin']),
    async (req, res, next) => {
      try {
        logger.info('Fetching platform financial summary', {
          adminUserId: req.session.user.id
        });

        // 全体の台帳サマリ
        const ledgerSummary = await dbQuery(`
          SELECT
            COUNT(*) AS total_entries,
            COALESCE(SUM(CASE WHEN status = 'available' THEN amount_cents ELSE 0 END), 0)::int AS total_available,
            COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END), 0)::int AS total_pending,
            COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_cents ELSE 0 END), 0)::int AS total_paid,
            COALESCE(SUM(CASE WHEN type = 'sale' THEN amount_cents ELSE 0 END), 0)::int AS total_sales,
            COALESCE(SUM(CASE WHEN type = 'platform_fee' THEN -amount_cents ELSE 0 END), 0)::int AS total_fees,
            COALESCE(SUM(CASE WHEN type = 'refund' THEN -amount_cents ELSE 0 END), 0)::int AS total_refunds,
            COALESCE(SUM(CASE WHEN type = 'payout' THEN -amount_cents ELSE 0 END), 0)::int AS total_payouts
          FROM ledger
        `);

        // 出品者ごとのサマリ
        const partnerSummary = await dbQuery(`
          SELECT
            COUNT(DISTINCT p.id) AS total_partners,
            COUNT(DISTINCT CASE WHEN p.payouts_enabled = true THEN p.id END) AS enabled_partners,
            COUNT(DISTINCT CASE WHEN p.debt_cents > 10000 THEN p.id END) AS debt_over_limit_partners,
            COALESCE(SUM(p.debt_cents), 0)::int AS total_debt
          FROM partners p
          WHERE p.stripe_account_id IS NOT NULL
        `);

        // 送金実行サマリ
        const payoutSummary = await dbQuery(`
          SELECT
            COUNT(*) AS total_runs,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_runs,
            COUNT(CASE WHEN status = 'failed' THEN 1 END) AS failed_runs,
            COALESCE(SUM(total_amount_cents), 0)::int AS total_payout_amount,
            COALESCE(SUM(successful_payouts), 0)::int AS total_successful_payouts,
            COALESCE(SUM(failed_payouts), 0)::int AS total_failed_payouts
          FROM payout_runs
        `);

        res.json({
          success: true,
          summary: {
            ledger: ledgerSummary[0],
            partners: partnerSummary[0],
            payouts: payoutSummary[0]
          }
        });
      } catch (error) {
        logger.error('Failed to fetch financial summary', {
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
  // 管理者: 送金実行履歴一覧
  // ============================================================
  app.get(
    '/admin/payouts/history',
    requireAuth,
    requireRole(['admin']),
    async (req, res, next) => {
      try {
        const { limit = 20, offset = 0, status = null } = req.query;

        logger.info('Fetching payout history', {
          limit,
          offset,
          status,
          adminUserId: req.session.user.id
        });

        let query = `
          SELECT
            id,
            iso_week,
            status,
            total_partners,
            successful_payouts,
            failed_payouts,
            total_amount_cents,
            error_message,
            started_at,
            completed_at,
            created_at
          FROM payout_runs
        `;

        const params = [];
        let paramIndex = 1;

        if (status) {
          query += ` WHERE status = $${paramIndex}`;
          params.push(status);
          paramIndex++;
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit, 10), parseInt(offset, 10));

        const payouts = await dbQuery(query, params);

        // 総件数を取得
        let countQuery = `SELECT COUNT(*) AS total FROM payout_runs`;
        const countParams = [];

        if (status) {
          countQuery += ` WHERE status = $1`;
          countParams.push(status);
        }

        const countResult = await dbQuery(countQuery, countParams);
        const total = parseInt(countResult[0].total, 10);

        res.json({
          success: true,
          payouts,
          pagination: {
            total,
            limit: parseInt(limit, 10),
            offset: parseInt(offset, 10),
            hasMore: parseInt(offset, 10) + parseInt(limit, 10) < total
          }
        });
      } catch (error) {
        logger.error('Failed to fetch payout history', {
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
  // 管理者: 特定の送金実行詳細取得
  // ============================================================
  app.get(
    '/admin/payouts/:payoutRunId',
    requireAuth,
    requireRole(['admin']),
    async (req, res, next) => {
      try {
        const { payoutRunId } = req.params;

        logger.info('Fetching payout run details', {
          payoutRunId,
          adminUserId: req.session.user.id
        });

        // 送金実行情報を取得
        const runs = await dbQuery(
          `SELECT
             id,
             iso_week,
             status,
             total_partners,
             successful_payouts,
             failed_payouts,
             total_amount_cents,
             error_message,
             idempotency_key,
             started_at,
             completed_at,
             created_at
           FROM payout_runs
           WHERE id = $1`,
          [payoutRunId]
        );

        if (!runs.length) {
          return res.status(404).json({
            success: false,
            error: 'Payout run not found'
          });
        }

        const payoutRun = runs[0];

        // この送金実行に含まれる台帳エントリを取得
        const ledgerEntries = await dbQuery(
          `SELECT
             l.id,
             l.partner_id,
             l.type,
             l.amount_cents,
             l.status,
             l.stripe_payout_id,
             l.created_at,
             p.name AS partner_name
           FROM ledger l
           JOIN partners p ON p.id = l.partner_id
           WHERE l.type = 'payout'
             AND l.note LIKE $1
           ORDER BY l.created_at DESC`,
          [`%ISO週${payoutRun.iso_week}%`]
        );

        res.json({
          success: true,
          payoutRun,
          ledgerEntries
        });
      } catch (error) {
        logger.error('Failed to fetch payout run details', {
          payoutRunId: req.params.payoutRunId,
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
  // 管理者: 全出品者の残高一覧
  // ============================================================
  app.get(
    '/admin/partners/balances',
    requireAuth,
    requireRole(['admin']),
    async (req, res, next) => {
      try {
        const { limit = 50, offset = 0, sortBy = 'available_desc' } = req.query;

        logger.info('Fetching all partner balances', {
          limit,
          offset,
          sortBy,
          adminUserId: req.session.user.id
        });

        // 出品者ごとの残高を集計
        const balances = await dbQuery(
          `SELECT
             p.id,
             p.name,
             p.stripe_account_id,
             p.payouts_enabled,
             p.debt_cents,
             COALESCE(SUM(CASE WHEN l.status = 'available' AND l.available_at <= now() THEN l.amount_cents ELSE 0 END), 0)::int AS available_balance,
             COALESCE(SUM(CASE WHEN l.status = 'pending' THEN l.amount_cents ELSE 0 END), 0)::int AS pending_balance,
             COALESCE(SUM(CASE WHEN l.status = 'paid' THEN l.amount_cents ELSE 0 END), 0)::int AS paid_balance,
             COALESCE(SUM(l.amount_cents), 0)::int AS total_balance
           FROM partners p
           LEFT JOIN ledger l ON l.partner_id = p.id
           WHERE p.stripe_account_id IS NOT NULL
           GROUP BY p.id, p.name, p.stripe_account_id, p.payouts_enabled, p.debt_cents
           ORDER BY ${sortBy === 'debt_desc' ? 'p.debt_cents DESC' : sortBy === 'pending_desc' ? 'pending_balance DESC' : 'available_balance DESC'}
           LIMIT $1 OFFSET $2`,
          [parseInt(limit, 10), parseInt(offset, 10)]
        );

        // 総件数を取得
        const countResult = await dbQuery(
          `SELECT COUNT(*) AS total FROM partners WHERE stripe_account_id IS NOT NULL`
        );
        const total = parseInt(countResult[0].total, 10);

        res.json({
          success: true,
          balances,
          pagination: {
            total,
            limit: parseInt(limit, 10),
            offset: parseInt(offset, 10),
            hasMore: parseInt(offset, 10) + parseInt(limit, 10) < total
          }
        });
      } catch (error) {
        logger.error('Failed to fetch partner balances', {
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
  // 管理者: 台帳エントリ検索（全体）
  // ============================================================
  app.get(
    '/admin/ledger/search',
    requireAuth,
    requireRole(['admin']),
    async (req, res, next) => {
      try {
        const {
          limit = 50,
          offset = 0,
          type = null,
          status = null,
          partnerId = null,
          orderId = null,
          startDate = null,
          endDate = null
        } = req.query;

        logger.info('Searching ledger entries', {
          limit,
          offset,
          type,
          status,
          partnerId,
          orderId,
          adminUserId: req.session.user.id
        });

        let query = `
          SELECT
            l.id,
            l.partner_id,
            l.order_id,
            l.type,
            l.amount_cents,
            l.currency,
            l.status,
            l.available_at,
            l.stripe_payment_intent_id,
            l.stripe_refund_id,
            l.stripe_payout_id,
            l.note,
            l.created_at,
            p.name AS partner_name,
            o.order_number
          FROM ledger l
          LEFT JOIN partners p ON p.id = l.partner_id
          LEFT JOIN orders o ON o.id = l.order_id
          WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (type) {
          query += ` AND l.type = $${paramIndex}`;
          params.push(type);
          paramIndex++;
        }

        if (status) {
          query += ` AND l.status = $${paramIndex}`;
          params.push(status);
          paramIndex++;
        }

        if (partnerId) {
          query += ` AND l.partner_id = $${paramIndex}`;
          params.push(partnerId);
          paramIndex++;
        }

        if (orderId) {
          query += ` AND l.order_id = $${paramIndex}`;
          params.push(orderId);
          paramIndex++;
        }

        if (startDate) {
          query += ` AND l.created_at >= $${paramIndex}`;
          params.push(startDate);
          paramIndex++;
        }

        if (endDate) {
          query += ` AND l.created_at <= $${paramIndex}`;
          params.push(endDate);
          paramIndex++;
        }

        query += ` ORDER BY l.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit, 10), parseInt(offset, 10));

        const entries = await dbQuery(query, params);

        // 総件数を取得（同じWHERE条件で）
        let countQuery = `SELECT COUNT(*) AS total FROM ledger l WHERE 1=1`;
        const countParams = [];
        let countParamIndex = 1;

        if (type) {
          countQuery += ` AND l.type = $${countParamIndex}`;
          countParams.push(type);
          countParamIndex++;
        }

        if (status) {
          countQuery += ` AND l.status = $${countParamIndex}`;
          countParams.push(status);
          countParamIndex++;
        }

        if (partnerId) {
          countQuery += ` AND l.partner_id = $${countParamIndex}`;
          countParams.push(partnerId);
          countParamIndex++;
        }

        if (orderId) {
          countQuery += ` AND l.order_id = $${countParamIndex}`;
          countParams.push(orderId);
          countParamIndex++;
        }

        if (startDate) {
          countQuery += ` AND l.created_at >= $${countParamIndex}`;
          countParams.push(startDate);
          countParamIndex++;
        }

        if (endDate) {
          countQuery += ` AND l.created_at <= $${countParamIndex}`;
          countParams.push(endDate);
          countParamIndex++;
        }

        const countResult = await dbQuery(countQuery, countParams);
        const total = parseInt(countResult[0].total, 10);

        res.json({
          success: true,
          entries,
          pagination: {
            total,
            limit: parseInt(limit, 10),
            offset: parseInt(offset, 10),
            hasMore: parseInt(offset, 10) + parseInt(limit, 10) < total
          }
        });
      } catch (error) {
        logger.error('Failed to search ledger entries', {
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

module.exports = { registerAdminFinanceRoutes };
