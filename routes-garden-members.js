// routes-garden-members.js
// 市民農園メンバーの管理（セラー向け）と公開詳細ページ

const { dbQuery } = require('./services/db');
const logger = require('./services/logger');
const {
  getMembersForPartner,
  getMember,
  createMember,
  updateMember,
  deleteMember,
  getMembersForProduct
} = require('./services/gardenMemberService');

function registerGardenMemberRoutes(app, requireAuth, requireRole) {

  // ============================================================
  // セラー: 市民農園メンバー一覧
  // ============================================================
  app.get('/seller/garden-members', requireAuth, requireRole(['seller', 'admin']), async (req, res, next) => {
    try {
      const partnerId = req.session.user.partner_id;
      if (!partnerId) {
        req.session.flash = { type: 'error', message: '出品者アカウントが必要です。' };
        return res.redirect('/');
      }

      const members = await getMembersForPartner(partnerId);
      const flash = req.session.flash || null;
      req.session.flash = null;

      res.render('seller/garden-members', {
        title: '市民農園メンバー管理',
        members,
        flash,
        req
      });
    } catch (e) { next(e); }
  });

  // ============================================================
  // セラー: メンバー作成フォーム
  // ============================================================
  app.get('/seller/garden-members/new', requireAuth, requireRole(['seller', 'admin']), async (req, res, next) => {
    try {
      const partnerId = req.session.user.partner_id;
      if (!partnerId) {
        req.session.flash = { type: 'error', message: '出品者アカウントが必要です。' };
        return res.redirect('/');
      }

      res.render('seller/garden-member-form', {
        title: 'メンバー追加',
        member: null,
        flash: null,
        req
      });
    } catch (e) { next(e); }
  });

  // ============================================================
  // セラー: メンバー作成
  // ============================================================
  app.post('/seller/garden-members', requireAuth, requireRole(['seller', 'admin']), async (req, res, next) => {
    try {
      const partnerId = req.session.user.partner_id;
      if (!partnerId) {
        req.session.flash = { type: 'error', message: '出品者アカウントが必要です。' };
        return res.redirect('/');
      }

      const name = String(req.body.name || '').trim();
      if (!name) {
        req.session.flash = { type: 'error', message: '名前は必須です。' };
        return res.redirect('/seller/garden-members/new');
      }

      // アイコン画像（R2署名アップロード済みのURL/キーをフォームから受け取る）
      const icon_url = String(req.body.icon_url || '').trim() || null;
      const icon_r2_key = String(req.body.icon_r2_key || '').trim() || null;

      await createMember(partnerId, {
        name,
        intro: String(req.body.intro || '').trim(),
        icon_url,
        icon_r2_key,
        farming_years: req.body.farming_years
      });

      req.session.flash = { type: 'success', message: 'メンバーを追加しました。' };
      return res.redirect('/seller/garden-members');
    } catch (e) { next(e); }
  });

  // ============================================================
  // セラー: メンバー編集フォーム
  // ============================================================
  app.get('/seller/garden-members/:id/edit', requireAuth, requireRole(['seller', 'admin']), async (req, res, next) => {
    try {
      const partnerId = req.session.user.partner_id;
      if (!partnerId) {
        req.session.flash = { type: 'error', message: '出品者アカウントが必要です。' };
        return res.redirect('/');
      }

      const member = await getMember(req.params.id);
      if (!member || member.partner_id !== partnerId) {
        req.session.flash = { type: 'error', message: 'メンバーが見つかりません。' };
        return res.redirect('/seller/garden-members');
      }

      const flash = req.session.flash || null;
      req.session.flash = null;

      res.render('seller/garden-member-form', {
        title: 'メンバー編集',
        member,
        flash,
        req
      });
    } catch (e) { next(e); }
  });

  // ============================================================
  // セラー: メンバー更新
  // ============================================================
  app.post('/seller/garden-members/:id', requireAuth, requireRole(['seller', 'admin']), async (req, res, next) => {
    try {
      const partnerId = req.session.user.partner_id;
      if (!partnerId) {
        req.session.flash = { type: 'error', message: '出品者アカウントが必要です。' };
        return res.redirect('/');
      }

      const name = String(req.body.name || '').trim();
      if (!name) {
        req.session.flash = { type: 'error', message: '名前は必須です。' };
        return res.redirect(`/seller/garden-members/${req.params.id}/edit`);
      }

      // アイコン画像（R2署名アップロード済みのURL/キーをフォームから受け取る）
      const icon_url = String(req.body.icon_url || '').trim() || null;
      const icon_r2_key = String(req.body.icon_r2_key || '').trim() || null;
      // icon_changed=1 が送信された場合、アイコンを明示的に更新（削除含む）
      const icon_changed = req.body.icon_changed === '1';

      const result = await updateMember(req.params.id, partnerId, {
        name,
        intro: String(req.body.intro || '').trim(),
        icon_url,
        icon_r2_key,
        farming_years: req.body.farming_years,
        icon_changed
      });

      if (!result) {
        req.session.flash = { type: 'error', message: 'メンバーが見つかりません。' };
        return res.redirect('/seller/garden-members');
      }

      req.session.flash = { type: 'success', message: 'メンバーを更新しました。' };
      return res.redirect('/seller/garden-members');
    } catch (e) { next(e); }
  });

  // ============================================================
  // セラー: メンバー削除（ソフトデリート）
  // ============================================================
  app.post('/seller/garden-members/:id/delete', requireAuth, requireRole(['seller', 'admin']), async (req, res, next) => {
    try {
      const partnerId = req.session.user.partner_id;
      if (!partnerId) {
        req.session.flash = { type: 'error', message: '出品者アカウントが必要です。' };
        return res.redirect('/');
      }

      const result = await deleteMember(req.params.id, partnerId);
      if (!result) {
        req.session.flash = { type: 'error', message: 'メンバーが見つかりません。' };
      } else {
        req.session.flash = { type: 'success', message: 'メンバーを削除しました。' };
      }
      return res.redirect('/seller/garden-members');
    } catch (e) { next(e); }
  });

  // ============================================================
  // 公開: メンバー詳細ページ
  // ============================================================
  app.get('/garden-members/:id', async (req, res, next) => {
    try {
      const member = await getMember(req.params.id);
      if (!member) {
        return res.status(404).render('errors/404', { title: 'ページが見つかりません', req });
      }

      // メンバーが関わっている商品一覧
      const products = await dbQuery(
        `SELECT p.id, p.title, p.price, p.unit, p.slug, p.has_variants,
                (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position LIMIT 1) AS image_url
         FROM product_garden_members pgm
         JOIN products p ON p.id = pgm.product_id
         WHERE pgm.member_id = $1 AND p.status = 'public'
         ORDER BY pgm.position ASC`,
        [member.id]
      );

      // 所属農家名
      const partnerRows = await dbQuery(
        `SELECT name FROM partners WHERE id = $1`,
        [member.partner_id]
      );

      res.render('garden-members/show', {
        title: `${member.name} - 市民農園メンバー`,
        member,
        products,
        partnerName: partnerRows[0]?.name || '',
        req
      });
    } catch (e) { next(e); }
  });
}

module.exports = { registerGardenMemberRoutes };
