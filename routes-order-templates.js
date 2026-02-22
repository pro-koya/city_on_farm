// routes-order-templates.js
// 注文テンプレート CRUD + カートへの一括追加

const { dbQuery } = require('./services/db');
const logger = require('./services/logger');

function registerOrderTemplateRoutes(app, requireAuth, dbCartAdd) {

  // ============================================================
  // テンプレート一覧
  // ============================================================
  app.get('/my/templates', requireAuth, async (req, res, next) => {
    try {
      const userId = req.session.user.id;
      const partnerId = req.session.user.partner_id || null;

      const templates = await dbQuery(
        `SELECT
           t.id, t.name, t.seller_partner_id, t.created_at, t.updated_at,
           p.name AS seller_name,
           (SELECT COUNT(*) FROM order_template_items ti WHERE ti.template_id = t.id) AS item_count
         FROM order_templates t
         LEFT JOIN partners p ON p.id = t.seller_partner_id
         WHERE t.user_id = $1
            OR ($2::uuid IS NOT NULL AND t.partner_id = $2)
         ORDER BY t.updated_at DESC`,
        [userId, partnerId]
      );

      const flash = req.session.flash || null;
      req.session.flash = null;

      res.render('buyer/templates/index', {
        title: '注文テンプレート',
        templates,
        flash,
        req
      });
    } catch (e) { next(e); }
  });

  // ============================================================
  // テンプレート詳細
  // ============================================================
  app.get('/my/templates/:id', requireAuth, async (req, res, next) => {
    try {
      const userId = req.session.user.id;
      const partnerId = req.session.user.partner_id || null;

      const tRows = await dbQuery(
        `SELECT t.*, p.name AS seller_name
         FROM order_templates t
         LEFT JOIN partners p ON p.id = t.seller_partner_id
         WHERE t.id = $1
           AND (t.user_id = $2 OR ($3::uuid IS NOT NULL AND t.partner_id = $3))`,
        [req.params.id, userId, partnerId]
      );
      if (!tRows.length) {
        req.session.flash = { type: 'error', message: 'テンプレートが見つかりません。' };
        return res.redirect('/my/templates');
      }

      const template = tRows[0];

      const items = await dbQuery(
        `SELECT
           ti.id AS template_item_id, ti.quantity, ti.sort_order,
           pr.id, pr.title, pr.price, pr.stock, pr.unit,
           pr.is_active, pr.image_url,
           prt.name AS seller_name
         FROM order_template_items ti
         JOIN products pr ON pr.id = ti.product_id
         LEFT JOIN partners prt ON prt.id = pr.seller_id
         WHERE ti.template_id = $1
         ORDER BY ti.sort_order ASC, ti.id ASC`,
        [template.id]
      );

      const flash = req.session.flash || null;
      req.session.flash = null;

      res.render('buyer/templates/show', {
        title: `テンプレート: ${template.name}`,
        template,
        items,
        flash,
        req
      });
    } catch (e) { next(e); }
  });

  // ============================================================
  // テンプレート作成 (カートまたは注文から)
  // ============================================================
  app.post('/my/templates', requireAuth, async (req, res, next) => {
    try {
      const userId = req.session.user.id;
      const partnerId = req.session.user.partner_id || null;
      const { name, source, sourceId, sellerId } = req.body;

      const templateName = (name || '').trim() || `テンプレート ${new Date().toLocaleDateString('ja-JP')}`;

      let productItems = [];

      if (source === 'order' && sourceId) {
        // 注文から作成
        const orderItems = await dbQuery(
          `SELECT oi.product_id, oi.quantity
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE o.id = $1
             AND (o.user_id = $2 OR o.buyer_partner_id = $3)`,
          [sourceId, userId, partnerId]
        );
        productItems = orderItems.map((it, i) => ({
          product_id: it.product_id,
          quantity: it.quantity,
          sort_order: i
        }));
      } else if (source === 'cart' && sellerId) {
        // カートから作成（特定出品者分）
        const cartItems = await dbQuery(
          `SELECT ci.product_id, ci.quantity
           FROM cart_items ci
           JOIN carts c ON c.id = ci.cart_id
           JOIN products p ON p.id = ci.product_id
           WHERE c.user_id = $1
             AND ci.saved_for_later = false
             AND p.seller_id = $2
           ORDER BY ci.created_at ASC`,
          [userId, sellerId]
        );
        productItems = cartItems.map((it, i) => ({
          product_id: it.product_id,
          quantity: it.quantity,
          sort_order: i
        }));
      }

      if (!productItems.length) {
        req.session.flash = { type: 'error', message: 'テンプレートに追加する商品がありません。' };
        return res.redirect(req.headers.referer || '/my/templates');
      }

      // 出品者IDを特定
      const sellerPartnerId = sellerId || (productItems.length > 0
        ? (await dbQuery(`SELECT seller_id FROM products WHERE id = $1`, [productItems[0].product_id]))[0]?.seller_id
        : null);

      if (!sellerPartnerId) {
        req.session.flash = { type: 'error', message: '出品者情報が特定できませんでした。' };
        return res.redirect(req.headers.referer || '/my/templates');
      }

      // テンプレート作成
      const tpl = await dbQuery(
        `INSERT INTO order_templates (user_id, partner_id, name, seller_partner_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [userId, partnerId, templateName, sellerPartnerId]
      );
      const templateId = tpl[0].id;

      // アイテム追加
      for (const it of productItems) {
        await dbQuery(
          `INSERT INTO order_template_items (template_id, product_id, quantity, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [templateId, it.product_id, it.quantity, it.sort_order]
        );
      }

      logger.info('Order template created', { templateId, userId, itemCount: productItems.length });
      req.session.flash = { type: 'success', message: `テンプレート「${templateName}」を作成しました。` };
      return res.redirect(`/my/templates/${templateId}`);
    } catch (e) { next(e); }
  });

  // ============================================================
  // テンプレート更新 (名前変更・商品数量変更)
  // ============================================================
  app.post('/my/templates/:id/update', requireAuth, async (req, res, next) => {
    try {
      const userId = req.session.user.id;
      const partnerId = req.session.user.partner_id || null;
      const templateId = req.params.id;

      // 所有確認
      const owner = await dbQuery(
        `SELECT id FROM order_templates
         WHERE id = $1 AND (user_id = $2 OR ($3::uuid IS NOT NULL AND partner_id = $3))`,
        [templateId, userId, partnerId]
      );
      if (!owner.length) {
        req.session.flash = { type: 'error', message: 'テンプレートが見つかりません。' };
        return res.redirect('/my/templates');
      }

      const { name, quantities } = req.body;

      // 名前更新
      if (name && name.trim()) {
        await dbQuery(
          `UPDATE order_templates SET name = $1, updated_at = now() WHERE id = $2`,
          [name.trim(), templateId]
        );
      }

      // 数量更新 (quantities = { templateItemId: qty, ... })
      if (quantities && typeof quantities === 'object') {
        for (const [itemId, qty] of Object.entries(quantities)) {
          const parsedQty = parseInt(qty, 10);
          if (parsedQty > 0) {
            await dbQuery(
              `UPDATE order_template_items SET quantity = $1 WHERE id = $2 AND template_id = $3`,
              [parsedQty, itemId, templateId]
            );
          }
        }
        await dbQuery(`UPDATE order_templates SET updated_at = now() WHERE id = $1`, [templateId]);
      }

      req.session.flash = { type: 'success', message: 'テンプレートを更新しました。' };
      return res.redirect(`/my/templates/${templateId}`);
    } catch (e) { next(e); }
  });

  // ============================================================
  // テンプレートからアイテム削除
  // ============================================================
  app.post('/my/templates/:id/remove-item', requireAuth, async (req, res, next) => {
    try {
      const userId = req.session.user.id;
      const partnerId = req.session.user.partner_id || null;
      const templateId = req.params.id;

      const owner = await dbQuery(
        `SELECT id FROM order_templates
         WHERE id = $1 AND (user_id = $2 OR ($3::uuid IS NOT NULL AND partner_id = $3))`,
        [templateId, userId, partnerId]
      );
      if (!owner.length) {
        req.session.flash = { type: 'error', message: 'テンプレートが見つかりません。' };
        return res.redirect('/my/templates');
      }

      const { itemId } = req.body;
      if (itemId) {
        await dbQuery(
          `DELETE FROM order_template_items WHERE id = $1 AND template_id = $2`,
          [itemId, templateId]
        );
        await dbQuery(`UPDATE order_templates SET updated_at = now() WHERE id = $1`, [templateId]);
      }

      req.session.flash = { type: 'success', message: '商品をテンプレートから削除しました。' };
      return res.redirect(`/my/templates/${templateId}`);
    } catch (e) { next(e); }
  });

  // ============================================================
  // テンプレート削除
  // ============================================================
  app.post('/my/templates/:id/delete', requireAuth, async (req, res, next) => {
    try {
      const userId = req.session.user.id;
      const partnerId = req.session.user.partner_id || null;

      const result = await dbQuery(
        `DELETE FROM order_templates
         WHERE id = $1 AND (user_id = $2 OR ($3::uuid IS NOT NULL AND partner_id = $3))
         RETURNING id`,
        [req.params.id, userId, partnerId]
      );

      if (result.length) {
        req.session.flash = { type: 'success', message: 'テンプレートを削除しました。' };
      } else {
        req.session.flash = { type: 'error', message: 'テンプレートが見つかりません。' };
      }
      return res.redirect('/my/templates');
    } catch (e) { next(e); }
  });

  // ============================================================
  // テンプレートからカートへ一括追加
  // ============================================================
  app.post('/my/templates/:id/to-cart', requireAuth, async (req, res, next) => {
    try {
      const userId = req.session.user.id;
      const partnerId = req.session.user.partner_id || null;
      const templateId = req.params.id;

      // テンプレート所有確認
      const tRows = await dbQuery(
        `SELECT id, name FROM order_templates
         WHERE id = $1 AND (user_id = $2 OR ($3::uuid IS NOT NULL AND partner_id = $3))`,
        [templateId, userId, partnerId]
      );
      if (!tRows.length) {
        req.session.flash = { type: 'error', message: 'テンプレートが見つかりません。' };
        return res.redirect('/my/templates');
      }

      // テンプレートアイテム取得
      const items = await dbQuery(
        `SELECT ti.product_id, ti.quantity,
                p.title, p.stock, p.is_active, p.price
         FROM order_template_items ti
         JOIN products p ON p.id = ti.product_id
         WHERE ti.template_id = $1`,
        [templateId]
      );

      let added = 0;
      let skipped = [];

      for (const it of items) {
        if (!it.is_active || it.stock <= 0) {
          skipped.push(it.title);
          continue;
        }
        const qty = Math.min(it.quantity, it.stock);
        await dbCartAdd(userId, it.product_id, qty);
        added++;
      }

      let message = `「${tRows[0].name}」から ${added} 件の商品をカートに追加しました。`;
      if (skipped.length) {
        message += ` ${skipped.length} 件の商品は在庫切れまたは非公開のためスキップしました。`;
      }

      req.session.flash = { type: added > 0 ? 'success' : 'error', message };
      return res.redirect('/cart');
    } catch (e) { next(e); }
  });
}

module.exports = { registerOrderTemplateRoutes };
