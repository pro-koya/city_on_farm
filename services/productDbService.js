// services/productDbService.js
const PAGE_SIZE_DEFAULT = 20;

/** boolean系フラグを '1' / 'true' → true に正規化 */
function parseFlags(query) {
    const toBool = v => v === '1' || v === 'true' || v === true;
    return {
        organic:  toBool(query.organic),
        seasonal: toBool(query.seasonal),
        instock:  toBool(query.instock),
        bundle:   toBool(query.bundle),
    };
}

/** 並び順SQLを返す */
function getSortSql(sort = 'new') {
    switch (sort) {
        case 'popular':    return `p.stock DESC, p.updated_at DESC`; // 代替
        case 'price_asc':  return `p.price ASC, p.updated_at DESC`;
        case 'price_desc': return `p.price DESC, p.updated_at DESC`;
        case 'stock':      return `p.stock DESC, p.updated_at DESC`;
        case 'new':
        default:
        return `p.published_at DESC NULLS LAST, p.created_at DESC`;
    }
}

/** 検索条件の WHERE と params を構築（/products & /products/list で共用） */
function buildWhere({ q, category, flags, visible = 'public' }) {
    const where = [];
    const params = [];

    // 可視性
    if (visible === 'public') {
        where.push(`p.status = 'public'`);
    } else {
        where.push(`p.status = ANY(ARRAY['public','private']::product_status[])`);
    }

    // フリーテキスト
    if (q) {
        params.push(`%${q}%`);
        where.push(`(p.title ILIKE $${params.length} OR p.description_md ILIKE $${params.length})`);
    }

    // カテゴリ（name or slug どちらでも）
    if (category && category !== 'all') {
        params.push(category);
        where.push(`
        EXISTS (
            SELECT 1 FROM categories c
            WHERE c.id = p.category_id AND (c.name = $${params.length} OR c.slug = $${params.length})
        )
        `);
    }

    // チェックボックス
    if (flags.organic)  where.push(`p.is_organic = true`);
    if (flags.seasonal) where.push(`p.is_seasonal = true`);
    if (flags.instock)  where.push(`p.stock > 0`);
    if (flags.bundle) {
        where.push(`
        EXISTS (
            SELECT 1
            FROM product_tags pt
            JOIN tags t ON t.id = pt.tag_id
            WHERE pt.product_id = p.id AND t.slug = 'bundle'
        )
        `);
    }

    return { where, params };
}

/** 一覧＋件数を取得（汎用） */
async function fetchProductsWithCount(dbQuery, {
    q = '', category = 'all', sort = 'new',
    page = 1, pageSize = PAGE_SIZE_DEFAULT,
    flags = {}, visible = 'public'
}) {
    const { where, params } = buildWhere({ q, category, flags, visible });
    const orderBy = getSortSql(sort);

    const pageNum = Number(page) || 1;
    const limit = pageSize;
    const offset = (pageNum - 1) * pageSize;

    // 件数（LIMIT/OFFSET なし）
    const countSql = `
        SELECT COUNT(*)::int AS cnt
        FROM products p
        WHERE ${where.length ? where.join(' AND ') : 'TRUE'}
    `;
    const [{ cnt: total }] = await dbQuery(countSql, params);

    // データ
    const dataSql = `
        SELECT
        p.id, p.slug, p.title, p.price, p.unit, p.stock, p.has_variants,
        p.is_organic, p.is_seasonal, p.published_at, p.created_at,
        c.name AS category_name,
        u.name AS seller_name,
        pa.name AS seller_partner_name,
        pa.icon_url AS seller_partner_icon_url,
        (SELECT url
            FROM product_images i
            WHERE i.product_id = p.id
            ORDER BY position ASC
            LIMIT 1) AS image_url
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN users u ON u.id = p.seller_id
        LEFT JOIN partners pa ON pa.id = u.partner_id
        WHERE ${where.length ? where.join(' AND ') : 'TRUE'}
        ORDER BY ${orderBy}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const items = await dbQuery(dataSql, [...params, limit, offset]);
    return { items, total, pageNum, pageSize };
}

/** カテゴリ一覧（chips 用） */
async function fetchCategories(dbQuery) {
    const rows = await dbQuery(
        `SELECT id, name, slug
            FROM categories
            ORDER BY sort_order NULLS LAST, name ASC`
    );
    return rows;
}

module.exports = {
    parseFlags,
    getSortSql,
    buildWhere,
    fetchProductsWithCount,
    fetchCategories,
    PAGE_SIZE_DEFAULT,
};