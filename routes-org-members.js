// routes-org-members.js
// 組織内メンバー管理 + ロール設定

const { dbQuery } = require('./services/db');
const logger = require('./services/logger');
const {
  VALID_ROLES,
  getMemberRoles,
  setMemberRoles,
  hasOrgRole
} = require('./services/orgRoleService');

const ROLE_LABELS = {
  orderer: '発注者',
  approver: '承認者',
  accountant: '経理',
  org_admin: '組織管理者'
};

function registerOrgMemberRoutes(app, requireAuth) {

  // org_admin チェックミドルウェア
  async function requireOrgAdmin(req, res, next) {
    const partnerId = req.session.user?.partner_id;
    if (!partnerId) {
      req.session.flash = { type: 'error', message: '組織に所属していません。' };
      return res.redirect('/');
    }
    const isAdmin = await hasOrgRole(req.session.user.id, partnerId, 'org_admin');
    if (!isAdmin) {
      req.session.flash = { type: 'error', message: 'この操作には組織管理者権限が必要です。' };
      return res.redirect('/');
    }
    next();
  }

  // ============================================================
  // メンバー一覧
  // ============================================================
  app.get('/my/org/members', requireAuth, requireOrgAdmin, async (req, res, next) => {
    try {
      const partnerId = req.session.user.partner_id;

      // パートナー名取得
      const partnerRows = await dbQuery(
        `SELECT name FROM partners WHERE id = $1`, [partnerId]
      );

      const members = await getMemberRoles(partnerId);

      const flash = req.session.flash || null;
      req.session.flash = null;

      res.render('buyer/org/members', {
        title: '組織メンバー管理',
        orgName: partnerRows[0]?.name || '組織',
        members,
        validRoles: VALID_ROLES,
        roleLabels: ROLE_LABELS,
        flash,
        req
      });
    } catch (e) { next(e); }
  });

  // ============================================================
  // メンバーのロール更新
  // ============================================================
  app.post('/my/org/members/:userId/roles', requireAuth, requireOrgAdmin, async (req, res, next) => {
    try {
      const partnerId = req.session.user.partner_id;
      const targetUserId = req.params.userId;

      // 自分自身のorg_adminは外せない
      if (targetUserId === req.session.user.id) {
        const roles = Array.isArray(req.body.roles)
          ? req.body.roles
          : (req.body.roles ? [req.body.roles] : []);
        if (!roles.includes('org_admin')) {
          req.session.flash = { type: 'error', message: '自分自身の組織管理者権限は削除できません。' };
          return res.redirect('/my/org/members');
        }
      }

      // 対象ユーザーが同じ組織に所属しているか確認
      const userCheck = await dbQuery(
        `SELECT id FROM users WHERE id = $1 AND partner_id = $2`,
        [targetUserId, partnerId]
      );
      if (!userCheck.length) {
        req.session.flash = { type: 'error', message: '対象ユーザーが見つかりません。' };
        return res.redirect('/my/org/members');
      }

      const roles = Array.isArray(req.body.roles)
        ? req.body.roles
        : (req.body.roles ? [req.body.roles] : []);

      // 最後のorg_adminを削除しないよう保護
      if (!roles.includes('org_admin')) {
        const adminCount = await dbQuery(
          `SELECT COUNT(*) AS cnt FROM partner_member_roles
           WHERE partner_id = $1 AND role = 'org_admin' AND user_id != $2`,
          [partnerId, targetUserId]
        );
        if (parseInt(adminCount[0]?.cnt || 0, 10) === 0) {
          req.session.flash = { type: 'error', message: '最後の組織管理者を削除することはできません。' };
          return res.redirect('/my/org/members');
        }
      }

      await setMemberRoles(partnerId, targetUserId, roles);

      req.session.flash = { type: 'success', message: 'ロールを更新しました。' };
      return res.redirect('/my/org/members');
    } catch (e) { next(e); }
  });
}

module.exports = { registerOrgMemberRoutes };
