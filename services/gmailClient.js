// gmailClient.js
const fs = require('fs/promises');
const path = require('path');
const { google } = require('googleapis');

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  GMAIL_SCOPE_SEND = 'https://www.googleapis.com/auth/gmail.send',
  GMAIL_TOKEN_PATH = './gmail_token.json',
  GMAIL_TOKEN_JSON
} = process.env;

function createOAuth2Client() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

async function loadSavedToken() {
  // 1) 環境変数に JSON を保持している場合はそれを優先
  if (GMAIL_TOKEN_JSON) {
    try {
      return JSON.parse(GMAIL_TOKEN_JSON);
    } catch {}
  }
  // 2) ファイルから読む
  try {
    const p = path.resolve(GMAIL_TOKEN_PATH);
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveToken(token) {
  const p = path.resolve(GMAIL_TOKEN_PATH);
  // ディレクトリが無い場合を考慮
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(token, null, 2), 'utf8');
  // パーミッション（ローカルの安全対策、RenderでもOK）
  try { await fs.chmod(p, 0o600); } catch {}
}

function generateAuthUrl(state) {
  const oAuth2Client = createOAuth2Client();
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [GMAIL_SCOPE_SEND],
    state: state || '' // ← ここで復帰先を持ち回す
  });
}

async function getTokenFromCode(code) {
  const oAuth2Client = createOAuth2Client();
  const { tokens } = await oAuth2Client.getToken(code);
  await saveToken(tokens);
  return tokens;
}

async function getAuthedClient() {
  const oAuth2Client = createOAuth2Client();
  const token = await loadSavedToken();
  if (!token) throw new Error('Gmail API not authorized yet. Ask an admin to visit /oauth2/start');
  oAuth2Client.setCredentials(token);

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