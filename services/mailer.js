// mailer.js
const nodemailer = require('nodemailer');

let transporterPromise = null;
const bool = v => String(v).toLowerCase() === 'true';

/**
 * 初期化: provider に応じて transporter を用意（シングルトン）
 */
async function getTransporter() {
  if (transporterPromise) return transporterPromise;
  transporterPromise = (async () => {

    // 既定は SMTP（Gmail想定）
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 587),
      secure: bool(process.env.SMTP_SECURE || 'false'),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      }
    });
  })();
  return transporterPromise;
}

/** ヘッダインジェクションの軽いガード */
function sanitizeHeader(v) {
  return String(v || '').replace(/[\r\n]+/g, ' ').slice(0, 300);
}

/**
 * メール送信のユーティリティ
 * @param {Object} opts
 * @param {string} opts.from
 * @param {string|string[]} opts.to
 * @param {string} opts.subject
 * @param {string} [opts.text]
 * @param {string} [opts.html]
 * @param {string} [opts.replyTo]
 * @returns {Promise<{messageId:string, previewUrl?:string}>}
 */
async function sendMail(opts) {
  const transporter = await getTransporter();
  const from = sanitizeHeader(opts.from || process.env.MAIL_FROM || process.env.SMTP_USER);
  const to = opts.to;
  const subject = sanitizeHeader(opts.subject || '(no subject)');
  const replyTo = opts.replyTo ? sanitizeHeader(opts.replyTo) : undefined;

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text: opts.text,
    html: opts.html,
    replyTo
  });

  // Ethereal の場合、プレビューURLが取れる
  const previewUrl = nodemailer.getTestMessageUrl ? nodemailer.getTestMessageUrl(info) : null;

  return { messageId: info.messageId, previewUrl };
}

module.exports = { sendMail };