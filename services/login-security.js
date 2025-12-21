const { pool, dbQuery } = require('./db');

/**
 * ログイン履歴を記録
 * @param {Object} params - ログイン情報
 * @param {string} params.userId - ユーザーID（nullの場合もあり）
 * @param {string} params.email - メールアドレス
 * @param {boolean} params.success - 成功/失敗
 * @param {string} params.ipAddress - IPアドレス
 * @param {string} params.userAgent - User-Agent
 * @param {string} params.failureReason - 失敗理由
 * @param {boolean} params.twoFactorUsed - 2FA使用有無
 * @returns {Promise<void>}
 */
async function recordLoginAttempt({
  userId = null,
  email,
  success,
  ipAddress,
  userAgent,
  failureReason = null,
  twoFactorUsed = false
}) {
  try {
    await dbQuery(
      `INSERT INTO login_history
       (user_id, email, success, ip_address, user_agent, failure_reason, two_factor_used)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, email, success, ipAddress, userAgent, failureReason, twoFactorUsed]
    );
  } catch (err) {
    console.error('Failed to record login attempt:', err);
    // ログ記録の失敗はログイン処理を止めない
  }
}

/**
 * ユーザーの失敗回数をインクリメント
 * @param {string} userId - ユーザーID
 * @returns {Promise<number>} 更新後の失敗回数
 */
async function incrementFailedAttempts(userId) {
  try {
    const result = await dbQuery(
      `UPDATE users
       SET failed_login_attempts = failed_login_attempts + 1,
           last_failed_login_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING failed_login_attempts`,
      [userId]
    );
    return result[0]?.failed_login_attempts || 0;
  } catch (err) {
    console.error('Failed to increment failed attempts:', err);
    return 0;
  }
}

/**
 * ユーザーの失敗回数をリセット
 * @param {string} userId - ユーザーID
 * @returns {Promise<void>}
 */
async function resetFailedAttempts(userId) {
  try {
    await dbQuery(
      `UPDATE users
       SET failed_login_attempts = 0,
           last_failed_login_at = NULL
       WHERE id = $1`,
      [userId]
    );
  } catch (err) {
    console.error('Failed to reset failed attempts:', err);
  }
}

/**
 * アカウントをロック
 * @param {string} userId - ユーザーID
 * @param {string} reason - ロック理由
 * @returns {Promise<void>}
 */
async function lockAccount(userId, reason = 'ログイン試行回数超過') {
  try {
    await dbQuery(
      `UPDATE users
       SET account_locked_at = CURRENT_TIMESTAMP,
           account_locked_reason = $2
       WHERE id = $1`,
      [userId, reason]
    );
  } catch (err) {
    console.error('Failed to lock account:', err);
  }
}

/**
 * アカウントロックを解除
 * @param {string} userId - ユーザーID
 * @returns {Promise<void>}
 */
async function unlockAccount(userId) {
  try {
    await dbQuery(
      `UPDATE users
       SET account_locked_at = NULL,
           account_locked_reason = NULL,
           failed_login_attempts = 0,
           last_failed_login_at = NULL
       WHERE id = $1`,
      [userId]
    );
  } catch (err) {
    console.error('Failed to unlock account:', err);
    throw err;
  }
}

/**
 * アカウントがロックされているかチェック
 * @param {Object} user - ユーザーオブジェクト
 * @returns {boolean} ロック中の場合true
 */
function isAccountLocked(user) {
  return user.account_locked_at !== null && user.account_locked_at !== undefined;
}

/**
 * ログイン履歴を取得
 * @param {string} userId - ユーザーID
 * @param {number} limit - 取得件数
 * @returns {Promise<Array>} ログイン履歴配列
 */
async function getLoginHistory(userId, limit = 20) {
  try {
    const history = await dbQuery(
      `SELECT id, success, ip_address, user_agent, failure_reason,
              two_factor_used, created_at
       FROM login_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return history;
  } catch (err) {
    console.error('Failed to get login history:', err);
    return [];
  }
}

/**
 * 古いログイン履歴を削除（90日以上前）
 * @returns {Promise<number>} 削除件数
 */
async function cleanupOldLoginHistory() {
  try {
    const result = await dbQuery(
      `DELETE FROM login_history
       WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
       RETURNING id`
    );
    return result.length;
  } catch (err) {
    console.error('Failed to cleanup old login history:', err);
    return 0;
  }
}

/**
 * 信頼済みデバイストークンを保存
 * @param {Object} params - デバイス情報
 * @param {string} params.userId - ユーザーID
 * @param {string} params.deviceToken - デバイストークン
 * @param {string} params.deviceName - デバイス名
 * @param {string} params.ipAddress - IPアドレス
 * @param {number} params.expiryDays - 有効期限（日数）デフォルト30日
 * @returns {Promise<void>}
 */
async function saveTrustedDevice({
  userId,
  deviceToken,
  deviceName,
  ipAddress,
  expiryDays = 30
}) {
  try {
    await dbQuery(
      `INSERT INTO trusted_devices
       (user_id, device_token, device_name, ip_address, last_used_at, expires_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '${expiryDays} days')`,
      [userId, deviceToken, deviceName, ipAddress]
    );
  } catch (err) {
    console.error('Failed to save trusted device:', err);
  }
}

/**
 * 信頼済みデバイスを検証
 * @param {string} userId - ユーザーID
 * @param {string} deviceToken - デバイストークン
 * @returns {Promise<boolean>} 有効なトークンの場合true
 */
async function verifyTrustedDevice(userId, deviceToken) {
  try {
    const result = await dbQuery(
      `SELECT id FROM trusted_devices
       WHERE user_id = $1
         AND device_token = $2
         AND expires_at > CURRENT_TIMESTAMP`,
      [userId, deviceToken]
    );

    if (result.length > 0) {
      // 最終使用日時を更新
      await dbQuery(
        `UPDATE trusted_devices
         SET last_used_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [result[0].id]
      );
      return true;
    }

    return false;
  } catch (err) {
    console.error('Failed to verify trusted device:', err);
    return false;
  }
}

/**
 * 信頼済みデバイス一覧を取得
 * @param {string} userId - ユーザーID
 * @returns {Promise<Array>} デバイス一覧
 */
async function getTrustedDevices(userId) {
  try {
    const devices = await dbQuery(
      `SELECT id, device_name, ip_address, last_used_at, expires_at, created_at
       FROM trusted_devices
       WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP
       ORDER BY last_used_at DESC`,
      [userId]
    );
    return devices;
  } catch (err) {
    console.error('Failed to get trusted devices:', err);
    return [];
  }
}

/**
 * 信頼済みデバイスを削除
 * @param {string} userId - ユーザーID
 * @param {string} deviceId - デバイスID
 * @returns {Promise<boolean>} 削除成功の場合true
 */
async function removeTrustedDevice(userId, deviceId) {
  try {
    const result = await dbQuery(
      `DELETE FROM trusted_devices
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [deviceId, userId]
    );
    return result.length > 0;
  } catch (err) {
    console.error('Failed to remove trusted device:', err);
    return false;
  }
}

/**
 * 期限切れの信頼済みデバイスを削除
 * @returns {Promise<number>} 削除件数
 */
async function cleanupExpiredDevices() {
  try {
    const result = await dbQuery(
      `DELETE FROM trusted_devices
       WHERE expires_at < CURRENT_TIMESTAMP
       RETURNING id`
    );
    return result.length;
  } catch (err) {
    console.error('Failed to cleanup expired devices:', err);
    return 0;
  }
}

module.exports = {
  recordLoginAttempt,
  incrementFailedAttempts,
  resetFailedAttempts,
  lockAccount,
  unlockAccount,
  isAccountLocked,
  getLoginHistory,
  cleanupOldLoginHistory,
  saveTrustedDevice,
  verifyTrustedDevice,
  getTrustedDevices,
  removeTrustedDevice,
  cleanupExpiredDevices
};
