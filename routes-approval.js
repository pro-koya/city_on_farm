// routes-approval.js
// 発注承認ワークフロー管理 + 承認リクエスト（新フロー）

const { dbQuery } = require('./services/db');
const logger = require('./services/logger');
const {
  isApprovalRequired,
  getWorkflowSteps,
  saveWorkflowSteps,
  // 旧フロー（orders ベース）- 既存互換
  getPendingApprovals,
  getApprovalStatus,
  approveStep,
  rejectStep,
  // 新フロー（approval_requests ベース）
  createApprovalRequestFromCart,
  getMyApprovalRequests,
  getApprovalRequestDetail,
  getApprovalRequestSteps,
  getPendingApprovalRequests,
  approveRequestStep,
  rejectRequestStep,
  markApprovalRequestOrdered
} = require('./services/approvalService');
const { hasOrgRole, getPartnerIdsForUser } = require('./services/orgRoleService');

/** 承認者として有効な partner_id 一覧（users.partner_id または partner_member_roles から取得） */
async function getEffectivePartnerIdsForUser(user) {
  const fromUser = user?.partner_id ? [user.partner_id] : [];
  const fromRoles = await getPartnerIdsForUser(user?.id || null);
  const seen = new Set(fromUser.map(p => String(p)));
  for (const p of fromRoles) {
    const s = String(p);
    if (!seen.has(s)) {
      seen.add(s);
      fromUser.push(p);
    }
  }
  return fromUser;
}

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

      const isEnabled = enabled === 'on' || enabled === 'true' || enabled === '1';
      await dbQuery(
        `UPDATE partners SET approval_workflow_enabled = $1 WHERE id = $2`,
        [isEnabled, partnerId]
      );

      if (isEnabled && steps) {
        const parsedSteps = [];
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
  // 承認リクエスト作成（カートから承認申請）
  // ============================================================
  app.post('/my/approval-requests', requireAuth, async (req, res, next) => {
    try {
      const userId = req.session.user.id;
      const partnerId = req.session.user.partner_id;
      if (!partnerId) {
        req.session.flash = { type: 'error', message: '組織に所属していないため、承認申請はできません。' };
        return res.redirect('/cart');
      }

      // ワークフロー有効チェック
      const needed = await isApprovalRequired(partnerId);
      if (!needed) {
        req.session.flash = { type: 'error', message: '承認ワークフローが無効です。直接注文してください。' };
        return res.redirect('/cart');
      }

      const { sellerId } = req.body;
      if (!sellerId) {
        req.session.flash = { type: 'error', message: '出品者が指定されていません。' };
        return res.redirect('/cart');
      }

      // カートから対象出品者の商品を取得（sellerId はフォームから文字列で渡るため TEXT で比較）
      const cartRows = await dbQuery(
        `SELECT ci.product_id, ci.quantity,
                p.title, p.price, p.unit, p.stock, p.seller_id,
                u.partner_id AS seller_partner_id,
                (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position LIMIT 1) AS image_url
         FROM cart_items ci
         JOIN carts c ON c.id = ci.cart_id
         JOIN products p ON p.id = ci.product_id
         LEFT JOIN users u ON u.id = p.seller_id
         WHERE c.user_id = $1 AND ci.saved_for_later = false
           AND CAST(u.partner_id AS TEXT) = $2
         ORDER BY ci.created_at ASC`,
        [userId, String(sellerId)]
      );

      if (!cartRows.length) {
        req.session.flash = { type: 'error', message: 'カートに対象の商品がありません。' };
        return res.redirect('/cart');
      }

      // 在庫チェック
      for (const item of cartRows) {
        if (item.quantity > item.stock) {
          req.session.flash = {
            type: 'error',
            message: `「${item.title}」の在庫が不足しています（在庫: ${item.stock}）。`
          };
          return res.redirect('/cart');
        }
      }

      // カートアイテムをスナップショットとして保存
      const cartItems = cartRows.map(r => ({
        product_id: r.product_id,
        title: r.title,
        price: r.price,
        unit: r.unit,
        quantity: r.quantity,
        image_url: r.image_url
      }));

      const subtotal = cartItems.reduce((sum, it) => sum + (it.price * it.quantity), 0);

      const result = await createApprovalRequestFromCart(
        userId, partnerId, sellerId, cartItems, subtotal, subtotal
      );

      if (result.autoApproved) {
        req.session.flash = { type: 'success', message: '承認ステップが未設定のため、自動承認されました。注文に進めます。' };
      } else {
        req.session.flash = { type: 'success', message: '承認申請を送信しました。承認者の承認をお待ちください。' };
      }
      return res.redirect('/my/approval-requests');
    } catch (e) {
      logger.error('Failed to create approval request', { error: e.message });
      next(e);
    }
  });

  // ============================================================
  // 自分の承認リクエスト一覧（申請者向け）
  // ============================================================
  app.get('/my/approval-requests', requireAuth, async (req, res, next) => {
    try {
      let requests = [];
      try {
        requests = await getMyApprovalRequests(req.session.user.id);
      } catch (dbErr) {
        logger.warn('getMyApprovalRequests failed', { error: dbErr.message });
      }

      const flash = req.session.flash || null;
      req.session.flash = null;

      res.render('buyer/approval-requests/index', {
        title: '承認申請一覧',
        requests,
        flash,
        req
      });
    } catch (e) { next(e); }
  });

  // ============================================================
  // 承認リクエスト詳細（申請者向け）
  // ============================================================
  app.get('/my/approval-requests/:id', requireAuth, async (req, res, next) => {
    try {
      const requestId = req.params.id;
      const detail = await getApprovalRequestDetail(requestId);

      if (!detail || detail.requester_id !== req.session.user.id) {
        req.session.flash = { type: 'error', message: '承認リクエストが見つかりません。' };
        return res.redirect('/my/approval-requests');
      }

      const steps = await getApprovalRequestSteps(requestId);
      const cartItems = typeof detail.cart_items === 'string'
        ? JSON.parse(detail.cart_items)
        : detail.cart_items;

      const flash = req.session.flash || null;
      req.session.flash = null;

      res.render('buyer/approval-requests/show', {
        title: '承認申請詳細',
        request: detail,
        items: cartItems,
        approvalSteps: steps,
        flash,
        req
      });
    } catch (e) { next(e); }
  });

  // ============================================================
  // 承認待ち一覧（承認者向け - 新フロー: approval_requests ベース）
  // partner_id は users.partner_id または partner_member_roles から解決（承認者として追加されたユーザーも表示）
  // ============================================================
  app.get('/my/approvals', requireAuth, async (req, res, next) => {
    try {
      const partnerIds = await getEffectivePartnerIdsForUser(req.session.user);
      let requests = [];
      if (partnerIds.length) {
        try {
          const byPartner = await Promise.all(
            partnerIds.map(pid => getPendingApprovalRequests(req.session.user.id, pid))
          );
          const byCreated = (a, b) => new Date(b.created_at) - new Date(a.created_at);
          requests = byPartner.flat().sort(byCreated);
        } catch (dbErr) {
          logger.warn('getPendingApprovalRequests failed', { error: dbErr.message });
        }
      }

      const flash = req.session.flash || null;
      req.session.flash = null;

      res.render('buyer/approvals/index', {
        title: '承認待ち',
        requests,
        flash,
        req
      });
    } catch (e) { next(e); }
  });

  // ============================================================
  // 承認リクエスト詳細（承認者向け）
  // ============================================================
  app.get('/my/approvals/requests/:id', requireAuth, async (req, res, next) => {
    try {
      const partnerIds = await getEffectivePartnerIdsForUser(req.session.user);
      const requestId = req.params.id;

      const detail = await getApprovalRequestDetail(requestId);
      const buyerPartnerStr = detail ? String(detail.buyer_partner_id) : '';
      const allowed = partnerIds.some(pid => String(pid) === buyerPartnerStr);
      if (!detail || !allowed) {
        req.session.flash = { type: 'error', message: '承認リクエストが見つかりません。' };
        return res.redirect('/my/approvals');
      }

      const steps = await getApprovalRequestSteps(requestId);
      const cartItems = typeof detail.cart_items === 'string'
        ? JSON.parse(detail.cart_items)
        : detail.cart_items;

      const flash = req.session.flash || null;
      req.session.flash = null;

      res.render('buyer/approvals/show', {
        title: '承認詳細',
        request: detail,
        items: cartItems,
        approvalSteps: steps,
        flash,
        req,
        csrfToken: typeof req.csrfToken === 'function' ? req.csrfToken() : undefined
      });
    } catch (e) { next(e); }
  });

  // ============================================================
  // 承認リクエストを承認（新フロー）
  // 申請者本人が承認者として設定されていれば自己承認可能
  // ============================================================
  app.post('/my/approvals/requests/:id/approve', requireAuth, async (req, res, next) => {
    try {
      const partnerIds = await getEffectivePartnerIdsForUser(req.session.user);
      if (!partnerIds.length) {
        req.session.flash = { type: 'error', message: '組織に所属していません。' };
        return res.redirect('/my/approvals');
      }

      const requestId = req.params.id;
      const reqCheck = await dbQuery(
        `SELECT id, buyer_partner_id FROM approval_requests WHERE id = $1`,
        [requestId]
      );
      const buyerPartnerStr = reqCheck[0] ? String(reqCheck[0].buyer_partner_id) : '';
      const allowed = partnerIds.some(pid => String(pid) === buyerPartnerStr);
      if (!reqCheck.length || !allowed) {
        req.session.flash = { type: 'error', message: '承認リクエストが見つかりません。' };
        return res.redirect('/my/approvals');
      }

      const { comment } = req.body;
      const result = await approveRequestStep(requestId, req.session.user.id, comment);

      if (result.status === 'approved') {
        req.session.flash = { type: 'success', message: '承認しました。全ステップが完了し、発注者が注文に進めます。' };
      } else {
        req.session.flash = { type: 'success', message: '承認しました。次の承認者に回されました。' };
      }
      return res.redirect('/my/approvals');
    } catch (e) {
      if (e.message && (e.message.includes('権限') || e.message.includes('状態'))) {
        req.session.flash = { type: 'error', message: e.message };
        return res.redirect('/my/approvals');
      }
      next(e);
    }
  });

  // ============================================================
  // 承認リクエストを却下（新フロー）
  // ============================================================
  app.post('/my/approvals/requests/:id/reject', requireAuth, async (req, res, next) => {
    try {
      const partnerIds = await getEffectivePartnerIdsForUser(req.session.user);
      if (!partnerIds.length) {
        req.session.flash = { type: 'error', message: '組織に所属していません。' };
        return res.redirect('/my/approvals');
      }

      const requestId = req.params.id;
      const reqCheck = await dbQuery(
        `SELECT id, buyer_partner_id FROM approval_requests WHERE id = $1`,
        [requestId]
      );
      const buyerPartnerStr = reqCheck[0] ? String(reqCheck[0].buyer_partner_id) : '';
      const allowed = partnerIds.some(pid => String(pid) === buyerPartnerStr);
      if (!reqCheck.length || !allowed) {
        req.session.flash = { type: 'error', message: '承認リクエストが見つかりません。' };
        return res.redirect('/my/approvals');
      }

      const { comment } = req.body;
      await rejectRequestStep(requestId, req.session.user.id, comment);

      req.session.flash = { type: 'success', message: '承認リクエストを却下しました。' };
      return res.redirect('/my/approvals');
    } catch (e) {
      if (e.message && (e.message.includes('権限') || e.message.includes('状態'))) {
        req.session.flash = { type: 'error', message: e.message };
        return res.redirect('/my/approvals');
      }
      next(e);
    }
  });
}

module.exports = { registerApprovalRoutes };
