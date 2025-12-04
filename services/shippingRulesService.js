'use strict';
const { pool, dbQuery } = require('./db');

/**
 * 出品者の送料ルールを取得
 */
async function getRulesForSeller(sellerId) {
  const rows = await dbQuery(
    `
      SELECT
        id,
        seller_id,
        scope,
        prefecture,
        city,
        shipping_fee,
        can_ship,
        priority
      FROM seller_shipping_rules
      WHERE seller_id = $1
      ORDER BY
        CASE scope
          WHEN 'all' THEN 0
          WHEN 'prefecture' THEN 1
          ELSE 2
        END,
        prefecture NULLS FIRST,
        city NULLS FIRST,
        priority ASC,
        created_at ASC
    `,
    [sellerId]
  );
  return rows;
}

/**
 * 新しいフォーム構造に対応した正規化
 * @param {{defaultRule: any, prefRules: any, cityRules: any}} payload
 */
function normalizeRulesFromForm(payload) {
  const { defaultRule, prefRules, cityRules } = payload || {};
  const normalized = [];

  // --- 全国デフォルト ---
  if (defaultRule) {
    const scopeVal = Array.isArray(defaultRule.scope)
      ? defaultRule.scope[0]
      : defaultRule.scope;
    if (scopeVal === 'all') {
      const rawCanShip = Array.isArray(defaultRule.can_ship)
        ? defaultRule.can_ship[0]
        : defaultRule.can_ship;
      const canShip = typeof rawCanShip !== 'undefined';

      let shippingFee = Array.isArray(defaultRule.shipping_fee)
        ? defaultRule.shipping_fee[0]
        : defaultRule.shipping_fee;
      if (shippingFee === '' || typeof shippingFee === 'undefined') {
        shippingFee = null;
      } else {
        const parsed = parseInt(String(shippingFee), 10);
        shippingFee = Number.isNaN(parsed) ? null : parsed;
      }

      const rawId = Array.isArray(defaultRule.id)
        ? defaultRule.id[0]
        : defaultRule.id;

      normalized.push({
        id: rawId || null,
        scope: 'all',
        prefecture: null,
        city: null,
        shipping_fee: shippingFee,
        can_ship: canShip,
        priority: 0
      });
    }
  }

  const toArray = (v) => (Array.isArray(v) ? v : (v ? [v] : []));

  // --- 都道府県ルール ---
  toArray(prefRules).forEach((r) => {
    if (!r) return;

    const scopeVal = Array.isArray(r.scope) ? r.scope[0] : r.scope || 'prefecture';
    if (scopeVal !== 'prefecture') return;

    const prefVal = Array.isArray(r.prefecture) ? r.prefecture[0] : r.prefecture;
    const prefecture = (prefVal || '').trim();
    if (!prefecture) return;

    const rawCanShip = Array.isArray(r.can_ship) ? r.can_ship[0] : r.can_ship;
    const canShip = typeof rawCanShip !== 'undefined';

    let shippingFee = Array.isArray(r.shipping_fee) ? r.shipping_fee[0] : r.shipping_fee;
    if (shippingFee === '' || typeof shippingFee === 'undefined') {
      shippingFee = null;
    } else {
      const parsed = parseInt(String(shippingFee), 10);
      shippingFee = Number.isNaN(parsed) ? null : parsed;
    }

    const rawId = Array.isArray(r.id) ? r.id[0] : r.id;

    normalized.push({
      id: rawId || null,
      scope: 'prefecture',
      prefecture,
      city: null,
      shipping_fee: shippingFee,
      can_ship: canShip,
      priority: 0
    });
  });

  // --- 市区町村ルール ---
  toArray(cityRules).forEach((r) => {
    if (!r) return;

    const scopeVal = Array.isArray(r.scope) ? r.scope[0] : r.scope || 'city';
    if (scopeVal !== 'city') return;

    const prefVal = Array.isArray(r.prefecture) ? r.prefecture[0] : r.prefecture;
    const cityVal = Array.isArray(r.city) ? r.city[0] : r.city;

    const prefecture = (prefVal || '').trim();
    const city = (cityVal || '').trim();
    if (!prefecture || !city) return;

    const rawCanShip = Array.isArray(r.can_ship) ? r.can_ship[0] : r.can_ship;
    const canShip = typeof rawCanShip !== 'undefined';

    let shippingFee = Array.isArray(r.shipping_fee) ? r.shipping_fee[0] : r.shipping_fee;
    if (shippingFee === '' || typeof shippingFee === 'undefined') {
      shippingFee = null;
    } else {
      const parsed = parseInt(String(shippingFee), 10);
      shippingFee = Number.isNaN(parsed) ? null : parsed;
    }

    const rawId = Array.isArray(r.id) ? r.id[0] : r.id;

    normalized.push({
      id: rawId || null,
      scope: 'city',
      prefecture,
      city,
      shipping_fee: shippingFee,
      can_ship: canShip,
      priority: 0
    });
  });

  return normalized;
}

/**
 * 出品者の送料ルールを保存
 */
async function saveRulesForSeller(sellerId, { defaultRule, prefRules, cityRules }) {
  const rules = normalizeRulesFromForm({ defaultRule, prefRules, cityRules });

  // 1. 既存ルール削除
  await dbQuery(
    `DELETE FROM seller_shipping_rules WHERE seller_id = $1`,
    [sellerId]
  );

  // 2. 再 INSERT
  for (const r of rules) {
    await dbQuery(
      `
        INSERT INTO seller_shipping_rules (
          seller_id,
          scope,
          prefecture,
          city,
          shipping_fee,
          can_ship,
          priority
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        sellerId,
        r.scope,
        r.prefecture || null,
        r.city || null,
        r.shipping_fee,
        r.can_ship,
        r.priority || 0
      ]
    );
  }
}

module.exports = {
  getRulesForSeller,
  saveRulesForSeller,
  normalizeRulesFromForm
};