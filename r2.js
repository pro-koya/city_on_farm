const { S3Client } = require('@aws-sdk/client-s3');

const R2_ACCOUNT_ID       = process.env.R2_ACCOUNT_ID || '';
const R2_BUCKET           = process.env.R2_BUCKET_NAME || '';
const R2_ACCESS_KEY_ID    = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY= process.env.R2_SECRET_ACCESS_KEY || '';
const R2_ENDPOINT         = process.env.R2_ENDPOINT || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '');
const R2_PUBLIC_BASE_URL  = process.env.R2_PUBLIC_BASE_URL || ''; // 例: 画像配信用カスタムドメイン

console.log("Bucket:", process.env.R2_BUCKET_NAME);
console.log("Endpoint:", process.env.R2_ENDPOINT);

if (!R2_ENDPOINT) throw new Error('R2_ENDPOINT is not set');
if (!R2_ACCESS_KEY_ID) throw new Error('R2_ACCESS_KEY_ID is not set');
if (!R2_SECRET_ACCESS_KEY) throw new Error('R2_SECRET_ACCESS_KEY is not set');
if (!R2_BUCKET) throw new Error('R2_BUCKET_NAME is not set'); 

// S3互換クライアント（Cloudflare R2）
const r2 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  }
});

module.exports = {
  r2,
  R2_BUCKET,
  R2_PUBLIC_BASE_URL
};