// server.js
const path = require('path');
try { require('dotenv').config(); } catch { /* no-op */ }

// ============================================================
// 【1】起動直後のエラーハンドリング設定
// ============================================================
process.on('uncaughtException', (error) => {
  console.error('=== UNCAUGHT EXCEPTION ===');
  console.error('Error:', error);
  console.error('Stack:', error.stack);
  console.error('==========================');
  // 本番環境ではプロセスを終了、開発環境では継続（デバッグのため）
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('=== UNHANDLED REJECTION ===');
  console.error('Reason:', reason);
  if (reason instanceof Error) {
    console.error('Stack:', reason.stack);
  }
  console.error('Promise:', promise);
  console.error('============================');
  // 本番環境ではプロセスを終了、開発環境では継続（デバッグのため）
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// ============================================================
// 【2】環境変数の防御的チェック
// ============================================================
const logger = require('./services/logger');

const missingEnvVars = [];
if (!process.env.SESSION_SECRET) {
  missingEnvVars.push('SESSION_SECRET');
}
if (!process.env.DATABASE_URL && !process.env.External_Database_URL && !process.env.PGURL) {
  missingEnvVars.push('DATABASE_URL (または External_Database_URL または PGURL)');
}
if (!process.env.STRIPE_SECRET_KEY) {
  missingEnvVars.push('STRIPE_SECRET_KEY');
}

if (missingEnvVars.length > 0) {
  const errorMsg = `以下の環境変数が設定されていません:\n${missingEnvVars.map(v => `  - ${v}`).join('\n')}\n\nサーバーを起動できません。環境変数を設定してください。`;
  logger.error(errorMsg);
  console.error(errorMsg);
  process.exit(1);
}

// PORT はデフォルト値があるため警告のみ
const PORT = process.env.PORT || 3000;
if (!process.env.PORT) {
  logger.warn(`PORT 環境変数が設定されていません。デフォルト値 ${PORT} を使用します。`);
}

const express = require('express');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const helmet  = require('helmet');
const csrf    = require('csurf');
const rateLimit = require('express-rate-limit');
const bcrypt  = require('bcryptjs');
const { body, validationResult, param } = require('express-validator');
const multer = require('multer');
const ejs = require('ejs');
const fs = require('fs');
const { PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { r2, R2_BUCKET, R2_PUBLIC_BASE_URL, isR2Configured } = require('./r2');
const { randomUUID } = require('crypto');
const { generateAuthUrl, getTokenFromCode, getAuthedClient } = require('./services/gmailClient');
const { gmailSend } = require('./services/mailer');
const stripe = require('./lib/stripe');
// 2FA関連ユーティリティ
const twoFA = require('./services/2fa');
const loginSecurity = require('./services/login-security');

const app = express();
const isProd = process.env.NODE_ENV === 'production';
const APP_ORIGIN = process.env.APP_ORIGIN || (isProd ? null : 'http://localhost:3000');
app.set('trust proxy', 1);

// Renderの接続文字列（環境変数に置くのが推奨）
const { pool, dbQuery } = require('./services/db');
app.locals.db = pool;

/* ========== MIME ========== */
const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'
]);
const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif'
};

/* ========== Multer (File Upload) ========== */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,  // 10MB
    files: 8  // 最大8ファイル
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('許可されていないファイル形式です。JPEG、PNG、WebP、AVIF、GIF のみアップロード可能です。'), false);
    }
  }
});

/* ========== View / Static ========== */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  '/fonts/noto-sans-jp',
  express.static(
    path.join(__dirname, 'node_modules', '@fontsource', 'noto-sans-jp', 'files'),
    { immutable: true, maxAge: '1y' }
  )
);

/* ========== Stripe Webhook (Raw Body Required) ========== */
// Webhookエンドポイントは express.json() の前に配置する必要がある
app.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    console.log('[DEBUG] /webhooks/stripe handler ENTERED - this should appear if route is matched');
    logger.info('Stripe webhook received:', {
      path: req.path,
      url: req.url,
      method: req.method,
      headers: {
        'stripe-signature': req.headers['stripe-signature'] ? 'present' : 'missing',
        'content-type': req.headers['content-type'],
        'content-length': req.headers['content-length']
      },
      bodySize: req.body ? req.body.length : 0,
      timestamp: new Date().toISOString()
    });

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.error('STRIPE_WEBHOOK_SECRET is not set');
      return res.status(500).send('Webhook secret not configured');
    }

    let event;

    try {
      // Stripe署名を検証
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      logger.info('Stripe webhook signature verified:', {
        eventId: event.id,
        eventType: event.type,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      logger.error('Webhook signature verification failed', {
        error: err.message,
        stack: err.stack,
        signaturePresent: !!sig,
        bodySize: req.body ? req.body.length : 0,
        timestamp: new Date().toISOString()
      });
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      // イベントタイプに応じて処理
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          logger.info('Checkout session completed', {
            sessionId: session.id,
            paymentStatus: session.payment_status
          });

          // セッションIDで注文を検索
          const orders = await dbQuery(
            `SELECT id, order_number, payment_status
             FROM orders
             WHERE payment_provider = 'stripe'
               AND payment_external_id = $1`,
            [session.id]
          );

          if (!orders.length) {
            // metadata から order_number で検索
            const orderNumber = session.metadata?.order_number;
            if (orderNumber) {
              const ordersByNumber = await dbQuery(
                `SELECT id, order_number, payment_status
                 FROM orders
                 WHERE order_number = $1`,
                [orderNumber]
              );
              if (ordersByNumber.length) {
                orders.push(ordersByNumber[0]);
              }
            }
          }

          if (!orders.length) {
            logger.warn('Order not found for checkout session', { sessionId: session.id });
            return res.json({ received: true });
          }

          const order = orders[0];

          // payment_status を更新（決済完了）
          await dbQuery(
            `UPDATE orders
             SET payment_status = 'paid',
                 payment_txid = $1,
                 updated_at = now()
             WHERE id = $2
               AND payment_status != 'paid'`,
            [session.payment_intent, order.id]
          );

          logger.info('Order payment status updated to paid', {
            orderId: order.id,
            orderNumber: order.order_number
          });

          // ★★★ 台帳計上処理を追加 ★★★
          try {
            const { recordSaleAndFee } = require('./services/ledger');

            // 注文の詳細情報を取得（seller_id, total が必要）
            const orderDetails = await dbQuery(
              `SELECT id, seller_id, total FROM orders WHERE id = $1`,
              [order.id]
            );

            if (orderDetails.length) {
              const chargeId = session.charges?.data?.[0]?.id || null;
              await recordSaleAndFee(
                orderDetails[0],
                session.payment_intent,
                chargeId
              );
              logger.info('Ledger entries created for order', {
                orderId: order.id
              });
            }
          } catch (ledgerError) {
            logger.error('Failed to record ledger for order', {
              orderId: order.id,
              error: ledgerError.message,
              stack: ledgerError.stack
            });
            // 台帳計上失敗してもStripeには成功を返す（後で手動修正可能）
          }

          break;
        }

        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object;
          logger.info('PaymentIntent succeeded', {
            paymentIntentId: paymentIntent.id
          });

          // payment_txid で注文を検索
          const orders = await dbQuery(
            `SELECT id, order_number, payment_status
             FROM orders
             WHERE payment_txid = $1`,
            [paymentIntent.id]
          );

          if (!orders.length) {
            logger.warn('Order not found for payment intent', {
              paymentIntentId: paymentIntent.id
            });
            return res.json({ received: true });
          }

          const order = orders[0];

          // payment_status を確実に paid に更新
          await dbQuery(
            `UPDATE orders
             SET payment_status = 'paid',
                 updated_at = now()
             WHERE id = $1
               AND payment_status != 'paid'`,
            [order.id]
          );

          logger.info('Order payment confirmed', {
            orderId: order.id,
            orderNumber: order.order_number
          });
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object;
          logger.error('PaymentIntent failed', {
            paymentIntentId: paymentIntent.id,
            lastError: paymentIntent.last_payment_error
          });

          // payment_txid で注文を検索
          const orders = await dbQuery(
            `SELECT id, order_number, payment_status
             FROM orders
             WHERE payment_txid = $1
                OR payment_external_id = $2`,
            [paymentIntent.id, paymentIntent.id]
          );

          if (!orders.length) {
            logger.warn('Order not found for failed payment intent', {
              paymentIntentId: paymentIntent.id
            });
            return res.json({ received: true });
          }

          const order = orders[0];

          // payment_status を failed に更新
          await dbQuery(
            `UPDATE orders
             SET payment_status = 'failed',
                 updated_at = now()
             WHERE id = $1`,
            [order.id]
          );

          logger.info('Order payment marked as failed', {
            orderId: order.id,
            orderNumber: order.order_number
          });
          break;
        }

        case 'charge.refunded': {
          const charge = event.data.object;
          logger.info('Charge refunded', {
            chargeId: charge.id,
            amount: charge.amount_refunded
          });

          // payment_txid で注文を検索
          const orders = await dbQuery(
            `SELECT id, order_number, payment_status
             FROM orders
             WHERE payment_txid = $1`,
            [charge.payment_intent]
          );

          if (!orders.length) {
            logger.warn('Order not found for refunded charge', {
              chargeId: charge.id
            });
            return res.json({ received: true });
          }

          const order = orders[0];

          // payment_status を refunded に更新
          await dbQuery(
            `UPDATE orders
             SET payment_status = 'refunded',
                 updated_at = now()
             WHERE id = $1`,
            [order.id]
          );

          logger.info('Order payment marked as refunded', {
            orderId: order.id,
            orderNumber: order.order_number
          });

          // ★★★ 台帳計上処理を追加（冪等性あり） ★★★
          try {
            // 返金情報を取得
            const refunds = charge.refunds?.data || [];

            for (const refund of refunds) {
              const idempotencyKey = `refund-${refund.id}`;

              // 既に台帳エントリが存在するかチェック
              const existingEntries = await dbQuery(
                'SELECT id FROM ledger WHERE idempotency_key = $1',
                [idempotencyKey]
              );

              if (existingEntries.length > 0) {
                logger.info('Refund ledger entry already exists', {
                  refundId: refund.id,
                  orderId: order.id
                });
                continue;
              }

              // 出品者を取得
              const orderDetails = await dbQuery(
                `SELECT o.id, o.seller_id, u.partner_id
                 FROM orders o
                 JOIN users u ON u.id = o.seller_id
                 WHERE o.id = $1`,
                [order.id]
              );

              if (orderDetails.length && orderDetails[0].partner_id) {
                const partnerId = orderDetails[0].partner_id;

                // 台帳に返金エントリ作成
                await dbQuery(
                  `INSERT INTO ledger (
                     partner_id, order_id, type, amount_cents, currency,
                     status, available_at, stripe_refund_id, idempotency_key, note
                   ) VALUES ($1, $2, 'refund', $3, 'jpy', 'available', now(), $4, $5, $6)
                   ON CONFLICT (idempotency_key) DO NOTHING`,
                  [
                    partnerId,
                    order.id,
                    -refund.amount, // マイナス値
                    refund.id,
                    idempotencyKey,
                    `Webhook経由の返金計上 (Charge: ${charge.id})`
                  ]
                );

                logger.info('Refund ledger entry created via webhook', {
                  refundId: refund.id,
                  orderId: order.id,
                  amount: refund.amount
                });

                // 残高確認と負債処理
                const balanceRows = await dbQuery(
                  `SELECT COALESCE(SUM(amount_cents), 0)::int AS balance
                   FROM ledger
                   WHERE partner_id = $1 AND status IN ('available', 'pending')`,
                  [partnerId]
                );

                const balance = balanceRows[0].balance;

                if (balance < 0) {
                  const debtAmount = Math.abs(balance);

                  await dbQuery(
                    `UPDATE partners SET debt_cents = $1, updated_at = now()
                     WHERE id = $2`,
                    [debtAmount, partnerId]
                  );

                  if (debtAmount > 10000) {
                    await dbQuery(
                      `UPDATE partners SET
                         payouts_enabled = false,
                         stop_reason = 'debt_over_10000',
                         updated_at = now()
                       WHERE id = $1`,
                      [partnerId]
                    );

                    logger.warn('Partner payouts disabled via webhook (debt over 10,000)', {
                      partnerId,
                      debtAmount
                    });
                  }
                }
              }
            }
          } catch (ledgerError) {
            logger.error('Failed to process refund ledger via webhook', {
              chargeId: charge.id,
              orderId: order.id,
              error: ledgerError.message,
              stack: ledgerError.stack
            });
            // エラーでもStripeには成功を返す
          }

          break;
        }

        case 'account.updated': {
          const account = event.data.object;
          logger.info('Stripe Connect account updated', {
            accountId: account.id,
            detailsSubmitted: account.details_submitted,
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled
          });

          try {
            const { syncConnectAccount } = require('./services/stripe-connect');
            await syncConnectAccount(account.id);
            logger.info('Stripe Connect account synced via webhook', {
              accountId: account.id
            });
          } catch (syncError) {
            logger.error('Failed to sync account via webhook', {
              accountId: account.id,
              error: syncError.message,
              stack: syncError.stack
            });
          }
          break;
        }

        default:
          logger.debug('Unhandled webhook event type', { type: event.type });
      }

      // Stripeに成功を返す
      logger.info('Stripe webhook processed successfully:', {
        eventId: event.id,
        eventType: event.type,
        timestamp: new Date().toISOString()
      });
      res.json({ received: true });
    } catch (err) {
      logger.error('Webhook processing error', {
        error: err.message,
        stack: err.stack,
        eventType: event?.type || 'unknown',
        eventId: event?.id || 'unknown',
        timestamp: new Date().toISOString()
      });
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

/* ========== Parsers / Security ========== */
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",  // インラインスクリプトを許可（既存コードのため）
        "https://cdn.jsdelivr.net",  // flatpickr などのCDNスクリプト
        "https://yubinbango.github.io",  // yubinbango.js (郵便番号自動入力)
        "https://accounts.google.com",  // Google OAuth
        "https://www.google.com",  // Google reCAPTCHA (使用している場合)
        "https://checkout.stripe.com",  // Stripe Checkout
        "https://cdn.quilljs.com",
        "https://unpkg.com"  // WebAuthn ライブラリ（@simplewebauthn/browser）
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",  // インラインスタイルを許可
        "https://cdn.jsdelivr.net",  // flatpickr などのCDNスタイルシート
        "https://cdn.quilljs.com"
      ],
      imgSrc: [
        "'self'",
        "https:",  // HTTPS画像を許可
        "data:",   // Data URI を許可
        "blob:"    // Blob URL を許可
      ],
      fontSrc: [
        "'self'",
        "data:"
      ],
      connectSrc: [
        "'self'",
        "https://accounts.google.com",  // Google OAuth
        "https://checkout.stripe.com",  // Stripe Checkout
        "https://19671250ed2c97b13f42b5fa1ad2937f.r2.cloudflarestorage.com",  // R2 Storage endpoint
        "https://pub-9040eb2ad9a74fd79cd99e09fb479b95.r2.dev",  // R2 Public URL
        "https://cityonfirm.19671250ed2c97b13f42b5fa1ad2937f.r2.cloudflarestorage.com"
      ],
      frameSrc: [
        "'self'",
        "https://accounts.google.com",  // Google OAuth
        "https://www.google.com",  // Google reCAPTCHA
        "https://checkout.stripe.com"  // Stripe Checkout
      ],
      formAction: ["'self'", "https://checkout.stripe.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: isProd ? [] : null  // 本番環境のみHTTPSへアップグレード
    }
  }
}));

/* ========== Session ========== */
app.use(session({
  name: 'cof.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

/* ========== CSRF ========== */
// デフォルトの ignoreMethods(['GET','HEAD','OPTIONS']) を使う
// これで「閲覧系は発行のみ・更新系(POST等)は検証」になる
const csrfBrowseOnly = csrf();

// Stripe webhookなど、外部からのPOSTリクエストを受け付けるパスを除外
app.use((req, res, next) => {
  // webhookエンドポイントはCSRF保護をスキップ
  // パスのマッチングを複数の方法で確認（Renderのリバースプロキシ対応）
  const isWebhookPath = 
    req.path === '/webhooks/stripe' || 
    req.url === '/webhooks/stripe' || 
    req.originalUrl === '/webhooks/stripe' ||
    (req.path && req.path.includes('webhooks/stripe')) ||
    (req.url && req.url.includes('webhooks/stripe')) ||
    (req.originalUrl && req.originalUrl.includes('webhooks/stripe'));
  
  // Stripeのwebhookリクエストを識別（stripe-signatureヘッダーの存在）
  const hasStripeSignature = !!req.headers['stripe-signature'];
  
  if (isWebhookPath || hasStripeSignature) {
    console.log('[DEBUG] CSRF middleware: Skipping CSRF for webhook', {
      isWebhookPath,
      hasStripeSignature,
      path: req.path,
      url: req.url,
      originalUrl: req.originalUrl
    });
    logger.info('Skipping CSRF for webhook:', {
      path: req.path,
      url: req.url,
      originalUrl: req.originalUrl,
      method: req.method,
      headers: {
        'stripe-signature': req.headers['stripe-signature'] ? 'present' : 'missing',
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent'],
        'origin': req.headers['origin'],
        'referer': req.headers['referer']
      },
      timestamp: new Date().toISOString()
    });
    return next();
  }
  
  // CSRF保護を適用する前に、CSRFエラーが発生した場合のログを追加
  const originalNext = next;
  next = (err) => {
    if (err && err.code === 'EBADCSRFTOKEN') {
      console.log('[DEBUG] CSRF ERROR detected:', {
        path: req.path,
        url: req.url,
        method: req.method,
        errorCode: err.code
      });
      logger.warn('CSRF token validation failed:', {
        path: req.path,
        url: req.url,
        method: req.method,
        headers: {
          'origin': req.headers['origin'],
          'referer': req.headers['referer'],
          'user-agent': req.headers['user-agent']
        },
        hasCsrfToken: !!req.body?._csrf,
        timestamp: new Date().toISOString()
      });
    }
    originalNext(err);
  };
  
  csrfBrowseOnly(req, res, next);
});

// ルート単位で multer 後に検証したい場合のハンドラ
const csrfProtect = csrf();

/* ========== 共通locals（ログイン情報 / CSRF / カート件数 / 未読お知らせ数） ========== */
app.use(async (req, res, next) => {
  try {
    // ログインユーザー
    const user = req.session?.user || null;
    res.locals.currentUser = user;

    // CSRF トークン（あれば）
    if (typeof req.csrfToken === 'function') {
      try {
        res.locals.csrfToken = req.csrfToken();
      } catch {
        // トークン未生成時などは無視
      }
    }

    // フォント配信（既存処理）
    if (req.path.endsWith('.woff2')) res.type('font/woff2');

    // カート件数：デフォルトはセッション内（未ログイン / エラー時フォールバック）
    const sessItems = req.session?.cart?.items || [];
    res.locals.cartCount = sessItems.length;

    // 未読お知らせ数：デフォルト 0
    res.locals.unreadNoticeCount = 0;

    // ログインしていない場合はここで終了
    if (!user || !user.id) {
      return next();
    }

    const uid   = user.id;
    const roles = Array.isArray(user.roles) ? user.roles : [];

    // DB からカート件数 & 未読お知らせ数をまとめて取得
    const [cartRows, noticeRows] = await Promise.all([
      // carts / cart_items 構成（saved_for_later は集計に含めない想定）
      dbQuery(
        `
        SELECT COUNT(DISTINCT ci.product_id)::int AS cnt
          FROM carts c
          LEFT JOIN cart_items ci
            ON ci.cart_id = c.id
           AND ci.saved_for_later = false
         WHERE c.user_id = $1
        `,
        [uid]
      ),
      // ログインユーザー向けの「未読お知らせ数」
      dbQuery(
        `
        SELECT COUNT(DISTINCT n.id)::int AS cnt
          FROM notifications n
          JOIN notification_targets t
            ON t.notification_id = n.id
          LEFT JOIN notification_reads r
            ON r.notification_id = n.id
           AND r.user_id = $1
         WHERE
           (
             t.audience = 'all'
             OR t.user_id = $1
             OR (t.role IS NOT NULL AND t.role = ANY($2::text[]))
           )
           AND (n.visible_from IS NULL OR n.visible_from <= now())
           AND (n.visible_to   IS NULL OR n.visible_to   >= now())
           AND (r.read_at IS NULL)
        `,
        [uid, roles]
      )
    ]);

    // カート件数を DB 結果で上書き
    res.locals.cartCount = cartRows[0]?.cnt ?? res.locals.cartCount;

    // 未読お知らせ数
    res.locals.unreadNoticeCount = noticeRows[0]?.cnt ?? 0;

    next();
  } catch (e) {
    console.warn('locals middleware error:', e.message);
    // 失敗してもフォールバック値のまま進める
    if (typeof res.locals.cartCount === 'undefined') {
      const sessItems = req.session?.cart?.items || [];
      res.locals.cartCount = sessItems.length;
    }
    if (typeof res.locals.unreadNoticeCount === 'undefined') {
      res.locals.unreadNoticeCount = 0;
    }
    next();
  }
});

/* ========== 認可ミドルウェア ========== */
// 1) 認可開始
app.get('/oauth2/start', requireAuth, requireRole(['admin']), (req, res) => {
  const returnTo = req.query.return_to
    || req.get('Referer')
    || '/'; // デフォルトの戻り先

  const url = generateAuthUrl(encodeURIComponent(returnTo)); // ← state で渡す
  res.redirect(url);
});

// 2) Google から返ってくるコールバック
app.get('/oauth2/callback', requireAuth, requireRole(['admin']), async (req, res, next) => {
  try {
    const code  = String(req.query.code || '');
    const state = decodeURIComponent(String(req.query.state || '')) || '/';
    if (!code) return res.status(400).send('Missing code');

    await getTokenFromCode(code);   // 保存まで行う
    // 完了後は元のページへ
    res.redirect(`${state}?oauth=ok`);
  } catch (e) {
    next(e);
  }
});

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}
function requireRole(roles) {
  return (req, res, next) => {
    const currentRoles = req.session.user.roles || [];
    let allow = false;
    for (const role of roles) {
      if (currentRoles.includes(role)) {
        allow = true;
        break;
      }
    }
    if (!allow) return res.status(403).render('errors/403', { title: '権限がありません' });
    next();
  };
}
// ---- helpers/permissions-ish（server.jsの上の方に置く） ----
function isAdmin(req) {
  return !!req.session?.user?.roles?.includes('admin');
}
function isSelf(req, userId) {
  return String(req.session?.user?.id || '') === String(userId || '');
}
async function getUserPartnerId(userId) {
  const rows = await dbQuery(`SELECT partner_id FROM users WHERE id=$1::uuid`, [userId]);
  return rows[0]?.partner_id || null;
}
async function isMemberOfPartner(req, partnerId) {
  if (!partnerId) return false;
  const myPartner = (await getUserPartnerId(req.session.user.id));
  return String(myPartner || '') === String(partnerId || '');
}

/* ========== Utils ========== */
function buildR2Key({ scope='products', sellerId='anon', productId=null, ext='jpg' } = {}){
  const y = new Date().getUTCFullYear();
  const m = String(new Date().getUTCMonth()+1).padStart(2,'0');
  const base = `${scope}/${y}/${m}/${sellerId}`;
  const name = `${Date.now()}-${randomUUID()}.${ext}`;
  // productId がある場合はそれもパスに含めると整理しやすい
  return productId ? `${base}/${productId}/${name}` : `${base}/${name}`;
}

function toSlug(s) {
  return String(s || '')
    .trim().toLowerCase()
    .replace(/[ぁ-ん]/g, '')
    .replace(/[^\w\-一-龯]/g, '-')
    .replace(/\-+/g, '-')
    .replace(/^\-|\-$/g, '')
    .slice(0, 80);
}
function toTagSlug(name) {
  const base = toSlug(name || '');
  if (!base || base.replace(/-/g,'').length < 2) {
    return `tag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
  }
  return base;
}
function buildQueryPath(basePath, base) {
  return (params = {}) => {
    const merged = { ...base, ...params };
    Object.keys(merged).forEach(k => (merged[k] === undefined || merged[k] === '' || merged[k] === null) && delete merged[k]);
    const qs = new URLSearchParams(merged).toString();
    return `${basePath}${qs ? `?${qs}` : ''}`;
  };
}
function wantsJSON(req){
  return req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest' ||
         (req.headers.accept || '').includes('application/json');
}

function isUuid(v){
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function parseUuidArray(maybeIds){
  return []
    .concat(maybeIds || [])
    .map(String)
    .map(s => s.trim())
    .filter(isUuid);
}

function authedUserId(req){ return req.session?.user?.id || null; }

async function getOrCreateUserCart(userId){
  const rows = await dbQuery(`SELECT * FROM carts WHERE user_id = $1 LIMIT 1`, [userId]);
  if (rows[0]) return rows[0];
  const ins = await dbQuery(`INSERT INTO carts (user_id) VALUES ($1) RETURNING *`, [userId]);
  return ins[0];
}

async function loadDbCartItems(userId){
  const cart = await getOrCreateUserCart(userId);
  const rows = await dbQuery(
    `SELECT product_id AS "productId", quantity
       FROM cart_items
      WHERE cart_id = $1 AND saved_for_later = false
      ORDER BY created_at ASC`,
    [cart.id]
  );
  return rows;
}

async function dbCartAdd(userId, productId, addQty){
  const cart = await getOrCreateUserCart(userId);
  // 既存数量取得
  const ex = await dbQuery(
    `SELECT id, quantity FROM cart_items WHERE cart_id = $1 AND product_id = $2 LIMIT 1`,
    [cart.id, productId]
  );
  if (ex[0]) {
    await dbQuery(
      `UPDATE cart_items SET quantity = GREATEST(1, quantity + $1) WHERE id = $2`,
      [addQty, ex[0].id]
    );
  } else {
    await dbQuery(
      `INSERT INTO cart_items (cart_id, product_id, quantity, user_id) VALUES ($1, $2, $3, $4)`,
      [cart.id, productId, Math.max(1, addQty), userId]
    );
  }
}

// DBカート：数量を直接セット
async function dbCartSetQty(userId, productId, qty){
  const cart = await getOrCreateUserCart(userId);
  await dbQuery(
    `INSERT INTO cart_items (cart_id, product_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (cart_id, product_id)
     DO UPDATE SET quantity = EXCLUDED.quantity`,
    [cart.id, productId, Math.max(1, qty)]
  );
}

// DBカート：行削除
async function dbCartRemove(userId, productId){
  const cart = await getOrCreateUserCart(userId);
  await dbQuery(`DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2`, [cart.id, productId]);
}

// DBカート：クーポン保存/解除
async function dbCartSetCoupon(userId, codeOrNull){
  const cart = await getOrCreateUserCart(userId);
  await dbQuery(`UPDATE carts SET coupon_code = $1 WHERE id = $2`, [codeOrNull, cart.id]);
}

// ログイン時にセッションカートをDBへマージ（数量は加算・在庫でクランプ）
async function mergeSessionCartToDb(req, userId){
  const cart = req.session?.cart;
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) return;

  for (const it of cart.items) {
    const pid = it.productId;
    const addQty = Math.max(1, parseInt(it.quantity, 10) || 1);
    if (!pid || !addQty) continue;

    // 現在在庫にクランプ
    const s = await dbQuery(`SELECT stock FROM products WHERE id = $1`, [pid]);
    const stock = parseInt(s?.[0]?.stock, 10) || 0;
    if (stock <= 0) continue;

    // 既存数量 + 追加 → 在庫上限
    const cartRow = await getOrCreateUserCart(userId);
    const exist = await dbQuery(
      `SELECT quantity FROM cart_items WHERE cart_id = $1 AND product_id = $2 LIMIT 1`,
      [cartRow.id, pid]
    );
    const base = parseInt(exist?.[0]?.quantity, 10) || 0;
    const next = Math.max(1, Math.min(stock, base + addQty));

    await dbQuery(
      `INSERT INTO cart_items (cart_id, product_id, quantity)
       VALUES ($1,$2,$3)
       ON CONFLICT (cart_id, product_id)
       DO UPDATE SET quantity = EXCLUDED.quantity`,
      [cartRow.id, pid, next]
    );
  }

  // クーポンも移しておく（任意）
  if (cart.coupon?.code) {
    await dbCartSetCoupon(userId, cart.coupon.code);
  }

  // セッション側は空に
  req.session.cart = { items: [], coupon: null };
}

// ---- services/payments-config-ish ----
async function getAllowedMethodsForUser(userId, allMethod) {

  // ユーザーに許可された方法（user_allowed_payment_methods）
  const rows = await dbQuery(
    `SELECT method, synced_from_partner
       FROM user_allowed_payment_methods
      WHERE user_id=$1::uuid
      ORDER BY method`,
    [userId]
  );

  // ラベルを付与（フォールバックあり）
  return rows.map(r => {
    const m = allMethod.find(x => x.value === r.method);
    return {
      method: r.method,
      synced_from_partner: r.synced_from_partner,
      payment_method_ja: m ? m.label_ja : (r.method || '')
    };
  });
}

async function getAllowedMethodsForPartner(partnerId) {
  const rows = await dbQuery(
    `SELECT method
       FROM partner_allowed_payment_methods
      WHERE partner_id=$1::uuid
      ORDER BY method`, [partnerId]);
  return rows.map(r => r.method);
}

async function getAllowedShipMethodsForPartner(partnerId) {
  const rows = await dbQuery(
    `SELECT method
       FROM partner_allowed_ship_methods
      WHERE partner_id=$1::uuid
      ORDER BY method`, [partnerId]);
  return rows.map(r => r.method);
}

// 「列挙」に合わせた全候補（UIでチェックボックスを出す）
async function loadAllPaymentMethods(enumTypeName, category) {
  const rows = await dbQuery(`
    SELECT
      e.enumlabel              AS code,
      COALESCE(ol.label_ja, INITCAP(REPLACE(e.enumlabel, '_', ' '))) AS label_ja,
      COALESCE(ol.sort, 999)  AS sort
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    LEFT JOIN public.option_labels ol
      ON ol.category = $2
    AND ol.value    = e.enumlabel
    AND ol.active   = true
    WHERE t.typname = $1
    ORDER BY COALESCE(ol.sort, 999), e.enumsortorder
  `, [enumTypeName, category]);
  return rows.map(r => ({ value: r.code, label_ja: r.label_ja, sort: r.sort }));
}

async function loadAllShipMethods(enumTypeName, category) {
  const rows = await dbQuery(`
    SELECT
      e.enumlabel              AS code,
      COALESCE(ol.label_ja, INITCAP(REPLACE(e.enumlabel, '_', ' '))) AS label_ja,
      COALESCE(ol.sort, 999)  AS sort
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    LEFT JOIN public.option_labels ol
      ON ol.category = $2
    AND ol.value    = e.enumlabel
    AND ol.active   = true
    WHERE t.typname = $1
    ORDER BY COALESCE(ol.sort, 999), e.enumsortorder
  `, [enumTypeName, category]);
  return rows.map(r => ({ value: r.code, label_ja: r.label_ja, sort: r.sort }));
}

async function sendVerifyMail({ to, name, url }) {
  const subject = '【セッツマルシェ】メールアドレスの確認';
  const text =
`${name} 様

ご登録ありがとうございます。
以下のURLをクリックして、メールアドレスの確認を完了してください。

${url}

※このメールに覚えがない場合は、このメールを破棄してください。`;

  const html = `
<p>${name} 様</p>
<p>ご登録ありがとうございます。以下のボタンからメールアドレスの確認を完了してください。</p>
<p><a href="${url}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#4C6B5C;color:#fff;text-decoration:none;">メールアドレスを確認する</a></p>
<p>もしボタンがクリックできない場合は、次のURLをブラウザにコピーして開いてください。</p>
<p><code>${url}</code></p>
`;

  // 表示名付き From（Gmail APIでもOK。実送は認可済アカウント）
    const FROM = process.env.MAIL_FROM || process.env.CONTACT_FROM || process.env.SMTP_USER || 'no-reply@example.com';
    try {
      const res = await gmailSend({ from: FROM, to, subject, text, html });
      console.log('auth signup mail sent:', res?.id || '(no id)');
    } catch (err) {
      console.error('auth signup mail failed:', err?.message || err);
      throw err;
    }
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15分
  max: 5,                     // 最大5回の試行
  skipSuccessfulRequests: true,  // 成功したログインはカウントしない
  message: 'ログイン試行回数が上限に達しました。15分後に再試行してください。',
  standardHeaders: true,
  legacyHeaders: false
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1時間
  max: 50,                    // 1時間に最大50回のアップロード
  message: 'アップロード回数が上限に達しました。1時間後に再試行してください。',
  standardHeaders: true,
  legacyHeaders: false
});

/* =========================================================
 *  認証
 * =======================================================*/

/**
 * ログイン履歴を記録
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
  }
}

/**
 * アカウントがロックされているかチェック
 */
function isAccountLocked(user) {
  return user.account_locked_at !== null && user.account_locked_at !== undefined;
}

// GET /login（CSRF付与）
app.get('/login', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.render('auth/login', {
    title:'ログイン',
    values: { email: '' },
    fieldErrors: {},
    globalError: '',
    showResendLink: false
  });
});

// POST /login - 強化版（2FA対応、ログイン履歴記録、アカウントロック）
app.post(
  '/login',
  loginLimiter,
  csrfProtect,
  [
    body('email').trim().isEmail().withMessage('有効なメールアドレスを入力してください。').normalizeEmail({
      gmail_remove_dots: false,
      gmail_remove_subaddress: false,
      gmail_convert_googlemaildotcom: false
    }),
    body('password').isLength({ min: 8 }).withMessage('パスワードは8文字以上で入力してください。')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      const { email, password, trustDevice } = req.body;
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || '';

      if (!errors.isEmpty()) {
        const fieldErrors = {};
        for (const e of errors.array()) if (!fieldErrors[e.path]) fieldErrors[e.path] = e.msg;
        return res.status(422).render('auth/login', {
          title: 'ログイン',
          csrfToken: req.csrfToken(),
          values: { email },
          fieldErrors,
          globalError: '',
          showResendLink: false
        });
      }

      // ユーザー情報取得（2FA関連カラムも含める）
      const rows = await dbQuery(
        `SELECT id, name, email, password_hash, roles, seller_intro_summary, email_verified_at,
                two_factor_enabled, two_factor_secret, two_factor_backup_codes,
                account_locked_at, account_locked_reason, failed_login_attempts
         FROM users
         WHERE email = $1
         LIMIT 1`,
        [email]
      );
      const user = rows[0];

      // パスワード検証
      const ok = user ? await bcrypt.compare(password, user.password_hash) : false;

      if (!ok) {
        // ログイン失敗を記録
        await recordLoginAttempt({
          userId: user?.id,
          email,
          success: false,
          ipAddress,
          userAgent,
          failureReason: 'パスワード誤り'
        });

        // 失敗回数をインクリメント
        if (user) {
          const failedAttempts = (user.failed_login_attempts || 0) + 1;
          await dbQuery(
            `UPDATE users
             SET failed_login_attempts = $1,
                 last_failed_login_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [failedAttempts, user.id]
          );

          // 10回失敗でアカウントロック
          if (failedAttempts >= 10) {
            await dbQuery(
              `UPDATE users
               SET account_locked_at = CURRENT_TIMESTAMP,
                   account_locked_reason = 'ログイン試行回数超過'
               WHERE id = $1`,
              [user.id]
            );

            // ロック通知メール送信（非同期）
            try {
              await gmailSend({
                to: user.email,
                subject: '【重要】アカウントがロックされました - セッツマルシェ',
                html: `
                  <p>${user.name} 様</p>
                  <p>セキュリティのため、お客様のアカウントをロックしました。</p>
                  <p><strong>理由:</strong> ログイン試行回数が上限（10回）に達しました。</p>
                  <p>もしお客様ご自身によるログイン試行でない場合は、第三者による不正アクセスの可能性があります。</p>
                  <p>アカウントのロック解除については、お問い合わせフォームよりご連絡ください。</p>
                  <p>---<br>セッツマルシェ</p>
                `
              });
            } catch (mailErr) {
              console.error('Failed to send account lock email:', mailErr);
            }
          }
        }

        const msg = 'メールアドレスまたはパスワードが正しくありません。';
        return res.status(401).render('auth/login', {
          title: 'ログイン',
          csrfToken: req.csrfToken(),
          values: { email },
          fieldErrors: { email: msg, password: msg },
          globalError: '',
          showResendLink: false
        });
      }

      // アカウントロックチェック
      if (isAccountLocked(user)) {
        await recordLoginAttempt({
          userId: user.id,
          email,
          success: false,
          ipAddress,
          userAgent,
          failureReason: 'アカウントロック中'
        });

        return res.status(403).render('auth/login', {
          title: 'ログイン',
          csrfToken: req.csrfToken(),
          values: { email },
          fieldErrors: {},
          globalError: `アカウントがロックされています。理由: ${user.account_locked_reason || '不明'}。お問い合わせフォームよりご連絡ください。`,
          showResendLink: false
        });
      }

      // メールアドレス未検証チェック
      if (!user.email_verified_at) {
        await recordLoginAttempt({
          userId: user.id,
          email,
          success: false,
          ipAddress,
          userAgent,
          failureReason: 'メールアドレス未検証'
        });

        req.session.pendingVerifyUserId = user.id;
        req.session.pendingVerifyEmail = user.email;
        const msg = 'メールアドレスの確認が完了していません。メールアドレスを認証してください。';
        return res.render('auth/login', {
          title: 'ログイン',
          csrfToken: req.csrfToken(),
          values: { email },
          fieldErrors: { email: msg, password: msg },
          showResendLink: true
        });
      }

      // パスワード認証成功 - 失敗回数をリセット
      await dbQuery(
        `UPDATE users
         SET failed_login_attempts = 0,
             last_failed_login_at = NULL
         WHERE id = $1`,
        [user.id]
      );

      // 2FA有効化チェック
      if (user.two_factor_enabled) {
        // 信頼済みデバイスチェック
        const deviceToken = req.cookies['trusted_device'];
        let isTrustedDevice = false;

        if (deviceToken) {
          const trustedDevices = await dbQuery(
            `SELECT id FROM trusted_devices
             WHERE user_id = $1
               AND device_token = $2
               AND expires_at > CURRENT_TIMESTAMP`,
            [user.id, deviceToken]
          );

          if (trustedDevices.length > 0) {
            isTrustedDevice = true;
            // 最終使用日時を更新
            await dbQuery(
              `UPDATE trusted_devices
               SET last_used_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [trustedDevices[0].id]
            );
          }
        }

        if (!isTrustedDevice) {
          // 2FA検証が必要 - 一時セッションに保存
          req.session.pending2FA = {
            userId: user.id,
            email: user.email,
            name: user.name,
            roles: user.roles || [],
            trustDevice: trustDevice === 'on'
          };

          return res.redirect('/login/2fa');
        }
      }

      // ログイン成功を記録
      await recordLoginAttempt({
        userId: user.id,
        email,
        success: true,
        ipAddress,
        userAgent,
        twoFactorUsed: user.two_factor_enabled
      });

      // セッションにユーザー情報を保存
      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles || []
      };

      await mergeSessionCartToDb(req, user.id);
      await mergeSessionRecentToDb(req);
      await attachContactsToUserAfterLogin(user);

      const roles = user.roles || [];
      return res.redirect(roles.includes('seller') ? '/dashboard/seller' : '/dashboard/buyer');
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// 2FAログイン検証ルート
// ============================================================

// 2FA検証用のRate Limiter
const twoFALimiter = rateLimit({
  windowMs: 60 * 1000,  // 1分
  max: 5,                // 最大5回
  message: '試行回数が上限に達しました。1分後に再試行してください。',
  standardHeaders: true,
  legacyHeaders: false,
});

const backupCodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: '試行回数が上限に達しました。1分後に再試行してください。',
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /login/2fa - 2FA検証画面
app.get('/login/2fa', (req, res) => {
  if (!req.session.pending2FA) {
    return res.redirect('/login');
  }

  res.set('Cache-Control', 'no-store');
  res.render('auth/login-2fa', {
    title: '二要素認証',
    csrfToken: typeof req.csrfToken === 'function' ? req.csrfToken() : null,
    email: req.session.pending2FA.email,
    error: '',
    useBackupCode: false
  });
});

// POST /login/2fa/verify - 2FAトークン検証
app.post(
  '/login/2fa/verify',
  csrfProtect,
  twoFALimiter,
  async (req, res, next) => {
    try {
      if (!req.session.pending2FA) {
        return res.redirect('/login');
      }

      const { token } = req.body;
      const { userId, email, name, roles, trustDevice } = req.session.pending2FA;
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || '';

      // ユーザー情報取得
      const rows = await dbQuery(
        `SELECT two_factor_secret FROM users WHERE id = $1`,
        [userId]
      );
      const user = rows[0];

      if (!user || !user.two_factor_secret) {
        return res.status(400).render('auth/login-2fa', {
          title: '二要素認証',
          csrfToken: req.csrfToken(),
          email,
          error: '2FA設定が見つかりません。',
          useBackupCode: false
        });
      }

      // 秘密鍵を復号化
      const secret = twoFA.decrypt2FASecret(user.two_factor_secret);

      // トークン検証
      const valid = twoFA.verify2FAToken(secret, token);

      if (!valid) {
        await recordLoginAttempt({
          userId,
          email,
          success: false,
          ipAddress,
          userAgent,
          failureReason: '2FA検証失敗'
        });

        return res.status(401).render('auth/login-2fa', {
          title: '二要素認証',
          csrfToken: req.csrfToken(),
          email,
          error: '認証コードが正しくありません。',
          useBackupCode: false
        });
      }

      // 2FA検証成功
      await recordLoginAttempt({
        userId,
        email,
        success: true,
        ipAddress,
        userAgent,
        twoFactorUsed: true
      });

      // 信頼済みデバイスとして保存
      if (trustDevice) {
        const deviceToken = twoFA.generateDeviceToken();
        const deviceName = twoFA.parseDeviceName(userAgent);

        await dbQuery(
          `INSERT INTO trusted_devices
           (user_id, device_token, device_name, ip_address, last_used_at, expires_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days')`,
          [userId, deviceToken, deviceName, ipAddress]
        );

        // Cookieに保存（30日間）
        res.cookie('trusted_device', deviceToken, {
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30日
          httpOnly: true,
          secure: isProd,
          sameSite: 'lax'
        });
      }

      // セッションにユーザー情報を保存
      req.session.user = { id: userId, name, email, roles };
      delete req.session.pending2FA;

      await mergeSessionCartToDb(req, userId);
      await mergeSessionRecentToDb(req);

      return res.redirect(roles.includes('seller') ? '/dashboard/seller' : '/dashboard/buyer');
    } catch (err) {
      next(err);
    }
  }
);

// POST /login/2fa/backup - バックアップコード検証
app.post(
  '/login/2fa/backup',
  csrfProtect,
  backupCodeLimiter,
  async (req, res, next) => {
    try {
      if (!req.session.pending2FA) {
        return res.redirect('/login');
      }

      const { backupCode } = req.body;
      const { userId, email, name, roles } = req.session.pending2FA;
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || '';

      // ユーザー情報取得
      const rows = await dbQuery(
        `SELECT two_factor_backup_codes FROM users WHERE id = $1`,
        [userId]
      );
      const user = rows[0];

      if (!user || !user.two_factor_backup_codes) {
        return res.status(400).render('auth/login-2fa', {
          title: '二要素認証',
          csrfToken: req.csrfToken(),
          email,
          error: 'バックアップコードが見つかりません。',
          useBackupCode: true
        });
      }

      // バックアップコード検証
      const result = await twoFA.verifyBackupCode(backupCode, user.two_factor_backup_codes);

      if (!result.valid) {
        await recordLoginAttempt({
          userId,
          email,
          success: false,
          ipAddress,
          userAgent,
          failureReason: 'バックアップコード検証失敗'
        });

        return res.status(401).render('auth/login-2fa', {
          title: '二要素認証',
          csrfToken: req.csrfToken(),
          email,
          error: 'バックアップコードが正しくありません。',
          useBackupCode: true
        });
      }

      // バックアップコード使用成功 - 使用済みコードを削除
      const updatedCodes = user.two_factor_backup_codes.filter((_, index) => index !== result.index);
      await dbQuery(
        `UPDATE users SET two_factor_backup_codes = $1 WHERE id = $2`,
        [updatedCodes, userId]
      );

      await recordLoginAttempt({
        userId,
        email,
        success: true,
        ipAddress,
        userAgent,
        twoFactorUsed: true
      });

      req.session.user = { id: userId, name, email, roles };
      delete req.session.pending2FA;

      await mergeSessionCartToDb(req, userId);
      await mergeSessionRecentToDb(req);

      return res.redirect(roles.includes('seller') ? '/dashboard/seller' : '/dashboard/buyer');
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/verify/resend
app.post('/auth/verify/resend', csrfProtect, async (req, res) => {
  try {
    const uid   = req.session.pendingVerifyUserId;
    const email = req.session.pendingVerifyEmail;

    // セッションに情報が無い → 直接 URL 叩かれた等
    if (!uid && !email) {
      return res.render('auth/login', {
        title: 'ログイン',
        csrfToken: req.csrfToken(),
        values: { email: '' },
        fieldErrors: {},
        showResendLink: false,
        globalError: '再送対象のユーザー情報が見つかりませんでした。お手数ですが、再度ログインをお試しください。'
      });
    }

    // DBから再取得（email_verified_at の最新状態を確認）
    const rows = await dbQuery(
      `SELECT id, name, email, email_verified_at
         FROM users
        WHERE ${uid ? 'id = $1' : 'email = $1'}
        LIMIT 1`,
      [uid || email]
    );
    const user = rows[0];

    if (!user) {
      // ユーザー自体が消えている
      req.session.pendingVerifyUserId = null;
      req.session.pendingVerifyEmail = null;
      return res.render('auth/login', {
        title: 'ログイン',
        csrfToken: req.csrfToken(),
        values: { email: '' },
        fieldErrors: {},
        showResendLink: false,
        globalError: 'アカウント情報が見つかりませんでした。お手数ですが、新規登録をお試しください。'
      });
    }

    if (user.email_verified_at) {
      // すでに認証済み → ふつうにログインしてね
      req.session.pendingVerifyUserId = null;
      req.session.pendingVerifyEmail = null;
      return res.render('auth/login', {
        title: 'ログイン',
        csrfToken: req.csrfToken(),
        values: { email: user.email },
        fieldErrors: {},
        showResendLink: false,
        globalError: 'このメールアドレスはすでに確認済みです。パスワードを入力してログインしてください。'
      });
    }

    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');

    const upd = await dbQuery(
      `UPDATE users
          SET email_verify_token = $1,
              email_verified_at = NULL
        WHERE id = $2
        RETURNING name`,
      [token, uid]
    );

    if (!upd.length) {
      return res.redirect('/signup');
    }

    const origin = process.env.APP_ORIGIN;
    const verifyUrl = `${origin}/auth/verify-email?token=${encodeURIComponent(token)}`;
    req.session.pendingVerifyUserId = user.id;
    req.session.pendingVerifyEmail = user.email;

    await sendVerifyMail({
      to: user.email,
      name: user.name,
      url: verifyUrl
    });

    return res.render('auth/verify-pending', {
      title: 'メールアドレスの確認',
      csrfToken: req.csrfToken(),
      email,
      message: '認証メールを再送しました。',
      error: ''
    });

  } catch (err) {
    console.error('resend verify mail error:', err);
    return res.status(500).render('auth/login', {
      title: 'ログイン',
      csrfToken: req.csrfToken(),
      values: { email: '' },
      fieldErrors: {},
      showResendLink: false,
      globalError: '確認メールの再送中にエラーが発生しました。時間をおいて再度お試しください。'
    });
  }
});

// POST /logout
app.post('/logout', csrfProtect, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('cof.sid');
    res.redirect('/login');
  });
});

const JP_PREFS = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県',
  '岐阜県','静岡県','愛知県','三重県',
  '滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県',
  '鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県',
  '福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'
];

// GET /signup
app.get('/signup', (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.render('auth/signup', {
      title: 'アカウント作成',
      csrfToken: req.csrfToken(),
      values: {
        account_type: 'corporate',
        lastname: '',
        firstname: '',
        email: '',
        partnerName: '',
        partnerType: '',
        partnerPhone: '',
        partnerPostal: '',
        partnerPrefecture: '',
        partnerCity: '',
        partnerAddress1: '',
        partnerAddress2: '',
        agree: ''
      },
      fieldErrors: {},
      globalError: ''
    });
  } catch (e) {
    next(e);
  }
});

const normalizeDigits = (s) => String(s || '').replace(/[^\d]/g, '');
// POST /signup
app.post(
  '/signup',
  csrfProtect,
  [
    body('account_type')
      .isIn(['individual', 'corporate'])
      .withMessage('アカウント種別を選択してください。'),

    body('lastname')
      .trim()
      .notEmpty().withMessage('姓を入力してください。')
      .isLength({ max: 30 }).withMessage('お名前は30文字以内で入力してください。'),

    body('firstname')
      .trim()
      .notEmpty().withMessage('名を入力してください。')
      .isLength({ max: 30 }).withMessage('お名前は30文字以内で入力してください。'),

    body('email')
      .trim()
      .isEmail().withMessage('正しいメールアドレスの形式で入力してください。')
      .normalizeEmail(),

    body('password')
      .isLength({ min: 8 }).withMessage('8文字以上で入力してください。').bail()
      .matches(/[a-z]/).withMessage('英小文字を含めてください。').bail()
      .matches(/[A-Z]/).withMessage('英大文字を含めてください。').bail()
      .matches(/\d/).withMessage('数字を含めてください。').bail()
      .matches(/[^A-Za-z0-9]/).withMessage('記号を含めてください。'),

    body('passwordConfirm')
      .custom((v, { req }) => v === req.body.password)
      .withMessage('確認用パスワードが一致しません。'),

    body('agree')
      .customSanitizer(v => (v === '1' || v === 'on' || v === true || v === 'true' || v === 1) ? '1' : '0')
      .isIn(['1']).withMessage('利用規約・プライバシーポリシーに同意してください。'),

    // ===== 法人用: 取引先情報（account_type === corporate のときだけ必須） =====
    body('partnerName').custom((v, { req }) => {
      if (req.body.account_type !== 'corporate') return true;
      const val = (v || '').trim();
      if (!val) throw new Error('法人を選択した場合、取引先名は必須です。');
      if (val.length > 120) throw new Error('取引先名は120文字以内で入力してください。');
      return true;
    }),
    body('partnerPhone').custom((v, { req }) => {
      if (req.body.account_type !== 'corporate') return true;
      const val = (v || '').trim();
      if (!val) throw new Error('法人を選択した場合、電話番号は必須です。');
      if (val.length > 40) throw new Error('電話番号は40文字以内で入力してください。');
      return true;
    }),
    body('partnerPostal').custom((v, { req }) => {
      if (req.body.account_type !== 'corporate') return true;
      const raw = (v || '').trim();
      if (!raw) throw new Error('法人を選択した場合、郵便番号は必須です。');
      if (normalizeDigits(raw).length < 7) throw new Error('郵便番号は7桁で入力してください。');
      return true;
    }),
    body('partnerPrefecture').custom((v, { req }) => {
      if (req.body.account_type !== 'corporate') return true;
      const val = (v || '').trim();
      if (!val) throw new Error('法人を選択した場合、都道府県は必須です。');
      return true;
    }),
    body('partnerCity').custom((v, { req }) => {
      if (req.body.account_type !== 'corporate') return true;
      const val = (v || '').trim();
      if (!val) throw new Error('法人を選択した場合、市区町村は必須です。');
      return true;
    }),
    body('partnerAddress1').custom((v, { req }) => {
      if (req.body.account_type !== 'corporate') return true;
      const val = (v || '').trim();
      if (!val) throw new Error('法人を選択した場合、番地は必須です。');
      return true;
    }),
  ],
  async (req, res) => {
    const errors = validationResult(req);

    const values = {
      account_type: (req.body.account_type === 'corporate') ? 'corporate' : 'individual',
      lastname: (req.body.lastname || '').trim(),
      firstname: (req.body.firstname || '').trim(),
      email: (req.body.email || '').trim(),

      partnerName: (req.body.partnerName || '').trim(),
      partnerType: (req.body.partnerType || '').trim(),
      partnerPhone: (req.body.partnerPhone || '').trim(),
      partnerPostal: (req.body.partnerPostal || '').trim(),
      partnerPrefecture: (req.body.partnerPrefecture || '').trim(),
      partnerCity: (req.body.partnerCity || '').trim(),
      partnerAddress1: (req.body.partnerAddress1 || '').trim(),
      partnerAddress2: (req.body.partnerAddress2 || '').trim(),

      agree: req.body.agree === '1' ? '1' : ''
    };

    if (!errors.isEmpty()) {
      const list = errors.array({ onlyFirstError: true });
      const fieldErrors = {};
      for (const err of list) {
        fieldErrors[err.path || err.param] = String(err.msg);
      }
      return res.status(422).render('auth/signup', {
        title: 'アカウント作成',
        csrfToken: req.csrfToken(),
        values,
        fieldErrors,
        globalError: ''
      });
    }

    const email = values.email.toLowerCase();

    // メール重複チェック
    const dup = await dbQuery(`SELECT 1 FROM users WHERE email=$1 LIMIT 1`, [email]);
    if (dup.length) {
      return res.status(409).render('auth/signup', {
        title: 'アカウント作成',
        csrfToken: req.csrfToken(),
        values,
        fieldErrors: { email: 'このメールアドレスは既に登録されています。' },
        globalError: ''
      });
    }

    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      let partnerId = null;

      if (values.account_type === 'corporate') {
        // 法人の場合のみ partners を作成
        const insPartner = await client.query(
          `INSERT INTO partners
             (name, postal_code, prefecture, city, address1, address2, phone)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id`,
          [
            values.partnerName,
            values.partnerPostal || null,
            values.partnerPrefecture || null,
            values.partnerCity || null,
            values.partnerAddress1 || null,
            values.partnerAddress2 || null,
            values.partnerPhone || null
          ]
        );
        partnerId = insPartner.rows[0].id;
      }

      const crypto = require('crypto');
      const passwordHash = await bcrypt.hash(req.body.password, 12);
      const token = crypto.randomBytes(32).toString('hex');

      const insUser = await client.query(
        `INSERT INTO users
           (name, email, password_hash, roles, partner_id,
            account_type, email_verified_at, email_verify_token)
         VALUES
           ($1,$2,$3,ARRAY['buyer'],$4,$5,$6,$7)
         RETURNING id, name, email`,
        [
          values.lastname + ' ' + values.firstname,
          email,
          passwordHash,
          partnerId,
          values.account_type,
          null,
          token
        ]
      );

      const user = insUser.rows[0];

      await client.query('COMMIT');

      // 認証メール送信
      const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
      const verifyUrl = `${origin}/auth/verify-email?token=${encodeURIComponent(token)}`;

      await sendVerifyMail({
        to: user.email,
        name: user.name,
        url: verifyUrl
      });

      // ここではログインさせず、認証待ちセッションに保存
      req.session.pendingVerifyUserId = user.id;
      req.session.pendingVerifyEmail = user.email;

      return res.redirect('/signup/verify-pending');
    } catch (err) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (_) {}
      }
      console.error('signup error:', err);
      return res.status(500).render('auth/signup', {
        title: 'アカウント作成',
        csrfToken: req.csrfToken(),
        values,
        fieldErrors: {},
        globalError: 'サインアップ処理でエラーが発生しました。時間をおいて再度お試しください。'
      });
    } finally {
      if (client) client.release();
    }
  }
);

app.get('/signup/verify-pending', (req, res) => {
  const uid = req.session.pendingVerifyUserId;
  const email = req.session.pendingVerifyEmail;
  if (!uid || !email) {
    return res.redirect('/signup');
  }
  res.render('auth/verify-pending', {
    title: 'メールアドレスの確認',
    csrfToken: req.csrfToken(),
    email,
    message: '',
    error: ''
  });
});

app.post('/signup/resend-verification', csrfProtect, async (req, res, next) => {
  try {
    const uid = req.session.pendingVerifyUserId;
    if (!uid) return res.redirect('/signup');

    const newEmailRaw = String(req.body.email || '').trim();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(newEmailRaw)) {
      return res.status(400).render('auth/verify-pending', {
        title: 'メールアドレスの確認',
        csrfToken: req.csrfToken(),
        email: newEmailRaw,
        message: '',
        error: 'メールアドレスの形式が正しくありません。'
      });
    }

    const email = newEmailRaw.toLowerCase();

    // 別ユーザーとの重複チェック
    const dup = await dbQuery('SELECT id FROM users WHERE email=$1 AND id<>$2', [email, uid]);
    if (dup.length) {
      return res.status(400).render('auth/verify-pending', {
        title: 'メールアドレスの確認',
        csrfToken: req.csrfToken(),
        email,
        message: '',
        error: 'このメールアドレスは既に別のアカウントで使用されています。'
      });
    }

    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');

    const upd = await dbQuery(
      `UPDATE users
          SET email = $1,
              email_verify_token = $2,
              email_verified_at = NULL
        WHERE id = $3
        RETURNING name`,
      [email, token, uid]
    );
    if (!upd.length) {
      return res.redirect('/signup');
    }

    const origin = process.env.APP_ORIGIN;
    const verifyUrl = `${origin}/auth/verify-email?token=${encodeURIComponent(token)}`;

    await sendVerifyMail({
      to: email,
      name: upd[0].name,
      url: verifyUrl
    });

    req.session.pendingVerifyEmail = email;

    res.render('auth/verify-pending', {
      title: 'メールアドレスの確認',
      csrfToken: req.csrfToken(),
      email,
      message: '認証メールを再送しました。',
      error: ''
    });
  } catch (e) {
    next(e);
  }
});

app.get('/auth/verify-email', async (req, res, next) => {
  try {
    const token = String(req.query.token || '').trim();
    if (!token) {
      return res.status(400).render('auth/verify-result', {
        title: 'メールアドレス確認',
        ok: false,
        email: '',
        message: 'トークンが不正です。'
      });
    }

    const rows = await dbQuery(
      `UPDATE users
          SET email_verified_at = NOW(),
              email_verify_token = NULL
        WHERE email_verify_token = $1
        RETURNING id, email, name`,
      [token]
    );

    if (!rows.length) {
      return res.status(400).render('auth/verify-result', {
        title: 'メールアドレス確認',
        ok: false,
        email: '',
        message: 'すでに確認済み、またはトークンの有効期限が切れています。'
      });
    }

    const user = rows[0];

    // 認証済みになったので pending セッションは消しておく
    if (req.session) {
      delete req.session.pendingVerifyUserId;
      delete req.session.pendingVerifyEmail;
    }

    res.render('auth/verify-result', {
      title: 'メールアドレス確認',
      ok: true,
      email: user.email,
      message: 'メールアドレスの確認が完了しました。ログイン画面からサインインしてください。'
    });
  } catch (e) {
    next(e);
  }
});

// 絶対URLを作る（.env の BASE_URL があればそれを採用）
function absoluteUrl(req, path) {
  const base =
    process.env.BASE_URL
    || `${(req.headers['x-forwarded-proto'] || req.protocol)}://${req.headers['x-forwarded-host'] || req.get('host')}`;
  return base.replace(/\/$/, '') + path;
}

/** セキュアなランダムトークンを発行（保存はハッシュで） */
function createResetToken() {
  const crypto = require('crypto');
  const buf = crypto.randomBytes(32); // 256bit
  const token = buf.toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 5,                    // 5回/15分
  standardHeaders: true,
  legacyHeaders: false
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20
});

async function sendPasswordResetMail({ to, name, url }) {
  const from = process.env.MAIL_FROM || process.env.CONTACT_FROM || 'no-reply@example.com';
  const subject = '【新・今日の食卓】パスワード再設定のご案内';
  const text = `${name || 'ユーザー'} 様

パスワード再設定のご依頼を受け付けました。
以下のリンクから1時間以内に新しいパスワードを設定してください。

${url}

※心当たりがない場合は、このメールは破棄してください。`;

  const escapeHtml = (s='') => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  const html = `
<p>${escapeHtml(name || 'ユーザー')} 様</p>
<p>パスワード再設定のご依頼を受け付けました。<br>
以下のボタンから <b>1時間以内</b> に再設定を完了してください。</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 16px;background:#4C6B5C;color:#fff;border-radius:8px;text-decoration:none">パスワードを再設定する</a></p>
<p>リンク：<br><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>
<hr>
<p>※心当たりがない場合は、本メールは破棄してください。</p>`;

  // 件名の MIME エンコード（文字化け対策）
  const enc = (s) => `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;

  await gmailSend({
    from,
    to,
    subject: enc(subject),
    text,
    html
  });
}

/** リクエスト：メールアドレスを受けてリセットメールを送る */
app.get('/password/forgot', csrfProtect, (req, res) => {
  res.render('auth/password-forgot', {
    title: 'パスワード再設定',
    csrfToken: req.csrfToken(),
    values: { email: '' },
    fieldErrors: {},
    globalError: ''
  });
});

app.post(
  '/password/forgot',
  csrfProtect,
  forgotLimiter,
  [ body('email').trim().isEmail().withMessage('有効なメールアドレスを入力してください。').normalizeEmail() ],
  async (req, res) => {
    const errors = validationResult(req);
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!errors.isEmpty()) {
      const fieldErrors = {};
      for (const e of errors.array()) if (!fieldErrors[e.path]) fieldErrors[e.path] = e.msg;
      return res.status(422).render('auth/password-forgot', {
        title: 'パスワード再設定',
        csrfToken: req.csrfToken(),
        values: { email },
        fieldErrors,
        globalError: ''
      });
    }

    // ユーザー検索（存在しない場合も「送信しました」固定レスで情報漏えい防止）
    const rows = await dbQuery(`SELECT id, name, email FROM users WHERE email = $1 LIMIT 1`, [email]);
    const user = rows[0];

    // 常に同じ結果を返す（存在有無を外部に悟らせない）
    const renderDone = () => res.render('auth/password-forgot-done', { title: 'メールを送信しました' });

    if (!user) return renderDone();

    // 1時間有効のトークンを発行。旧トークンは（任意）期限切れ or used にしてもよい
    const { token, tokenHash } = createResetToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60min

    await dbQuery(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, used)
       VALUES ($1, $2, $3, false)`,
      [user.id, tokenHash, expiresAt]
    );

    const url = absoluteUrl(req, `/password/reset?token=${encodeURIComponent(token)}&u=${encodeURIComponent(user.id)}`);

    try {
      await sendPasswordResetMail({ to: user.email, name: user.name, url });
    } catch (e) {
      console.warn('reset mail send error:', e.message);
      // メール失敗でも同文言（アタック対策）
    }

    return renderDone();
  }
);

/** リセット画面表示：token & user id を検証（使用前チェック） */
app.get('/password/reset', csrfProtect, async (req, res) => {
  const token = String(req.query.token || '').trim();
  const userId = String(req.query.u || '').trim();
  let valid = false;

  if (token && isUuid(userId)) {
    const crypto = require('crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const rows = await dbQuery(
      `SELECT id, expires_at, used
         FROM password_reset_tokens
        WHERE user_id = $1::uuid AND token_hash = $2
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId, tokenHash]
    );
    const row = rows[0];
    if (row && !row.used && new Date(row.expires_at) > new Date()) valid = true;
  }

  if (!valid) {
    return res.status(400).render('auth/password-reset-invalid', {
      title: 'リンクの有効期限切れ',
    });
  }

  res.render('auth/password-reset', {
    title: '新しいパスワードを設定',
    csrfToken: req.csrfToken(),
    token, userId,
    fieldErrors: {},
    values: { password: '', passwordConfirm: '' }
  });
});

/** リセット送信：パスワード上書き＆トークン失効 */
app.post(
  '/password/reset',
  csrfProtect,
  resetLimiter,
  [
    body('token').notEmpty(),
    body('userId').custom(isUuid).withMessage('不正なリクエストです。'),
    body('password')
      .isLength({ min: 8 }).withMessage('8文字以上で入力してください。')
      .matches(/[a-z]/).withMessage('英小文字を含めてください。')
      .matches(/[A-Z]/).withMessage('英大文字を含めてください。')
      .matches(/\d/).withMessage('数字を含めてください。')
      .matches(/[^A-Za-z0-9]/).withMessage('記号を含めてください。'),
    body('passwordConfirm')
      .custom((v, { req }) => v === req.body.password)
      .withMessage('確認用パスワードが一致しません。')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    const { token, userId, password } = req.body;

    if (!errors.isEmpty()) {
      const fieldErrors = {};
      for (const e of errors.array()) if (!fieldErrors[e.path]) fieldErrors[e.path] = e.msg;
      return res.status(422).render('auth/password-reset', {
        title: '新しいパスワードを設定',
        csrfToken: req.csrfToken(),
        token, userId,
        fieldErrors,
        values: { password: '', passwordConfirm: '' }
      });
    }

    const crypto = require('crypto');
    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const rows = await dbQuery(
      `SELECT id, expires_at, used
         FROM password_reset_tokens
        WHERE user_id = $1::uuid AND token_hash = $2
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId, tokenHash]
    );
    const row = rows[0];
    if (!row || row.used || new Date(row.expires_at) <= new Date()) {
      return res.status(400).render('auth/password-reset-invalid', { title: 'リンクの有効期限切れ' });
    }

    // パスワード更新
    const hash = await bcrypt.hash(password, 12);
    await dbQuery(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2::uuid`, [hash, userId]);

    // トークンを使用済みに
    await dbQuery(`UPDATE password_reset_tokens SET used = true, expires_at = now() WHERE id = $1`, [row.id]);

    // ついでに、そのユーザーの他の未使用トークンも無効化（任意）
    await dbQuery(
      `UPDATE password_reset_tokens
          SET used = true, expires_at = now()
        WHERE user_id = $1::uuid AND used = false`,
      [userId]
    );

    try { req.session.regenerate(()=>{}); } catch {}

    // 完了画面へ
    return res.render('auth/password-reset-done', {
      title: 'パスワードを更新しました'
    });
  }
);

// --- 先頭の依存などの下あたりに追記 ---
const noteService = require('./services/noteService');

/* =========================================================
 *  ホーム
 * =======================================================*/
// --- Top（ブランド/コンセプト中心） ---
app.get('/', async (req, res, next) => {
  try {
    // 最小限のティーザーだけ渡す（重くしない）
    const featuredProducts = await dbQuery(`
      SELECT id, slug, title, price, unit, stock,
             (
               SELECT url
               FROM product_images i
               WHERE i.product_id = p.id
               ORDER BY position ASC
               LIMIT 1
             ) AS image_url
      FROM products p
      WHERE p.status = 'public'
      ORDER BY p.updated_at DESC
      LIMIT 6
    `);

    // ============================
    // キャンペーン（DB から取得）
    // ============================
    const campaignRows = await dbQuery(
      `
      SELECT
        id,
        slug,
        title,
        eyebrow,
        hero_image_url,
        status,
        starts_at,
        ends_at,
        published_at
      FROM campaigns
      WHERE
        status = 'published'
        AND (starts_at IS NULL OR starts_at <= NOW())
        AND (ends_at   IS NULL OR ends_at   >= NOW())
      ORDER BY
        published_at DESC NULLS LAST,
        starts_at    DESC NULLS LAST,
        created_at   DESC
      LIMIT 4
      `
    );

    // EJS 側と同じ形にマッピング
    let campaigns = campaignRows.map(c => {
      const key = String(c.id);

      return {
        // EJS が使っている id は単なるキーなので slug 優先
        id: key,
        title: c.title,
        // ユーザー向けキャンペーン詳細ページ（前に作った /campaigns/:slug を想定）
        href: `/campaigns/${encodeURIComponent(key)}`,
        // メイン画像（なければプレースホルダ）
        image: c.hero_image_url || '/images/slide1.jpg',
        // ラベル（なければデフォルト文言）
        eyebrow: c.eyebrow || 'キャンペーン'
      };
    });

    // もし公開中キャンペーンが 1 件もない場合、従来の固定データをフォールバック
    if (!campaigns.length) {
      campaigns = [
        { id: 'spring',  title: '春の山菜フェア',  href: '/shop?tag=sansai',  image: '/images/slide1.jpg', eyebrow: '特集' },
        { id: 'organic', title: '有機農家の恵み', href: '/shop?tag=organic', image: '/images/slide2.jpg', eyebrow: '特集' }
      ];
    }

    // note の最新3件のティーザー
    let latestPosts = [];
    try {
      const page = 1;
      const q = (req.query.q || '').trim();
      const category = (req.query.category || 'all').trim();
      const sort = (req.query.sort || 'published_desc').trim(); // 'published_desc' | 'published_asc' | 'updated_desc' | 'updated_asc' | 'popular_desc' | 'popular_asc'

      const perPage = 3; // 表示用
      const { posts } =
        await noteService.getListFiltered({ q, category, sort, page, perPage });
      latestPosts = posts || [];
    } catch {
      // note 取得失敗時は静かに無視
    }

    res.render('home/index', {
      title: 'セッツマルシェ',
      featuredProducts,
      campaigns,      // ←ここは従来と同じ変数名・構造
      latestPosts,
      extraCSS2: '',
      extraCSS: '/styles/home.css',
      extraJS: '/js/home.js'
    });
  } catch (e) {
    next(e);
  }
});

// About
app.get('/about', async (req, res, next) => {
  try {
    // 将来CMS化するならここで取得。今は静的。
    res.render('home/about', {
      title: 'わたしたちについて',
      extraCSS2: '',
  extraCSS: '/styles/about.css',
      extraJS: '/js/about.js'
    });
  } catch (e) { next(e); }
});

/* =========================================================
 * 特定商取引法に基づく表記
 * GET /tokusho
 * =======================================================*/
app.get('/tokusho', (req, res) => {
  res.render('pages/tokusho', {
    title: '特定商取引法に基づく表記',
    description: 'セッツマルシェの特定商取引法に基づく表記ページです。販売事業者情報、返品・返金に関する条件、支払い方法などをご確認いただけます。',
    canonicalUrl: '/tokusho',
    extraCSS2: '',
    extraCSS: '/styles/tokusho.css'
  });
});

/* =========================================================
 * プライバシーポリシー
 * GET /privacy
 * =======================================================*/
app.get('/privacy', (req, res) => {
  res.render('pages/privacy', {
    title: 'プライバシーポリシー',
    description: 'セッツマルシェのプライバシーポリシーです。お客様の個人情報の取り扱いについて、取得する情報、利用目的、第三者提供、安全管理措置などを詳しくご説明しています。',
    canonicalUrl: '/privacy',
    extraCSS2: '',
    extraCSS: '/styles/privacy.css'
  });
});

/* =========================================================
 * 利用規約
 * GET /terms
 * =======================================================*/
app.get('/terms', (req, res) => {
  res.render('pages/terms', {
    title: '利用規約',
    description: 'セッツマルシェの利用規約です。本サービスのご利用に関する条件、購入者と出品者の権利・義務、返金・キャンセルに関する条件などを詳しくご説明しています。',
    canonicalUrl: '/terms',
    extraCSS2: '',
    extraCSS: '/styles/terms.css'
  });
});

app.get('/help', (req, res) => {
  res.render('pages/help', {
    title: 'ヘルプ・ご利用ガイド',
    description: 'セッツマルシェのご利用方法をご案内します。会員登録、商品の購入方法、出品方法、セキュリティ設定など、よくある質問にお答えします。',
    canonicalUrl: '/help',
    extraCSS2: '',
    extraCSS: '/styles/help.css'
  });
});

/* =========================================================
 * サイトマップ XML
 * GET /sitemap.xml
 * ========================================================= */
app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const baseUrl = process.env.SITE_URL || 'https://settsu-marche.onrender.com';
    const now = new Date().toISOString().split('T')[0];

    // 静的ページ
    const staticPages = [
      { loc: '/', priority: '1.0', changefreq: 'daily' },
      { loc: '/products', priority: '0.9', changefreq: 'daily' },
      { loc: '/blog', priority: '0.8', changefreq: 'daily' },
      { loc: '/about', priority: '0.7', changefreq: 'monthly' },
      { loc: '/contact', priority: '0.6', changefreq: 'monthly' },
      { loc: '/help', priority: '0.6', changefreq: 'monthly' },
      { loc: '/terms', priority: '0.3', changefreq: 'yearly' },
      { loc: '/privacy', priority: '0.3', changefreq: 'yearly' },
      { loc: '/tokusho', priority: '0.3', changefreq: 'yearly' },
    ];

    // 商品ページ（公開中のもの）
    const productsResult = await dbQuery(`
      SELECT id, updated_at
      FROM products
      WHERE status = 'public'
      ORDER BY updated_at DESC
    `);
    const products = productsResult.rows || [];

    // ブログ記事（noteServiceから取得）
    let blogPosts = [];
    try {
      const blogData = await noteService.getListFiltered({ page: 1, perPage: 100 });
      blogPosts = blogData.posts || [];
    } catch (e) {
      console.warn('サイトマップ: ブログ記事の取得に失敗', e.message);
    }

    // XML生成
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // 静的ページ
    for (const page of staticPages) {
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}${page.loc}</loc>\n`;
      xml += `    <lastmod>${now}</lastmod>\n`;
      xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority}</priority>\n`;
      xml += '  </url>\n';
    }

    // 商品ページ
    for (const product of products) {
      const lastmod = product.updated_at
        ? new Date(product.updated_at).toISOString().split('T')[0]
        : now;
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}/products/${product.id}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += '    <priority>0.8</priority>\n';
      xml += '  </url>\n';
    }

    // ブログ記事
    for (const post of blogPosts) {
      const lastmod = post.updatedAt
        ? new Date(post.updatedAt).toISOString().split('T')[0]
        : (post.publishedAt ? new Date(post.publishedAt).toISOString().split('T')[0] : now);
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}/blog/${post.id}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += '    <changefreq>monthly</changefreq>\n';
      xml += '    <priority>0.7</priority>\n';
      xml += '  </url>\n';
    }

    xml += '</urlset>';

    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (e) {
    next(e);
  }
});

async function attachContactsToUserAfterLogin(user) {
  if (!user || !user.email) return;
  await dbQuery(
    `UPDATE contacts
        SET user_id = $1,
            updated_at = now()
      WHERE user_id IS NULL
        AND email = $2`,
    [user.id, user.email]
  );
}

/* =========================================================
 * お問い合わせフォーム表示
 * GET /contact
 * =======================================================*/
app.get('/contact', (req, res) => {
  res.render('contact', {
    title: 'お問い合わせ',
    form: {},
    fieldErrors: {},
    globalError: null,
    loginUser: req.session.user || null
  });
});

/* =========================================================
 * お問い合わせ送信（メール通知付き / Gmail API 対応）
 * POST /contact
 * =======================================================*/
app.post(
  '/contact',
  [
    body('name').trim().notEmpty().withMessage('お名前を入力してください'),
    body('email').isEmail().withMessage('有効なメールアドレスを入力してください'),
    body('category').isIn(['listing_registration','ordering_trading','site_request','site_bug','press_partnership','other']).withMessage('お問い合わせ種別を選択してください'),
    body('subject').trim().notEmpty().withMessage('件名を入力してください'),
    body('message').trim().isLength({ min: 1 }).withMessage('お問い合わせ内容を入力してください'),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    const { name, email, category, subject, message } = req.body;

    if (!errors.isEmpty()) {
      const fieldErrors = {};
      for (const e of errors.array()) if (!fieldErrors[e.path]) fieldErrors[e.path] = e.msg;
      return res.status(422).render('contact', {
        title: 'お問い合わせ',
        csrfToken: req.csrfToken(),
        form: { name, email, category, subject, message },
        fieldErrors,
        globalError: null
      });
    }

    // === 送信先・送信元の決定（環境変数フォールバック） ===
    // 表示名付きの From（Gmail API では "From:" 表記、実送信は認可済みアカウント）
    const MAIL_FROM =
      process.env.MAIL_FROM ||
      process.env.CONTACT_FROM ||
      process.env.SMTP_USER ||
      'no-reply@example.com';

    const ADMIN_TO =
      process.env.CONTACT_TO ||
      process.env.SMTP_USER ||
      process.env.CONTACT_FROM ||
      'owner@example.com';

    try {
      const user = req.session.user || null;
      const uid = !user ? null : user.id;
      const trimmedMessage = String(message).trim();
      // 1) DB 保存
      const rows = await dbQuery(
        `INSERT INTO contacts (name, email, category, subject, message, type, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, created_at`,
        [
          String(name).trim(),
          String(email).trim().toLowerCase(),
          category,
          subject,
          String(message).trim(),
          `${category} : ${subject}`,
          uid
        ]
      );

      const contact = rows[0];
      const category_ja = jaLabel('contact_category', category) || category;

      // 1-2) 初回メッセージを contact_messages にコピー
      await dbQuery(
        `INSERT INTO contact_messages (contact_id, sender_id, sender_type, body)
         VALUES ($1, $2, $3, $4)`,
        [
          contact.id,
          uid || null,
          'user',
          trimmedMessage
        ]
      );

      // 2) 管理者向けメール本文
      const adminSubject = `[お問い合わせ] ${subject} : ${category_ja} - ${name}`;
      const createdAtJa = new Date(contact.created_at).toLocaleString('ja-JP');

      const adminText =
`新規お問い合わせが届きました。

■ID: ${contact.id}
■日時: ${createdAtJa}
■種別: ${category_ja}
■件名: ${subject}
■お名前: ${name}
■メール: ${email}

▼内容
${message}
`;

      const adminHtml =
`<p>新規お問い合わせが届きました。</p>
<ul>
  <li><b>ID:</b> ${contact.id}</li>
  <li><b>日時:</b> ${createdAtJa}</li>
  <li><b>種別:</b> ${category_ja}</li>
  <li><b>件名:</b> ${subject}</li>
  <li><b>お名前:</b> ${escapeHtml(name)}</li>
  <li><b>メール:</b> ${escapeHtml(email)}</li>
</ul>
<pre style="white-space:pre-wrap; font-family: system-ui, sans-serif;">${escapeHtml(message)}</pre>`;

      // 3) 送信（失敗しても UI は成功に）
      try {
        const adminResult = await gmailSend({
          from: MAIL_FROM,
          to: ADMIN_TO,
          subject: adminSubject,
          text: adminText,
          html: adminHtml,
          replyTo: email
        });
        if (adminResult?.previewUrl) {
          console.log('Admin mail preview URL:', adminResult.previewUrl);
        }
      } catch (e) {
        // Gmail 未認可 / タイムアウト等はここに来る
        console.warn('[MAIL][admin] failed (skip):', e.message);
        // 将来的に: ここでキュー/再送フラグをDBに積むのもアリ
      }

      // 4) 送信者への自動返信（失敗しても継続）
      try {
        const autoSubject = '【自動返信】お問い合わせありがとうございます';
        const autoText =
`${name} 様

この度は「セッツマルシェ」にお問い合わせありがとうございます。
担当者が内容を確認のうえ、通常1〜2営業日以内にご返信いたします。

--- お問い合わせ控え ---
お問い合わせ種別: ${category_ja}
件名: ${subject}
お名前: ${name}
メール: ${email}

内容:
${message}

今後ともよろしくお願いいたします。
`;

        const autoHtml =
`<p>${escapeHtml(name)} 様</p>
<p>この度は「セッツマルシェ」にお問い合わせありがとうございます。<br>
担当者が内容を確認のうえ、通常1〜2営業日以内にご返信いたします。</p>
<hr>
<p><b>— お問い合わせ控え —</b></p>
<ul>
  <li><b>お問い合わせ種別:</b> ${category_ja}</li>
  <li><b>件名:</b> ${subject}</li>
  <li><b>お名前:</b> ${escapeHtml(name)}</li>
  <li><b>メール:</b> ${escapeHtml(email)}</li>
</ul>
<pre style="white-space:pre-wrap; font-family: system-ui, sans-serif;">${escapeHtml(message)}</pre>
<hr>
<p>今後ともよろしくお願いいたします。</p>`;

        const autoResult = await gmailSend({
          from: MAIL_FROM,
          to: email,
          subject: autoSubject,
          text: autoText,
          html: autoHtml
        });
        if (autoResult?.previewUrl) {
          console.log('Auto-reply preview URL:', autoResult.previewUrl);
        }
      } catch (e) {
        console.warn('[MAIL][auto-reply] failed (skip):', e.message);
      }

      // 5) 完了
      return res.redirect(`/contact/thanks?no=${contact.id}`);
    } catch (e) {
      console.error('contact insert/send error:', e);
      return res.status(500).render('contact', {
        title: 'お問い合わせ',
        csrfToken: req.csrfToken(),
        form: { name, email, category, subject, message },
        fieldErrors: {},
        globalError: '送信に失敗しました。時間をおいて再度お試しください。'
      });
    }
  }
);

// 小さなHTMLエスケープ（XSS対策）
function escapeHtml(s='') {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

/* =========================================================
 * サンクスページ
 * GET /contact/thanks
 * =======================================================*/
app.get('/contact/thanks', (req, res) => {
  res.render('contact-thanks', {
    title: 'お問い合わせありがとうございました',
    inquiryNo: req.query.no || ''    // またはサーバ側で整形した受付番号
  });
});

// ============================================================
// アカウント設定・プロフィール
// ============================================================

// GET /account/profile - アカウント設定（プロフィール）画面
app.get('/account/profile', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    
    // ユーザー情報取得（2FA状態も含める）
    const userRows = await dbQuery(
      `SELECT id, name, email, phone, two_factor_enabled
       FROM users WHERE id = $1`,
      [userId]
    );
    const user = userRows[0];
    
    if (!user) {
      return res.status(404).render('errors/404', { title: '見つかりません' });
    }

    // 住所一覧取得
    const addresses = await dbQuery(
      `SELECT id, full_name, phone, postal_code, prefecture, city, address_line1, address_line2, address_type, is_default
       FROM addresses
       WHERE user_id = $1 AND scope = 'user'
       ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );

    res.render('account/profile', {
      title: 'アカウント設定',
      user,
      addresses: addresses || [],
      csrfToken: typeof req.csrfToken === 'function' ? req.csrfToken() : null
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 2FA設定関連ルート
// ============================================================

// GET /account/2fa/setup - 2FA設定画面
app.get('/account/2fa/setup', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id;

    // ユーザーの2FA状態を確認
    const rows = await dbQuery(
      `SELECT two_factor_enabled FROM users WHERE id = $1`,
      [userId]
    );
    const user = rows[0];

    // 既に有効化済みの場合でも、再設定を許可する（リダイレクトしない）
    // ユーザーが再設定したい場合は、まず無効化してから設定する必要がある

    // 新しい秘密鍵を生成
    const { secret, otpauth_url } = twoFA.generate2FASecret(req.session.user.email);

    // QRコードを生成
    const qrCodeDataURL = await twoFA.generateQRCode(otpauth_url);

    // セッションに一時保存（検証後に保存）
    req.session.pending2FASecret = secret;

    res.set('Cache-Control', 'no-store');
    res.render('account/2fa-setup', {
      title: user.two_factor_enabled ? '二要素認証の再設定' : '二要素認証の設定',
      qrCodeDataURL,
      secret,
      isReconfiguring: user.two_factor_enabled || false,
      csrfToken: typeof req.csrfToken === 'function' ? req.csrfToken() : null
    });
  } catch (err) {
    next(err);
  }
});

// POST /account/2fa/enable - 2FA有効化
app.post('/account/2fa/enable', requireAuth, csrfProtect, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { token } = req.body;
    const secret = req.session.pending2FASecret;

    if (!secret) {
      return res.status(400).json({
        ok: false,
        message: 'セッションが期限切れです。もう一度設定画面を開いてください。'
      });
    }

    // トークン検証
    const valid = twoFA.verify2FAToken(secret, token, 2); // window=2 で少し緩めに検証

    if (!valid) {
      return res.status(401).json({
        ok: false,
        message: '認証コードが正しくありません。もう一度お試しください。'
      });
    }

    // バックアップコードを生成
    const backupCodes = await twoFA.generateBackupCodes();
    const hashedBackupCodes = await twoFA.hashBackupCodes(backupCodes);

    // 秘密鍵を暗号化
    const encryptedSecret = twoFA.encrypt2FASecret(secret);

    // DBに保存
    await dbQuery(
      `UPDATE users
       SET two_factor_enabled = true,
           two_factor_secret = $1,
           two_factor_backup_codes = $2,
           two_factor_enabled_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [encryptedSecret, hashedBackupCodes, userId]
    );

    // セッションから削除
    delete req.session.pending2FASecret;

    res.json({
      ok: true,
      backupCodes // プレーンテキストで返す（これが最後のチャンス）
    });
  } catch (err) {
    next(err);
  }
});

// POST /account/2fa/disable - 2FA無効化
app.post('/account/2fa/disable', requireAuth, (req, res, next) => {
  // CSRF保護を手動で適用（エラーハンドリングのため）
  csrfProtect(req, res, (err) => {
    if (err) {
      console.error('[2FA無効化] CSRFエラー:', {
        code: err.code,
        message: err.message,
        headers: {
          'x-csrf-token': req.headers['x-csrf-token'] ? 'present' : 'missing',
          'csrf-token': req.headers['csrf-token'] ? 'present' : 'missing',
          'x-requested-with': req.headers['x-requested-with']
        }
      });
      return res.status(403).json({
        ok: false,
        message: 'CSRFトークンが無効です。ページを再読み込みしてください。'
      });
    }
    next();
  });
}, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { password } = req.body;

    console.log('[2FA無効化] リクエスト:', { userId, hasPassword: !!password });

    if (!password) {
      return res.status(400).json({
        ok: false,
        message: 'パスワードを入力してください。'
      });
    }

    // パスワード確認
    const rows = await dbQuery(
      `SELECT password_hash FROM users WHERE id = $1`,
      [userId]
    );
    const user = rows[0];

    if (!user) {
      return res.status(404).json({
        ok: false,
        message: 'ユーザーが見つかりません。'
      });
    }

    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      return res.status(401).json({
        ok: false,
        message: 'パスワードが正しくありません。'
      });
    }

    // 2FAを無効化
    await dbQuery(
      `UPDATE users
       SET two_factor_enabled = false,
           two_factor_secret = NULL,
           two_factor_backup_codes = NULL,
           two_factor_enabled_at = NULL
       WHERE id = $1`,
      [userId]
    );

    // 信頼済みデバイスも削除
    await dbQuery(
      `DELETE FROM trusted_devices WHERE user_id = $1`,
      [userId]
    );

    console.log('[2FA無効化] 成功:', { userId });
    res.json({ ok: true });
  } catch (err) {
    console.error('[2FA無効化] エラー:', err);
    next(err);
  }
});

// POST /account/2fa/regenerate - バックアップコード再生成
app.post('/account/2fa/regenerate', requireAuth, csrfProtect, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { password } = req.body;

    // パスワード確認
    const rows = await dbQuery(
      `SELECT password_hash, two_factor_enabled FROM users WHERE id = $1`,
      [userId]
    );
    const user = rows[0];

    if (!user.two_factor_enabled) {
      return res.status(400).json({
        ok: false,
        message: '2FAが有効化されていません。'
      });
    }

    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      return res.status(401).json({
        ok: false,
        message: 'パスワードが正しくありません。'
      });
    }

    // 新しいバックアップコードを生成
    const backupCodes = await twoFA.generateBackupCodes();
    const hashedBackupCodes = await twoFA.hashBackupCodes(backupCodes);

    // DBを更新
    await dbQuery(
      `UPDATE users
       SET two_factor_backup_codes = $1
       WHERE id = $2`,
      [hashedBackupCodes, userId]
    );

    res.json({
      ok: true,
      backupCodes
    });
  } catch (err) {
    next(err);
  }
});

// GET /account/webauthn/setup - WebAuthn（生体認証）設定画面
app.get('/account/webauthn/setup', requireAuth, async (req, res, next) => {
  try {
    res.render('account/webauthn-setup', {
      title: '生体認証・パスキー設定'
    });
  } catch (err) {
    next(err);
  }
});

// GET /account/trusted-devices - 信頼済みデバイス一覧
app.get('/account/trusted-devices', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id;

    console.log('[信頼済みデバイス取得] リクエスト:', { userId });

    const devices = await dbQuery(
      `SELECT id, device_name, ip_address, last_used_at, expires_at, created_at
       FROM trusted_devices
       WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP
       ORDER BY last_used_at DESC`,
      [userId]
    );

    console.log('[信頼済みデバイス取得] 成功:', { userId, count: devices.length });
    res.json({ ok: true, devices });
  } catch (err) {
    console.error('[信頼済みデバイス取得] エラー:', err);
    next(err);
  }
});

// DELETE /account/trusted-devices/:deviceId - 信頼済みデバイス削除
app.delete('/account/trusted-devices/:deviceId', requireAuth, csrfProtect, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const deviceId = req.params.deviceId;

    const result = await dbQuery(
      `DELETE FROM trusted_devices
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [deviceId, userId]
    );

    if (result.length === 0) {
      return res.status(404).json({
        ok: false,
        message: 'デバイスが見つかりません。'
      });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /account/login-history - ログイン履歴
app.get('/account/login-history', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const limit = parseInt(req.query.limit) || 20;

    const history = await dbQuery(
      `SELECT id, success, ip_address, user_agent, failure_reason,
              two_factor_used, created_at
       FROM login_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    res.json({ ok: true, history });
  } catch (err) {
    next(err);
  }
});

// GET /my/contacts
app.get('/my/contacts', requireAuth, async (req, res, next) => {
  try {
    const uid = req.session.user.id;
    const { page = 1 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = 20;
    const offset = (pageNum - 1) * pageSize;

    const totalRow = await dbQuery(
      `SELECT COUNT(*)::int AS cnt FROM contacts WHERE user_id = $1`,
      [uid]
    );
    const total = totalRow[0]?.cnt || 0;

    const items = await dbQuery(
      `SELECT
         c.*,
         COALESCE(ol.label_ja, c.category::text) AS category_ja
       FROM contacts c
       LEFT JOIN option_labels ol
         ON ol.category = 'contact_category'
        AND ol.value = c.category::text
        AND ol.active = TRUE
       WHERE c.user_id = $1
       ORDER BY c.created_at DESC
       LIMIT $2 OFFSET $3`,
      [uid, pageSize, offset]
    );

    const pagination = {
      page: pageNum,
      pageCount: Math.max(1, Math.ceil(total / pageSize))
    };

    res.render('admin/contacts/my-index', {
      title: 'お問い合わせ履歴',
      items,
      total,
      pagination
    });
  } catch (e) { next(e); }
});

// GET /my/contacts/:id
app.get('/my/contacts/:id', requireAuth, async (req, res, next) => {
  try {
    const uid = req.session.user.id;
    const id  = String(req.params.id).trim();

    const rows = await dbQuery(
      `SELECT
         c.*,
         COALESCE(ol.label_ja, c.category::text) AS category_ja
       FROM contacts c
       LEFT JOIN option_labels ol
         ON ol.category = 'contact_category'
        AND ol.value = c.category::text
        AND ol.active = TRUE
       WHERE c.id = $1::uuid AND c.user_id = $2
       LIMIT 1`,
      [id, uid]
    );
    const c = rows[0];
    if (!c) return res.status(404).render('errors/404', { title: '見つかりません' });

    const messages = await dbQuery(
      `SELECT
         cm.*,
         u.name AS sender_name
       FROM contact_messages cm
       LEFT JOIN users u ON u.id = cm.sender_id
       WHERE cm.contact_id = $1
       ORDER BY cm.created_at ASC`,
      [id]
    );

    res.render('admin/contacts/my-show', {
      title: `お問い合わせ詳細`,
      contact: c,
      messages
    });
  } catch (e) { next(e); }
});

// POST /my/contacts/:id/messages  { body }
app.post('/my/contacts/:id/messages', requireAuth, async (req, res, next) => {
  try {
    const uid = req.session.user.id;
    const id  = String(req.params.id).trim();
    const body = String(req.body.body || '').trim();
    if (!body) return res.status(400).json({ ok:false, message:'メッセージを入力してください。' });

    // 権限チェック：この問い合わせが自分のものか
    const own = await dbQuery(
      `SELECT 1 FROM contacts WHERE id = $1::uuid AND user_id = $2 LIMIT 1`,
      [id, uid]
    );
    if (!own.length) return res.status(404).json({ ok:false, message:'not found' });

    const rows = await dbQuery(
      `INSERT INTO contact_messages (contact_id, sender_id, sender_type, body)
       VALUES ($1, $2, 'user', $3)
       RETURNING id, contact_id, sender_id, sender_type, body, created_at`,
      [id, uid, body]
    );
    const msg = rows[0];

    return res.json({ ok:true, message: msg });
  } catch (e) { next(e); }
});

// 一覧（フィルタ＋ページング）
app.get('/blog', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const q = (req.query.q || '').trim();
    const category = (req.query.category || 'all').trim();
    const sort = (req.query.sort || 'published_desc').trim(); // 'published_desc' | 'published_asc' | 'updated_desc' | 'updated_asc' | 'popular_desc' | 'popular_asc'

    const perPage = 12; // 表示用
    const { posts, total, pageCount, categories } =
      await noteService.getListFiltered({ q, category, sort, page, perPage });

    res.render('blog/index', {
      title: 'ブログ',
      posts,
      pagination: { page, pageCount, total },
      q, category, sort, categories,
      extraCSS2: '',
  extraCSS: '/styles/blog-modern.css',
      extraJS: '/js/blog-modern.js'
    });
  } catch (e) {
    next(e);
  }
});

// 詳細
app.get('/blog/:id', async (req, res, next) => {
  try {
    const id = (req.params.id || '').trim();
    if (!id) return res.status(404).render('errors/404', { title: '記事が見つかりません' });

    const detail = await noteService.getDetail(id).catch(e => {
      // 取得失敗時は note の記事URLに誘導
      const c = process.env.NOTE_CREATOR || '';
      const c1 = c.startsWith('@') ? c.slice(1) : c;
      const noteUrl = `https://note.com/${encodeURIComponent(c1)}/n/${id}`;
      return { id, title: 'note で記事を表示', contentHtml: `<p>本文を取得できませんでした。<a href="${noteUrl}" target="_blank" rel="noopener">noteで開く</a></p>`, sourceUrl: noteUrl };
    });

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const q = (req.query.q || '').trim();
    const category = (req.query.category || 'all').trim();
    const sort = (req.query.sort || 'published_desc').trim();

    const perPage = 6; // 表示用
    const { posts, total, pageCount, categories } =
      await noteService.getListFiltered({ q, category, sort, page, perPage });
    res.render('blog/show', {
      title: detail.title,
      post: {
        ...detail,
        author: { name: process.env.NOTE_CREATOR, avatar: null, bio: '' },
        category: 'note',
        readTime: null,
        tags: []
      },
      related: posts.filter(p => p.id !== id).slice(0, 4),
      extraCSS2: '',
  extraCSS: '/styles/blog-post-modern.css',
      extraJS: '/js/blog-post-modern.js'
    });
  } catch (e) {
    next(e);
  }
});

/* ===== 最近参照: 記録（ログイン時はDB、未ログインはセッション） ===== */
function ensureRecentSession(req) {
  if (!req.session.recent) req.session.recent = []; // [{productId, viewedAtISO}]
  return req.session.recent;
}

// 記録
async function recordProductView(req, productId) {
  const uid = req.session?.user?.id || null;
  const nowIso = new Date().toISOString();

  if (uid) {
    // upsert: 同一(product)があれば viewed_at 更新
    await dbQuery(
      `INSERT INTO user_recent_products (user_id, product_id, viewed_at)
       VALUES ($1::uuid, $2::uuid, now())
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET viewed_at = EXCLUDED.viewed_at`,
      [uid, productId]
    );
  } else {
    // セッション保持（重複排除 & 先頭へ）
    const list = ensureRecentSession(req);
    const id = String(productId);
    const next = list.filter(x => x.productId !== id);
    next.unshift({ productId: id, viewedAt: nowIso });
    req.session.recent = next.slice(0, 50); // 上限は適宜
  }
}

// 取得
async function fetchRecentProducts(req, limit = 8) {
  const uid = req.session?.user?.id || null;

  if (uid) {
    const rows = await dbQuery(
      `
      SELECT p.id, p.slug, p.title, p.price, p.unit,
             (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY position ASC LIMIT 1) AS image_url
        FROM user_recent_products urp
        JOIN products p ON p.id = urp.product_id
       WHERE urp.user_id = $1
       AND p.status = 'public'
       ORDER BY urp.viewed_at DESC
       LIMIT $2
      `,
      [uid, limit]
    );
    return rows;
  }

  // ゲスト：セッションのID配列から情報を取得
  const list = (req.session?.recent || [])
    .slice(0, limit)
    .map(r => r.productId)
    .filter(isUuid);

  if (!list.length) return [];

  // 順序維持で取得
  const ph = list.map((_, i) => `$${i+1}`).join(',');
  const rows = await dbQuery(
    `
    SELECT p.id, p.slug, p.title, p.price, p.unit,
           (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY position ASC LIMIT 1) AS image_url
      FROM products p
     WHERE p.id IN (${ph})
    `,
    list
  );
  const byId = new Map(rows.map(r => [r.id, r]));
  return list.map(id => byId.get(id)).filter(Boolean);
}

// ログイン時：セッション保持分をDBへ移行（任意、ログイン直後に呼ぶ）
async function mergeSessionRecentToDb(req) {
  const uid = req.session?.user?.id || null;
  if (!uid) return;
  const list = (req.session?.recent || []).filter(x => isUuid(x.productId));
  if (!list.length) return;

  // 最新順で upsert（見た順番に更新）
  for (const r of list) {
    await dbQuery(
      `INSERT INTO user_recent_products (user_id, product_id, viewed_at)
       VALUES ($1::uuid, $2::uuid, $3::timestamptz)
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET viewed_at = GREATEST(user_recent_products.viewed_at, EXCLUDED.viewed_at)`,
      [uid, r.productId, r.viewedAt || new Date()]
    );
  }
  // セッション側はクリア
  req.session.recent = [];
}

/* =========================================================
 * 人気商品ランキング取得
 * =======================================================*/
async function getPopularProducts(dbQuery, { range = '7d', limit = 12, sellerId = null } = {}) {
  // 期間条件の設定
  let dateCondition = '';
  const params = [];
  let paramIndex = 1;

  if (range === '7d') {
    dateCondition = `AND o.created_at >= now() - interval '7 days'`;
  } else if (range === '30d') {
    dateCondition = `AND o.created_at >= now() - interval '30 days'`;
  } else if (range === 'all') {
    dateCondition = ''; // 全期間
  } else {
    // デフォルトは7日
    dateCondition = `AND o.created_at >= now() - interval '7 days'`;
  }

  // 出品者フィルター（将来用）
  const sellerCondition = sellerId ? `AND oi.seller_id = $${paramIndex}::uuid` : '';
  if (sellerId) {
    params.push(sellerId);
    paramIndex++;
  }

  // ランキング取得クエリ
  // 注文ステータス: delivered, processing, paid, confirmed, fulfilled を含む
  // 除外: canceled, cancelled, refunded
  // 支払いステータス: paid, completed を含む
  const rows = await dbQuery(
    `SELECT
       p.id,
       p.title,
       p.price,
       p.unit,
       p.stock,
       p.favorite_count,
       u.name AS seller_name,
       pa.name AS seller_partner_name,
       pa.icon_url AS seller_partner_icon_url,
       (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position ASC LIMIT 1) AS image_url,
       SUM(oi.quantity)::int AS quantity_sold,
       COUNT(DISTINCT o.id)::int AS order_count,
       SUM(oi.price * oi.quantity)::int AS sales_amount,
       MAX(o.created_at) AS last_sold_at
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN products p ON p.id = oi.product_id
     LEFT JOIN users u ON u.id = p.seller_id
     LEFT JOIN partners pa ON pa.id = u.partner_id
     WHERE p.status = 'public'
       AND o.status NOT IN ('canceled', 'cancelled', 'refunded')
       AND o.payment_status IN ('paid', 'completed')
       ${dateCondition}
       ${sellerCondition}
     GROUP BY p.id, p.title, p.price, p.unit, p.stock, p.favorite_count, u.name, pa.name, pa.icon_url
     HAVING SUM(oi.quantity) > 0
     ORDER BY
       SUM(oi.quantity) DESC,
       SUM(oi.price * oi.quantity) DESC,
       p.favorite_count DESC,
       MAX(o.created_at) DESC
     LIMIT $${paramIndex}::int`,
    [...params, limit]
  );

  return rows;
}

/* =========================================================
 * みんなのお気に入り取得
 * =======================================================*/
async function getTopFavorites(dbQuery, { limit = 12 } = {}) {
  const rows = await dbQuery(
    `SELECT
       p.id,
       p.title,
       p.price,
       p.unit,
       p.stock,
       p.favorite_count,
       u.name AS seller_name,
       pa.name AS seller_partner_name,
       pa.icon_url AS seller_partner_icon_url,
       (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position ASC LIMIT 1) AS image_url
     FROM products p
     LEFT JOIN users u ON u.id = p.seller_id
     LEFT JOIN partners pa ON pa.id = u.partner_id
     WHERE p.status = 'public'
       AND p.favorite_count > 0
     ORDER BY
       p.favorite_count DESC,
       p.created_at DESC
     LIMIT $1::int`,
    [limit]
  );

  return rows;
}

/* =========================================================
 * option_labels キャッシュ（日本語ラベル解決）
 * =======================================================*/
const OPTION_LABELS = {
  map: new Map(),   // key: `${category}:${value}` → label_ja
  loaded: false
};

/** DBから option_labels を読み込み、メモリにキャッシュ */
async function refreshOptionLabelsCache() {
  const rows = await dbQuery(`
    SELECT category, value, label_ja
      FROM option_labels
     WHERE active = true
  `);
  const m = new Map();
  for (const r of rows) {
    const key = `${String(r.category)}:${String(r.value)}`;
    m.set(key, String(r.label_ja || ''));
  }
  OPTION_LABELS.map = m;
  OPTION_LABELS.loaded = true;
}

/** 日本語ラベルを返す（見つからない場合は value をそのまま返す） */
function jaLabel(category, value) {
  const key = `${String(category)}:${String(value ?? '')}`;
  return OPTION_LABELS.map.get(key) || String(value ?? '');
}

// 起動時に初回ロード
(async () => {
  try {
    await refreshOptionLabelsCache();
  } catch (e) {
    console.error('[labels] initial cache load failed:', e.message);
  }
})();

// 任意: 定期リフレッシュ（5分ごと）
if (!process.env.LABELS_NO_REFRESH) {
  setInterval(() => {
    refreshOptionLabelsCache().catch(e => {
      console.error('[labels] refresh failed:', e.message);
    });
  }, 5 * 60 * 1000);
}

const {
  getProfileForUser,
  upsertProfileForUser,
  getPublicProfileByUserId,
  getPublicProfileWithProducts,
  getSellerHighlightByUserId,
  getProfileByUserId,
  upsertSellerProfile,
  updateSellerIntroSummary,
  getPublicSellerProfile,
} = require('./services/sellerProfileService');

/* =========================================================
 *  商品一覧 / 詳細（DB）
 * =======================================================*/
// 先頭あたりに追加
const {
  parseFlags,
  fetchProductsWithCount,
  fetchCategories
} = require('./services/productDbService');

// /products（発見ハブ：public/private両方）
app.get('/products', async (req, res, next) => {
  try {
    const { q = '', category = 'all', sort = 'new', page = 1 } = req.query;
    const flags = parseFlags(req.query);

    const categories = await fetchCategories(dbQuery);
    const categoriesChips = categories.map(c => c.name);

    const { items, total, pageNum } = await fetchProductsWithCount(dbQuery, {
      q, category, sort, page, flags, visible: 'public', pageSize: 20
    });

    const buildQuery = buildQueryPath('/products', { q, category, sort });

    // 人気商品ランキング（週間・月間）とみんなのお気に入りを取得
    const [popularWeekly, popularMonthly, topFavorites] = await Promise.all([
      getPopularProducts(dbQuery, { range: '7d', limit: 12 }),
      getPopularProducts(dbQuery, { range: '30d', limit: 12 }),
      getTopFavorites(dbQuery, { limit: 12 })
    ]);

    // お気に入り状態の取得（全商品用：通常商品 + ランキング商品）
    let favoriteProductIds = new Set();
    if (req.session?.user) {
      const allProductIds = [
        ...items.map(p => p.id),
        ...popularWeekly.map(p => p.id),
        ...popularMonthly.map(p => p.id),
        ...topFavorites.map(p => p.id)
      ];
      if (allProductIds.length > 0) {
        const favRows = await dbQuery(
          `SELECT product_id FROM favorites WHERE user_id = $1::uuid AND product_id = ANY($2::uuid[])`,
          [req.session.user.id, allProductIds]
        );
        favoriteProductIds = new Set(favRows.map(r => r.product_id));
      }
    }

    // 各商品にお気に入り状態を追加
    items.forEach(p => {
      p.isFavorited = favoriteProductIds.has(p.id);
    });

    // 各ランキング商品にお気に入り状態を追加
    [...popularWeekly, ...popularMonthly, ...topFavorites].forEach(p => {
      p.isFavorited = favoriteProductIds.has(p.id);
    });

    res.render('products/index', {
      title: '商品一覧',
      q, sort, category,
      organic: !!flags.organic, seasonal: !!flags.seasonal,
      instock: !!flags.instock, bundle: !!flags.bundle,
      products: items,
      total,
      categories,
      categoriesChips,
      newArrivals: items.slice(0, 8),
      popular: popularWeekly, // 週間ランキングをデフォルト表示
      popularWeekly,
      popularMonthly,
      topFavorites,
      collections: [],
      recommended: [],
      recent: [],
      previewProducts: items,
      previewTotal: total,
      buildQuery,
      page: pageNum,
      currentUser: req.session?.user || null,
      csrfToken: (typeof req.csrfToken === 'function') ? req.csrfToken() : null
    });
  } catch (e) { next(e); }
});

// /products/list（公開のみ・ページネーション強化）
app.get('/products/list', async (req, res, next) => {
  try {
    const { q = '', category = 'all', sort = 'new', page = 1 } = req.query;
    const flags = parseFlags(req.query);

    const categories = await fetchCategories(dbQuery);
    const categoriesChips = categories.map(c => c.name);

    const { items, total, pageNum, pageSize } = await fetchProductsWithCount(dbQuery, {
      q, category, sort, page, flags, visible: 'public', pageSize: 20
    });

    // お気に入り状態の取得（ログインユーザーのみ）
    let favoriteProductIds = new Set();
    if (req.session?.user) {
      const favRows = await dbQuery(
        `SELECT product_id FROM favorites WHERE user_id = $1::uuid`,
        [req.session.user.id]
      );
      favoriteProductIds = new Set(favRows.map(r => r.product_id));
    }

    // 各商品にお気に入り状態を追加
    items.forEach(p => {
      p.isFavorited = favoriteProductIds.has(p.id);
    });

    const pagination = { page: pageNum, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
    const buildQuery = buildQueryPath('/products/list', { q, category, sort });

    res.render('products/list', {
      title: '商品一覧',
      q, sort, category,
      organic: !!flags.organic, seasonal: !!flags.seasonal,
      instock: !!flags.instock, bundle: !!flags.bundle,
      categories,
      categoriesChips,
      products: items,
      total,
      pagination,
      buildQuery,
      page: pageNum,
      currentUser: req.session?.user || null,
      csrfToken: (typeof req.csrfToken === 'function') ? req.csrfToken() : null
    });
  } catch (e) { next(e); }
});

// 人気商品ランキングページ
app.get('/ranking/popular', async (req, res, next) => {
  try {
    const range = String(req.query.range || '7d').trim();
    if (!['7d', '30d', 'all'].includes(range)) {
      return res.redirect('/ranking/popular?range=7d');
    }

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const perPage = 20;
    const offset = (page - 1) * perPage;

    // ランキング取得
    const allProducts = await getPopularProducts(dbQuery, { range, limit: 1000 });
    const total = allProducts.length;
    const pageCount = Math.ceil(total / perPage);
    const products = allProducts.slice(offset, offset + perPage);

    // お気に入り状態の取得（ログインユーザーのみ）
    let favoriteProductIds = new Set();
    if (req.session?.user && products.length > 0) {
      const productIds = products.map(p => p.id);
      const favRows = await dbQuery(
        `SELECT product_id FROM favorites WHERE user_id = $1::uuid AND product_id = ANY($2::uuid[])`,
        [req.session.user.id, productIds]
      );
      favoriteProductIds = new Set(favRows.map(r => r.product_id));
    }

    // 各商品にお気に入り状態を追加
    products.forEach(p => {
      p.isFavorited = favoriteProductIds.has(p.id);
    });

    res.render('ranking/popular', {
      title: '人気商品ランキング',
      products,
      range,
      pagination: {
        page,
        pageCount,
        total,
        perPage
      },
      currentUser: req.session?.user || null,
      csrfToken: (typeof req.csrfToken === 'function') ? req.csrfToken() : null
    });
  } catch (e) {
    next(e);
  }
});

// みんなのお気に入りページ
app.get('/ranking/favorites', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const perPage = 20;
    const offset = (page - 1) * perPage;

    // 総件数
    const countRows = await dbQuery(
      `SELECT COUNT(*)::int AS cnt
       FROM products
       WHERE status = 'public' AND favorite_count > 0`
    );
    const total = countRows[0]?.cnt || 0;
    const pageCount = Math.ceil(total / perPage);

    // お気に入り数順で取得
    const products = await dbQuery(
      `SELECT 
         p.id,
         p.title,
         p.price,
         p.unit,
         p.stock,
         p.favorite_count,
         (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position ASC LIMIT 1) AS image_url
       FROM products p
       WHERE p.status = 'public'
         AND p.favorite_count > 0
       ORDER BY 
         p.favorite_count DESC,
         p.created_at DESC
       LIMIT $1::int OFFSET $2::int`,
      [perPage, offset]
    );

    // お気に入り状態の取得（ログインユーザーのみ）
    let favoriteProductIds = new Set();
    if (req.session?.user && products.length > 0) {
      const productIds = products.map(p => p.id);
      const favRows = await dbQuery(
        `SELECT product_id FROM favorites WHERE user_id = $1::uuid AND product_id = ANY($2::uuid[])`,
        [req.session.user.id, productIds]
      );
      favoriteProductIds = new Set(favRows.map(r => r.product_id));
    }

    // 各商品にお気に入り状態を追加
    products.forEach(p => {
      p.isFavorited = favoriteProductIds.has(p.id);
    });

    res.render('ranking/favorites', {
      title: 'みんなのお気に入り',
      products,
      pagination: {
        page,
        pageCount,
        total,
        perPage
      },
      currentUser: req.session?.user || null,
      csrfToken: (typeof req.csrfToken === 'function') ? req.csrfToken() : null
    });
  } catch (e) {
    next(e);
  }
});

// /products/:slug（詳細）
app.get('/products/:id', async (req, res, next) => {
  try {
    const productId = req.params.id;
    const rows = await dbQuery(`
      SELECT p.*, c.name AS category_name, u.name AS seller_name,
             pa.name AS seller_partner_name,
             pa.icon_url AS seller_partner_icon_url,
             prs.rating_avg  AS rating,
             prs.review_count
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN product_rating_stats prs ON prs.product_id = p.id
        JOIN users u ON u.id = p.seller_id
        LEFT JOIN partners pa ON pa.id = u.partner_id
       WHERE p.id = $1
       LIMIT 1
    `, [productId]);
    const product = rows[0];
    if (!product) return next();

    // 画像（R2に保存されているURLを取得）
    const imageRows = await dbQuery(
      `SELECT url, alt FROM product_images WHERE product_id = $1 ORDER BY position ASC`, [product.id]
    );
    // ← ここで EJS が使う形に整える（配列にして product.images に格納）
    product.images = imageRows.map(r => r.url);

    const specs = await dbQuery(
      `SELECT label, value FROM product_specs WHERE product_id = $1 ORDER BY position ASC`, [product.id]
    );

    const tags = await dbQuery(
      `SELECT t.name, t.slug FROM product_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.product_id = $1 ORDER BY t.name ASC`,
      [product.id]
    );

    // レビュー（公開のみ・新しい順・最大 20 件）
    const reviews = await dbQuery(`
      SELECT r.id, r.rating AS stars, r.title, r.body AS text, r.created_at, r.user_id,
             u.name AS author
        FROM product_reviews r
        JOIN users u ON u.id = r.user_id
       WHERE r.product_id = $1 AND r.status = 'published'
       ORDER BY r.created_at DESC
       LIMIT 20
    `, [product.id]);

    // ログインユーザーが既に投稿済みか（編集に使う）
    let myReview = null;
    if (req.session?.user) {
      const mine = await dbQuery(`
        SELECT id, rating, title, body, status
          FROM product_reviews
         WHERE product_id = $1 AND user_id = $2
         LIMIT 1
      `, [product.id, req.session.user.id]);
      myReview = mine[0] || null;
    }

    const currentUser = req.session?.user || null;

    // 関連（同カテゴリの新着）
    const related = await dbQuery(`
      SELECT p.slug, p.title, p.price, p.stock,
             (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position ASC LIMIT 1) AS image_url
        FROM products p
       WHERE p.status = 'public' AND p.category_id = $1 AND p.id <> $2
       ORDER BY p.published_at DESC NULLS LAST, p.created_at DESC
       LIMIT 10
    `, [product.category_id, product.id]);

    await recordProductView(req, product.id);
    const recentlyViewed = await fetchRecentProducts(req, 8);

    let sellerHighlight = null;
    const sellerUserId =
      product?.seller?.id ||
      product?.seller_id ||
      null;

    if (sellerUserId) {
      sellerHighlight = await getSellerHighlightByUserId(sellerUserId);
    }

    // お気に入り状態の取得（ログインユーザーのみ）
    let isFavorited = false;
    if (req.session?.user) {
      const favRows = await dbQuery(
        `SELECT 1 FROM favorites WHERE user_id = $1 AND product_id = $2 LIMIT 1`,
        [req.session.user.id, product.id]
      );
      isFavorited = favRows.length > 0;
    }

    res.set('Cache-Control', 'no-store');
    res.render('products/show', {
      title: product.title,
      product, specs, tags, related, reviews, myReview,
      recentlyViewed, currentUser, sellerHighlight,
      isFavorited, csrfToken: (typeof req.csrfToken === 'function') ? req.csrfToken() : null
    });
  } catch (e) {
    console.log(e);
    next(e);
  }
});

// お気に入りトグル（追加/削除）
app.post(
  '/favorites/:productId',
  requireAuth,
  csrfProtect,
  async (req, res, next) => {
    try {
      const productId = String(req.params.productId || '').trim();
      if (!isUuid(productId)) {
        return res.status(400).json({ ok: false, message: '不正な商品IDです' });
      }

      const userId = req.session.user.id;

      // 商品の存在確認
      const productRows = await dbQuery(
        `SELECT id, status FROM products WHERE id = $1::uuid LIMIT 1`,
        [productId]
      );
      if (!productRows.length) {
        return res.status(404).json({ ok: false, message: '商品が見つかりません' });
      }

      // 非公開商品はお気に入り登録不可
      if (productRows[0].status !== 'public') {
        return res.status(403).json({ ok: false, message: 'この商品はお気に入りに登録できません' });
      }

      // 既にお気に入りに登録されているか確認
      const existingRows = await dbQuery(
        `SELECT id FROM favorites WHERE user_id = $1::uuid AND product_id = $2::uuid LIMIT 1`,
        [userId, productId]
      );

      if (existingRows.length > 0) {
        // 削除（トグル）
        await dbQuery(
          `DELETE FROM favorites WHERE user_id = $1::uuid AND product_id = $2::uuid`,
          [userId, productId]
        );
        // トリガーでfavorite_countが自動更新される
        return res.json({ ok: true, favorited: false, message: 'お気に入りから削除しました' });
      } else {
        // 追加（トグル）
        await dbQuery(
          `INSERT INTO favorites (user_id, product_id) VALUES ($1::uuid, $2::uuid)`,
          [userId, productId]
        );
        // トリガーでfavorite_countが自動更新される
        return res.json({ ok: true, favorited: true, message: 'お気に入りに追加しました' });
      }
    } catch (e) {
      // UNIQUE制約違反など
      if (e.code === '23505') {
        return res.status(409).json({ ok: false, message: '既にお気に入りに登録されています' });
      }
      next(e);
    }
  }
);

app.post(
  '/products/:productId/reviews',
  csrfProtect,
  requireAuth,
  [
    body('rating').isInt({min:1,max:5}).withMessage('評価は1〜5を指定してください'),
    body('body').trim().isLength({min: 5}).withMessage('レビュー本文を入力してください（5文字以上）'),
    body('title').optional({checkFalsy:true}).trim().isLength({max:120})
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const fieldErrors = {};
      for (const e of errors.array()) fieldErrors[e.path] = e.msg;
      return res.status(422).json({ ok:false, fieldErrors });
    }

    const { productId } = req.params;
    const userId = req.session.user.id;
    const user_name = req.session.user.name;
    const { rating, title, body: text } = req.body;

    try {
      // product 存在チェック（省略可）
      const exists = await dbQuery(`SELECT 1 FROM products WHERE id=$1 LIMIT 1`, [productId]);
      if (!exists.length) return res.status(404).json({ ok:false, error:'product_not_found' });

      const rows = await dbQuery(`
        INSERT INTO product_reviews (product_id, user_id, rating, title, body, status)
        VALUES ($1,$2,$3,$4,$5,'published')
        ON CONFLICT (product_id, user_id)
        DO UPDATE SET rating=EXCLUDED.rating, title=EXCLUDED.title, body=EXCLUDED.body, status='published', updated_at=now()
        RETURNING id, rating, title, body, created_at, updated_at
      `, [productId, userId, Number(rating), title || null, text]);

      // 最新の集計値を返す（ビューを再クエリ）
      const stat = await dbQuery(`
        SELECT review_count, rating_avg
          FROM product_rating_stats
         WHERE product_id = $1
      `, [productId]);

      return res.json({
        ok: true,
        review: rows[0],
        userName: user_name,
        stats: stat[0] || { review_count: 1, rating_avg: Number(rating) }
      });
    } catch (e) {
      console.error('review upsert error:', e);
      return res.status(500).json({ ok:false, error:'server_error' });
    }
  }
);

/* =========================================================
 *  出品（表示/保存）
 * =======================================================*/
// GET 出品フォーム（CSRF付与）
app.get(
  '/seller/listing-new',
  requireAuth,
  requireRole(['seller', 'admin']),
  async (req, res, next) => {
    try {
      const [categories, tags] = await Promise.all([
        dbQuery(`SELECT id, name, slug FROM categories ORDER BY sort_order NULLS LAST, name ASC`),
        dbQuery(`SELECT id, name, slug FROM tags ORDER BY name ASC`)
      ]);
      res.render('seller/listing-new', {
        title: '新規出品',
        categories, tags, values: {}, fieldErrors: {}
      });
    } catch (e) { next(e); }
  }
);

const { renderDescHtml } = require('./services/desc');
// POST 出品保存
app.post(
  '/seller/listing-new',
  requireAuth,
  requireRole(['seller']),
  uploadLimiter,
  upload.array('images', 8),
  [
    body('title').trim().isLength({ min: 1, max: 80 }).withMessage('商品名を入力してください（80文字以内）。'),
    body('price').isInt({ min: 0 }).withMessage('価格は0以上の整数で入力してください。'),
    body('stock').isInt({ min: 0 }).withMessage('在庫は0以上の整数で入力してください。'),
    body('categoryId').isInt().withMessage('カテゴリを選択してください。'),
    body('unit').trim().isLength({ min: 1, max: 16 }).withMessage('単位を入力してください。'),
    body('shipMethod').isIn(['normal','cool']).withMessage('配送方法を選択してください。'),
    body('shipDays').isIn(['1-2','2-3','4-7']).withMessage('発送目安を選択してください。'),
    body('status').isIn(['draft','private','public']).withMessage('ステータスを選択してください。'),
    body('description').trim().isLength({ min: 1 }).withMessage('商品の詳細説明を入力してください。'),
    body('imageUrls').optional({ checkFalsy: true }).isString(),
    body('tags').optional({ checkFalsy: true })
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    const values = {
      title: req.body.title || '',
      price: req.body.price || '',
      stock: req.body.stock || '',
      categoryId: req.body.categoryId || '',
      unit: req.body.unit || '',
      shipMethod: req.body.shipMethod || '',
      shipDays: req.body.shipDays || '',
      status: req.body.status || 'public',
      isOrganic: !!req.body.isOrganic,
      isSeasonal: !!req.body.isSeasonal,
      description: req.body.description || '',
      imageUrls: req.body.imageUrls || '',
      tags: req.body.tags || ''
    };

    const [categories, tagsMaster] = await Promise.all([
      dbQuery(`SELECT id, name, slug FROM categories ORDER BY sort_order NULLS LAST, name ASC`),
      dbQuery(`SELECT id, name, slug FROM tags ORDER BY name ASC`)
    ]);

    if (!errors.isEmpty()) {
      const fieldErrors = {};
      for (const e of errors.array()) if (!fieldErrors[e.path]) fieldErrors[e.path] = e.msg;
      return res.status(422).render('seller/listing-new', {
        title: '新規出品',
        values, categories, tags: tagsMaster,
        fieldErrors
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const descriptionRaw  = String(req.body.description || '');
      const descriptionHtml = await renderDescHtml(req.body.description || '');

      const sellerId = req.session.user.id;

      const imageUrls = (req.body.imageUrls || '').split('\n').map(s => s.trim()).filter(Boolean);
      let tags = [];
      if (Array.isArray(req.body.tags)) tags = req.body.tags.map(t => String(t).trim()).filter(Boolean);
      else if (typeof req.body.tags === 'string') tags = req.body.tags.split(',').map(t => t.trim()).filter(Boolean);

      // ★ スペック（kv 行の配列化 & クリーニング）
      const rawSpecs = req.body.specs || [];
      const specRows = (Array.isArray(rawSpecs) ? rawSpecs : Object.values(rawSpecs))
        .map(r => ({
          label: String(r?.label ?? '').trim(),
          value: String(r?.value ?? '').trim()
        }))
        // どちらかが入っている行だけ採用（両方必須にしたいなら && に）
        .filter(r => r.label || r.value)
        .map(r => ({
          label: r.label || '—',
          value: r.value || '—'
        }));
      // slug（重複時は-2..で回避）
      let baseSlug = toSlug(req.body.title) || `p-${Date.now()}`;
      let slug = baseSlug, n = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const dup = await client.query(`SELECT 1 FROM products WHERE slug = $1 LIMIT 1`, [slug]);
        if (!dup.length) break;
        n += 1; slug = `${baseSlug}-${n}`;
      }

      const isPublic = req.body.status === 'public';
      const insertProduct = `
        INSERT INTO products
          (seller_id, category_id, slug, title, description_html, description_raw,
           price, unit, stock, is_organic, is_seasonal,
           ship_method, ship_days, status, published_at)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        RETURNING id
      `;
      const pr = await client.query(insertProduct, [
        sellerId,
        Number(req.body.categoryId),
        slug,
        req.body.title,
        descriptionHtml,
        descriptionRaw,
        Number(req.body.price),
        req.body.unit,
        Number(req.body.stock),
        !!req.body.isOrganic,
        !!req.body.isSeasonal,
        req.body.shipMethod,
        req.body.shipDays,
        req.body.status,
        isPublic ? new Date() : null
      ]);
      const productId = pr.rows[0].id;

      // 画像（メタ付きJSON＋URLのみ）
      const imageJsonRaw = (req.body.imageJson || '').trim();
      let metaFromJson = [];
      if (imageJsonRaw) {
        try {
          const arr = JSON.parse(imageJsonRaw);
          if (Array.isArray(arr)) {
            metaFromJson = arr.map((x, idx) => ({
              url:    String(x.url || '').trim(),
              r2_key: String(x.r2_key || x.key || '').trim() || null,
              mime:   String(x.mime || '').trim() || null,
              bytes:  Number.isFinite(Number(x.bytes)) ? Number(x.bytes) : null,
              width:  Number.isFinite(Number(x.width)) ? Number(x.width) : null,
              height: Number.isFinite(Number(x.height)) ? Number(x.height) : null
            })).filter(x => x.url);
          }
        } catch { /* JSON不正は無視してURLのみを使う */ }
      }

      // URLのみ（テキストエリア）
      const urlOnly = (req.body.imageUrls || '')
        .split('\n').map(s => s.trim()).filter(Boolean);

      // ===== 重複除去（同一商品内 & r2_keyグローバル） =====
      // 1) 同一商品内：payload内のURL重複を除外
      const seenUrl = new Set();
      metaFromJson = metaFromJson.filter(m => {
        if (seenUrl.has(m.url)) return false;
        seenUrl.add(m.url); return true;
      });
      const urlOnlyDedup = urlOnly.filter(u => !seenUrl.has(u) && seenUrl.add(u));

      // 2) r2_keyグローバル重複チェック（既にどこかで使われていたら null に落とす）
      const keys = metaFromJson.map(m => m.r2_key).filter(Boolean);
      let usedKeySet = new Set();
      if (keys.length) {
        const usedRows = await client.query(
          `SELECT r2_key FROM product_images WHERE r2_key = ANY($1)`,
          [keys]
        );
        usedKeySet = new Set(usedRows.rows.map(r => String(r.r2_key)));
      }

      // ===== 挿入（position は 0..N-1 で採番） =====
      let pos = -1;

      // メタあり（r2_key の衝突は NULL へ落としてから INSERT; 念のため ON CONFLICT DO NOTHING）
      for (const m of metaFromJson) {
        pos += 1;
        const r2KeyForInsert = (m.r2_key && !usedKeySet.has(m.r2_key)) ? m.r2_key : null;
        await client.query(
          `
          INSERT INTO product_images
            (product_id, url, r2_key, mime, bytes, width, height, position)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (r2_key) DO NOTHING
          `,
          [productId, m.url, r2KeyForInsert, m.mime, m.bytes, m.width, m.height, pos]
        );
      }

      // URLのみ（r2_keyは持たない）
      for (const u of urlOnlyDedup) {
        pos += 1;
        await client.query(
          `INSERT INTO product_images (product_id, url, position) VALUES ($1,$2,$3)`,
          [productId, u, pos]
        );
      }

      // ★ スペックを一括挿入
      if (specRows.length) {
        const params = [];
        const values = specRows.map((_, i) => {
          const base = i * 4 + 1;
          return `($${base}, $${base + 1}, $${base + 2}, $${base + 3})`;
        });
        specRows.forEach((r, i) => {
          params.push(productId, r.label, r.value, i);
        });
        const sql = `
          INSERT INTO product_specs (product_id, label, value, position)
          VALUES ${values.join(',')}
        `;
        await client.query(sql, params);
      }

      // タグ upsert → 紐付け（slug で存在しなければ作成、存在すれば使う）
      if (tags.length) {
        // 1) 正規化 & 重複除去
        const uniqueNames = [...new Set(
          tags.map(t => String(t).trim()).filter(Boolean)
        )];
        const pairs = uniqueNames.map(name => ({ slug: toTagSlug(name), name }));

        // 2) すでに存在するタグ（slug or name）を先に拾う
        const slugs = pairs.map(p => p.slug);
        const existRes = await client.query(
          `SELECT id, slug, name
            FROM tags
            WHERE slug = ANY($1) OR name = ANY($2)`,
          [slugs, uniqueNames]
        );
        const existBySlug = new Map(existRes.rows.map(r => [r.slug, r]));
        const existByName = new Map(existRes.rows.map(r => [r.name, r]));

        // 3) 未存在だけを抽出（slug でも name でも未登録のもの）
        const toInsert = pairs.filter(p => !existBySlug.has(p.slug) && !existByName.has(p.name));

        if (toInsert.length) {
          // VALUES リスト
          const valuesSql = toInsert.map((_, i) => `($${i*2+1}, $${i*2+2})`).join(',');
          const params = toInsert.flatMap(p => [p.slug, p.name]);

          // 4) 片方でも衝突するものは弾くフィルタを掛けて一括 INSERT
          //    さらに競合が発生したら DO NOTHING（二重安全）
          await client.query(
            `
            INSERT INTO tags (slug, name)
            SELECT v.slug, v.name
              FROM (VALUES ${valuesSql}) AS v(slug, name)
            WHERE NOT EXISTS (
                    SELECT 1 FROM tags t
                    WHERE t.slug = v.slug OR t.name = v.name
                  )
            ON CONFLICT DO NOTHING
            `,
            params
          );
        }

        // 5) 最終的に対象（既存＋今回追加）の id を取り直す
        const finalRows = await client.query(
          `SELECT id, slug, name FROM tags WHERE slug = ANY($1) OR name = ANY($2)`,
          [slugs, uniqueNames]
        );
        const tagIds = finalRows.rows.map(r => r.id);

        // 6) 紐付け（重複は無視）
        if (tagIds.length) {
          const linkValues = tagIds.map((_, i) => `($1, $${i+2})`).join(',');
          await client.query(
            `INSERT INTO product_tags (product_id, tag_id)
            VALUES ${linkValues}
            ON CONFLICT DO NOTHING`,
            [productId, ...tagIds]
          );
        }
      }

      await client.query('COMMIT'); // pool helperはトランザクション対象外なので client 版が必要だが、簡易にclient.query利用→OK
      res.redirect(`/products/${productId}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('listing-new INSERT error:', err);
      res.status(500).render('seller/listing-new', {
        title: '新規出品',
        values, categories, tags: tagsMaster,
        fieldErrors: {},
        globalError: '保存中にエラーが発生しました。時間をおいて再度お試しください。'
        // csrfToken: req.csrfToken()
      });
    } finally {
      client.release();
    }
  }
);

// ========== 編集フォーム表示 ==========
app.get(
  '/seller/listing-edit/:id',
  requireAuth,
  requireRole(['seller', 'admin']),
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!isUuid(id)) return res.status(400).render('errors/404', { title: '不正なID' });

      const sellerId = req.session.user.id;
      const currentRoles = req.session.user.roles;

      let productRows;
      if (currentRoles.includes('admin')) {
        productRows = await dbQuery(
          `SELECT *
            FROM products
            WHERE id = $1::uuid
            LIMIT 1`,
          [id]
        );
      } else {
        productRows = await dbQuery(
          `SELECT *
            FROM products
            WHERE id = $1::uuid AND seller_id = $2::uuid
            LIMIT 1`,
          [id, sellerId]
        );
      }
      const product = productRows[0];
      if (!product) return res.status(404).render('errors/404', { title: '商品が見つかりません' });

      // マスタ・付随情報
      const [categories, images, specs, tags] = await Promise.all([
        dbQuery(`SELECT id, name FROM categories ORDER BY sort_order NULLS LAST, name ASC`),
        dbQuery(`SELECT id, url, alt, position FROM product_images WHERE product_id = $1::uuid ORDER BY position ASC`, [id]),
        dbQuery(`SELECT id, label, value, position FROM product_specs WHERE product_id = $1::uuid ORDER BY position ASC`, [id]),
        dbQuery(`
          SELECT t.id, t.name, t.slug
            FROM product_tags pt
            JOIN tags t ON t.id = pt.tag_id
           WHERE pt.product_id = $1::uuid
           ORDER BY t.name ASC`,
          [id]
        ),
      ]);

      const { htmlToRaw } = require('./services/desc');
      const rawForForm = product.description_raw ? product.description_raw : htmlToRaw(product.description_html || '');
      return res.render('seller/listing-edit', {
        title: '出品を編集',
        product: { ...product, description_raw: rawForForm },
        categories, images, specs, tags
      });
    } catch (e) { next(e); }
  }
);

// ========== 編集保存 ==========
app.post(
  '/seller/listing-edit/:id',
  requireAuth,
  requireRole(['seller', 'admin']),
  uploadLimiter,
  upload.fields([{ name: 'images', maxCount: 8 }]),
  [
    body('title').trim().isLength({ min: 1, max: 80 }).withMessage('商品名を入力してください（80文字以内）。'),
    body('price').isInt({ min: 0 }).withMessage('価格は0以上の整数で入力してください。'),
    body('stock').isInt({ min: 0 }).withMessage('在庫は0以上の整数で入力してください。'),
    body('categoryId').isInt().withMessage('カテゴリを選択してください。'),
    body('unit').trim().isLength({ min: 1, max: 16 }).withMessage('単位を入力してください。'),
    body('shipMethod').isIn(['normal','cool']).withMessage('配送方法を選択してください。'),
    body('shipDays').isIn(['1-2','2-3','4-7']).withMessage('発送目安を選択してください。'),
    body('status').isIn(['draft','private','public']).withMessage('ステータスを選択してください。'),
    body('description').trim().isLength({ min: 1 }).withMessage('商品の詳細説明を入力してください。'),
  ],
  async (req, res, next) => {
    const id = String(req.params.id || '').trim();
    if (!isUuid(id)) return res.status(400).render('errors/404', { title: '不正なID' });

    const sellerId = req.session.user.id;
    const currentRoles = req.session.user.roles;

    // バリデーション
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // 再描画用データ
      let productRows;
      if (currentRoles.includes('admin')) {
        productRows = await Promise.all([
          dbQuery(`SELECT * FROM products WHERE id = $1::uuid LIMIT 1`, [id]),
        ]);
      } else {
        productRows = await Promise.all([
          dbQuery(`SELECT * FROM products WHERE id = $1::uuid AND seller_id = $2::uuid LIMIT 1`, [id, sellerId]),
        ]);
      }
      const [categories, images, specs, tags] = await Promise.all([
        dbQuery(`SELECT id, name FROM categories ORDER BY sort_order NULLS LAST, name ASC`),
        dbQuery(`SELECT id, url, alt, position FROM product_images WHERE product_id = $1::uuid ORDER BY position ASC`, [id]),
        dbQuery(`SELECT id, label, value, position FROM product_specs  WHERE product_id = $1::uuid ORDER BY position ASC`, [id]),
        dbQuery(`
          SELECT t.id, t.name, t.slug
            FROM product_tags pt
            JOIN tags t ON t.id = pt.tag_id
           WHERE pt.product_id = $1::uuid
           ORDER BY t.name ASC`,
          [id]
        ),
      ]);
      const product = productRows[0];

      const fieldErrors = {};
      for (const e of errors.array()) if (!fieldErrors[e.path]) fieldErrors[e.path] = e.msg;
      return res.status(422).render('seller/listing-edit', {
        title: '出品を編集',
        product, categories, images, specs, tags,
        fieldErrors
      });
    }

    // 入力取り出し
    const title       = req.body.title;
    const price       = Number(req.body.price);
    const stock       = Number(req.body.stock);
    const categoryId  = Number(req.body.categoryId);
    const unit        = req.body.unit;
    const shipMethod  = req.body.shipMethod;
    const shipDays    = req.body.shipDays;
    const status      = req.body.status;
    const isOrganic   = !!req.body.isOrganic;
    const isSeasonal  = !!req.body.isSeasonal;
    const description = renderDescHtml(req.body.description);

    // 画像（既存リスト + 新規URL）
    const imagesPayload = req.body.images || []; // {id?, url, alt?, position}[]
    // <form> から来ると Object だったり Array だったりするので正規化
    const normalizeArray = (objOrArr) => {
      if (!objOrArr) return [];
      if (Array.isArray(objOrArr)) return objOrArr;
      // { "0": {...}, "1": {...} } 形式
      return Object.keys(objOrArr)
        .sort((a,b)=>Number(a)-Number(b))
        .map(k => objOrArr[k]);
    };
    const currentImages = normalizeArray(imagesPayload)
      .map(r => ({
        id: (r.id || '').toString().trim(),
        url: (r.url || '').toString().trim(),
        alt: (r.alt || '').toString().trim(),
        position: Number(r.position || 0)
      }))
      .filter(r => r.url); // url が空のものは除去

    const newImageUrls = (req.body.imageUrls || '')
      .split('\n').map(s => s.trim()).filter(Boolean);

    // スペック
    const specsPayload = normalizeArray(req.body.specs).map(r => ({
      id: (r.id || '').toString().trim(),
      label: (r.label || '').toString().trim(),
      value: (r.value || '').toString().trim(),
      position: Number(r.position || 0)
    })).filter(r => (r.label || r.value)); // どちらか入っている行のみ

    // タグ
    let tagNames = [];
    if (Array.isArray(req.body.tags)) tagNames = req.body.tags.map(s => String(s).trim());
    else if (typeof req.body.tags === 'string') tagNames = req.body.tags.split(',').map(s => s.trim());
    tagNames = [...new Set(tagNames.filter(Boolean))];

    // 更新
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 所有者チェック
      let own;
      if (currentRoles.includes('admin')) {
        own = await client.query(
          `SELECT 1 FROM products WHERE id = $1::uuid`,
          [id]
        );
      } else {
        own = await client.query(
          `SELECT 1 FROM products WHERE id = $1::uuid AND seller_id = $2::uuid`,
          [id, sellerId]
        );
      }
      if (!own.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).render('errors/404', { title: '商品が見つかりません' });
      }

      const descriptionRaw  = String(req.body.description || '');
      const descriptionHtml = await renderDescHtml(req.body.description || '');
      // 本体 UPDATE（slug は据え置き）
      await client.query(
        `UPDATE products SET
            category_id = $1,
            title = $2,
            description_html = $3,
            description_raw  = $4,
            price = $5,
            unit = $6,
            stock = $7,
            is_organic = $8,
            is_seasonal = $9,
            ship_method = $10,
            ship_days = $11,
            status = $12,
            updated_at = now()
         WHERE id = $13::uuid`,
        [categoryId, title, descriptionHtml, descriptionRaw, price, unit, stock, isOrganic, isSeasonal, shipMethod, shipDays, status, id]
      );

      /* ===== 画像 ===== */
      // 1) 既存ID一覧
      const existImgs = await client.query(
        `SELECT id FROM product_images WHERE product_id = $1::uuid`,
        [id]
      );
      const existIds = new Set(existImgs.rows.map(r => String(r.id)));

      // 2) フォームに来たID一覧
      const formIds = new Set(currentImages.map(r => r.id).filter(isUuid));

      // 3) DELETE: 既存 - フォーム = 消されたもの
      const deleted = [...existIds].filter(x => !formIds.has(x));
      if (deleted.length) {
        await client.query(
          `DELETE FROM product_images WHERE product_id = $1::uuid AND id = ANY($2::uuid[])`,
          [id, deleted]
        );
      }

      // 4) UPDATE: id のある行は alt/position を更新
      for (const r of currentImages) {
        if (r.id && isUuid(r.id)) {
          await client.query(
            `UPDATE product_images
                SET alt = $1, position = $2
              WHERE id = $3::uuid AND product_id = $4::uuid`,
            [r.alt || null, r.position || 0, r.id, id]
          );
        }
      }

      // 5) INSERT: 新規画像（メタ付きJSONがあれば優先、無ければURLのみ）
      const newImageJsonRaw = (req.body.imageJson || '').trim();
      let newImageMeta = [];
      if (newImageJsonRaw) {
        try {
          const arr = JSON.parse(newImageJsonRaw);
          if (Array.isArray(arr)) {
            newImageMeta = arr.map(x => ({
              url:  String(x.url || '').trim(),
              r2_key: String(x.r2_key || x.key || '').trim() || null,
              mime: String(x.mime || '').trim() || null,
              bytes: Number.isFinite(Number(x.bytes)) ? Number(x.bytes) : null,
              width: Number.isFinite(Number(x.width)) ? Number(x.width) : null,
              height: Number.isFinite(Number(x.height)) ? Number(x.height) : null
            })).filter(x => x.url);
          }
        } catch { /* 無視 */ }
      }

      if (newImageMeta.length || newImageUrls.length) {
        // 現在の最大 position を取得
        const maxPosRes = await client.query(
          `SELECT COALESCE(MAX(position), -1) AS maxp
            FROM product_images
            WHERE product_id = $1::uuid`,
          [id]
        );
        let basePos = Number(maxPosRes.rows[0]?.maxp || -1);

        // === 既存URLを拾って同一商品の重複を除去 ===
        const existUrlRows = await client.query(
          `SELECT url FROM product_images WHERE product_id = $1::uuid`,
          [id]
        );
        const existUrlSet = new Set(existUrlRows.rows.map(r => String(r.url)));

        // フロントから来たメタを「同一商品の既存URLを除外」して正規化
        let metaToInsert = (newImageMeta || []).filter(m => !existUrlSet.has(m.url));

        // URLのみの追加も同様に除外
        const urlOnlyToInsert = (newImageUrls || []).filter(u => !existUrlSet.has(u));

        // ここで何も無ければスキップ
        if (!metaToInsert.length && !urlOnlyToInsert.length) {
          // 何も挿入せず通過
        } else {
          // === r2_key のグローバル重複を判定 ===
          const keys = metaToInsert.map(m => m.r2_key).filter(Boolean);
          let usedKeySet = new Set();
          if (keys.length) {
            const usedRows = await client.query(
              `SELECT r2_key FROM product_images WHERE r2_key = ANY($1)`,
              [keys]
            );
            usedKeySet = new Set(usedRows.rows.map(r => String(r.r2_key)));
          }

          // === 1件ずつ安全にINSERT（r2_keyが既に使われている場合はNULLへ） ===
          for (const m of metaToInsert) {
            basePos += 1;
            const r2KeyForInsert = (m.r2_key && !usedKeySet.has(m.r2_key)) ? m.r2_key : null;

            await client.query(
              `
              INSERT INTO product_images
                (product_id, url, r2_key, mime, bytes, width, height, position)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
              ON CONFLICT (r2_key) DO NOTHING
              `,
              [id, m.url, r2KeyForInsert, m.mime, m.bytes, m.width, m.height, basePos]
            );
          }

          // === URLのみ挿入（r2_keyは持たない） ===
          for (const u of urlOnlyToInsert) {
            basePos += 1;
            await client.query(
              `
              INSERT INTO product_images (product_id, url, position)
              VALUES ($1,$2,$3)
              `,
              [id, u, basePos]
            );
          }
        }
      }

      /* ===== スペック ===== */
      // 既存ID
      const existSpecs = await client.query(
        `SELECT id FROM product_specs WHERE product_id = $1::uuid`,
        [id]
      );
      const existSpecIds = new Set(existSpecs.rows.map(r => String(r.id)));
      const formSpecIds  = new Set(specsPayload.map(r => r.id).filter(isUuid));
      const specDeleted  = [...existSpecIds].filter(x => !formSpecIds.has(x));
      if (specDeleted.length) {
        await client.query(
          `DELETE FROM product_specs WHERE product_id = $1::uuid AND id = ANY($2::uuid[])`,
          [id, specDeleted]
        );
      }
      // UPDATE
      for (const r of specsPayload) {
        if (r.id && isUuid(r.id)) {
          await client.query(
            `UPDATE product_specs
                SET label = $1, value = $2, position = $3
              WHERE id = $4::uuid AND product_id = $5::uuid`,
            [r.label || '—', r.value || '—', r.position || 0, r.id, id]
          );
        }
      }
      // INSERT（id の無いもの）
      const toInsertSpecs = specsPayload.filter(r => !r.id || !isUuid(r.id));
      if (toInsertSpecs.length) {
        const values = toInsertSpecs.map((_, i) => `($1,$${i*3+2},$${i*3+3},$${i*3+4})`).join(',');
        const params = [id, ...toInsertSpecs.flatMap(r => [r.label || '—', r.value || '—', r.position || 0])];
        await client.query(
          `INSERT INTO product_specs (product_id, label, value, position) VALUES ${values}`,
          params
        );
      }

      /* ===== タグ（再リンク） ===== */
      // 既存リンク削除
      await client.query(`DELETE FROM product_tags WHERE product_id = $1::uuid`, [id]);

      if (tagNames.length) {
        const unique = [...new Set(tagNames)];
        const pairs = unique.map(name => ({ slug: toTagSlug(name), name }));

        // 既存タグを拾う
        const slugs = pairs.map(p => p.slug);
        const existRes = await client.query(
          `SELECT id, slug, name FROM tags WHERE slug = ANY($1) OR name = ANY($2)`,
          [slugs, unique]
        );
        const existBySlug = new Map(existRes.rows.map(r => [r.slug, r]));
        const existByName = new Map(existRes.rows.map(r => [r.name, r]));

        // ないものだけ INSERT（name/slug どちらの一意制約にも抵触しないように）
        const toInsert = pairs.filter(p => !existBySlug.has(p.slug) && !existByName.has(p.name));
        if (toInsert.length) {
          const valuesClause = toInsert.map((_, i) => `($${i*2+1},$${i*2+2})`).join(',');
          const params = toInsert.flatMap(p => [p.slug, p.name]);
          await client.query(
            `
            INSERT INTO tags (slug, name)
            SELECT v.slug, v.name
              FROM (VALUES ${valuesClause}) AS v(slug, name)
            WHERE NOT EXISTS (
                    SELECT 1 FROM tags t WHERE t.slug = v.slug OR t.name = v.name
                  )
            ON CONFLICT DO NOTHING
            `,
            params
          );
        }

        // 最新IDを取得してリンク作成
        const finalRows = await client.query(
          `SELECT id FROM tags WHERE slug = ANY($1) OR name = ANY($2)`,
          [slugs, unique]
        );
        const tagIds = finalRows.rows.map(r => r.id);
        if (tagIds.length) {
          const linkValues = tagIds.map((_, i) => `($1,$${i+2})`).join(',');
          await client.query(
            `INSERT INTO product_tags (product_id, tag_id) VALUES ${linkValues} ON CONFLICT DO NOTHING`,
            [id, ...tagIds]
          );
        }
      }

      await client.query('COMMIT');

      // 保存後は商品詳細へ（slugは据え置き）
      const prod = await dbQuery(`SELECT id, slug FROM products WHERE id = $1::uuid LIMIT 1`, [id]);
      return res.redirect(`/products/${prod[0].id}`);
    } catch (e) {
      try { await pool.query('ROLLBACK'); } catch {}
      next(e);
    }
  }
);

/* =========================================================
 *  最近の注文（DB）
 * =======================================================*/
app.get('/orders/recent', requireAuth, async (req, res, next) => {
  try {
    let {
      q = '',
      status = 'all',
      dateFrom = '',
      dateTo = '',
      range = '30d',
      page = 1,
      hasIssues = '',
      hasReviewable = '',
      highAmount = ''
    } = req.query;

    // 期間ショートカット → created_at に適用
    if (!dateFrom && !dateTo && range && range !== 'all') {
      const now = new Date();
      const d = new Date(now);
      if (range === '7d')  d.setDate(now.getDate() - 7);
      if (range === '30d') d.setDate(now.getDate() - 30);
      if (range === '90d') d.setDate(now.getDate() - 90);
      dateFrom = d.toISOString().slice(0, 10);
      dateTo   = now.toISOString().slice(0, 10);
    }

    const where = ['1=1'];
    const params = [];

    // キーワード検索
    if (q) {
      params.push(`%${q}%`);
      const like = `$${params.length}`;
      // order_number がある前提。万一 NULL の場合は id::text でフォールバック
      where.push(`(
        COALESCE(o.order_number, o.id::text) ILIKE ${like}
        OR EXISTS (
          SELECT 1
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            LEFT JOIN users su ON su.id = p.seller_id
           WHERE oi.order_id = o.id
             AND (p.title ILIKE ${like} OR COALESCE(su.name,'') ILIKE ${like})
        )
      )`);
    }

    const userId = req.session?.user?.id;
    params.push(userId);
    where.push(`o.buyer_id = $${params.length}`);

    // ステータス
    if (status !== 'all') {
      params.push(status);
      where.push(`o.status = $${params.length}`);
    }

    // 日付範囲（created_at）
    if (dateFrom) {
      params.push(dateFrom + 'T00:00:00');
      where.push(`o.created_at >= $${params.length}`);
    }
    if (dateTo) {
      params.push(dateTo + 'T23:59:59');
      where.push(`o.created_at <= $${params.length}`);
    }

    // 問題あり（オプショナル: カラムが無い場合は空文字で安全化）
    if (hasIssues) {
      where.push(`(COALESCE(o.payment_status,'') = 'failed' OR COALESCE(o.shipment_status,'') = 'returned')`);
    }

    // レビュー可能（配達完了 & 未レビュー）
    if (hasReviewable) {
      where.push(`(o.status = 'delivered' AND o.reviewed = false)`);
    }

    // 高額フィルタ
    if (highAmount) {
      where.push(`o.total >= 10000`);
    }

    // ページング
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = 10;
    const offset = (pageNum - 1) * pageSize;

    const totalRows = await dbQuery(
      `SELECT COUNT(*)::int AS cnt FROM orders o WHERE ${where.join(' AND ')}`,
      params
    );
    const total = totalRows[0]?.cnt || 0;

    // 一覧データ（UI専用の形に整形）
    const rows = await dbQuery(
      `
      SELECT
        o.id,
        COALESCE(o.order_number, o.id::text) AS order_no,
        o.status,
        o.payment_status,
        o.payment_method,
        o.shipment_status,
        o.ship_method,
        o.total,
        o.subtotal,
        o.discount,
        o.shipping_fee,
        o.created_at,
        o.updated_at,
        o.eta_at,
        o.note,
        o.reviewed,
        o.ship_time_code,
        (
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',       p.id,
                     'slug',     p.slug,
                     'name',     p.title,
                     'producer', COALESCE(su.name, ''),
                     'qty',      oi.quantity,
                     'unit',     p.unit,
                     'image',   (
                                  SELECT pi.url
                                    FROM product_images pi
                                   WHERE pi.product_id = p.id
                                   ORDER BY pi.position ASC
                                   LIMIT 1
                                )
                   )
                 )
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            LEFT JOIN users su ON su.id = p.seller_id
           WHERE oi.order_id = o.id
        ) AS items
      FROM orders o
      WHERE ${where.join(' AND ')}
      ORDER BY o.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
      `,
      params
    );

    // EJS の期待プロパティ名に合わせて整形（日本語ラベル含む）
    const items = rows.map(r => ({
      orderNo: r.order_no,
      // original (keep for internal logic / links)
      status: r.status,
      payment_status: r.payment_status || null,
      payment_method: r.payment_method || null,
      shipment_status: r.shipment_status || null,
      ship_method: r.ship_method || null,
      // Japanese labels for UI
      status_ja: jaLabel('order_status', r.status),
      payment_status_ja: r.payment_status ? jaLabel('payment_status', r.payment_status) : null,
      payment_method_ja: r.payment_method ? jaLabel('payment_method', r.payment_method) : null,
      shipment_status_ja: r.shipment_status ? jaLabel('shipment_status', r.shipment_status) : null,
      ship_method_ja: r.ship_method ? jaLabel('ship_method', r.ship_method) : null,
      shipTimeJa: shipTimeLabel(r.ship_time_code) || null,

      total: r.total,
      created_at: new Date(r.created_at).toLocaleString('ja-JP'),
      eta: r.eta_at ? new Date(r.eta_at).toLocaleDateString('ja-JP') : null,
      reviewed: !!r.reviewed,
      note: r.note || null,
      items: r.items || []
    }));

    const pagination = { page: pageNum, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
    const buildQuery = (p = {}) => {
      const base = {
        q, status, dateFrom, dateTo, range,
        hasIssues: hasIssues ? 1 : '',
        hasReviewable: hasReviewable ? 1 : '',
        highAmount: highAmount ? 1 : '',
        page: pageNum
      };
      const merged = { ...base, ...p };
      Object.keys(merged).forEach(k => (merged[k] === '' || merged[k] == null) && delete merged[k]);
      const qs = new URLSearchParams(merged).toString();
      return `/orders/recent${qs ? `?${qs}` : ''}`;
    };

    const quickFilters = [];
    if (hasIssues) quickFilters.push('hasIssues');
    if (hasReviewable) quickFilters.push('hasReviewable');

    res.render('orders/recent', {
      title: '最近の注文',
      items, total, pagination,
      q, status, dateFrom, dateTo, range,
      page: pageNum,
      quickFilters,
      buildQuery
    });
  } catch (e) {
    next(e);
  }
});

// タイムゾーン（売上集計を日本時間で統一）
const JST_TZ = 'Asia/Tokyo';

// 売上集計のWHERE句の共通フィルタを作る
function buildSellerFilters({ sellerId, q, categoryId, paymentMethod, paidOnly = true, owner }) {
  let where;
  let params = [];
  if (!owner || owner !== 'owner_all') {
    where = [
      `EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.seller_id = $1)`
    ];
    params = [sellerId];
  } else {
    where = [
      `EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)`
    ];
  }

  if (paidOnly) {
    where.push(`o.Payment_status IN ('paid','refunded')`);
  }

  if (q) {
    params.push(`%${q}%`);
    const like = `$${params.length}`;
    where.push(`(
      COALESCE(o.order_number, o.id::text) ILIKE ${like}
      OR EXISTS (
        SELECT 1 FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        LEFT JOIN users su ON su.id = p.seller_id
        WHERE oi.order_id = o.id
          AND (p.title ILIKE ${like} OR COALESCE(su.name,'') ILIKE ${like})
      )
    )`);
  }

  if (categoryId) {
    params.push(categoryId);
    where.push(`EXISTS (
      SELECT 1 FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id AND p.category_id = $${params.length}
    )`);
  }

  if (paymentMethod) {
    params.push(paymentMethod);
    where.push(`o.payment_method = $${params.length}`);
  }

  return { where, params };
}

// 「1注文＝1カウント」にしたいので order_items を重複カウントしないよう DISTINCT でカウント
const COUNT_ORDERS_SQL = `COUNT(DISTINCT o.id)`;
const SUM_REVENUE_SQL  = `COALESCE(SUM(oi.price * oi.quantity),0)`;

/**
 * カード用：今月=週単位、今週=日単位、全期間=月単位
 * 返却: { month: Bucket[], week: Bucket[], all: Bucket[] }
 * Bucket = { label, revenue, orders }
 */
async function getRevenueCardData(dbQuery, sellerId) {
  // 今週（日単位：当週の月曜〜日曜）
  const weekRows = await dbQuery(`
    WITH span AS (
      SELECT date_trunc('week', (now() AT TIME ZONE $1)) AS wstart
    )
    SELECT
      to_char(date_trunc('day', o.created_at AT TIME ZONE $1), 'MM/DD') AS label,
      ${SUM_REVENUE_SQL}::int AS revenue,
      ${COUNT_ORDERS_SQL}     AS orders
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    CROSS JOIN span
    WHERE oi.seller_id = $2
      AND o.payment_status IN ('paid','refunded')
      AND (o.created_at AT TIME ZONE $1) >= span.wstart
      AND (o.created_at AT TIME ZONE $1) <  span.wstart + interval '7 days'
    GROUP BY label
    ORDER BY MIN(date_trunc('day', o.created_at AT TIME ZONE $1)) ASC
  `, [JST_TZ, sellerId]);

  // 今月（週単位：週の開始日でバケット）
  const monthRows = await dbQuery(`
    WITH span AS (
      SELECT date_trunc('month', (now() AT TIME ZONE $1)) AS mstart
    )
    SELECT
      to_char(date_trunc('week', o.created_at AT TIME ZONE $1), 'MM/DD') AS label,
      ${SUM_REVENUE_SQL}::int AS revenue,
      ${COUNT_ORDERS_SQL}     AS orders,
      MIN(date_trunc('week', o.created_at AT TIME ZONE $1)) AS w
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    CROSS JOIN span
    WHERE oi.seller_id = $2
      AND o.payment_status IN ('paid','refunded')
      AND (o.created_at AT TIME ZONE $1) >= span.mstart
      AND (o.created_at AT TIME ZONE $1) <  span.mstart + interval '1 month'
    GROUP BY label
    ORDER BY w ASC
  `, [JST_TZ, sellerId]);

  // 全期間（月単位）
  const allRows = await dbQuery(`
    SELECT
      to_char(date_trunc('month', o.created_at AT TIME ZONE $1), 'YYYY-MM') AS label,
      ${SUM_REVENUE_SQL}::int AS revenue,
      ${COUNT_ORDERS_SQL}     AS orders
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE oi.seller_id = $2
      AND o.payment_status IN ('paid','refunded')
    GROUP BY label
    ORDER BY MIN(date_trunc('month', o.created_at AT TIME ZONE $1)) ASC
  `, [JST_TZ, sellerId]);

  // 今月のラベルを「第n週」表示にしたい場合はここで置換（UIはMM/DDでもOK）
  const month = monthRows.map((r, i) => ({ label: `第${i+1}週`, revenue: r.revenue, orders: r.orders }));
  const week  = weekRows.map(r => ({ label: r.label, revenue: r.revenue, orders: r.orders }));
  const all   = allRows.map(r => ({ label: r.label, revenue: r.revenue, orders: r.orders }));

  return { month, week, all };
}

async function getRevenueCardDataAdmin(dbQuery) {
  // 今週（日単位：当週の月曜〜日曜）
  const weekRows = await dbQuery(`
    WITH span AS (
      SELECT date_trunc('week', (now() AT TIME ZONE $1)) AS wstart
    )
    SELECT
      to_char(date_trunc('day', o.created_at AT TIME ZONE $1), 'MM/DD') AS label,
      ${SUM_REVENUE_SQL}::int AS revenue,
      ${COUNT_ORDERS_SQL}     AS orders
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    CROSS JOIN span
    WHERE o.payment_status IN ('paid','refunded')
      AND (o.created_at AT TIME ZONE $1) >= span.wstart
      AND (o.created_at AT TIME ZONE $1) <  span.wstart + interval '7 days'
    GROUP BY label
    ORDER BY MIN(date_trunc('day', o.created_at AT TIME ZONE $1)) ASC
  `, [JST_TZ]);

  // 今月（週単位：週の開始日でバケット）
  const monthRows = await dbQuery(`
    WITH span AS (
      SELECT date_trunc('month', (now() AT TIME ZONE $1)) AS mstart
    )
    SELECT
      to_char(date_trunc('week', o.created_at AT TIME ZONE $1), 'MM/DD') AS label,
      ${SUM_REVENUE_SQL}::int AS revenue,
      ${COUNT_ORDERS_SQL}     AS orders,
      MIN(date_trunc('week', o.created_at AT TIME ZONE $1)) AS w
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    CROSS JOIN span
    WHERE o.payment_status IN ('paid','refunded')
      AND (o.created_at AT TIME ZONE $1) >= span.mstart
      AND (o.created_at AT TIME ZONE $1) <  span.mstart + interval '1 month'
    GROUP BY label
    ORDER BY w ASC
  `, [JST_TZ]);

  // 全期間（月単位）
  const allRows = await dbQuery(`
    SELECT
      to_char(date_trunc('month', o.created_at AT TIME ZONE $1), 'YYYY-MM') AS label,
      ${SUM_REVENUE_SQL}::int AS revenue,
      ${COUNT_ORDERS_SQL}     AS orders
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.payment_status IN ('paid','refunded')
    GROUP BY label
    ORDER BY MIN(date_trunc('month', o.created_at AT TIME ZONE $1)) ASC
  `, [JST_TZ]);

  // 今月のラベルを「第n週」表示にしたい場合はここで置換（UIはMM/DDでもOK）
  const month = monthRows.map((r, i) => ({ label: `第${i+1}週`, revenue: r.revenue, orders: r.orders }));
  const week  = weekRows.map(r => ({ label: r.label, revenue: r.revenue, orders: r.orders }));
  const all   = allRows.map(r => ({ label: r.label, revenue: r.revenue, orders: r.orders }));

  return { month, week, all };
}

// yyyy-mm, yyyy-ww, yyyy などを安全にパースする小ヘルパ
function parseRangeFromQuery(q) {
  const {
    granularity = '',          // 'day' | 'week' | 'month' | 'year'（新）
    dateFrom = '',             // 'YYYY-MM-DD'（day用: from）
    dateTo   = '',             // 'YYYY-MM-DD'（day用: to）
    week     = '',             // 'YYYY-Www'  （week用）
    ym       = '',             // 'YYYY-MM'    (month用)
    year     = ''              // 'YYYY'       (year用)
  } = q || {};

  // 後方互換: 旧 period を granularity に寄せる
  let g = granularity || q.period || 'month';

  // 正規化
  if (!['day','week','month','year'].includes(g)) g = 'month';

  return { g, dateFrom, dateTo, week, ym, year };
}

// 汎用フィルタ（既存の buildSellerFilters をそのまま活用）
async function getAnalyticsBucketsV2(dbQuery, sellerId, owner, { g, q, categoryId, paymentMethod, dateFrom, dateTo, week, ym, year }) {
  const { where, params } = buildSellerFilters({
    sellerId,
    q,
    categoryId,
    paymentMethod,
    paidOnly: true,
    owner
  });

  // 開始・終了日時（JSTベース）を決定
  let startExpr = null;
  let endExpr   = null;
  const tzBindPos = params.length + 1; // $N として利用
  params.push(JST_TZ);

  // 粒度に応じて期間を決定
  if (g === 'day') {
    // パラメータ：最初にTZを入れてある前提（tzBindPos = params.length+1; params.push(JST_TZ);）
    let startExpr, endExpr;

    if (dateFrom) { params.push(`${dateFrom} 00:00:00`); startExpr = `$${params.length}::timestamp`; }
    if (dateTo)   { params.push(`${dateTo} 23:59:59`);   endExpr   = `$${params.length}::timestamp`; }

    // 未指定なら「今月」範囲（ローカル＝JSTの月初〜月末）
    if (!startExpr || !endExpr) {
      startExpr = `date_trunc('month', (now() AT TIME ZONE $${tzBindPos}))`;
      endExpr   = `date_trunc('month', (now() AT TIME ZONE $${tzBindPos})) + interval '1 month'`;
    }

    const sql = `
      SELECT
        to_char(date_trunc('day', o.created_at AT TIME ZONE $${tzBindPos}), 'MM/DD') AS label,
        ${SUM_REVENUE_SQL}::int AS revenue,
        ${COUNT_ORDERS_SQL}     AS orders,
        MIN(date_trunc('day', o.created_at AT TIME ZONE $${tzBindPos})) AS d
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE ${where.join(' AND ')}
        AND (o.created_at AT TIME ZONE $${tzBindPos}) >= ${startExpr}
        AND (o.created_at AT TIME ZONE $${tzBindPos}) <  ${endExpr}
      GROUP BY label
      ORDER BY d ASC
    `;
    const rows = await dbQuery(sql, params);
    return rows.map(r => ({ label: r.label, revenue: r.revenue, orders: r.orders }));
  }

  if (g === 'week') {
    // ISO週 'YYYY-Www' を採用（例：2025-W39）
    // 週が未指定なら「今週」
    let weekStartExpr;
    if (week && /^\d{4}-W\d{2}$/.test(week)) {
      // ISO週の月曜（ローカル）を timestamp で作って使う
      params.push(week + '-1'); // 月曜日
      const pos = params.length;
      weekStartExpr = `date_trunc('week', to_date($${pos}, 'IYYY-"W"IW-ID')::timestamp)`;
    } else {
      weekStartExpr = `date_trunc('week', (now() AT TIME ZONE $${tzBindPos}))`;
    }

    const sql = `
      WITH span AS (SELECT ${weekStartExpr} AS wstart)
      SELECT
        to_char(date_trunc('day', o.created_at AT TIME ZONE $${tzBindPos}), 'MM/DD') AS label,
        ${SUM_REVENUE_SQL}::int AS revenue,
        ${COUNT_ORDERS_SQL}     AS orders,
        MIN(date_trunc('day', o.created_at AT TIME ZONE $${tzBindPos})) AS d
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      CROSS JOIN span
      WHERE ${where.join(' AND ')}
        AND (o.created_at AT TIME ZONE $${tzBindPos}) >= span.wstart
        AND (o.created_at AT TIME ZONE $${tzBindPos}) <  span.wstart + interval '7 days'
      GROUP BY label
      ORDER BY d ASC
    `;
    const rows = await dbQuery(sql, params);
    return rows.map(r => ({ label: r.label, revenue: r.revenue, orders: r.orders }));
  }

  if (g === 'month') {
    // ym = 'YYYY-MM' の月（未指定なら今月）
    let monthStartExpr;
    if (ym && /^\d{4}-\d{2}$/.test(ym)) {
      params.push(ym + '-01 00:00:00');
      const pos = params.length;
      monthStartExpr = `(to_timestamp($${pos}, 'YYYY-MM-DD HH24:MI:SS') AT TIME ZONE $${tzBindPos})`;
    } else {
      monthStartExpr = `date_trunc('month', (now() AT TIME ZONE $${tzBindPos}))`;
    }
    const sql = `
      WITH span AS (SELECT ${monthStartExpr} AS mstart)
      SELECT
        to_char(date_trunc('week', o.created_at AT TIME ZONE $${tzBindPos}), 'MM/DD') AS label,
        ${SUM_REVENUE_SQL}::int AS revenue,
        ${COUNT_ORDERS_SQL}     AS orders,
        MIN(date_trunc('week', o.created_at AT TIME ZONE $${tzBindPos})) AS w
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      CROSS JOIN span
      WHERE ${where.join(' AND ')}
        AND (o.created_at AT TIME ZONE $${tzBindPos}) >= span.mstart
        AND (o.created_at AT TIME ZONE $${tzBindPos}) <  span.mstart + interval '1 month'
      GROUP BY label
      ORDER BY w ASC
    `;
    const rows = await dbQuery(sql, params);
    return rows.map((r, i) => ({ label: `第${i+1}週`, revenue: r.revenue, orders: r.orders }));
  }

  // year
  {
    // 指定年（未指定なら今年）
    let yearStartExpr;
    if (year && /^\d{4}$/.test(year)) {
      params.push(year + '-01-01 00:00:00');
      const pos = params.length;
      yearStartExpr = `(to_timestamp($${pos}, 'YYYY-MM-DD HH24:MI:SS') AT TIME ZONE $${tzBindPos})`;
    } else {
      yearStartExpr = `date_trunc('year', (now() AT TIME ZONE $${tzBindPos}))`;
    }

    const sql = `
      WITH span AS (SELECT ${yearStartExpr} AS ystart)
      SELECT
        to_char(date_trunc('month', o.created_at AT TIME ZONE $${tzBindPos}), 'YYYY-MM') AS label,
        ${SUM_REVENUE_SQL}::int AS revenue,
        ${COUNT_ORDERS_SQL}     AS orders,
        MIN(date_trunc('month', o.created_at AT TIME ZONE $${tzBindPos})) AS m
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      CROSS JOIN span
      WHERE ${where.join(' AND ')}
        AND (o.created_at AT TIME ZONE $${tzBindPos}) >= span.ystart
        AND (o.created_at AT TIME ZONE $${tzBindPos}) <  span.ystart + interval '1 year'
      GROUP BY label
      ORDER BY m ASC
    `;
    const rows = await dbQuery(sql, params);
    return rows.map(r => ({ label: r.label, revenue: r.revenue, orders: r.orders }));
  }
}

/* =========================================================
 *  ダッシュボード
 * =======================================================*/
app.get('/dashboard', requireAuth, (req, res) => {
  const roles = (req.session.user.roles || []);
  if (roles.includes('admin')) return res.redirect('/dashboard/admin');
  if (roles.includes('seller')) return res.redirect('/dashboard/seller');
  return res.redirect('/dashboard/buyer');
});

app.get('/dashboard/buyer', requireAuth, async (req, res, next) => {
  try {
    const user  = req.session.user;
    const uid   = user.id;
    const roles = Array.isArray(user.roles) ? user.roles : [];

    const [recentOrders, count, notices] = await Promise.all([
      dbQuery(`
        SELECT o.id, o.total, o.status, o.created_at, COALESCE(o.order_number, o.id::text) AS order_no
          FROM orders o
         WHERE o.buyer_id = $1
         ORDER BY o.created_at DESC
         LIMIT 3
      `, [uid]),
      dbQuery(`SELECT COUNT(*)::int AS cnt FROM orders WHERE buyer_id = $1`, [uid]),
      dbQuery(
        `
        WITH candidates AS (
          SELECT DISTINCT notification_id
            FROM notification_targets
           WHERE audience = 'all'
              OR (role IS NOT NULL AND role = ANY($2::text[]))
              OR (user_id = $1)
        )
        SELECT
          n.id,
          n.title,
          n.created_at,
          (nr.read_at IS NOT NULL) AS is_read
        FROM notifications n
        JOIN candidates c
          ON c.notification_id = n.id
        LEFT JOIN notification_reads nr
          ON nr.notification_id = n.id
         AND nr.user_id = $1
        WHERE (n.visible_from IS NULL OR n.visible_from <= now())
          AND (n.visible_to   IS NULL OR n.visible_to   >= now())
        ORDER BY n.created_at DESC
        LIMIT 5
        `,
        [uid, roles]
      )
    ]);

    const [recentProducts, favoriteProducts] = await Promise.all([
      fetchRecentProducts(req, 12),
      // お気に入り商品を取得
      dbQuery(
        `SELECT 
           p.id,
           p.title,
           p.price,
           p.unit,
           (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position ASC LIMIT 1) AS image_url
         FROM favorites f
         JOIN products p ON p.id = f.product_id
         WHERE f.user_id = $1::uuid
           AND p.status = 'public'
         ORDER BY f.created_at DESC
         LIMIT 12`,
        [uid]
      )
    ]);

    // 日本語ラベル付与（注文状況）
    const ordersWithJa = recentOrders.map(o => ({
      ...o,
      status_ja: jaLabel('order_status', o.status)
    }));

    res.render('dashboard/buyer', {
      title: 'ダッシュボード（購入者）',
      currentUser: req.session.user,
      orders: ordersWithJa,
      recent: recentProducts,
      favorites: favoriteProducts,
      notices,
      totalOrders: count[0]?.cnt || 0
    });
  } catch (e) { next(e); }
});

app.get('/dashboard/seller', requireAuth, requireRole(['seller']), async (req, res, next) => {
  try {
    const user  = req.session.user;
    const uid   = user.id;
    const roles = Array.isArray(user.roles) ? user.roles : [];
    const u = await dbQuery(
      'select id, partner_id from users where id = $1', [uid]
    );
    const partner_id = u[0].partner_id;


    const [listings, tradesRecent, tradesCount, revenueSum, revenueCardData, notices] = await Promise.all([
      dbQuery(`
        SELECT p.slug, p.title, p.price, p.stock, p.id, p.seller_id,
               (SELECT url FROM product_images WHERE product_id = p.id ORDER BY position ASC LIMIT 1) AS image_url,
               u.partner_id AS partner_id
          FROM products p
          LEFT JOIN users u ON u.id = p.seller_id
         WHERE p.seller_id = $1
          OR partner_id = $2
         ORDER BY p.updated_at DESC
         LIMIT 12
      `, [uid, partner_id]),

      // 直近6件
      dbQuery(`
        SELECT
          o.id,
          COALESCE(o.order_number, o.id::text) AS order_no,
          o.status AS order_status, o.ship_method, o.eta_at, o.ship_time_code,
          o.created_at,
          o.buyer_id,
          o.seller_id,
          SUM(oi.price * oi.quantity)::int AS amount,
          bu.name AS buyer_name
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN users bu ON bu.id = o.buyer_id
       WHERE oi.seller_id = $1
        OR o.seller_id = $2
       GROUP BY o.id, bu.name
       ORDER BY o.created_at DESC
       LIMIT 6
      `, [uid, partner_id]),

      // 総件数
      dbQuery(`
        SELECT COUNT(DISTINCT o.id)::int AS cnt
          FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
         WHERE oi.seller_id = $1
          OR o.seller_id = $2
      `, [uid, partner_id]),

      // 売上合計（入金確定ベース）
      dbQuery(`
        SELECT COALESCE(SUM(oi.price * oi.quantity),0)::int AS total
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
         WHERE (oi.seller_id = $1
          OR o.seller_id = $2)
           AND o.payment_status IN ('paid','refunded')
      `, [uid, partner_id]),

      // カード用：今月/今週/全期間のバケット
      getRevenueCardData(dbQuery, uid, partner_id),
      dbQuery(
        `
        WITH candidates AS (
          SELECT DISTINCT notification_id
            FROM notification_targets
           WHERE audience = 'all'
              OR (role IS NOT NULL AND role = ANY($2::text[]))
              OR (user_id = $1)
        )
        SELECT
          n.id,
          n.title,
          n.created_at,
          (nr.read_at IS NOT NULL) AS is_read
        FROM notifications n
        JOIN candidates c
          ON c.notification_id = n.id
        LEFT JOIN notification_reads nr
          ON nr.notification_id = n.id
         AND nr.user_id = $1
        WHERE (n.visible_from IS NULL OR n.visible_from <= now())
          AND (n.visible_to   IS NULL OR n.visible_to   >= now())
        ORDER BY n.created_at DESC
        LIMIT 5
        `,
        [uid, roles]
      )
    ]);

    const tradesCard = tradesRecent.map(t => ({
      id: t.id,
      buyer_name: t.buyer_name,
      date: new Date(t.created_at).toLocaleDateString('ja-JP'),
      amount: t.amount,
      status: jaLabel('order_status', t.order_status),
      ship_method: t.ship_method,
      shipMethodJa: jaLabel('ship_method', t.ship_method),
      eta: t.eta_at ? new Date(t.eta_at).toLocaleDateString('ja-JP') : '日付未指定',
      shipTimeJa: t.ship_time_code ? shipTimeLabel(t.ship_time_code) : '時間未指定'
    }));

    res.render('dashboard/seller', {
      title: 'ダッシュボード（出品者）',
      currentUser: req.session.user,
      listings,
      notices,
      trades: tradesCard,
      totalTrades: tradesCount[0]?.cnt || 0,
      revenue: revenueSum[0]?.total || 0,
      // ← 新カード用データ
      revenueCardData
    });
  } catch (e) { next(e); }
});

app.get('/dashboard/admin', requireAuth, requireRole(['admin']), async (req, res, next) => {
  try {
    const user  = req.session.user;
    const uid   = user.id;
    const roles = Array.isArray(user.roles) ? user.roles : [];

    const [listings, tradesRecent, tradesCount, revenueSum, revenueCardData, notices] = await Promise.all([
      dbQuery(`
        SELECT p.slug, p.title, p.price, p.stock, p.id,
               (SELECT url FROM product_images WHERE product_id = p.id ORDER BY position ASC LIMIT 1) AS image_url
          FROM products p
         ORDER BY p.updated_at DESC
         LIMIT 12
      `),

      // 直近6件
      dbQuery(`
        SELECT
          o.id,
          COALESCE(o.order_number, o.id::text) AS order_no,
          o.status AS order_status,
          o.created_at,
          o.buyer_id,
          SUM(oi.price * oi.quantity)::int AS amount,
          bu.name AS buyer_name
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN users bu ON bu.id = o.buyer_id
       GROUP BY o.id, bu.name
       ORDER BY o.created_at DESC
       LIMIT 6`
      ),

      // 総件数
      dbQuery(`
        SELECT COUNT(DISTINCT o.id)::int AS cnt
          FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
      `),

      // 売上合計（入金確定ベース）
      dbQuery(`
        SELECT COALESCE(SUM(oi.price * oi.quantity),0)::int AS total
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
         WHERE o.payment_status IN ('paid','refunded')
      `),

      // カード用：今月/今週/全期間のバケット
      getRevenueCardDataAdmin(dbQuery),
      dbQuery(
        `
        WITH candidates AS (
          SELECT DISTINCT notification_id
            FROM notification_targets
           WHERE audience = 'all'
              OR (role IS NOT NULL AND role = ANY($2::text[]))
              OR (user_id = $1)
        )
        SELECT
          n.id,
          n.title,
          n.created_at,
          (nr.read_at IS NOT NULL) AS is_read
        FROM notifications n
        JOIN candidates c
          ON c.notification_id = n.id
        LEFT JOIN notification_reads nr
          ON nr.notification_id = n.id
         AND nr.user_id = $1
        WHERE (n.visible_from IS NULL OR n.visible_from <= now())
          AND (n.visible_to   IS NULL OR n.visible_to   >= now())
        ORDER BY n.created_at DESC
        LIMIT 5
        `,
        [uid, roles]
      )
    ]);

    const tradesCard = tradesRecent.map(t => ({
      id: t.id,
      buyer_name: t.buyer_name,
      date: new Date(t.created_at).toLocaleDateString('ja-JP'),
      amount: t.amount,
      status: jaLabel('order_status', t.order_status)
    }));

    res.render('dashboard/admin', {
      title: 'ダッシュボード（管理者）',
      currentUser: req.session.user,
      listings,
      trades: tradesCard,
      totalTrades: tradesCount[0]?.cnt || 0,
      revenue: revenueSum[0]?.total || 0,
      notices,
      revenueCardData
    });
  } catch (e) { next(e); }
});

// 出品者の取引一覧
app.get('/seller/trades', requireAuth, requireRole(['seller', 'admin']), async (req, res, next) => {
  try {
    const uid = req.session.user.id;
    const currentRoles = req.session.user.roles;
    const { q = '', status = 'all', payment = 'all', ship = 'all', owner, page = 1 } = req.query;

    let where = [];
    let params = [];
    if (!owner || owner !== 'owner_all') {
      where = ['EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.seller_id = $1)'];
      params = [uid];
    } else if (owner === 'owner_all') {
      where = ['EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)'];
    }

    if (q) {
      params.push(`%${q}%`);
      const like = `$${params.length}`;
      where.push(`(
        COALESCE(o.order_number, o.id::text) ILIKE ${like}
        OR EXISTS (
          SELECT 1 FROM order_items oi
          JOIN products p ON p.id = oi.product_id
          LEFT JOIN users su ON su.id = p.seller_id
          WHERE oi.order_id = o.id
            AND (p.title ILIKE ${like} OR COALESCE(su.name,'') ILIKE ${like})
        )
      )`);
    }
    if (status !== 'all') { params.push(status); where.push(`o.status = $${params.length}`); }
    if (payment !== 'all') { params.push(payment); where.push(`o.payment_status = $${params.length}`); }
    if (ship !== 'all') { params.push(ship); where.push(`o.shipment_status = $${params.length}`); }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = 20, offset = (pageNum - 1) * pageSize;

    const total = (await dbQuery(
      `SELECT COUNT(*)::int AS cnt FROM orders o WHERE ${where.join(' AND ')}`, params
    ))[0]?.cnt || 0;

    const rows = await dbQuery(
      `
      SELECT
        o.id, COALESCE(o.order_number, o.id::text) AS order_no,
        o.status, o.payment_status, o.delivery_status,
        o.total, o.created_at, o.ship_method, o.ship_time_code, o.eta_at,
        p.name AS partner_name,
        u.name AS buyer_name
      FROM orders o
        JOIN users u ON u.id = o.buyer_id
        LEFT JOIN partners p ON p.id = u.partner_id
      WHERE ${where.join(' AND ')}
      ORDER BY o.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
      `,
      params
    );

    const items = rows.map(r => ({
      id: r.id,
      orderNo: r.order_no,
      status: r.status,
      status_ja: jaLabel('order_status', r.status),
      payment_status: r.payment_status,
      payment_status_ja: jaLabel('payment_status', r.payment_status),
      shipment_status: r.delivery_status,
      shipment_status_ja: jaLabel('shipment_status', r.delivery_status),
      ship_method: r.ship_method,
      ship_method_ja: jaLabel('ship_method', r.ship_method),
      total: r.total,
      partner_name: r.partner_name || r.buyer_name,
      created_at: new Date(r.created_at).toLocaleString('ja-JP'),
      eta: r.eta_at ? new Date(r.eta_at).toLocaleDateString('ja-JP') : '日付未指定',
      shipTimeJa: r.ship_time_code ? shipTimeLabel(r.ship_time_code) : '時間未指定'
    }));

    // フィルタHTML（プルダウンをモダン化）
    const filtersHTML = `
      <select name="status" class="select pulldown">
        <option value="all"${status==='all'?' selected':''}>すべての注文状況</option>
        <option value="processing"${status==='processing'?' selected':''}>処理中</option>
        <option value="delivered"${status==='delivered'?' selected':''}>完了</option>
        <option value="canceled"${status==='canceled'?' selected':''}>キャンセル</option>
      </select>
      <select name="payment" class="select pulldown">
        <option value="all"${payment==='all'?' selected':''}>すべての支払い状況</option>
        <option value="unpaid"${payment==='unpaid'?' selected':''}>未入金</option>
        <option value="paid"${payment==='paid'?' selected':''}>入金完了</option>
        <option value="canceled"${payment==='canceled'?' selected':''}>キャンセル</option>
        <option value="refunded"${payment==='refunded'?' selected':''}>返金済み</option>
      </select>
      <select name="ship" class="select pulldown">
        <option value="all"${ship==='all'?' selected':''}>すべての出荷状況</option>
        <option value="preparing"${ship==='preparing'?' selected':''}>出荷準備中</option>
        <option value="in_transit"${ship==='in_transit'?' selected':''}>お届け中</option>
        <option value="delivered"${ship==='delivered'?' selected':''}>配達完了</option>
        <option value="lost"${ship==='lost'?' selected':''}>紛失</option>
        <option value="returned"${ship==='returned'?' selected':''}>返品</option>
      </select>
      ` + (
        (currentRoles && currentRoles.includes('admin')) ? `
          <select name="owner" class="pulldown" aria-label="所有者">
            <option value="owner_own" ${ (owner||'owner_own')==='owner_own' ?'selected':'' }>自分の取引</option>
            <option value="owner_all" ${ owner==='owner_all' ?'selected':'' }>すべての取引</option>
          </select>
        ` : '')
    ;

    const pagination = { page: pageNum, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
    const buildQuery = (p={}) => {
      const merged = { q, status, payment, ship, page: pageNum, ...p };
      Object.keys(merged).forEach(k => (merged[k]==='' || merged[k]==null) && delete merged[k]);
      const qs = new URLSearchParams(merged).toString();
      return `/seller/trades${qs ? `?${qs}` : ''}`;
    };

    res.render('seller/trades/index', {
      title: '取引一覧',
      pageTitle: '取引一覧',
      request: req, // list.ejs の action で使う
      q, status, payment, ship, owner,
      items, total, pagination, buildQuery,
      // レイアウト用差し込み
      searchAction: '/seller/trades',
      filtersHTML
    });
  } catch (e) { next(e); }
});

// 詳細
app.get('/seller/trades/:id', requireAuth, requireRole(['seller', 'admin']), async (req, res, next) => {
  try {
    const uid = req.session.user.id;
    const id = String(req.params.id || '').trim();
    const currentRoles = req.session.user.roles;

    // 所有チェック（この注文に出品者自身の明細があるか）
    let own;
    if (currentRoles.includes('admin')) {
      own = await dbQuery(
        `SELECT 1
          FROM order_items oi
          WHERE oi.order_id = $1::uuid
          LIMIT 1`,
        [id]
      );  
    } else {
      own = await dbQuery(
        `SELECT 1
          FROM order_items oi
          WHERE oi.order_id = $1::uuid AND oi.seller_id = $2::uuid
          LIMIT 1`,
        [id, uid]
      );
    }
    if (!own.length) return res.status(404).render('errors/404', { title: '見つかりません' });

    // 注文本体
    const orderRows = await dbQuery(
      `SELECT o.*,
              COALESCE(o.order_number, o.id::text) AS order_no,
              u.name AS buyer_name, u.email AS buyer_email,
              p.name AS partner_name
         FROM orders o
         JOIN users u ON u.id = o.buyer_id
         LEFT JOIN partners p ON p.id = u.partner_id
        WHERE o.id = $1::uuid
        LIMIT 1`,
      [id]
    );
    const o = orderRows[0];
    if (!o) return res.status(404).render('errors/404', { title: '見つかりません' });

    // 住所（配送/請求）
    const [shipping] = await dbQuery(
      `SELECT * FROM order_addresses WHERE order_id = $1::uuid AND address_type = 'shipping' LIMIT 1`,
      [id]
    );
    const [billing] = await dbQuery(
      `SELECT * FROM order_addresses WHERE order_id = $1::uuid AND address_type = 'billing' LIMIT 1`,
      [id]
    );

    // 支払い・出荷（最新を取る想定）
    const [payment] = await dbQuery(
      `SELECT * FROM payments WHERE order_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
      [id]
    );
    const [shipment] = await dbQuery(
      `SELECT * FROM shipments WHERE order_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
      [id]
    );

    // 明細（商品画像つき）
    const items = await dbQuery(
      `
      SELECT
        oi.id, oi.quantity, oi.price,
        p.id AS product_id, p.slug, p.title, p.unit,
        (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position ASC LIMIT 1) AS image_url,
        u.name AS producer
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN users u ON u.id = p.seller_id
      WHERE oi.order_id = $1::uuid
      ORDER BY oi.id ASC
      `,
      [id]
    );

    const shipTimeCode = o.ship_time_code || null;
    const shipTimeJa   = shipTimeLabel(shipTimeCode);
    const etaDateStr = o.eta_at ? new Date(o.eta_at).toLocaleDateString('ja-JP') : '';
    const etaFull =
      etaDateStr || shipTimeJa
        ? `${etaDateStr || ''}${shipTimeJa ? ` ${shipTimeJa}` : ''}`
        : null;

    // 日本語ラベル
    const vm = {
      id: o.id,
      orderNo: o.order_no,
      status: o.status,
      status_ja: jaLabel('order_status', o.status),
      payment_status: o.payment_status,
      payment_status_ja: jaLabel('payment_status', o.payment_status),
      payment_method: o.payment_method,
      payment_method_ja: jaLabel('payment_method', o.payment_method),
      ship_method: o.ship_method,
      ship_method_ja: jaLabel('ship_method', o.ship_method),
      shipment_status: o.delivery_status,
      shipment_status_ja: jaLabel('shipment_status', o.delivery_status),
      created_at: new Date(o.created_at).toLocaleString('ja-JP'),
      eta: etaDateStr || null,
      ship_time_code: shipTimeCode,
      ship_time_ja:   shipTimeJa,
      eta_full:       etaFull,
      subtotal: o.subtotal, discount: o.discount, shipping_fee: o.shipping_fee, tax: o.tax, total: o.total,
      buyer: { name: o.buyer_name, email: o.buyer_email },
      partner: {name: o.partner_name},
      shipping, billing,
      payment, shipment,
      image_url: o.image_url,
      items: items.map(it => ({
        ...it,
        subtotal: (it.price || 0) * (it.quantity || 0)
      }))
    };

    res.render('seller/trades/show', {
      title: `取引 #${vm.orderNo}`,
      order: vm
    });
  } catch (e) { next(e); }
});

// ステータス更新
app.post(
  '/seller/trades/:id/status',
  requireAuth,
  requireRole(['seller', 'admin']),
  async (req, res, next) => {
    try {
      const id = String(req.params.id).trim();
      const { payment_status, shipment_status } = req.body || {};
      const sellerId = req.session.user.id;
      const currentRoles = req.session.user.roles || [];

      // ===== 所有者チェック =====
      let own;
      if (currentRoles.includes('admin')) {
        // 管理者は order_items が存在する注文ならOK（必要に応じて縛りを強くする）
        own = await dbQuery(
          `
          SELECT 1
            FROM orders o
           WHERE o.id = $1
             AND EXISTS (
               SELECT 1 FROM order_items oi WHERE oi.order_id = o.id
             )
          LIMIT 1
          `,
          [id]
        );
      } else {
        // seller は自分が seller_id の order_items を持つ注文のみ操作可能
        own = await dbQuery(
          `
          SELECT 1
            FROM orders o
           WHERE o.id = $1
             AND EXISTS (
               SELECT 1
                 FROM order_items oi
                WHERE oi.order_id = o.id
                  AND oi.seller_id = $2
             )
          LIMIT 1
          `,
          [id, sellerId]
        );
      }
      if (!own.length) {
        return res.status(404).json({ ok: false, message: 'not found' });
      }

      // ===== 値のバリデーション（ENUMに合わせて調整） =====
      const okPayment  = ['pending','completed','failed','authorized','paid','canceled','refunded','unpaid','cancelled'];
      const okShipment = ['pending','preparing','shipped','delivered','cancelled','returned','lost','canceled','in_transit'];

      const sets   = [];
      const params = [];

      if (payment_status && okPayment.includes(payment_status)) {
        sets.push(`payment_status = $${params.length + 1}`);
        params.push(payment_status);
      }

      if (shipment_status && okShipment.includes(shipment_status)) {
        // ✅ DB カラム名は shipment_status を想定（delivery_status ではない）
        sets.push(`delivery_status = $${params.length + 1}`);
        params.push(shipment_status);
      }

      if (!sets.length) {
        return res.status(400).json({ ok: false, message: 'no valid fields' });
      }

      // WHERE のための id
      params.push(id);

      // ===== UPDATE + トリガーで status を自動更新 → RETURNING で取得 =====
      const rows = await dbQuery(
        `
        UPDATE orders
           SET ${sets.join(', ')},
               updated_at = now()
         WHERE id = $${params.length}
        RETURNING
          id,
          status,
          payment_status,
          delivery_status
        `,
        params
      );

      if (!rows.length) {
        // ありえない想定だが、念のため
        return res.status(404).json({ ok: false, message: 'not found' });
      }

      const updated = rows[0];

      // ★ delivery_status が 'delivered' になったら台帳を送金可能にする
      if (updated.delivery_status === 'delivered') {
        try {
          const { recordDeliveryCompletedAndMarkAvailable } = require('./services/ledger');
          await recordDeliveryCompletedAndMarkAvailable(updated.id);
          logger.info('Ledger marked as available after delivery completed', {
            orderId: updated.id,
            deliveryStatus: updated.delivery_status
          });
        } catch (ledgerError) {
          logger.error('Failed to mark ledger available after delivery', {
            orderId: updated.id,
            error: ledgerError.message,
            stack: ledgerError.stack
          });
          // エラーでもレスポンスは成功を返す（後で手動修正可能）
        }
      }

      return res.json({
        ok: true,
        order: {
          id:               updated.id,
          status:           updated.status,
          payment_status:   updated.payment_status,
          shipment_status:  updated.delivery_status
        }
      });
    } catch (e) {
      next(e);
    }
  }
);

// server.js（任意）: 出荷ステータス更新（出品者は自分の明細がある注文のみ可）
app.post('/seller/trades/:id/shipment-status', requireAuth, requireRole(['seller', 'admin']), async (req, res, next) => {
  try {
    const uid = req.session.user.id;
    const id = String(req.params.id || '').trim();
    const next = String(req.body.status || '');
    const currentRoles = req.session.user.roles;

    if (!['preparing','in_transit','delivered','returned'].includes(next)) {
      return res.status(400).json({ ok:false, message:'不正な状態です。' });
    }

    let own;
    if (currentRoles.includes('admin')) {
      own = await dbQuery(
        `SELECT 1 FROM order_items oi WHERE oi.order_id = $1::uuid LIMIT 1`,
        [id]
      );
    } else {
      own = await dbQuery(
        `SELECT 1 FROM order_items oi WHERE oi.order_id = $1::uuid AND oi.seller_id = $2::uuid LIMIT 1`,
        [id, uid]
      );
    }
    if (!own.length) return res.status(404).json({ ok:false });

    await dbQuery(`UPDATE orders SET shipment_status = $1, updated_at = now() WHERE id = $2::uuid`, [next, id]);
    return res.json({ ok:true });
  } catch (e) { next(e); }
});

// 一括更新（任意）
app.post('/seller/trades/bulk', requireAuth, requireRole(['seller', 'admin']), async (req, res, next) => {
  try {
    const uid = req.session.user.id;
    const currentRoles = req.session.user.roles;
    const ids = []
      .concat(req.body.ids || [])
      .map(String).map(s => s.trim())
      .filter(isUuid);

    const action = String(req.body.action || '');

    const map = {
      ship_prep:  'confirmed',   // 例：出荷準備中は confirmed として扱う
      in_transit: 'shipped',
      delivered:  'shipped',     // ※ 別カラムがある場合は要調整
      returned:   'cancelled'    // ※ 簡易対応
    };
    const nextStatus = map[action];
    if (!ids.length || !nextStatus) return res.redirect('/seller/trades');

    // この出品者の行に限定して更新
    if (currentRoles.includes('admin')) {
      await dbQuery(
        `
        UPDATE orders o
          SET status = $1, updated_at = now()
        WHERE o.id = ANY($2::uuid[])
          AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)
        `,
        [nextStatus, ids]
      );
    } else {
      await dbQuery(
        `
        UPDATE orders o
          SET status = $1, updated_at = now()
        WHERE o.id = ANY($2::uuid[])
          AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.seller_id = $3)
        `,
        [nextStatus, ids, uid]
      );
    }

    return res.redirect('/seller/trades');
  } catch (e) { next(e); }
});

// 売上ダッシュボード詳細
app.get('/seller/analytics', requireAuth, requireRole(['seller', 'admin']), async (req, res, next) => {
  try {
    const uid = req.session.user.id;
    const currentRoles = req.session.user.roles;
    const { g, dateFrom, dateTo, week, ym, year } = parseRangeFromQuery(req.query);
    const q        = req.query.q || '';
    const category = req.query.category || '';
    const payment  = req.query.payment || '';
    const owner  = req.query.owner || '';

    const [categories, paymentMethods] = await Promise.all([
      dbQuery(`SELECT id, name FROM categories ORDER BY sort_order NULLS LAST, name ASC`),
      dbQuery(`SELECT value, label_ja FROM option_labels WHERE category='payment_method' AND active=true ORDER BY sort ASC, label_ja ASC`)
    ]);

    const analyticsData = await getAnalyticsBucketsV2(dbQuery, uid, owner, {
      g, q, categoryId: category, paymentMethod: payment,
      dateFrom, dateTo, week, ym, year
    });

    const summary = analyticsData.reduce((acc, b) => {
      acc.revenue += (b.revenue || 0);
      acc.orders  = Number(acc.orders) + (Number(b.orders) || 0);
      return acc;
    }, { revenue: 0, orders: 0 });

    res.render('seller/analytics', {
      title: '売上ダッシュボード詳細',
      // フィルタ表示用
      q, category, payment, owner,
      // 新パラメータ
      granularity: g, dateFrom, dateTo, week, ym, year,
      // 旧UI互換のために period も残す（不要なら削除OK）
      period: (g === 'day' ? 'week' : g), // 表示文言で使っていれば合わせる
      categories, paymentMethods,
      analyticsData, summary, currentRoles
    });
  } catch (e) { next(e); }
});

const FREE_SHIP_THRESHOLD = 5000; // 任意: 送料無料ライン（円）
const FLAT_SHIPPING = 300;        // 任意: 送料（合計がしきい値未満のとき）

/** セッションにカート初期化 */
function ensureCart(req) {
  if (!req.session.cart) req.session.cart = { items: [], coupon: null };
  if (!Array.isArray(req.session.cart.items)) req.session.cart.items = [];
  return req.session.cart;
}

/** 数値ガード */
function toInt(n, def = 0) {
  const v = parseInt(n, 10);
  return Number.isFinite(v) ? v : def;
}

// セッション + DB のカートを読み込み、{ productId, quantity, sellerId, sellerPartnerId } に正規化
async function loadCartItems(req) {
  let dbItems = [];

  if (req.session?.user?.id) {
    const uid = req.session.user.id;
    const cart = await getOrCreateUserCart(uid);
    const rows = await dbQuery(
      `SELECT
         ci.product_id      AS product_id,
         ci.quantity        AS quantity,
         p.seller_id        AS seller_id,
         u.partner_id       AS seller_partner_id
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       LEFT JOIN users u ON u.id = p.seller_id
       WHERE ci.cart_id = $1 AND ci.saved_for_later = false
       ORDER BY ci.created_at ASC`,
      [cart.id]
    );

    // ここは素直にそのまま
    dbItems = rows.map(r => ({
      productId: String(r.product_id || '').trim(),
      quantity: Math.max(1, parseInt(r.quantity, 10) || 1),
      sellerId: r.seller_id ? String(r.seller_id) : null,
      sellerPartnerId: r.seller_partner_id ? String(r.seller_partner_id) : null,
    }));
  } else {
    // 未ログイン時はセッションの cart.items 由来
    dbItems = (req.session?.cart?.items || []).map(it => ({
      productId: String(it.productId || it.product_id || '').trim(),
      quantity: Math.max(1, parseInt(it.quantity, 10) || 1),
      sellerId: it.seller_id ? String(it.seller_id) : null,
      sellerPartnerId: it.seller_partner_id ? String(it.seller_partner_id) : null,
    }));
  }

  // マージ（同じ productId は quantity を足し合わせ、seller 情報も保持）
  const map = new Map(); // key: productId, value: { quantity, sellerId, sellerPartnerId }
  for (const src of dbItems) {
    if (!isUuid(src.productId)) continue;
    const prev = map.get(src.productId);
    if (!prev) {
      map.set(src.productId, {
        quantity: src.quantity,
        sellerId: src.sellerId ?? null,
        sellerPartnerId: src.sellerPartnerId ?? null,
      });
    } else {
      prev.quantity += src.quantity;
      // 既にある方を優先。空なら埋める
      if (!prev.sellerId && src.sellerId) prev.sellerId = src.sellerId;
      if (!prev.sellerPartnerId && src.sellerPartnerId) prev.sellerPartnerId = src.sellerPartnerId;
    }
  }

  // 正規化配列に戻す
  return [...map.entries()].map(([productId, v]) => ({
    productId,
    quantity: v.quantity,
    sellerId: v.sellerId,
    sellerPartnerId: v.sellerPartnerId,
    coupon: req.session?.cart?.coupon || null
  }));
}

/** DB からカート内の商品詳細を取得して表示用に整形 */
async function fetchCartItemsWithDetails(items) {
  // items: [{ productId, quantity }]
  const ids = (items || [])
    .map(x => String(x.productId || '').trim())
    .filter(isUuid);

  if (!ids.length) return [];

  // 重複排除＆順序維持
  const seen = new Set();
  const uniqIds = ids.filter(id => (seen.has(id) ? false : (seen.add(id), true)));

  const ph = uniqIds.map((_, i) => `$${i + 1}`).join(',');
  const rows = await dbQuery(
    `
    SELECT
      p.id, p.slug, p.title, p.price, p.unit, p.stock,
      p.is_organic, p.is_seasonal, p.seller_id,
      (SELECT url FROM product_images i
         WHERE i.product_id = p.id
         ORDER BY position ASC
         LIMIT 1) AS image_url,
      s.name AS seller_name,
      s.partner_id,
      partner.name AS seller_partner_name,
      partner.id AS seller_partner_id
    FROM products p
    LEFT JOIN users s ON s.id = p.seller_id
    LEFT JOIN partners partner ON partner.Id = s.partner_id
    WHERE p.id IN (${ph})
    `,
    uniqIds
  );

  const qtyMap = new Map(items.map(i => [i.productId, Math.max(1, parseInt(i.quantity, 10) || 1)]));

  // カートの順序で並べる
  return uniqIds
    .map(id => rows.find(r => r.id === id))
    .filter(Boolean)
    .map(r => ({
      ...r,
      quantity: qtyMap.get(r.id) || 1
    }));
}

const {
  getRulesForSeller,
  saveRulesForSeller
} = require('./services/shippingRulesService');

function selectShippingRuleForAddress(rules, addr) {
  if (!addr) return null;
  const prefecture = (addr.prefecture || '').trim();
  const city = (addr.city || '').trim();
  if (!prefecture) return null;

  const cityRule = rules.find(
    r => r.scope === 'city' &&
         r.prefecture === prefecture &&
         r.city === city
  );
  if (cityRule) return cityRule;

  const prefRule = rules.find(
    r => r.scope === 'prefecture' &&
         r.prefecture === prefecture
  );
  if (prefRule) return prefRule;

  const allRule = rules.find(r => r.scope === 'all');
  return allRule || null;
}

function shippingFromRule(rule) {
  if (!rule) {
    return { ok: false, reason: 'NO_RULE', shipping: null };
  }
  if (rule.can_ship === false) {
    return { ok: false, reason: 'CANNOT_SHIP', shipping: null };
  }
  let fee = rule.shipping_fee;
  if (fee == null) fee = 0;
  return { ok: true, reason: 'OK', shipping: fee };
}

async function resolveShippingForSellerAndAddress({ sellerId, userId, shippingAddressId }) {
  if (!shippingAddressId) {
    return { ok: false, reason: 'NO_ADDRESS', shipping: null, rule: null };
  }

  const [addrRows, rules] = await Promise.all([
    dbQuery(
      `SELECT id, prefecture, city
         FROM addresses
        WHERE id=$1::uuid
          AND user_id=$2
          AND scope='user'
        LIMIT 1`,
      [shippingAddressId, userId]
    ),
    getRulesForSeller(sellerId)
  ]);

  if (!addrRows.length) {
    return { ok: false, reason: 'ADDR_NOT_FOUND', shipping: null, rule: null };
  }

  const addr = addrRows[0];
  const rule = selectShippingRuleForAddress(rules, addr);
  const base = shippingFromRule(rule);
  return { ...base, rule, addr };
}

/**
 * フロントに返すための totals + shippingError をまとめて作る共通ヘルパ
 */
async function buildTotalsForFrontend(req, { shipMethod, sellerId, shippingAddressId }) {
  const cart = await loadCartItems(req);
  const selectedIds = getSelectedIdsBySeller(req, sellerId);
  const pairs = filterPairsBySelectedAndSeller(cart, selectedIds, sellerId);
  const items = await fetchCartItemsWithDetails(pairs || []);
  const userId = req.session?.user?.id || null;
  const _shipMethod = shipMethod || 'delivery';

  let shippingOverride = null;
  let shippingError = null;

  if (_shipMethod === 'delivery') {
    const shipRes = await resolveShippingForSellerAndAddress({
      sellerId,
      userId,
      shippingAddressId
    });

    if (!shipRes.ok) {
      if (shipRes.reason === 'CANNOT_SHIP') {
        shippingError = '選択された住所はこの出品者の配送対象外エリアです。畑で受け取り、または別の住所をご選択ください。';
      } else if (shipRes.reason === 'NO_RULE') {
        shippingError = 'この出品者の配送設定が見つかりません。畑受け取りを選ぶか、別の住所をご指定ください。';
      } else {
        shippingError = '配送先住所が不正です。別の住所を選択してください。';
      }
    } else {
      shippingOverride = shipRes.shipping;
    }
  }

  const coupon = cart.coupon || req.session.cart?.coupon || null;
  let totals = calcTotals(items, coupon, { shipMethod: _shipMethod, shippingOverride });

  // クーポンの最大割引を考慮（apply-coupon と揃える）
  if (coupon?.maxDiscount && totals.discount > coupon.maxDiscount) {
    const diff = totals.discount - coupon.maxDiscount;
    totals.discount = coupon.maxDiscount;
    totals.total = Math.max(0, totals.total + diff);
  }

  return { totals, shippingError };
}

/**
 * seller_shipping_rules + 住所 から、適用すべきルールを 1 件選ぶ
 * 優先度: city > prefecture > all
 */
function selectShippingRuleForAddress(rules, addr) {
  if (!addr) return null;
  const prefecture = (addr.prefecture || '').trim();
  const city = (addr.city || '').trim();
  if (!prefecture) return null;

  const cityRule = rules.find(
    r => r.scope === 'city' &&
         r.prefecture === prefecture &&
         r.city === city
  );
  if (cityRule) return cityRule;

  const prefRule = rules.find(
    r => r.scope === 'prefecture' &&
         r.prefecture === prefecture
  );
  if (prefRule) return prefRule;

  const allRule = rules.find(r => r.scope === 'all');
  return allRule || null;
}

/**
 * ルール1件から送料計算（配送可否も含め判定）
 */
function shippingFromRule(rule) {
  if (!rule) {
    return { ok: false, reason: 'NO_RULE', shipping: null };
  }
  if (rule.can_ship === false) {
    return { ok: false, reason: 'CANNOT_SHIP', shipping: null };
  }
  let fee = rule.shipping_fee;
  if (fee == null) fee = 0; // 設定なし = 0円とみなす
  return { ok: true, reason: 'OK', shipping: fee };
}

/**
 * sellerId + ユーザー + 住所ID から、送料を解決する（DBアクセス込）
 */
async function resolveShippingForSellerAndAddress({ sellerId, userId, shippingAddressId }) {
  if (!shippingAddressId) {
    return { ok: false, reason: 'NO_ADDRESS', shipping: null, rule: null };
  }

  const [addrRows, rules] = await Promise.all([
    dbQuery(
      `SELECT id, prefecture, city
         FROM addresses
        WHERE id=$1::uuid
          AND user_id=$2
        LIMIT 1`,
      [shippingAddressId, userId]
    ),
    getRulesForSeller(sellerId)
  ]);

  if (!addrRows.length) {
    return { ok: false, reason: 'ADDR_NOT_FOUND', shipping: null, rule: null };
  }

  const addr = addrRows[0];
  const rule = selectShippingRuleForAddress(rules, addr);
  const base = shippingFromRule(rule);
  return { ...base, rule, addr };
}

/** 合計計算（割引・送料を含めたサマリー） */
function calcTotals(items, coupon, opts = {}) {
  const { shipMethod = 'delivery', shippingOverride = null } = opts || {};
  console.log(coupon);
  const subtotal = items.reduce(
    (acc, it) => acc + (toInt(it.price, 0) * toInt(it.quantity, 1)),
    0
  );

  // クーポン（percent/amount）。不正値は0扱い & 割引は小計を超えない
  let discount = 0;
  if (coupon && coupon.code) {
    const val = Number(coupon.value);
    if (coupon.type === 'percent') {
      const pct = isFinite(val) ? Math.max(0, Math.min(100, val)) : 0;
      discount = Math.floor(subtotal * (pct / 100));
    } else if (coupon.type === 'amount') {
      const amt = isFinite(val) ? Math.max(0, Math.floor(val)) : 0;
      discount = Math.min(subtotal, amt);
    }
  }
  discount = Math.min(discount, subtotal);

  // 送料：pickup は常に0 / deliveryは従来式
  let shipping;
  if (shippingOverride !== null && isFinite(Number(shippingOverride))) {
    shipping = Math.max(0, toInt(shippingOverride, 0));
  } else if (shipMethod === 'pickup') {
    shipping = 0;
  } else {
    shipping = (subtotal === 0 || subtotal >= FREE_SHIP_THRESHOLD) ? 0 : FLAT_SHIPPING;
  }

  const totalBeforeShip = Math.max(0, subtotal - discount);
  const total = totalBeforeShip + shipping;

  // 送料無料までの残額（pickup時は常に0）
  const freeShipRemain = (shipMethod === 'pickup' || shippingOverride !== null)
    ? 0
    : Math.max(0, FREE_SHIP_THRESHOLD - subtotal);

  return {
    subtotal,
    discount,
    shipping,
    total,
    freeShipRemain,
    shipMethod
  };
}

/** 選択済みの商品IDの取得（無ければ null） */
function getSelectedIds(req){
  const sel = req.session?.cart?.selection;
  if (!Array.isArray(sel) || !sel.length) return null;
  return sel.filter(isUuid);
}

/** loadCartItems(req) の結果 [{productId,quantity}] を、選択済みIDに絞り込む */
function filterPairsBySelection(pairs, selectedIds){
  if (!selectedIds || !selectedIds.length) return pairs;
  const set = new Set(selectedIds);
  return (pairs || []).filter(p => set.has(p.productId));
}

/** アイテム詳細を選択済みだけで取得 */
async function loadSelectedItemsWithDetails(req){
  const pairs = await loadCartItems(req); // [{productId, quantity}]（DB+セッションマージ）
  const selectedIds = getSelectedIds(req);
  const filtered = filterPairsBySelection(pairs, selectedIds);
  return fetchCartItemsWithDetails(filtered);
}

/** 住所の単票取得（ユーザー本人の user/scope 限定） */
async function findUserAddress(uid, addrId){
  if (!uid || !isUuid(addrId)) return null;
  const rows = await dbQuery(
    `SELECT *
       FROM addresses
      WHERE id = $1::uuid AND user_id = $2::uuid AND scope = 'user'`,
    [addrId, uid]
  );
  return rows[0] || null;
}

/** 注文番号の簡易生成（必要に応じて別方式に） */
function genOrderNo(){
  const d = new Date();
  const ymd = d.toISOString().slice(0,10).replace(/-/g,''); // yyyymmdd
  const rand = Math.random().toString(36).slice(2,8).toUpperCase();
  return `ORD-${ymd}-${rand}`;
}

/* ----------------------------
 *  GET /cart  カート表示
 * -------------------------- */
app.get('/cart', async (req, res, next) => {
  try {
    const cartItems = await loadCartItems(req);
    const items = await fetchCartItemsWithDetails(cartItems);
    const totals = calcTotals(items, req.session?.cart?.coupon || null);

    const groupedBySeller = items.reduce((partner, item) => {
      const { seller_partner_id, seller_id } = item;

      const keyId = seller_partner_id || seller_id;
      
      if (!partner[keyId]) {
        partner[keyId] = [];
      }
      
      partner[keyId].push(item);
      return partner;
    }, {});

    const totalPerSeller = new Map();
    for (const partnerId in groupedBySeller) {
      const perItems = groupedBySeller[partnerId];
      const total = calcTotals(perItems, null);
      totalPerSeller.set(partnerId, total);
    }

    const errorsBySeller = (req.session.cart && req.session.cart.errorsBySeller) || {};

    res.render('cart/index', {
      title: 'カート',
      groupedBySeller,
      items,
      totals,
      req,
      errorsBySeller
    });
    if (req.session?.cart) req.session.cart.errorsBySeller = {};
  } catch (e) { next(e); }
});

/* ----------------------------
 *  POST /cart/add  カート追加
 *  body: { productId, quantity }
 * -------------------------- */
app.post('/cart/add', upload.none(), async (req, res, next) => {
  try {
    const body = req.body || {};
    const productId = String(body.productId || '').trim();
    const qtyNum = Math.max(1, toInt(body.quantity ?? body.qty, 1));

    if (!productId) {
      return res.status(400).json({ ok: false, message: 'productId が必要です。' });
    }

    // ─ 以下はこれまでのロジックをそのまま ─
    const rows = await dbQuery(`
      SELECT
        p.id, p.title AS name, p.price, p.unit, p.stock,
        (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY position ASC LIMIT 1) AS image
      FROM products p
      WHERE p.id = $1 AND p.status = 'public'
      LIMIT 1
    `, [productId]);

    const prod = rows[0];
    if (!prod) return res.status(404).json({ ok:false, message:'商品が見つかりません。' });
    if (prod.stock <= 0) return res.status(409).json({ ok:false, message:'在庫切れの商品です。' });

    const uid = req.session?.user?.id || null;
    if (uid) {
      await dbCartAdd(uid, prod.id, Math.min(qtyNum, prod.stock));
      const cartRow = await getOrCreateUserCart(uid);
      const cntRes = await dbQuery(`SELECT COALESCE(SUM(quantity),0)::int AS cnt FROM cart_items WHERE cart_id = $1 AND saved_for_later=false`, [cartRow.id]);
      return res.json({ ok:true, cartCount: cntRes[0]?.cnt || 0 });
    }

    const cart = ensureCart(req);
    const idx = cart.items.findIndex(i => i.productId === prod.id);
    if (idx >= 0) {
      cart.items[idx].quantity = Math.min(cart.items[idx].quantity + qtyNum, prod.stock);
    } else {
      cart.items.push({
        productId: prod.id,
        title:     prod.name,
        price:     prod.price,
        unit:      prod.unit,
        image:     prod.image,
        quantity:  Math.min(qtyNum, prod.stock),
      });
    }
    const cartCount = cart.items.length;
    return res.json({ ok:true, cartCount });
  } catch (e) {
    next(e);
  }
});

/* ----------------------------
 *  PATCH /cart/:id  数量変更
 *  body: { quantity }
 * -------------------------- */
app.patch('/cart/:id', async (req, res, next) => {
  try {
    const productId = req.params.id;
    let qty = Math.max(1, toInt(req.body?.quantity, 1));

    // 在庫クランプ
    const s = await dbQuery(`SELECT stock FROM products WHERE id = $1`, [productId]);
    const stock = toInt(s?.[0]?.stock, 0);
    if (stock > 0) qty = Math.min(qty, stock);

    const uid = authedUserId(req);
    if (uid) {
      await dbCartSetQty(uid, productId, qty);
      return res.status(204).end();
    }

    const cart = ensureCart(req);
    const row = cart.items.find(i => i.productId === productId);
    if (!row) return res.status(404).json({ ok: false, message: 'カートに見つかりません。' });
    row.quantity = qty;
    return res.status(204).end();
  } catch (e) { next(e); }
});

/* ----------------------------
 *  DELETE /cart/:id  行削除
 * -------------------------- */
app.delete('/cart/:id', async (req, res, next) => {
  try {
    const productId = req.params.id;
    const uid = authedUserId(req);
    if (uid) {
      await dbCartRemove(uid, productId);
      return res.status(204).end();
    }
    const cart = ensureCart(req);
    cart.items = cart.items.filter(i => i.productId !== productId);
    return res.status(204).end();
  } catch (e) { next(e); }
});

const {
  loadAvailabilityForSellerUser,
  loadPartnerAvailabilityByDate,
  loadAvailabilityForPartner,
  buildAvailabilitySummary,
  loadPartnerAvailabilityForPartner,
  loadPartnerWeeklyTimeSlots,
  getPartnerIdBySellerUserId
} = require('./services/partnerAvailability');

const DELIVERY_TIME_SLOTS = [
  { code: '9-11',  start: '09:00', end: '11:00' },
  { code: '11-13', start: '11:00', end: '13:00' },
  { code: '14-16', start: '14:00', end: '16:00' },
  { code: '16-18', start: '16:00', end: '18:00' },
  { code: '18-20', start: '18:00', end: '20:00' },
];

const PICKUP_TIME_SLOTS = [
  { code: '7-9',  start: '07:00', end: '09:00' },
  { code: '9-11',  start: '09:00', end: '11:00' },
  { code: '11-13', start: '11:00', end: '13:00' },
  { code: '14-16', start: '14:00', end: '16:00' },
  { code: '16-18', start: '16:00', end: '18:00' },
  { code: '18-20', start: '18:00', end: '20:00' },
];

function shipTimeLabel(code) {
  switch (code) {
    case '7-9':    return '7〜9時';
    case '9-11':   return '9〜11時';
    case '11-13':  return '11〜13時';
    case '14-16':  return '14〜16時';
    case '16-18':  return '16〜18時';
    case '18-20':  return '18〜20時';
    default:       return '';
  }
}

const TIME_SLOT_MASTER = {
  delivery: DELIVERY_TIME_SLOTS,
  pickup: PICKUP_TIME_SLOTS
};

async function getUserCartId(sessionUserId) {
  const rows = await dbQuery(
    `
    SELECT id FROM carts WHERE user_id = $1
    `,
    [sessionUserId]
  );

  if (!rows) return null;
  const cart = rows[0];
  return cart.id;
}

// POST /cart/selection  選択中のカート商品IDを一時保存（出品者別対応・後方互換）
app.post('/cart/selection', async (req, res) => {
  try {
    if (!req.session.user) {
      const nextUrl = encodeURIComponent(req.originalUrl || '/cart');
      return res.redirect(`/login?next=${nextUrl}`);
    }

    const rawIds = [].concat(req.body?.ids || []);
    const ids = rawIds.map(String).map(s => s.trim()).filter(isUuid);

    if (!ids.length) {
      return res.status(400).json({ ok: false, message: '選択された商品がありません。' });
    }
    if (ids.length > 200) {
      return res.status(400).json({ ok: false, message: '選択点数が多すぎます。' });
    }

    const sellerId = String(req.body?.sellerId || '').trim() || null;

    const cartId = await getUserCartId(req.session.user?.id);
    if (!cartId) return res.status(400).json({ ok: false, message: 'カートが見つかりません。' });

    const rows = await dbQuery(
      `
      SELECT ci.id AS cart_item_id, p.seller_id AS seller_id,
        u.partner_id AS user_partner_id, pa.id AS partner_id
        FROM cart_items ci
        JOIN products p ON p.id = ci.product_id
        LEFT JOIN users u ON u.id = p.seller_id
        LEFT JOIN partners pa ON pa.id = u.partner_id
       WHERE ci.cart_id = $1
         AND ci.product_id = ANY($2::uuid[])
      `,
      [cartId, ids]
    );

    if (rows.length !== ids.length) {
      return res.status(400).json({ ok:false, message:'選択商品に不正なIDが含まれています。' });
    }

    if (sellerId) {
      const bad = rows.find(r => (String(r.seller_id) !== String(sellerId) && String(r.partner_id) !== String(sellerId)));
      if (bad) {
        return res.status(400).json({ ok:false, message:'異なる出品者の商品が混在しています。' });
      }
    }

    // 保存
    if (!req.session.cart) req.session.cart = { items: [], coupon: null };

    if (sellerId) {
      if (!req.session.cart.selectionBySeller) req.session.cart.selectionBySeller = {};
      req.session.cart.selectionBySeller[sellerId] = ids;
    } else {
      // 従来互換：sellerId未指定の旧フロー
      req.session.cart.selection = ids;
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('save selection failed:', e);
    return res.status(500).json({ ok:false, message:'保存に失敗しました。' });
  }
});

/* =========================================================
 *  出品管理 一覧
 *  GET /seller/listings?q&status=all|public|private|draft&sort&page=
 * =======================================================*/
app.get('/seller/listings',
  requireAuth, requireRole(['seller', 'admin']),
  async (req, res, next) => {
    try {
      const sellerId = req.session.user.id;
      const currentRoles = req.session.user.roles;
      const previousUrl = req.headers.referer;
      const { q = '', status = 'all', sort = 'updated', owner = 'owner', page = 1 } = req.query;
      const pageNum  = Math.max(1, toInt(page, 1));
      const pageSize = 20;
      const offset   = (pageNum - 1) * pageSize;

      const u = await dbQuery(
        'SELECT id, partner_id from users where id = $1', [sellerId]
      );
      const partner_id = u[0].partner_id;

      // 並び順（ホワイトリスト化でSQLインジェクション対策）
      const allowedSorts = {
        'priceAsc': 'p.price ASC, p.updated_at DESC',
        'priceDesc': 'p.price DESC, p.updated_at DESC',
        'stockAsc': 'p.stock ASC, p.updated_at DESC',
        'updated': 'p.updated_at DESC NULLS LAST'
      };
      const orderBy = allowedSorts[sort] || 'p.updated_at DESC NULLS LAST';

      // WHEREの構築
      let where = [];
      let params = [];

      let setOwner;

      if ((previousUrl && !previousUrl.includes('admin') && !owner) || owner === 'owner_own' || (!previousUrl && owner !== 'owner_all')) {
        where.push('(p.seller_id = $1 OR partner_id = $2)');
        params.push(sellerId);
        params.push(partner_id);
        setOwner = 'owner_own';
      } else if (previousUrl && previousUrl.includes('admin') && !owner || owner === 'owner_all') {
        setOwner = 'owner_all';
      }

      if (q) {
        params.push(`%${q}%`);
        // 同じプレースホルダを2回使うのはOK
        const idx = params.length;
        where.push(`(p.title ILIKE $${idx} OR p.description_html ILIKE $${idx})`);
      }
      if (status && status !== 'all') {
        params.push(status);
        where.push(`p.status = $${params.length}`);
      }

      // ← ここがポイント：0件なら WHERE を付けない
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      // 件数
      // const cntRows = await dbQuery(
      //   `SELECT COUNT(*)::int AS cnt, u.partner_id AS partner_id FROM products p LEFT JOIN users u ON u.id = p.seller_id ${whereSql}`,
      //   params
      // );
      // const total = cntRows[0]?.cnt ?? 0;

      // 一覧
      const rows = await dbQuery(
        `
        SELECT
          p.id, p.slug, p.title, p.price, p.stock, p.status,
          p.is_organic, p.is_seasonal, p.updated_at, p.seller_id,
          (
            SELECT url
            FROM product_images i
            WHERE i.product_id = p.id
            ORDER BY position ASC
            LIMIT 1
          ) AS image_url,
          u.partner_id AS partner_id
        FROM products p
         LEFT JOIN users u ON u.id = p.seller_id
        ${whereSql}
        ORDER BY ${orderBy}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `,
        [...params, pageSize, offset]
      );

      const total = rows.length;

      const pagination = { page: pageNum, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
      const buildQuery = buildQueryPath('/seller/listings', { q, status, sort });

      res.render('seller/listings', {
        title: '出品管理',
        listings: rows,
        total, q, status, sort, setOwner,
        pagination, currentRoles,
        buildQuery
      });
    } catch (e) { next(e); }
  }
);

/* =========================================================
 * 一括操作
 * POST /seller/listings/bulk  (ids, bulkAction)
 * =======================================================*/
app.post('/seller/listings/bulk',
  requireAuth, requireRole(['seller']),
  async (req, res, next) => {
    try {
      const sellerId = req.session.user.id;
      const ids = parseUuidArray(req.body.ids);
      const action = String(req.body.bulkAction || '');

      if (!ids.length || !action) {
        if (wantsJSON(req)) return res.status(400).json({ ok:false, message:'対象がありません。' });
        return res.redirect('/seller/listings');
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        if (action === 'delete') {
          // 依存テーブルから消して最後に本体
          await client.query(
             `DELETE FROM product_images
                WHERE product_id = ANY($1::uuid[])
                  AND EXISTS (SELECT 1 FROM products p
                              WHERE p.id = product_images.product_id
                                AND p.seller_id = $2::uuid)`,
             [ids, sellerId]
           );
           await client.query(`DELETE FROM product_specs  WHERE product_id = ANY($1::uuid[])`, [ids]);
           await client.query(`DELETE FROM product_tags   WHERE product_id = ANY($1::uuid[])`, [ids]);
           await client.query(`DELETE FROM products WHERE id = ANY($1::uuid[]) AND seller_id = $2::uuid`, [ids, sellerId]);
        } else if (['publish','privatize','draft'].includes(action)) {
          const next = action === 'publish' ? 'public' : action === 'privatize' ? 'private' : 'draft';
          await client.query(
            `UPDATE products SET status = $1, updated_at = now()
               WHERE seller_id = $2::uuid AND id = ANY($3::uuid[])`,
            [next, sellerId, ids]
          );
        }

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      if (wantsJSON(req)) return res.json({ ok:true });
      res.redirect('back');
    } catch (e) { next(e); }
  }
);

/* =========================================================
 * 公開状態の即時切替（Fetch想定）
 * POST /seller/listings/:id/status {status}
 * =======================================================*/
app.post('/seller/listings/:id/status',
  requireAuth, requireRole(['seller']),
  async (req, res, next) => {
    try {
      const sellerId = req.session.user.id;
      const id = String(req.params.id || '').trim();
      if (!isUuid(id)) return res.status(400).json({ ok:false, message:'不正なIDです。' });
      const next = String(req.body.status || '');
      if (!['public','private','draft'].includes(next)) {
        return res.status(400).json({ ok:false, message:'パラメータが不正です。' });
      }
      const rows = await dbQuery(
        `UPDATE products SET status = $1, updated_at = now()
           WHERE id = $2::uuid AND seller_id = $3::uuid
           RETURNING id`,
        [next, id, sellerId]
      );
      if (!rows.length) return res.status(404).json({ ok:false, message:'見つかりません。' });
      res.json({ ok:true });
    } catch (e) { next(e); }
  }
);

/* =========================================================
 * 削除
 * POST /seller/listings/:id/delete
 * =======================================================*/
app.post('/seller/listings/:id/delete',
  requireAuth, requireRole(['seller']),
  async (req, res, next) => {
    try {
      const sellerId = req.session.user.id;
      const id = String(req.params.id || '').trim();
      if (!isUuid(id)) return res.status(400).json({ ok:false, message:'不正なIDです。' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // 所有者チェック
        const own = await client.query(`SELECT 1 FROM products WHERE id = $1::uuid AND seller_id = $2::uuid`, [id, sellerId]);
        if (!own.rowCount) {
          await client.query('ROLLBACK');
          return res.status(404).json({ ok:false });
        }

        await client.query(`DELETE FROM product_images WHERE product_id = $1::uuid`, [id]);
        await client.query(`DELETE FROM product_specs  WHERE product_id = $1::uuid`, [id]);
        await client.query(`DELETE FROM product_tags   WHERE product_id = $1::uuid`, [id]);
        await client.query(`DELETE FROM products WHERE id = $1::uuid AND seller_id = $2::uuid`, [id, sellerId]);

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK'); throw e;
      } finally { client.release(); }

      if (wantsJSON(req)) return res.json({ ok:true });
      return res.redirect(`/seller/listings`);
    } catch (e) { next(e); }
  }
);

function getSelectedIdsBySeller(req, sellerId){
  const sel = req.session?.cart?.selectionBySeller || {};
  return new Set(sel[sellerId] || []);
}

function filterPairsBySelectedAndSeller(pairs, selectedIdsSet, sellerId){
  return pairs.filter(p => selectedIdsSet.has(p.productId) && (String(p.sellerId) === String(sellerId) || String(p.sellerPartnerId) === String(sellerId)));
}

async function fetchSellerConfig(sellerUserId) {
  // 支払い方法マスタ（option_labels ベース）
  const allMethod = await loadAllPaymentMethods('payment_method', 'payment_method');
  const allMap = new Map(allMethod.map(m => [m.value || m.code, m]));

  // ★ 修正: sellerUserIdからpartner_idを取得
  const userRows = await dbQuery(
    `SELECT partner_id FROM users WHERE id = $1::uuid LIMIT 1`,
    [sellerUserId]
  );
  const partnerId = userRows.length ? userRows[0].partner_id : sellerUserId;

  let allowedCodes = [];
  if (partnerId) {
    // ★ 修正: パートナーの許可された決済方法を取得
    allowedCodes = await getAllowedMethodsForPartner(partnerId);
  }

  // ★ 修正: デフォルト値を設定しない（決済方法が未設定の場合は空配列）
  // これにより、決済方法が1つも許可されていない場合は空配列が返される

  // codとcardのみフィルタリング
  const filteredCodes = allowedCodes.filter(code => ['cod', 'card'].includes(code));

  // 日本語ラベル付きで整形
  const allowedPaymentMethods = filteredCodes.map(code => {
    const meta = allMap.get(code);
    return {
      code,
      label_ja: meta?.label_ja || jaLabel('payment_method', code) || code,
      label_en: meta?.label_en || code,
      synced_from_partner: true
    };
  });

  // ★ 配送方法も同じ思想でDBから取得
  const allShipMethod = await loadAllShipMethods('ship_method', 'ship_method');
  const allShipMap = new Map(allShipMethod.map(m => [m.value || m.code, m]));

  let allowedShipCodes = [];
  if (partnerId) {
    allowedShipCodes = await getAllowedShipMethodsForPartner(partnerId);
  }

  // 日本語ラベル付きで整形
  const allowedShipMethods = allowedShipCodes.map(code => {
    const meta = allShipMap.get(code);
    return {
      code,
      label_ja: meta?.label_ja || jaLabel('ship_method', code) || code,
      label_en: meta?.label_en || code
    };
  });

  return {
    // UI 側は .map(m => m.code) で value、 .map(m => m.label_ja) で表示が使える
    allowedPaymentMethods,
    allowedShipMethods,
    partnerId // ★ 追加: チェックアウトページで使用するため
  };
}

/** DBからクーポンを1件取得（大/小文字無視・期間/有効フラグもチェック） */
async function findCouponByCode(code) {
  if (!code) return null;
  const rows = await dbQuery(
    `SELECT *
       FROM coupons
      WHERE is_active = true
        AND lower(code) = lower($1)
        AND (starts_at IS NULL OR starts_at <= now())
        AND (ends_at   IS NULL OR ends_at   >= now())
      LIMIT 1`,
    [code]
  );
  return rows[0] || null;
}

/** このユーザー/小計/受け取り方法でクーポンが使えるか検証（本番想定の雛形） */
async function validateCouponForUser(coupon, { userId, subtotal, shipMethod }) {
  if (!coupon) return { ok: false, reason: 'NOT_FOUND' };

  // 最低購入金額
  if ((coupon.min_subtotal|0) > 0 && (subtotal|0) < (coupon.min_subtotal|0)) {
    return { ok: false, reason: 'MIN_SUBTOTAL', data: { min: coupon.min_subtotal } };
  }

  // metadata で shipMethod 条件（例: {"only_shipMethod":"delivery"}）
  if (coupon.metadata && coupon.metadata.only_shipMethod) {
    const only = String(coupon.metadata.only_shipMethod).trim();
    if (only && only !== String(shipMethod||'delivery')) {
      return { ok: false, reason: 'SHIP_METHOD' };
    }
  }

  // 利用回数制限（要件に応じて「orders」等の実テーブルで最終確定時にも検証）
  if (Number.isFinite(coupon.global_limit)) {
    const g = await dbQuery(`SELECT COUNT(*)::int AS c FROM orders WHERE coupon_code = $1 and status != 'canceled'`, [coupon.code]);
    if ((g[0]?.c|0) >= (coupon.global_limit|0)) {
      return { ok: false, reason: 'GLOBAL_LIMIT' };
    }
  }
  if (Number.isFinite(coupon.per_user_limit) && userId) {
    const u = await dbQuery(
      `SELECT COUNT(*)::int AS c FROM orders WHERE coupon_code = $1 AND buyer_id = $2 and status != 'canceled'`,
      [coupon.code, userId]
    );
    if ((u[0]?.c|0) >= (coupon.per_user_limit|0)) {
      return { ok: false, reason: 'PER_USER_LIMIT' };
    }
  }

  return { ok: true };
}

app.post('/checkout/recalc-totals', async (req, res, next) => {
  try {
    if (!req.session?.user) {
      return res.status(401).json({ ok: false, message: 'ログインが必要です。' });
    }

    const { shipMethod, sellerId, shippingAddressId } = req.body || {};
    if (!sellerId) {
      return res.status(400).json({ ok: false, message: 'sellerId が指定されていません。' });
    }

    const { totals, shippingError } = await buildTotalsForFrontend(req, {
      shipMethod,
      sellerId,
      shippingAddressId
    });

    return res.json({ ok: true, totals, shippingError });
  } catch (e) {
    next(e);
  }
});

/* ----------------------------
 *  GET /checkout  注文情報入力ページ
 * -------------------------- */
app.get('/checkout', async (req, res, next) => {
  try {
    if (!req.session.user) {
      const nextUrl = encodeURIComponent(req.originalUrl || '/checkout');
      return res.redirect(`/login?next=${nextUrl}`);
    }

    // ✅ どの出品者グループか明示
    const sellerId = (req.query.seller || '').trim();
    if (!sellerId) {
      // セッションに1つでも選択があれば、最初の出品者にフォールバック
      const map = req.session?.cart?.selectionBySeller || {};
      const firstSeller = Object.keys(map)[0];
      if (firstSeller) return res.redirect(`/checkout?seller=${encodeURIComponent(firstSeller)}`);
      // なければカートへ
      req.session.flash = { type:'error', message:'購入対象の出品者が選択されていません。' };
      return res.redirect('/cart');
    }

    // カート全体（{ productId, quantity, sellerPartnerId, ... } 想定）
    const allPairs = await loadCartItems(req);

    // ✅ 出品者ごとの選択IDで絞り込み
    const selectedIds = getSelectedIdsBySeller(req, sellerId);
    const pairs = filterPairsBySelectedAndSeller(allPairs, selectedIds, sellerId);

    if (!pairs.length) {
      req.session.flash = { type:'error', message:'購入対象の商品が選択されていません。' };
      return res.redirect('/cart');
    }

    const items = await fetchCartItemsWithDetails(pairs); // ← ここで seller/商品詳細が付与される前提
    if (!items.length) {
      req.session.flash = { type:'error', message:'購入対象の商品が見つかりません。' };
      return res.redirect('/cart');
    }

    // ✅ 念のため全アイテムが同一 sellerId か検証
    const bad = items.find(it => String(it.sellerId) === String(sellerId) || String(it.sellerPartnerId) === String(sellerId));
    if (bad){
      req.session.flash = { type:'error', message:'異なる出品者の商品が混在しています。もう一度選択してください。' };
      return res.redirect('/cart');
    }

    // ✅ 在庫検証：在庫0 or 在庫 < 注文数 が1つでもあれば /cart に差し戻し
    const shortages = items.filter(it => ((it.stock|0) <= 0) || ((it.stock|0) < ((it.quantity|0) || 1)));
    if (shortages.length) {
      const msg = `在庫不足のため購入手続きに進めません：${
        shortages.map(it => `${it.title}（在庫:${it.stock} / 注文:${it.quantity || 1}）`).join('、')
      }。数量を調整してください。`;
      req.session.cart = req.session.cart || {};
      req.session.cart.errorsBySeller = req.session.cart.errorsBySeller || {};
      req.session.cart.errorsBySeller[sellerId] = msg;
      // 出品者ブロックにスクロールしやすいようハッシュ付きで戻す（任意）
      return res.redirect(`/cart#seller-${encodeURIComponent(sellerId)}`);
    }

    const partnerId = items[0].seller_partner_id;
    // 出品者の許可決済手段（例：DBから）
    const sellerConfig = await fetchSellerConfig(sellerId);

    // ★ 追加: 決済方法が1つも許可されていない場合はエラー
    if (!sellerConfig.allowedPaymentMethods || sellerConfig.allowedPaymentMethods.length === 0) {
      req.session.cart = req.session.cart || {};
      req.session.cart.errorsBySeller = req.session.cart.errorsBySeller || {};
      req.session.cart.errorsBySeller[sellerId] = 'この出品者は現在ご利用可能な決済方法がありません。出品者にお問い合わせください。';
      // 出品者ブロックにスクロールしやすいようハッシュ付きで戻す（任意）
      return res.redirect(`/cart#seller-${encodeURIComponent(sellerId)}`);
    }

    // ★ 追加: 配送方法が1つも許可されていない場合はエラー
    if (!sellerConfig.allowedShipMethods || sellerConfig.allowedShipMethods.length === 0) {
      req.session.cart = req.session.cart || {};
      req.session.cart.errorsBySeller = req.session.cart.errorsBySeller || {};
      req.session.cart.errorsBySeller[sellerId] = 'この出品者は現在ご利用可能な配送方法がありません。出品者にお問い合わせください。';
      return res.redirect(`/cart#seller-${encodeURIComponent(sellerId)}`);
    }

    const today = new Date();
    const fromDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1); // 明日
    const toDate   = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + 30); // 30日後まで
    // ✅ sellerId は partner.id とみなして、そのまま partnerId として利用
    const shipAvailability = await loadAvailabilityForPartner(partnerId, {
      from: fromDate,
      to: toDate,
    });

    const shipTimeSlots = await loadPartnerWeeklyTimeSlots(partnerId);

    // 住所など既存処理
    const uid = req.session.user.id;
    const addresses = await dbQuery(
      `SELECT * FROM addresses WHERE user_id=$1 AND scope='user' ORDER BY is_default DESC, created_at DESC`,
      [uid]
    );
    const defaultAddr = addresses.find(a => a.is_default) || addresses[0] || null;
    const draft = req.session.checkoutDraftBySeller?.[sellerId] || {};
    const isInitial = !req.session.checkoutDraftBySeller || !req.session.checkoutDraftBySeller[sellerId];

    // 決済方法の検証: draft.paymentMethodが許可された決済方法に含まれているかチェック
    const allowedPaymentCodes = (sellerConfig.allowedPaymentMethods || []).map(m => m.code);
    let paymentMethod = 'cod';
    if (draft.paymentMethod && allowedPaymentCodes.includes(draft.paymentMethod)) {
      // ドラフトの決済方法が許可されている場合、それを使用
      paymentMethod = draft.paymentMethod;
    } else if (sellerConfig.allowedPaymentMethods && sellerConfig.allowedPaymentMethods.length > 0) {
      // ドラフトがない、または許可されていない場合、最初の許可された決済方法にフォールバック
      paymentMethod = sellerConfig.allowedPaymentMethods[0].code || 'cod';
    }

    // 配送方法の検証: draft.shipMethodが許可された配送方法に含まれているかチェック
    const allowedShipCodes = (sellerConfig.allowedShipMethods || []).map(m => m.code);
    let shipMethod = 'delivery';
    if (draft.shipMethod && allowedShipCodes.includes(draft.shipMethod)) {
      // ドラフトの配送方法が許可されている場合、それを使用
      shipMethod = draft.shipMethod;
    } else if (sellerConfig.allowedShipMethods && sellerConfig.allowedShipMethods.length > 0) {
      // ドラフトがない、または許可されていない場合、最初の許可された配送方法にフォールバック
      shipMethod = sellerConfig.allowedShipMethods[0].code || 'delivery';
    }

    const form = {
      shippingAddressId: draft.shippingAddressId || defaultAddr?.id || null,
      billSame: !!draft.billSame,
      billingAddressId: draft.billSame ? null : (draft.billingAddressId || null),
      shipMethod: shipMethod,
      shipDate:   draft.shipDate   || '',
      shipTime:   draft.shipTime   || '',
      paymentMethod: paymentMethod,
      orderNote: draft.orderNote || ''
    };

    let shippingOverride = null;
    if (form.shipMethod === 'delivery' && form.shippingAddressId) {
      // 既に addresses を取っているので追加クエリ無しでOK
      const addr = addresses.find(a => String(a.id) === String(form.shippingAddressId));
      if (addr) {
        const rules = await getRulesForSeller(sellerId);
        const rule = selectShippingRuleForAddress(rules, addr);
        const s = shippingFromRule(rule);
        if (s.ok) {
          shippingOverride = s.shipping;
        } else if (rule && s.reason === 'CANNOT_SHIP') {
          // 配送不可エリアなら警告だけ出しておく（POST 側でブロックする）
          req.session.flash = {
            type: 'error',
            message: '選択された配送先はこの出品者の配送対象外エリアです。別の住所を選ぶか「畑で受け取り」を選択してください。'
          };
        }
      }
    }

    // 合計系はグループ内で計算
    const totals = calcTotals(
      items,
      req.session?.cart?.coupon || null,
      { shipMethod: form.shipMethod, shippingOverride }
    );

    // フラッシュメッセージを取得してセッションからクリア
    const flash = req.session.flash || null;
    req.session.flash = null;

    res.render('checkout/index', {
      title: 'ご注文手続き',
      items,
      totals,
      addresses,
      selectedShippingId: form.shippingAddressId,
      selectedBillingId: form.billingAddressId,
      coupon: req.session?.cart?.coupon || null,
      form,
      isInitial,
      sellerId,                       // ← ビューへ渡す
      allowedPayments: sellerConfig.allowedPaymentMethods,
      allowedShipMethods: sellerConfig.allowedShipMethods,
      shipAvailability: shipAvailability || { delivery: [], pickup: [] },
      shipTimeSlots: shipTimeSlots || { delivery: {}, pickup: {} },
      flash,
      req
    });
  } catch (e) { next(e); }
});

/* ----------------------------
 *  POST /checkout  入力値をセッションの注文ドラフトに保存 → 確認へ
 * -------------------------- */
app.post('/checkout', async (req, res, next) => {
  try {
    if (!req.session.user) {
      const nextUrl = encodeURIComponent('/checkout' + (req.query.seller ? `?seller=${encodeURIComponent(req.query.seller)}` : ''));
      return res.redirect(`/login?next=${nextUrl}`);
    }

    // ✅ sellerId を必ず受け取る（hidden等でフォームに埋め込む）
    const sellerId = (req.body.sellerId || req.query.seller || '').trim();
    if (!sellerId) {
      req.session.flash = { type:'error', message:'出品者が特定できません。もう一度やり直してください。' };
      return res.redirect('/cart');
    }

    const {
      shippingAddressId, billSame, billingAddressId,
      shipMethod, shipDate, shipTime, paymentMethod, orderNote, agree
    } = req.body;

    // 出品者の許可設定
    const sellerConfig = await fetchSellerConfig(sellerId);
    const allowedPayments = sellerConfig.allowedPaymentMethods || [];
    const allowedPaymentCodes = allowedPayments.map(p => String(p.code || '').trim());
    const allowedShips = sellerConfig.allowedShipMethods || [];
    const allowedShipsCodes = allowedShips.map(s => String(s.code || s).trim());

    // バリデーション
    if (!agree) {
      req.session.flash = { type:'error', message:'利用規約に同意してください。' };
      return res.redirect(`/checkout?seller=${encodeURIComponent(sellerId)}`);
    }
    if (!allowedShipsCodes.length || !allowedShipsCodes.includes(String(shipMethod || ''))) {
      req.session.flash = { type:'error', message:'受け取り方法が無効です。' };
      return res.redirect(`/checkout?seller=${encodeURIComponent(sellerId)}`);
    }
    if (!allowedPaymentCodes.length || !allowedPaymentCodes.includes(String(paymentMethod || ''))) {
      req.session.flash = { type:'error', message:'この出品者では選択されたお支払い方法はご利用いただけません。' };
      return res.redirect(`/checkout?seller=${encodeURIComponent(sellerId)}`);
    }
    // 住所バリデーションは受け取り方法で分岐
    if (shipMethod === 'delivery') {
      // 配送：配送先必須
      if (!shippingAddressId) {
        req.session.flash = { type:'error', message:'配送先住所を選択してください。' };
        return res.redirect(`/checkout?seller=${encodeURIComponent(sellerId)}`);
      }
      // 請求先：同一でないなら必須
      if (!billSame && !billingAddressId) {
        req.session.flash = { type:'error', message:'請求先住所を選択してください。' };
        return res.redirect(`/checkout?seller=${encodeURIComponent(sellerId)}`);
      }
    } else if (shipMethod === 'pickup') {
      // 受け取り：配送先は不要、請求先は必須（※運用に合わせて変更可）
      if (!billingAddressId) {
        req.session.flash = { type:'error', message:'請求先住所を選択してください。' };
        return res.redirect(`/checkout?seller=${encodeURIComponent(sellerId)}`);
      }
    }

    // 住所の存在/所有者チェック
    const uid = req.session.user.id;
    if (shipMethod === 'delivery') {
      const shipAddrRows = await dbQuery(
        `SELECT id FROM addresses WHERE id=$1::uuid AND user_id=$2 AND scope='user' LIMIT 1`,
        [shippingAddressId, uid]
      );
      if (!shipAddrRows.length) {
        req.session.flash = { type:'error', message:'配送先住所が不正です。' };
        return res.redirect(`/checkout?seller=${encodeURIComponent(sellerId)}`);
      }
    }
    if (shipMethod === 'pickup' || !billSame) {
      const billAddrRows = await dbQuery(
        `SELECT id FROM addresses WHERE id=$1::uuid AND user_id=$2 AND scope='user' LIMIT 1`,
        [billingAddressId, uid]
      );
      if (!billAddrRows.length) {
        req.session.flash = { type:'error', message:'請求先住所が不正です。' };
        return res.redirect(`/checkout?seller=${encodeURIComponent(sellerId)}`);
      }
    }

    let shippingOverride = null;
    if (shipMethod === 'delivery') {
      const shipRes = await resolveShippingForSellerAndAddress({
        sellerId,
        userId: uid,
        shippingAddressId
      });

      if (!shipRes.ok) {
        let msg = '選択された住所はこの出品者の配送対象外エリアです。';
        if (shipRes.reason === 'NO_RULE') {
          msg = 'この出品者の配送設定が見つかりません。別の受け取り方法をお選びください。';
        } else if (shipRes.reason === 'CANNOT_SHIP') {
          msg = '選択された住所はこの出品者の配送不可エリアです。畑受け取りを選ぶか、別の住所をご指定ください。';
        }
        req.session.flash = { type:'error', message: msg };
        return res.redirect(`/checkout?seller=${encodeURIComponent(sellerId)}`);
      }

      shippingOverride = shipRes.shipping; // この値自体は draft には入れず、confirm でもう一度計算します
    }

    if (shipDate) {
      const today = new Date();
      const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      const shipDateObj = new Date(shipDate + 'T00:00:00');

      if (shipDateObj < tomorrow) {
        req.session.flash = { type:'error', message:'受け取り日／お届け日は翌日以降の日付を指定してください。' };
        return res.redirect(`/checkout?seller=${encodeURIComponent(sellerId)}`);
      }

      const avail = await loadPartnerAvailabilityByDate(sellerId, {
        from: tomorrow,
        to: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate() + 60) // 余裕をもって
      });
      const arr = shipMethod === 'pickup' ? (avail.pickup || []) : (avail.delivery || []);

      if (!arr.includes(shipDate)) {
        req.session.flash = { type:'error', message:'選択された日程は出品者の受け渡し可能日ではありません。別の日付をお選びください。' };
        return res.redirect(`/checkout?seller=${encodeURIComponent(sellerId)}`);
      }
    }

    // shipDate と shipTime の整合性チェック
    if (shipTime) {
      const method = shipMethod === 'pickup' ? 'pickup' : 'delivery';
      
      const master = TIME_SLOT_MASTER[method] || [];
      // まず code 自体が定義済みか
      const allCodes = master.map(s => s.code);
      if (!allCodes.includes(shipTime)) {
        req.session.flash = { type:'error', message:'選択された時間帯が不正です。ページを更新して再度お試しください。' };
        return res.redirect(`/checkout?seller=${encodeURIComponent(sellerId)}`);
      }

      // shipDate があれば、その曜日にこのスロットが有効かチェック
      if (shipDate) {
        // sellerId はユーザーIDなので partnerId に変換
        // const partnerId = await getPartnerIdBySellerUserId(sellerId);
        const weeklySlots = await loadPartnerWeeklyTimeSlots(sellerId || null);

        const d = new Date(shipDate + 'T00:00:00');
        if (!isNaN(d.getTime())) {
          const wd = d.getDay();
          const byWeekday = (weeklySlots[method] || {});
          const allowedCodes = byWeekday[wd] || [];
          if (!allowedCodes.includes(shipTime)) {
            req.session.flash = {
              type:'error',
              message:'選択された時間帯は、出品者の受け渡し可能時間ではありません。別の時間帯をお選びください。'
            };
            return res.redirect(`/checkout?seller=${encodeURIComponent(sellerId)}`);
          }
        }
      }
    }

    // 対象アイテムの再取得（改竄防止）
    const allPairs = await loadCartItems(req);
    const selectedIds = getSelectedIdsBySeller(req, sellerId);
    const filtered    = filterPairsBySelectedAndSeller(allPairs, selectedIds, sellerId);
    const items       = await fetchCartItemsWithDetails(filtered);
    if (!items.length) return res.redirect('/cart');
    const rawShipTimeCode = (shipTime || '').trim() || null;
    const shipTimeJa = shipTimeLabel(rawShipTimeCode);

    // セッションに「出品者別の注文ドラフト」を保存
    if (!req.session.checkoutDraftBySeller) req.session.checkoutDraftBySeller = {};
    req.session.checkoutDraftBySeller[sellerId] = {
      sellerId,
      shippingAddressId: shipMethod === 'delivery' ? shippingAddressId : null,
      billSame: shipMethod === 'delivery' ? !!billSame : false,
      billingAddressId: (shipMethod === 'delivery' && billSame) ? null : billingAddressId,
      shipMethod,
      shipDate: shipDate || null,
      shipTime: shipTime || null,
      shipTimeJa,
      paymentMethod,
      orderNote: (orderNote || '').trim()
    };

    // 確認ページへ
    return res.redirect(`/checkout/confirm?seller=${encodeURIComponent(sellerId)}`);
  } catch (e) {
    next(e);
  }
});

/* ----------------------------
 *  POST /checkout/apply-coupon
 *  - クーポン適用 / 解除 / 再計算
 * -------------------------- */
app.post('/checkout/apply-coupon', async (req, res, next) => {
  console.log('UNIFIED /checkout/apply-coupon');
  try {
    const { code, shipMethod, sellerId, shippingAddressId } = req.body || {};
    const cart = ensureCart(req); // ★ セッション cart を必ず取得
    const _shipMethod = shipMethod || 'delivery';
    const userId = req.session?.user?.id || null;

    // 「code プロパティが body に存在するかどうか」を判定
    const hasCodeKey = Object.prototype.hasOwnProperty.call(req.body || {}, 'code');

    // -----------------------------
    // ① 再計算のみ（shipMethod/住所変更など）
    //    body に code プロパティそのものが無いパターン
    // -----------------------------
    if (!hasCodeKey) {
      const { totals, shippingError } = await buildTotalsForFrontend(req, {
        shipMethod: _shipMethod,
        sellerId,
        shippingAddressId
      });
      return res.json({
        ok: true,
        applied: !!(cart.coupon && cart.coupon.code),
        totals,
        shippingError,
        message: ''
      });
    }

    // ここから先は「code プロパティあり」

    // -----------------------------
    // ② 解除（code === '' など空文字）
    // -----------------------------
    if (!code) {
      cart.coupon = null;
      const { totals, shippingError } = await buildTotalsForFrontend(req, {
        shipMethod: _shipMethod,
        sellerId,
        shippingAddressId
      });
      return res.json({
        ok: true,
        applied: false,
        totals,
        shippingError,
        message: 'クーポンを解除しました。'
      });
    }

    // -----------------------------
    // ③ 新規適用（code あり）
    //    既に何か適用済みなら警告だけ
    // -----------------------------
    if (cart.coupon && cart.coupon.code) {
      const { totals, shippingError } = await buildTotalsForFrontend(req, {
        shipMethod: _shipMethod,
        sellerId,
        shippingAddressId
      });
      return res.json({
        ok: true,
        applied: true, // 既に何か適用されている
        totals,
        shippingError,
        message: `既にクーポン（${cart.coupon.code}）が適用されています。解除してから別のコードを適用してください。`,
        locked: true
      });
    }

    // クーポン検索
    const norm = String(code).trim();
    const coupon = await findCouponByCode(norm);
    if (!coupon) {
      const { totals, shippingError } = await buildTotalsForFrontend(req, {
        shipMethod: _shipMethod,
        sellerId,
        shippingAddressId
      });
      return res.json({
        ok: true,
        applied: false,
        totals,
        shippingError,
        message: '無効なクーポンです。'
      });
    }

    // -----------------------------
    // ④ クーポン利用可否チェック（小計ベース）
    //    → 出品者ごとの items を使って subtotal 計算
    // -----------------------------
    const allPairs   = await loadCartItems(req);
    const selectedIds = sellerId ? getSelectedIdsBySeller(req, sellerId) : new Set();
    const pairs = sellerId
      ? filterPairsBySelectedAndSeller(allPairs, selectedIds, sellerId)
      : (cart.items || []);

    const items = await fetchCartItemsWithDetails(pairs || []);
    const subtotal = items.reduce(
      (a, it) => a + (toInt(it.price, 0) * toInt(it.quantity, 1)),
      0
    );

    const v = await validateCouponForUser(coupon, { userId, subtotal, shipMethod: _shipMethod });
    if (!v.ok) {
      const { totals, shippingError } = await buildTotalsForFrontend(req, {
        shipMethod: _shipMethod,
        sellerId,
        shippingAddressId
      });

      let msg = 'このクーポンはご利用いただけません。';
      if (v.reason === 'MIN_SUBTOTAL') msg = `小計が最低利用金額（¥${Number(v.data?.min||0).toLocaleString()}）に達していません。`;
      if (v.reason === 'GLOBAL_LIMIT') msg = 'このクーポンは規定回数に達しました。';
      if (v.reason === 'PER_USER_LIMIT') msg = 'お一人様のご利用上限に達しています。';
      if (v.reason === 'SHIP_METHOD')   msg = 'このクーポンは現在の受け取り方法ではご利用いただけません。';

      return res.json({
        ok: true,
        applied: false,
        totals,
        shippingError,
        message: msg
      });
    }

    // -----------------------------
    // ⑤ 適用OK → セッション cart に保存
    // -----------------------------
    cart.coupon = {
      code: coupon.code,
      type: coupon.discount_type,        // 'percent' | 'amount'
      value: Number(coupon.discount_value) || 0,
      maxDiscount: Number(coupon.max_discount) || null,
      minSubtotal: Number(coupon.min_subtotal) || 0,
    };

    const { totals, shippingError } = await buildTotalsForFrontend(req, {
      shipMethod: _shipMethod,
      sellerId,
      shippingAddressId
    });

    return res.json({
      ok: true,
      applied: true,
      totals,
      shippingError,
      message: 'クーポンを適用しました。'
    });
  } catch (e) {
    next(e);
  }
});

/* ----------------------------
 *  POST /addresses  （ユーザー住所 新規作成）
 * -------------------------- */
// 例: POST /addresses （ユーザの住所を追加）
app.post(
  '/addresses',
  requireAuth,
  [
    body('full_name').trim().notEmpty().withMessage('お名前を入力してください。'),
    body('phone').trim().notEmpty().withMessage('電話番号を入力してください。'),
    body('postal_code').trim().notEmpty().withMessage('郵便番号を入力してください。'),
    body('prefecture').trim().notEmpty().withMessage('都道府県を入力してください。'),
    body('city').trim().notEmpty().withMessage('市区町村を入力してください。'),
    body('address_line1').trim().notEmpty().withMessage('住所を入力してください。'),
    body('address_type')
      .optional({ checkFalsy: true })
      .isIn(['shipping','billing'])
      .withMessage('住所種別が不正です。'),
    body('makeDefault')
      .optional({ checkFalsy: true })
      .toBoolean()
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ ok:false, errors: errors.array() });
    }

    const uid = req.session.user.id;
    const {
      full_name,
      company = null,
      phone,
      postal_code,
      prefecture,
      city,
      address_line1,
      address_line2 = null,
      addressType,
      country_code
    } = req.body;

    const makeDefault = !!req.body.makeDefault;

    // 未指定なら 'shipping' にフォールバック
    const type = (addressType === 'billing' || addressType === 'shipping') ? addressType : 'shipping';
    const country = (country_code || 'JP').toUpperCase();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 既定化する場合は、同一ユーザ・同一タイプの既定を先に落とす
      if (makeDefault) {
        await client.query(
          `UPDATE addresses
              SET is_default = false, updated_at = now()
            WHERE user_id = $1::uuid
              AND scope = 'user'
              AND address_type = $2`,
          [uid, type]
        );
      }

      // ★ address_type / country_code を明示指定する
      const ins = await client.query(
      `INSERT INTO addresses
          (scope, user_id, order_id, address_type,
          full_name, company, phone, postal_code,
          prefecture, city, address_line1, address_line2,
          country, is_default)
        VALUES
          ('user', $1, NULL, $2,
          $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12)
        RETURNING
          id, user_id, scope, address_type, is_default, created_at,
          full_name, company, phone, postal_code,
          prefecture, city, address_line1, address_line2, country`,
      [uid, type, full_name, company, phone, postal_code, prefecture, city,
        address_line1, address_line2, country, makeDefault]
      );

      await client.query('COMMIT');
      return res.json({ ok:true, address: ins.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      next(e);
    } finally {
      client.release();
    }
  }
);

/* ----------------------------
 *  GET /checkout/confirm  確認ページ
 * -------------------------- */
app.get('/checkout/confirm', async (req, res, next) => {
  try {
    if (!req.session?.user) {
      const nextUrl = '/checkout/confirm' + (req.query.seller ? `?seller=${encodeURIComponent(req.query.seller)}` : '');
      return res.redirect('/login?next=' + encodeURIComponent(nextUrl));
    }

    const sellerId = (req.query.seller || '').trim();
    if (!sellerId) {
      req.session.flash = { type:'error', message:'出品者が特定できません。もう一度やり直してください。' };
      return res.redirect('/cart');
    }

    const draft = req.session.checkoutDraftBySeller?.[sellerId];
    if (!draft) {
      // 入力が未完了
      req.session.flash = { type: 'error', message: '先に注文情報を入力してください。' };
      return res.redirect(`/checkout?seller=${encodeURIComponent(sellerId)}`);
    }

    const allPairs = await loadCartItems(req);
    const selectedIds = getSelectedIdsBySeller(req, sellerId);
    const filtered    = filterPairsBySelectedAndSeller(allPairs, selectedIds, sellerId);
    const items       = await fetchCartItemsWithDetails(filtered);
    if (!items.length) {
      req.session.flash = { type:'error', message:'カートに注文対象の商品がありません。' };
      return res.redirect('/cart');
    }

    // 住所（配送先/請求先）
    const uid = req.session.user.id;
    const shipMethod = draft.shipMethod;
    let shippingAddress = null;
    if (shipMethod === 'delivery') {
      shippingAddress = await findUserAddress(uid, draft.shippingAddressId);
      if (!shippingAddress) {
        req.session.flash = { type:'error', message:'配送先住所が不正です。' };
        return res.redirect(`/checkout?seller=${encodeURIComponent(sellerId)}`);
      }
    }
    const billSame = draft.billSame;
    let billingAddress = null;
    if (shipMethod === 'pickup' || !billSame) {
      billingAddress = await findUserAddress(uid, draft.billingAddressId);
      if (!billingAddress) {
        req.session.flash = { type:'error', message:'請求先住所が不正です。' };
        return res.redirect(`/checkout?seller=${encodeURIComponent(sellerId)}`);
      }
    }

    let shippingOverride = null;
    if (shipMethod === 'delivery') {
      const shipRes = await resolveShippingForSellerAndAddress({
        sellerId,
        userId: uid,
        shippingAddressId: draft.shippingAddressId
      });

      if (!shipRes.ok) {
        req.session.flash = {
          type: 'error',
          message: '配送先住所が現在の配送設定では配送対象外です。もう一度選択してください。'
        };
        return res.redirect(`/checkout?seller=${encodeURIComponent(sellerId)}`);
      }

      shippingOverride = shipRes.shipping;
    }

    // 合計（クーポンはセッションの cart.coupon を利用）
    const totals = calcTotals(
      items,
      req.session?.cart?.coupon || null,
      { shipMethod: draft.shipMethod, shippingOverride }
    );

    const sessionCart = req.session?.cart?.coupon || null;
    let coupon = null;
    if (sessionCart) {
      const code = sessionCart?.code;
      const norm = String(code).trim();
      coupon = await findCouponByCode(norm);
    }

    const shipMethod_ja = jaLabel('ship_method', draft.shipMethod) || draft.shipMethod;
    const paymentMethod_ja = jaLabel('payment_method', draft.paymentMethod) || draft.paymentMethod;
    const shipTime_ja = shipTimeLabel(draft.shipTime || '');

    // pickupの場合、partnerの受け取り住所を取得
    let pickupAddress = null;
    let partnerName = null;
    if (shipMethod === 'pickup' && items.length > 0) {
      // 最初の商品から出品者を取得
      const firstProduct = items[0];
      const productRow = await dbQuery(
        `SELECT p.seller_id FROM products p WHERE p.id = $1::uuid LIMIT 1`,
        [firstProduct.id]
      );
      if (productRow.length > 0) {
        const sellerUserId = productRow[0].seller_id;
        const sellerUser = await dbQuery(
          `SELECT partner_id FROM users WHERE id = $1::uuid LIMIT 1`,
          [sellerUserId]
        );
        if (sellerUser.length > 0 && sellerUser[0].partner_id) {
          const partner = await dbQuery(
            `SELECT pickup_address_id, postal_code, prefecture, city, address1, address2, phone, name
             FROM partners
             WHERE id = $1::uuid
             LIMIT 1`,
            [sellerUser[0].partner_id]
          );
          if (partner.length > 0) {
            const p = partner[0];
            partnerName = p.name;
            if (p.pickup_address_id) {
              // 設定された受け取り住所を取得
              const pickupAddrRows = await dbQuery(
                `SELECT id, full_name, postal_code, prefecture, city, address_line1, address_line2, phone
                 FROM addresses
                 WHERE id = $1::uuid AND scope = 'user'
                 LIMIT 1`,
                [p.pickup_address_id]
              );
              if (pickupAddrRows.length > 0) {
                pickupAddress = pickupAddrRows[0];
              }
            }
            // pickup_address_idが設定されていない場合は、partnerの基本住所を使用
            if (!pickupAddress && p.postal_code) {
              pickupAddress = {
                full_name: p.name || '受け取り場所',
                postal_code: p.postal_code,
                prefecture: p.prefecture,
                city: p.city,
                address_line1: p.address1,
                address_line2: p.address2,
                phone: p.phone
              };
            }
          }
        }
      }
    }

    req.session.flash = null;
    res.render('checkout/confirm', {
      title: 'ご注文内容の確認',
      items,
      totals,
      draft,
      sellerId,
      shippingAddress,
      billingAddress,
      pickupAddress,
      partnerName,
      shipMethod: draft.shipMethod,
      shipMethod_ja: shipMethod_ja,
      shipDate: draft.shipDate || null,
      shipTime: draft.shipTime || '',
      shipTime_ja,
      paymentMethod: draft.paymentMethod,
      paymentMethod_ja: paymentMethod_ja,
      orderNote: draft.orderNote || '',
      coupon
    });
  } catch (e) {
    next(e);
  }
});

/** order_addresses へ配送先/請求先をコピー挿入する（billing 省略時は shipping を使う） */
async function insertOrderAddresses(client, {
  orderId,
  userId,
  shippingAddressId,
  billingAddressId,
  billSame
}) {
  // 配送先は必須
  await client.query(
    `INSERT INTO order_addresses
       (order_id, address_type, full_name, company, phone, postal_code,
        prefecture, city, address_line1, address_line2, country)
     SELECT $1, 'shipping', full_name, company, phone, postal_code,
            prefecture, city, address_line1, address_line2, COALESCE(country,'JP')
       FROM addresses
      WHERE id = $2::uuid AND user_id = $3::uuid AND scope = 'user'
      LIMIT 1`,
    [orderId, shippingAddressId, userId]
  );

  const billId = (billSame || !billingAddressId) ? shippingAddressId : billingAddressId;
  await client.query(
    `INSERT INTO order_addresses
       (order_id, address_type, full_name, company, phone, postal_code,
        prefecture, city, address_line1, address_line2, country)
     SELECT $1, 'billing', full_name, company, phone, postal_code,
            prefecture, city, address_line1, address_line2, COALESCE(country,'JP')
       FROM addresses
      WHERE id = $2::uuid AND user_id = $3::uuid AND scope = 'user'
      LIMIT 1`,
    [orderId, billId, userId]
  );
}

function esc(s=''){
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function addrBlock(a){
  if(!a) return '—';
  const lines = [
    `〒${esc(a.postal_code||'')}`,
    esc([a.prefecture,a.city,a.address_line1,a.address_line2].filter(Boolean).join(' ')),
    `TEL: ${esc(a.phone||'—')}`
  ];
  return lines.join('\n');
}
function addrHtml(a){
  if(!a) return '—';
  return `
    <div>
      <div>〒${esc(a.postal_code||'')}</div>
      <div>${esc([a.prefecture,a.city,a.address_line1,a.address_line2].filter(Boolean).join(' '))}</div>
      <div>TEL: ${esc(a.phone||'—')}</div>
    </div>
  `;
}

// 購入者向け
function buildBuyerMail({orderNo, createdAt, buyer, items, totals, shippingAddress, billingAddress, paymentMethodJa, shipMethodJa, etaAt, coupon, shipTimeJa, pickupAddress, isPickup = false}){
  const linesText = items.map(it => `・${it.title} × ${it.quantity} … ${it.price.toLocaleString()}円`).join('\n');
  const linesHtml = items.map(it => `<li>${esc(it.title)} × ${it.quantity} … ${it.price.toLocaleString()}円</li>`).join('');
  const etaDateStr = etaAt ? new Date(etaAt).toLocaleDateString('ja-JP') : '';
  const etaLine = (etaDateStr || shipTimeJa)
    ? `${etaDateStr}${shipTimeJa ? ` ${shipTimeJa}` : ''}`
    : '指定なし';

  const subject = `【ご注文完了】注文番号: ${orderNo}`;
  const text =
`${buyer.name} 様

この度はご注文ありがとうございます。以下の内容で注文を承りました。

注文番号：${orderNo}
ご注文日時：${new Date(createdAt).toLocaleString('ja-JP')}
お支払い方法：${paymentMethodJa || '—'}
配送方法：${shipMethodJa || '—'}
お届け希望日時：${etaLine}
クーポン：${coupon?.code || '—'}

【ご注文商品】
${linesText}

小計：${totals.subtotal.toLocaleString()}円
割引：-${totals.discount.toLocaleString()}円
送料：${totals.shipping_fee.toLocaleString()}円
合計：${totals.total.toLocaleString()}円

${isPickup ? `【受け取り場所】
${pickupAddress ? addrBlock(pickupAddress) : '（受け取り場所の詳細は出品者からご連絡があります）'}

` : `【配送先】
${addrBlock(shippingAddress)}

【請求先】
${billingAddress ? addrBlock(billingAddress) : '（配送先と同じ）'}

`}本メールは自動送信です。ご不明点があればご連絡ください。
`;

  const html = `
<p>${esc(buyer.name)} 様</p>
<p>この度はご注文ありがとうございます。以下の内容で注文を承りました。</p>
<table style="border-collapse:collapse">
  <tr><td style="padding:2px 6px">注文番号</td><td>${esc(orderNo)}</td></tr>
  <tr><td style="padding:2px 6px">ご注文日時</td><td>${esc(new Date(createdAt).toLocaleString('ja-JP'))}</td></tr>
  <tr><td style="padding:2px 6px">お支払い方法</td><td>${esc(paymentMethodJa || '—')}</td></tr>
  <tr><td style="padding:2px 6px">配送方法</td><td>${esc(shipMethodJa || '—')}</td></tr>
  <tr><td style="padding:2px 6px">お届け希望日時</td><td>${esc(etaLine)}</td></tr>
  <tr><td style="padding:2px 6px">クーポン</td><td>${esc(coupon?.code || '—')}</td></tr>
</table>

<h3>ご注文商品</h3>
<ul>${linesHtml}</ul>

<p>
小計：${totals.subtotal.toLocaleString()}円<br>
割引：-${totals.discount.toLocaleString()}円<br>
送料：${totals.shipping_fee.toLocaleString()}円<br>
<b>合計：${totals.total.toLocaleString()}円</b>
</p>

${isPickup ? `<h3>受け取り場所</h3>
${pickupAddress ? addrHtml(pickupAddress) : '<p>（受け取り場所の詳細は出品者からご連絡があります）</p>'}

` : `<h3>配送先</h3>
${addrHtml(shippingAddress)}

<h3>請求先</h3>
${billingAddress ? addrHtml(billingAddress) : '（配送先と同じ）'}

`}<p style="color:#666">※本メールは自動送信です。ご不明点があればご連絡ください。</p>
`;

  return { subject, text, html };
}

// 出品者向け
function buildSellerMail({orderNo, createdAt, seller, buyer, items, totals, shippingAddress, paymentMethodJa, shipMethodJa, etaAt, shipTimeJa, pickupAddress, isPickup = false}){
  const linesText = items.map(it => `・${it.title} × ${it.quantity} … ${it.price.toLocaleString()}円`).join('\n');
  const linesHtml = items.map(it => `<li>${esc(it.title)} × ${it.quantity} … ${it.price.toLocaleString()}円</li>`).join('');
  const etaDateStr = etaAt ? new Date(etaAt).toLocaleDateString('ja-JP') : '';
  const etaLine = (etaDateStr || shipTimeJa)
    ? `${etaDateStr}${shipTimeJa ? ` ${shipTimeJa}` : ''}`
    : '指定なし';

  const subject = `【新規注文】注文番号: ${orderNo}（${buyer.name} 様）`;
  const text =
`新規注文を受け付けました。

注文番号：${orderNo}
注文日時：${new Date(createdAt).toLocaleString('ja-JP')}
購入者：${buyer.name} / ${buyer.email}
支払い方法：${paymentMethodJa || '—'}
配送方法：${shipMethodJa || '—'}
お届け希望日時：${etaLine}

【商品明細】
${linesText}

小計：${totals.subtotal.toLocaleString()}円
割引：-${totals.discount.toLocaleString()}円
送料：${totals.shipping_fee.toLocaleString()}円
合計：${totals.total.toLocaleString()}円

${isPickup ? `【受け取り場所】
${pickupAddress ? addrBlock(pickupAddress) : '（受け取り場所が設定されていません）'}

` : `【配送先】
${addrBlock(shippingAddress)}

`}本メールは通知専用です。対応をお願いします。
`;

  const html = `
<p>新規注文を受け付けました。</p>
<table style="border-collapse:collapse">
  <tr><td style="padding:2px 6px">注文番号</td><td>${esc(orderNo)}</td></tr>
  <tr><td style="padding:2px 6px">注文日時</td><td>${esc(new Date(createdAt).toLocaleString('ja-JP'))}</td></tr>
  <tr><td style="padding:2px 6px">購入者</td><td>${esc(buyer.name)} / ${esc(buyer.email||'')}</td></tr>
  <tr><td style="padding:2px 6px">支払い方法</td><td>${esc(paymentMethodJa || '—')}</td></tr>
  <tr><td style="padding:2px 6px">配送方法</td><td>${esc(shipMethodJa || '—')}</td></tr>
  <tr><td style="padding:2px 6px">お届け希望日時</td><td>${esc(etaLine)}</td></tr>
</table>

<h3>商品明細</h3>
<ul>${linesHtml}</ul>

<p>
小計：${totals.subtotal.toLocaleString()}円<br>
割引：-${totals.discount.toLocaleString()}円<br>
送料：${totals.shipping_fee.toLocaleString()}円<br>
<b>合計：${totals.total.toLocaleString()}円</b>
</p>

${isPickup ? `<h3>受け取り場所</h3>
${pickupAddress ? addrHtml(pickupAddress) : '<p>（受け取り場所が設定されていません）</p>'}

` : `<h3>配送先</h3>
${addrHtml(shippingAddress)}

`}<p style="color:#666">※本メールは通知専用です。対応をお願いします。</p>
`;

  return { subject, text, html };
}

async function getSellerRecipientsBySellerUserId(sellerUserId){
  // sellerUser(=products.seller_id)の所属partnerとメール
  const rows = await dbQuery(
    `SELECT u.id AS seller_user_id, u.email AS seller_email, u.name AS seller_name,
            u.partner_id,
            p.email AS partner_email, p.billing_email AS partner_billing_email, p.name AS partner_name
       FROM users u
       LEFT JOIN partners p ON p.id = u.partner_id
      WHERE u.id = $1::uuid
      LIMIT 1`,
    [sellerUserId]
  );
  if (!rows.length) return { seller: null, to: [] };
  const base = rows[0];

  // 取引先に紐づくユーザー（通知したい）
  const team = base.partner_id ? await dbQuery(
    `SELECT email FROM users
      WHERE partner_id=$1::uuid
        AND (roles @> ARRAY['seller']::text[] OR roles @> ARRAY['admin']::text[])`,
    [base.partner_id]
  ) : [];

  const candidates = [
    base.partner_billing_email,
    base.partner_email,
    ...team.map(r => r.email),
    base.seller_email
  ].map(e => (e||'').trim().toLowerCase()).filter(Boolean);

  // 重複排除
  const uniq = [...new Set(candidates)];
  return {
    seller: {
      seller_user_id: base.seller_user_id,
      seller_name: base.seller_name,
      partner_id: base.partner_id,
      partner_name: base.partner_name
    },
    to: uniq
  };
}

/* ----------------------------
 *  POST /checkout/confirm  注文を確定
 * -------------------------- */
app.post('/checkout/confirm', async (req, res, next) => {
  console.log('[POST /checkout/confirm] HIT', new Date().toISOString());
  const client = await pool.connect();
  try {
    if (!req.session?.user) {
      const nextUrl = '/checkout/confirm' + (req.query.seller ? `?seller=${encodeURIComponent(req.query.seller)}` : '');
      return res.redirect('/login?next=' + encodeURIComponent(nextUrl));
    }
    const uid = req.session.user.id;
    const sellerId = String(req.body.sellerId || req.query.seller || '').trim();
    if (!sellerId) {
      req.session.flash = { type:'error', message:'出品者が特定できません。もう一度やり直してください。' };
      return res.redirect('/cart');
    }
    const draft = req.session.checkoutDraftBySeller?.[sellerId];
    if (!draft) {
      req.session.flash = { type: 'error', message: '注文情報が見つかりません。' };
      return res.redirect(`/checkout?seller=${encodeURIComponent(sellerId)}`);
    }

    // 対象アイテム（選択済みがあればそれのみ）
    const allPairs   = await loadCartItems(req);
    const selectedIds = getSelectedIdsBySeller(req, sellerId);
    const targetPairs = filterPairsBySelectedAndSeller(allPairs, selectedIds, sellerId);
    if (!targetPairs.length) {
      req.session.flash = { type:'error', message:'注文対象の商品がありません。' };
      return res.redirect('/cart');
    }

    // 商品情報・在庫確認（価格の確定用にも使用）
    const ids = targetPairs.map(p => p.productId);
    const ph  = ids.map((_,i)=>`$${i+1}`).join(',');
    const prows = await dbQuery(
      `SELECT p.id, p.seller_id, p.title, p.price, p.unit, p.stock, p.slug
         FROM products p
        WHERE p.id IN (${ph})
          AND p.status = 'public'`,
      ids
    );

    // マップ化
    const byId = new Map(prows.map(r => [r.id, r]));
    // 在庫チェック（足りなければ戻す）
    for (const p of targetPairs) {
      const prod = byId.get(p.productId);
      if (!prod || (prod.stock|0) < (p.quantity|0)) {
        req.session.flash = { type:'error', message:'在庫不足の商品があります。数量を調整してください。' };
        return res.redirect('/cart');
      }
    }

    const shipMethod = draft.shipMethod;

    // ★ 時間帯コードをサニタイズして安全な値に
    const rawShipTimeCode = (draft.shipTime || '').trim() || null;

    const billSame = draft.billSame;
    let billingAddress = null;
    if (shipMethod === 'pickup' || !billSame) {
      billingAddress = await findUserAddress(uid, draft.billingAddressId);
      if (!billingAddress) {
        req.session.flash = { type:'error', message:'請求先住所が不正です。' };
        return res.redirect(`/checkout?seller=${encodeURIComponent(sellerId)}`);
      }
    }

    // 合計計算（サーバ側で最終確定）
    const itemsForTotal = targetPairs.map(p => {
      const prod = byId.get(p.productId);
      return { price: prod.price, quantity: p.quantity };
    });
    const coupon = req.session?.cart?.coupon || null;

    const subtotal = itemsForTotal.reduce((a,b)=>a + (b.price*b.quantity), 0);

    // ★ クーポン割引（type / value / maxDiscount に対応）
    let discount = 0;
    if (coupon) {
      if (coupon.type === 'percent') {
        discount = Math.floor(subtotal * (coupon.value / 100));
      } else {
        discount = Math.min(subtotal, Math.floor(coupon.value || 0));
      }
      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }
      // 必要なら minSubtotal もここでガード
      if (coupon.minSubtotal && subtotal < coupon.minSubtotal) {
        // 条件を満たしていない場合は割引 0 扱いにする
        discount = 0;
      }
    }

    // ★ 出品者ごとの配送ルールで送料決定
    let shipping_fee = 0;
    if (shipMethod === 'pickup') {
      shipping_fee = 0;
    } else {
      const shipRes = await resolveShippingForSellerAndAddress({
        sellerId,
        userId: uid,
        shippingAddressId: draft.shippingAddressId
      });

      if (!shipRes.ok) {
        let msg = '配送先住所が不正です。別の住所を選択してください。';
        if (shipRes.reason === 'CANNOT_SHIP') {
          msg = '選択された住所はこの出品者の配送対象外エリアです。畑受け取り、または別の住所をご選択ください。';
        } else if (shipRes.reason === 'NO_RULE') {
          msg = 'この出品者の配送設定が見つかりません。畑受け取りを選ぶか、別の住所をご指定ください。';
        } else if (shipRes.reason === 'ADDR_NOT_FOUND') {
          msg = '配送先住所が見つかりません。別の住所を選択してください。';
        }
        req.session.flash = { type: 'error', message: msg };
        return res.redirect(`/checkout?seller=${encodeURIComponent(sellerId)}`);
      }

      shipping_fee = shipRes.shipping || 0;
    }

    const total = Math.max(0, subtotal - discount) + shipping_fee;

    // 出品者の許可設定を再取得し、支払い方法を最終バリデーション
    const sellerConfig = await fetchSellerConfig(sellerId);
    const allowedPaymentObjs  = sellerConfig.allowedPaymentMethods || [{ code:'cod', label_ja:'代金引換' }];
    const allowedPaymentCodes = allowedPaymentObjs.map(p => String(p.code || '').trim());
    let safePaymentMethod = String(draft.paymentMethod || '');
    if (!allowedPaymentCodes.includes(safePaymentMethod)) {
      safePaymentMethod = allowedPaymentCodes[0] || 'cod';
    }

    // 注文番号・ETA
    const orderNo = genOrderNo();
    const etaAt = draft.shipDate ? new Date(draft.shipDate) : null;

    // ★ 出品者のpartner_idを取得（最初の商品から）
    // ordersテーブルのseller_idにはpartner_id（パートナー組織のID）を設定する
    const firstProduct = byId.get(targetPairs[0].productId);
    if (!firstProduct?.seller_id) {
      req.session.flash = { type:'error', message:'商品の出品者情報が見つかりません。' };
      return res.redirect('/cart');
    }

    // 出品者ユーザーからpartner_idを取得
    const sellerUsers = await dbQuery(
      'SELECT id, partner_id FROM users WHERE id = $1',
      [firstProduct.seller_id]
    );

    if (!sellerUsers.length || !sellerUsers[0].partner_id) {
      req.session.flash = {
        type:'error',
        message:'出品者のパートナー情報が見つかりません。出品者がパートナーに所属していることを確認してください。'
      };
      return res.redirect('/cart');
    }

    const orderSellerId = sellerUsers[0].partner_id; // これがpartner_id
    console.log('[POST /checkout/confirm] Order seller_id (partner_id):', orderSellerId);

    await client.query('BEGIN');

    // orders
    const oins = await client.query(
      `INSERT INTO orders
         (order_number, buyer_id, seller_id, status,
          subtotal, discount, shipping_fee, total,
          payment_method, note, eta_at, coupon_code, ship_method, ship_time_code,
          payment_status, delivery_status)
       VALUES
         ($1, $2, $3, 'pending',
          $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13,
          'unpaid', 'preparing')
       RETURNING id`,
      [
        orderNo, uid, orderSellerId,
        subtotal, discount, shipping_fee, total,
        safePaymentMethod, (draft.orderNote || '').slice(0,1000), etaAt,
        coupon?.code || null, draft.shipMethod, rawShipTimeCode
      ]
    );
    const orderId = oins.rows[0].id;

    // order_items
    for (const p of targetPairs) {
      const prod = byId.get(p.productId);
      await client.query(
        `INSERT INTO order_items
           (order_id, product_id, seller_id, quantity, price)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, prod.id, prod.seller_id, p.quantity, prod.price]
      );
      // 在庫減算
      await client.query(
        `UPDATE products SET stock = stock - $1, updated_at = now()
          WHERE id = $2::uuid`,
        [p.quantity, prod.id]
      );
    }

    // order_addresses（配送先/請求先を addresses からコピー）
    await insertOrderAddresses(client, {
      orderId,
      userId: uid,
      shippingAddressId: draft.shippingAddressId,
      billingAddressId: draft.billingAddressId,
      billSame: !!draft.billSame
    });

    // カートから今回の注文対象を削除（DB & セッション）
    if (req.session?.user?.id) {
      const cartRow = await getOrCreateUserCart(uid);
      await client.query(
        `DELETE FROM cart_items
          WHERE cart_id = $1::uuid AND product_id = ANY($2::uuid[])`,
        [cartRow.id, ids]
      );
    }
    // セッション側
    if (req.session?.cart?.items?.length) {
      req.session.cart.items = req.session.cart.items.filter(i => !ids.includes(i.productId));
    }

    // 今回選択（出品者別）だけクリア
    if (req.session?.cart?.selectionBySeller) {
      delete req.session.cart.selectionBySeller[sellerId];
    }
    // 出品者別ドラフトだけクリア
    if (req.session.checkoutDraftBySeller) {
      delete req.session.checkoutDraftBySeller[sellerId];
    }
    req.session.cart = req.session.cart || {};
    // クーポンは「使い切り」にしたいならここで null
    req.session.cart.coupon = null;

    await client.query('COMMIT');

    // 表示名付き From（Gmail APIでもOK。実送は認可済アカウント）
    const FROM = process.env.MAIL_FROM || process.env.CONTACT_FROM || process.env.SMTP_USER || 'no-reply@example.com';
    const ORDER_BCC = (process.env.ORDER_BCC || '').trim() || undefined;

    // 注文表示用データの整形は既存の通り
    const createdAt = new Date();
    const buyer = (await dbQuery(`SELECT id,name,email FROM users WHERE id=$1`, [uid]))[0] || {name:'',email:''};

    const items = targetPairs.map(p => {
      const prod = byId.get(p.productId);
      return { title: prod.title, quantity: p.quantity, price: prod.price };
    });
    const totals = { subtotal, discount, shipping_fee, total };
    const paymentMethodJa = jaLabel('payment_method', safePaymentMethod);
    const shipMethodJa    = jaLabel('ship_method', draft.shipMethod);

    // メール送信用の住所情報を取得
    let shippingAddress = null;
    if (shipMethod === 'delivery' && draft.shippingAddressId) {
      shippingAddress = await findUserAddress(uid, draft.shippingAddressId);
    }
    
    // billingAddressは既に取得済みだが、念のため再取得（スコープの問題を回避）
    let mailBillingAddress = null;
    if (shipMethod === 'pickup' || !billSame) {
      if (draft.billingAddressId) {
        mailBillingAddress = await findUserAddress(uid, draft.billingAddressId);
      }
    } else if (shippingAddress) {
      // billSameの場合は配送先と同じ
      mailBillingAddress = shippingAddress;
    }

    // 出品者宛先の算出
    const firstProd      = byId.get(targetPairs[0].productId);
    const sellerUserId   = firstProd?.seller_id;
    const { seller, to: sellerTos } = await getSellerRecipientsBySellerUserId(sellerUserId);
    const shipTimeJa = shipTimeLabel(rawShipTimeCode);

    // pickupの場合、partnerの受け取り住所を取得
    let pickupAddress = null;
    if (shipMethod === 'pickup' && sellerUserId) {
      const sellerUser = await dbQuery(
        `SELECT partner_id FROM users WHERE id = $1::uuid LIMIT 1`,
        [sellerUserId]
      );
      if (sellerUser.length > 0 && sellerUser[0].partner_id) {
        const partner = await dbQuery(
          `SELECT pickup_address_id, postal_code, prefecture, city, address1, address2, phone, name
           FROM partners
           WHERE id = $1::uuid
           LIMIT 1`,
          [sellerUser[0].partner_id]
        );
        if (partner.length > 0) {
          const p = partner[0];
          const partnerName = p.name;
          if (p.pickup_address_id) {
            // 設定された受け取り住所を取得
            const pickupAddrRows = await dbQuery(
              `SELECT id, full_name, postal_code, prefecture, city, address_line1, address_line2, phone
               FROM addresses
               WHERE id = $1::uuid AND scope = 'user'
               LIMIT 1`,
              [p.pickup_address_id]
            );
            if (pickupAddrRows.length > 0) {
              pickupAddress = pickupAddrRows[0];
              // partner名で上書き
              pickupAddress.full_name = partnerName || '受け取り場所';
            }
          }
          // pickup_address_idが設定されていない場合は、partnerの基本住所を使用
          if (!pickupAddress && p.postal_code) {
            pickupAddress = {
              full_name: partnerName || '受け取り場所',
              postal_code: p.postal_code,
              prefecture: p.prefecture,
              city: p.city,
              address_line1: p.address1,
              address_line2: p.address2,
              phone: p.phone
            };
          }
        }
      }
    }

    // —— メール送信：購入者 / 出品者（並列送信でもOK）
    const tasks = [];

    // 購入者へ（返信先は運営：不要なら消す）
    try {
      const buyerMail = buildBuyerMail({
        orderNo, createdAt, buyer, items, totals,
        shippingAddress, billingAddress: mailBillingAddress,
        paymentMethodJa, shipMethodJa, etaAt, coupon, shipTimeJa,
        pickupAddress: shipMethod === 'pickup' ? pickupAddress : null,
        isPickup: shipMethod === 'pickup'
      });

      tasks.push(
        gmailSend({
          from: FROM,
          to: buyer.email,              // 念のため null/空なら sendMail 内で弾く実装だと安全
          subject: buyerMail.subject,
          text: buyerMail.text,
          html: buyerMail.html,
          bcc: ORDER_BCC || undefined
        }).then(res => {
          if (res?.previewUrl) console.log('Buyer mail preview:', res.previewUrl);
        }).catch(err => {
          console.error('order mail (buyer) failed:', err?.message || err);
        })
      );
    } catch (e) {
      console.error('build buyer mail failed:', e?.message || e);
    }

    // 出品者へ（replyTo を購入者に）
    try {
      if (sellerTos.length){
        const sellerMail = buildSellerMail({
          orderNo, createdAt, seller, buyer, items, totals,
          shippingAddress: shippingAddress,
          paymentMethodJa, shipMethodJa, etaAt, shipTimeJa,
          pickupAddress: shipMethod === 'pickup' ? pickupAddress : null,
          isPickup: shipMethod === 'pickup'
        });

        tasks.push(
          gmailSend({
            from: FROM,
            to: sellerTos,               // 配列OK（ラッパー側で join or そのまま扱えるように）
            subject: sellerMail.subject,
            text: sellerMail.text,
            html: sellerMail.html,
            replyTo: buyer.email || undefined,
            bcc: ORDER_BCC || undefined
          }).then(res => {
            if (res?.previewUrl) console.log('Seller mail preview:', res.previewUrl);
          }).catch(err => {
            console.error('order mail (seller) failed:', err?.message || err);
          })
        );
      }
    } catch (e) {
      console.error('build seller mail failed:', e?.message || e);
    }

    // 送信は待たずに画面遷移してOKにしたい場合：await を外す（完全非同期）
    // 失敗ログを確実に出したい・Ethereal プレビューを見たいなら settle
    await Promise.allSettled(tasks);

    // ========== Stripe決済の場合はCheckout Sessionを作成 ==========
    if (safePaymentMethod === 'card') {
      try {
        // Stripe Checkout Session用のline_itemsを構築
        const lineItems = [];

        // 割引を含めた合計金額を計算（既にtotal変数に格納されている）
        // total = subtotal - discount + shipping_fee

        // 割引がある場合、Stripeでは直接負の金額を扱えないため、
        // 「割引後の商品小計」として1つのline_itemにまとめる
        if (discount > 0) {
          const discountedSubtotal = Math.max(0, subtotal - discount);
          lineItems.push({
            price_data: {
              currency: 'jpy',
              product_data: {
                name: `商品代金（割引適用済: ${coupon?.code || ''}）`
              },
              unit_amount: discountedSubtotal
            },
            quantity: 1
          });
        } else {
          // 割引がない場合は通常通り商品を個別に追加
          for (const p of targetPairs) {
            const prod = byId.get(p.productId);
            lineItems.push({
              price_data: {
                currency: 'jpy',
                product_data: {
                  name: prod.title
                },
                unit_amount: prod.price
              },
              quantity: p.quantity
            });
          }
        }

        // 送料を追加（0円でない場合）
        if (shipping_fee > 0) {
          lineItems.push({
            price_data: {
              currency: 'jpy',
              product_data: {
                name: '送料'
              },
              unit_amount: shipping_fee
            },
            quantity: 1
          });
        }

        const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;

        // Stripe Checkout Session を作成
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: lineItems,
          mode: 'payment',
          success_url: `${appUrl}/checkout/complete?no=${encodeURIComponent(orderNo)}`,
          cancel_url: `${appUrl}/checkout?seller=${encodeURIComponent(sellerId)}`,
          metadata: {
            order_id: String(orderId),
            order_number: orderNo,
            seller_id: String(sellerId),
            user_id: String(uid)
          }
        });

        // orders テーブルを更新してStripe情報を保存
        await dbQuery(
          `UPDATE orders
           SET payment_provider = 'stripe',
               payment_external_id = $1,
               updated_at = now()
           WHERE id = $2`,
          [session.id, orderId]
        );

        logger.info('Stripe Checkout Session created', {
          sessionId: session.id,
          orderId,
          orderNumber: orderNo
        });

        // Stripeの決済ページにリダイレクト
        return res.redirect(session.url);
      } catch (err) {
        logger.error('Failed to create Stripe Checkout Session', {
          error: err.message,
          stack: err.stack,
          orderId,
          orderNumber: orderNo
        });

        // Stripe決済失敗時は従来通りの完了ページへ
        req.session.flash = {
          type: 'warning',
          message: '決済画面の準備に失敗しました。注文は作成されていますが、お手数ですが別の支払い方法をご利用ください。'
        };
        return res.redirect(`/checkout/complete?no=${encodeURIComponent(orderNo)}`);
      }
    }

    // 完了へ（代金引換など、Stripe以外の決済方法の場合）
    return res.redirect(`/checkout/complete?no=${encodeURIComponent(orderNo)}`);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    next(e);
  } finally {
    client.release();
  }
});

/* ----------------------------
 *  GET /checkout/complete  注文完了
 *  クエリ: ?no=注文番号（ORD-...）またはオーダーID
 * -------------------------- */
app.get('/checkout/complete', async (req, res, next) => {
  try {
    const key = String(req.query.no || '').trim();

    if (!key) {
      // 直接アクセスなど
      return res.redirect('/');
    }

    // ログイン済みなら本人の注文に限定（未ログインは番号照合のみ）
    const uid = req.session?.user?.id || null;

    // 注文本体の取得（order_number が一致 or id::text が一致）
    const orderRows = await dbQuery(
      `SELECT o.id, o.order_number AS order_no, o.buyer_id,
              o.status, o.subtotal, o.discount, o.shipping_fee, o.total, o.ship_time_code,
              o.created_at, o.eta_at, o.payment_method, o.ship_method, o.coupon_code,
              o.payment_status
         FROM orders o
        WHERE (o.order_number = $1 OR o.id::text = $1)
          ${uid ? 'AND o.buyer_id = $2::uuid' : ''}
        LIMIT 1`,
      uid ? [key, uid] : [key]
    );
    const order = orderRows[0];
    if (!order) {
      return res.status(404).render('errors/404', { title: '注文が見つかりません' });
    }

    // 明細
    const items = await dbQuery(
      `SELECT p.slug, p.title, p.unit, oi.price, oi.quantity, p.id,
              (SELECT url FROM product_images i
                 WHERE i.product_id = p.id
                 ORDER BY position ASC
                 LIMIT 1) AS image_url
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = $1::uuid
        ORDER BY oi.id ASC`,
      [order.id]
    );

    // 住所（配送先/請求先）
    const addrs = await dbQuery(
      `SELECT address_type, full_name, phone, postal_code, prefecture, city,
              address_line1, address_line2
         FROM order_addresses
        WHERE order_id = $1::uuid`,
      [order.id]
    );
    const shippingAddress = addrs.find(a => a.address_type === 'shipping') || null;
    let billingAddress = addrs.find(a => a.address_type === 'billing') || null;

    // 配送先と完全一致なら請求先は省略して「同じ」と表示（UI都合）
    if (shippingAddress && billingAddress) {
      const pick = a => ({
        full_name: a.full_name,
        phone: a.phone,
        postal_code: a.postal_code,
        prefecture: a.prefecture,
        city: a.city,
        address_line1: a.address_line1,
        address_line2: a.address_line2 || null,
      });
      const s = pick(shippingAddress);
      const b = pick(billingAddress);
      if (JSON.stringify(s) === JSON.stringify(b)) {
        billingAddress = null;
      }
    }

    // 合計（保存値をそのまま使用）
    const totals = {
      subtotal: order.subtotal,
      discount: order.discount,
      shipping_fee: order.shipping_fee,
      total: order.total
    };

    // pickupの場合、partnerの受け取り住所を取得
    let pickupAddress = null;
    let partnerName = null;
    const isPickup = order.ship_method === 'pickup';
    if (isPickup && items.length > 0) {
      // 最初の商品から出品者を取得
      const firstProduct = items[0];
      const productRow = await dbQuery(
        `SELECT p.seller_id FROM products p WHERE p.id = $1::uuid LIMIT 1`,
        [firstProduct.id]
      );
      if (productRow.length > 0) {
        const sellerUserId = productRow[0].seller_id;
        const sellerUser = await dbQuery(
          `SELECT partner_id FROM users WHERE id = $1::uuid LIMIT 1`,
          [sellerUserId]
        );
        if (sellerUser.length > 0 && sellerUser[0].partner_id) {
          const partner = await dbQuery(
            `SELECT pickup_address_id, postal_code, prefecture, city, address1, address2, phone, name
             FROM partners
             WHERE id = $1::uuid
             LIMIT 1`,
            [sellerUser[0].partner_id]
          );
          if (partner.length > 0) {
            const p = partner[0];
            partnerName = p.name;
            if (p.pickup_address_id) {
              // 設定された受け取り住所を取得
              const pickupAddrRows = await dbQuery(
                `SELECT id, full_name, postal_code, prefecture, city, address_line1, address_line2, phone
                 FROM addresses
                 WHERE id = $1::uuid AND scope = 'user'
                 LIMIT 1`,
                [p.pickup_address_id]
              );
              if (pickupAddrRows.length > 0) {
                pickupAddress = pickupAddrRows[0];
              }
            }
            // pickup_address_idが設定されていない場合は、partnerの基本住所を使用
            if (!pickupAddress && p.postal_code) {
              pickupAddress = {
                full_name: p.name || '受け取り場所',
                postal_code: p.postal_code,
                prefecture: p.prefecture,
                city: p.city,
                address_line1: p.address1,
                address_line2: p.address2,
                phone: p.phone
              };
            }
          }
        }
      }
    }

    const shipTimeJa = shipTimeLabel(order.ship_time_code);

    // EJS が期待する形へ整形
    const viewOrder = {
      id: order.id,
      orderNo: order.order_no || order.id,
      status: order.status,
      subtotal: order.subtotal,
      discount: order.discount,
      shipping_fee: order.shipping_fee,
      total: order.total,
      created_at: order.created_at,
      eta_at: order.eta_at,
      payment_method: order.payment_method,
      payment_status: order.payment_status,
      ship_method: order.ship_method,
      payment_method_ja: jaLabel('payment_method', order.payment_method) || null,
      ship_method_ja: jaLabel('ship_method', order.ship_method) || null,
      ship_time_code: order.ship_time_code,
      ship_time_ja:   shipTimeJa
    };

    const coupon = order.coupon_code ? { code: order.coupon_code } : null;

    res.set('Cache-Control', 'no-store');
    return res.render('checkout/complete', {
      title: 'ご注文ありがとうございました',
      order: viewOrder,
      items,
      shippingAddress,
      billingAddress,
      pickupAddress,
      partnerName,
      coupon
    });
  } catch (e) {
    next(e);
  }
});

// =========================================================
// 注文詳細: GET /orders/:no
//  - :no は order_number か UUID（id）のどちらでも可
//  - 購入者本人のみ閲覧可能
// =========================================================
app.get('/orders/:no', requireAuth, async (req, res, next) => {
  try {
    const no = String(req.params.no || '').trim();
    const uid = req.session.user.id;

    // ─ 1) 注文本体（購入者チェック込み）
    const orderRows = await dbQuery(
      `
      SELECT
        o.*,
        COALESCE(o.order_number, o.id::text) AS ord_no,
        o.receipt_name
      FROM orders o
      WHERE (o.order_number = $1 OR o.id::text = $1)
        AND o.buyer_id = $2
      LIMIT 1
      `,
      [no, uid]
    );
    const order = orderRows[0];
    const shipTimeJa = shipTimeLabel(order.ship_time_code);
    order.status_ja = jaLabel('order_status', order.status);
    order.paymentMethod = jaLabel('payment_method', order.payment_method);
    order.paymentStatus = jaLabel('payment_status', order.payment_status);
    order.deliveryStatus = jaLabel('shipment_status', order.delivery_status);
    order.shipMethod = jaLabel('ship_method', order.ship_method);
    order.status_ja = jaLabel('order_status', order.status);
    order.ship_time_ja = shipTimeJa;
    if (!order) return res.status(404).render('errors/404', { title: '注文が見つかりません' });

    // ─ 2) アイテム一覧
    const itemRows = await dbQuery(
      `
      SELECT
        oi.product_id,
        oi.quantity,
        oi.price AS unit_price,
        p.slug,
        p.title,
        p.unit,
        su.name AS seller_name,
        (
          SELECT url
          FROM product_images pi
          WHERE pi.product_id = p.id
          ORDER BY pi.position ASC
          LIMIT 1
        ) AS image_url
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN users su ON su.id = oi.seller_id
      WHERE oi.order_id = $1
      ORDER BY oi.id ASC
      `,
      [order.id]
    );
    const items = itemRows.map(r => ({
      slug: r.slug,
      title: r.title,
      unit: r.unit,
      quantity: Number(r.quantity || 1),
      unit_price: Number(r.unit_price || 0),
      price: Number(r.unit_price || 0), // 後方互換
      image_url: r.image_url,
      seller_name: r.seller_name || ''
    }));

    // ─ 3) 住所（配送先／請求先）
    const addrRows = await dbQuery(
      `SELECT *
         FROM order_addresses
        WHERE order_id = $1
        ORDER BY address_type ASC`,
      [order.id]
    );
    const shippingAddress = addrRows.find(a => a.address_type === 'shipping') || null;
    // 請求先が無ければ「配送先と同一」とみなす（A方針）
    const billingAddress  = addrRows.find(a => a.address_type === 'billing') || null;

    // ─ 4) pickupの場合、partnerの受け取り住所を取得
    let pickupAddress = null;
    let partnerName = null;
    const isPickup = order.ship_method === 'pickup';
    if (isPickup && itemRows.length > 0) {
      // 最初の商品から出品者を取得
      const firstProductId = itemRows[0].product_id;
      const productRow = await dbQuery(
        `SELECT p.seller_id FROM products p WHERE p.id = $1::uuid LIMIT 1`,
        [firstProductId]
      );
      if (productRow.length > 0) {
        const sellerUserId = productRow[0].seller_id;
        const sellerUser = await dbQuery(
          `SELECT partner_id FROM users WHERE id = $1::uuid LIMIT 1`,
          [sellerUserId]
        );
        if (sellerUser.length > 0 && sellerUser[0].partner_id) {
          const partner = await dbQuery(
            `SELECT pickup_address_id, postal_code, prefecture, city, address1, address2, phone, name
             FROM partners
             WHERE id = $1::uuid
             LIMIT 1`,
            [sellerUser[0].partner_id]
          );
          if (partner.length > 0) {
            const p = partner[0];
            partnerName = p.name;
            if (p.pickup_address_id) {
              // 設定された受け取り住所を取得
              const pickupAddrRows = await dbQuery(
                `SELECT id, full_name, postal_code, prefecture, city, address_line1, address_line2, phone
                 FROM addresses
                 WHERE id = $1::uuid AND scope = 'user'
                 LIMIT 1`,
                [p.pickup_address_id]
              );
              if (pickupAddrRows.length > 0) {
                pickupAddress = pickupAddrRows[0];
              }
            }
            // pickup_address_idが設定されていない場合は、partnerの基本住所を使用
            if (!pickupAddress && p.postal_code) {
              pickupAddress = {
                full_name: p.name || '受け取り場所',
                postal_code: p.postal_code,
                prefecture: p.prefecture,
                city: p.city,
                address_line1: p.address1,
                address_line2: p.address2,
                phone: p.phone
              };
            }
          }
        }
      }
    }

    // ─ 6) 合計
    const totals = {
      subtotal: Number(order.subtotal || 0),
      discount: Number((order.discount || 0) + (order.coupon_discount || 0)),
      shipping: Number(order.shipping_fee || 0),
      tax:      Number(order.tax || 0),
      total:    Number(order.total || 0)
    };

    // ─ 7) ステータス → ランク（Path表示用）
    //   pending(受付)=0, paid/processing(処理中)=1, shipped(出荷)=2, delivered(完了)=3, canceled=0
    const status = String(order.status || '').toLowerCase();
    const statusRank =
      status === 'paid' || status === 'processing' ? 1 :
      status === 'shipped' ? 2 :
      status === 'delivered' ? 3 :
      0;

    // receipt_nameを取得
    const receiptName = order.receipt_name || null;

    // 初期値としてユーザー名を設定（receipt_nameが無い場合）
    const defaultReceiptName = req.session.user?.name || '';

    // EJS へ
    res.render('orders/show', {
      title: '注文詳細',
      order: {
        ...order,
        orderNumber: order.ord_no,
        statusRank,
        receiptName
      },
      items,
      totals,
      shippingAddress,
      // 請求先が無ければ null のまま → EJS 側で「同一です」表示
      billingAddress: billingAddress,
      pickupAddress,
      partnerName,
      currentUser: req.session.user,
      defaultReceiptName,
      csrfToken: (typeof req.csrfToken === 'function') ? req.csrfToken() : null
    });
  } catch (e) {
    next(e);
  }
});

// ========= 領収書宛名保存 =========
app.post('/orders/:no/receipt-name', requireAuth, csrfProtect, async (req, res, next) => {
  try {
    const orderNo = String(req.params.no || '').trim();
    if (!orderNo) return res.status(400).json({ ok: false, message: '注文番号が不正です' });

    const uid = req.session.user.id;
    const receiptName = String(req.body.receipt_name || '').trim();

    // バリデーション
    if (receiptName.length === 0 || receiptName.length > 40) {
      return res.status(400).json({ 
        ok: false, 
        message: '宛名は1〜40文字で入力してください' 
      });
    }

    // XSS対策：危険文字をエスケープ（HTMLエンティティ化）
    const escapeHtml = (str) => {
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };
      return str.replace(/[&<>"']/g, m => map[m]);
    };
    const sanitized = escapeHtml(receiptName);

    // 注文の所有権確認
    const by = isUuid(orderNo) ? 'id' : 'order_number';
    const orderRows = await dbQuery(
      `
      SELECT o.id, o.buyer_id
      FROM orders o
      WHERE ${by} = $1 AND o.buyer_id = $2
      LIMIT 1
      `,
      [orderNo, uid]
    );

    if (!orderRows.length) {
      return res.status(404).json({ ok: false, message: '注文が見つかりません' });
    }

    const orderId = orderRows[0].id;

    // receipt_nameを更新
    await dbQuery(
      `UPDATE orders SET receipt_name = $1 WHERE id = $2::uuid`,
      [sanitized, orderId]
    );

    res.json({ ok: true, receipt_name: sanitized });
  } catch (e) {
    next(e);
  }
});

// ========= Invoice 用 取得処理 =========

/** 住所の表示用整形（行/一行の両方を返す） */
function formatAddressRow(a) {
  if (!a) return { lines: [], oneline: '' };
  const line2 = [a.prefecture, a.city, a.address_line1, a.address_line2].filter(Boolean).join('');
  const lines = [
    a.full_name ? `${a.full_name}` : null,
    a.postal_code ? `〒${a.postal_code}` : null,
    line2 || null,
    a.phone ? `TEL: ${a.phone}` : null,
  ].filter(Boolean);
  return { lines, oneline: lines.join(' / ') };
}

/**
 * 請求書/領収書用に注文一式を取得して正規化
 */
async function fetchInvoiceData(query, { orderNo, userId }) {
  // ---- 注文本体（id or order_number）----
  const by = isUuid(orderNo) ? 'id' : 'order_number';
  const ordRows = await query(
    `
      SELECT
        o.id,
        COALESCE(o.order_number, o.id::text) AS order_no,
        o.buyer_id,
        o.status,
        o.subtotal,
        o.discount,
        o.shipping_fee,
        o.tax,
        o.total,
        o.payment_method,
        o.payment_status,
        o.ship_method,
        o.receipt_name,
        o.created_at
      FROM orders o
      WHERE ${by} = $1
      LIMIT 1
    `,
    [orderNo]
  );
  const o = ordRows[0];
  o.status_ja = jaLabel('order_status', o.status) || null;
  o.payment_status_ja = jaLabel('payment_status', o.payment_status) || null;
  o.payment_method_ja = jaLabel('payment_method', o.payment_method) || null;
  if (!o) {
    const err = new Error('ORDER_NOT_FOUND');
    err.code = 'ORDER_NOT_FOUND';
    throw err;
  }

  // ---- 購入者 ----
  const userRows = await query(
    `
    SELECT
      u.id, u.name, u.email, u.partner_id,
      pa.name AS partner_name, pa.phone AS partner_phone, pa.email AS partner_email
    FROM users u
    LEFT JOIN partners pa ON pa.id = u.partner_id
    WHERE u.id = $1 LIMIT 1`,
    [o.buyer_id]
  );
  const buyer = userRows[0] || { id: o.buyer_id, name: '', email: '' };

  // ---- 注文内アイテム（position が無いので created_at にフォールバック）----
  const itemRows = await query(
    `
      SELECT
        oi.product_id,
        oi.quantity::int,
        oi.price::int,
        (oi.price * oi.quantity)::int AS line_total,
        p.title AS product_name,
        p.unit  AS unit,
        oi.seller_id
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = $1
      ORDER BY p.title ASC
    `,
    [o.id]
  );

  // ---- 出品者（seller）情報を取得（最初の商品のsellerから）----
  let seller = null;
  let sellerPartner = null;
  if (itemRows.length > 0) {
    const firstSellerId = itemRows[0].seller_id;
    if (firstSellerId) {
      const sellerRows = await query(
        `
        SELECT u.id, u.name, u.partner_id
        FROM users u
        WHERE u.id = $1
        LIMIT 1
        `,
        [firstSellerId]
      );
      if (sellerRows.length > 0) {
        seller = sellerRows[0];
        if (seller.partner_id) {
          const partnerRows = await query(
            `
            SELECT 
              id, name, tax_id, postal_code, prefecture, city, address1, address2, phone, email
            FROM partners
            WHERE id = $1
            LIMIT 1
            `,
            [seller.partner_id]
          );
          if (partnerRows.length > 0) {
            sellerPartner = partnerRows[0];
          }
        }
      }
    }
  }

  // ---- 住所（shipping / billing）----
  const addrRows = await query(
    `
      SELECT
        id, address_type,
        full_name, phone, postal_code, prefecture, city, address_line1, address_line2
      FROM order_addresses
      WHERE order_id = $1
    `,
    [o.id]
  );
  const shipping = addrRows.find(a => a.address_type === 'shipping') || null;
  // 請求先が空の場合は配送先を利用する仕様
  const billing  = addrRows.find(a => a.address_type === 'billing') || shipping || null;

  const shippingAddress = formatAddressRow(shipping);
  const billingAddress  = formatAddressRow(billing);

  // ---- サマリ（念のため再構築）----
  const subtotal = Number(o.subtotal || 0);
  const discount = Number(o.discount || 0);
  const shippingFee = Number(o.shipping_fee || 0);
  const tax = Number(o.tax || 0);
  const total = Number(o.total || (subtotal - discount + shippingFee + tax));

  const order = {
    id: o.id,
    orderNo: o.order_no,
    status: o.status_ja || o.status,
    createdAt: o.created_at,
    paymentMethod: o.payment_method_ja || o.payment_method || '',
    paymentStatus: o.payment_status_ja || o.payment_status || '',
    shipMethod: o.ship_method || null,
    receiptName: o.receipt_name || null
  };

  const items = itemRows.map(r => ({
    productId: r.product_id,
    name: r.product_name,
    unit: r.unit,
    quantity: Number(r.quantity || 0),
    unitPrice: Number(r.price || 0),
    lineTotal: Number(r.line_total || 0),
    // 税率は10%固定（将来的に商品ごとの税率に対応可能）
    taxRate: 10
  }));

  // 税率計算（10%固定と仮定）
  // 税込金額から税抜金額を計算: 税込 = 税抜 * 1.1 → 税抜 = 税込 / 1.1
  const taxableAmount = Math.round(subtotal / 1.1); // 10%対象金額（税抜）
  const calculatedTax = subtotal - taxableAmount; // 消費税額

  const summary = { 
    subtotal, 
    discount, 
    shippingFee, 
    tax, 
    total,
    taxableAmount, // 10%対象金額（税抜）
    calculatedTax  // 計算された消費税額
  };

  return {
    order,
    buyer,
    seller,
    sellerPartner,
    shippingAddress,
    billingAddress,
    items,
    summary
  };
}

/**
 * 納品書用に注文一式を取得して正規化
 */
async function fetchDeliveryNoteData(query, { orderNo, userId }) {
  // 領収書と同じロジックでデータ取得（再利用）
  const data = await fetchInvoiceData(query, { orderNo, userId });

  // 納品書固有の情報を追加（将来的に shipped_at などを追加可能）
  // 現時点では created_at を納品日として使用
  data.order.shippedAt = data.order.createdAt; // 将来 shipped_at カラム追加時に切り替え
  data.order.note = data.order.note || ''; // 備考欄

  return data;
}

/**
 * 納品書テンプレをサーバ側で描画し、PDFを返す（バッファ）
 *
 * @param {Object} opts
 * @param {string} opts.orderNo - 注文番号
 * @param {string} opts.baseUrl - 相対パス解決用ベースURL
 * @param {string} opts.userId - ユーザーID（権限チェック用）
 * @param {boolean} opts.showPrice - 価格表示フラグ（デフォルト false）
 * @returns {Promise<Buffer>}
 */
async function generateDeliveryNotePdf({ orderNo, baseUrl, userId, showPrice = false }) {
  // ① データ取得
  const { order, buyer, seller, sellerPartner, shippingAddress, billingAddress, items, summary } =
    await fetchDeliveryNoteData(dbQuery, { orderNo, userId });

  // ② EJS レンダリング
  const html = await ejs.renderFile(
    path.join(__dirname, 'views', 'delivery-notes', 'delivery-note.ejs'),
    { order, buyer, seller, sellerPartner, shippingAddress, billingAddress, items, summary, showPrice },
    { async: true }
  );

  // ③ Puppeteer で PDF 化
  const pdfBuffer = await htmlToPdfBuffer(html, baseUrl);
  return pdfBuffer;
}

async function resolveChromiumExecutable() {

  // 1) 環境変数があれば最優先（※存在確認つき）
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  // 2) puppeteer が管理している実体（ビルド時に npx で入れておく想定）
  try {
    const puppeteer = require('puppeteer');
    const ep = await puppeteer.executablePath(); // v22+ は async
    if (ep && fs.existsSync(ep)) return ep;
  } catch (_) {}

  const cacheCandidates = [
    process.env.PUPPETEER_CACHE_DIR || '/opt/render/.cache/puppeteer',
    '/opt/render/project/.cache/puppeteer', // 設定ファイルを __dirname 基準にした場合にこちらに入ることがある
  ];

  for (const cacheDir of cacheCandidates) {
    try {
      const entries = fs.readdirSync(cacheDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name.startsWith('chrome'));
      for (const d of entries) {
        const p = path.join(cacheDir, d.name, 'chrome-linux64', 'chrome');
        if (fs.existsSync(p)) return p;
      }
    } catch (_) {}
  }

  // 3) よくあるシステムパス
  for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']) {
    if (fs.existsSync(p)) return p;
  }

  // 見つからなければ null（Puppeteer に任せる → 失敗時は上のエラー）
  return null;
}

// Node.js の環境（Render等）で必要になりがちな起動オプション
// 【2】本番環境（Docker/Render）でのみ特別な起動オプションを適用
async function buildLaunchOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  let executablePath = await resolveChromiumExecutable();
  
  const baseArgs = [
    '--font-render-hinting=medium',
    '--disable-gpu',
    '--lang=ja-JP'
  ];
  
  // 本番環境（Docker/Render）でのみ必須のオプション
  if (isProd) {
    baseArgs.push(
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    );
  }
  
  return {
    headless: 'new',
    executablePath: executablePath || undefined,
    args: baseArgs
  };
}

/**
 * HTML（相対パスのCSSあり）を PDF バッファに変換
 * @param {string} html - 完成済みのHTML
 * @param {string} baseUrl - 相対パス解決用に使うサイトのベースURL（例: https://example.com/）
 * @returns {Buffer}
 */
async function htmlToPdfBuffer(html, baseUrl) {
  const puppeteer = require('puppeteer');
  const launchOpts = await buildLaunchOptions();
  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();

    // 相対リンク解決用に <base> を注入
    const htmlWithBase = html.replace(
      /<head(.*?)>/i,
      `<head$1><base href="${baseUrl}">`
    );

    await page.setContent(htmlWithBase, {
      waitUntil: ['load', 'domcontentloaded']
    });
    await page.evaluate(() => document.fonts && document.fonts.ready);

    // 画面用のCSSを反映（必要に応じて 'print' に切替）
    await page.emulateMediaType('screen');

    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' }
    });

    return buffer;
  } finally {
    await browser.close();
  }
}

/**
 * 領収書テンプレをサーバ側で描画し、PDFを返す（バッファ）
 * 事前に (1) fetchInvoiceData が実装済みであることを想定
 *
 * @param {Object} opts
 * @param {string} opts.orderNo - 注文番号
 * @param {string} opts.baseUrl - 相対パス解決用ベースURL（例: `${req.protocol}://${req.get('host')}/`）
 * @returns {Promise<Buffer>}
 */
async function generateInvoicePdf({ orderNo, baseUrl, userId }) {
  // ① データ取得（手順(1)で実装した関数を利用）
  const { order, buyer, seller, sellerPartner, shippingAddress, billingAddress, items, summary } =
    await fetchInvoiceData(dbQuery, { orderNo, userId });

  // ② EJS レンダリング（手順(2)のテンプレを使用）
  const html = await ejs.renderFile(
    path.join(__dirname, 'views', 'invoices', 'invoice.ejs'),
    { order, buyer, seller, sellerPartner, shippingAddress, billingAddress, items, summary },
    { async: true }
  );

  // ③ Puppeteer で PDF 化
  const pdfBuffer = await htmlToPdfBuffer(html, baseUrl);
  return pdfBuffer;
}


/* ================================
 *  ④ 領収書PDF ルート
 *  GET /orders/:no/invoice.pdf
 * ============================== */
app.get('/orders/:no/invoice.pdf', requireAuth, async (req, res, next) => {
  try {
    const orderNo = String(req.params.no || '').trim();
    if (!orderNo) return res.status(400).send('Bad Request');

    // 相対パスの静的資産（/css/invoice.css 等）を解決するための baseUrl
    const baseUrl = `${req.protocol}://${req.get('host')}/`;

    // 手順(3)で作ったユーティリティを呼び出し
    const pdfBuffer = await generateInvoicePdf({
      orderNo,
      baseUrl,
      userId: req.session.user.id, // ← 忘れずに
    });

    // ヘッダ（inline 表示。ダウンロードさせたい場合は attachment に）
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${orderNo}.pdf"`);
    // キャッシュは念のため抑止
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    res.send(pdfBuffer);
  } catch (err) {
    console.error('invoice.pdf error:', err);
    if (err.code === 'NOT_FOUND') return res.status(404).render('errors/404', { title: '領収書が見つかりません' });
    next(err);
  }
});

/* ================================
 *  ⑤ 納品書PDF ルート
 *  GET /orders/:no/delivery-note.pdf
 * ============================== */
app.get('/orders/:no/delivery-note.pdf', requireAuth, async (req, res, next) => {
  try {
    const orderNo = String(req.params.no || '').trim();
    if (!orderNo) return res.status(400).send('Bad Request');

    // クエリパラメータで価格表示ON/OFF（デフォルトOFF）
    const showPrice = req.query.showPrice === '1' || req.query.showPrice === 'true';

    const baseUrl = `${req.protocol}://${req.get('host')}/`;

    const pdfBuffer = await generateDeliveryNotePdf({
      orderNo,
      baseUrl,
      userId: req.session.user.id,
      showPrice
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="delivery-note-${orderNo}.pdf"`);
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    res.send(pdfBuffer);
  } catch (err) {
    console.error('delivery-note.pdf error:', err);
    if (err.code === 'NOT_FOUND' || err.code === 'ORDER_NOT_FOUND') {
      return res.status(404).render('errors/404', { title: '納品書が見つかりません' });
    }
    next(err);
  }
});

/* ================================
 *  ⑥ 納品書PDF ルート（管理者/出品者用）
 *  GET /admin/orders/:no/delivery-note.pdf
 * ============================== */
app.get('/admin/orders/:no/delivery-note.pdf', requireAuth, requireRole(['admin', 'seller']), async (req, res, next) => {
  try {
    const orderNo = String(req.params.no || '').trim();
    if (!orderNo) return res.status(400).send('Bad Request');

    // クエリパラメータで価格表示ON/OFF（デフォルトOFF）
    const showPrice = req.query.showPrice === '1' || req.query.showPrice === 'true';

    const baseUrl = `${req.protocol}://${req.get('host')}/`;

    // 管理者/出品者は全ての注文の納品書を発行可能
    // ただし、出品者は自分が出品した商品の注文のみに制限することも可能
    // ここでは簡易的に全ての注文を許可（必要に応じて権限チェックを追加）
    const pdfBuffer = await generateDeliveryNotePdf({
      orderNo,
      baseUrl,
      userId: req.session.user.id,
      showPrice
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="delivery-note-${orderNo}.pdf"`);
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    res.send(pdfBuffer);
  } catch (err) {
    console.error('admin delivery-note.pdf error:', err);
    if (err.code === 'NOT_FOUND' || err.code === 'ORDER_NOT_FOUND') {
      return res.status(404).render('errors/404', { title: '納品書が見つかりません' });
    }
    next(err);
  }
});

// ===== R2 helpers (URL & assets table) =====
function r2PublicUrlFromKey(key) {
  if (!key) return '';
  if (typeof R2_PUBLIC_BASE_URL === 'string' && R2_PUBLIC_BASE_URL) {
    return `${R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
  }
  const base = (process.env.R2_ENDPOINT || '').replace(/^https?:\/\//, 'https://');
  return `${base}/${R2_BUCKET}/${key}`;
}

async function ensureR2AssetsTable() {
  // Keep it lightweight and idempotent
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS r2_assets (
      key         TEXT PRIMARY KEY,
      sha256      TEXT,
      mime        TEXT,
      bytes       INTEGER,
      width       INTEGER,
      height      INTEGER,
      seller_id   UUID,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS r2_assets_sha256_idx ON r2_assets(sha256);
    CREATE INDEX IF NOT EXISTS r2_assets_seller_idx ON r2_assets(seller_id);
  `);
}

async function findAssetByHash(sha256, { sellerId = null } = {}) {
  if (!sha256) return null;
  await ensureR2AssetsTable();
  const rows = await dbQuery(
    `SELECT key, sha256, mime, bytes, width, height, seller_id
       FROM r2_assets
      WHERE sha256 = $1
        ${sellerId ? 'AND (seller_id IS NULL OR seller_id = $2::uuid)' : ''}
      ORDER BY created_at DESC
      LIMIT 1`,
    sellerId ? [sha256, sellerId] : [sha256]
  );
  return rows[0] || null;
}

async function upsertAsset({ key, sha256=null, mime=null, bytes=null, width=null, height=null, sellerId=null }) {
  await ensureR2AssetsTable();
  const rows = await dbQuery(
    `INSERT INTO r2_assets (key, sha256, mime, bytes, width, height, seller_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7::uuid)
     ON CONFLICT (key) DO UPDATE SET
       sha256 = COALESCE(EXCLUDED.sha256, r2_assets.sha256),
       mime   = COALESCE(EXCLUDED.mime,   r2_assets.mime),
       bytes  = COALESCE(EXCLUDED.bytes,  r2_assets.bytes),
       width  = COALESCE(EXCLUDED.width,  r2_assets.width),
       height = COALESCE(EXCLUDED.height, r2_assets.height),
       seller_id = COALESCE(EXCLUDED.seller_id, r2_assets.seller_id)
     RETURNING key, sha256, mime, bytes, width, height, seller_id`,
    [key, sha256, mime, bytes, width, height, sellerId]
  );
  return rows[0];
}

app.post('/uploads/sign', requireAuth /* 任意: requireRole('seller') */, async (req, res, next) => {
  try {
    const { mime, ext: extFromClient, productId, sha256, bytes: rawBytes, width: rawW, height: rawH } = req.body || {};
    const m = String(mime || '').toLowerCase();

    if (!ALLOWED_IMAGE_MIME.has(m)) {
      return res.status(400).json({ ok:false, message:'このMIMEタイプはアップロードできません。' });
    }
    const ext = EXT_BY_MIME[m] || String(extFromClient || '').replace(/^\./,'').toLowerCase() || 'jpg';

    const sellerId = req.session?.user?.id || null;

    // ---- 1) 既存アセットをハッシュで検索（重複回避） ----
    if (sha256) {
      try {
        const hit = await findAssetByHash(String(sha256).toLowerCase(), { sellerId });
        if (hit && hit.key) {
          const url = r2PublicUrlFromKey(hit.key);
          return res.json({
            ok: true,
            exists: true,
            image: {
              url,
              r2_key: hit.key,
              bytes: Number(hit.bytes || 0),
              mime: hit.mime || m,
              width: Number(hit.width || rawW || 0) || null,
              height: Number(hit.height || rawH || 0) || null,
            }
          });
        }
      } catch (_) {
        // テーブル未作成などは無視して通常フローへ
      }
    }

    // ---- 2) 新規アップロード用の署名を発行 ----
    if (!isR2Configured || !r2) {
      return res.status(503).json({ ok: false, message: 'R2ストレージが設定されていません。' });
    }

    const key = buildR2Key({ scope: 'products', sellerId: sellerId || 'anon', productId, ext });

    const cmd = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: m,
    });

    const putUrl = await getSignedUrl(r2, cmd, { expiresIn: 60 * 5 }); // 5分
    res.json({
      ok: true,
      key,
      putUrl,
      // クライアントはこの sha256 を confirm 時にも送ってくれるとサーバでも保存可能
      sha256: sha256 ? String(sha256).toLowerCase() : null
    });
  } catch (e) { next(e); }
});

app.post('/uploads/confirm', requireAuth /* 任意: requireRole('seller') */, async (req, res, next) => {
  try {
    const { key, productId, alt, sha256, mime: mimeFromClient, bytes: bytesFromClient, width: wFromClient, height: hFromClient } = req.body || {};
    if (!key) return res.status(400).json({ ok:false, message:'key が必要です。' });

    // R2に存在するか軽く確認（HeadObject）
    if (!isR2Configured || !r2) {
      return res.status(503).json({ ok: false, message: 'R2ストレージが設定されていません。' });
    }

    let head = null;
    try {
      head = await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    } catch {
      return res.status(404).json({ ok:false, message:'R2にオブジェクトが見つかりません。' });
    }

    // メタ確定
    const bytes = Number(bytesFromClient ?? head.ContentLength ?? 0) || null;
    const mime  = String(mimeFromClient ?? head.ContentType ?? '') || null;
    const width  = Number(wFromClient || 0) || null;
    const height = Number(hFromClient || 0) || null;
    const sellerId = req.session?.user?.id || null;

    // 公開URL
    const url = r2PublicUrlFromKey(key);

    // r2_assets に登録（または更新）
    try {
      await upsertAsset({
        key,
        sha256: sha256 ? String(sha256).toLowerCase() : null,
        mime, bytes, width, height,
        sellerId
      });
    } catch (e) {
      // 失敗してもアップロード自体は成功扱いにし、以降の処理を進める
      console.warn('upsertAsset failed:', e.message);
    }

    // productId があれば product_images へリンク（重複行は作らない）
    if (productId) {
      // まず同一商品 × 同一URL or 同一r2_key の既存行をチェック
      const existSame = await dbQuery(
        `SELECT id, url, position, alt, r2_key
           FROM product_images
          WHERE product_id = $1::uuid
            AND (url = $2 OR r2_key = $3)
          LIMIT 1`,
        [productId, url, key]
      );
      if (existSame.length) {
        return res.json({ ok:true, image: existSame[0], existed: true });
      }

      // 他商品で使用されているかをチェック（r2_key はユニーク制約のため）
      const existOther = await dbQuery(
        `SELECT id, product_id, url, position, alt, r2_key
           FROM product_images
          WHERE r2_key = $1
          LIMIT 1`,
        [key]
      );

      // 末尾 position を取得
      const posRow = await dbQuery(
        `SELECT COALESCE(MAX(position), -1) AS maxp
           FROM product_images
          WHERE product_id = $1::uuid`,
        [productId]
      );
      const pos = Number(posRow?.[0]?.maxp || -1) + 1;

      if (existOther.length) {
        // 既に別の商品で使われている場合：
        // product_images.r2_key にユニーク制約があるため INSERT はできない。
        // ここでは例外を出さずに 409 を返し、フロントで案内する。
        return res.status(409).json({
          ok: false,
          code: 'R2_KEY_IN_USE',
          message: 'この画像は他の商品で使用されています（重複登録は不可）。画像を共有したい場合はスキーマの一意制約を (product_id, r2_key) に変更するか、別キーでの保存をご検討ください。',
          // 情報は返すので UI 側でプレビューは可能
          image: {
            url,
            r2_key: key,
            position: pos,
            alt: alt || null
          }
        });
      }

      // ここまで来たら新規登録してもユニーク制約には抵触しない
      // さらに DB レベルでも競合を抑止して安全にする（発生しても衝突時は既存行を返す）
      const ins = await dbQuery(
        `
        INSERT INTO product_images (product_id, url, position, alt, r2_key, mime, bytes)
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
        ON CONFLICT ON CONSTRAINT product_images_r2_key_key DO NOTHING
        RETURNING id, url, position, alt, r2_key
        `,
        [productId, url, pos, (alt || null), key, (mime || null), (bytes || null)]
      );

      if (ins.length) {
        return res.json({ ok:true, image: ins[0] });
      }

      // 万一同時実行で先に入った場合は取り直す（この時点では同一商品に存在しているはず）
      const after = await dbQuery(
        `SELECT id, url, position, alt, r2_key
           FROM product_images
          WHERE product_id = $1::uuid AND r2_key = $2
          LIMIT 1`,
        [productId, key]
      );
      if (after.length) {
        return res.json({ ok:true, image: after[0], existed: true });
      }

      // ここまでで取得できないのは想定外だが、安全に 409 を返す
      return res.status(409).json({
        ok: false,
        code: 'RACE_CONDITION',
        message: '画像の登録中に競合が発生しました。もう一度お試しください。'
      });
    }

    // 単なるアップロードだけ（商品紐付けは後で）
    return res.json({ ok:true, url, key, bytes, mime, width, height });
  } catch (e) { next(e); }
});

// 画像ライブラリ（既存R2資産）: GET /uploads/library?q=&page=
app.get('/uploads/library', requireAuth /* 任意: requireRole('seller') */, async (req, res, next) => {
  try {
    await ensureR2AssetsTable();

    const sellerId = req.session?.user?.id || null;
    if (!sellerId) return res.status(401).json({ ok:false, message:'unauthorized' });

    const q = String(req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(60, Math.max(1, parseInt(req.query.pageSize, 10) || 40));
    const offset = (page - 1) * pageSize;

    const where = ['seller_id = $1::uuid'];
    const params = [sellerId];

    if (q) {
      params.push(`%${q}%`);
      where.push(`(key ILIKE $${params.length} OR mime ILIKE $${params.length})`);
    }

    const sql = `
      SELECT key, sha256, mime, bytes, width, height, created_at
        FROM r2_assets
       WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}
    `;
    const rows = await dbQuery(sql, params);

    const items = rows.map(r => ({
      url: r2PublicUrlFromKey(r.key),
      r2_key: r.key,
      bytes: Number(r.bytes || 0),
      mime: r.mime || null,
      width: Number(r.width || 0) || null,
      height: Number(r.height || 0) || null,
      created_at: r.created_at
    }));

    // 次ページ有無を軽く推定（厳密に数え上げたい場合は COUNT(*) を別途）
    const nextPage = items.length === pageSize ? (page + 1) : null;

    return res.json({ ok:true, items, nextPage });
  } catch (e) { next(e); }
});

// admin用ページ群
/* =========================================================
 * 管理：お問い合わせ一覧
 * GET /admin/contacts?q&status=&type=&page=
 * =======================================================*/
app.get('/admin/contacts',
  requireAuth,
  requireRole(['admin']),
  async (req, res, next) => {
    try {
      const { q = '', status = 'all', type = 'all', page = 1 } = req.query;
      const pageNum = Math.max(1, toInt(page, 1));
      const pageSize = 20;
      const offset = (pageNum - 1) * pageSize;

      const where = ['1=1'];
      const params = [];
      if (q) {
        params.push(`%${q}%`);
        where.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length} OR message ILIKE $${params.length})`);
      }
      if (status !== 'all') {
        params.push(status);
        where.push(`status = $${params.length}`);
      }
      if (type !== 'all') {
        params.push(type);
        where.push(`type = $${params.length}`);
      }

      const total = (await dbQuery(
        `SELECT COUNT(*)::int AS cnt FROM contacts WHERE ${where.join(' AND ')}`,
        params
      ))[0]?.cnt || 0;

      const whereSql = (where && where.length) ? where.join(' AND ') : 'TRUE';

      // 末尾に LIMIT / OFFSET をパラメータで追加
      const paramsWithPage = [...params, pageSize, offset];

      const list = await dbQuery(
        `
        SELECT
          c.id,
          c.name,
          c.email,
          c.type,
          c.status,
          c.category,
          c.subject,
          c.created_at,
          c.handled_by,
          c.handled_at,
          COALESCE(ol.label_ja, c.category::text) AS category_ja,
          u.name AS handled_name
        FROM contacts AS c
        LEFT JOIN users AS u
          ON u.id = c.handled_by
        LEFT JOIN option_labels AS ol
          ON ol.category = 'contact_category'
        AND ol.value = c.category::text
        AND ol.active = TRUE
        WHERE ${whereSql}
        ORDER BY c.created_at DESC
        LIMIT $${paramsWithPage.length - 1} OFFSET $${paramsWithPage.length}
        `,
        paramsWithPage
      );

      const pagination = { page: pageNum, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
      const buildQuery = buildQueryPath('/admin/contacts', { q, status, type });

      res.render('admin/contacts/index', {
        title: 'お問い合わせ一覧',
        items: list,
        total, q, status, type,
        pagination, buildQuery,
      });
    } catch (e) { next(e); }
  }
);

/* =========================================================
 * 管理：お問い合わせ詳細
 * GET /admin/contacts/:id
 * =======================================================*/
app.get(
  '/admin/contacts/:id',
  requireAuth,
  requireRole(['admin']),
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();

      // お問い合わせ本体
      const rows = await dbQuery(
        `SELECT * FROM contacts WHERE id = $1::uuid LIMIT 1`,
        [id]
      );
      const c = rows[0];
      if (!c) {
        return res
          .status(404)
          .render('errors/404', { title: '見つかりません' });
      }

      const category_ja = jaLabel('contact_category', c.category) || null;

      // 担当者情報
      let handler = null;
      if (c.handled_by) {
        const u = await dbQuery(
          `SELECT id, name, email FROM users WHERE id = $1`,
          [c.handled_by]
        );
        handler = u[0] || null;
      }

      // お問い合わせに紐づくユーザー（あれば）
      let contactUser = null;
      if (c.user_id) {
        const u = await dbQuery(
          `SELECT id, name, email FROM users WHERE id = $1`,
          [c.user_id]
        );
        contactUser = u[0] || null;
      }

      // チャットメッセージ一覧
      // contact_messages テーブル想定:
      // id, contact_id, sender_type('user'|'admin'), sender_id, body, created_at
      const messages = await dbQuery(
        `
        SELECT
          m.id,
          m.contact_id,
          m.sender_type,
          m.sender_id,
          m.body,
          m.created_at,
          u.name AS sender_name
        FROM contact_messages AS m
        LEFT JOIN users AS u
          ON u.id = m.sender_id
        WHERE m.contact_id = $1::uuid
        ORDER BY m.created_at ASC
        `,
        [id]
      );

      res.render('admin/contacts/show', {
        title: 'お問い合わせ詳細',
        item: c,
        handler,
        category_ja,
        contactUser,
        messages,
      });
    } catch (e) {
      next(e);
    }
  }
);

/* =========================================================
 * 管理：状態更新（対応開始/完了など）
 * POST /admin/contacts/:id/status  {status: open|in_progress|closed}
 * =======================================================*/
app.post(
  '/admin/contacts/:id/status',
  requireAuth,
  requireRole(['admin']),
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      const nextStatus = String(req.body.status || '');

      if (!['open', 'in_progress', 'closed'].includes(nextStatus)) {
        return res
          .status(400)
          .json({ ok: false, message: '不正な状態です。' });
      }

      // 対応者・対応日時の扱い
      let handledBy = null;
      let handledAt = null;
      if (nextStatus === 'in_progress' || nextStatus === 'closed') {
        handledBy = req.session.user.id;
        handledAt = new Date();
      }

      await dbQuery(
        `
        UPDATE contacts
           SET status     = $1,
               handled_by = $2,
               handled_at = $3,
               updated_at = now()
         WHERE id = $4::uuid
        `,
        [nextStatus, handledBy, handledAt, id]
      );

      // fetch(XHR) の場合: JSON を返す
      if (wantsJSON(req)) {
        return res.json({ ok: true, status: nextStatus });
      }

      // 通常フォーム POST の場合: 画面リダイレクト
      res.redirect(`/admin/contacts/${id}`);
    } catch (e) {
      next(e);
    }
  }
);

/* =========================================================
 * 管理：お問い合わせチャット（管理者 → ユーザー）
 * POST /admin/contacts/:id/messages  { body }
 * =======================================================*/
app.post(
  '/admin/contacts/:id/messages',
  requireAuth,
  requireRole(['admin']),
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      const body = String((req.body && req.body.body) || '').trim();

      if (!body) {
        return res
          .status(400)
          .json({ ok: false, message: 'メッセージ本文を入力してください。' });
      }

      // 対象のお問い合わせが存在するかチェック
      const contacts = await dbQuery(
        `
        SELECT
          id,
          status,
          subject,
          category,
          email,
          user_id
        FROM contacts
        WHERE id = $1::uuid
        LIMIT 1
        `,
        [id]
      );
      const contact = contacts[0];
      if (!contact) {
        return res
          .status(404)
          .json({ ok: false, message: 'お問い合わせが見つかりません。' });
      }

      const adminUserId = req.session.user.id;

      // メッセージ登録
      const inserted = await dbQuery(
        `
        INSERT INTO contact_messages (contact_id, sender_type, sender_id, body)
        VALUES ($1::uuid, 'admin', $2, $3)
        RETURNING id, contact_id, sender_type, sender_id, body, created_at
        `,
        [id, adminUserId, body]
      );
      const message = inserted[0];

      // 初回返信などの場合、自動でステータスを in_progress に寄せる（open のときだけ）
      if (contact.status === 'open') {
        await dbQuery(
          `
          UPDATE contacts
             SET status     = 'in_progress',
                 handled_by = $1,
                 handled_at = COALESCE(handled_at, now()),
                 updated_at = now()
           WHERE id = $2::uuid
          `,
          [adminUserId, id]
        );
      } else {
        // 返信があったので最終更新のみ更新
        await dbQuery(
          `UPDATE contacts SET updated_at = now() WHERE id = $1::uuid`,
          [id]
        );
      }

      try {
        // ログインユーザーに紐づく問い合わせでない場合は通知不要
        if (contact.user_id) {
          const subject = contact.subject || 'お問い合わせ';
          const categoryJa = jaLabel
            ? (jaLabel('contact_category', contact.category) || contact.category)
            : contact.category;

          const title = `「${subject}」への返信があります`;
          const bodyText =
`お問い合わせ「${subject}」に対して、サポートより返信が届いています。

カテゴリ: ${categoryJa}
最新メッセージ:
${body.length > 120 ? body.slice(0, 120) + '…' : body}

詳細はマイページのお問い合わせ履歴からご確認ください。`;

          const linkUrl = `/my/contacts/${contact.id}`;

          // notifications に1件作成
          const nRows = await dbQuery(
            `
            INSERT INTO notifications (type, title, body, link_url, visible_from)
            VALUES ($1, $2, $3, $4, now())
            RETURNING id
            `,
            ['contact_reply', title, bodyText, linkUrl]
          );
          const notificationId = nRows[0]?.id;
          if (notificationId) {
            // 対象ユーザー用ターゲットを作成
            await dbQuery(
              `
              INSERT INTO notification_targets (notification_id, user_id)
              VALUES ($1::uuid, $2::uuid)
              `,
              [notificationId, contact.user_id]
            );
          }
        }
      } catch (notifyErr) {
        // 通知に失敗してもチャット自体は成功扱いにする
        console.warn('contact reply notification failed:', notifyErr.message);
      }

      return res.json({ ok: true, message });
    } catch (e) {
      next(e);
    }
  }
);

// 取引先向け配送・送料サマリをロード
async function loadShippingSummaryForPartner(partnerId) {
  const rows = await dbQuery(
    `SELECT scope, prefecture, city, shipping_fee, can_ship
       FROM seller_shipping_rules
      WHERE seller_id = $1::uuid
      ORDER BY scope, prefecture NULLS FIRST, city NULLS FIRST`,
    [partnerId]
  );
  if (!rows.length) {
    return { hasAny: false };
  }

  const globalRule      = rows.find(r => r.scope === 'all') || null;
  const prefectureRules = rows.filter(r => r.scope === 'prefecture');
  const cityRules       = rows.filter(r => r.scope === 'city');

  let globalLabel = '全国一律は未設定です。';
  if (globalRule) {
    if (!globalRule.can_ship) {
      globalLabel = '全国配送不可（個別地域のみ配送）';
    } else if (globalRule.shipping_fee == null) {
      globalLabel = '全国配送可（送料未設定）';
    } else {
      globalLabel = `全国一律 ${globalRule.shipping_fee}円`;
    }
  }

  return {
    hasAny: true,
    globalRule,
    globalLabel,
    prefectureRules,
    cityRules
  };
}

// 取引先一覧
// GET /admin/partners
app.get('/admin/partners', requireAuth, requireRole(['admin']), async (req, res, next) => {
  try {
    const q        = (req.query.q || '').trim();
    const type     = (req.query.type || '').trim();
    const status   = (req.query.status || '').trim();
    const sort     = (req.query.sort || 'recent').trim();

    const page     = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage  = 20;
    const offset   = (page - 1) * perPage;

    // WHERE
    const conds = [`1=1`];
    const params = [];
    let p = 1;

    if (q) {
      conds.push(`(p.name ILIKE $${p} OR p.kana ILIKE $${p} OR p.email ILIKE $${p})`);
      params.push(`%${q}%`); p++;
    }
    if (type)   { conds.push(`p.type = $${p++}`);   params.push(type); }
    if (status) { conds.push(`p.status = $${p++}`); params.push(status); }

    // ORDER
    const order = ({
      recent:     `p.created_at DESC`,
      updated:    `p.updated_at DESC`,
      name_asc:   `p.name ASC`,
      name_desc:  `p.name DESC`,
    })[sort] || `p.created_at DESC`;

    // COUNT
    const totalRows = await dbQuery(
      `SELECT COUNT(*)::int AS n FROM partners p WHERE ${conds.join(' AND ')}`,
      params
    );
    const total = totalRows[0].n;

    // DATA（ユーザー数をJOIN集計）
    const data = await dbQuery(
      `
      SELECT p.*,
             COALESCE(u.cnt,0) AS user_count
        FROM partners p
        LEFT JOIN (
          SELECT partner_id, COUNT(*)::int AS cnt
            FROM users
           WHERE partner_id IS NOT NULL
           GROUP BY partner_id
        ) u ON u.partner_id = p.id
       WHERE ${conds.join(' AND ')}
       ORDER BY ${order}
       LIMIT ${perPage} OFFSET ${offset}
      `,
      params
    );

    res.render('admin/partners/index', {
      title: '取引先',
      pageTitle: '取引先一覧',
      q, type, status, sort,
      partners: data,
      page, perPage, total, totalPages: Math.max(1, Math.ceil(total/perPage)),
      request: req, // レイアウト内のクリアリンク等で参照
    });
  } catch (e) { next(e); }
});

// 取引先詳細
app.get(
  '/admin/partners/:id',
  requireAuth,
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!isUuid(id)) {
        return res.status(400).render('errors/404', { title: '不正なID' });
      }

      // 権限：管理者 or その取引先メンバー
      const isMember = await isMemberOfPartner(req, id);
      if (!isAdmin(req) && !isMember) {
        return res.status(403).send('forbidden');
      }

      // 取引先
      const partners = await dbQuery(
        `SELECT
           id, name, kana, type, status, email, phone, website,
           billing_email, billing_terms, tax_id,
           postal_code, prefecture, city, address1, address2,
           note, icon_url, icon_r2_key, pickup_address_id, created_at, updated_at,
           stripe_account_id, stripe_account_type, stripe_charges_enabled, stripe_payouts_enabled,
           stripe_details_submitted, charges_enabled, payouts_enabled, debt_cents, stop_reason,
           requirements_due_by
         FROM partners
         WHERE id = $1::uuid
         LIMIT 1`,
        [id]
      );
      const partner = partners[0];
      if (!partner) {
        return res.status(404).render('errors/404', { title: '取引先が見つかりません' });
      }

      // 紐づくユーザー
      const users = await dbQuery(
        `SELECT id, name, email, roles, created_at, updated_at
           FROM users
          WHERE partner_id = $1::uuid
          ORDER BY created_at DESC`,
        [id]
      );

      // 受け取り住所候補（このpartnerに紐づくユーザーが登録した住所）
      const userIds = users.map(u => u.id);
      let availableAddresses = [];
      if (userIds.length > 0) {
        const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
        availableAddresses = await dbQuery(
          `SELECT id, full_name, postal_code, prefecture, city, address_line1, address_line2, phone, is_default
             FROM addresses
            WHERE user_id IN (${placeholders})
              AND scope = 'user'
            ORDER BY is_default DESC, created_at DESC`,
          userIds
        );
      }

      // 現在設定されている受け取り住所
      let pickupAddress = null;
      if (partner.pickup_address_id) {
        const pickupAddrRows = await dbQuery(
          `SELECT id, full_name, postal_code, prefecture, city, address_line1, address_line2, phone
             FROM addresses
            WHERE id = $1::uuid
              AND user_id IN (${userIds.length > 0 ? userIds.map((_, i) => `$${i + 2}`).join(',') : 'NULL'})
              AND scope = 'user'
            LIMIT 1`,
          [partner.pickup_address_id, ...userIds]
        );
        pickupAddress = pickupAddrRows[0] || null;
      }

      const user = req.session.user; // ログイン中ユーザー（admin / seller 両対応）

      // 決済方法の取得（エラーハンドリングとデバッグログを追加）
      let allMethod = [];
      let partnerMethods = [];
      try {
        console.log(`[GET /admin/partners/:id] 決済方法取得開始: partnerId=${id}`);
        allMethod = await loadAllPaymentMethods('payment_method', 'payment_method');
        console.log(`[GET /admin/partners/:id] loadAllPaymentMethods 成功: 件数=${allMethod.length}`, allMethod.map(m => ({ value: m.value, label: m.label_ja })));
        
        partnerMethods = await getAllowedMethodsForPartner(id);
        console.log(`[GET /admin/partners/:id] getAllowedMethodsForPartner 成功: 件数=${partnerMethods.length}`, partnerMethods);
        
        if (allMethod.length === 0) {
          console.warn(`[GET /admin/partners/:id] 警告: 全決済方法が空です。DBにデータがない可能性があります。`);
        }
        if (partnerMethods.length === 0) {
          console.log(`[GET /admin/partners/:id] 情報: この取引先に許可された決済方法はまだ設定されていません。`);
        }
      } catch (err) {
        console.error('[GET /admin/partners/:id] 決済方法取得エラー:', err);
        console.error('[GET /admin/partners/:id] エラー詳細:', {
          message: err.message,
          stack: err.stack,
          partnerId: id
        });
        // エラーが発生しても空配列で続行
      }

      const { weekly, specials } = await loadPartnerAvailabilityForPartner(id); 
      const availabilitySummary = buildAvailabilitySummary(weekly, specials);

      const shippingSummary = await loadShippingSummaryForPartner(id);

      // 配送方法の取得
      let allShipMethod = [];
      let partnerShipMethods = [];
      try {
        allShipMethod = await loadAllShipMethods('ship_method', 'ship_method');
        partnerShipMethods = await getAllowedShipMethodsForPartner(id);
      } catch (err) {
        console.error('[GET /admin/partners/:id] 配送方法取得エラー:', err);
        // エラーが発生しても空配列で続行
      }

      // テンプレートに渡す前のデータ検証
      const finalPaymentMethods = partnerMethods || [];
      const finalAllPaymentMethods = allMethod || [];
      const finalShipMethods = partnerShipMethods || [];
      const finalAllShipMethods = allShipMethod || [];
      console.log(`[GET /admin/partners/:id] テンプレートに渡すデータ:`, {
        allPaymentMethodsCount: finalAllPaymentMethods.length,
        paymentMethodsCount: finalPaymentMethods.length,
        paymentMethods: finalPaymentMethods,
        allPaymentMethodsSample: finalAllPaymentMethods.slice(0, 3).map(m => ({ value: m.value, label: m.label_ja })),
        allShipMethodsCount: finalAllShipMethods.length,
        shipMethodsCount: finalShipMethods.length,
        shipMethods: finalShipMethods
      });

      res.render('admin/partners/show', {
        title: `取引先詳細 | ${partner.name}`,
        partner,
        users,
        user,
        isMember,
        paymentMethods: finalPaymentMethods,
        allPaymentMethods: finalAllPaymentMethods,
        shipMethods: finalShipMethods,
        allShipMethods: finalAllShipMethods,
        availabilitySummary,
        shippingSummary,
        availableAddresses,
        pickupAddress,
        csrfToken: (typeof req.csrfToken === 'function') ? req.csrfToken() : null
      });
    } catch (e) {
      next(e);
    }
  }
);

// 取引先の残高・台帳ページ
app.get(
  '/admin/partners/:id/balance',
  requireAuth,
  requireRole(['admin']),
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!isUuid(id)) {
        return res.status(400).render('errors/404', { title: '不正なID' });
      }

      const partners = await dbQuery(
        `SELECT
           id, name, stripe_account_id, debt_cents
         FROM partners
         WHERE id = $1::uuid
         LIMIT 1`,
        [id]
      );

      if (!partners.length) {
        return res.status(404).render('errors/404', { title: '取引先が見つかりません' });
      }

      res.render('admin/partners/balance', {
        title: partners[0].name + ' - 残高・台帳',
        partner: partners[0],
        user: req.session.user,
        csrfToken: req.csrfToken ? req.csrfToken() : null
      });
    } catch (e) {
      next(e);
    }
  }
);

// 取引先基本情報の更新（管理者 or 取引先メンバー）
app.post(
  '/admin/partners/:id/edit',
  requireAuth,
  csrfProtect,
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!isUuid(id)) {
        return res.status(400).render('errors/404', { title: '不正なID' });
      }

      // 権限：管理者 or その取引先メンバー
      const isMember = await isMemberOfPartner(req, id);
      if (!isAdmin(req) && !isMember) {
        return res.status(403).send('forbidden');
      }

      // フォームデータの取得とバリデーション
      const name = String(req.body.name || '').trim();
      if (!name) {
        return res.redirect(`/admin/partners/${id}?error=名称は必須です`);
      }

      const kana = String(req.body.kana || '').trim() || null;
      const type = String(req.body.type || '').trim() || null;
      const email = String(req.body.email || '').trim() || null;
      const phone = String(req.body.phone || '').trim() || null;
      const website = String(req.body.website || '').trim() || null;
      const tax_id = String(req.body.tax_id || '').trim() || null;
      const postal_code = String(req.body.postal_code || '').trim() || null;
      const prefecture = String(req.body.prefecture || '').trim() || null;
      const city = String(req.body.city || '').trim() || null;
      const address1 = String(req.body.address1 || '').trim() || null;
      const address2 = String(req.body.address2 || '').trim() || null;
      const note = String(req.body.note || '').trim() || null;
      const icon_url = String(req.body.icon_url || '').trim() || null;
      const icon_r2_key = String(req.body.icon_r2_key || '').trim() || null;
      const pickup_address_id = String(req.body.pickup_address_id || '').trim() || null;

      // pickup_address_idのバリデーション（該当partnerのユーザーが登録した住所か確認）
      let validPickupAddressId = null;
      if (pickup_address_id && isUuid(pickup_address_id)) {
        const users = await dbQuery(
          `SELECT id FROM users WHERE partner_id = $1::uuid`,
          [id]
        );
        const userIds = users.map(u => u.id);
        if (userIds.length > 0) {
          const placeholders = userIds.map((_, i) => `$${i + 2}`).join(',');
          const addrCheck = await dbQuery(
            `SELECT id FROM addresses
             WHERE id = $1::uuid
               AND user_id IN (${placeholders})
               AND scope = 'user'
             LIMIT 1`,
            [pickup_address_id, ...userIds]
          );
          if (addrCheck.length > 0) {
            validPickupAddressId = pickup_address_id;
          }
        }
      }

      // 更新実行
      const result = await dbQuery(
        `UPDATE partners
         SET
           name = $1,
           kana = $2,
           type = $3,
           email = $4,
           phone = $5,
           website = $6,
           tax_id = $7,
           postal_code = $8,
           prefecture = $9,
           city = $10,
           address1 = $11,
           address2 = $12,
           note = $13,
           icon_url = $14,
           icon_r2_key = $15,
           pickup_address_id = $16,
           updated_at = now()
         WHERE id = $17::uuid
         RETURNING id`,
        [name, kana, type, email, phone, website, tax_id, postal_code, prefecture, city, address1, address2, note, icon_url, icon_r2_key, validPickupAddressId, id]
      );

      if (!result.length) {
        return res.status(404).render('errors/404', { title: '取引先が見つかりません' });
      }

      // 更新後、詳細ページにリダイレクト
      return res.redirect(`/admin/partners/${id}`);
    } catch (e) {
      next(e);
    }
  }
);

// 有効/無効トグル
app.post(
  '/admin/partners/:id/status',
  requireAuth,
  requireRole(['admin']),
  csrfProtect,
  async (req, res, next) => {
    const id = String(req.params.id || '').trim();
    if (!isUuid(id)) return res.status(400).json({ ok:false, message: 'invalid id' });

    // 受領値（active/inactive の2値に限定）
    const nextStatus = (req.body?.status || '').trim();
    if (!['active','inactive'].includes(nextStatus)) {
      return res.status(422).json({ ok:false, message: 'invalid status' });
    }

    try {
      const r = await dbQuery(
        `UPDATE partners
            SET status = $1, updated_at = now()
          WHERE id = $2::uuid
          RETURNING id, status`,
        [nextStatus, id]
      );

      const partners = await dbQuery(
        `SELECT
           id, name, kana, type, status, email, phone, website,
           billing_email, billing_terms, tax_id,
           postal_code, prefecture, city, address1, address2,
           note, icon_url, icon_r2_key, pickup_address_id, created_at, updated_at
         FROM partners
         WHERE id = $1::uuid
         LIMIT 1`,
        [id]
      );
      const partner = partners[0];
      if (!partner || !r.length) {
        return res.status(404).json({ ok:false, message:'not found' });
      }

      // 紐づくユーザー
      const users = await dbQuery(
        `SELECT id, name, email, roles, created_at, updated_at
           FROM users
          WHERE partner_id = $1::uuid
          ORDER BY created_at DESC`,
        [id]
      );

      // 受け取り住所候補（このpartnerに紐づくユーザーが登録した住所）
      const userIds = users.map(u => u.id);
      let availableAddresses = [];
      if (userIds.length > 0) {
        const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
        availableAddresses = await dbQuery(
          `SELECT id, full_name, postal_code, prefecture, city, address_line1, address_line2, phone, is_default
             FROM addresses
            WHERE user_id IN (${placeholders})
              AND scope = 'user'
            ORDER BY is_default DESC, created_at DESC`,
          userIds
        );
      }

      // 現在設定されている受け取り住所
      let pickupAddress = null;
      if (partner.pickup_address_id) {
        const pickupAddrRows = await dbQuery(
          `SELECT id, full_name, postal_code, prefecture, city, address_line1, address_line2, phone
             FROM addresses
            WHERE id = $1::uuid
              AND user_id IN (${userIds.length > 0 ? userIds.map((_, i) => `$${i + 2}`).join(',') : 'NULL'})
              AND scope = 'user'
            LIMIT 1`,
          [partner.pickup_address_id, ...userIds]
        );
        pickupAddress = pickupAddrRows[0] || null;
      }

      const user = req.session.user; // ログイン中ユーザー（admin / seller 両対応）
      const isMember = await isMemberOfPartner(req, id);

      // 決済方法の取得
      let allMethod = [];
      let partnerMethods = [];
      try {
        allMethod = await loadAllPaymentMethods('payment_method', 'payment_method');
        partnerMethods = await getAllowedMethodsForPartner(id);
      } catch (err) {
        console.error('[POST /admin/partners/:id/status] 決済方法取得エラー:', err);
        // エラーが発生しても空配列で続行
      }

      const { weekly, specials } = await loadPartnerAvailabilityForPartner(id); 
      const availabilitySummary = buildAvailabilitySummary(weekly, specials);

      const shippingSummary = await loadShippingSummaryForPartner(id);

      res.render('admin/partners/show', {
        title: `取引先詳細 | ${partner.name}`,
        partner,
        users,
        user,
        isMember,
        paymentMethods: partnerMethods || [],
        allPaymentMethods: allMethod || [],
        availabilitySummary,
        shippingSummary,
        availableAddresses,
        pickupAddress,
        csrfToken: (typeof req.csrfToken === 'function') ? req.csrfToken() : null
      });
    } catch (e) {
      next(e);
    }
  }
);

// 取引先 決済方法の更新（管理者 or 取引先メンバー）
app.post(
  '/admin/partners/:id/payments',
  requireAuth, csrfProtect,
  async (req, res, next) => {
    try {
      const partnerId = String(req.params.id || '').trim();
      const isAjax = req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest' || req.get('Accept')?.includes('application/json');

      if (!isUuid(partnerId)) {
        if (isAjax) {
          return res.status(400).json({ ok: false, message: '無効な取引先IDです。' });
        }
        return res.status(400).send('bad partner id');
      }

      // 権限：管理者 or その取引先メンバー
      if (!isAdmin(req) && !(await isMemberOfPartner(req, partnerId))) {
        if (isAjax) {
          return res.status(403).json({ ok: false, message: '権限がありません。' });
        }
        return res.status(403).send('forbidden');
      }

      // 受け取り（チェックボックス name="methods"）
      let allMethod = [];
      try {
        allMethod = await loadAllPaymentMethods('payment_method', 'payment_method');
      } catch (err) {
        console.error('[POST /admin/partners/:id/payments] 決済方法取得エラー:', err);
        if (isAjax) {
          return res.status(500).json({ ok: false, message: '決済方法の取得に失敗しました。' });
        }
        req.session.flash = { type: 'error', message: '決済方法の取得に失敗しました。' };
        return res.redirect(`/admin/partners/${partnerId}`);
      }
      const allCodes = allMethod.map(m => m.value);
      const methods = []
        .concat(req.body?.methods || [])
        .map(String).map(s=>s.trim())
        .filter(m => allCodes.includes(m));

      // ★ クレジットカード決済を有効化する場合、Stripe Connectアカウントの接続を確認
      if (methods.includes('card')) {
        const partnerRows = await dbQuery(
          `SELECT stripe_account_id, stripe_charges_enabled FROM partners WHERE id = $1::uuid`,
          [partnerId]
        );

        if (!partnerRows.length) {
          if (isAjax) {
            return res.status(404).json({ ok: false, message: '取引先が見つかりません。' });
          }
          return res.status(404).send('Partner not found');
        }

        const partner = partnerRows[0];
        const isStripeConnected = partner.stripe_account_id && partner.stripe_charges_enabled;

        if (!isStripeConnected) {
          const errorMessage = 'クレジットカード決済を有効化するには、Stripe Connectアカウントの接続が必要です。出品者詳細ページからStripeでの本人確認を行なって下さい。';

          if (isAjax) {
            return res.status(400).json({
              ok: false,
              message: errorMessage
            });
          }

          req.session.flash = {
            type: 'error',
            message: errorMessage
          };
          return res.redirect(`/admin/partners/${partnerId}`);
        }
      }

      // トランザクション
      await dbQuery('BEGIN');
      // 1) 取引先の既存を全削除 → 挿入（UPSERTでもOK）
      await dbQuery(`DELETE FROM partner_allowed_payment_methods WHERE partner_id=$1::uuid`, [partnerId]);

      if (methods.length) {
        const values = methods.map((m,i)=>`($1::uuid,$${i+2}::payment_method)`).join(',');
        await dbQuery(
          `INSERT INTO partner_allowed_payment_methods(partner_id, method)
           VALUES ${values}
           ON CONFLICT (partner_id, method) DO NOTHING`,
          [partnerId, ...methods]
        );
      }

      // 2) 同取引先に属するユーザーの「パートナー由来」設定を全て入れ替える
      //    - まず partner由来の行だけ削除
      await dbQuery(
        `DELETE FROM user_allowed_payment_methods
          WHERE user_id IN (SELECT id FROM users WHERE partner_id=$1::uuid)
            AND synced_from_partner = true`,
        [partnerId]
      );

      if (methods.length) {
        // 各ユーザーに partner由来 = true で挿入
        // ※行数は多くなりがちなので一括 INSERT VALUES (…) を生成
        const userRows = await dbQuery(
          `SELECT id FROM users WHERE partner_id=$1::uuid`,
          [partnerId]
        );
        if (userRows.length) {
          const tuples = [];
          const params = [/* 動的 */];
          let idx = 1;
          for (const u of userRows) {
            for (const m of methods) {
              tuples.push(`($${idx++}::uuid, $${idx++}::payment_method, true)`);
              params.push(u.id, m);
            }
          }
          await dbQuery(
            `INSERT INTO user_allowed_payment_methods(user_id, method, synced_from_partner)
             VALUES ${tuples.join(',')}
             ON CONFLICT (user_id, method)
             DO UPDATE SET synced_from_partner = EXCLUDED.synced_from_partner,
                           updated_at = now()`,
            params
          );
        }
      }

      await dbQuery('COMMIT');
      
      // 成功時のレスポンス
      // フラッシュメッセージをセッションに保存（AJAXリクエストでも保存）
      req.session.flash = { type:'ok', message:'決済方法を更新しました。' };
      
      if (isAjax) {
        return res.json({ ok: true, message: '決済方法を更新しました。' });
      }
      res.redirect(`/admin/partners/${partnerId}`);
    } catch (e) {
      await dbQuery('ROLLBACK').catch(()=>{});
      
      // エラー時のレスポンス
      const isAjax = req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest' || req.get('Accept')?.includes('application/json');
      if (isAjax) {
        console.error('[決済方法更新] エラー:', e);
        return res.status(500).json({
          ok: false,
          message: '決済方法の更新中にエラーが発生しました。'
        });
      }
      next(e);
    }
  }
);

// ========================
// 配送方法更新API (POST /admin/partners/:id/shipmethods)
// ========================
app.post(
  '/admin/partners/:id/shipmethods',
  requireAuth, csrfProtect,
  async (req, res, next) => {
    try {
      const partnerId = String(req.params.id || '').trim();
      const isAjax = req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest' || req.get('Accept')?.includes('application/json');

      if (!isUuid(partnerId)) {
        if (isAjax) {
          return res.status(400).json({ ok: false, message: '無効な取引先IDです。' });
        }
        return res.status(400).send('bad partner id');
      }

      // 権限：管理者 or その取引先メンバー
      if (!isAdmin(req) && !(await isMemberOfPartner(req, partnerId))) {
        if (isAjax) {
          return res.status(403).json({ ok: false, message: '権限がありません。' });
        }
        return res.status(403).send('forbidden');
      }

      // 受け取り（チェックボックス name="methods"）
      let allMethod = [];
      try {
        allMethod = await loadAllShipMethods('ship_method', 'ship_method');
      } catch (err) {
        console.error('[POST /admin/partners/:id/shipmethods] 配送方法取得エラー:', err);
        if (isAjax) {
          return res.status(500).json({ ok: false, message: '配送方法の取得に失敗しました。' });
        }
        req.session.flash = { type: 'error', message: '配送方法の取得に失敗しました。' };
        return res.redirect(`/admin/partners/${partnerId}`);
      }
      const allCodes = allMethod.map(m => m.value);
      const methods = []
        .concat(req.body?.methods || [])
        .map(String).map(s=>s.trim())
        .filter(m => allCodes.includes(m));

      // トランザクション
      await dbQuery('BEGIN');
      // 取引先の既存を全削除 → 挿入
      await dbQuery(`DELETE FROM partner_allowed_ship_methods WHERE partner_id=$1::uuid`, [partnerId]);

      if (methods.length) {
        const values = methods.map((m,i)=>`($1::uuid,$${i+2}::ship_method)`).join(',');
        await dbQuery(
          `INSERT INTO partner_allowed_ship_methods(partner_id, method)
           VALUES ${values}
           ON CONFLICT (partner_id, method) DO NOTHING`,
          [partnerId, ...methods]
        );
      }

      await dbQuery('COMMIT');

      // 成功時のレスポンス
      req.session.flash = { type:'ok', message:'配送方法を更新しました。' };

      if (isAjax) {
        return res.json({ ok: true, message: '配送方法を更新しました。' });
      }
      res.redirect(`/admin/partners/${partnerId}`);
    } catch (e) {
      await dbQuery('ROLLBACK').catch(()=>{});

      // エラー時のレスポンス
      const isAjax = req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest' || req.get('Accept')?.includes('application/json');
      if (isAjax) {
        console.error('[配送方法更新] エラー:', e);
        return res.status(500).json({
          ok: false,
          message: '配送方法の更新中にエラーが発生しました。'
        });
      }
      next(e);
    }
  }
);

// ========================
// 送金管理API
// ========================

// 送金対象注文のプレビュー（期間指定で集計）
app.get(
  '/admin/transfers/preview',
  requireAuth,
  async (req, res, next) => {
    try {
      // 権限チェック: 管理者のみ
      if (!isAdmin(req)) {
        return res.status(403).json({ ok: false, message: 'forbidden' });
      }

      const periodStart = req.query.period_start; // YYYY-MM-DD
      const periodEnd = req.query.period_end;     // YYYY-MM-DD

      if (!periodStart || !periodEnd) {
        return res.status(400).json({ ok: false, message: '期間を指定してください。' });
      }

      // 送金対象注文の取得
      // 条件: payment_method='card', payment_status='paid', transfer_status='pending'
      const orders = await dbQuery(
        `SELECT
           o.id, o.order_number, o.seller_id, o.total, o.created_at,
           u.name AS seller_name, u.partner_id
         FROM orders o
         LEFT JOIN users u ON u.id = o.seller_id
         WHERE o.payment_method = 'card'
           AND o.payment_status = 'paid'
           AND o.transfer_status = 'pending'
           AND o.created_at >= $1::date
           AND o.created_at < ($2::date + INTERVAL '1 day')
         ORDER BY u.partner_id, o.created_at`,
        [periodStart, periodEnd]
      );

      // 取引先ごとに集計
      const partnerMap = new Map();
      for (const order of orders) {
        const partnerId = order.partner_id;

        if (!partnerId) continue; // partner_idがない場合はスキップ

        if (!partnerMap.has(partnerId)) {
          partnerMap.set(partnerId, {
            partner_id: partnerId,
            partner_name: order.seller_name,
            order_count: 0,
            total_amount: 0,
            orders: []
          });
        }

        const partnerData = partnerMap.get(partnerId);
        partnerData.order_count++;
        partnerData.total_amount += order.total;
        partnerData.orders.push(order);
      }

      // 取引先名を取得
      const transferData = [];
      for (const [partnerId, data] of partnerMap) {
        const partnerInfo = await dbQuery(
          `SELECT name FROM partners WHERE id = $1::uuid`,
          [partnerId]
        );

        transferData.push({
          ...data,
          partner_name: partnerInfo.length ? partnerInfo[0].name : data.partner_name,
          platform_fee_rate: 0.00, // 手数料率（設定可能にする）
          platform_fee_amount: 0,
          transfer_amount: data.total_amount
        });
      }

      res.json({ ok: true, data: transferData });
    } catch (e) {
      next(e);
    }
  }
);

// 送金記録を作成（実際の送金は手動で行い、情報のみ記録）
app.post(
  '/admin/transfers',
  requireAuth,
  csrfProtect,
  async (req, res, next) => {
    try {
      // 権限チェック: 管理者のみ
      if (!isAdmin(req)) {
        return res.status(403).json({ ok: false, message: 'forbidden' });
      }

      const {
        partner_id,
        period_start,
        period_end,
        scheduled_date,
        order_ids,
        total_amount,
        platform_fee_rate,
        platform_fee_amount,
        transfer_amount,
        order_count
      } = req.body;

      // バリデーション
      if (!partner_id || !period_start || !period_end || !scheduled_date || !order_ids || !order_ids.length) {
        return res.status(400).json({ ok: false, message: '必須項目が不足しています。' });
      }

      const userId = req.session.user.id;

      // 銀行口座情報を取得
      const bankAccount = await dbQuery(
        `SELECT id FROM partner_bank_accounts WHERE partner_id = $1::uuid`,
        [partner_id]
      );

      const bankAccountId = bankAccount.length ? bankAccount[0].id : null;

      await dbQuery('BEGIN');

      // 送金記録を作成
      const transferResult = await dbQuery(
        `INSERT INTO partner_transfers
         (partner_id, bank_account_id, transfer_period_start, transfer_period_end,
          transfer_scheduled_date, total_order_amount, platform_fee_rate,
          platform_fee_amount, transfer_amount, order_count, order_ids,
          status, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::date, $4::date, $5::date, $6, $7, $8, $9, $10, $11::uuid[], 'pending', now(), now())
         RETURNING id`,
        [partner_id, bankAccountId, period_start, period_end, scheduled_date,
         total_amount, platform_fee_rate || 0.00, platform_fee_amount || 0,
         transfer_amount, order_count, order_ids]
      );

      const transferId = transferResult[0].id;

      // 対象注文の transfer_status を更新
      await dbQuery(
        `UPDATE orders
         SET transfer_id = $1::uuid,
             transfer_status = 'included',
             updated_at = now()
         WHERE id = ANY($2::uuid[])`,
        [transferId, order_ids]
      );

      await dbQuery('COMMIT');

      res.json({
        ok: true,
        message: '送金記録を作成しました。',
        transfer_id: transferId
      });
    } catch (e) {
      await dbQuery('ROLLBACK').catch(() => {});
      next(e);
    }
  }
);

// 送金を完了済みにマーク（手動送金実施後）
app.post(
  '/admin/transfers/:id/complete',
  requireAuth,
  csrfProtect,
  async (req, res, next) => {
    try {
      // 権限チェック: 管理者のみ
      if (!isAdmin(req)) {
        return res.status(403).json({ ok: false, message: 'forbidden' });
      }

      const transferId = String(req.params.id || '').trim();
      if (!isUuid(transferId)) return res.status(400).json({ ok: false, message: 'invalid id' });

      const { transfer_note } = req.body;
      const userId = req.session.user.id;

      await dbQuery('BEGIN');

      // 送金記録を更新
      const result = await dbQuery(
        `UPDATE partner_transfers
         SET status = 'completed',
             transferred_at = now(),
             transferred_by = $2::uuid,
             transfer_note = $3,
             updated_at = now()
         WHERE id = $1::uuid
         RETURNING order_ids`,
        [transferId, userId, transfer_note || null]
      );

      if (!result.length) {
        await dbQuery('ROLLBACK');
        return res.status(404).json({ ok: false, message: '送金記録が見つかりません。' });
      }

      const orderIds = result[0].order_ids;

      // 対象注文の transfer_status を更新
      await dbQuery(
        `UPDATE orders
         SET transfer_status = 'transferred',
             updated_at = now()
         WHERE id = ANY($1::uuid[])`,
        [orderIds]
      );

      await dbQuery('COMMIT');

      req.session.flash = { type: 'ok', message: '送金を完了済みにしました。' };
      res.redirect(`/admin/transfers`);
    } catch (e) {
      await dbQuery('ROLLBACK').catch(() => {});
      next(e);
    }
  }
);

// 送金一覧画面
app.get(
  '/admin/transfers',
  requireAuth,
  async (req, res, next) => {
    try {
      // 権限チェック: 管理者のみ
      if (!isAdmin(req)) {
        return res.status(403).render('errors/403', { title: '権限がありません' });
      }

      const page = parseInt(req.query.page) || 1;
      const perPage = 20;
      const offset = (page - 1) * perPage;

      const status = req.query.status || '';

      let whereClauses = [];
      let params = [];
      let paramIndex = 1;

      if (status) {
        whereClauses.push(`t.status = $${paramIndex}`);
        params.push(status);
        paramIndex++;
      }

      const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const transfers = await dbQuery(
        `SELECT
           t.*,
           p.name AS partner_name,
           u.name AS transferred_by_name
         FROM partner_transfers t
         LEFT JOIN partners p ON p.id = t.partner_id
         LEFT JOIN users u ON u.id = t.transferred_by
         ${whereSQL}
         ORDER BY t.transfer_scheduled_date DESC, t.created_at DESC
         LIMIT ${perPage} OFFSET ${offset}`,
        params
      );

      const totalResult = await dbQuery(
        `SELECT COUNT(*)::int AS total FROM partner_transfers t ${whereSQL}`,
        params
      );
      const total = totalResult[0].total;
      const totalPages = Math.ceil(total / perPage);

      res.render('admin/transfers/index', {
        title: '送金管理',
        transfers,
        page,
        perPage,
        total,
        totalPages,
        status,
        csrfToken: (typeof req.csrfToken === 'function') ? req.csrfToken() : null
      });
    } catch (e) {
      next(e);
    }
  }
);

// 送金記録作成画面
app.get(
  '/admin/transfers/new',
  requireAuth,
  async (req, res, next) => {
    try {
      // 権限チェック: 管理者のみ
      if (!isAdmin(req)) {
        return res.status(403).render('errors/403', { title: '権限がありません' });
      }

      res.render('admin/transfers/new', {
        title: '送金記録の作成',
        csrfToken: (typeof req.csrfToken === 'function') ? req.csrfToken() : null
      });
    } catch (e) {
      next(e);
    }
  }
);

// 送金詳細画面
app.get(
  '/admin/transfers/:id',
  requireAuth,
  async (req, res, next) => {
    try {
      // 権限チェック: 管理者のみ
      if (!isAdmin(req)) {
        return res.status(403).render('errors/403', { title: '権限がありません' });
      }

      const transferId = String(req.params.id || '').trim();
      if (!isUuid(transferId)) {
        return res.status(404).render('errors/404', { title: '送金記録が見つかりません' });
      }

      const transferRows = await dbQuery(
        `SELECT
           t.*,
           p.name AS partner_name,
           u.name AS transferred_by_name
         FROM partner_transfers t
         LEFT JOIN partners p ON p.id = t.partner_id
         LEFT JOIN users u ON u.id = t.transferred_by
         WHERE t.id = $1::uuid`,
        [transferId]
      );

      if (!transferRows.length) {
        return res.status(404).render('errors/404', { title: '送金記録が見つかりません' });
      }

      const transfer = transferRows[0];

      // 対象注文を取得
      const orders = await dbQuery(
        `SELECT * FROM orders WHERE id = ANY($1::uuid[]) ORDER BY created_at DESC`,
        [transfer.order_ids]
      );

      res.render('admin/transfers/show', {
        title: `送金詳細 | ${transfer.partner_name || ''}`,
        transfer,
        orders,
        csrfToken: (typeof req.csrfToken === 'function') ? req.csrfToken() : null
      });
    } catch (e) {
      next(e);
    }
  }
);

// admin/partners/:id/availability
app.get(
  '/admin/partners/:id/availability',
  requireAuth,
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!isUuid(id)) {
        return res.status(400).render('errors/404', { title: '不正なID' });
      }

      // 管理者 or その取引先メンバーのみ
      const isMember = await isMemberOfPartner(req, id);
      if (!isAdmin(req) && !isMember) {
        return res.status(403).send('forbidden');
      }

      const [partnerRows, dateRows] = await Promise.all([
        dbQuery(
          `SELECT id, name, status
             FROM partners
            WHERE id=$1::uuid`,
          [id]
        ),
        dbQuery(
          `SELECT kind, date
             FROM partner_date_availabilities
            WHERE partner_id = $1
            ORDER BY date ASC
            LIMIT 365`,
          [id]
        )
      ]);

      const jpWeek = ['日','月','火','水','木','金','土'];

      // ① SQL を times 付きで取得
      const weeklyRows = await dbQuery(
        `SELECT kind, weekday, start_time, end_time
          FROM partner_weekday_availabilities
          WHERE partner_id = $1`,
        [id]
      );

      // ② kind × weekday × timeSlot のマップに整形
      const weeklySlots = {
        delivery: {}, // { 0: ['09:00-11:00','11:00-13:00'], 2: [...], ... }
        pickup:   {}
      };

      weeklyRows.forEach(r => {
        const kind = r.kind; // 'delivery' or 'pickup'
        if (kind !== 'delivery' && kind !== 'pickup') return;

        const wd = Number(r.weekday); // 0-6
        const start = String(r.start_time).slice(0,5); // 'HH:MM'
        const end   = String(r.end_time).slice(0,5);   // 'HH:MM'
        const slot  = `${start}-${end}`;

        if (!weeklySlots[kind][wd]) weeklySlots[kind][wd] = [];
        if (!weeklySlots[kind][wd].includes(slot)) {
          weeklySlots[kind][wd].push(slot);
        }
      });

      const partner = partnerRows[0];
      if (!partner) {
        return res.status(404).render('errors/404', { title: '取引先が見つかりません' });
      }

      const weekly = {
        delivery: new Set(),
        pickup: new Set()
      };
      weeklyRows.forEach(r => {
        weekly[r.kind]?.add(Number(r.weekday));
      });

      const specials = {
        delivery: [],
        pickup: []
      };
      dateRows.forEach(r => {
        const ymd = r.date.toISOString().slice(0,10);
        specials[r.kind]?.push(ymd);
      });

      res.render('admin/partners/availability', {
        title: `受け渡し可能日設定 | ${partner.name}`,
        partner,
        weekly,
        weeklySlots,
        specials,
        csrfToken: (typeof req.csrfToken === 'function') ? req.csrfToken() : null
      });
    } catch (e) { next(e); }
  }
);

app.post(
  '/admin/partners/:id/availability',
  requireAuth,
  csrfProtect,
  async (req, res, next) => {
    try {
      const partnerId = String(req.params.id || '').trim();
      if (!isUuid(partnerId)) return res.status(400).send('bad partner id');

      if (!isAdmin(req) && !(await isMemberOfPartner(req, partnerId))) {
        return res.status(403).send('forbidden');
      }

      // ▼ 1) 週パターン：曜日×時間帯の配列をパース
      function parseWeeklySlots(bodyFieldName) {
        const raw = []
          .concat(req.body[bodyFieldName] || []); // 文字列 or 配列

        const slots = []; // { weekday, start, end }
        raw.forEach(v => {
          const [wdStr, startStr, endStr] = String(v).split('|');
          const wd = Number(wdStr);
          if (Number.isNaN(wd) || wd < 0 || wd > 6) return;
          if (!startStr || !endStr) return;
          slots.push({
            weekday: wd,
            start: startStr, // 'HH:MM'
            end: endStr      // 'HH:MM'
          });
        });
        return slots;
      }

      const weeklyDeliverySlots = parseWeeklySlots('weekly_delivery_slots');
      const weeklyPickupSlots   = parseWeeklySlots('weekly_pickup_slots');

      // ▼ 2) 特定日（既存ロジック）は一旦そのまま（必要になったら時間帯拡張）
      const specialsDelivery = (req.body.special_delivery_dates || '')
        .split(',').map(s => s.trim()).filter(Boolean);
      const specialsPickup = (req.body.special_pickup_dates || '')
        .split(',').map(s => s.trim()).filter(Boolean);

      await dbQuery('BEGIN');

      // ▼ 3) 週パターン：一旦全部消してから入れ直す
      await dbQuery(
        `DELETE FROM partner_weekday_availabilities WHERE partner_id=$1`,
        [partnerId]
      );

      const weeklyTuples = [];
      const weeklyParams = [partnerId];
      let idx = 2;

      weeklyDeliverySlots.forEach(s => {
        weeklyTuples.push(
          `($1::uuid, 'delivery'::ship_method, $${idx++}::int, $${idx++}::time, $${idx++}::time)`
        );
        weeklyParams.push(s.weekday, s.start, s.end);
      });

      weeklyPickupSlots.forEach(s => {
        weeklyTuples.push(
          `($1::uuid, 'pickup'::ship_method, $${idx++}::int, $${idx++}::time, $${idx++}::time)`
        );
        weeklyParams.push(s.weekday, s.start, s.end);
      });

      if (weeklyTuples.length) {
        await dbQuery(
          `INSERT INTO partner_weekday_availabilities
             (partner_id, kind, weekday, start_time, end_time)
           VALUES ${weeklyTuples.join(',')}`,
          weeklyParams
        );
      }

      // ▼ 4) 特定日も既存通り (時間帯は一旦終日扱いなら 00:00-23:59 を維持)
      await dbQuery(
        `DELETE FROM partner_date_availabilities WHERE partner_id=$1`,
        [partnerId]
      );

      const dateTuples = [];
      const dateParams = [partnerId];
      idx = 2;

      specialsDelivery.forEach(ymd => {
        dateTuples.push(
          `($1::uuid, 'delivery'::ship_method, $${idx++}::date, '00:00'::time, '23:59'::time)`
        );
        dateParams.push(ymd);
      });
      specialsPickup.forEach(ymd => {
        dateTuples.push(
          `($1::uuid, 'pickup'::ship_method, $${idx++}::date, '00:00'::time, '23:59'::time)`
        );
        dateParams.push(ymd);
      });

      if (dateTuples.length) {
        await dbQuery(
          `INSERT INTO partner_date_availabilities
             (partner_id, kind, date, start_time, end_time)
           VALUES ${dateTuples.join(',')}`,
          dateParams
        );
      }

      await dbQuery('COMMIT');
      req.session.flash = { type: 'ok', message: '受け渡し可能日時を更新しました。' };
      res.redirect(`/admin/partners/${partnerId}`);
    } catch (e) {
      await dbQuery('ROLLBACK').catch(()=>{});
      next(e);
    }
  }
);

/**
 * GET: 送料・配送地域設定ページ
 */
app.get(
  '/admin/partners/:id/shipping',
  requireAuth,
  requireRole(['seller']),
  async (req, res, next) => {
    try {
      const sellerId = req.params.id;
      // 出品者情報
      const sellerRows = await dbQuery(
        `SELECT id, name FROM partners WHERE id = $1 LIMIT 1`,
        [sellerId]
      );
      if (!sellerRows.length) {
        return res.status(404).render('errors/404', {
          title: '出品者が見つかりません'
        });
      }
      const seller = sellerRows[0];

      // 既存ルール
      const rules = await getRulesForSeller(sellerId);

      res.render('seller/shipping', {
        title: '送料・配送地域設定',
        action: '/admin/partners/' + sellerId + '/shipping',
        csrfToken: req.csrfToken(),
        seller,
        partner: {},      // 必要ならパートナー情報を入れてもOK
        rules
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST: 送料・配送地域設定保存
 */
app.post(
  '/admin/partners/:id/shipping',
  requireAuth,
  requireRole(['seller']),
  async (req, res, next) => {
    try {
      const sellerId = req.params.id; // ログイン中の seller

      const defaultRule = req.body.default || null;
      const prefRules   = req.body.prefRules || [];
      const cityRules   = req.body.cityRules || [];

      await saveRulesForSeller(sellerId, { defaultRule, prefRules, cityRules });

      return res.redirect(`/admin/partners/${encodeURIComponent(sellerId)}/shipping`);
    } catch (err) {
      if (err && err.code === '23505') {
        console.error('shipping rules unique violation:', err.detail || err.message);
      }
      next(err);
    }
  }
);

// GET: ユーザー詳細（本人 or 管理者）
app.get('/admin/users/:id', requireAuth, async (req,res,next)=>{
  try{
    const uid = req.params.id === 'me' ? req.session.user.id : req.params.id;
    const isSelf = uid === req.session.user.id;

    const user = (await dbQuery(`SELECT id, name, email, roles, partner_id, created_at, updated_at, email_verified_at, two_factor_enabled, two_factor_enabled_at FROM users WHERE id=$1`, [uid]))[0];
    if (!user) return res.status(404).send('not found');

    let partner;
    if (user.partner_id) {
      partner = (await dbQuery(`SELECT id,name,type,status,phone,billing_email,postal_code,prefecture,city,address1,address2 FROM partners WHERE id = $1`, [user.partner_id]))[0] || null;
    }
    let isAllowed = false;

    // A. 管理者なら許可
    if (isAdmin) {
        isAllowed = true;
    } 
    // B. 自分自身の閲覧なら許可 (取引先の有無にかかわらず)
    else if (isSelf) {
        isAllowed = true;
    }
    // C. 取引先に所属しているアカウントであり、かつ同じ取引先のメンバーなら許可
    else if (user.partner_id) {
        // 閲覧対象のユーザーが取引先に所属しており (user.partner_id が null でない)、
        // リクエストユーザーがその取引先のメンバーであるかチェック
        if (await isMemberOfPartner(req, user.partner_id)) {
            isAllowed = true;
        }
    }
    // D. どちらの条件も満たさない場合、isAllowed は false のまま

    // 3. 許可されなかった場合は拒否
    if (!isAllowed) {
        return res.status(403).render('errors/403', { title: '権限がありません' });
    }
    
    const addresses = await dbQuery(
      `SELECT id,full_name,phone,postal_code,prefecture,city,address_line1,address_line2,address_type,is_default
         FROM addresses WHERE user_id=$1 ORDER BY is_default DESC, created_at DESC LIMIT 30`, [uid]
    );

    // マスタ（= 全システムの有効な支払い方法 & 日本語ラベル）
    const allMethod = await loadAllPaymentMethods('payment_method', 'payment_method');
    const userMethodsRows = await getAllowedMethodsForUser(user.id, allMethod);
    const userMethods = userMethodsRows.map(r => r.method);
    const userSynced = userMethodsRows.some(r => r.synced_from_partner);
    const emailVerified = user.email_verified_at;

    res.render('admin/users/show', {
      title: isSelf ? 'アカウント設定' : `ユーザー: ${user.name}`,
      user, partner, addresses,
      userPaymentMethods: userMethods,
      userPaymentSynced: userSynced,
      allPaymentMethods: allMethod,
      isSelf,
      emailVerified,
      currentRoles: req.session.user.roles || [],
      emailError: req.session.emailError || '',
      csrfToken: req.csrfToken()
    });

    req.session.emailError = '';
  }catch(e){ next(e); }
});

// ユーザー更新（基本情報）
// POST /admin/users/:id/unlock - アカウントロック解除（管理者のみ）
app.post('/admin/users/:id/unlock', requireAuth, requireRole(['admin']), csrfProtect, async (req, res, next) => {
  try {
    const userId = req.params.id;

    // アカウントロック解除
    await dbQuery(
      `UPDATE users
       SET account_locked_at = NULL,
           account_locked_reason = NULL,
           failed_login_attempts = 0,
           last_failed_login_at = NULL
       WHERE id = $1`,
      [userId]
    );

    // ユーザーにメール通知
    const userRows = await dbQuery(
      `SELECT email, name FROM users WHERE id = $1`,
      [userId]
    );
    const user = userRows[0];

    if (user) {
      try {
        await gmailSend({
          to: user.email,
          subject: 'アカウントのロックが解除されました - セッツマルシェ',
          html: `
            <p>${user.name} 様</p>
            <p>管理者により、お客様のアカウントのロックが解除されました。</p>
            <p>再度ログインが可能になりました。</p>
            <p>もしロック解除に心当たりがない場合は、お問い合わせフォームよりご連絡ください。</p>
            <p>---<br>セッツマルシェ</p>
          `
        });
      } catch (mailErr) {
        console.error('Failed to send unlock email:', mailErr);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post('/admin/users/:id', requireAuth, csrfProtect, async (req,res,next)=>{
  try{
    const uid = req.params.id;
    const isSelf = uid === req.session.user.id;
    // roles は本人変更禁止（adminのみ）
    const roles = (req.body.roles||'').split(',').map(s=>s.trim()).filter(Boolean);
    if (!req.session.user.roles.includes('admin')) delete req.body.roles;
    req.session.emailError = '';

    const email = req.body.email;
    // メール重複チェック
    const dup = await dbQuery(`SELECT 1 FROM users WHERE email=$1 LIMIT 1`, [email]);
    if (dup.length) {
      req.session.emailError = '入力されたメールアドレスはすでに使用されているため使用できません。';
      return res.redirect('/admin/users/' + uid);
    }

    await dbQuery(
      `UPDATE users SET name = $2, email = $3 ${req.body.roles?`, roles = $4` : ''}, updated_at = now(), email_verified_at = Null
       WHERE id=$1`,
      req.body.roles
        ? [uid, req.body.name, email || null, roles]
        : [uid, req.body.name, email || null]
    );

    req.session.user.name = req.body.name;
    req.session.pendingVerifyUserId = uid;
    req.session.pendingVerifyEmail = email;
    res.redirect('/admin/users/' + uid);
  }catch(e){ next(e); }
});

app.post('/admin/users/:id/payments', requireAuth, csrfProtect, async (req,res,next)=>{
  try{
    const uid = String(req.params.id || '').trim();
    if (!isUuid(uid)) return res.status(400).send('bad user id');

    const myRoles = req.session.user.roles || [];
    const myId    = req.session.user.id;

    // 権限：管理者 or 本人 or 同一取引先メンバー
    let allowed = false;
    if (isAdmin(req) || isSelf(req, uid)) {
      allowed = true;
    } else {
      const targetPartner = await getUserPartnerId(uid);
      allowed = await isMemberOfPartner(req, targetPartner);
    }
    if (!allowed) return res.status(403).send('forbidden');

    const allMethod = await loadAllPaymentMethods('payment_method', 'payment_method');
    const allCodes = allMethod.map(m => m.value);
    const methods = []
      .concat(req.body?.methods || [])
      .map(String).map(s=>s.trim())
      .filter(m => allCodes.includes(m));

    await dbQuery('BEGIN');

    // 「ユーザーが明示保存」＝手動設定を優先に切り替える。
    // partner由来の行を消す → 手動由来(false)で入れ直す
    await dbQuery(
      `DELETE FROM user_allowed_payment_methods
        WHERE user_id=$1::uuid`,
      [uid]
    );

    if (methods.length) {
      const values = methods.map((m,i)=>`($1::uuid, $${i+2}::payment_method, false)`).join(',');
      await dbQuery(
        `INSERT INTO user_allowed_payment_methods(user_id, method, synced_from_partner)
         VALUES ${values}
         ON CONFLICT (user_id, method) DO UPDATE
           SET synced_from_partner = EXCLUDED.synced_from_partner,
               updated_at = now()`,
        [uid, ...methods]
      );
    }

    await dbQuery('COMMIT');
    req.session.flash = { type:'ok', message:'決済方法を更新しました。' };
    res.redirect('/admin/users/' + uid);
  }catch(e){
    await dbQuery('ROLLBACK').catch(()=>{});
    next(e);
  }
});

// パスワード変更（本人のみ）
app.post('/admin/users/:id/password', requireAuth, csrfProtect, async (req,res)=>{
  const uid = req.params.id;
  if (uid !== req.session.user.id) return res.status(403).json({ok:false, message:'forbidden'});
  const { current, password, passwordConfirm } = req.body || {};
  if (!password || password !== passwordConfirm) return res.status(400).json({ok:false, message:'確認が一致しません'});
  try{
    const row = (await dbQuery(`SELECT password_hash FROM users WHERE id=$1`, [uid]))[0];
    const ok = await bcrypt.compare(current || '', row.password_hash || '');
    if (!ok) return res.status(400).json({ok:false, message:'現在のパスワードが違います'});
    const hash = await bcrypt.hash(password, 12);
    await dbQuery(`UPDATE users SET password_hash=$2, updated_at=now() WHERE id=$1`, [uid, hash]);
    res.json({ok:true});
  }catch(e){ res.status(500).json({ok:false, message:'変更に失敗しました'}); }
});

// 住所 CRUD（一覧）
app.get('/admin/users/:id/addresses', requireAuth, async (req,res)=>{
  const uid = req.params.id;
  // 権限：本人 or admin
  if (uid !== req.session.user.id && !req.session.user.roles.includes('admin')) return res.status(403).json({ok:false});
  const rows = await dbQuery(`SELECT id,full_name,phone,postal_code,prefecture,city,address_line1,address_line2,address_type,is_default FROM addresses WHERE user_id=$1 ORDER BY is_default DESC, created_at DESC`, [uid]);
  res.json({ok:true, addresses: rows});
});
// 1件
app.get('/admin/users/:id/addresses/:aid', requireAuth, async (req,res)=>{
  const {id:uid, aid} = req.params;
  if (uid !== req.session.user.id && !req.session.user.roles.includes('admin')) return res.status(403).json({ok:false});
  const a = (await dbQuery(`SELECT id,full_name,phone,postal_code,prefecture,city,address_line1,address_line2,address_type,is_default FROM addresses WHERE id=$1 AND user_id=$2`, [aid, uid]))[0];
  if (!a) return res.status(404).json({ok:false});
  res.json({ok:true, address:a});
});
// 作成
app.post('/admin/users/:id/addresses', requireAuth, csrfProtect, async (req,res)=>{
  const uid = req.params.id;
  if (uid !== req.session.user.id && !req.session.user.roles.includes('admin')) return res.status(403).json({ok:false});
  const b = req.body || {};
  if (b.is_default) await dbQuery(`UPDATE addresses SET is_default=false WHERE user_id=$1 AND is_default=true`, [uid]);
  const created = await dbQuery(
    `INSERT INTO addresses (user_id, full_name, phone, postal_code, prefecture, city, address_line1, address_line2, address_type, is_default, scope)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [uid, b.full_name, b.phone, b.postal_code, b.prefecture, b.city, b.address_line1, b.address_line2 || null, b.address_type || 'shipping', !!b.is_default, 'user']
  );
  res.json({ok:true, id: created[0].id});
});
// 更新
app.patch('/admin/users/:id/addresses/:aid', requireAuth, csrfProtect, async (req,res)=>{
  const {id:uid, aid} = req.params;
  if (uid !== req.session.user.id && !req.session.user.roles.includes('admin')) return res.status(403).json({ok:false});
  const b = req.body || {};
  if (b.is_default) await dbQuery(`UPDATE addresses SET is_default=false WHERE user_id=$1 AND id<>$2 AND is_default=true`, [uid, aid]);
  await dbQuery(
    `UPDATE addresses SET full_name=$3, phone=$4, postal_code=$5, prefecture=$6, city=$7, address_line1=$8, address_line2=$9, address_type=$10, is_default=$11, updated_at=now()
     WHERE id=$2 AND user_id=$1`,
    [uid, aid, b.full_name, b.phone, b.postal_code, b.prefecture, b.city, b.address_line1, b.address_line2 || null, b.address_type || 'shipping', !!b.is_default]
  );
  res.json({ok:true});
});
// 削除
app.delete('/admin/users/:id/addresses/:aid', requireAuth, async (req,res)=>{
  const {id:uid, aid} = req.params;
  if (uid !== req.session.user.id && !req.session.user.roles.includes('admin')) return res.status(403).json({ok:false});
  await dbQuery(`DELETE FROM addresses WHERE id=$1 AND user_id=$2`, [aid, uid]);
  res.json({ok:true});
});

// 取引先検索（既存）
app.get('/admin/partners/search', requireAuth, async (req,res)=>{
  const q = (req.query.q||'').trim();
  if (!q) return res.json({ok:true, partners:[]});
  const rows = await dbQuery(
    `SELECT id,name,postal_code,prefecture,city,address1 FROM partners
     WHERE (name ILIKE $1 OR phone ILIKE $1 OR postal_code ILIKE $1)
     ORDER BY updated_at DESC LIMIT 20`,
     [`%${q}%`]
  );
  res.json({ok:true, partners: rows});
});

// 取引先 紐付け
app.post('/admin/users/:id/partner', requireAuth, csrfProtect, async (req,res)=>{
  const uid = req.params.id;
  if (uid !== req.session.user.id && !req.session.user.roles.includes('admin')) return res.status(403).json({ok:false});
  const pid = (req.body.partner_id||'').trim();
  const exists = await dbQuery(`SELECT 1 FROM partners WHERE id=$1`, [pid]);
  if (!exists.length) return res.status(400).json({ok:false, message:'取引先が見つかりません'});
  await dbQuery(`UPDATE users SET partner_id=$2, updated_at=now() WHERE id=$1`, [uid, pid]);
  res.json({ok:true});
});

// 取引先 新規作成して紐付け（重複候補があれば先にユーザーに確認）
app.post('/admin/users/:id/partner/create', requireAuth, csrfProtect, async (req,res)=>{
  try {
    const uid  = req.params.id;
    const user = req.session.user;
    if (uid !== req.session.user.id && !user.roles.includes('admin')) {
      return res.status(403).json({ok:false, message:'権限がありません'});
    }

    const b = req.body || {};
    if (!b.name) return res.status(400).json({ok:false, message:'名称は必須です'});

    // 「本当に新規作成したい」とユーザーが明示したときに true を送ってくる想定
    const forceCreate = !!b.force;

    // 入力値を整形
    const name    = (b.name || '').trim();
    const postal  = (b.postal_code || '').trim();
    const pref    = (b.prefecture  || '').trim();
    const city    = (b.city        || '').trim();
    const addr1   = (b.address1    || '').trim();
    const addr2   = (b.address2    || '').trim();
    const phone   = (b.phone       || '').trim();
    const email   = (b.email       || '').trim();
    const website = (b.website     || '').trim();
    const taxid   = (b.taxid       || '').trim();

    // --- 重複候補検索（force=false のときだけ） ---
    let candidates = [];
    if (!forceCreate) {
      candidates = await dbQuery(
        `SELECT id, name, postal_code, prefecture, city, address1, address2, phone, email
           FROM partners
          WHERE
            -- 名称 & 住所
            (
              LOWER(name) = LOWER($1)
              AND COALESCE(postal_code,'') = COALESCE($2,'')
              AND COALESCE(prefecture, '') = COALESCE($3,'')
              AND COALESCE(city,       '') = COALESCE($4,'')
              AND COALESCE(address1,   '') = COALESCE($5,'')
            )
            OR ($6 <> '' AND phone = $6)                    -- 電話一致
            OR ($7 <> '' AND LOWER(email) = LOWER($7))      -- メール一致
          LIMIT 10`,
        [name, postal || null, pref || null, city || null, addr1 || null, phone, email]
      );

      if (candidates.length) {
        // まだ INSERT はしない。候補一覧を返してユーザーに選んでもらう
        return res.json({
          ok: true,
          need_confirm: true,
          candidates
        });
      }
    }

    // --- ここまで来たら新規作成確定 ---
    const ins = await dbQuery(
      `INSERT INTO partners
         (name, postal_code, prefecture, city, address1, address2,
          phone, email, website, tax_id)
       VALUES
         ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        name,
        postal || null,
        pref   || null,
        city   || null,
        addr1  || null,
        addr2  || null,
        phone  || null,
        email  || null,
        website|| null,
        taxid  || null,
      ]
    );

    const partnerId = ins[0].id;

    await dbQuery(
      `UPDATE users
          SET partner_id = $2,
              updated_at = now()
        WHERE id = $1`,
      [uid, partnerId]
    );

    res.json({ ok: true, partner_id: partnerId, created: true });
  } catch (e) {
    console.error('partner/create error:', e);
    res.status(500).json({ ok:false, message:'取引先の登録に失敗しました' });
  }
});

// =========================================================
// 管理：お知らせ一覧
// GET /admin/notifications?q=&type=&scope=&page=
// =========================================================
app.get(
  '/admin/notifications',
  requireAuth,
  requireRole(['admin']),
  async (req, res, next) => {
    try {
      const { q = '', type = 'all', scope = 'all', page = 1 } = req.query;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const pageSize = 20;
      const offset = (pageNum - 1) * pageSize;

      const where = ['1=1'];
      const params = [];

      if (q) {
        params.push(`%${q}%`);
        where.push(`(n.title ILIKE $${params.length} OR n.body ILIKE $${params.length})`);
      }

      if (type !== 'all') {
        params.push(type);
        where.push(`n.type = $${params.length}`);
      }

      if (scope === 'active') {
        // 現在表示中のみ
        where.push(`
          (
            (n.visible_from IS NULL OR n.visible_from <= now())
            AND (n.visible_to IS NULL OR n.visible_to >= now())
          )
        `);
      }

      const whereSql = where.join(' AND ');

      const totalRow = await dbQuery(
        `SELECT COUNT(*)::int AS cnt FROM notifications n WHERE ${whereSql}`,
        params
      );
      const total = totalRow[0]?.cnt || 0;

      const paramsWithPage = [...params, pageSize, offset];

      const items = await dbQuery(
        `
        SELECT
          n.*,
          -- 全体配信フラグ
          EXISTS (
            SELECT 1 FROM notification_targets nt
             WHERE nt.notification_id = n.id AND nt.audience = 'all'
          ) AS for_all,
          -- ロール配信一覧
          (
            SELECT array_agg(DISTINCT nt.role)
              FROM notification_targets nt
             WHERE nt.notification_id = n.id AND nt.role IS NOT NULL
          ) AS roles,
          -- 個別ユーザー配信数
          (
            SELECT COUNT(*)
              FROM notification_targets nt
             WHERE nt.notification_id = n.id AND nt.user_id IS NOT NULL
          ) AS user_target_count
        FROM notifications n
        WHERE ${whereSql}
        ORDER BY n.created_at DESC
        LIMIT $${paramsWithPage.length - 1} OFFSET $${paramsWithPage.length}
        `,
        paramsWithPage
      );

      const pagination = {
        page: pageNum,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      };

      const buildQuery = buildQueryPath('/admin/notifications', { q, type, scope });

      res.render('admin/notifications/index', {
        title: 'お知らせ一覧',
        items,
        total,
        q,
        type,
        scope,
        pagination,
        buildQuery,
      });
    } catch (e) {
      next(e);
    }
  }
);


// =========================================================
// 管理：お知らせ作成フォーム
// GET /admin/notifications/new
// =========================================================
app.get(
  '/admin/notifications/new',
  requireAuth,
  requireRole(['admin']),
  (req, res) => {
    res.render('admin/notifications/edit', {
      title: 'お知らせ作成',
      csrfToken: req.csrfToken(),
      notification: null,
      targetMode: 'all',      // 'all' / 'roles' / 'none'
      targetRoles: [],        // ['buyer', 'seller'] など
      targetUsers: [],        // ひとまず未使用
      fieldErrors: {},
      isNew: true,
    });
  }
);


// =========================================================
// 管理：お知らせ作成 POST
// POST /admin/notifications/new
// =========================================================
app.post(
  '/admin/notifications/new',
  requireAuth,
  requireRole(['admin']),
  [
    body('title').trim().notEmpty().withMessage('タイトルを入力してください'),
    body('type').trim().notEmpty().withMessage('種別を選択してください'),
    body('body').trim().notEmpty().withMessage('本文を入力してください'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      const {
        title,
        type,
        body: bodyText,
        link_url,
        visible_from,
        visible_to,
        target_mode,
      } = req.body;

      const fieldErrors = {};
      if (!errors.isEmpty()) {
        for (const e of errors.array()) {
          if (!fieldErrors[e.path]) fieldErrors[e.path] = e.msg;
        }
      }

      const targetRoles = Array.isArray(req.body.target_roles)
        ? req.body.target_roles
        : (req.body.target_roles ? [req.body.target_roles] : []);
      const targetMode = target_mode || 'all';

      // 入力値を再表示用にまとめる
      const notificationDraft = {
        title,
        type,
        body: bodyText,
        link_url,
        visible_from,
        visible_to,
      };

      if (!errors.isEmpty()) {
        return res.status(422).render('admin/notifications/edit', {
          title: 'お知らせ作成',
          csrfToken: req.csrfToken(),
          notification: notificationDraft,
          targetMode,
          targetRoles,
          targetUsers: [],
          fieldErrors,
          isNew: true,
        });
      }

      // 日付パース（空文字は NULL に）
      const visFrom = visible_from ? new Date(visible_from) : null;
      const visTo   = visible_to ? new Date(visible_to) : null;

      // notifications 挿入
      const rows = await dbQuery(
        `INSERT INTO notifications
          (type, title, body, link_url, visible_from, visible_to, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id`,
        [
          type,
          title,
          bodyText,
          link_url || null,
          visFrom,
          visTo,
          req.session.user.id,
        ]
      );
      const notifId = rows[0].id;

      // 配信対象の登録
      if (targetMode === 'all') {
        await dbQuery(
          `INSERT INTO notification_targets (notification_id, audience)
           VALUES ($1, 'all')`,
          [notifId]
        );
      } else if (targetMode === 'roles' && targetRoles.length > 0) {
        const values = [];
        const params = [];
        targetRoles.forEach((r, i) => {
          params.push(notifId, r);
          values.push(`($${params.length - 1}, $${params.length})`);
        });
        await dbQuery(
          `INSERT INTO notification_targets (notification_id, role)
           VALUES ${values.join(',')}`,
          params
        );
      }
      // targetMode === 'none' の場合は notification_targets なし

      res.redirect('/admin/notifications');
    } catch (e) {
      next(e);
    }
  }
);


// =========================================================
// 管理：お知らせ詳細 + 編集フォーム
// GET /admin/notifications/:id
// =========================================================
app.get(
  '/admin/notifications/:id',
  requireAuth,
  requireRole(['admin']),
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      const rows = await dbQuery(
        `SELECT n.*, u.name AS created_by_name
           FROM notifications n
           LEFT JOIN users u ON u.id = n.created_by
          WHERE n.id = $1::uuid
          LIMIT 1`,
        [id]
      );
      const n = rows[0];
      if (!n) {
        return res.status(404).render('errors/404', { title: 'お知らせが見つかりません' });
      }

      const targets = await dbQuery(
        `SELECT nt.*, u.name AS user_name, u.email AS user_email
           FROM notification_targets nt
           LEFT JOIN users u ON u.id = nt.user_id
          WHERE nt.notification_id = $1
          ORDER BY nt.id`,
        [id]
      );

      // UI 用に targetMode / targetRoles を判定
      let targetMode = 'none';
      const targetRoles = [];
      const targetUsers = [];

      if (targets.some(t => t.audience === 'all')) {
        targetMode = 'all';
      } else if (targets.some(t => t.role)) {
        targetMode = 'roles';
        targets.forEach(t => {
          if (t.role && !targetRoles.includes(t.role)) {
            targetRoles.push(t.role);
          }
        });
      } else if (targets.some(t => t.user_id)) {
        targetMode = 'users';
        targets.forEach(t => {
          if (t.user_id) {
            targetUsers.push({
              id: t.user_id,
              name: t.user_name,
              email: t.user_email,
            });
          }
        });
      }

      res.render('admin/notifications/edit', {
        title: `お知らせ編集`,
        csrfToken: req.csrfToken(),
        notification: n,
        targetMode,
        targetRoles,
        targetUsers,
        fieldErrors: {},
        isNew: false,
      });
    } catch (e) {
      next(e);
    }
  }
);


// =========================================================
// 管理：お知らせ更新 POST
// POST /admin/notifications/:id
// =========================================================
app.post(
  '/admin/notifications/:id',
  requireAuth,
  requireRole(['admin']),
  [
    body('title').trim().notEmpty().withMessage('タイトルを入力してください'),
    body('type').trim().notEmpty().withMessage('種別を選択してください'),
    body('body').trim().notEmpty().withMessage('本文を入力してください'),
  ],
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      const errors = validationResult(req);

      const {
        title,
        type,
        body: bodyText,
        link_url,
        visible_from,
        visible_to,
        target_mode,
      } = req.body;

      const targetRoles = Array.isArray(req.body.target_roles)
        ? req.body.target_roles
        : (req.body.target_roles ? [req.body.target_roles] : []);
      const targetMode = target_mode || 'all';

      const fieldErrors = {};
      if (!errors.isEmpty()) {
        for (const e of errors.array()) {
          if (!fieldErrors[e.path]) fieldErrors[e.path] = e.msg;
        }
      }

      // DB から元のレコードを拾う（なければ404）
      const curRows = await dbQuery(
        `SELECT * FROM notifications WHERE id = $1::uuid LIMIT 1`,
        [id]
      );
      const current = curRows[0];
      if (!current) {
        return res.status(404).render('errors/404', { title: 'お知らせが見つかりません' });
      }

      const draft = {
        ...current,
        title,
        type,
        body: bodyText,
        link_url,
        visible_from,
        visible_to,
      };

      if (!errors.isEmpty()) {
        return res.status(422).render('admin/notifications/edit', {
          title: 'お知らせ編集',
          csrfToken: req.csrfToken(),
          notification: draft,
          targetMode,
          targetRoles,
          targetUsers: [],
          fieldErrors,
          isNew: false,
        });
      }

      const visFrom = visible_from ? new Date(visible_from) : null;
      const visTo   = visible_to ? new Date(visible_to) : null;

      // 更新
      await dbQuery(
        `UPDATE notifications
            SET type         = $1,
                title        = $2,
                body         = $3,
                link_url     = $4,
                visible_from = $5,
                visible_to   = $6,
                updated_at   = now()
          WHERE id = $7::uuid`,
        [
          type,
          title,
          bodyText,
          link_url || null,
          visFrom,
          visTo,
          id,
        ]
      );

      // 既存ターゲットを一旦削除して再作成
      await dbQuery(
        `DELETE FROM notification_targets WHERE notification_id = $1`,
        [id]
      );

      if (targetMode === 'all') {
        await dbQuery(
          `INSERT INTO notification_targets (notification_id, audience)
           VALUES ($1, 'all')`,
          [id]
        );
      } else if (targetMode === 'roles' && targetRoles.length > 0) {
        const values = [];
        const params = [];
        targetRoles.forEach((r, i) => {
          params.push(id, r);
          values.push(`($${params.length - 1}, $${params.length})`);
        });
        await dbQuery(
          `INSERT INTO notification_targets (notification_id, role)
           VALUES ${values.join(',')}`,
          params
        );
      }

      res.redirect(`/admin/notifications/${id}`);
    } catch (e) {
      next(e);
    }
  }
);


// =========================================================
// 管理：お知らせ削除（任意）
// POST /admin/notifications/:id/delete
// =========================================================
app.post(
  '/admin/notifications/:id/delete',
  requireAuth,
  requireRole(['admin']),
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      await dbQuery(`DELETE FROM notifications WHERE id = $1::uuid`, [id]);
      // CASCADE により targets / reads も削除される
      res.redirect('/admin/notifications');
    } catch (e) {
      next(e);
    }
  }
);

// =========================================================
// マイページ：お知らせ一覧
// GET /my/notifications?filter=all|unread&page=
// =========================================================
app.get('/my/notifications', requireAuth, async (req, res, next) => {
  try {
    const user = req.session.user;
    const uid = user.id;
    const roles = Array.isArray(user.roles) ? user.roles : [];

    const { filter = 'all', page = 1 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = 20;
    const offset = (pageNum - 1) * pageSize;

    const baseParams = [uid, roles];
    const whereExtra = [];

    if (filter === 'unread') {
      // 未読のみ：read_at が NULL
      whereExtra.push('nr.read_at IS NULL');
    }

    const extraSql = whereExtra.length ? `AND ${whereExtra.join(' AND ')}` : '';

    // 件数
    const totalRow = await dbQuery(
      `
      WITH candidates AS (
        SELECT DISTINCT notification_id
          FROM notification_targets
         WHERE audience = 'all'
            OR (role IS NOT NULL AND role = ANY($2::text[]))
            OR (user_id = $1)
      )
      SELECT COUNT(*)::int AS cnt
        FROM notifications n
        JOIN candidates c ON c.notification_id = n.id
        LEFT JOIN notification_reads nr
          ON nr.notification_id = n.id
         AND nr.user_id = $1
       WHERE (n.visible_from IS NULL OR n.visible_from <= now())
         AND (n.visible_to   IS NULL OR n.visible_to   >= now())
         ${extraSql}
      `,
      baseParams
    );
    const total = totalRow[0]?.cnt || 0;

    const items = await dbQuery(
      `
      WITH candidates AS (
        SELECT DISTINCT notification_id
          FROM notification_targets
         WHERE audience = 'all'
            OR (role IS NOT NULL AND role = ANY($2::text[]))
            OR (user_id = $1)
      )
      SELECT
        n.*,
        (nr.read_at IS NOT NULL) AS is_read
        -- ここで必要なら type ごとの日本語ラベルを CASE で付けてもOK
      FROM notifications n
      JOIN candidates c ON c.notification_id = n.id
      LEFT JOIN notification_reads nr
        ON nr.notification_id = n.id
       AND nr.user_id = $1
      WHERE (n.visible_from IS NULL OR n.visible_from <= now())
        AND (n.visible_to   IS NULL OR n.visible_to   >= now())
        ${extraSql}
      ORDER BY n.created_at DESC
      LIMIT $3 OFFSET $4
      `,
      [...baseParams, pageSize, offset]
    );

    const pagination = {
      page: pageNum,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };

    res.render('notifications/my-index', {
      title: 'お知らせ',
      items,
      total,
      filter,
      pagination,
    });
  } catch (e) {
    next(e);
  }
});

// =========================================================
// マイページ：お気に入り一覧
// GET /my/favorites
// =========================================================
app.get('/my/favorites', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const perPage = 20;
    const offset = (page - 1) * perPage;

    // お気に入り商品を取得（非公開商品は除外）
    const favorites = await dbQuery(
      `SELECT 
         f.id AS favorite_id,
         f.created_at AS favorited_at,
         p.id,
         p.title,
         p.price,
         p.stock,
         p.status,
         p.unit,
         p.favorite_count,
         (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position ASC LIMIT 1) AS image_url
       FROM favorites f
       JOIN products p ON p.id = f.product_id
       WHERE f.user_id = $1::uuid
         AND p.status = 'public'
       ORDER BY f.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, perPage, offset]
    );

    // 総件数
    const countRows = await dbQuery(
      `SELECT COUNT(*)::int AS cnt
       FROM favorites f
       JOIN products p ON p.id = f.product_id
       WHERE f.user_id = $1::uuid
         AND p.status = 'public'`,
      [userId]
    );
    const total = countRows[0]?.cnt || 0;
    const pageCount = Math.ceil(total / perPage);

    res.render('my/favorites', {
      title: 'お気に入り商品',
      favorites,
      pagination: {
        page,
        pageCount,
        total,
        perPage
      },
      currentUser: req.session.user,
      csrfToken: (typeof req.csrfToken === 'function') ? req.csrfToken() : null
    });
  } catch (e) {
    next(e);
  }
});

// =========================================================
// マイページ：お知らせ詳細
// GET /my/notifications/:id
// =========================================================
app.get('/my/notifications/:id', requireAuth, async (req, res, next) => {
  try {
    const user = req.session.user;
    const uid = user.id;
    const roles = Array.isArray(user.roles) ? user.roles : [];
    const id = String(req.params.id || '').trim();

    // このユーザーが閲覧できる通知かチェック
    const rows = await dbQuery(
      `
      WITH candidates AS (
        SELECT DISTINCT notification_id
          FROM notification_targets
         WHERE audience = 'all'
            OR (role IS NOT NULL AND role = ANY($2::text[]))
            OR (user_id = $1)
      )
      SELECT
        n.*,
        (nr.read_at IS NOT NULL) AS is_read
      FROM notifications n
      JOIN candidates c ON c.notification_id = n.id
      LEFT JOIN notification_reads nr
        ON nr.notification_id = n.id
       AND nr.user_id = $1
      WHERE n.id = $3::uuid
        AND (n.visible_from IS NULL OR n.visible_from <= now())
        AND (n.visible_to   IS NULL OR n.visible_to   >= now())
      LIMIT 1
      `,
      [uid, roles, id]
    );

    const n = rows[0];
    if (!n) {
      return res
        .status(404)
        .render('errors/404', { title: 'お知らせが見つかりません' });
    }

    // 既読登録（無ければ INSERT、あれば UPDATE）
    await dbQuery(
      `
      INSERT INTO notification_reads (notification_id, user_id, read_at)
      VALUES ($1::uuid, $2, now())
      ON CONFLICT (notification_id, user_id)
      DO UPDATE SET read_at = EXCLUDED.read_at
      `,
      [id, uid]
    );

    res.render('notifications/my-show', {
      title: n.title || 'お知らせ',
      notification: n,
    });
  } catch (e) {
    next(e);
  }
});

// 公開：出品者紹介ページ（URL は userId 起点だが中身は partner 単位）
app.get('/sellers/:userId', async (req, res, next) => {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) {
      return res
        .status(404)
        .render('errors/404', { title: '出品者が見つかりません' });
    }

    const data = await getPublicProfileWithProducts(userId);
    if (!data) {
      return res
        .status(404)
        .render('errors/404', { title: '出品者が見つかりません' });
    }

    const { profile, seller, tags, products } = data;
    const isEmbed = req.query.embed === '1';

    res.render('seller/profile-show', {
      title: (seller.partner_name || seller.name || '出品者') + 'さんの紹介',
      profile,
      seller,
      tags,
      products,
      isEmbed
    });
  } catch (e) {
    next(e);
  }
});

// ============================
// 出品者紹介ページ 編集画面（GET）
// ============================
app.get(
  '/seller/profile/edit',
  requireAuth,
  requireRole(['seller', 'admin']),
  async (req, res, next) => {
    try {
      const loginUser = req.session.user;

      // user.id から partner 単位の profile を取得
      const {profile, user} = await getProfileByUserId(loginUser.id);

      res.render('seller/profile-edit', {
        title: '出品者紹介ページ編集',
        currentUser: loginUser,
        profile,
        csrfToken: typeof req.csrfToken === 'function' ? req.csrfToken() : null,
        // 初期表示用（短い紹介文）
        sellerIntroSummary: user.seller_intro_summary || '',
      });
    } catch (e) {
      next(e);
    }
  }
);

// 出品者紹介ページ 保存（POST）
app.post(
  '/seller/profile/edit',
  requireAuth,
  requireRole(['seller', 'admin']),
  async (req, res, next) => {
    try {
      const user = req.session.user;
      const {
        headline,
        hero_image_url,
        intro_html,
        seller_intro_summary,
        hashtag_input, // hidden で送る "無農薬,減農薬" 形式
      } = req.body;

      // ハッシュタグ文字列を配列化（カンマ or 改行区切り）
      const hashtags = (() => {
        if (!hashtag_input) return [];
        const raw = Array.isArray(hashtag_input)
          ? hashtag_input.join(',')
          : String(hashtag_input);
        return Array.from(
          new Set(
            raw
              .split(/[,、\s\n]+/)
              .map((t) => t.replace(/^#/, '').trim())
              .filter(Boolean)
          )
        );
      })();

      // partner 単位でプロフィールを upsert（user.id から partner に変換される）
      await upsertSellerProfile(user.id, {
        headline,
        intro_html,
        hero_image_url,
        hashtags,
        hashtag_input, // 念のため渡してもOK
      });

      // 概要（商品ページの短い紹介文）はユーザー毎
      await updateSellerIntroSummary(user.id, seller_intro_summary);

      // セッションの currentUser にも反映
      // if (req.session.user) {
      //   req.session.user.seller_intro_summary = seller_intro_summary || null;
      // }

      res.redirect('/seller/profile/edit?saved=1');
    } catch (e) {
      next(e);
    }
  }
);

// server.js のどこか admin ルート群の近くに追加
app.get(
  '/admin/campaigns',
  requireAuth,
  requireRole(['admin']),
  async (req, res, next) => {
    try {
      const rows = await dbQuery(
        `
        SELECT
          id,
          slug,
          title,
          eyebrow,
          teaser_text,
          status,
          published_at,
          starts_at,
          ends_at,
          created_at,
          updated_at
        FROM campaigns
        ORDER BY created_at DESC
        `
      );

      res.render('admin/campaigns/index', {
        title: 'キャンペーン管理',
        campaigns: rows
      });
    } catch (e) {
      next(e);
    }
  }
);

app.get(
  '/admin/campaigns/show/:id',
  requireAuth,
  requireRole(['admin']),
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).render('errors/400', { title: '不正なIDです' });

      const rows = await dbQuery(
        `
        SELECT * FROM campaigns
        WHERE id = $1::uuid
        LIMIT 1
        `,
        [id]
      );

      if (!rows.length) {
        return res.status(404).render('errors/404', { title: 'キャンペーンが見つかりません' });
      }

      const campaign = rows[0];

      res.render('admin/campaigns/show', {
        title: `キャンペーン詳細：${campaign.title}`,
        campaign
      });
    } catch (e) {
      next(e);
    }
  }
);

// 先頭付近のヘルパ定義あたりに追加
function slugify(str = '') {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s =>
      String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
    )
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || null;
}

// キャンペーン共通 validator
const campaignValidators = [
  body('title').trim().notEmpty().withMessage('タイトルを入力してください。')
    .isLength({ max: 160 }).withMessage('タイトルは160文字以内で入力してください。'),

  body('slug').optional({ checkFalsy: true }).trim()
    .isLength({ max: 160 }).withMessage('スラッグは160文字以内で入力してください。')
    .matches(/^[a-z0-9-]+$/).withMessage('スラッグは半角英数字とハイフンのみ使用できます。'),

  body('eyebrow').optional({ checkFalsy: true }).trim().isLength({ max: 60 }),
  body('teaser_text').optional({ checkFalsy: true }).trim().isLength({ max: 300 }),

  body('status').trim().isIn(['draft', 'scheduled', 'published', 'archived'])
    .withMessage('ステータスが不正です。'),

  body('hero_image_url').optional({ checkFalsy: true }).trim().isLength({ max: 1024 }),

  body('starts_at').optional({ checkFalsy: true }).isISO8601().withMessage('開始日時の形式が正しくありません。'),
  body('ends_at').optional({ checkFalsy: true }).isISO8601().withMessage('終了日時の形式が正しくありません。'),

  body('body_html').optional({ checkFalsy: true }).isString(),
  body('body_raw').optional({ checkFalsy: true }).isString(), // JSON文字列として受ける
];

app.get(
  '/admin/campaigns/new',
  requireAuth,
  requireRole(['admin']),
  (req, res) => {
    const now = new Date();
    res.render('admin/campaigns/new', {
      title: 'キャンペーン新規作成',
      csrfToken: req.csrfToken(),
      values: {
        title: '',
        slug: '',
        eyebrow: '特集',
        teaser_text: '',
        hero_image_url: '',
        status: 'draft',
        starts_at: '',
        ends_at: '',
        body_html: '',
        body_raw: '',
        table_labels: [],
        table_values: []
      },
      fieldErrors: {},
      globalError: ''
    });
  }
);

app.post(
  '/admin/campaigns',
  requireAuth,
  requireRole(['admin']),
  csrfProtect,
  campaignValidators,
  async (req, res) => {
    const errors = validationResult(req);

    // 値を整形（再描画用）
    const values = {
      title: (req.body.title || '').trim(),
      slug: (req.body.slug || '').trim(),
      eyebrow: (req.body.eyebrow || '').trim(),
      teaser_text: (req.body.teaser_text || '').trim(),
      hero_image_url: (req.body.hero_image_url || '').trim(),
      status: (req.body.status || 'draft').trim(),
      starts_at: req.body.starts_at || '',
      ends_at: req.body.ends_at || '',
      body_html: req.body.body_html || '',
      body_raw: req.body.body_raw || '',
    };

    // テーブルデータを配列として処理
    const tableLabelsRaw = req.body['table_labels[]'] || req.body.table_labels || [];
    const tableValuesRaw = req.body['table_values[]'] || req.body.table_values || [];
    const tableLabels = Array.isArray(tableLabelsRaw) ? tableLabelsRaw : [tableLabelsRaw];
    const tableValues = Array.isArray(tableValuesRaw) ? tableValuesRaw : [tableValuesRaw];

    // 空の行を除外してペアを作成
    const tablePairs = [];
    for (let i = 0; i < Math.max(tableLabels.length, tableValues.length); i++) {
      const label = (tableLabels[i] || '').trim();
      const value = (tableValues[i] || '').trim();
      if (label || value) {
        tablePairs.push({ label, value });
      }
    }

    values.table_labels = tableLabels;
    values.table_values = tableValues;

    // スラッグが未入力なら title から自動生成
    if (!values.slug) {
      values.slug = slugify(values.title || '');
    }

    if (!errors.isEmpty()) {
      const list = errors.array({ onlyFirstError: true });
      const fieldErrors = {};
      for (const err of list) {
        fieldErrors[err.path || err.param] = String(err.msg);
      }
      return res.status(422).render('admin/campaigns/new', {
        title: 'キャンペーン新規作成',
        csrfToken: req.csrfToken(),
        values,
        fieldErrors,
        globalError: ''
      });
    }

    const adminId = req.session.user?.id || null;

    // 日時は ISO8601 文字列から Date に変換（空なら null）
    const startsAt = values.starts_at ? new Date(values.starts_at) : null;
    const endsAt   = values.ends_at ? new Date(values.ends_at) : null;

    // 公開ステータスのとき、自動で published_at を入れる
    const publishedAt = values.status === 'published' ? new Date() : null;

    try {
      const rows = await dbQuery(
        `
        INSERT INTO campaigns
          (slug, title, eyebrow, teaser_text, hero_image_url,
           body_html, body_raw, status, starts_at, ends_at,
           published_at, created_by, table_labels, table_values)
        VALUES
          ($1,$2,$3,$4,$5,
           $6,$7,$8,$9,$10,
           $11,$12,$13,$14)
        RETURNING id
        `,
        [
          values.slug,
          values.title,
          values.eyebrow || null,
          values.teaser_text || null,
          values.hero_image_url || null,
          values.body_html || null,
          values.body_raw ? JSON.parse(values.body_raw) : null,
          values.status,
          startsAt,
          endsAt,
          publishedAt,
          adminId,
          JSON.stringify(tableLabels.filter(l => l.trim())),
          JSON.stringify(tableValues.filter(v => v.trim()))
        ]
      );

      const id = rows[0].id;
      return res.redirect(`/admin/campaigns/show/${id}`);
    } catch (err) {
      console.error('create campaign error:', err);
      // slug のユニーク制約など
      if (err.code === '23505') {
        return res.status(409).render('admin/campaigns/new', {
          title: 'キャンペーン新規作成',
          csrfToken: req.csrfToken(),
          values,
          fieldErrors: { slug: 'このスラッグは既に使用されています。別のスラッグを指定してください。' },
          globalError: ''
        });
      }
      return res.status(500).render('admin/campaigns/new', {
        title: 'キャンペーン新規作成',
        csrfToken: req.csrfToken(),
        values,
        fieldErrors: {},
        globalError: 'キャンペーンの作成でエラーが発生しました。時間をおいて再度お試しください。'
      });
    }
  }
);

app.get(
  '/admin/campaigns/edit/:id',
  requireAuth,
  requireRole(['admin']),
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      const rows = await dbQuery(
        `
        SELECT
          id, slug, title, eyebrow, teaser_text, hero_image_url,
          body_html,
          body_raw,
          status,
          starts_at, ends_at,
          published_at,
          created_at, updated_at,
          table_labels, table_values
        FROM campaigns
        WHERE id = $1::uuid
        LIMIT 1
        `,
        [id]
      );
      if (!rows.length) {
        return res.status(404).render('errors/404', { title: 'キャンペーンが見つかりません' });
      }
      const c = rows[0];

      // テーブルデータをJSONBから配列に変換
      const tableLabels = c.table_labels
        ? (Array.isArray(c.table_labels) ? c.table_labels : JSON.parse(c.table_labels || '[]'))
        : [];
      const tableValues = c.table_values
        ? (Array.isArray(c.table_values) ? c.table_values : JSON.parse(c.table_values || '[]'))
        : [];

      const values = {
        id: c.id,
        title: c.title || '',
        slug: c.slug || '',
        eyebrow: c.eyebrow || '',
        teaser_text: c.teaser_text || '',
        hero_image_url: c.hero_image_url || '',
        status: c.status || 'draft',
        starts_at: c.starts_at ? new Date(c.starts_at).toISOString().slice(0,16) : '',
        ends_at:   c.ends_at   ? new Date(c.ends_at).toISOString().slice(0,16)   : '',
        body_html: c.body_html || '',
        body_raw:
          c.body_raw
            ? (typeof c.body_raw === 'string'
                ? c.body_raw                // すでに JSON 文字列ならそのまま
                : JSON.stringify(c.body_raw)) // JSON/JSONB オブジェクトなら stringify
            : '',
        published_at: c.published_at
          ? new Date(c.published_at).toLocaleString('ja-JP')
          : '',
        table_labels: tableLabels,
        table_values: tableValues
      };

      res.render('admin/campaigns/edit', {
        title: `キャンペーン編集：${c.title}`,
        csrfToken: req.csrfToken(),
        values,
        fieldErrors: {},
        globalError: ''
      });
    } catch (e) {
      next(e);
    }
  }
);

app.post(
  '/admin/campaigns/:id',
  requireAuth,
  requireRole(['admin']),
  csrfProtect,
  campaignValidators,
  async (req, res) => {
    const id = String(req.params.id || '').trim();

    const errors = validationResult(req);
    const values = {
      id,
      title: (req.body.title || '').trim(),
      slug: (req.body.slug || '').trim(),
      eyebrow: (req.body.eyebrow || '').trim(),
      teaser_text: (req.body.teaser_text || '').trim(),
      hero_image_url: (req.body.hero_image_url || '').trim(),
      status: (req.body.status || 'draft').trim(),
      starts_at: req.body.starts_at || '',
      ends_at: req.body.ends_at || '',
      body_html: req.body.body_html || '',
      body_raw: req.body.body_raw || '',
      published_at: '' // 表示用
    };

    // テーブルデータを配列として処理
    const tableLabelsRaw = req.body['table_labels[]'] || req.body.table_labels || [];
    const tableValuesRaw = req.body['table_values[]'] || req.body.table_values || [];
    const tableLabels = Array.isArray(tableLabelsRaw) ? tableLabelsRaw : [tableLabelsRaw];
    const tableValues = Array.isArray(tableValuesRaw) ? tableValuesRaw : [tableValuesRaw];

    values.table_labels = tableLabels;
    values.table_values = tableValues;

    if (!values.slug) values.slug = slugify(values.title || '');

    if (!errors.isEmpty()) {
      const list = errors.array({ onlyFirstError: true });
      const fieldErrors = {};
      for (const err of list) fieldErrors[err.path || err.param] = String(err.msg);
      return res.status(422).render('admin/campaigns/edit', {
        title: `キャンペーン編集：${values.title || ''}`,
        csrfToken: req.csrfToken(),
        values,
        fieldErrors,
        globalError: ''
      });
    }

    const startsAt = values.starts_at ? new Date(values.starts_at) : null;
    const endsAt   = values.ends_at ? new Date(values.ends_at) : null;

    try {
      // 既存の published_at を取得（status 遷移に応じて変更）
      const curRows = await dbQuery(
        `SELECT status, published_at FROM campaigns WHERE id = $1::uuid LIMIT 1`,
        [id]
      );
      if (!curRows.length) {
        return res.status(404).render('errors/404', { title: 'キャンペーンが見つかりません' });
      }
      let publishedAt = curRows[0].published_at;

      // ドラフト/スケジュール → 初めて "published" になったときだけ現在時刻をセット
      if (values.status === 'published' && !publishedAt) {
        publishedAt = new Date();
      }
      // archived に落としても published_at は残す（履歴として）

      const result = await dbQuery(
        `
        UPDATE campaigns
           SET slug = $2,
               title = $3,
               eyebrow = $4,
               teaser_text = $5,
               hero_image_url = $6,
               body_html = $7,
               body_raw  = $8,
               status = $9,
               starts_at = $10,
               ends_at = $11,
               published_at = $12,
               table_labels = $13,
               table_values = $14,
               updated_at = now()
         WHERE id = $1::uuid
         RETURNING published_at
        `,
        [
          id,
          values.slug,
          values.title,
          values.eyebrow || null,
          values.teaser_text || null,
          values.hero_image_url || null,
          values.body_html || null,
          values.body_raw ? JSON.parse(values.body_raw) : null,
          values.status,
          startsAt,
          endsAt,
          publishedAt,
          JSON.stringify(tableLabels.filter(l => l.trim())),
          JSON.stringify(tableValues.filter(v => v.trim()))
        ]
      );

      values.published_at = result[0].published_at
        ? new Date(result[0].published_at).toLocaleString('ja-JP')
        : '';

      return res.redirect(`/admin/campaigns/show/${id}`);
    } catch (err) {
      console.error('update campaign error:', err);
      if (err.code === '23505') {
        return res.status(409).render('admin/campaigns/edit', {
          title: `キャンペーン編集：${values.title || ''}`,
          csrfToken: req.csrfToken(),
          values,
          fieldErrors: { slug: 'このスラッグは既に使用されています。' },
          globalError: ''
        });
      }
      return res.status(500).render('admin/campaigns/edit', {
        title: `キャンペーン編集：${values.title || ''}`,
        csrfToken: req.csrfToken(),
        values,
        fieldErrors: {},
        globalError: 'キャンペーンの更新でエラーが発生しました。時間をおいて再度お試しください。'
      });
    }
  }
);

// 公開用：キャンペーン一覧
app.get('/campaigns', async (req, res, next) => {
  try {
    const rows = await dbQuery(
      `
      SELECT
        id, slug, title, eyebrow, teaser_text, hero_image_url,
        status,
        starts_at, ends_at,
        published_at
      FROM campaigns
      WHERE status = 'published'
      ORDER BY
        COALESCE(starts_at, published_at, created_at) DESC
      `
    );

    // ビューで扱いやすいように整形
    const campaigns = rows.map((c) => {
      const now = new Date();
      const startsAt = c.starts_at ? new Date(c.starts_at) : null;
      const endsAt   = c.ends_at   ? new Date(c.ends_at)   : null;

      let state = 'live';      // live | upcoming | closed
      let stateLabel = '開催中';
      if (endsAt && endsAt < now) {
        state = 'closed';
        stateLabel = '終了';
      } else if (startsAt && startsAt > now) {
        state = 'upcoming';
        stateLabel = '開催前';
      }

      return {
        ...c,
        starts_at_fmt: startsAt ? startsAt.toLocaleDateString('ja-JP') : '',
        ends_at_fmt:   endsAt   ? endsAt.toLocaleDateString('ja-JP')   : '',
        published_at_fmt: c.published_at
          ? new Date(c.published_at).toLocaleDateString('ja-JP')
          : '',
        state,
        stateLabel
      };
    });

    res.render('campaigns/index', {
      title: 'キャンペーン一覧',
      campaigns
    });
  } catch (err) {
    next(err);
  }
});

// 公開用：キャンペーン詳細
app.get('/campaigns/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.redirect('/campaigns');
    }

    const rows = await dbQuery(
      `
      SELECT
        id, slug, title, eyebrow, teaser_text, hero_image_url,
        body_html,
        status,
        starts_at, ends_at,
        published_at,
        created_at, updated_at
      FROM campaigns
      WHERE id = $1
        AND status = 'published'
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).render('errors/404', { title: 'キャンペーンが見つかりません' });
    }

    const c = rows[0];
    const now = new Date();
    const startsAt = c.starts_at ? new Date(c.starts_at) : null;
    const endsAt   = c.ends_at   ? new Date(c.ends_at)   : null;

    let state = 'live';
    let stateLabel = '開催中';
    let stateNote = '';

    if (endsAt && endsAt < now) {
      state = 'closed';
      stateLabel = '終了';
      stateNote = 'このキャンペーンは終了しました。';
    } else if (startsAt && startsAt > now) {
      state = 'upcoming';
      stateLabel = '開催前';
      stateNote = 'このキャンペーンはまだ開始前です。';
    }

    const campaign = {
      ...c,
      starts_at_fmt: startsAt ? startsAt.toLocaleDateString('ja-JP') : '',
      ends_at_fmt:   endsAt   ? endsAt.toLocaleDateString('ja-JP')   : '',
      published_at_fmt: c.published_at
        ? new Date(c.published_at).toLocaleString('ja-JP')
        : '',
      state,
      stateLabel,
      stateNote
    };

    res.render('campaigns/show', {
      title: campaign.title,
      campaign
    });
  } catch (err) {
    next(err);
  }
});

app.get('/admin/coupons', 
  requireAuth,
  requireRole(['admin']),
  csrfProtect,
  async (req, res, next) => {
  try {
    const page       = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit      = 20;
    const offset     = (page - 1) * limit;
    const keyword    = (req.query.q || '').trim();
    const status     = (req.query.status || '').trim(); // '', 'active', 'inactive'
    const sort       = (req.query.sort || '').trim();   // '', 'usage_desc' などを将来使う想定

    const params = [];
    const whereClauses = [];

    // キーワード検索（code / name）
    if (keyword) {
      params.push(`%${keyword}%`, `%${keyword}%`);
      whereClauses.push(`(c.code ILIKE $${params.length - 1} OR c.name ILIKE $${params.length})`);
    }

    // ステータスフィルタ
    if (status === 'active') {
      params.push(new Date());
      const idx = params.length;
      // starts_at / ends_at の「現在有効」
      whereClauses.push(`c.is_active = true`);
      whereClauses.push(`(c.starts_at IS NULL OR c.starts_at <= $${idx})`);
      whereClauses.push(`(c.ends_at IS NULL OR c.ends_at >= $${idx})`);
    } else if (status === 'inactive') {
      whereClauses.push(`(c.is_active = false OR (c.ends_at IS NOT NULL AND c.ends_at < now()))`);
    }

    const where = whereClauses.length > 0 ? whereClauses.join(' AND ') : '1=1';

    // ソート条件（ホワイトリスト化）
    const allowedSorts = {
      'usage_desc': 'usage_stats.usage_count DESC, c.created_at DESC',
      'created_asc': 'c.created_at ASC',
      'created_desc': 'c.created_at DESC'
    };
    const orderBy = allowedSorts[sort] || 'c.created_at DESC';

    // 一覧データ取得（使用回数＋最終使用日時付き）
    const listSql = `
      SELECT
        c.*,
        COALESCE(usage_stats.usage_count, 0) AS usage_count,
        usage_stats.last_used_at
      FROM coupons c
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)        AS usage_count,
          MAX(created_at) AS last_used_at
        FROM orders o
        WHERE o.coupon_code = c.code
      ) AS usage_stats ON true
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${offset};
    `;

    const coupons = await dbQuery(listSql, params);

    // 総件数（ページネーション用）
    const countSql = `
      SELECT COUNT(*) AS cnt
      FROM coupons c
      WHERE ${where};
    `;
    const countRows = await dbQuery(countSql, params);
    const totalCount = parseInt(countRows[0]?.cnt || '0', 10);
    const totalPages = Math.max(Math.ceil(totalCount / limit), 1);

    // 軽いサマリー情報（ヘッダカード用）
    const statsSql = `
      SELECT
        -- 現在有効なクーポン数
        COUNT(*) FILTER (
          WHERE c.is_active = true
            AND (c.starts_at IS NULL OR c.starts_at <= now())
            AND (c.ends_at   IS NULL OR c.ends_at   >= now())
        ) AS active_count,
        -- 今月作成されたクーポン数
        COUNT(*) FILTER (
          WHERE date_trunc('month', c.created_at) = date_trunc('month', now())
        ) AS this_month_created,
        -- 累計使用回数
        (
          SELECT COUNT(*)
          FROM orders o
          WHERE o.coupon_code IS NOT NULL AND o.coupon_code <> ''
        ) AS total_usage
      FROM coupons c;
    `;
    const statsRows = await dbQuery(statsSql, []);
    const stats = statsRows[0] || {
      active_count: 0,
      this_month_created: 0,
      total_usage: 0,
    };

    res.set('Cache-Control', 'no-store');
    return res.render('admin/coupons/index', {
      title: 'クーポン一覧',
      coupons,
      stats,
      page,
      totalPages,
      totalCount,
      keyword,
      status,
      sort,
      limit,
    });
  } catch (e) {
    next(e);
  }
});

// 整数正規化
function toIntOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

// 0 以上の整数（必須）にしたいとき用
function toNonNegativeInt(v, fallback = 0) {
  const n = toIntOrNull(v);
  if (n === null || n < 0) return fallback;
  return n;
}

// <input type="datetime-local"> を Date に変換
function parseDateTimeLocal(str) {
  if (!str) return null;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

// フォーム入力を coupon オブジェクトにまとめる + 簡易バリデーション
function buildCouponFromBody(body = {}) {
  const errors = [];

  const code = String(body.code || '').trim();
  if (!code) errors.push('クーポンコードは必須です。');

  const discount_type = (body.discount_type || '').trim();
  if (!['percent', 'amount'].includes(discount_type)) {
    errors.push('割引種別が不正です。');
  }

  const discount_value = toIntOrNull(body.discount_value);
  if (discount_value === null || discount_value <= 0) {
    errors.push('割引値は 1 以上の整数で入力してください。');
  }

  const min_subtotal = toNonNegativeInt(body.min_subtotal, 0);
  const max_discount = toIntOrNull(body.max_discount);
  const applies_to   = (body.applies_to || 'order').trim() || 'order';
  const global_limit = toIntOrNull(body.global_limit);
  const per_user_limit = toIntOrNull(body.per_user_limit);

  const starts_at = parseDateTimeLocal(body.starts_at);
  const ends_at   = parseDateTimeLocal(body.ends_at);

  if (starts_at && ends_at && starts_at > ends_at) {
    errors.push('開始日時は終了日時より前にしてください。');
  }

  const is_active = body.is_active === '1' || body.is_active === 'true' || body.is_active === 'on';

  // metadata は JSON テキストとして入力（任意）
  let metadata = null;
  const metadataRaw = (body.metadata_json || '').trim();
  if (metadataRaw) {
    try {
      metadata = JSON.parse(metadataRaw);
    } catch (e) {
      errors.push('metadata は JSON 形式で入力してください。');
    }
  }

  const coupon = {
    code,
    name: (body.name || '').trim() || null,
    description: (body.description || '').trim() || null,
    discount_type,
    discount_value,
    min_subtotal,
    max_discount,
    applies_to,
    global_limit,
    per_user_limit,
    starts_at,
    ends_at,
    is_active,
    metadata
  };

  return { coupon, errors };eegrht
}

// GET /admin/coupons/:id  詳細ページ
app.get('/admin/coupons/:id',
  requireAuth,
  requireRole(['admin']),
  csrfProtect,
  async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.redirect('/admin/coupons');
    }

    // クーポン本体 + 使用回数・総割引額・最終使用日時
    const rows = await dbQuery(`
      SELECT
        c.*,
        COALESCE(usage_stats.usage_count, 0) AS usage_count,
        COALESCE(usage_stats.total_discount, 0) AS total_discount,
        usage_stats.last_used_at
      FROM coupons c
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)                        AS usage_count,
          COALESCE(SUM(o.coupon_discount), 0) AS total_discount,
          MAX(o.created_at)              AS last_used_at
        FROM orders o
        WHERE o.coupon_code = c.code
      ) AS usage_stats ON true
      WHERE c.id = $1
      LIMIT 1;
    `, [id]);

    const coupon = rows[0];
    if (!coupon) {
      return res.status(404).render('errors/404', { title: 'クーポンが見つかりません' });
    }

    // 直近の使用履歴（注文）
    const usageRows = await dbQuery(`
      SELECT
        o.id,
        o.order_number,
        o.created_at,
        o.total,
        o.coupon_discount,
        o.status,
        u.name AS buyer_name,
        u.email AS buyer_email
      FROM orders o
      LEFT JOIN users u ON u.id = o.buyer_id
      WHERE o.coupon_code = $1
      ORDER BY o.created_at DESC
      LIMIT 20;
    `, [coupon.code]);

    res.set('Cache-Control', 'no-store');
    return res.render('admin/coupons/show', {
      title: `クーポン詳細: ${coupon.code}`,
      coupon,
      usages: usageRows
    });
  } catch (e) {
    next(e);
  }
});

// GET /admin/coupons/new  新規作成フォーム
app.get('/admin/coupons-new',
  requireAuth,
  requireRole(['admin']),
  csrfProtect,
  async (req, res, next) => {
  try {
    const emptyCoupon = {
      code: '',
      name: '',
      description: '',
      discount_type: 'percent',
      discount_value: 10,
      min_subtotal: 0,
      max_discount: null,
      applies_to: 'order',
      global_limit: null,
      per_user_limit: null,
      starts_at: null,
      ends_at: null,
      is_active: true,
      metadata: {}
    };

    res.set('Cache-Control', 'no-store');
    return res.render('admin/coupons/form', {
      title: 'クーポン新規作成',
      coupon: emptyCoupon,
      isNew: true,
      errors: [],
      metadata_json: ''
    });
  } catch (e) {
    next(e);
  }
});

// GET /admin/coupons/:id/edit  編集フォーム
app.get('/admin/coupons/:id/edit',
  requireAuth,
  requireRole(['admin']),
  csrfProtect,
  async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.redirect('/admin/coupons');

    const rows = await dbQuery(`
      SELECT *
      FROM coupons
      WHERE id = $1
      LIMIT 1;
    `, [id]);

    const coupon = rows[0];
    if (!coupon) {
      return res.status(404).render('errors/404', { title: 'クーポンが見つかりません' });
    }

    const metadata_json = coupon.metadata
      ? JSON.stringify(coupon.metadata, null, 2)
      : '';

    res.set('Cache-Control', 'no-store');
    return res.render('admin/coupons/form', {
      title: `クーポン編集: ${coupon.code}`,
      coupon,
      isNew: false,
      errors: [],
      metadata_json
    });
  } catch (e) {
    next(e);
  }
});

// POST /admin/coupons  新規作成
app.post('/admin/coupons',
  requireAuth,
  requireRole(['admin']),
  csrfProtect,
  async (req, res, next) => {
  try {
    const { coupon, errors } = buildCouponFromBody(req.body);

    if (errors.length) {
      return res.status(422).render('admin/coupons/form', {
        title: 'クーポン新規作成',
        coupon,
        isNew: true,
        errors,
        metadata_json: req.body.metadata_json || ''
      });
    }

    const row = await dbQuery(`
      INSERT INTO coupons
        (code, name, description,
         discount_type, discount_value,
         min_subtotal, max_discount,
         applies_to, global_limit, per_user_limit,
         starts_at, ends_at,
         is_active, metadata)
      VALUES
        ($1,$2,$3,
         $4,$5,
         $6,$7,
         $8,$9,$10,
         $11,$12,
         $13,$14)
      RETURNING id;
    `, [
      coupon.code,
      coupon.name,
      coupon.description,
      coupon.discount_type,
      coupon.discount_value,
      coupon.min_subtotal,
      coupon.max_discount,
      coupon.applies_to,
      coupon.global_limit,
      coupon.per_user_limit,
      coupon.starts_at,
      coupon.ends_at,
      coupon.is_active,
      coupon.metadata
    ]);

    const id = row[0].id;
    return res.redirect(`/admin/coupons/${id}`);
  } catch (e) {
    // UNIQUE 制約違反など
    if (e.code === '23505') { // unique_violation
      const { coupon } = buildCouponFromBody(req.body);
      return res.status(409).render('admin/coupons/form', {
        title: 'クーポン新規作成',
        coupon,
        isNew: true,
        errors: ['このクーポンコードは既に使用されています。'],
        metadata_json: req.body.metadata_json || ''
      });
    }
    next(e);
  }
});

// POST /admin/coupons/:id  更新
app.post('/admin/coupons/:id',
  requireAuth,
  requireRole(['admin']),
  csrfProtect,
  async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.redirect('/admin/coupons');

    const { coupon, errors } = buildCouponFromBody(req.body);

    if (errors.length) {
      coupon.id = id; // form で使えるように
      return res.status(422).render('admin/coupons/form', {
        title: `クーポン編集: ${coupon.code || ''}`,
        coupon,
        isNew: false,
        errors,
        metadata_json: req.body.metadata_json || ''
      });
    }

    const result = await dbQuery(`
      UPDATE coupons
      SET
        code = $1,
        name = $2,
        description = $3,
        discount_type = $4,
        discount_value = $5,
        min_subtotal = $6,
        max_discount = $7,
        applies_to = $8,
        global_limit = $9,
        per_user_limit = $10,
        starts_at = $11,
        ends_at = $12,
        is_active = $13,
        metadata = $14,
        updated_at = now()
      WHERE id = $15
      RETURNING id;
    `, [
      coupon.code,
      coupon.name,
      coupon.description,
      coupon.discount_type,
      coupon.discount_value,
      coupon.min_subtotal,
      coupon.max_discount,
      coupon.applies_to,
      coupon.global_limit,
      coupon.per_user_limit,
      coupon.starts_at,
      coupon.ends_at,
      coupon.is_active,
      coupon.metadata,
      id
    ]);

    if (!result.length) {
      return res.status(404).render('errors/404', { title: 'クーポンが見つかりません' });
    }

    return res.redirect(`/admin/coupons/${id}`);
  } catch (e) {
    if (e.code === '23505') {
      const { coupon } = buildCouponFromBody(req.body);
      coupon.id = req.params.id;
      return res.status(409).render('admin/coupons/form', {
        title: `クーポン編集: ${coupon.code || ''}`,
        coupon,
        isNew: false,
        errors: ['このクーポンコードは既に使用されています。'],
        metadata_json: req.body.metadata_json || ''
      });
    }
    next(e);
  }
});

// 開発支援：CSRFエラーの見やすい応答
app.use((err, req, res, next) => {
  if (err && err.code === 'EBADCSRFTOKEN') {
    return res.status(403).render('errors/403', {
      title: 'セキュリティエラー',
      message: 'トークンが無効です。フォームを開き直して再度お試しください。'
    });
  }
  next(err);
});

/* =========================================================
 *  404 / Error
 * =======================================================*/
// ============================================================
// Stripe Connect ルート登録
// ============================================================
const { registerStripeConnectRoutes } = require('./routes-stripe-connect');
registerStripeConnectRoutes(app, requireAuth, requireRole);

// ============================================================
// 配送ステータス更新ルート登録
// ============================================================
const { registerDeliveryStatusRoutes } = require('./routes-delivery-status');
registerDeliveryStatusRoutes(app, requireAuth, requireRole);

// ============================================================
// 返金処理ルート登録
// ============================================================
const { registerRefundRoutes } = require('./routes-refund');
registerRefundRoutes(app, requireAuth, requireRole, csrfProtect);

// ============================================================
// Phase 6: 管理者用財務管理API
// ============================================================
const { registerAdminFinanceRoutes } = require('./routes-admin-finance');
registerAdminFinanceRoutes(app, requireAuth, requireRole);

// ============================================================
// WebAuthn（生体認証・パスキー）ルート登録
// ============================================================
const { registerWebAuthnRoutes } = require('./routes-webauthn');
registerWebAuthnRoutes(app, requireAuth);

app.use((req, res) => {
  res.status(404).render('errors/404', { title: 'ページが見つかりません' });
});

app.use((err, req, res, next) => {
  // エラー情報をログに記録（機密情報は除外）
  logger.error('Server error occurred', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    userId: req.session?.user?.id
  });
  res.status(500).send('サーバーエラーが発生しました。');
});

/* =========================================================
 *  Start
 * =======================================================*/
try {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    logger.info(`Server started successfully on port ${PORT}`, {
      nodeEnv: process.env.NODE_ENV || 'development',
      port: PORT
    });
  }).on('error', (error) => {
    console.error('=== SERVER LISTEN ERROR ===');
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    console.error('Port:', PORT);
    console.error('==========================');
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack,
      port: PORT
    });
    process.exit(1);
  });
} catch (error) {
  console.error('=== SERVER STARTUP ERROR ===');
  console.error('Error:', error);
  console.error('Stack:', error.stack);
  console.error('===========================');
  logger.error('Failed to start server', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
}