// services/webauthn.js
// WebAuthn（生体認証・パスキー）サービスモジュール

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const { dbQuery } = require('./db');
const logger = require('./logger');

// 環境変数から設定を取得
const RP_NAME = 'セッツマルシェ';
const RP_ID = process.env.WEBAUTHN_RP_ID || (process.env.NODE_ENV === 'production' ? 'yourdomain.com' : 'localhost');
const ORIGIN = process.env.APP_ORIGIN || 'http://localhost:3000';

// 警告: 本番環境で正しいドメインが設定されているか確認
if (process.env.NODE_ENV === 'production' && RP_ID === 'yourdomain.com') {
  console.warn('⚠️  WARNING: WEBAUTHN_RP_ID is not set. Please set it to your actual domain in .env file');
  console.warn('⚠️  Example: WEBAUTHN_RP_ID=example.com');
}

// 開発環境での注意
if (process.env.NODE_ENV !== 'production' && RP_ID === 'localhost') {
  console.log('ℹ️  WebAuthn RP ID: localhost (for local testing only)');
  console.log('ℹ️  For iPhone/external device testing, use ngrok and set:');
  console.log('   WEBAUTHN_RP_ID=your-ngrok-domain.ngrok-free.app');
  console.log('   APP_ORIGIN=https://your-ngrok-domain.ngrok-free.app');
}

/**
 * Base64URL文字列をBase64文字列に変換
 * @param {string} base64url - Base64URL文字列
 * @returns {string} - Base64文字列
 */
function base64urlToBase64(base64url) {
  // Base64URL → Base64 変換
  // - を + に、_ を / に置き換え、パディング（=）を追加
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');

  // パディングを追加（4の倍数になるように）
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }

  return base64;
}

/**
 * WebAuthn登録用のチャレンジとオプションを生成
 *
 * @param {string} userId - ユーザーID
 * @param {string} userEmail - ユーザーのメールアドレス
 * @param {string} userName - ユーザーの表示名
 * @returns {Promise<object>} - 登録オプション
 */
