// services/sellerProfileService.js

const { dbQuery } = require('./db');

/**
 * タグ入力を配列に変換
 * - カンマ, 全角カンマ, 空白, 改行で分割
 * - # は外す
 * - 重複除去 / 20個まで
 */
function parseTags(raw) {
  if (!raw) return [];
  const s = Array.isArray(raw) ? raw.join(',') : String(raw);
  return Array.from(
    new Set(
      s
        .split(/[,、\s\n]+/)
        .map((t) => t.replace(/^#/, '').trim())
        .filter(Boolean)
    )
  ).slice(0, 20);
}

/** user_id から user + partner 情報を取得 */
async function getUserAndPartner(userId) {
  const rows = await dbQuery(
    `
      SELECT
        u.id    AS user_id,
        u.name  AS user_name,
        p.seller_intro_summary AS seller_intro_summary,
        u.partner_id,
        p.name  AS partner_name
      FROM users u
      LEFT JOIN partners p
        ON p.id = u.partner_id
      WHERE u.id = $1::uuid
      LIMIT 1
    `,
    [userId]
  );
  return rows[0] || null;
}

/** partner_id からプロフィール取得（1:1 を想定） */
async function getProfileByPartnerId(partnerId) {
  if (!partnerId) return null;
  const rows = await dbQuery(
    `
      SELECT
        id,
        partner_id,
        last_updated_by_user_id,
        headline,
        intro_html,
        hero_image_url,
        hashtags,
        created_at,
        updated_at
      FROM seller_profiles
      WHERE partner_id = $1::uuid
      LIMIT 1
    `,
    [partnerId]
  );
  return rows[0] || null;
}

/**
 * partner 単位でプロフィールを upsert
 * @param {string} partnerId
 * @param {string} lastUpdatedByUserId
 * @param {object} payload
 *   - headline / title
 *   - intro_html / bodyHtml
 *   - hero_image_url / heroImageUrl
 *   - hashtags: string[]
 *   - rawTagsText: string
 */
async function upsertSellerProfileForPartner(partnerId, lastUpdatedByUserId, payload) {
  if (!partnerId) throw new Error('partnerId is required');

  const hashtagsArr = Array.isArray(payload.hashtags)
    ? payload.hashtags
    : parseTags(payload.rawTagsText || '');

  const existing = await getProfileByPartnerId(partnerId);

  const headline = payload.headline ?? payload.title ?? null;
  const introHtml = payload.intro_html ?? payload.bodyHtml ?? '';
  const heroImageUrl = payload.hero_image_url ?? payload.heroImageUrl ?? null;

  if (existing) {
    await dbQuery(
      `
        UPDATE seller_profiles
           SET headline               = $1,
               intro_html             = $2,
               hero_image_url         = $3,
               hashtags               = $4,
               last_updated_by_user_id = $5::uuid,
               updated_at             = now()
         WHERE partner_id = $6::uuid
      `,
      [headline, introHtml, heroImageUrl, hashtagsArr, lastUpdatedByUserId, partnerId]
    );
    return existing.id;
  } else {
    const rows = await dbQuery(
      `
        INSERT INTO seller_profiles (
          partner_id,
          last_updated_by_user_id,
          headline,
          intro_html,
          hero_image_url,
          hashtags
        ) VALUES (
          $1::uuid,
          $2::uuid,
          $3,
          $4,
          $5,
          $6
        )
        RETURNING id
      `,
      [partnerId, lastUpdatedByUserId, headline, introHtml, heroImageUrl, hashtagsArr]
    );
    return rows[0].id;
  }
}

/* =====================================================
 * ここから下が export される API 群
 * ===================================================*/

/**
 * マイページ用：user_id から
 * - partner 単位のプロフィール
 * - ユーザー情報
 * - タグ配列
 * を取得
 */
async function getProfileForUser(userId) {
  const info = await getUserAndPartner(userId);
  if (!info) return { profile: null, user: null, tags: [] };

  const profile = await getProfileByPartnerId(info.partner_id);
  const tags = Array.isArray(profile?.hashtags) ? profile.hashtags : [];

  const user = {
    id: info.user_id,
    name: info.user_name,
    seller_intro_summary: info.seller_intro_summary || '',
    partner_id: info.partner_id,
    partner_name: info.partner_name,
  };

  return { profile, user, tags };
}

/**
 * マイページ保存用：user_id 起点で partner プロフィール + 自分の概要を更新
 *
 * payload:
 *  - title / headline
 *  - introSummary (users.seller_intro_summary 用)
 *  - bodyHtml / intro_html
 *  - heroImageUrl / hero_image_url
 *  - rawTagsText
 */
async function upsertProfileForUser(userId, payload) {
  const info = await getUserAndPartner(userId);
  if (!info || !info.partner_id) {
    throw new Error('このユーザーには取引先が紐付いていません。');
  }

  // プロフィール本体（partner 単位）
  await upsertSellerProfileForPartner(info.partner_id, info.user_id, payload);

  // 概要（商品ページ等で使う短い紹介文）はユーザー毎
  if (typeof payload.introSummary !== 'undefined') {
    await updateSellerIntroSummary(info.user_id, payload.introSummary);
  }

  return true;
}

/**
 * 商品詳細用：user_id から「出品者ハイライト」を取得
 *  - 実体は partner 単位の profile + タグ
 */
async function getSellerHighlightByUserId(userId) {
  const info = await getUserAndPartner(userId);
  if (!info) return null;

  const profile = await getProfileByPartnerId(info.partner_id);
  const tags = Array.isArray(profile?.hashtags) ? profile.hashtags : [];

  return {
    user_id: info.user_id,
    partner_id: info.partner_id,
    name: info.partner_name || info.user_name,
    intro_summary: info.seller_intro_summary || null,
    hero_image_url: profile?.hero_image_url || null,
    tags,                    // この農家さんが大事にしていること
    headline: profile?.headline || null,
  };
}

/**
 * 公開用：user_id から profile + seller 情報（partnerベース）を取得
 */
async function getPublicProfileByUserId(userId) {
  const info = await getUserAndPartner(userId);
  if (!info || !info.partner_id) return null;

  const profile = await getProfileByPartnerId(info.partner_id);
  const tags = Array.isArray(profile?.hashtags) ? profile.hashtags : [];

  return {
    profile,
    seller: {
      id: info.user_id,
      name: info.partner_name || info.user_name,
      intro_summary: info.seller_intro_summary || '',
      partner_id: info.partner_id,
      partner_name: info.partner_name,
    },
    tags,
  };
}

/**
 * 公開用：紹介ページ + その出品者（partner）の商品一覧
 *  - URL は /sellers/:userId のままでも OK（内部で partner へ変換）
 */
async function getPublicProfileWithProducts(userId) {
  const base = await getPublicProfileByUserId(userId);
  if (!base || !base.seller.partner_id) return null;

  const products = await dbQuery(
    `
      SELECT p.*,
        u.name AS seller_name,
        pa.name AS seller_partner_name,
        pa.icon_url AS seller_partner_icon_url,
        (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY position ASC LIMIT 1) AS image_url
      FROM products p
        JOIN users u ON u.id = p.seller_id
        LEFT JOIN partners pa ON pa.id = u.partner_id
      WHERE u.partner_id = $1::uuid
        AND p.status = 'public'
      ORDER BY p.created_at DESC
      LIMIT 30
    `,
    [base.seller.partner_id]
  );

  return { ...base, products };
}

/**
 * 旧API互換：user_id から profile だけ返す
 */
async function getProfileByUserId(userId) {
  const { profile, user } = await getProfileForUser(userId);
  return { profile, user };
}

/**
 * 旧API互換：user_id から profile を upsert
 * （内部では partner 単位で保存）
 */
async function upsertSellerProfile(userId, payload) {
  const info = await getUserAndPartner(userId);
  if (!info || !info.partner_id) {
    throw new Error('このユーザーには取引先が紐付いていません。');
  }

  // ここでは概要は別途 updateSellerIntroSummary で更新してもらう前提
  const hashtagsArr = Array.isArray(payload.hashtags)
    ? payload.hashtags
    : parseTags(payload.hashtag_input || payload.rawTagsText || '');

  await upsertSellerProfileForPartner(info.partner_id, info.user_id, {
    ...payload,
    hashtags: hashtagsArr,
  });
}

/**
 * 出品者概要（users.seller_intro_summary）を更新
 */
async function updateSellerIntroSummary(userId, summary) {
  const rows = await dbQuery(
    `
      SELECT
        partner_id
      FROM users
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [userId]
  );

  await dbQuery(
    `
      UPDATE partners
         SET seller_intro_summary = $1,
             updated_at = now()
       WHERE id = $2::uuid
    `,
    [summary || null, rows[0].partner_id]
  );
}

/**
 * 公開用：user_id からまとめて公開情報を取得
 *  - プロフィール・店舗名・住所など
 */
async function getPublicSellerProfile(userId) {
  const info = await getUserAndPartner(userId);
  if (!info || !info.partner_id) return null;

  const profile = await getProfileByPartnerId(info.partner_id);

  return {
    user_id: info.user_id,
    user_name: info.user_name,
    seller_intro_summary: info.seller_intro_summary,
    partner_id: info.partner_id,
    partner_name: info.partner_name,
    headline: profile?.headline || null,
    intro_html: profile?.intro_html || '',
    hero_image_url: profile?.hero_image_url || null,
    hashtags: profile?.hashtags || [],
  };
}

module.exports = {
  // 新ロジック
  getProfileForUser,
  upsertProfileForUser,
  getPublicProfileByUserId,
  getPublicProfileWithProducts,
  getSellerHighlightByUserId,

  // 旧API互換（/seller/profile/edit などで利用）
  getProfileByUserId,
  upsertSellerProfile,
  updateSellerIntroSummary,
  getPublicSellerProfile,
};