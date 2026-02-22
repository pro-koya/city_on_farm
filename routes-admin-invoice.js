// routes-admin-invoice.js
// 月次請求書管理 + 入金消込ルート

const { listInvoices, getInvoiceDetail, recordPayment, generateMonthlyInvoices } = require('./services/invoiceService');
const { dbQuery } = require('./services/db');
const logger = require('./services/logger');

function registerAdminInvoiceRoutes(app, requireAuth, requireRole) {

  // ============================================================
  // 管理者: 請求書一覧
  // ============================================================
  app.get('/admin/invoices', requireAuth, requireRole(['admin']), async (req, res, next) => {
    try {
      const { status, buyer, seller, ym, q, page } = req.query;
      const result = await listInvoices({
        status: status || 'all',
        buyerPartnerId: buyer || null,
        sellerPartnerId: seller || null,
        yearMonth: ym || null,
        q: q || null,
        page: parseInt(page, 10) || 1
      });

      res.render('admin/invoices/index', {
        title: '請求書管理',
        items: result.items,
        pagination: result.pagination,
        filters: { status: status || 'all', buyer: buyer || '', seller: seller || '', ym: ym || '', q: q || '' },
        req
      });
    } catch (e) { next(e); }
  });

  // ============================================================
  // 管理者: 請求書詳細
  // ============================================================
  app.get('/admin/invoices/:id', requireAuth, requireRole(['admin']), async (req, res, next) => {
    try {
      const detail = await getInvoiceDetail(req.params.id);
      if (!detail) {
        req.session.flash = { type: 'error', message: '請求書が見つかりません。' };
        return res.redirect('/admin/invoices');
      }

      const flash = req.session.flash || null;
      req.session.flash = null;

      res.render('admin/invoices/show', {
        title: `請求書 ${detail.invoice.invoice_number}`,
        invoice: detail.invoice,
        orders: detail.orders,
        payments: detail.payments,
        flash,
        req
      });
    } catch (e) { next(e); }
  });

  // ============================================================
  // 管理者: 月次請求書一括生成
  // ============================================================
  app.post('/admin/invoices/generate', requireAuth, requireRole(['admin']), async (req, res, next) => {
    try {
      const { yearMonth } = req.body;
      if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
        req.session.flash = { type: 'error', message: '対象年月を正しく指定してください（例: 2026-02）。' };
        return res.redirect('/admin/invoices');
      }

      const invoices = await generateMonthlyInvoices(yearMonth);
      req.session.flash = {
        type: 'success',
        message: invoices.length
          ? `${yearMonth} の請求書を ${invoices.length} 件生成しました。`
          : `${yearMonth} に該当する掛売注文はありませんでした。`
      };
      return res.redirect('/admin/invoices');
    } catch (e) { next(e); }
  });

  // ============================================================
  // 管理者: 入金消込
  // ============================================================
  app.post('/admin/invoices/:id/payment', requireAuth, requireRole(['admin']), async (req, res, next) => {
    try {
      const { amount, method, note } = req.body;
      const parsedAmount = parseInt(amount, 10);
      if (!parsedAmount || parsedAmount <= 0) {
        req.session.flash = { type: 'error', message: '入金額を正しく入力してください。' };
        return res.redirect(`/admin/invoices/${req.params.id}`);
      }

      await recordPayment(
        req.params.id,
        parsedAmount,
        method || 'bank_transfer',
        req.session.user.id,
        note || null
      );

      req.session.flash = { type: 'success', message: `¥${parsedAmount.toLocaleString()} の入金を記録しました。` };
      return res.redirect(`/admin/invoices/${req.params.id}`);
    } catch (e) { next(e); }
  });

  // ============================================================
  // 購入者: 自組織の請求書一覧
  // ============================================================
  app.get('/my/invoices', requireAuth, async (req, res, next) => {
    try {
      const buyerPartnerId = req.session.user.partner_id;
      if (!buyerPartnerId) {
        return res.render('buyer/invoices', {
          title: '請求書',
          items: [],
          pagination: { page: 1, limit: 20, total: 0, pageCount: 0 },
          req
        });
      }

      const { page } = req.query;
      const result = await listInvoices({
        buyerPartnerId,
        page: parseInt(page, 10) || 1
      });

      res.render('buyer/invoices', {
        title: '請求書',
        items: result.items,
        pagination: result.pagination,
        req
      });
    } catch (e) { next(e); }
  });
}

module.exports = { registerAdminInvoiceRoutes };
