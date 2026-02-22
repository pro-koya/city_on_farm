// services/invoiceService.js
// 月次請求書の生成・管理・入金消込サービス

const { dbQuery } = require('./db');
const logger = require('./logger');

/**
 * 請求書番号を生成
 * 形式: INV-YYYYMM-XXXX (連番)
 */
async function generateInvoiceNumber(yearMonth) {
  const prefix = `INV-${yearMonth.replace('-', '')}`;
  const rows = await dbQuery(
    `SELECT COUNT(*) AS cnt FROM monthly_invoices WHERE year_month = $1`,
    [yearMonth]
  );
  const seq = (parseInt(rows[0]?.cnt || 0, 10) + 1).toString().padStart(4, '0');
  return `${prefix}-${seq}`;
}

/**
 * 指定月の掛売注文を取引先ペアごとに集計し、月次請求書を生成
 * @param {string} yearMonth - 'YYYY-MM' 形式
 * @returns {Array} 作成された請求書の配列
 */
async function generateMonthlyInvoices(yearMonth) {
  logger.info('Generating monthly invoices', { yearMonth });

  // 掛売注文を buyer_partner_id × seller_id ペアで集計
  const aggregated = await dbQuery(
    `SELECT
       o.buyer_partner_id,
       o.seller_id AS seller_partner_id,
       SUM(o.subtotal) AS subtotal,
       SUM(o.total) AS total,
       SUM(o.total - o.subtotal) AS tax_and_shipping,
       COUNT(*) AS order_count
     FROM orders o
     WHERE o.payment_method = 'invoice'
       AND o.buyer_partner_id IS NOT NULL
       AND TO_CHAR(o.created_at, 'YYYY-MM') = $1
       AND o.status NOT IN ('canceled', 'cancelled')
     GROUP BY o.buyer_partner_id, o.seller_id`,
    [yearMonth]
  );

  if (!aggregated.length) {
    logger.info('No invoice orders found for period', { yearMonth });
    return [];
  }

  // 支払期限: 翌月末
  const [y, m] = yearMonth.split('-').map(Number);
  const nextMonth = m === 12 ? new Date(y + 1, 1, 0) : new Date(y, m + 1, 0);
  const dueDate = nextMonth.toISOString().split('T')[0];

  const invoices = [];
  for (const row of aggregated) {
    // 既に同じペア/月の請求書があればスキップ
    const existing = await dbQuery(
      `SELECT id FROM monthly_invoices
       WHERE buyer_partner_id = $1 AND seller_partner_id = $2 AND year_month = $3`,
      [row.buyer_partner_id, row.seller_partner_id, yearMonth]
    );
    if (existing.length) {
      logger.info('Invoice already exists, skipping', {
        buyerPartnerId: row.buyer_partner_id,
        sellerPartnerId: row.seller_partner_id,
        yearMonth
      });
      continue;
    }

    const invoiceNumber = await generateInvoiceNumber(yearMonth);
    const subtotal = parseInt(row.subtotal, 10) || 0;
    const total = parseInt(row.total, 10) || 0;
    const tax = total - subtotal;

    const result = await dbQuery(
      `INSERT INTO monthly_invoices
         (invoice_number, buyer_partner_id, seller_partner_id, year_month,
          subtotal, tax, total, status, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'unpaid', $8)
       RETURNING *`,
      [invoiceNumber, row.buyer_partner_id, row.seller_partner_id, yearMonth,
       subtotal, tax, total, dueDate]
    );

    invoices.push(result[0]);
    logger.info('Monthly invoice created', {
      invoiceNumber,
      buyerPartnerId: row.buyer_partner_id,
      total
    });
  }

  return invoices;
}

/**
 * 請求書一覧を取得
 */