async function generateRegistrationChallenge(userId, userEmail, userName) {
  try {
    // 既存の認証器を取得
    const existingCredentials = await dbQuery(
      'SELECT credential_id FROM webauthn_credentials WHERE user_id = $1',
      [userId]
    );

    const excludeCredentials = existingCredentials.map(cred => ({
      id: cred.credential_id,
      type: 'public-key'
    }));

    // 登録オプション生成
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: userId,
      userName: userEmail,
      userDisplayName: userName || userEmail,
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform' // 内蔵認証器を優先（FaceID/TouchID）
      }
    });

    // チャレンジをDBに保存（5分間有効）
    await dbQuery(
      `INSERT INTO webauthn_challenges (user_id, challenge, type, expires_at)
       VALUES ($1, $2, 'registration', NOW() + INTERVAL '5 minutes')`,
      [userId, options.challenge]
    );

    logger.info('WebAuthn registration challenge generated', {
      userId,
      challenge: options.challenge.substring(0, 10) + '...'
    });

    return options;
  } catch (error) {
    logger.error('Failed to generate registration challenge', {
      userId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * WebAuthn登録レスポンスを検証し、認証器を保存
 *
 * @param {string} userId - ユーザーID
 * @param {object} response - ブラウザからの登録レスポンス
 * @param {string} deviceName - ユーザーが設定したデバイス名
 * @param {string} userAgent - User Agent文字列
 * @returns {Promise<object>} - 検証結果と認証器情報
 */
async function verifyRegistration(userId, response, deviceName, userAgent = '') {
  try {
    // チャレンジを取得
    const challenges = await dbQuery(
      `SELECT challenge FROM webauthn_challenges
       WHERE user_id = $1 AND type = 'registration' AND used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (!challenges.length) {
      throw new Error('Challenge not found or expired');
    }

    const expectedChallenge = challenges[0].challenge;

    // 登録レスポンスを検証
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error('Registration verification failed');
    }

    const { credentialID, credentialPublicKey, counter, aaguid } = verification.registrationInfo;

    // 認証器情報をDBに保存
    const result = await dbQuery(
      `INSERT INTO webauthn_credentials (
        user_id, credential_id, public_key, counter, aaguid,
        device_name, device_type, last_used_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id, device_name, created_at`,
      [
        userId,
        Buffer.from(credentialID).toString('base64'),
        Buffer.from(credentialPublicKey).toString('base64'),
        counter,
        aaguid || null,
        deviceName,
        detectDeviceType(response, userAgent)
      ]
    );

    // チャレンジを使用済みにする
    await dbQuery(
      `UPDATE webauthn_challenges SET used = TRUE
       WHERE user_id = $1 AND challenge = $2`,
      [userId, expectedChallenge]
    );

    // ユーザーのwebauthn_enabledをtrueに更新
    await dbQuery(
      `UPDATE users SET webauthn_enabled = TRUE, webauthn_enabled_at = NOW()
       WHERE id = $1 AND webauthn_enabled = FALSE`,
      [userId]
    );

    logger.info('WebAuthn credential registered successfully', {
      userId,
      credentialId: result[0].id,
      deviceName
    });

    return {
      verified: true,
      credential: result[0]
    };
  } catch (error) {
    logger.error('Failed to verify registration', {
      userId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * WebAuthn認証用のチャレンジとオプションを生成
 *
 * @param {string} userId - ユーザーID
 * @returns {Promise<object>} - 認証オプション
 */
async function generateAuthenticationChallenge(userId) {
  try {
    // ユーザーの認証器を取得
    const credentials = await dbQuery(
      `SELECT credential_id, device_type FROM webauthn_credentials
       WHERE user_id = $1`,
      [userId]
    );

    if (!credentials.length) {
      throw new Error('No credentials found for user');
    }

    // credential_idをBase64からBufferに変換
    const allowCredentials = credentials.map(cred => {
      // device_typeに基づいてtransportsを設定
      let transports = ['internal']; // デフォルトはplatform authenticator

      if (cred.device_type === 'mobile' || cred.device_type === 'desktop') {
        transports = ['internal']; // 内蔵生体認証（Touch ID/Face ID）
      } else if (cred.device_type === 'security_key') {
        transports = ['usb', 'nfc', 'ble']; // 外部セキュリティキー
      }

      return {
        id: Buffer.from(cred.credential_id, 'base64'),
        type: 'public-key',
        transports
      };
    });

    // 認証オプション生成
    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials,
      userVerification: 'required', // 生体認証を必須にする
      timeout: 60000 // 60秒
    });

    // チャレンジをDBに保存（5分間有効）
    await dbQuery(
      `INSERT INTO webauthn_challenges (user_id, challenge, type, expires_at)
       VALUES ($1, $2, 'authentication', NOW() + INTERVAL '5 minutes')`,
      [userId, options.challenge]
    );

    logger.info('WebAuthn authentication challenge generated', {
      userId,
      challenge: options.challenge.substring(0, 10) + '...',
      credentialCount: credentials.length
    });

    return options;
  } catch (error) {
    logger.error('Failed to generate authentication challenge', {
      userId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * WebAuthn認証レスポンスを検証
 *
 * @param {string} userId - ユーザーID
 * @param {object} response - ブラウザからの認証レスポンス
 * @returns {Promise<object>} - 検証結果
 */
async function verifyAuthentication(userId, response) {
  try {
    // チャレンジを取得
    const challenges = await dbQuery(
      `SELECT challenge FROM webauthn_challenges
       WHERE user_id = $1 AND type = 'authentication' AND used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (!challenges.length) {
      throw new Error('Challenge not found or expired');
    }

    const expectedChallenge = challenges[0].challenge;

    // 認証器情報を取得
    // SimpleWebAuthn v9+ では rawId は base64url 文字列として返される
    let credentialIdBase64;
    if (typeof response.rawId === 'string') {
      // base64url文字列の場合、base64に変換
      credentialIdBase64 = base64urlToBase64(response.rawId);
    } else {
      // ArrayBufferの場合（古いバージョン）
      credentialIdBase64 = Buffer.from(response.rawId).toString('base64');
    }

    const credentialsResult = await dbQuery(
      `SELECT id, credential_id, public_key, counter, device_name
       FROM webauthn_credentials
       WHERE user_id = $1 AND credential_id = $2`,
      [userId, credentialIdBase64]
    );

    if (!credentialsResult.length) {
      throw new Error('Credential not found');
    }

    const credential = credentialsResult[0];

    // 認証レスポンスを検証
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      authenticator: {
        credentialID: Buffer.from(credential.credential_id, 'base64'),
        credentialPublicKey: Buffer.from(credential.public_key, 'base64'),
        counter: parseInt(credential.counter)
      },
      requireUserVerification: true
    });

    if (!verification.verified) {
      throw new Error('Authentication verification failed');
    }

    // カウンターを更新（リプレイ攻撃防止）
    await dbQuery(
      `UPDATE webauthn_credentials
       SET counter = $1, last_used_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [verification.authenticationInfo.newCounter, credential.id]
    );

    // チャレンジを使用済みにする
    await dbQuery(
      `UPDATE webauthn_challenges SET used = TRUE
       WHERE user_id = $1 AND challenge = $2`,
      [userId, expectedChallenge]
    );

    logger.info('WebAuthn authentication successful', {
      userId,
      deviceName: credential.device_name
    });

    return {
      verified: true,
      deviceName: credential.device_name
    };
  } catch (error) {
    logger.error('Failed to verify authentication', {
      userId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * ユーザーの登録済み認証器一覧を取得
 *
 * @param {string} userId - ユーザーID
 * @returns {Promise<Array>} - 認証器リスト
 */
async function getUserCredentials(userId) {
  try {
    const credentials = await dbQuery(
      `SELECT id, device_name, device_type, last_used_at, created_at
       FROM webauthn_credentials
       WHERE user_id = $1
       ORDER BY last_used_at DESC NULLS LAST, created_at DESC`,
      [userId]
    );

    return credentials;
  } catch (error) {
    logger.error('Failed to get user credentials', {
      userId,
      error: error.message
    });
    throw error;
  }
}

/**
 * 認証器を削除
 *
 * @param {string} userId - ユーザーID
 * @param {string} credentialId - 認証器ID
 * @returns {Promise<boolean>} - 削除成功/失敗
 */
async function deleteCredential(userId, credentialId) {
  try {
    const result = await dbQuery(
      `DELETE FROM webauthn_credentials
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [credentialId, userId]
    );

    if (!result.length) {
      throw new Error('Credential not found');
    }

    // 残りの認証器がなければwebauthn_enabledをfalseに更新
    const remaining = await dbQuery(
      'SELECT COUNT(*) as count FROM webauthn_credentials WHERE user_id = $1',
      [userId]
    );

    if (remaining[0].count === 0) {
      await dbQuery(
        `UPDATE users SET webauthn_enabled = FALSE, webauthn_enabled_at = NULL
         WHERE id = $1`,
        [userId]
      );
    }

    logger.info('WebAuthn credential deleted', {
      userId,
      credentialId
    });

    return true;
  } catch (error) {
    logger.error('Failed to delete credential', {
      userId,
      credentialId,
      error: error.message
    });
    throw error;
  }
}

/**
 * デバイスタイプを推測
 *
 * @param {object} response - 登録レスポンス
 * @param {string} userAgent - User Agent文字列
 * @returns {string} - デバイスタイプ
 */
function detectDeviceType(response, userAgent = '') {
  // User Agentから推測
  if (userAgent) {
    if (/iPhone|iPad|iPod/.test(userAgent)) return 'mobile';
    if (/Android/.test(userAgent)) return 'mobile';
    if (/Mac/.test(userAgent)) return 'desktop';
    if (/Windows/.test(userAgent)) return 'desktop';
  }

  // レスポンスのタイプから推測
  if (response?.response?.authenticatorAttachment === 'platform') {
    return 'mobile'; // platform authenticatorは通常モバイルデバイス
  }

  return 'desktop'; // デフォルトはデスクトップ
}

/**
 * 期限切れチャレンジのクリーンアップ（定期実行推奨）
 */
async function cleanupExpiredChallenges() {
  try {
    const result = await dbQuery(
      `DELETE FROM webauthn_challenges
       WHERE expires_at < NOW()
       RETURNING id`
    );

    logger.info('Cleaned up expired WebAuthn challenges', {
      count: result.length
    });

    return result.length;
  } catch (error) {
    logger.error('Failed to cleanup expired challenges', {
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  generateRegistrationChallenge,
  verifyRegistration,
  generateAuthenticationChallenge,
  verifyAuthentication,
  getUserCredentials,
  deleteCredential,
  cleanupExpiredChallenges
};
