// services/productService.js

/** 文字列の部分一致（大文字小文字無視） */
function includesIgnoreCase(s, q) {
  if (!q) return true;
  if (s == null) return false;
  return String(s).toLowerCase().includes(String(q).toLowerCase());
}

/** コレクション指定に応じた事前フィルタ */
function applyCollectionFilter(list, collection) {
  if (!collection) return list;
  switch (collection) {
    case 'season-now':  return list.filter(p => p.seasonal);
    case 'for-chefs':   return list.filter(p => p.category === '業務用' || p.bundle);
    case 'herb-fresh':  return list.filter(p => p.category === 'ハーブ');
    default:            return list;
  }
}

/** 検索・絞り込み */
function filterProducts(list, { q, category = 'all', organic, seasonal, instock, bundle }) {
  return list.filter(p => {
    const okQ   = includesIgnoreCase(p.name, q) || includesIgnoreCase(p.producer, q) || includesIgnoreCase(p.category, q);
    const okCat = category === 'all' ? true : p.category === category;
    const okOrg = organic  ? !!p.organic  : true;
    const okSea = seasonal ? !!p.seasonal : true;
    const okStk = instock  ? (p.stock > 0) : true;
    const okBnd = bundle   ? !!p.bundle   : true;
    return okQ && okCat && okOrg && okSea && okStk && okBnd;
  });
}

/** 並び替え */
function sortProducts(list, sort = 'new') {
  const arr = [...list];
  switch (sort) {
    case 'popular':    return arr.sort((a,b) => (b.popularity||0) - (a.popularity||0));
    case 'price_asc':  return arr.sort((a,b) => (a.price||0) - (b.price||0));
    case 'price_desc': return arr.sort((a,b) => (b.price||0) - (a.price||0));
    case 'stock':      return arr.sort((a,b) => (b.stock||0) - (a.stock||0));
    case 'new':
    default:
      return arr.sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }
}

/** ページネーション */
function paginate(list, { page = 1, pageSize = 20 }) {
  const total = list.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, parseInt(page, 10) || 1), pageCount);
  const start = (current - 1) * pageSize;
  const items = list.slice(start, start + pageSize);
  return { items, total, pagination: { page: current, pageCount } };
}

/** カテゴリ抽出 */
function getProductCategories(list) {
  return [...new Set(list.map(p => p.category))];
}

/** レール用データ（新着/人気/おすすめ） */
function getRails(base) {
  const now = Date.now();
  const newArrivals = sortProducts(base, 'new').slice(0, 10).map(p => ({
    ...p,
    isNew: now - Date.parse(p.createdAt) < 1000 * 60 * 60 * 24 * 7 // 7日以内
  }));
  const popular = sortProducts(base, 'popular').slice(0, 10);
  const recommended = sortProducts(base.filter(p => p.seasonal || p.organic), 'popular').slice(0, 10);
  return { newArrivals, popular, recommended };
}

/** 表示用フラグの付与（例：在庫わずか） */
function decorateProducts(list) {
  return list.map(p => ({ ...p, lowStock: p.stock > 0 && p.stock <= 10 }));
}

module.exports = {
  applyCollectionFilter,
  filterProducts,
  sortProducts,
  paginate,
  getProductCategories,
  getRails,
  decorateProducts,
};