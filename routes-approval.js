// routes-approval.js
// 発注承認ワークフロー管理 + 承認操作

const { dbQuery } = require('./services/db');
const logger = require('./services/logger');
const {
  getWorkflowSteps,
  saveWorkflowSteps,
  getPendingApprovals,
  getApprovalStatus,
  approveStep,
  rejectStep
} = require('./services/approvalService');
const { hasOrgRole } = require('./services/orgRoleService');

function registerApprovalRoutes(app, requireAuth) {

  // org_admin チェック
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
  // ワークフロー設定画面
  // ============================================================
  app.get('/my/org/workflow', requireAuth, requireOrgAdmin, async (req, res, next) => {
    try {
      const partnerId = req.session.user.partner_id;

      const partnerRows = await dbQuery(
        `SELECT name, approval_workflow_enabled FROM partners WHERE id = $1`, [partnerId]
      );

      const steps = await getWorkflowSteps(partnerId);

      const flash = req.session.flash || null;
      req.session.flash = null;

      res.render('buyer/org/workflow', {
        title: '承認ワークフロー設定',
        orgName: partnerRows[0]?.name || '組織',
        workflowEnabled: partnerRows[0]?.approval_workflow_enabled || false,
        steps,
        flash,
        req
      });
    } catch (e) { next(e); }
  });

  // ============================================================
  // ワークフロー設定保存
  // ============================================================
  app.post('/my/org/workflow', requireAuth, requireOrgAdmin, async (req, res, next) => {
    try {
      const partnerId = req.session.user.partner_id;
      const { enabled, steps } = req.body;

      // ワークフロー有効/無効
      const isEnabled = enabled === 'on' || enabled === 'true' || enabled === '1';
      await dbQuery(
        `UPDATE partners SET approval_workflow_enabled = $1 WHERE id = $2`,
        [isEnabled, partnerId]
      );

      // ステップ保存
      if (isEnabled && steps) {
        const parsedSteps = [];
        // steps は { '1': { role: 'approver' }, '2': { role: 'org_admin' } } 形式
        const stepData = typeof steps === 'object' ? steps : {};
        for (const [order, data] of Object.entries(stepData)) {
          if (data.role) {
            parsedSteps.push({
              step_order: parseInt(order, 10),
              role: data.role
            });
          }
        }
        parsedSteps.sort((a, b) => a.step_order - b.step_order);
        await saveWorkflowSteps(partnerId, parsedSteps);
      }

      req.session.flash = { type: 'success', message: '承認ワークフロー設定を保存しました。' };
      return res.redirect('/my/org/workflow');
    } catch (e) { next(e); }
  });

  // ============================================================
  // 承認待ち一覧
  // ============================================================
  app.get('/my/approvals', requireAuth, async (req, res, next) => {
    try {
      const partnerId = req.session.user.partner_id;
      if (!partnerId) {
        return res.render('buyer/approvals/index', {
          title: '承認待ち',
          orders: [],
          flash: null,
          req
        });
      }

      const orders = await getPendingApprovals(req.session.user.id, partnerId);

      const flash = req.session.flash || null;
      req.session.flash = null;

      res.render('buyer/approvals/index', {
        title: '承認待ち',
        orders,
        flash,
        req
      });
    } catch (e) { next(e); }
  });

  // ============================================================
  // 承認詳細
  // ============================================================
  app.get('/my/approvals/:orderId', requireAuth, async (req, res, next) => {
    try {
      const partnerId = req.session.user.partner_id;
      const orderId = req.params.orderId;

      // 注文情報取得
      const orderRows = await dbQuery(
        `SELECT o.*, u.name AS submitted_by_name
         FROM orders o
         LEFT JOIN users u ON u.id = o.submitted_by
         WHERE o.id = $1 AND o.buyer_partner_id = $2`,
        [orderId, partnerId]
      );
      if (!orderRows.length) {
        req.session.flash = { type: 'error', message: '注文が見つかりません。' };
        return res.redirect('/my/approvals');
      }

      // 注文商品
      const items = await dbQuery(
        `SELECT oi.*, p.title, p.unit,
                (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position LIMIT 1) AS image_url
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1`,
        [orderId]
      );

      // 承認履歴
      const approvals = await getApprovalStatus(orderId);

      const flash = req.session.flash || null;
      req.session.flash = null;

      res.render('buyer/approvals/show', {
        title: '承認詳細',
        order: orderRows[0],
        items,
        approvals,
        flash,
        req
      });
    } catch (e) { next(e); }
  });

  // ============================================================
  // 承認
  // ============================================================
  app.post('/my/approvals/:orderId/approve', requireAuth, async (req, res, next) => {
    try {
      const { comment } = req.body;
      const result = await approveStep(req.params.orderId, req.session.user.id, comment);

      if (result.status === 'approved') {
        req.session.flash = { type: 'success', message: '注文を承認しました。注文が確定されました。' };
      } else {
        req.session.flash = { type: 'success', message: '承認しました。次の承認者に回されました。' };
      }
      return res.redirect('/my/approvals');
    } catch (e) { next(e); }
  });

  // ============================================================
  // 却下
  // ============================================================
  app.post('/my/approvals/:orderId/reject', requireAuth, async (req, res, next) => {
    try {
      const { comment } = req.body;
      await rejectStep(req.params.orderId, req.session.user.id, comment);

      req.session.flash = { type: 'success', message: '注文を却下しました。' };
      return res.redirect('/my/approvals');
    } catch (e) { next(e); }
  });
}

module.exports = { registerApprovalRoutes };
