const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// 暗号化キー（環境変数から取得）
const ENCRYPTION_KEY = process.env.TWO_FACTOR_ENCRYPTION_KEY || 'default-encryption-key-change-me-in-production';
const ALGORITHM = 'aes-256-gcm';

/**
 * 2FA秘密鍵を生成
 * @returns {Object} { secret, otpauth_url }
 */
function generate2FASecret(email, issuer = 'セッツマルシェ') {
  const secret = speakeasy.generateSecret({
    name: `${issuer} (${email})`,
    issuer: issuer,
    length: 32
  });

  return {
    secret: secret.base32,
    otpauth_url: secret.otpauth_url
  };
}

/**
 * QRコードを生成（Data URL形式）
 * @param {string} otpauth_url - OTPAuth URL
 * @returns {Promise<string>} QRコードのData URL
 */
async function generateQRCode(otpauth_url) {
  try {
    const qrCodeDataURL = await QRCode.toDataURL(otpauth_url);
    return qrCodeDataURL;
  } catch (err) {
    throw new Error('QRコードの生成に失敗しました: ' + err.message);
  }
}

/**
 * 2FAトークンを検証
 * @param {string} secret - Base32秘密鍵
 * @param {string} token - ユーザーが入力した6桁のトークン
 * @param {number} window - 時間ウィンドウ（デフォルト: 1 = ±30秒）
 * @returns {boolean} 検証結果
 */
function verify2FAToken(secret, token, window = 1) {
  try {
    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: window
    });
    return verified;
  } catch (err) {
    console.error('2FA token verification error:', err);
    return false;
  }
}

/**
 * バックアップコードを生成（10個）
 * @returns {Promise<Array<string>>} バックアップコード配列
 */
async function generateBackupCodes() {
  const codes = [];
  for (let i = 0; i < 10; i++) {
    // 8桁のランダムな英数字
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
  }
  return codes;
}

/**
 * バックアップコードをハッシュ化
 * @param {Array<string>} codes - バックアップコード配列
 * @returns {Promise<Array<string>>} ハッシュ化されたコード配列
 */
async function hashBackupCodes(codes) {
  const hashedCodes = [];
  for (const code of codes) {
    const hashed = await bcrypt.hash(code, 10);
    hashedCodes.push(hashed);
  }
  return hashedCodes;
}

/**
 * バックアップコードを検証
 * @param {string} inputCode - ユーザーが入力したコード
 * @param {Array<string>} hashedCodes - ハッシュ化されたコード配列
 * @returns {Promise<{valid: boolean, index: number}>} 検証結果とマッチしたインデックス
 */
async function verifyBackupCode(inputCode, hashedCodes) {
  if (!hashedCodes || hashedCodes.length === 0) {
    return { valid: false, index: -1 };
  }

  for (let i = 0; i < hashedCodes.length; i++) {
    const match = await bcrypt.compare(inputCode, hashedCodes[i]);
    if (match) {
      return { valid: true, index: i };
    }
  }

  return { valid: false, index: -1 };
}

/**
 * 2FA秘密鍵を暗号化
 * @param {string} secret - Base32秘密鍵
 * @returns {string} 暗号化された秘密鍵（iv:authTag:encrypted の形式）
 */
function encrypt2FASecret(secret) {
  try {
    // 32バイトのキーを生成（SHA-256でハッシュ化）
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();

    // 初期化ベクトル（IV）を生成
    const iv = crypto.randomBytes(16);

    // 暗号化
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // 認証タグを取得
    const authTag = cipher.getAuthTag();

    // iv:authTag:encrypted の形式で返す
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (err) {
    throw new Error('秘密鍵の暗号化に失敗しました: ' + err.message);
  }
}

/**
 * 2FA秘密鍵を復号化
 * @param {string} encryptedSecret - 暗号化された秘密鍵
 * @returns {string} Base32秘密鍵
 */
function decrypt2FASecret(encryptedSecret) {
  try {
    // iv:authTag:encrypted の形式から分割
    const parts = encryptedSecret.split(':');
    if (parts.length !== 3) {
      throw new Error('無効な暗号化形式');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    // 32バイトのキーを生成
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();

    // 復号化
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    throw new Error('秘密鍵の復号化に失敗しました: ' + err.message);
  }
}

/**
 * デバイストークンを生成
 * @returns {string} ランダムなデバイストークン
 */
function generateDeviceToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * User-Agentからデバイス名を生成
 * @param {string} userAgent - User-Agent文字列
 * @returns {string} デバイス名
 */
function parseDeviceName(userAgent) {
  if (!userAgent) return '不明なデバイス';

  // 簡易的なパース（実際にはua-parser-jsなどを使うとより正確）
  let deviceName = '不明なデバイス';

  if (userAgent.includes('iPhone')) deviceName = 'iPhone';
  else if (userAgent.includes('iPad')) deviceName = 'iPad';
  else if (userAgent.includes('Android')) deviceName = 'Android';
  else if (userAgent.includes('Windows')) deviceName = 'Windows PC';
  else if (userAgent.includes('Macintosh')) deviceName = 'Mac';
  else if (userAgent.includes('Linux')) deviceName = 'Linux PC';

  // ブラウザ情報を追加
  if (userAgent.includes('Chrome')) deviceName += ' (Chrome)';
  else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) deviceName += ' (Safari)';
  else if (userAgent.includes('Firefox')) deviceName += ' (Firefox)';
  else if (userAgent.includes('Edge')) deviceName += ' (Edge)';

  return deviceName;
}

module.exports = {
  generate2FASecret,
  generateQRCode,
  verify2FAToken,
  generateBackupCodes,
  hashBackupCodes,
  verifyBackupCode,
  encrypt2FASecret,
  decrypt2FASecret,
  generateDeviceToken,
  parseDeviceName
};
