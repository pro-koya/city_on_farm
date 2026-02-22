// routes-customer-prices.js
// 出品者が取引先別の特別価格を管理するルート

const { dbQuery } = require('./services/db');
const logger = require('./services/logger');
const {
  getCustomerPricesForPartner,
  setCustomerPrice,
  deleteCustomerPrice
} = require('./services/customerPriceService');

function registerCustomerPriceRoutes(app, requireAuth) {

  // ============================================================
  // 出品者: 取引先別価格一覧
  // ============================================================
  app.get('/seller/partners/:buyerId/prices', requireAuth, async (req, res, next) => {
    try {
      const sellerPartnerId = req.session.user.partner_id;
      if (!sellerPartnerId) {
        req.session.flash = { type: 'error', message: '出品者アカウントが必要です。' };
        return res.redirect('/');
      }

      const buyerPartnerId = req.params.buyerId;

      // 取引先名を取得
      const buyerRows = await dbQuery(
        `SELECT id, name FROM partners WHERE id = $1`,
        [buyerPartnerId]
      );
      if (!buyerRows.length) {
        req.session.flash = { type: 'error', message: '取引先が見つかりません。' };
        return res.redirect('/seller/listings');
      }

      const prices = await getCustomerPricesForPartner(buyerPartnerId, sellerPartnerId);

      // 出品者の全商品（価格未設定のものも含む）
      const products = await dbQuery(
        `SELECT p.id, p.title, p.price, p.unit, p.is_active,
                (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position LIMIT 1) AS image_url
         FROM products p
         WHERE p.seller_id = $1 AND p.is_active = true
         ORDER BY p.title ASC`,
        [sellerPartnerId]
      );

      const flash = req.session.flash || null;
      req.session.flash = null;

      res.render('seller/customer-prices', {
        title: `${buyerRows[0].name} - 顧客別価格`,
        buyer: buyerRows[0],
        prices,
        products,
        flash,
        req
      });
    } catch (e) { next(e); }
  });

  // ============================================================
  // 出品者: 顧客別価格を設定
  // ============================================================
  app.post('/seller/partners/:buyerId/prices', requireAuth, async (req, res, next) => {
    try {
      const sellerPartnerId = req.session.user.partner_id;
      if (!sellerPartnerId) {
        req.session.flash = { type: 'error', message: '出品者アカウントが必要です。' };
        return res.redirect('/');
      }

      const { productId, price, startsAt, expiresAt } = req.body;
      const parsedPrice = parseInt(price, 10);
      if (!productId || !parsedPrice || parsedPrice <= 0) {
        req.session.flash = { type: 'error', message: '商品と価格を正しく入力してください。' };
        return res.redirect(`/seller/partners/${req.params.buyerId}/prices`);
      }

      // 商品が出品者のものか確認
      const productCheck = await dbQuery(
        `SELECT id FROM products WHERE id = $1 AND seller_id = $2`,
        [productId, sellerPartnerId]
      );
      if (!productCheck.length) {
        req.session.flash = { type: 'error', message: '指定された商品は出品者のものではありません。' };
        return res.redirect(`/seller/partners/${req.params.buyerId}/prices`);
      }

      await setCustomerPrice(
        req.params.buyerId,
        productId,
        parsedPrice,
        req.session.user.id,
        startsAt || null,
        expiresAt || null
      );

      req.session.flash = { type: 'success', message: '顧客別価格を設定しました。' };
      return res.redirect(`/seller/partners/${req.params.buyerId}/prices`);
    } catch (e) { next(e); }
  });

  // ============================================================
  // 出品者: 顧客別価格を削除
  // ============================================================
  app.post('/seller/partners/:buyerId/prices/:priceId/delete', requireAuth, async (req, res, next) => {
    try {
      await deleteCustomerPrice(req.params.priceId);
      req.session.flash = { type: 'success', message: '顧客別価格を削除しました。' };
      return res.redirect(`/seller/partners/${req.params.buyerId}/prices`);
    } catch (e) { next(e); }
  });

  // ============================================================
  // 出品者: 取引先一覧（価格設定用）
  // ============================================================
  app.get('/seller/customer-prices', requireAuth, async (req, res, next) => {
    try {
      const sellerPartnerId = req.session.user.partner_id;
      if (!sellerPartnerId) {
        req.session.flash = { type: 'error', message: '出品者アカウントが必要です。' };
        return res.redirect('/');
      }

      // この出品者から購入実績のある取引先を取得
      const buyers = await dbQuery(
        `SELECT DISTINCT p.id, p.name,
           (SELECT COUNT(*) FROM customer_prices cp
            JOIN products pr ON pr.id = cp.product_id
            WHERE cp.buyer_partner_id = p.id AND pr.seller_id = $1) AS price_count
         FROM partners p
         JOIN orders o ON o.buyer_partner_id = p.id
         WHERE o.seller_id = $1
         ORDER BY p.name ASC`,
        [sellerPartnerId]
      );

      const flash = req.session.flash || null;
      req.session.flash = null;

      res.render('seller/customer-prices-list', {
        title: '顧客別価格 - 取引先一覧',
        buyers,
        flash,
        req
      });
    } catch (e) { next(e); }
  });
}

module.exports = { registerCustomerPriceRoutes };
