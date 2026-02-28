// routes-admin-invoice.js
// 月次請求書管理 + 入金消込ルート

const { listInvoices, getInvoiceDetail, recordPayment, generateMonthlyInvoices } = require('./services/invoiceService');
const { dbQuery } = require('./services/db');
const logger = require('./services/logger');

function registerAdminInvoiceRoutes(app, requireAuth, requireRole, utils = {}) {
  const { htmlToPdfBuffer } = utils;

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

      // 出品者の銀行情報を取得
      let sellerBankInfo = null;
      if (detail.invoice.seller_partner_id) {
        const bankRows = await dbQuery(
          `SELECT bank_name, bank_branch_name, bank_branch_code, bank_account_type, bank_account_number, bank_account_holder
           FROM partners WHERE id = $1::uuid`,
          [detail.invoice.seller_partner_id]
        );
        if (bankRows.length && bankRows[0].bank_name) sellerBankInfo = bankRows[0];
      }

      res.render('admin/invoices/show', {
        title: `請求書 ${detail.invoice.invoice_number}`,
        invoice: detail.invoice,
        orders: detail.orders,
        payments: detail.payments,
        sellerBankInfo,
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
  // 出品者: 請求書一覧（自分宛の請求書）
  // ============================================================
  app.get('/seller/invoices', requireAuth, async (req, res, next) => {
    try {
      const sellerPartnerId = req.session.user.partner_id;
      if (!sellerPartnerId) {
        req.session.flash = { type: 'error', message: '出品者アカウントが必要です。' };
        return res.redirect('/');
      }

      const { status, ym, q, page } = req.query;
      const result = await listInvoices({
        status: status || 'all',
        sellerPartnerId,
        yearMonth: ym || null,
        q: q || null,
        page: parseInt(page, 10) || 1
      });

      const flash = req.session.flash || null;
      req.session.flash = null;

      res.render('seller/invoices/index', {
        title: '請求書管理',
        items: result.items,
        pagination: result.pagination,
        filters: { status: status || 'all', ym: ym || '', q: q || '' },
        flash,
        req
      });
    } catch (e) { next(e); }
  });

  // ============================================================
  // 出品者: 請求書詳細（入金消込付き）
  // ============================================================
  app.get('/seller/invoices/:id', requireAuth, async (req, res, next) => {
    try {
      const sellerPartnerId = req.session.user.partner_id;
      if (!sellerPartnerId) {
        req.session.flash = { type: 'error', message: '出品者アカウントが必要です。' };
        return res.redirect('/');
      }

      const detail = await getInvoiceDetail(req.params.id);
      if (!detail || detail.invoice.seller_partner_id !== sellerPartnerId) {
        req.session.flash = { type: 'error', message: '請求書が見つかりません。' };
        return res.redirect('/seller/invoices');
      }

      const flash = req.session.flash || null;
      req.session.flash = null;

      // 出品者の銀行情報を取得
      let sellerBankInfo = null;
      if (detail.invoice.seller_partner_id) {
        const bankRows = await dbQuery(
          `SELECT bank_name, bank_branch_name, bank_branch_code, bank_account_type, bank_account_number, bank_account_holder
           FROM partners WHERE id = $1::uuid`,
          [detail.invoice.seller_partner_id]
        );
        if (bankRows.length && bankRows[0].bank_name) sellerBankInfo = bankRows[0];
      }

      res.render('seller/invoices/show', {
        title: `請求書 ${detail.invoice.invoice_number}`,
        invoice: detail.invoice,
        orders: detail.orders,
        payments: detail.payments,
        sellerBankInfo,
        flash,
        req
      });
    } catch (e) { next(e); }
  });

  // ============================================================
  // 出品者: 月次請求書一括生成
  // ============================================================
  app.post('/seller/invoices/generate', requireAuth, async (req, res, next) => {
    try {
      const sellerPartnerId = req.session.user.partner_id;
      if (!sellerPartnerId) {
        req.session.flash = { type: 'error', message: '出品者アカウントが必要です。' };
        return res.redirect('/');
      }

      const { yearMonth } = req.body;
      if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
        req.session.flash = { type: 'error', message: '対象年月を正しく指定してください（例: 2026-02）。' };
        return res.redirect('/seller/invoices');
      }

      const invoices = await generateMonthlyInvoices(yearMonth);
      // 出品者向けは自分の請求書のみカウント
      const myInvoices = invoices.filter(inv => inv.seller_partner_id === sellerPartnerId);
      req.session.flash = {
        type: 'success',
        message: myInvoices.length
          ? `${yearMonth} の請求書を ${myInvoices.length} 件生成しました。`
          : `${yearMonth} に該当する掛売注文はありませんでした。`
      };
      return res.redirect('/seller/invoices');
    } catch (e) { next(e); }
  });

  // ============================================================
  // 出品者: 入金消込
  // ============================================================
  app.post('/seller/invoices/:id/payment', requireAuth, async (req, res, next) => {
    try {
      const sellerPartnerId = req.session.user.partner_id;
      if (!sellerPartnerId) {
        req.session.flash = { type: 'error', message: '出品者アカウントが必要です。' };
        return res.redirect('/');
      }

      // 請求書が自分のものか確認
      const detail = await getInvoiceDetail(req.params.id);
      if (!detail || detail.invoice.seller_partner_id !== sellerPartnerId) {
        req.session.flash = { type: 'error', message: '請求書が見つかりません。' };
        return res.redirect('/seller/invoices');
      }

      const { amount, method, note } = req.body;
      const parsedAmount = parseInt(amount, 10);
      if (!parsedAmount || parsedAmount <= 0) {
        req.session.flash = { type: 'error', message: '入金額を正しく入力してください。' };
        return res.redirect(`/seller/invoices/${req.params.id}`);
      }

      await recordPayment(
        req.params.id,
        parsedAmount,
        method || 'bank_transfer',
        req.session.user.id,
        note || null
      );

      req.session.flash = { type: 'success', message: `¥${parsedAmount.toLocaleString()} の入金を記録しました。` };
      return res.redirect(`/seller/invoices/${req.params.id}`);
    } catch (e) { next(e); }
  });

  // ============================================================
  // 購入者: 請求書詳細
  // ============================================================
  app.get('/my/invoices/:id', requireAuth, async (req, res, next) => {
    try {
      const buyerPartnerId = req.session.user.partner_id;
      if (!buyerPartnerId) {
        return res.status(403).render('errors/403', { title: '権限がありません' });
      }

      const detail = await getInvoiceDetail(req.params.id);
      if (!detail || detail.invoice.buyer_partner_id !== buyerPartnerId) {
        req.session.flash = { type: 'error', message: '請求書が見つかりません。' };
        return res.redirect('/my/invoices');
      }

      const flash = req.session.flash || null;
      req.session.flash = null;

      // 出品者の銀行情報を取得
      let sellerBankInfo = null;
      if (detail.invoice.seller_partner_id) {
        const bankRows = await dbQuery(
          `SELECT bank_name, bank_branch_name, bank_branch_code, bank_account_type, bank_account_number, bank_account_holder
           FROM partners WHERE id = $1::uuid`,
          [detail.invoice.seller_partner_id]
        );
        if (bankRows.length && bankRows[0].bank_name) sellerBankInfo = bankRows[0];
      }

      res.render('buyer/invoice-show', {
        title: `請求書 ${detail.invoice.invoice_number}`,
        invoice: detail.invoice,
        orders: detail.orders,
        payments: detail.payments,
        sellerBankInfo,
        flash,
        req
      });
    } catch (e) { next(e); }
  });

  // ============================================================
  // 請求書PDFダウンロード（管理者・出品者・購入者 共通）
  // ============================================================
  app.get('/invoices/:id/pdf', requireAuth, async (req, res, next) => {
    try {
      const detail = await getInvoiceDetail(req.params.id);
      if (!detail) {
        return res.status(404).send('請求書が見つかりません');
      }

      // 権限チェック: 管理者 or 出品者 or 購入者
      const user = req.session.user;
      const isAdmin = user.role === 'admin';
      const isSeller = user.partner_id && detail.invoice.seller_partner_id === user.partner_id;
      const isBuyer = user.partner_id && detail.invoice.buyer_partner_id === user.partner_id;
      if (!isAdmin && !isSeller && !isBuyer) {
        return res.status(403).send('権限がありません');
      }

      // 購入者パートナー情報を取得
      let buyerPartner = null;
      if (detail.invoice.buyer_partner_id) {
        const bpRows = await dbQuery(
          `SELECT id, name, postal_code, prefecture, city, address1, address2, phone, email
           FROM partners WHERE id = $1::uuid`,
          [detail.invoice.buyer_partner_id]
        );
        if (bpRows.length) buyerPartner = bpRows[0];
      }

      // 出品者パートナー情報を取得
      let sellerPartner = null;
      if (detail.invoice.seller_partner_id) {
        const spRows = await dbQuery(
          `SELECT id, name, tax_id, postal_code, prefecture, city, address1, address2, phone, email,
                  bank_name, bank_branch_name, bank_branch_code, bank_account_type, bank_account_number, bank_account_holder
           FROM partners WHERE id = $1::uuid`,
          [detail.invoice.seller_partner_id]
        );
        if (spRows.length) sellerPartner = spRows[0];
      }

      const ejs = require('ejs');
      const path = require('path');
      const baseUrl = `${req.protocol}://${req.get('host')}/`;

      const html = await ejs.renderFile(
        path.join(__dirname, 'views', 'invoices', 'monthly-invoice.ejs'),
        {
          invoice: detail.invoice,
          orders: detail.orders,
          buyerPartner,
          sellerPartner,
          baseUrl
        },
        { async: true }
      );

      const pdfBuffer = await htmlToPdfBuffer(html, baseUrl);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${detail.invoice.invoice_number}.pdf"`);
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.send(pdfBuffer);
    } catch (e) {
      logger.error('Invoice PDF generation error', { error: e.message, invoiceId: req.params.id });
      next(e);
    }
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
