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
           ti.id AS template_item_id, ti.quantity, ti.sort_order, ti.variant_id,
           pr.id, pr.title, pr.price, pr.stock, pr.unit, pr.has_variants,
           (pr.status = 'public') AS is_active,
           (SELECT url FROM product_images pimg WHERE pimg.product_id = pr.id ORDER BY position LIMIT 1) AS image_url,
           prt.name AS seller_name,
           pv.label AS variant_label, pv.price AS variant_price, pv.stock AS variant_stock, pv.unit AS variant_unit
         FROM order_template_items ti
         JOIN products pr ON pr.id = ti.product_id
         LEFT JOIN users su ON su.id = pr.seller_id
         LEFT JOIN partners prt ON prt.id = su.partner_id
         LEFT JOIN product_variants pv ON pv.id = ti.variant_id
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
          `SELECT oi.product_id, oi.variant_id, oi.quantity
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE o.id = $1
             AND (o.buyer_id = $2 OR o.buyer_partner_id = $3)`,
          [sourceId, userId, partnerId]
        );
        productItems = orderItems.map((it, i) => ({
          product_id: it.product_id,
          variant_id: it.variant_id || null,
          quantity: it.quantity,
          sort_order: i
        }));
      } else if (source === 'cart' && sellerId) {
        // カートから作成（特定出品者分）
        const cartItems = await dbQuery(
          `SELECT ci.product_id, ci.variant_id, ci.quantity
           FROM cart_items ci
           JOIN carts c ON c.id = ci.cart_id
           JOIN products p ON p.id = ci.product_id
           LEFT JOIN users u ON u.id = p.seller_id
           WHERE c.user_id = $1
             AND ci.saved_for_later = false
             AND (u.partner_id = $2 OR p.seller_id = $2)
           ORDER BY ci.created_at ASC`,
          [userId, sellerId]
        );
        productItems = cartItems.map((it, i) => ({
          product_id: it.product_id,
          variant_id: it.variant_id || null,
          quantity: it.quantity,
          sort_order: i
        }));
      }

      if (!productItems.length) {
        req.session.flash = { type: 'error', message: 'テンプレートに追加する商品がありません。' };
        return res.redirect(req.headers.referer || '/my/templates');
      }

      // 出品者のpartner_idを特定
      // sellerId はカートからの場合は既にpartner_id
      // 注文からの場合はproducts.seller_id（user_id）→ users.partner_id で解決
      let sellerPartnerId = sellerId || null;
      if (!sellerPartnerId && productItems.length > 0) {
        const spRow = await dbQuery(
          `SELECT u.partner_id FROM products p JOIN users u ON u.id = p.seller_id WHERE p.id = $1`,
          [productItems[0].product_id]
        );
        sellerPartnerId = spRow[0]?.partner_id || null;
      }

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
          `INSERT INTO order_template_items (template_id, product_id, variant_id, quantity, sort_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [templateId, it.product_id, it.variant_id || null, it.quantity, it.sort_order]
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
        `SELECT ti.product_id, ti.variant_id, ti.quantity,
                p.title, p.stock, (p.status = 'public') AS is_active, p.price, p.has_variants,
                pv.label AS variant_label, pv.stock AS variant_stock, pv.price AS variant_price
         FROM order_template_items ti
         JOIN products p ON p.id = ti.product_id
         LEFT JOIN product_variants pv ON pv.id = ti.variant_id
         WHERE ti.template_id = $1`,
        [templateId]
      );

      // カートの既存数量を取得（variant_id 単位）
      const cartRows = await dbQuery(
        `SELECT ci.product_id, ci.variant_id, ci.quantity
         FROM cart_items ci
         JOIN carts c ON c.id = ci.cart_id
         WHERE c.user_id = $1 AND ci.saved_for_later = false`,
        [userId]
      );
      const cartQtyMap = {};
      for (const cr of cartRows) {
        const key = `${cr.product_id}|${cr.variant_id || ''}`;
        cartQtyMap[key] = cr.quantity;
      }

      let added = 0;
      let skipped = [];
      let reduced = [];

      for (const it of items) {
        const stock = it.variant_id ? (it.variant_stock ?? it.stock) : it.stock;
        const label = it.variant_label ? `${it.title} (${it.variant_label})` : it.title;

        if (!it.is_active || stock <= 0) {
          skipped.push(label);
          continue;
        }

        const key = `${it.product_id}|${it.variant_id || ''}`;
        const existingInCart = cartQtyMap[key] || 0;
        const remaining = stock - existingInCart;

        if (remaining <= 0) {
          skipped.push(label);
          continue;
        }

        const desiredQty = it.quantity;
        const actualQty = Math.min(desiredQty, remaining);

        await dbCartAdd(userId, it.product_id, actualQty, it.variant_id || null);
        added++;

        if (actualQty < desiredQty) {
          reduced.push(label);
        }
      }

      let message = `「${tRows[0].name}」から ${added} 件の商品をカートに追加しました。`;
      if (reduced.length) {
        message += ` ${reduced.length} 件は在庫の都合で数量を調整しました。`;
      }
      if (skipped.length) {
        message += ` ${skipped.length} 件の商品は在庫切れまたは非公開のためスキップしました。`;
      }

      req.session.flash = { type: added > 0 ? 'success' : 'error', message };
      return res.redirect('/cart');
    } catch (e) { next(e); }
  });

  // ============================================================
  // テンプレートに商品を追加
  // ============================================================
  app.post('/my/templates/:id/add-item', requireAuth, async (req, res, next) => {
    try {
      const userId = req.session.user.id;
      const partnerId = req.session.user.partner_id || null;
      const templateId = req.params.id;

      // 所有確認
      const owner = await dbQuery(
        `SELECT id, seller_partner_id FROM order_templates
         WHERE id = $1 AND (user_id = $2 OR ($3::uuid IS NOT NULL AND partner_id = $3))`,
        [templateId, userId, partnerId]
      );
      if (!owner.length) {
        req.session.flash = { type: 'error', message: 'テンプレートが見つかりません。' };
        return res.redirect('/my/templates');
      }

      const { productId, variantId, quantity } = req.body;
      const qty = Math.max(1, parseInt(quantity, 10) || 1);

      if (!productId) {
        req.session.flash = { type: 'error', message: '商品が指定されていません。' };
        return res.redirect(`/my/templates/${templateId}`);
      }

      // 商品がテンプレートの出品者に属しているか確認
      const sellerPartnerId = owner[0].seller_partner_id;
      if (sellerPartnerId) {
        const productCheck = await dbQuery(
          `SELECT p.id FROM products p
           JOIN users u ON u.id = p.seller_id
           WHERE p.id = $1 AND u.partner_id = $2`,
          [productId, sellerPartnerId]
        );
        if (!productCheck.length) {
          req.session.flash = { type: 'error', message: 'この商品はテンプレートの出品者に属していません。' };
          return res.redirect(`/my/templates/${templateId}`);
        }
      }

      // 重複チェック — 既に存在すれば数量を加算（variant_id 単位）
      const existing = await dbQuery(
        `SELECT id, quantity FROM order_template_items
         WHERE template_id = $1 AND product_id = $2
           AND variant_id IS NOT DISTINCT FROM $3`,
        [templateId, productId, variantId || null]
      );

      if (existing.length) {
        await dbQuery(
          `UPDATE order_template_items SET quantity = quantity + $1 WHERE id = $2`,
          [qty, existing[0].id]
        );
      } else {
        const maxSort = await dbQuery(
          `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM order_template_items WHERE template_id = $1`,
          [templateId]
        );
        await dbQuery(
          `INSERT INTO order_template_items (template_id, product_id, variant_id, quantity, sort_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [templateId, productId, variantId || null, qty, maxSort[0].next_sort]
        );
      }

      await dbQuery(`UPDATE order_templates SET updated_at = now() WHERE id = $1`, [templateId]);

      req.session.flash = { type: 'success', message: '商品をテンプレートに追加しました。' };
      return res.redirect(`/my/templates/${templateId}`);
    } catch (e) { next(e); }
  });

  // ============================================================
  // 商品検索 API（テンプレート商品追加モーダル用）
  // ============================================================
  app.get('/api/products/search', requireAuth, async (req, res, next) => {
    try {
      const { q = '', sellerPartnerId } = req.query;
      if (!sellerPartnerId) {
        return res.json({ products: [] });
      }

      const keyword = `%${q.trim()}%`;
      const products = await dbQuery(
        `SELECT p.id, p.title, p.price, p.unit, p.stock,
                (SELECT url FROM product_images pimg WHERE pimg.product_id = p.id ORDER BY position LIMIT 1) AS image_url
         FROM products p
         JOIN users u ON u.id = p.seller_id
         WHERE u.partner_id = $1
           AND p.status = 'public'
           AND p.stock > 0
           AND ($2 = '%%' OR p.title ILIKE $2)
         ORDER BY p.title ASC
         LIMIT 20`,
        [sellerPartnerId, keyword]
      );

      return res.json({ products });
    } catch (e) { next(e); }
  });
}

module.exports = { registerOrderTemplateRoutes };
