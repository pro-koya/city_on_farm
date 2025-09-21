// server.js
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet  = require('helmet');
const cookieParser = require('cookie-parser');
const csrf    = require('csurf');
const bcrypt  = require('bcryptjs');
const { body, validationResult, param } = require('express-validator');
const multer = require('multer');
const ejs = require('ejs');
const fs = require('fs');
const upload = multer();

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';
try { require('dotenv').config(); } catch { /* no-op */ }
app.set('trust proxy', 1);
// ローカル用のデフォルト値（自分の環境に合わせて）
const LOCAL_DB_URL = 'postgresql://city_on_firm_user:ruHjBG6tdZIgpWWxDNGmrxNmVkgbfaIP@dpg-d2u1oph5pdvs73a1ick0-a.oregon-postgres.render.com/city_on_firm';

/* ========== DB ========== */
const { Pool } = require('pg');
const externalDB = 'postgresql://city_on_firm_user:ruHjBG6tdZIgpWWxDNGmrxNmVkgbfaIP@dpg-d2u1oph5pdvs73a1ick0-a.oregon-postgres.render.com/city_on_firm';

// Renderの接続文字列（環境変数に置くのが推奨）
const dbUrl = process.env.External_Database_URL || LOCAL_DB_URL;
const useSSL =
  isProd || /\brender\.com\b/.test(dbUrl) || process.env.PGSSL === '1';
const pool = new Pool({
  connectionString: dbUrl,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});
app.locals.db = pool;

async function dbQuery(text, params = []) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res.rows;
  } finally {
    client.release();
  }
}

/* ========== View / Static ========== */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

/* ========== Parsers / Security ========== */
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(helmet({ contentSecurityPolicy: false }));

/* ========== Session ========== */
app.use(session({
  name: 'cof.sid',
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

/* ========== CSRF（局所適用） ========== */
const csrfProtection = csrf({ cookie: false });
function attachCsrf(req, res, next) {
  try { res.locals.csrfToken = req.csrfToken(); }
  catch(e){ res.locals.csrfToken = ''; }
  next();
}

/* ========== 共通locals ========== */
app.use(async (req, res, next) => {
  res.locals.currentUser = req.session.user || null;

  // デフォルトはセッション内カート件数（未ログイン時や障害時のフォールバック）
  const sessItems = req.session?.cart?.items || [];
  res.locals.cartCount = sessItems.length;

  // ログイン時はDBの件数で上書き
  const uid = req.session?.user?.id;
  if (!uid) return next();

  try {
    // carts / cart_items 構成（saved_for_later は集計に含めない想定）
    const rows = await dbQuery(
      `
      SELECT COUNT(DISTINCT ci.product_id)::int AS cnt
        FROM carts c
        LEFT JOIN cart_items ci
          ON ci.cart_id = c.id
        AND ci.saved_for_later = false
      WHERE c.user_id = $1
      `,
      [uid]
    );
    res.locals.cartCount = rows[0]?.cnt ?? 0;
  } catch (e) {
    // 失敗してもフォールバックのセッション件数を表示
    console.warn('cartCount fetch failed:', e.message);
  } finally {
    next();
  }
});

/* ========== 認可ミドルウェア ========== */
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}
function requireRole(role) {
  return (req, res, next) => {
    const roles = (req.session.user && req.session.user.roles) || [];
    if (!roles.includes(role)) return res.status(403).render('errors/403', { title: '権限がありません' });
    next();
  };
}

/* ========== Utils ========== */
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
function getCart(req){
  if (!req.session.cart) req.session.cart = { items: [], updatedAt: new Date() };
  return req.session.cart;
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

/* =========================================================
 *  認証
 * =======================================================*/
// GET /login（CSRF付与）
app.get('/login', csrfProtection, attachCsrf, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.render('auth/login', {
    title:'ログイン',
    values: { email: '' },
    fieldErrors: {},
    globalError: ''
  });
});

// POST /login
app.post(
  '/login',
  csrfProtection,
  [
    body('email').trim().isEmail().withMessage('有効なメールアドレスを入力してください。').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('パスワードは8文字以上で入力してください。')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      const { email, password } = req.body;

      if (!errors.isEmpty()) {
        const fieldErrors = {};
        for (const e of errors.array()) if (!fieldErrors[e.path]) fieldErrors[e.path] = e.msg;
        return res.status(422).render('auth/login', {
          title: 'ログイン',
          csrfToken: req.csrfToken(),
          values: { email },
          fieldErrors,
          globalError: ''
        });
      }

      const rows = await dbQuery(`SELECT id, name, email, password_hash, roles FROM users WHERE email = $1 LIMIT 1`, [email]);
      const user = rows[0];
      const ok = user ? await bcrypt.compare(password, user.password_hash) : false;

      if (!ok) {
        const msg = 'メールアドレスまたはパスワードが正しくありません。';
        return res.status(401).render('auth/login', {
          title: 'ログイン',
          csrfToken: req.csrfToken(),
          values: { email },
          fieldErrors: { email: msg, password: msg },
          globalError: ''
        });
      }

      req.session.user = { id: user.id, name: user.name, email: user.email, roles: user.roles || [] };
      await mergeSessionCartToDb(req, user.id);
      const roles = user.roles || [];
      return res.redirect(roles.includes('seller') ? '/dashboard/seller' : '/dashboard/buyer');
    } catch (err) {
      next(err);
    }
  }
);

// POST /logout
app.post('/logout', csrfProtection, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('cof.sid');
    res.redirect('/login');
  });
});

// GET /signup（トークン発行＆フォーム描画）
app.get('/signup', csrfProtection, attachCsrf, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.render('auth/signup', {
    title: 'アカウント作成',
    values: { name: '', email: '' },
    fieldErrors: {},
    globalError: ''
  });
});

