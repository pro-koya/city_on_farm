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
function buildWhere({ q, category, flags, visible = 'public', buyerPartnerId, prefecture, audience, priceMin, priceMax }) {
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

    // 対象ユーザーフィルタ（buyerPartnerId: undefined=フィルタなし, null=個人, 値あり=法人）
    if (buyerPartnerId !== undefined) {
        if (buyerPartnerId) {
            where.push(`p.for_corporate = true`);
        } else {
            where.push(`p.for_individual = true`);
        }
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

    // 配送可能地域（都道府県）フィルタ — 複数選択対応
    // ※ seller_shipping_rules.seller_id は partners.id（法人ID）を参照
    //   products.seller_id は users.id なので users テーブル経由で partner_id を取得する
    // prefecture: カンマ区切り文字列 or 配列
    const prefList = Array.isArray(prefecture)
        ? prefecture.filter(Boolean)
        : (prefecture ? String(prefecture).split(',').filter(Boolean) : []);
    if (prefList.length > 0) {
        params.push(prefList);
        const n = params.length;
        where.push(`
        (
            -- 出品者に partner_id が無い、またはルール未設定 → 配送制限なしとみなす
            NOT EXISTS (
                SELECT 1 FROM seller_shipping_rules ssr0
                JOIN users u0 ON u0.partner_id = ssr0.seller_id
                WHERE u0.id = p.seller_id
            )
            OR
            -- ルール設定済み → 指定都道府県に配送可能か判定
            EXISTS (
                SELECT 1 FROM seller_shipping_rules ssr
                JOIN users u_ship ON u_ship.partner_id = ssr.seller_id
                WHERE u_ship.id = p.seller_id AND ssr.can_ship = true
                  AND (
                    -- 都道府県個別ルールで配送可
                    (ssr.scope = 'prefecture' AND ssr.prefecture = ANY($${n}::text[]))
                    OR
                    -- 全国一律で配送可、かつ指定都道府県に配送不可の個別ルールがない
                    (ssr.scope = 'all' AND NOT EXISTS (
                      SELECT 1 FROM seller_shipping_rules ssr2
                      JOIN users u_ship2 ON u_ship2.partner_id = ssr2.seller_id
                      WHERE u_ship2.id = p.seller_id
                        AND ssr2.scope = 'prefecture'
                        AND ssr2.prefecture = ANY($${n}::text[])
                        AND ssr2.can_ship = false
                    ))
                  )
            )
        )
        `);
    }

    // 対象ユーザーフィルタ（未ログイン時のみ手動選択）
    if (buyerPartnerId === undefined && audience) {
        if (audience === 'individual') where.push(`p.for_individual = true`);
        else if (audience === 'corporate') where.push(`p.for_corporate = true`);
    }

    // 価格帯フィルタ
    if (priceMin) {
        params.push(Number(priceMin));
        where.push(`p.price >= $${params.length}`);
    }
    if (priceMax) {
        params.push(Number(priceMax));
        where.push(`p.price <= $${params.length}`);
    }

    return { where, params };
}

/** 一覧＋件数を取得（汎用） */
async function fetchProductsWithCount(dbQuery, {
    q = '', category = 'all', sort = 'new',
    page = 1, pageSize = PAGE_SIZE_DEFAULT,
    flags = {}, visible = 'public', buyerPartnerId,
    prefecture, audience, priceMin, priceMax
}) {
    const { where, params } = buildWhere({ q, category, flags, visible, buyerPartnerId, prefecture, audience, priceMin, priceMax });
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
        p.is_organic, p.is_seasonal, p.for_individual, p.for_corporate,
        p.published_at, p.created_at,
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