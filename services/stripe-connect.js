// services/stripe-connect.js
// Stripe Connect（出品者アカウント管理）サービスモジュール

const stripe = require('../lib/stripe');
const { dbQuery } = require('./db');
const logger = require('./logger');

/**
 * Stripe Connectアカウントリンク作成（オンボーディング開始）
 *
 * @param {string} partnerId - 出品者（partner）のID
 * @param {string} returnUrl - オンボーディング完了後のリダイレクト先URL
 * @param {string} refreshUrl - オンボーディング再開時のURL
 * @returns {Promise<{accountId: string, url: string}>}
 */
async function createConnectAccountLink(partnerId, returnUrl, refreshUrl) {
  try {
    // 1. partnerを取得
    const partners = await dbQuery(
      'SELECT id, stripe_account_id, email, name FROM partners WHERE id = $1',
      [partnerId]
    );
    const partner = partners[0];

    if (!partner) {
      throw new Error('Partner not found');
    }

    let accountId = partner.stripe_account_id;

    // 2. Stripe Connectアカウントが未作成なら作成
    if (!accountId) {
      logger.info('Creating new Stripe Connect account', { partnerId });

      const account = await stripe.accounts.create({
        type: 'express',
        country: 'JP',
        email: partner.email,
        capabilities: {
          transfers: { requested: true }
        },
        business_type: 'individual', // または 'company'（法人の場合）
        metadata: {
          partner_id: partnerId,
          partner_name: partner.name
        }
      });

      accountId = account.id;

      // DBに保存
      await dbQuery(
        `UPDATE partners
         SET stripe_account_id = $1, updated_at = now()
         WHERE id = $2`,
        [accountId, partnerId]
      );

      logger.info('Stripe Connect account created', {
        partnerId,
        accountId
      });
    } else {
      logger.info('Using existing Stripe Connect account', {
        partnerId,
        accountId
      });
    }

    // 3. Account Linkを作成
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding'
    });

    logger.info('Stripe Connect account link created', {
      partnerId,
      accountId,
      url: accountLink.url
    });

    return {
      accountId,
      url: accountLink.url
    };
  } catch (error) {
    logger.error('Failed to create Connect account link', {
      partnerId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Stripe Connectアカウント情報を同期
 * Webhookやリダイレクト後に呼び出し、Stripeの最新状態をDBに反映
 *
 * @param {string} accountId - Stripe ConnectアカウントID
 */
async function syncConnectAccount(accountId) {
  try {
    logger.info('Syncing Stripe Connect account', { accountId });

    // Stripeからアカウント情報を取得
    const account = await stripe.accounts.retrieve(accountId);
    console.log('account'+account);

    // DBのpartnerを取得
    const partners = await dbQuery(
      'SELECT id FROM partners WHERE stripe_account_id = $1',
      [accountId]
    );

    if (!partners.length) {
      logger.warn('Partner not found for Stripe account', { accountId });
      return;
    }

    const partnerId = partners[0].id;
    console.log('partnerId'+partnerId);

    // ステータスを更新
    await dbQuery(
      `UPDATE partners SET
         stripe_details_submitted = $1,
         stripe_charges_enabled = $2,
         stripe_payouts_enabled = $3,
         payouts_enabled = $4,
         stripe_onboarding_completed = $5,
         stripe_account_updated_at = now(),
         updated_at = now()
       WHERE id = $6`,
      [
        account.details_submitted || false,
        account.charges_enabled || false,
        account.payouts_enabled || false,
        account.payouts_enabled || false, // 自動送金フラグもStripe準拠で更新
        account.details_submitted || false,
        partnerId
      ]
    );

    logger.info('Stripe Connect account synced successfully', {
      partnerId,
      accountId,
      detailsSubmitted: account.details_submitted,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled
    });

    return {
      partnerId,
      accountId,
      detailsSubmitted: account.details_submitted,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled
    };
  } catch (error) {
    logger.error('Failed to sync Connect account', {
      accountId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Stripe Connectアカウントの詳細情報を取得
 *
 * @param {string} partnerId - 出品者（partner）のID
 * @returns {Promise<object>} Stripeアカウント情報
 */
async function getConnectAccountDetails(partnerId) {
  try {
    const partners = await dbQuery(
      `SELECT id, name, stripe_account_id,
              stripe_details_submitted, stripe_charges_enabled,
              stripe_payouts_enabled, payouts_enabled
       FROM partners WHERE id = $1`,
      [partnerId]
    );

    const partner = partners[0];
    if (!partner) {
      throw new Error('Partner not found');
    }

    if (!partner.stripe_account_id) {
      return {
        partnerId: partner.id,
        partnerName: partner.name,
        hasAccount: false,
        accountId: null,
        detailsSubmitted: false,
        chargesEnabled: false,
        payoutsEnabled: false
      };
    }

    // Stripeから最新情報を取得
    const account = await stripe.accounts.retrieve(partner.stripe_account_id);

    return {
      partnerId: partner.id,
      partnerName: partner.name,
      hasAccount: true,
      accountId: partner.stripe_account_id,
      detailsSubmitted: account.details_submitted || false,
      chargesEnabled: account.charges_enabled || false,
      payoutsEnabled: account.payouts_enabled || false,
      email: account.email,
      country: account.country,
      defaultCurrency: account.default_currency,
      requirements: account.requirements
    };
  } catch (error) {
    logger.error('Failed to get Connect account details', {
      partnerId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Stripe Connectダッシュボードへのログインリンクを作成
 * 出品者が自分のStripe Expressダッシュボードにアクセスできるようにする
 *
 * @param {string} partnerId - 出品者（partner）のID
 * @returns {Promise<{url: string}>}
 */
async function createConnectDashboardLink(partnerId) {
  try {
    const partners = await dbQuery(
      'SELECT stripe_account_id FROM partners WHERE id = $1',
      [partnerId]
    );

    const partner = partners[0];
    if (!partner) {
      throw new Error('Partner not found');
    }

    if (!partner.stripe_account_id) {
      throw new Error('Stripe account not created yet');
    }

    const loginLink = await stripe.accounts.createLoginLink(
      partner.stripe_account_id
    );

    logger.info('Stripe Connect dashboard link created', {
      partnerId,
      accountId: partner.stripe_account_id
    });

    return {
      url: loginLink.url
    };
  } catch (error) {
    logger.error('Failed to create dashboard link', {
      partnerId,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  createConnectAccountLink,
  syncConnectAccount,
  getConnectAccountDetails,
  createConnectDashboardLink
};
