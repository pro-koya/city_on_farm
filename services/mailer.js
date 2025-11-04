// gmailSend.js
const { google } = require('googleapis');
const { getAuthedClient } = require('./gmailClient');
const { encode } = require('base64url'); // npm i base64url

const GMAIL_SENDER = process.env.GMAIL_SENDER || process.env.MAIL_FROM || 'no-reply@example.com';

/** 配列/文字列どちらでも "a@x, b@y" にして返す */
function toList(v) {
  if (!v) return '';
  if (Array.isArray(v)) return v.filter(Boolean).join(', ');
  return String(v);
}

/** RFC822 のヘッダ用に From を整形（"表示名 <addr>" or そのまま） */
function formatFrom(from) {
  // すでに "Name <addr>" 形式ならそのまま
  if (typeof from === 'string' && /<[^>]+>/.test(from)) return from;
  return String(from || GMAIL_SENDER);
}

// 非ASCIIを含むヘッダ値を RFC 2047 (encoded-word) でUTF-8 Base64化
function encodeMimeWord(str = '') {
  // ASCIIのみならそのまま
  if (/^[\x00-\x7F]*$/.test(str)) return str;
  const b64 = Buffer.from(String(str), 'utf8').toString('base64');
  return `=?UTF-8?B?${b64}?=`;
}

// "表示名 <addr@example.com>" の表示名だけエンコード
function encodeDisplayNameAddress(from) {
  const s = String(from || '');
  const m = s.match(/^\s*"?([^"<]+)?"?\s*<([^>]+)>\s*$/);
  if (!m) {
    // 住所のみなど。非ASCIIを含まない前提でそのまま返す
    return s;
  }
  const display = m[1]?.trim() || '';
  const addr = m[2].trim();
  const encodedDisplay = display ? encodeMimeWord(display) : '';
  return encodedDisplay ? `${encodedDisplay} <${addr}>` : `<${addr}>`;
}

/** multipart/alternative を組む（textのみ/HTMLあり両対応） */
function buildRFC822({ from, to, subject, text, html, bcc, replyTo }) {
  from = formatFrom(from);
  const fromHeader = /<[^>]+>/.test(from) ? encodeDisplayNameAddress(from) : from;
  const toHeader  = toList(to);
  const bccHeader = toList(bcc);
  const subjHeader = encodeMimeWord(subject);

  // HTML未指定ならプレーンテキストのみ
  if (!html) {
    const headers = [
      `From: ${fromHeader}`,
      `To: ${toHeader}`,
      ...(bccHeader ? [`Bcc: ${bccHeader}`] : []),
      ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
      `Subject: ${subjHeader}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      text || ''
    ].join('\r\n');
    return headers;
  }

  // multipart
  const boundary = '=_cafebabe_' + Date.now();
  const parts = [
    `From: ${fromHeader}`,
    `To: ${toHeader}`,
    ...(bccHeader ? [`Bcc: ${bccHeader}`] : []),
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Subject: ${subjHeader}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    text || '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    html,
    `--${boundary}--`,
    ''
  ].join('\r\n');

  return parts;
}

/**
 * Gmail API 送信
 * @param {Object} params
 * @param {string|string[]} params.to
 * @param {string} params.subject
 * @param {string} [params.text]
 * @param {string} [params.html]
 * @param {string|string[]} [params.bcc]
 * @param {string} [params.from]
 * @param {string} [params.replyTo]
 */
async function gmailSend({ to, subject, text = '', html = '', bcc, from = GMAIL_SENDER, replyTo }) {
  let auth;
  try {
    auth = await getAuthedClient();
  } catch (e) {
    // ここは「管理者が未認可」のケース。サーバー側なので location.href は使えない。
    // ルート側（呼び出し元）でこのメッセージを拾い、管理者に /oauth2/start を案内してください。
    console.error('Gmail auth missing:', e.message);
    throw new Error('Gmail API が未認可です。管理者は /oauth2/start にアクセスして認可を完了してください。');
  }

  const gmail = google.gmail({ version: 'v1', auth });

  const raw = buildRFC822({ from, to, subject, text, html, bcc, replyTo });
  const raw64 = encode(Buffer.from(raw, 'utf8')); // URL-safe Base64 (no padding)

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: raw64 }
  });

  // Nodemailer/Etherealのような previewUrl は返らない
  return { id: res.data?.id || null };
}

module.exports = { gmailSend };