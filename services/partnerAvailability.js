// utils/partnerAvailability.js みたいなファイルにまとめておくと管理しやすいです
const { dbQuery } = require('./db'); // 既存の dbQuery を想定

async function getPartnerIdBySellerUserId(userId) {
  const rows = await dbQuery(
    `SELECT partner_id
       FROM users
      WHERE id = $1::uuid
      LIMIT 1`,
    [userId]
  );
  return rows[0]?.partner_id || null;
}

function formatDateUTC(date) {
  // Y-m-d 形式に揃える（タイムゾーンずれ防止で、ローカル日付で切る）
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * partnerId の availability を [from, to) でマップ化
 * 戻り値例:
 * {
 *   delivery: ['2025-11-26', '2025-11-28', ...],
 *   pickup:   ['2025-11-27', ...]
 * }
 */
async function loadPartnerAvailabilityByDate(partnerId, { from, to }) {
  if (!partnerId) return { delivery: [], pickup: [] };

  // 週パターン
  const weekly = await dbQuery(
    `SELECT kind, weekday, start_time, end_time
       FROM partner_weekday_availabilities
      WHERE partner_id = $1`,
    [partnerId]
  );

  // 特定日
  const specials = await dbQuery(
    `SELECT kind, date, start_time, end_time
       FROM partner_date_availabilities
      WHERE partner_id = $1
        AND date >= $2::date
        AND date <  $3::date`,
    [partnerId, formatDateUTC(from), formatDateUTC(to)]
  );

  const weeklyByKind = {
    delivery: new Set(),
    pickup: new Set(),
  };
  weekly.forEach(r => {
    if (r.kind === 'delivery' || r.kind === 'pickup') {
      weeklyByKind[r.kind].add(Number(r.weekday));
    }
  });

  const specialsByKind = {
    delivery: new Set(),
    pickup: new Set(),
  };
  specials.forEach(r => {
    const d = r.date.toISOString().slice(0, 10);
    if (r.kind === 'delivery' || r.kind === 'pickup') {
      specialsByKind[r.kind].add(d);
    }
  });

  const result = {
    delivery: [],
    pickup: [],
  };

  for (let cur = new Date(from); cur < to; cur = addDays(cur, 1)) {
    const ymd = formatDateUTC(cur);
    const wd  = cur.getDay(); // 0-6 (0:日)

    ['delivery', 'pickup'].forEach(kind => {
      const hasWeekly = weeklyByKind[kind].has(wd);
      const hasSpecial = specialsByKind[kind].has(ymd);

      // 仕様簡略化: 「weekly か specials に引っかかればその日はOK」
      if (hasWeekly || hasSpecial) {
        result[kind].push(ymd);
      }
    });
  }

  return result;
}

/**
 * sellerUserId から partner を辿り、その availability を返す
 */
async function loadAvailabilityForSellerUser(sellerUserId, { from, to }) {
  const partnerId = await getPartnerIdBySellerUserId(sellerUserId);
  if (!partnerId) return { delivery: [], pickup: [] };
  return loadPartnerAvailabilityByDate(partnerId, { from, to });
}

async function loadAvailabilityForPartner(partnerId, { from, to }) {
  if (!partnerId) return { delivery: [], pickup: [] };
  return loadPartnerAvailabilityByDate(partnerId, { from, to });
}

function buildAvailabilitySummary(weekly, specials) {
  const jpWeek = ['日','月','火','水','木','金','土'];

  const weekly_delivery_label = (weekly?.delivery && weekly.delivery.size)
    ? '毎週 ' + Array.from(weekly.delivery).sort().map(i => jpWeek[i]).join('・')
    : '';

  const weekly_pickup_label = (weekly?.pickup && weekly.pickup.size)
    ? '毎週 ' + Array.from(weekly.pickup).sort().map(i => jpWeek[i]).join('・')
    : '';

  const totalSpecials =
    (specials?.delivery?.length || 0) +
    (specials?.pickup?.length || 0);
  const specials_label = totalSpecials
    ? `特定日の追加: ${totalSpecials}日（配送: ${(specials.delivery||[]).length}・畑: ${(specials.pickup||[]).length}）`
    : '';

  // 直近2週間のプレビュー
  const preview = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const iso = `${y}-${m}-${dd}`;
    const w = d.getDay();

    const isDelivery =
      (weekly?.delivery && weekly.delivery.has(w)) ||
      (specials?.delivery || []).includes(iso);
    const isPickup =
      (weekly?.pickup && weekly.pickup.has(w)) ||
      (specials?.pickup || []).includes(iso);

    if (!isDelivery && !isPickup) continue;

    preview.push({
      date: iso,
      month: d.getMonth(),
      day: d.getDate(),
      weekday: jpWeek[w],
      delivery: !!isDelivery,
      pickup: !!isPickup
    });
  }

  return {
    weekly_delivery_label,
    weekly_pickup_label,
    specials_label,
    preview
  };
}

async function loadPartnerAvailabilityForPartner(id) {
    const [weeklyRows, dateRows] = await Promise.all([
        dbQuery(
            `SELECT kind, weekday
                FROM partner_weekday_availabilities
            WHERE partner_id = $1`,
            [id]
        ),
        dbQuery(
            `SELECT kind, date
                FROM partner_date_availabilities
            WHERE partner_id = $1
            ORDER BY date ASC`,
            [id]
        )
    ]);

    const weekly = {
        delivery: new Set(),
        pickup: new Set()
    };
    weeklyRows.forEach(r => {
        const kind = r.kind;
        if (kind === 'delivery' || kind === 'pickup') {
            weekly[kind].add(Number(r.weekday));
        }
    });

    // 特定日: これは Array のままで OK（buildAvailabilitySummary は .includes を使っている）
    const specials = {
        delivery: [],
        pickup: []
    };
    dateRows.forEach(r => {
        const kind = r.kind;
        if (kind === 'delivery' || kind === 'pickup') {
            const ymd = r.date.toISOString().slice(0, 10);
            specials[kind].push(ymd);
        }
    });

    return {
        weekly,
        specials
    };
}

module.exports = {
  getPartnerIdBySellerUserId,
  loadPartnerAvailabilityByDate,
  loadAvailabilityForSellerUser,
  buildAvailabilitySummary,
  loadPartnerAvailabilityForPartner,
  loadAvailabilityForPartner
};