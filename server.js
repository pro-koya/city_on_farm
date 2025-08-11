// server.js
const path = require('path');
const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

// ===== View Engine / Static =====
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // 明示
app.use(express.static(path.join(__dirname, 'public')));

// ===== Body Parsers =====
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ===== Dev/Test Data =====
const { products, blogPosts } = require('./data/testData'); // ホームで使う仮データ
const { findPost, getPrev, getNext, getRelated, getCategories } = require('./services/blogService'); // ブログ用の getCategories
const { products: ALL_PRODUCTS, collections } = require('./data/testData'); // 商品一覧用
const {
  applyCollectionFilter, filterProducts, sortProducts,
  paginate, getProductCategories, getRails, decorateProducts
} = require('./services/productService');

// ===== Utils =====
// 任意の basePath でクエリ文字列を組み立てる高階関数
function buildQueryPath(basePath, base) {
  return (params = {}) => {
    const merged = { ...base, ...params };
    Object.keys(merged).forEach(
      k => (merged[k] === undefined || merged[k] === '' || merged[k] === null) && delete merged[k]
    );
    const qs = Object.entries(merged)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return `${basePath}${qs ? `?${qs}` : ''}`;
  };
}

// ===== Routes =====

// ホーム
app.get('/', (req, res) => {
  res.render('index', {
    title: '新・今日の食卓',
    products,
    blogPosts
  });
});

// お問い合わせ（GET/POST）
app.get('/contact', (req, res) => {
  res.render('contact', {
    title: 'お問い合わせ',
    form: {} // 初回は空
  });
});

app.post('/contact', (req, res) => {
  const { name, email, type, message } = req.body;
  // TODO: バリデーション・保存・メール送信等
  res.render('contact', {
    title: 'お問い合わせ',
    form: req.body,
    notice: 'お問い合わせありがとうございました。'
  });
});

// ブログ一覧
app.get('/blog', (req, res) => {
  const categories = getCategories(blogPosts); // ※ブログ用のカテゴリ
  res.render('blog/index', {
    title: 'ブログ一覧',
    blogPosts,
    categories
  });
});

// ブログ詳細
app.get('/blog/:slug', (req, res, next) => {
  const post = findPost(req.params.slug, blogPosts);
  if (!post) return next(); // 404へ

  const prevPost = getPrev(post, blogPosts);
  const nextPost = getNext(post, blogPosts);
  const related  = getRelated(post, blogPosts, 6);

  res.render('blog/show', {
    title: post.title,
    post, prevPost, nextPost, related
  });
});

// ===== Products Hub（発見＋プレビュー20件） =====
app.get('/products', (req, res) => {
  const {
    q = '', sort = 'new', category = 'all',
    organic, seasonal, instock, bundle,
    collection
  } = req.query;

  // コレクション適用後のベース集合
  const base = applyCollectionFilter(ALL_PRODUCTS, collection);

  // レール（新着/人気/おすすめ）
  const { newArrivals, popular, recommended } = getRails(base);

  // プレビュー20件（現在の検索・絞り込み・ソートを反映）
  const filteredForPreview = sortProducts(
    filterProducts(base, {
      q, category,
      organic: !!organic, seasonal: !!seasonal, instock: !!instock, bundle: !!bundle
    }),
    sort
  );
  const previewTotal = filteredForPreview.length;
  const previewProducts = decorateProducts(filteredForPreview.slice(0, 20));

  const categories = getProductCategories(ALL_PRODUCTS); // ※商品用カテゴリ抽出

  // /products/list へ飛ばすリンクビルダ（page=1固定で誘導）
  const buildQuery = buildQueryPath('/products/list', {
    q, sort, category,
    organic: organic ? 1 : '',
    seasonal: seasonal ? 1 : '',
    instock: instock ? 1 : '',
    bundle: bundle ? 1 : '',
    collection,
    page: 1
  });

  res.render('products/index', {
    title: '商品一覧',
    q, sort, category,
    organic: !!organic, seasonal: !!seasonal, instock: !!instock, bundle: !!bundle,
    collection: collection || '',
    categories,
    newArrivals, popular, collections, recommended,
    recent: [],
    // 👇 プレビュー表示用
    previewProducts,
    previewTotal,
    buildQuery
  });
});

// ===== Products List（一覧＋ページネーション特化） =====
app.get('/products/list', (req, res) => {
  const {
    q = '', sort = 'new', category = 'all',
    organic, seasonal, instock, bundle,
    collection, page = 1
  } = req.query;

  const base = applyCollectionFilter(ALL_PRODUCTS, collection);

  // 検索・絞り込み・並び替え
  let filtered = filterProducts(base, {
    q, category,
    organic: !!organic, seasonal: !!seasonal, instock: !!instock, bundle: !!bundle
  });
  filtered = sortProducts(filtered, sort);

  // ページング（20件/ページ）
  const { items, total, pagination } = paginate(filtered, { page, pageSize: 20 });
  const listProducts = decorateProducts(items);

  const categories = getProductCategories(ALL_PRODUCTS); // ← ここを getCategories ではなく getProductCategories に修正

  // 一覧内のページ遷移は同じ /products/list を維持
  const buildQuery = buildQueryPath('/products/list', {
    q, sort, category,
    organic: organic ? 1 : '',
    seasonal: seasonal ? 1 : '',
    instock: instock ? 1 : '',
    bundle: bundle ? 1 : '',
    collection
  });

  res.render('products/list', {
    title: '商品一覧',
    q, sort, category,
    organic: !!organic, seasonal: !!seasonal, instock: !!instock, bundle: !!bundle,
    collection: collection || '',
    categories,
    products: listProducts,
    total,
    pagination,
    buildQuery
  });
});

// ===== 404 =====
app.use((req, res) => {
  res.status(404).render('404', { title: 'ページが見つかりません' });
});

// ===== Error Handler（開発用簡易版） =====
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('サーバーエラーが発生しました。');
});

// ===== Start =====
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});