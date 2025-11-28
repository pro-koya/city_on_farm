// services/db.js
const { Pool } = require('pg');

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

const pool = new Pool({
  connectionString: dbUrl,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 15_000,
  connectionTimeoutMillis: 10_000
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  // ここでアラート飛ばしたり、ログ送ったりもできる
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