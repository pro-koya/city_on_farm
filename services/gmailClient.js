// gmailClient.js
const { google } = require('googleapis');
const { pool, dbQuery } = require('./db');
const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  GMAIL_SCOPE_SEND = 'https://www.googleapis.com/auth/gmail.send'
} = process.env;

// OAuth2 クライアント生成
function createOAuth2Client() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

// === DBにトークンを保存 ===
async function saveToken(token) {
  await dbQuery(
    `INSERT INTO gmail_tokens (id, token_json, updated_at)
     VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE
       SET token_json = EXCLUDED.token_json, updated_at = now()`,
    [token]
  );
}

// === DBからトークンを読み込み ===
async function loadToken() {
  const rows = await dbQuery(`SELECT token_json FROM gmail_tokens WHERE id=1`);
  return rows.length ? rows[0].token_json : null;
}

// === 認可URL生成 ===
function generateAuthUrl() {
  const oAuth2Client = createOAuth2Client();
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [GMAIL_SCOPE_SEND]
  });
}

// === 認可コード→トークン交換 ===
async function getTokenFromCode(code) {
  const oAuth2Client = createOAuth2Client();
  const { tokens } = await oAuth2Client.getToken(code);
  await saveToken(tokens);
  return tokens;
}

// === 認可済みクライアント取得 ===
async function getAuthedClient() {
  const oAuth2Client = createOAuth2Client();
  const token = await loadToken();
  if (!token) throw new Error('Gmail API not authorized yet. Visit /oauth2/start');

  oAuth2Client.setCredentials(token);

  // refresh_token更新時にDBへ自動保存
  oAuth2Client.on('tokens', async (t) => {
    const merged = { ...token, ...t };
    await saveToken(merged);
  });

  return oAuth2Client;
}

module.exports = {
  generateAuthUrl,
  getTokenFromCode,
  getAuthedClient,
};