// POST /signup（最終ガードのみ＝強制検証）
app.post(
  '/signup',
  csrfProtection,
  [
    body('name')
      .trim()
      .notEmpty().withMessage('お名前を入力してください。')
      .isLength({ max: 60 }).withMessage('お名前は60文字以内で入力してください。'),
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
  ],
  async (req, res) => {
    const errors = validationResult(req);
    const values = {
      name: req.body.name || '',
      email: (req.body.email || '').trim(),
    };

    if (!errors.isEmpty()) {
      const list = errors.array({ onlyFirstError: true });
      const fieldErrors = {};
      for (const err of list) {
        const key = err.path || err.param;
        const msg = (typeof err.msg === 'string') ? err.msg : JSON.stringify(err.msg);
        if (!fieldErrors[key]) fieldErrors[key] = msg;
      }
      return res.status(422).render('auth/signup', {
        title: 'アカウント作成',
        csrfToken: req.csrfToken(), // 再発行
        values,
        fieldErrors,
        globalError: ''
      });
    }

    try {
      // 既存メール重複チェック
      const existing = await dbQuery(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [values.email]);
      if (existing.length) {
        return res.status(409).render('auth/signup', {
          title: 'アカウント作成',
          csrfToken: req.csrfToken(),
          values,
          fieldErrors: { email: 'このメールアドレスは既に登録されています。' },
          globalError: ''
        });
      }

      // ハッシュ化
      const passwordHash = await bcrypt.hash(req.body.password, 12);

      // 作成（デフォルトは buyer ロール）
      const inserted = await dbQuery(
        `INSERT INTO users (name, email, password_hash, roles)
         VALUES ($1, $2, $3, ARRAY['buyer'])
         RETURNING id, name, email, roles`,
        [values.name, values.email, passwordHash]
      );
      const user = inserted[0];

      // セッション発行してダッシュボードへ
      req.session.user = { id: user.id, name: user.name, email: user.email, roles: user.roles };
      return res.redirect('/dashboard');

    } catch (err) {
      // 一意制約（万一の競合）
      if (err && err.code === '23505') {
        return res.status(409).render('auth/signup', {
          title: 'アカウント作成',
          csrfToken: req.csrfToken(),
          values,
          fieldErrors: { email: 'このメールアドレスは既に登録されています。' },
          globalError: ''
        });
      }
      console.error('signup error:', err);
      return res.status(500).render('auth/signup', {
        title: 'アカウント作成',
        csrfToken: req.csrfToken(),
        values,
        fieldErrors: {},
        globalError: 'サインアップ処理でエラーが発生しました。時間をおいて再度お試しください。'
      });
    }
  }
);

/* =========================================================
 *  ホーム
 * =======================================================*/
app.get('/', async (req, res, next) => {
  try {
    // 新着商品（公開・在庫>0）8件＋サムネ1枚
    const products = await dbQuery(`
      SELECT p.*, c.name AS category,
             (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position ASC LIMIT 1) AS image_url
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.status = 'public'
       ORDER BY p.published_at DESC NULLS LAST, p.created_at DESC
       LIMIT 8
    `);
    res.render('index', { title: '新・今日の食卓', products, blogPosts: [] }); // blogは未実装のため空配列
  } catch (e) { next(e); }
});

/* =========================================================
 * お問い合わせフォーム表示
 * GET /contact
 * =======================================================*/
app.get('/contact', csrfProtection, attachCsrf, (req, res) => {
  res.render('contact', {
    title: 'お問い合わせ',
    csrfToken: req.csrfToken(),
    form: {}
  });
});

const nodemailer = require('nodemailer');

const hasSmtp =
  process.env.SMTP_HOST && process.env.SMTP_PORT &&
  process.env.SMTP_USER && process.env.SMTP_PASS;

let mailer;
if (hasSmtp) {
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
} else {
  mailer = {
    sendMail: async (opt) => {
      console.log('[MAIL:DRYRUN] to=%s subject=%s\n%s', opt.to, opt.subject, opt.text || opt.html);
      return { messageId: 'dryrun' };
    }
  };
}

/* =========================================================
 * お問い合わせ送信（メール通知付き）
 * POST /contact
 * =======================================================*/
app.post(
  '/contact',
  csrfProtection,
  [
    body('name').trim().notEmpty().withMessage('お名前を入力してください'),
    body('email').isEmail().withMessage('有効なメールアドレスを入力してください'),
    body('type').isIn(['general','seller','order','technical','partnership','other']).withMessage('お問い合わせ種別を選択してください'),
    body('message').trim().isLength({ min: 1 }).withMessage('お問い合わせ内容を入力してください'),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    const { name, email, type, message } = req.body;

    if (!errors.isEmpty()) {
      const fieldErrors = {};
      for (const e of errors.array()) if (!fieldErrors[e.path]) fieldErrors[e.path] = e.msg;
      return res.status(422).render('contact', {
        title: 'お問い合わせ',
        csrfToken: req.csrfToken(),
        form: { name, email, type, message },
        fieldErrors
      });
    }

    try {
      // DB保存
      const rows = await dbQuery(
        `INSERT INTO contacts (name, email, type, message)
         VALUES ($1, $2, $3, $4)
         RETURNING id, created_at`,
        [String(name).trim(), String(email).trim().toLowerCase(), type, String(message).trim()]
      );
      const contact = rows[0];

      // 管理者向けメール
      const adminTo = process.env.CONTACT_TO || process.env.SMTP_USER || 'kouya114@outlook.jp';
      const from    = process.env.CONTACT_FROM || `kouya114@outlook.jp'}`;
      const subject = `[お問い合わせ] ${type.toUpperCase()} - ${name}`;
      const adminText =
`新規お問い合わせが届きました。

■ID: ${contact.id}
■日時: ${new Date(contact.created_at).toLocaleString('ja-JP')}
■種別: ${type}
■お名前: ${name}
■メール: ${email}

▼内容
${message}
`;

      await mailer.sendMail({
        from,
        to: adminTo,
        subject,
        text: adminText
      });

      // 送信者への自動返信（任意）
      try {
        await mailer.sendMail({
          from,
          to: email,
          subject: '【自動返信】お問い合わせありがとうございます',
          text:
`${name} 様

この度はお問い合わせありがとうございます。
担当者が内容を確認のうえ、通常1〜2営業日以内にご返信いたします。

--- お問い合わせ控え ---
お問い合わせ種別: ${type}
お名前: ${name}
メール: ${email}

内容:
${message}

今後ともよろしくお願いいたします。
`
        });
      } catch (e) {
        console.warn('auto-reply failed (skip):', e.message);
      }

      return res.redirect(`/contact/thanks?no=${contact.id}`);;
    } catch (e) {
      console.error('contact insert error:', e);
      return res.status(500).render('contact', {
        title: 'お問い合わせ',
        csrfToken: req.csrfToken(),
        form: { name, email, type, message },
        fieldErrors: {},
        globalError: '送信に失敗しました。時間をおいて再度お試しください。'
      });
    }
  }
);

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
      q, category, sort, page, flags, visible: 'all', pageSize: 20
    });

    const buildQuery = buildQueryPath('/products', { q, category, sort });

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
      popular: [],
      collections: [],
      recommended: [],
      recent: [],
      previewProducts: items,
      previewTotal: total,
      buildQuery,
      page: pageNum
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
      page: pageNum
    });
  } catch (e) { next(e); }
});

