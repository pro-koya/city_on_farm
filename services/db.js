// services/db.js
const { Pool } = require('pg');
const logger = require('./logger');

const isProd = process.env.NODE_ENV === 'production';

// Render本番: External_Database_URL
// ローカル: PGURL（または DATABASE_URL）
const dbUrl =
  process.env.External_Database_URL ||
  process.env.PGURL ||
  process.env.DATABASE_URL;

if (!dbUrl) {
  console.warn('[DB] connection string is not set. Use External_Database_URL or PGURL or DATABASE_URL.');
}

const useSSL = isProd || /\brender\.com\b/.test(dbUrl) || process.env.PGSSL === '1';

// SSL設定: 本番環境では証明書検証を有効化（Render.comなど一部サービスでは無効化が必要）
// 環境変数 DB_SSL_REJECT_UNAUTHORIZED=false で明示的に無効化可能
const sslConfig = (() => {
  if (!useSSL) return false;

  // 環境変数で明示的に無効化されている場合
  if (process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false') {
    return { rejectUnauthorized: false };
  }

  // 本番環境かつCA証明書が提供されている場合
  if (isProd && process.env.DB_CA_CERT) {
    return {
      rejectUnauthorized: true,
      ca: process.env.DB_CA_CERT
    };
  }

  // Render.comの場合は rejectUnauthorized: false（Renderの仕様）
  if (/\brender\.com\b/.test(dbUrl)) {
    return { rejectUnauthorized: false };
  }

  // デフォルト: 本番環境では検証を有効化
  return isProd ? { rejectUnauthorized: true } : { rejectUnauthorized: false };
})();

const pool = new Pool({
  connectionString: dbUrl,
  ssl: sslConfig,
  max: 10,
  idleTimeoutMillis: 15_000,
  connectionTimeoutMillis: 10_000
});

pool.on('error', (err, client) => {
  logger.error('Unexpected error on idle database client', {
    error: err.message,
    stack: err.stack
  });
});

async function dbQuery(text, params = []) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res.rows;
  } finally {
    client.release();
  }
}

module.exports = { pool, dbQuery };