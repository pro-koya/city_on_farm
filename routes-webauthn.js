// routes-webauthn.js
// WebAuthn（生体認証・パスキー）関連のルート定義

const {
  generateRegistrationChallenge,
  verifyRegistration,
  generateAuthenticationChallenge,
  verifyAuthentication,
  getUserCredentials,
  deleteCredential
} = require('./services/webauthn');
const logger = require('./services/logger');

/**
 * WebAuthnルートを登録
 * @param {Express} app - Expressアプリケーション
 * @param {Function} requireAuth - 認証ミドルウェア
 */
function registerWebAuthnRoutes(app, requireAuth) {

  // ============================================================
  // WebAuthn登録: チャレンジ生成
  // ============================================================
  app.post(
    '/api/webauthn/register/challenge',
    requireAuth,
    async (req, res) => {
      try {
        const userId = req.session.user.id;
        const userEmail = req.session.user.email;
        const userName = req.session.user.name || userEmail;

        const options = await generateRegistrationChallenge(userId, userEmail, userName);

        res.json({
          success: true,
          options
        });
      } catch (error) {
        logger.error('Failed to generate registration challenge', {
          userId: req.session?.user?.id,
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
  // WebAuthn登録: レスポンス検証
  // ============================================================
  app.post(
    '/api/webauthn/register/verify',
    requireAuth,
    async (req, res) => {
      try {
        const userId = req.session.user.id;
        const { response, deviceName } = req.body;
        const userAgent = req.headers['user-agent'] || '';

        if (!response || !deviceName) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields'
          });
        }

        const result = await verifyRegistration(userId, response, deviceName, userAgent);

        res.json({
          success: true,
          credential: result.credential
        });
      } catch (error) {
        logger.error('Failed to verify registration', {
          userId: req.session?.user?.id,
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
  // WebAuthn認証: チャレンジ生成（ログイン時）
  // ============================================================
  app.post(
    '/api/webauthn/auth/challenge',
    async (req, res) => {
      try {
        const { userId } = req.body;

        // 一時セッションからユーザーIDを取得（パスワード認証後）
        const sessionUserId = req.session?.pending2FA?.userId || userId;

        if (!sessionUserId) {
          return res.status(400).json({
            success: false,
            error: 'User ID not found'
          });
        }

        const options = await generateAuthenticationChallenge(sessionUserId);

        res.json({
          success: true,
          options
        });
      } catch (error) {
        logger.error('Failed to generate authentication challenge', {
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
  // WebAuthn認証: レスポンス検証（ログイン時）
  // ============================================================
  app.post(
    '/api/webauthn/auth/verify',
    async (req, res) => {
      try {
        const { response } = req.body;

        // 一時セッションからユーザーIDと情報を取得
        const pending2FA = req.session?.pending2FA;

        if (!pending2FA || !pending2FA.userId) {
          return res.status(400).json({
            success: false,
            error: 'Session not found'
          });
        }

        const { userId, email, name, roles } = pending2FA;
        const result = await verifyAuthentication(userId, response);

        if (result.verified) {
          // partner_id を DB から取得（出品者証などのヘッダーメニュー表示に必要）
          const { dbQuery } = require('./services/db');
          const userRows = await dbQuery(
            'SELECT partner_id FROM users WHERE id = $1::uuid LIMIT 1',
            [userId]
          );
          const partnerId = userRows[0]?.partner_id || null;

          // MFA認証成功 - セッションを確立
          req.session.user = { id: userId, name, email, roles, partner_id: partnerId };
          req.session.mfaVerified = true;
          delete req.session.pending2FA;

          logger.info('WebAuthn MFA authentication successful', {
            userId,
            deviceName: result.deviceName
          });

          const redirectUrl = roles.includes('seller') ? '/dashboard/seller' : '/dashboard/buyer';
          res.json({
            success: true,
            message: 'Authentication successful',
            deviceName: result.deviceName,
            redirectUrl
          });
        } else {
          throw new Error('Authentication failed');
        }
      } catch (error) {
        logger.error('Failed to verify authentication', {
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
  // 認証器一覧取得
  // ============================================================
  app.get(
    '/api/webauthn/credentials',
    requireAuth,
    async (req, res) => {
      try {
        const userId = req.session.user.id;
        const credentials = await getUserCredentials(userId);

        res.json({
          success: true,
          credentials
        });
      } catch (error) {
        logger.error('Failed to get credentials', {
          userId: req.session?.user?.id,
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
  // 認証器の存在確認（2FA認証中でも利用可能）
  // ============================================================
  app.get(
    '/api/webauthn/credentials/check',
    async (req, res) => {
      try {
        // 2FA認証中のユーザーIDを取得
        const userId = req.session?.user?.id || req.session?.pending2FA?.userId;

        if (!userId) {
          return res.json({
            success: true,
            hasCredentials: false
          });
        }

        const credentials = await getUserCredentials(userId);

        res.json({
          success: true,
          hasCredentials: credentials.length > 0,
          count: credentials.length
        });
      } catch (error) {
        logger.error('Failed to check credentials', {
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
  // 認証器削除
  // ============================================================
  app.delete(
    '/api/webauthn/credentials/:credentialId',
    requireAuth,
    async (req, res) => {
      try {
        const userId = req.session.user.id;
        const { credentialId } = req.params;

        await deleteCredential(userId, credentialId);

        res.json({
          success: true,
          message: 'Credential deleted successfully'
        });
      } catch (error) {
        logger.error('Failed to delete credential', {
          userId: req.session?.user?.id,
          credentialId: req.params.credentialId,
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
  // 認証器名前変更
  // ============================================================
  app.patch(
    '/api/webauthn/credentials/:credentialId',
    requireAuth,
    async (req, res) => {
      try {
        const userId = req.session.user.id;
        const { credentialId } = req.params;
        const { deviceName } = req.body;

        if (!deviceName) {
          return res.status(400).json({
            success: false,
            error: 'Device name is required'
          });
        }

        const { dbQuery } = require('./services/db');
        await dbQuery(
          `UPDATE webauthn_credentials
           SET device_name = $1, updated_at = NOW()
           WHERE id = $2 AND user_id = $3`,
          [deviceName, credentialId, userId]
        );

        res.json({
          success: true,
          message: 'Device name updated successfully'
        });
      } catch (error) {
        logger.error('Failed to update credential name', {
          userId: req.session?.user?.id,
          credentialId: req.params.credentialId,
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

module.exports = { registerWebAuthnRoutes };