// /products/:slug（詳細）
app.get('/products/:slug', csrfProtection, attachCsrf, async (req, res, next) => {
  try {
    const slug = req.params.slug;
    const rows = await dbQuery(`
      SELECT p.*, c.name AS category_name, u.name AS seller_name
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        JOIN users u ON u.id = p.seller_id
       WHERE p.slug = $1
       LIMIT 1
    `, [slug]);
    const product = rows[0];
    if (!product) return next();

    const images = await dbQuery(
      `SELECT url, alt FROM product_images WHERE product_id = $1 ORDER BY position ASC`, [product.id]
    );
    const specs = await dbQuery(
      `SELECT label, value FROM product_specs WHERE product_id = $1 ORDER BY position ASC`, [product.id]
    );
    const tags = await dbQuery(
      `SELECT t.name, t.slug FROM product_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.product_id = $1 ORDER BY t.name ASC`,
      [product.id]
    );

    // 関連（同カテゴリの新着）
    const related = await dbQuery(`
      SELECT p.slug, p.title, p.price,
             (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position ASC LIMIT 1) AS image_url
        FROM products p
       WHERE p.status = 'public' AND p.category_id = $1 AND p.id <> $2
       ORDER BY p.published_at DESC NULLS LAST, p.created_at DESC
       LIMIT 10
    `, [product.category_id, product.id]);

    console.log(specs);
    res.set('Cache-Control', 'no-store');
    res.render('products/show', {
      title: product.title,
      product, images, specs, tags, related
    });
  } catch (e) { next(e); }
});

/* =========================================================
 *  出品（表示/保存）
 * =======================================================*/
// GET 出品フォーム（CSRF付与）
app.get(
  '/seller/listing-new',
  requireAuth,
  requireRole('seller'),
  csrfProtection, attachCsrf,
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

// POST 出品保存
app.post(
  '/seller/listing-new',
  requireAuth,
  requireRole('seller'),
  upload.array('images', 8),   // 画像バイナリは今回は未保存。imageUrls テキストを利用
  csrfProtection,
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
        fieldErrors,
        csrfToken: req.csrfToken()
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

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
          (seller_id, category_id, slug, title, description_html,
           price, unit, stock, is_organic, is_seasonal,
           ship_method, ship_days, status, published_at)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING id
      `;
      const pr = await dbQuery(insertProduct, [
        sellerId,
        Number(req.body.categoryId),
        slug,
        req.body.title,
        req.body.description, // 今はmarkdown扱いなし。必要なら両方保存へ変更
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
      const productId = pr[0].id;

      // 画像
      if (imageUrls.length) {
        const valuesSql = imageUrls.map((_, i) => `($1, $${i + 2}, ${i})`).join(',');
        await client.query(
          `INSERT INTO product_images (product_id, url, position) VALUES ${valuesSql}`,
          [productId, ...imageUrls]
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
      res.redirect(`/products/${slug}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('listing-new INSERT error:', err);
      res.status(500).render('seller/listing-new', {
        title: '新規出品',
        values, categories, tags: tagsMaster,
        fieldErrors: {},
        globalError: '保存中にエラーが発生しました。時間をおいて再度お試しください。',
        csrfToken: req.csrfToken()
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
  requireRole('seller'),
  csrfProtection, attachCsrf,
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!isUuid(id)) return res.status(400).render('errors/404', { title: '不正なID' });

      const sellerId = req.session.user.id;

      // 本体（所有者チェック）
      const productRows = await dbQuery(
        `SELECT *
           FROM products
          WHERE id = $1::uuid AND seller_id = $2::uuid
          LIMIT 1`,
        [id, sellerId]
      );
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

      return res.render('seller/listing-edit', {
        title: '出品を編集',
        product, categories, images, specs, tags,
        csrfToken: req.csrfToken()
      });
    } catch (e) { next(e); }
  }
);

