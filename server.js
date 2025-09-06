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
const upload = multer();

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';
try { require('dotenv').config(); } catch { /* no-op */ }
app.set('trust proxy', 1);
// ローカル用のデフォルト値（自分の環境に合わせて）
const LOCAL_DB_URL = 'postgresql://koya1104:postgres@127.0.0.1:5432/city_on_firm';

/* ========== DB ========== */
const { Pool } = require('pg');
const externalDB = 'postgresql://city_on_firm_user:ruHjBG6tdZIgpWWxDNGmrxNmVkgbfaIP@dpg-d2u1oph5pdvs73a1ick0-a.oregon-postgres.render.com/city_on_firm';

// Renderの接続文字列（環境変数に置くのが推奨）
const dbUrl = process.env.DATABASE_URL || externalDB || LOCAL_DB_URL;
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
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  const items = req.session?.cart?.items || [];
  res.locals.cartCount = items.reduce((sum, it) => sum + (parseInt(it.quantity, 10) || 0), 0);
  next();
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
      hasIssues = '',           // ここでは例として payment_status='failed' or shipment_status='returned' を「問題あり」と解釈
      hasReviewable = '',       // レビュー可能（例：delivered 済で未レビュー）→ テーブル未作成のためダミー条件
      highAmount = ''           // grand_total >= 10000
    } = req.query;

    if (!dateFrom && !dateTo && range && range !== 'all') {
      const now = new Date();
      const d = new Date(now);
      if (range === '7d')  d.setDate(now.getDate() - 7);
      if (range === '30d') d.setDate(now.getDate() - 30);
      if (range === '90d') d.setDate(now.getDate() - 90);
      dateFrom = d.toISOString().slice(0,10);
      dateTo   = now.toISOString().slice(0,10);
    }

    const quickFilters = [];
    if (hasIssues)     quickFilters.push('hasIssues');
    if (hasReviewable) quickFilters.push('hasReviewable');
    if (highAmount)    quickFilters.push('highAmount');

    // WHERE 動的生成
    const where = ['1=1'];
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      where.push(`(o.order_number ILIKE $${params.length}
               OR EXISTS (
                    SELECT 1 FROM order_items oi
                     WHERE oi.order_id = o.id
                       AND (oi.product_title ILIKE $${params.length})
                  )
               )`);
    }
    if (status !== 'all') {
      params.push(status);
      where.push(`o.status = $${params.length}`);
    }
    if (dateFrom) {
      params.push(dateFrom + 'T00:00:00');
      where.push(`o.placed_at >= $${params.length}`);
    }
    if (dateTo) {
      params.push(dateTo + 'T23:59:59');
      where.push(`o.placed_at <= $${params.length}`);
    }
    if (hasIssues) {
      where.push(`(o.payment_status = 'failed' OR o.shipment_status = 'returned')`);
    }
    if (highAmount) {
      where.push(`o.grand_total >= 10000`);
    }

    // ページング
    const pageNum = Number(page) || 1;
    const pageSize = 10;
    const offset = (pageNum - 1) * pageSize;

    const totalRows = await dbQuery(`SELECT COUNT(*)::int AS cnt FROM orders o WHERE ${where.join(' AND ')}`, params);
    const total = totalRows[0]?.cnt || 0;

    // 注文一覧（合計、ステータス、アイテム数など）
    const items = await dbQuery(`
      SELECT
        o.id, o.order_number, o.status, o.payment_status, o.shipment_status,
        o.grand_total, o.currency, o.placed_at,
        (SELECT jsonb_agg(jsonb_build_object('title', oi.product_title, 'qty', oi.quantity, 'unit_price', oi.unit_price))
           FROM order_items oi
          WHERE oi.order_id = o.id
        ) AS items
      FROM orders o
      WHERE ${where.join(' AND ')}
      ORDER BY o.placed_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `, params);

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

    res.render('orders/recent', {
      title: '最近の注文',
      items, total, pagination,
      q, status, dateFrom, dateTo, range,
      page: pageNum,
      quickFilters,
      buildQuery
    });
  } catch (e) { next(e); }
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
        SELECT o.id, o.total, o.status, o.created_at
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
        SELECT p.slug, p.title, p.price, p.stock,
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

