const { S3Client } = require('@aws-sdk/client-s3');

const R2_ACCOUNT_ID       = process.env.R2_ACCOUNT_ID || '';
const R2_BUCKET           = process.env.R2_BUCKET_NAME || '';
const R2_ACCESS_KEY_ID    = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY= process.env.R2_SECRET_ACCESS_KEY || '';
const R2_ENDPOINT         = process.env.R2_ENDPOINT || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '');
const R2_PUBLIC_BASE_URL  = process.env.R2_PUBLIC_BASE_URL || ''; // 例: 画像配信用カスタムドメイン

// R2設定の検証（未設定でも起動できるようにする）
const isR2Configured = R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET;

if (!isR2Configured) {
  console.warn('[R2] R2環境変数が設定されていません。R2機能は使用できません。');
  console.warn('[R2] 必要な環境変数: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME');
} 

// S3互換クライアント（Cloudflare R2）
// 環境変数が未設定の場合は null を返す（使用時にエラーを投げる）
const r2 = isR2Configured ? new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  }
}) : null;

module.exports = {
  r2,
  R2_BUCKET,
  R2_PUBLIC_BASE_URL,
  isR2Configured
};