// ========== 編集保存 ==========
app.post(
  '/seller/listing-edit/:id',
  requireAuth,
  requireRole('seller'),
  upload.none(),
  csrfProtection,
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

    // バリデーション
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // 再描画用データ
      const [productRows, categories, images, specs, tags] = await Promise.all([
        dbQuery(`SELECT * FROM products WHERE id = $1::uuid AND seller_id = $2::uuid LIMIT 1`, [id, sellerId]),
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
        csrfToken: req.csrfToken(),
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
    const description = req.body.description;

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
      const own = await client.query(
        `SELECT 1 FROM products WHERE id = $1::uuid AND seller_id = $2::uuid`,
        [id, sellerId]
      );
      if (!own.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).render('errors/404', { title: '商品が見つかりません' });
      }

      // 本体 UPDATE（slug は据え置き）
      await client.query(
        `UPDATE products SET
            category_id = $1,
            title = $2,
            description_html = $3,
            price = $4,
            unit = $5,
            stock = $6,
            is_organic = $7,
            is_seasonal = $8,
            ship_method = $9,
            ship_days = $10,
            status = $11,
            updated_at = now()
         WHERE id = $12::uuid`,
        [categoryId, title, description, price, unit, stock, isOrganic, isSeasonal, shipMethod, shipDays, status, id]
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

      // 5) INSERT: 新規URL行を末尾に追加
      if (newImageUrls.length) {
        // 現在の最大 position を取得
        const maxPosRes = await client.query(
          `SELECT COALESCE(MAX(position), -1) AS maxp
             FROM product_images
            WHERE product_id = $1::uuid`,
          [id]
        );
        let p = Number(maxPosRes.rows[0]?.maxp || -1);
        const values = newImageUrls.map((_, i) => `($1, $${i+2}, ${p + i + 1})`).join(',');
        await client.query(
          `INSERT INTO product_images (product_id, url, position) VALUES ${values}`,
          [id, ...newImageUrls]
        );
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
      const prod = await dbQuery(`SELECT slug FROM products WHERE id = $1::uuid LIMIT 1`, [id]);
      return res.redirect(`/products/${prod[0].slug}`);
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
        o.total,
        o.subtotal,
        o.discount,
        o.shipping_fee,
        o.created_at,
        o.updated_at,
        o.eta_at,
        o.note,
        o.reviewed,
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

    // EJS の期待プロパティ名に合わせて整形
    const items = rows.map(r => ({
      orderNo: r.order_no,
      status: r.status,
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

/* =========================================================
 *  ダッシュボード
 * =======================================================*/
app.get('/dashboard', requireAuth, (req, res) => {
  const roles = (req.session.user.roles || []);
  if (roles.includes('seller')) return res.redirect('/dashboard/seller');
  return res.redirect('/dashboard/buyer');
});

app.get('/dashboard/buyer', requireAuth, async (req, res, next) => {
  try {
    const uid = req.session.user.id;
    const [recentOrders, count] = await Promise.all([
      dbQuery(`
        SELECT o.id, o.total, o.status, o.created_at, COALESCE(o.order_number, o.id::text) AS order_no
          FROM orders o
         WHERE o.buyer_id = $1
         ORDER BY o.created_at DESC
         LIMIT 10
      `, [uid]),
      dbQuery(`SELECT COUNT(*)::int AS cnt FROM orders WHERE buyer_id = $1`, [uid])
    ]);
    res.render('dashboard/buyer', {
      title: 'ダッシュボード（購入者）',
      currentUser: req.session.user,
      orders: recentOrders,
      recent: recentOrders,
      notices: [],
      totalOrders: count[0]?.cnt || 0
    });
  } catch (e) { next(e); }
});

app.get('/dashboard/seller', requireAuth, requireRole('seller'), async (req, res, next) => {
  try {
    const uid = req.session.user.id;
    const [listings, trades, revenue] = await Promise.all([
      dbQuery(`
        SELECT p.slug, p.title, p.price, p.stock, p.id,
               (SELECT url FROM product_images WHERE product_id = p.id ORDER BY position ASC LIMIT 1) AS image_url
          FROM products p
         WHERE p.seller_id = $1
         ORDER BY p.updated_at DESC
         LIMIT 12
      `, [uid]),
      dbQuery(`
        SELECT COUNT(*)::int AS cnt
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
         WHERE oi.seller_id = $1
      `, [uid]),
      dbQuery(`
        SELECT COALESCE(SUM(oi.price),0)::int AS total
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
         WHERE oi.seller_id = $1 AND o.status = 'paid'
      `, [uid])
    ]);
    res.render('dashboard/seller', {
      title: 'ダッシュボード（出品者）',
      currentUser: req.session.user,
      listings,
      trades: trades[0]?.cnt || 0,
      revenue: revenue[0]?.total || 0
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

// セッション + DB のカートを読み込み、{ productId, quantity } に正規化
async function loadCartItems(req) {
  const sessItems = (req.session?.cart?.items || []).map(it => ({
    productId: String(it.productId || it.product_id || '').trim(),
    quantity: Math.max(1, parseInt(it.quantity, 10) || 1)
  }));

  let dbItems = [];
  if (req.session?.user?.id) {
    const uid = req.session.user.id;
    const cart = await getOrCreateUserCart(uid);
    const rows = await dbQuery(
      `SELECT product_id, quantity
         FROM cart_items
        WHERE cart_id = $1 AND saved_for_later = false
        ORDER BY created_at ASC`,
      [cart.id]
    );
    dbItems = rows.map(r => ({
      productId: String(r.product_id || '').trim(),
      quantity: Math.max(1, parseInt(r.quantity, 10) || 1)
    }));
  }

  // マージ（同じ productId は足し合わせ）
  const map = new Map();
  for (const src of [...dbItems, ...sessItems]) {
    if (!isUuid(src.productId)) continue;         // 変なIDは捨てる
    const prev = map.get(src.productId) || 0;
    map.set(src.productId, prev + src.quantity);
  }
  return [...map.entries()].map(([productId, quantity]) => ({ productId, quantity }));
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
      p.is_organic, p.is_seasonal,
      (SELECT url FROM product_images i
         WHERE i.product_id = p.id
         ORDER BY position ASC
         LIMIT 1) AS image_url
    FROM products p
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

/** 合計計算（割引・送料を含めたサマリー） */
function calcTotals(items, coupon) {
  const subtotal = items.reduce((acc, it) => acc + (toInt(it.price, 0) * toInt(it.quantity, 1)), 0);

  // クーポン（例: code=SUM10 → 10%OFF）
  let discount = 0;
  if (coupon && coupon.code) {
    if (coupon.type === 'percent') discount = Math.floor(subtotal * (coupon.value / 100));
    if (coupon.type === 'amount')  discount = Math.min(subtotal, Math.floor(coupon.value));
  }

  const shipping = subtotal === 0 || subtotal >= FREE_SHIP_THRESHOLD ? 0 : FLAT_SHIPPING;
  const total = Math.max(0, subtotal - discount) + shipping;

  return {
    subtotal,
    discount,
    shipping,
    total,
    freeShipRemain: Math.max(0, FREE_SHIP_THRESHOLD - subtotal)
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
app.get('/cart', csrfProtection, async (req, res, next) => {
  try {
    const cartItems = await loadCartItems(req);               // ← 変更
    const items = await fetchCartItemsWithDetails(cartItems); // ← 変更
    const totals = calcTotals(items, req.session?.cart?.coupon || null);

    res.render('cart/index', {
      title: 'カート',
      items,
      totals,
      csrfToken: req.csrfToken()
    });
  } catch (e) { next(e); }
});

/* ----------------------------
 *  POST /cart/add  カート追加
 *  body: { productId, quantity }
 * -------------------------- */
app.post('/cart/add', upload.none(), csrfProtection, async (req, res, next) => {
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
app.patch('/cart/:id', csrfProtection, async (req, res, next) => {
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
app.delete('/cart/:id', csrfProtection, async (req, res, next) => {
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

/* ----------------------------
 *  POST /cart/apply-coupon クーポン適用
 *  body: { code }
 *  例: SUM10 → 10%OFF
 * -------------------------- */
app.post('/cart/apply-coupon', csrfProtection, async (req, res, next) => {
  try {
    const { code } = req.body;
    const uid = authedUserId(req);

    // 正規化
    const norm = (code || '').trim().toUpperCase();

    if (uid) {
      if (!norm) {
        await dbCartSetCoupon(uid, null);
        const pairs = await loadDbCartItems(uid);
        // 合計返却（空クーポンで再計算）
        const items = await (async () => {
          if (!pairs.length) return [];
          const ids = pairs.map(p => p.productId);
          const ph = ids.map((_, i) => `$${i+1}`).join(',');
          const rows = await dbQuery(
            `SELECT p.id, p.slug, p.title, p.price, p.unit, p.stock, p.is_organic, p.is_seasonal,
                    (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY position ASC LIMIT 1) AS image_url
               FROM products p WHERE p.id IN (${ph})`, ids
          );
          const qmap = new Map(pairs.map(p => [p.productId, p.quantity]));
          return ids.map(id => rows.find(r => r.id === id)).filter(Boolean)
                    .map(r => ({ ...r, quantity: qmap.get(r.id) || 1 }));
        })();
        return res.json({ ok:true, applied:false, totals: calcTotals(items, null) });
      }

      if (norm === 'SUM10') {
        await dbCartSetCoupon(uid, norm);
        // 合計返す
        const pairs = await loadDbCartItems(uid);
        const ids = pairs.map(p => p.productId);
        let items = [];
        if (ids.length){
          const ph = ids.map((_, i)=>`$${i+1}`).join(',');
          const rows = await dbQuery(
            `SELECT p.id, p.slug, p.title, p.price, p.unit, p.stock, p.is_organic, p.is_seasonal,
                    (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY position ASC LIMIT 1) AS image_url
               FROM products p WHERE p.id IN (${ph})`, ids
          );
          const qmap = new Map(pairs.map(p => [p.productId, p.quantity]));
          items = ids.map(id => rows.find(r => r.id === id)).filter(Boolean)
                     .map(r => ({ ...r, quantity: qmap.get(r.id) || 1 }));
        }
        return res.json({ ok:true, applied:true, totals: calcTotals(items, { code:norm, type:'percent', value:10 }) });
      }

      await dbCartSetCoupon(uid, null);
      return res.json({ ok:true, applied:false });
    }

    // 未ログイン：セッション
    const cart = ensureCart(req);
    if (!norm) {
      cart.coupon = null;
      return res.json({ ok:true, applied:false });
    }
    if (norm === 'SUM10') {
      cart.coupon = { code:norm, type:'percent', value:10 };
      const items = await fetchCartItemsWithDetails(cart);
      return res.json({ ok:true, applied:true, totals: calcTotals(items, cart.coupon) });
    }
    cart.coupon = null;
    return res.json({ ok:true, applied:false });
  } catch (e) { next(e); }
});

// POST /cart/selection  選択中のカート商品IDを一時保存
app.post('/cart/selection', csrfProtection, (req, res) => {
  const ids = []
    .concat(req.body?.ids || [])
    .map(String)
    .map(s => s.trim())
    .filter(isUuid);

  if (!ids.length) {
    return res.status(400).json({ ok:false, message:'選択された商品がありません。' });
  }
  if (!req.session.cart) req.session.cart = { items: [], coupon: null };
  // セッションに選択IDを保存（チェックアウトのときだけ参照）
  req.session.cart.selection = ids;
  return res.json({ ok:true });
});

/* =========================================================
 *  出品管理 一覧
 *  GET /seller/listings?q&status=all|public|private|draft&sort&page=
 * =======================================================*/
app.get('/seller/listings',
  requireAuth, requireRole('seller'),
  csrfProtection, attachCsrf,
  async (req, res, next) => {
    try {
      const sellerId = req.session.user.id;
      const { q = '', status = 'all', sort = 'updated', page = 1 } = req.query;
      const pageNum  = Math.max(1, toInt(page, 1));
      const pageSize = 20;
      const offset   = (pageNum - 1) * pageSize;

      // 並び順
      let orderBy = 'p.updated_at DESC NULLS LAST';
      if (sort === 'priceAsc')  orderBy = 'p.price ASC, p.updated_at DESC';
      if (sort === 'priceDesc') orderBy = 'p.price DESC, p.updated_at DESC';
      if (sort === 'stockAsc')  orderBy = 'p.stock ASC, p.updated_at DESC';

      // WHERE
      const where = ['p.seller_id = $1'];
      const params = [sellerId];
      if (q) {
        params.push(`%${q}%`);
        where.push(`(p.title ILIKE $${params.length} OR p.description_html ILIKE $${params.length})`);
      }
      if (status !== 'all') {
        params.push(status);
        where.push(`p.status = $${params.length}`);
      }

      // 件数
      const cnt = await dbQuery(
        `SELECT COUNT(*)::int AS cnt FROM products p WHERE ${where.join(' AND ')}`, params
      );
      const total = cnt[0]?.cnt || 0;

      // 一覧
      const rows = await dbQuery(
        `
        SELECT
          p.id, p.slug, p.title, p.price, p.stock, p.status,
          p.is_organic, p.is_seasonal, p.updated_at,
          (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY position ASC LIMIT 1) AS image_url
        FROM products p
        WHERE ${where.join(' AND ')}
        ORDER BY ${orderBy}
        LIMIT ${pageSize} OFFSET ${offset}
        `,
        params
      );

      const pagination = { page: pageNum, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
      const buildQuery = buildQueryPath('/seller/listings', { q, status, sort });

      res.render('seller/listings', {
        title: '出品管理',
        listings: rows,
        total, q, status, sort,
        pagination,
        buildQuery,
        csrfToken: req.csrfToken()
      });
    } catch (e) { next(e); }
  }
);

/* =========================================================
 * 一括操作
 * POST /seller/listings/bulk  (ids, bulkAction)
 * =======================================================*/
app.post('/seller/listings/bulk',
  requireAuth, requireRole('seller'),
  csrfProtection,
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
  requireAuth, requireRole('seller'),
  csrfProtection,
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
  requireAuth, requireRole('seller'),
  csrfProtection,
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

/* =========================================================
 * 管理：お問い合わせ一覧
 * GET /admin/contacts?q&status=&type=&page=
 * =======================================================*/
app.get('/admin/contacts',
  requireAuth,
  requireRole('admin'),
  csrfProtection, attachCsrf,
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

      const list = await dbQuery(
        `
        SELECT id, name, email, type, status, created_at, handled_by, handled_at
          FROM contacts
         WHERE ${where.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT ${pageSize} OFFSET ${offset}
        `,
        params
      );

      const pagination = { page: pageNum, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
      const buildQuery = buildQueryPath('/admin/contacts', { q, status, type });

      res.render('admin/contacts/index', {
        title: 'お問い合わせ一覧',
        items: list,
        total, q, status, type,
        pagination, buildQuery,
        csrfToken: req.csrfToken()
      });
    } catch (e) { next(e); }
  }
);

/* =========================================================
 * 管理：お問い合わせ詳細
 * GET /admin/contacts/:id
 * =======================================================*/
app.get('/admin/contacts/:id',
  requireAuth, requireRole('admin'),
  csrfProtection, attachCsrf,
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      const rows = await dbQuery(`SELECT * FROM contacts WHERE id = $1::uuid LIMIT 1`, [id]);
      const c = rows[0];
      if (!c) return res.status(404).render('errors/404', { title: '見つかりません' });

      // 担当者名の表示（任意）
      let handler = null;
      if (c.handled_by) {
        const u = await dbQuery(`SELECT id, name, email FROM users WHERE id = $1`, [c.handled_by]);
        handler = u[0] || null;
      }

      res.render('admin/contacts/show', {
        title: `お問い合わせ詳細`,
        item: c,
        handler,
        csrfToken: req.csrfToken()
      });
    } catch (e) { next(e); }
  }
);

/* =========================================================
 * 管理：状態更新（対応開始/完了など）
 * POST /admin/contacts/:id/status  {status: open|in_progress|closed}
 * =======================================================*/
app.post('/admin/contacts/:id/status',
  requireAuth, requireRole('admin'),
  csrfProtection,
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      const next = String(req.body.status || '');
      if (!['open','in_progress','closed'].includes(next)) {
        return res.status(400).json({ ok:false, message:'不正な状態です。' });
      }

      // 対応者・対応日時の扱い
      let handledBy = null;
      let handledAt = null;
      if (next === 'in_progress' || next === 'closed') {
        handledBy = req.session.user.id;
        handledAt = new Date();
      }

      await dbQuery(
        `UPDATE contacts
            SET status = $1,
                handled_by = $2,
                handled_at = $3,
                updated_at = now()
          WHERE id = $4::uuid`,
        [next, handledBy, handledAt, id]
      );

      if (wantsJSON(req)) return res.json({ ok:true });
      res.redirect(`/admin/contacts/${id}`);
    } catch (e) { next(e); }
  }
);

/* ----------------------------
 *  GET /checkout  注文情報入力ページ
 * -------------------------- */
app.get('/checkout', csrfProtection, async (req, res, next) => {
  try {
    if (!req.session.user) {
      const nextUrl = encodeURIComponent('/checkout');
      return res.redirect(`/login?next=${nextUrl}`);
    }

    // カートの全アイテム（{productId, quantity}）
    const allPairs = await loadCartItems(req);

    // ★ 選択中IDがあれば絞り込み（なければ全件）
    const selectedIds = (req.session.cart && Array.isArray(req.session.cart.selection))
      ? new Set(req.session.cart.selection)
      : null;

    const pairs = selectedIds
      ? allPairs.filter(p => selectedIds.has(p.productId))
      : allPairs;

    // カート空 or 選択0 件なら戻す
    if (!pairs.length) {
      req.session.flash = { type: 'error', message: '購入対象の商品が選択されていません。' };
      return res.redirect('/cart');
    }

    const items  = await fetchCartItemsWithDetails(pairs);
    if (!items.length) {
      req.session.flash = { type: 'error', message: '購入対象の商品が見つかりません。' };
      return res.redirect('/cart');
    }

    // 合計（クーポンは既存のまま）
    const totals = calcTotals(items, req.session?.cart?.coupon || null);

    // 住所帳など既存処理はそのまま…
    const uid = req.session.user.id;
    const addresses = await dbQuery(
      `SELECT *
         FROM addresses
        WHERE user_id = $1 AND scope = 'user'
        ORDER BY is_default DESC, created_at DESC`,
      [uid]
    );
    const defaultAddr = addresses.find(a => a.is_default) || addresses[0] || null;
    const draft = req.session.checkoutDraft || {};
    const isInitial = !draft;
    const selectedShippingId = draft.shippingAddressId || defaultAddr?.id || null;
    const selectedBillingId  = draft.billSame ? null : (draft.billingAddressId || null);

    const form = {
      shippingAddressId: selectedShippingId,
      billSame: !!draft.billSame,
      billingAddressId: selectedBillingId,
      shipMethod: draft.shipMethod || '',     // 'normal' | 'cool'
      shipDate: draft.shipDate || '',         // 'YYYY-MM-DD'
      shipTime: draft.shipTime || '',         // '午前中' など
      paymentMethod: draft.paymentMethod || '', // 'cod' | 'bank' | 'card'
      orderNote: draft.orderNote || ''
    };

    res.render('checkout/index', {
      title: 'ご注文手続き',
      items,
      totals,
      addresses,
      selectedShippingId,
      selectedBillingId,
      coupon: req.session?.cart?.coupon || null,
      form,
      isInitial,
      csrfToken: req.csrfToken()
    });
  } catch (e) { next(e); }
});

/* ----------------------------
 *  POST /checkout  入力値をセッションの注文ドラフトに保存 → 確認へ
 * -------------------------- */
app.post('/checkout', csrfProtection, async (req, res, next) => {
  try {
    if (!req.session.user) return res.redirect('/login?next=' + encodeURIComponent('/checkout'));

    console.log('注文確認');
    const {
      shippingAddressId,
      billSame,
      billingAddressId,
      shipMethod,
      shipDate,
      shipTime,
      paymentMethod,
      orderNote,
      agree
    } = req.body;

    // バリデーション
    if (!shippingAddressId) {
      req.session.flash = { type: 'error', message: '配送先を選択してください。' };
      return res.redirect('/checkout');
    }
    if (!agree) {
      req.session.flash = { type: 'error', message: '利用規約に同意してください。' };
      return res.redirect('/checkout');
    }
    if (!['normal','cool'].includes(String(shipMethod || ''))) {
      req.session.flash = { type: 'error', message: '配送方法を選択してください。' };
      return res.redirect('/checkout');
    }
    if (!['cod','bank','card'].includes(String(paymentMethod || ''))) {
      req.session.flash = { type: 'error', message: 'お支払い方法を選択してください。' };
      return res.redirect('/checkout');
    }
    if (!billSame && !billingAddressId) {
      req.session.flash = { type: 'error', message: '請求先住所を選択してください。' };
      return res.redirect('/checkout');
    }

    // 住所の存在/所有者チェック（軽く）
    const uid = req.session.user.id;
    const shipAddrRows = await dbQuery(
      `SELECT id FROM addresses
        WHERE id = $1::uuid AND user_id = $2 AND scope='user' LIMIT 1`,
      [shippingAddressId, uid]
    );
    if (!shipAddrRows.length) {
      req.session.flash = { type: 'error', message: '配送先住所が不正です。' };
      return res.redirect('/checkout');
    }
    if (!billSame) {
      const billAddrRows = await dbQuery(
        `SELECT id FROM addresses
          WHERE id = $1::uuid AND user_id = $2 AND scope='user' LIMIT 1`,
        [billingAddressId, uid]
      );
      if (!billAddrRows.length) {
        req.session.flash = { type: 'error', message: '請求先住所が不正です。' };
        return res.redirect('/checkout');
      }
    }

    // カートが空なら戻す
    const pairs = await loadCartItems(req);
    const selectedIds = getSelectedIds(req);
    const filtered    = filterPairsBySelection(pairs, selectedIds);
    const items       = await fetchCartItemsWithDetails(filtered);

    if (!items.length) return res.redirect('/cart');

    // セッションに「注文ドラフト」を保存
    req.session.checkoutDraft = {
      shippingAddressId,
      billSame: !!billSame,
      billingAddressId: billSame ? null : billingAddressId,
      shipMethod,
      shipDate: shipDate || null,
      shipTime: shipTime || null,
      paymentMethod,
      orderNote: (orderNote || '').trim()
    };

    // 確認ページへ（未実装ならカートへ戻すなどでもOK）
    return res.redirect('/checkout/confirm');
  } catch (e) {
    next(e);
  }
});

/* ----------------------------
 *  POST /checkout/apply-coupon
 * -------------------------- */
app.post('/checkout/apply-coupon', csrfProtection, async (req, res, next) => {
  try {
    const { code } = req.body || {};
    const cart = ensureCart(req);

    if (!code) {
      cart.coupon = null;
      const items = await fetchCartItemsWithDetails(cart);
      return res.json({ ok: true, applied: false, totals: calcTotals(items, null) });
    }

    const norm = String(code).trim().toUpperCase();
    // 例: SUM10 → 10%OFF（本実装では coupons テーブルを参照）
    if (norm === 'SUM10') {
      cart.coupon = { code: norm, type: 'percent', value: 10 };
      const items = await fetchCartItemsWithDetails(cart);
      const totals = calcTotals(items, cart.coupon);
      return res.json({ ok: true, applied: true, totals });
    }

    cart.coupon = null;
    const items = await fetchCartItemsWithDetails(cart);
    return res.json({ ok: true, applied: false, totals: calcTotals(items, null) });
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
  csrfProtection,
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
app.get('/checkout/confirm', csrfProtection, async (req, res, next) => {
  try {
    if (!req.session?.user) {
      return res.redirect('/login?next=' + encodeURIComponent('/checkout/confirm'));
    }
    const draft = req.session.checkoutDraft;
    if (!draft) {
      // 入力が未完了
      req.session.flash = { type: 'error', message: '先に注文情報を入力してください。' };
      return res.redirect('/checkout');
    }

    // 注文対象（選択済みがあればそのみ）
    const items = await loadSelectedItemsWithDetails(req);
    if (!items.length) {
      req.session.flash = { type:'error', message:'カートに注文対象の商品がありません。' };
      return res.redirect('/cart');
    }

    // 住所（配送先/請求先）
    const uid = req.session.user.id;
    const shippingAddress = await findUserAddress(uid, draft.shippingAddressId);
    if (!shippingAddress) {
      req.session.flash = { type:'error', message:'配送先住所が不正です。' };
      return res.redirect('/checkout');
    }
    const billingAddress = draft.billSame
      ? null
      : await findUserAddress(uid, draft.billingAddressId);

    // 合計（クーポンはセッションの cart.coupon を利用）
    const totals = calcTotals(items, req.session?.cart?.coupon || null);

    res.render('checkout/confirm', {
      title: 'ご注文内容の確認',
      items,
      totals,
      draft,
      shippingAddress,
      billingAddress,
      shipMethod: draft.shipMethod,
      shipDate: draft.shipDate || null,
      shipTime: draft.shipTime || '',
      paymentMethod: draft.paymentMethod,
      orderNote: draft.orderNote || '',
      csrfToken: req.csrfToken()
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

/* ----------------------------
 *  POST /checkout/confirm  注文を確定
 * -------------------------- */
app.post('/checkout/confirm', csrfProtection, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!req.session?.user) {
      return res.redirect('/login?next=' + encodeURIComponent('/checkout/confirm'));
    }
    const uid = req.session.user.id;
    const draft = req.session.checkoutDraft;
    if (!draft) {
      req.session.flash = { type: 'error', message: '注文情報が見つかりません。' };
      return res.redirect('/checkout');
    }

    // 対象アイテム（選択済みがあればそれのみ）
    const pairs = await loadCartItems(req);                         // [{productId, quantity}]
    const selectedIds = getSelectedIds(req);
    const targetPairs = filterPairsBySelection(pairs, selectedIds); // 今回の注文対象
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

    // 合計計算（サーバ側で最終確定）
    const itemsForTotal = targetPairs.map(p => {
      const prod = byId.get(p.productId);
      return { price: prod.price, quantity: p.quantity };
    });
    const coupon = req.session?.cart?.coupon || null;
    const subtotal = itemsForTotal.reduce((a,b)=>a + (b.price*b.quantity), 0);
    const discount = coupon
      ? (coupon.type === 'percent'
          ? Math.floor(subtotal * (coupon.value/100))
          : Math.min(subtotal, Math.floor(coupon.value||0)))
      : 0;
    const shipping_fee = (subtotal === 0 || subtotal >= FREE_SHIP_THRESHOLD) ? 0 : FLAT_SHIPPING;
    const total = Math.max(0, subtotal - discount) + shipping_fee;

    // 住所の再確認
    const shipAddr = await findUserAddress(uid, draft.shippingAddressId);
    if (!shipAddr) {
      req.session.flash = { type:'error', message:'配送先住所が不正です。' };
      return res.redirect('/checkout');
    }
    const billAddr = draft.billSame ? null : await findUserAddress(uid, draft.billingAddressId);

    // 注文番号・ETA
    const orderNo = genOrderNo();
    const etaAt = draft.shipDate ? new Date(draft.shipDate) : null;

    await client.query('BEGIN');

    // orders
    const oins = await client.query(
      `INSERT INTO orders
         (order_number, buyer_id, status,
          subtotal, discount, shipping_fee, total,
          payment_method, note, eta_at, coupon_code)
       VALUES
         ($1, $2, 'pending',
          $3, $4, $5, $6,
          $7, $8, $9, $10)
       RETURNING id`,
      [
        orderNo, uid,
        subtotal, discount, shipping_fee, total,
        draft.paymentMethod, (draft.orderNote || '').slice(0,1000), etaAt,
        coupon?.code || null
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

    // 今回選択の記録はクリア（次回に持ち越さない）
    if (req.session?.cart) req.session.cart.selection = [];
    // チェックアウトドラフト/クーポンもクリア（任意）
    req.session.checkoutDraft = null;
    req.session.cart = req.session.cart || {};
    // クーポンは「使い切り」にしたいならここで null
    // req.session.cart.coupon = null;

    await client.query('COMMIT');

    // 完了へ
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
              o.status, o.subtotal, o.discount, o.shipping_fee, o.total,
              o.created_at, o.eta_at, o.payment_method, o.ship_method, o.coupon_code
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
      `SELECT p.slug, p.title, p.unit, oi.price, oi.quantity,
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
      ship_method: order.ship_method
    };

    const coupon = order.coupon_code ? { code: order.coupon_code } : null;

    res.set('Cache-Control', 'no-store');
    return res.render('checkout/complete', {
      title: 'ご注文ありがとうございました',
      order: viewOrder,
      items,
      shippingAddress,
      billingAddress,
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
app.get('/orders/:no', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const no = String(req.params.no || '').trim();
    const uid = req.session.user.id;

    // ─ 1) 注文本体（購入者チェック込み）
    const orderRows = await dbQuery(
      `
      SELECT
        o.*,
        COALESCE(o.order_number, o.id::text) AS ord_no
      FROM orders o
      WHERE (o.order_number = $1 OR o.id::text = $1)
        AND o.buyer_id = $2
      LIMIT 1
      `,
      [no, uid]
    );
    const order = orderRows[0];
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

    // ─ 4) 配送（出荷）情報
    const shipments = await dbQuery(
      `
      SELECT id, status, carrier, shipped_at, delivered_at, created_at
        FROM shipments
       WHERE order_id = $1
       ORDER BY created_at ASC
      `,
      [order.id]
    );

    // ─ 5) 支払い情報（最新一件を表示）
    const payRows = await dbQuery(
      `
      SELECT method, status, transaction_id, created_at
        FROM payments
       WHERE order_id = $1
       ORDER BY created_at DESC
       LIMIT 1
      `,
      [order.id]
    );
    const pay = payRows[0] || null;
    const methodLabelMap = { cod: '代金引換', bank: '銀行振込', card: 'クレジットカード' };
    const statusLabelMap = { pending: '保留', authorized: '与信済み', captured: '支払い完了', failed: '失敗', refunded: '返金済み' };
    const payment = pay
      ? {
          method: pay.method || '',
          status: pay.status || '',
          txid: pay.txid || '',
          method_label: methodLabelMap[pay.method] || pay.method || '—',
          status_label: statusLabelMap[pay.status] || pay.status || '—'
        }
      : null;

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

    // EJS へ
    res.render('orders/show', {
      title: '注文詳細',
      order: {
        ...order,
        orderNumber: order.ord_no,
        statusRank
      },
      items,
      totals,
      shippingAddress,
      // 請求先が無ければ null のまま → EJS 側で「同一です」表示
      billingAddress: billingAddress,
      shipments,
      payment,
      csrfToken: req.csrfToken()
    });
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
        o.created_at
      FROM orders o
      WHERE ${by} = $1
      LIMIT 1
    `,
    [orderNo]
  );
  const o = ordRows[0];
  if (!o) {
    const err = new Error('ORDER_NOT_FOUND');
    err.code = 'ORDER_NOT_FOUND';
    throw err;
  }

  // ---- 購入者 ----
  const userRows = await query(
    `SELECT id, name, email FROM users WHERE id = $1 LIMIT 1`,
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
        p.unit  AS unit
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = $1
      ORDER BY p.title ASC
    `,
    [o.id]
  );

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
    status: o.status,
    createdAt: o.created_at,
    paymentMethod: o.payment_method || '',
    paymentStatus: o.payment_status || '',
  };

  const items = itemRows.map(r => ({
    productId: r.product_id,
    name: r.product_name,
    unit: r.unit,
    quantity: Number(r.quantity || 0),
    unitPrice: Number(r.price || 0),
    lineTotal: Number(r.line_total || 0),
  }));

  const summary = { subtotal, discount, shippingFee, tax, total };

  return {
    order,
    buyer,
    shippingAddress,
    billingAddress,
    items,
    summary
  };
}

let __puppeteer__ = null;
async function getPuppeteer() {
  if (__puppeteer__) return __puppeteer__;
  __puppeteer__ = require('puppeteer');
  return __puppeteer__;
}

// Node.js の環境（Render等）で必要になりがちな起動オプション
function buildLaunchOptions() {
  const executablePath = undefined;

  if (executablePath && !fs.existsSync(executablePath)) {
    console.warn('[puppeteer] Not found at executablePath:', executablePath, '→ falling back to bundled Chromium');
    executablePath = undefined;
  }

  return {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--font-render-hinting=medium',
      '--disable-gpu',
      '--disable-dev-shm-usage'
    ]
  };
}

/**
 * HTML（相対パスのCSSあり）を PDF バッファに変換
 * @param {string} html - 完成済みのHTML
 * @param {string} baseUrl - 相対パス解決用に使うサイトのベースURL（例: https://example.com/）
 * @returns {Buffer}
 */
async function htmlToPdfBuffer(html, baseUrl) {
  const puppeteer = await getPuppeteer();
  const browser = await puppeteer.launch(buildLaunchOptions());
  const ep = await puppeteer.executablePath();
  console.log('[puppeteer] executablePath:', ep);
  try {
    const page = await browser.newPage();

    // 相対リンク解決用に <base> を注入
    const htmlWithBase = html.replace(
      /<head(.*?)>/i,
      `<head$1><base href="${baseUrl}">`
    );

    await page.setContent(htmlWithBase, {
      waitUntil: ['load', 'domcontentloaded', 'networkidle0']
    });

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
  const { order, buyer, shippingAddress, billingAddress, items, summary } =
    await fetchInvoiceData(dbQuery, { orderNo, userId });

  // ② EJS レンダリング（手順(2)のテンプレを使用）
  const html = await ejs.renderFile(
    path.join(__dirname, 'views', 'invoices', 'invoice.ejs'),
    { order, buyer, shippingAddress, billingAddress, items, summary },
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

/* =========================================================
 *  404 / Error
 * =======================================================*/
app.use((req, res) => {
  res.status(404).render('errors/404', { title: 'ページが見つかりません' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('サーバーエラーが発生しました。');
});

/* =========================================================
 *  Start
 * =======================================================*/
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});