async function listInvoices({ status, buyerPartnerId, sellerPartnerId, yearMonth, q, page = 1, limit = 20 }) {
  const params = [];
  const where = [];

  if (status && status !== 'all') {
    params.push(status);
    where.push(`mi.status = $${params.length}`);
  }
  if (buyerPartnerId) {
    params.push(buyerPartnerId);
    where.push(`mi.buyer_partner_id = $${params.length}::uuid`);
  }
  if (sellerPartnerId) {
    params.push(sellerPartnerId);
    where.push(`mi.seller_partner_id = $${params.length}::uuid`);
  }
  if (yearMonth) {
    params.push(yearMonth);
    where.push(`mi.year_month = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(mi.invoice_number ILIKE $${params.length} OR bp.name ILIKE $${params.length} OR sp.name ILIKE $${params.length})`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const countResult = await dbQuery(
    `SELECT COUNT(*) AS cnt
     FROM monthly_invoices mi
     LEFT JOIN partners bp ON bp.id = mi.buyer_partner_id
     LEFT JOIN partners sp ON sp.id = mi.seller_partner_id
     ${whereClause}`,
    params
  );
  const total = parseInt(countResult[0]?.cnt || 0, 10);

  params.push(limit);
  params.push(offset);
  const rows = await dbQuery(
    `SELECT mi.*,
       bp.name AS buyer_name,
       sp.name AS seller_name
     FROM monthly_invoices mi
     LEFT JOIN partners bp ON bp.id = mi.buyer_partner_id
     LEFT JOIN partners sp ON sp.id = mi.seller_partner_id
     ${whereClause}
     ORDER BY mi.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    items: rows,
    pagination: {
      page,
      limit,
      total,
      pageCount: Math.ceil(total / limit)
    }
  };
}

/**
 * 請求書詳細を取得（対象注文一覧 + 入金履歴付き）
 */
async function getInvoiceDetail(invoiceId) {
  const invoiceRows = await dbQuery(
    `SELECT mi.*,
       bp.name AS buyer_name, bp.postal_code AS buyer_postal,
       bp.prefecture AS buyer_prefecture, bp.city AS buyer_city,
       bp.address1 AS buyer_address1, bp.address2 AS buyer_address2,
       sp.name AS seller_name, sp.postal_code AS seller_postal,
       sp.prefecture AS seller_prefecture, sp.city AS seller_city,
       sp.address1 AS seller_address1, sp.address2 AS seller_address2
     FROM monthly_invoices mi
     LEFT JOIN partners bp ON bp.id = mi.buyer_partner_id
     LEFT JOIN partners sp ON sp.id = mi.seller_partner_id
     WHERE mi.id = $1::uuid`,
    [invoiceId]
  );
  if (!invoiceRows.length) return null;

  const invoice = invoiceRows[0];

  // 対象注文一覧
  const orders = await dbQuery(
    `SELECT o.id, o.order_number, o.total, o.subtotal, o.shipping_fee, o.discount,
       o.created_at, o.status, o.delivery_status
     FROM orders o
     WHERE o.payment_method = 'invoice'
       AND o.buyer_partner_id = $1::uuid
       AND o.seller_id = $2::uuid
       AND TO_CHAR(o.created_at, 'YYYY-MM') = $3
       AND o.status NOT IN ('canceled', 'cancelled')
     ORDER BY o.created_at ASC`,
    [invoice.buyer_partner_id, invoice.seller_partner_id, invoice.year_month]
  );

  // 入金履歴
  const payments = await dbQuery(
    `SELECT pr.*, u.name AS recorded_by_name
     FROM payment_records pr
     LEFT JOIN users u ON u.id = pr.recorded_by
     WHERE pr.invoice_id = $1::uuid
     ORDER BY pr.created_at ASC`,
    [invoiceId]
  );

  return { invoice, orders, payments };
}

/**
 * 入金消込を記録
 */
async function recordPayment(invoiceId, amount, method, userId, note) {
  logger.info('Recording payment', { invoiceId, amount, method, userId });

  // 入金レコード作成
  await dbQuery(
    `INSERT INTO payment_records (invoice_id, amount, method, recorded_by, note)
     VALUES ($1::uuid, $2, $3, $4::uuid, $5)`,
    [invoiceId, amount, method, userId, note || null]
  );

  // 請求書の paid_amount を更新
  const result = await dbQuery(
    `UPDATE monthly_invoices
     SET paid_amount = paid_amount + $1,
         updated_at = now()
     WHERE id = $2::uuid
     RETURNING *`,
    [amount, invoiceId]
  );

  if (result.length) {
    const inv = result[0];
    let newStatus = inv.status;
    if (inv.paid_amount >= inv.total) {
      newStatus = 'paid';
    } else if (inv.paid_amount > 0) {
      newStatus = 'partial';
    }

    if (newStatus !== inv.status) {
      await dbQuery(
        `UPDATE monthly_invoices
         SET status = $1,
             paid_at = CASE WHEN $1 = 'paid' THEN now() ELSE paid_at END,
             updated_at = now()
         WHERE id = $2::uuid`,
        [newStatus, invoiceId]
      );
    }

    // ★ 与信利用額を解放
    try {
      const { releaseCreditUsage } = require('./creditService');
      await releaseCreditUsage(inv.buyer_partner_id, amount);
    } catch (creditErr) {
      logger.error('Failed to release credit usage', { invoiceId, error: creditErr.message });
    }

    logger.info('Payment recorded', {
      invoiceId,
      amount,
      newPaidAmount: inv.paid_amount,
      newStatus
    });
  }

  return result[0] || null;
}

module.exports = {
  generateMonthlyInvoices,
  listInvoices,
  getInvoiceDetail,
  recordPayment
};