/** DB からカート内の商品詳細を取得して表示用に整形 */
async function fetchCartItemsWithDetails(cart) {
  if (!cart?.items?.length) return [];

  const ids = cart.items.map(i => i.productId);
  // プレースホルダ ($1,$2,...) を作る
  const ph = ids.map((_, i) => `$${i + 1}`).join(',');

  const sql = `
    SELECT
      p.id, p.slug, p.title, p.price, p.unit, p.stock,
      p.is_organic, p.is_seasonal,
      (SELECT url FROM product_images i
         WHERE i.product_id = p.id
         ORDER BY position ASC
         LIMIT 1) AS image_url
    FROM products p
    WHERE p.id IN (${ph})
  `;
  const rows = await dbQuery(sql, ids);

  // cart の順序を維持しつつ数量をマージ
  const qtyMap = new Map(cart.items.map(i => [i.productId, Math.max(1, toInt(i.quantity, 1))]));
  return ids
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

/* ----------------------------
 *  GET /cart  カート表示
 * -------------------------- */
app.get('/cart', csrfProtection, async (req, res, next) => {
  try {
    const cart = ensureCart(req);
    const items = await fetchCartItemsWithDetails(cart);
    const totals = calcTotals(items, cart.coupon);

    res.render('cart/index', {
      title: 'カート',
      items,
      totals,
      csrfToken: req.csrfToken()
    });
  } catch (e) {
    next(e);
  }
});

/* ----------------------------
 *  POST /cart/add  カート追加
 *  body: { productId, quantity }
 * -------------------------- */
app.post('/cart/add', csrfProtection, async (req, res, next) => {
  try {
    const { productId, quantity } = req.body;
    const qty = Math.max(1, toInt(quantity, 1));
    if (!productId) return res.status(400).json({ ok: false, message: 'productId が必要です。' });

    const cart = ensureCart(req);
    const found = cart.items.find(i => i.productId === productId);
    if (found) {
      found.quantity = Math.max(1, found.quantity + qty);
    } else {
      cart.items.push({ productId, quantity: qty });
    }
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ====== カートに入れる（フォーム/Fetch 両対応） ======
app.post('/cart', upload.none(), csrfProtection, attachCsrf, async (req, res, next) => {
  try {
    const productId = String(req.body.productId || '').trim();
    const qtyNum = Math.max(1, parseInt(req.body.qty, 10) || 1);

    if (!productId) {
      const msg = '商品が指定されていません。';
      if (wantsJSON(req)) return res.status(400).json({ ok:false, message: msg });
      req.session.flash = { type: 'error', message: msg };
      return res.redirect(req.get('Referer') || '/products');
    }

    // 商品をDBから取得（最低限の情報）
    const rows = await dbQuery(`
      SELECT
        p.id, p.title AS name, p.price, p.unit, p.stock,
        (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY position ASC LIMIT 1) AS image
      FROM products p
      WHERE p.id = $1 AND p.status = 'public'
      LIMIT 1
    `, [productId]);

    const prod = rows[0];
    if (!prod) {
      const msg = '商品が見つかりません。';
      if (wantsJSON(req)) return res.status(404).json({ ok:false, message: msg });
      req.session.flash = { type: 'error', message: msg };
      return res.redirect(req.get('Referer') || '/products');
    }
    if (prod.stock <= 0) {
      const msg = '在庫切れの商品です。';
      if (wantsJSON(req)) return res.status(409).json({ ok:false, message: msg });
      req.session.flash = { type: 'error', message: msg };
      return res.redirect(req.get('Referer') || '/products');
    }

    // セッションへ追加（同一商品は数量を加算）
    const cart = getCart(req);
    const idx = cart.items.findIndex(it => it.productId === prod.id);
    if (idx >= 0) {
      const nextQty = cart.items[idx].quantity + qtyNum;
      cart.items[idx].quantity = Math.min(nextQty, prod.stock); // 在庫上限でクランプ
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
    cart.updatedAt = new Date();

    // バッジ用件数を更新（res.locals は次リクエストで反映される）
    const cartCount = cart.items.reduce((s, it) => s + (parseInt(it.quantity,10)||0), 0);

    if (wantsJSON(req)) {
      return res.json({ ok:true, cartCount });
    } else {
      req.session.flash = { type: 'success', message: 'カートに追加しました。' };
      return res.redirect(req.get('Referer') || '/cart');
    }
  } catch (e) { next(e); }
});

/* ----------------------------
 *  PATCH /cart/:id  数量変更
 *  body: { quantity }
 * -------------------------- */
app.patch('/cart/:id', csrfProtection, async (req, res, next) => {
  try {
    const productId = req.params.id;
    let qty = Math.max(1, toInt(req.body?.quantity, 1));

    const cart = ensureCart(req);
    const row = cart.items.find(i => i.productId === productId);
    if (!row) return res.status(404).json({ ok: false, message: 'カートに見つかりません。' });

    // 在庫超過しないよう最新在庫を確認（任意）
    const stockRow = await dbQuery(`SELECT stock FROM products WHERE id = $1`, [productId]);
    const stock = toInt(stockRow?.[0]?.stock, 0);
    if (stock > 0) qty = Math.min(qty, stock);

    row.quantity = qty;
    return res.status(204).end();
  } catch (e) {
    next(e);
  }
});

/* ----------------------------
 *  DELETE /cart/:id  行削除
 * -------------------------- */
app.delete('/cart/:id', csrfProtection, (req, res, next) => {
  try {
    const productId = req.params.id;
    const cart = ensureCart(req);
    cart.items = cart.items.filter(i => i.productId !== productId);
    return res.status(204).end();
  } catch (e) {
    next(e);
  }
});

/* ----------------------------
 *  POST /cart/apply-coupon クーポン適用
 *  body: { code }
 *  例: SUM10 → 10%OFF
 * -------------------------- */
app.post('/cart/apply-coupon', csrfProtection, async (req, res, next) => {
  try {
    const { code } = req.body;
    const cart = ensureCart(req);

    if (!code) {
      cart.coupon = null;
      return res.json({ ok: true, applied: false });
    }

    const norm = String(code).trim().toUpperCase();
    if (norm === 'SUM10') {
      cart.coupon = { code: norm, type: 'percent', value: 10 };
      // 現在の合計を返すとUXがよい
      const items = await fetchCartItemsWithDetails(cart);
      const totals = calcTotals(items, cart.coupon);
      return res.json({ ok: true, applied: true, totals });
    }

    // 不正コード
    cart.coupon = null;
    return res.json({ ok: true, applied: false });
  } catch (e) {
    next(e);
  }
});

/* ----------------------------
 *  POST /checkout  チェックアウト入口
 *  ここではセッションの内容で合計を確定して確認画面へ
 * -------------------------- */
app.post('/checkout', csrfProtection, async (req, res, next) => {
  try {
    const cart = ensureCart(req);
    const items = await fetchCartItemsWithDetails(cart);

    // 在庫 0 のものや存在しないものを除外
    const validItems = items.filter(it => it.stock > 0);
    if (validItems.length === 0) {
      return res.status(400).render('cart/index', {
        title: 'カート',
        items: validItems,
        totals: calcTotals(validItems, cart.coupon),
        csrfToken: req.csrfToken(),
        globalError: '在庫切れのため購入手続きに進めませんでした。'
      });
    }

    const totals = calcTotals(validItems, cart.coupon);

    // ここで注文確認ページへ（未実装なら仮に同じ画面にTotalsだけ表示）
    // 実運用では /checkout/confirm にリダイレクトして、住所・支払方法選択へ遷移
    return res.render('cart/index', {
      title: 'カート',
      items: validItems,
      totals,
      csrfToken: req.csrfToken()
    });
  } catch (e) {
    next(e);
  }
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
 * 複製（画像・スペック・タグもコピー）
 * POST /seller/listings/:id/duplicate
 * =======================================================*/
app.post('/seller/listings/:id/duplicate',
  requireAuth, requireRole('seller'),
  csrfProtection,
  async (req, res, next) => {
    const sellerId = req.session.user.id;
    const srcId = String(req.params.id || '').trim();
    if (!isUuid(srcId)) return res.status(400).json({ ok:false, message:'不正なIDです。' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 元データ取得（所有チェック込み）
      const src = (await client.query(
        `SELECT * FROM products WHERE id = $1 AND seller_id = $2 LIMIT 1`,
        [srcId, sellerId]
      )).rows[0];
      if (!src) {
        await client.query('ROLLBACK');
        return res.status(404).json({ ok:false, message:'見つかりません。' });
      }

      // 新しい slug（重複回避）
      let slug = makeUniqueSlug(src.slug || src.title, 'copy');
      while ((await client.query(`SELECT 1 FROM products WHERE slug = $1 LIMIT 1`, [slug])).rowCount) {
        slug = makeUniqueSlug(src.slug || src.title, 'copy');
      }

      // 本体挿入（draftにする）
      const ins = await client.query(
        `INSERT INTO products
          (seller_id, category_id, slug, title, description_html,
           price, unit, stock, is_organic, is_seasonal,
           ship_method, ship_days, status, published_at, created_at, updated_at)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft',NULL,now(),now())
         RETURNING id`,
        [
          src.seller_id, src.category_id, slug, `${src.title}（複製）`, src.description_html,
          src.price, src.unit, src.stock, src.is_organic, src.is_seasonal,
          src.ship_method, src.ship_days
        ]
      );
      const newId = ins.rows[0].id;

      // 画像コピー
      const imgs = await client.query(
        `SELECT url, position, alt FROM product_images WHERE product_id = $1 ORDER BY position ASC`,
        [srcId]
      );
      if (imgs.rowCount) {
        const values = imgs.rows.map((_, i) => `($1,$${i*3+2},$${i*3+3},$${i*3+4})`).join(',');
        const params = [newId, ...imgs.rows.flatMap(r => [r.url, r.position, r.alt || null])];
        await client.query(
          `INSERT INTO product_images (product_id, url, position, alt) VALUES ${values}`, params
        );
      }

      // スペックコピー（任意）
      const specs = await client.query(
        `SELECT label, value, position FROM product_specs WHERE product_id = $1 ORDER BY position ASC`,
        [srcId]
      );
      if (specs.rowCount) {
        const values = specs.rows.map((_, i) => `($1,$${i*3+2},$${i*3+3},$${i*3+4})`).join(',');
        const params = [newId, ...specs.rows.flatMap(r => [r.label, r.value, r.position])];
        await client.query(
          `INSERT INTO product_specs (product_id, label, value, position) VALUES ${values}`, params
        );
      }

      // タグ紐付けコピー（任意）
      const t = await client.query(
        `SELECT tag_id FROM product_tags WHERE product_id = $1`, [srcId]
      );
      if (t.rowCount) {
        const values = t.rows.map((_, i) => `($1,$${i+2})`).join(',');
        const params = [newId, ...t.rows.map(r => r.tag_id)];
        await client.query(
          `INSERT INTO product_tags (product_id, tag_id) VALUES ${values} ON CONFLICT DO NOTHING`,
          params
        );
      }

      await client.query('COMMIT');
      return res.json({ ok:true, id:newId, slug });
    } catch (e) {
      await pool.query('ROLLBACK');
      next(e);
    } finally {
      client.release();
    }
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