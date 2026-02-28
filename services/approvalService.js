// services/approvalService.js
// 発注承認ワークフロー

const { dbQuery } = require('./db');
const logger = require('./logger');

/**
 * パートナーに承認ワークフローが有効かチェック
 */
async function isApprovalRequired(buyerPartnerId) {
  if (!buyerPartnerId) return false;
  const rows = await dbQuery(
    `SELECT approval_workflow_enabled FROM partners WHERE id = $1`,
    [buyerPartnerId]
  );
  return rows[0]?.approval_workflow_enabled === true;
}

/**
 * 承認ステップ一覧
 */
async function getWorkflowSteps(partnerId) {
  if (partnerId == null) return [];
  const pid = String(partnerId);
  const rows = await dbQuery(
    `SELECT id, step_order, role FROM approval_workflow_steps
     WHERE partner_id = $1::uuid
     ORDER BY step_order ASC`,
    [pid]
  );
  return rows;
}

/**
 * ワークフローステップ設定を保存
 */
async function saveWorkflowSteps(partnerId, steps) {
  const pid = partnerId != null ? String(partnerId) : null;
  if (!pid) return;
  await dbQuery('BEGIN');
  try {
    await dbQuery(`DELETE FROM approval_workflow_steps WHERE partner_id = $1::uuid`, [pid]);
    for (const step of steps) {
      await dbQuery(
        `INSERT INTO approval_workflow_steps (partner_id, step_order, role)
         VALUES ($1::uuid, $2, $3)`,
        [pid, step.step_order, step.role]
      );
    }
    await dbQuery('COMMIT');
    logger.info('Workflow steps saved', { partnerId, stepCount: steps.length });
  } catch (err) {
    await dbQuery('ROLLBACK');
    throw err;
  }
}

/**
 * 承認リクエスト作成（注文確定時に呼ばれる）
 */
async function createApprovalRequest(orderId, partnerId) {
  const steps = await getWorkflowSteps(partnerId);
  if (!steps.length) {
    logger.warn('No workflow steps configured', { partnerId });
    // ステップ未設定の場合は自動承認
    await dbQuery(
      `UPDATE orders SET approval_status = 'approved', status = 'pending' WHERE id = $1`,
      [orderId]
    );
    return { orderId, autoApproved: true };
  }

  // 最初のステップの承認レコードを作成
  const firstStep = steps[0];
  await dbQuery(
    `INSERT INTO order_approvals (order_id, step_order, status)
     VALUES ($1, $2, 'pending')`,
    [orderId, firstStep.step_order]
  );

  // 注文を承認待ちに更新
  await dbQuery(
    `UPDATE orders SET approval_status = 'pending', current_approval_step = $1 WHERE id = $2`,
    [firstStep.step_order, orderId]
  );

  logger.info('Approval request created', { orderId, partnerId, firstStep: firstStep.step_order });
  return { orderId, step: firstStep };
}

/**
 * 承認実行
 */
async function approveStep(orderId, approverId, comment) {
  await dbQuery('BEGIN');
  try {
    // 現在のステップを取得（FOR UPDATE でロック）
    const orderRows = await dbQuery(
      `SELECT current_approval_step, buyer_partner_id, approval_status
       FROM orders WHERE id = $1 FOR UPDATE`, [orderId]
    );
    if (!orderRows.length) throw new Error('Order not found');
    if (orderRows[0].approval_status !== 'pending') {
      throw new Error('この注文は承認待ち状態ではありません。');
    }

    const currentStep = orderRows[0].current_approval_step;
    const partnerId = orderRows[0].buyer_partner_id;

    // 承認者のロールチェック
    const steps = await getWorkflowSteps(partnerId);
    const currentIdx = steps.findIndex(s => s.step_order === currentStep);
    if (currentIdx === -1) throw new Error('現在の承認ステップが見つかりません。');

    const requiredRole = steps[currentIdx].role;
    const hasRole = await dbQuery(
      `SELECT 1 FROM partner_member_roles
       WHERE partner_id = $1 AND user_id = $2 AND role = $3 LIMIT 1`,
      [partnerId, approverId, requiredRole]
    );
    if (!hasRole.length) {
      throw new Error('この承認ステップに対する権限がありません。');
    }

    // 承認レコード更新
    const updated = await dbQuery(
      `UPDATE order_approvals
       SET status = 'approved', approver_id = $1, comment = $2, decided_at = now()
       WHERE order_id = $3 AND step_order = $4 AND status = 'pending'
       RETURNING id`,
      [approverId, comment || null, orderId, currentStep]
    );
    if (!updated.length) throw new Error('承認レコードが見つかりません。');

    // 次のステップがあるか確認
    const nextStep = steps[currentIdx + 1];

    let result;
    if (nextStep) {
      // 次のステップの承認レコード作成
      await dbQuery(
        `INSERT INTO order_approvals (order_id, step_order, status) VALUES ($1, $2, 'pending')`,
        [orderId, nextStep.step_order]
      );
      await dbQuery(
        `UPDATE orders SET current_approval_step = $1 WHERE id = $2`,
        [nextStep.step_order, orderId]
      );
      logger.info('Approval moved to next step', { orderId, nextStep: nextStep.step_order });
      result = { status: 'next_step', nextStep };
    } else {
      // 全ステップ承認済み → 注文確定
      await dbQuery(
        `UPDATE orders SET approval_status = 'approved', status = 'processing' WHERE id = $1`,
        [orderId]
      );
      logger.info('Order fully approved', { orderId });
      result = { status: 'approved' };
    }

    await dbQuery('COMMIT');
    return result;
  } catch (err) {
    await dbQuery('ROLLBACK');
    throw err;
  }
}

/**
 * 却下
 */
async function rejectStep(orderId, approverId, comment) {
  await dbQuery('BEGIN');
  try {
    const orderRows = await dbQuery(
      `SELECT current_approval_step, approval_status, buyer_partner_id
       FROM orders WHERE id = $1 FOR UPDATE`, [orderId]
    );
    if (!orderRows.length) throw new Error('Order not found');
    if (orderRows[0].approval_status !== 'pending') {
      throw new Error('この注文は承認待ち状態ではありません。');
    }

    const currentStep = orderRows[0].current_approval_step;
    const partnerId = orderRows[0].buyer_partner_id;

    // 却下者のロールチェック
    const steps = await getWorkflowSteps(partnerId);
    const currentIdx = steps.findIndex(s => s.step_order === currentStep);
    if (currentIdx === -1) throw new Error('現在の承認ステップが見つかりません。');

    const requiredRole = steps[currentIdx].role;
    const hasRole = await dbQuery(
      `SELECT 1 FROM partner_member_roles
       WHERE partner_id = $1 AND user_id = $2 AND role = $3 LIMIT 1`,
      [partnerId, approverId, requiredRole]
    );
    if (!hasRole.length) {
      throw new Error('この承認ステップに対する権限がありません。');
    }

    await dbQuery(
      `UPDATE order_approvals
       SET status = 'rejected', approver_id = $1, comment = $2, decided_at = now()
       WHERE order_id = $3 AND step_order = $4 AND status = 'pending'`,
      [approverId, comment || null, orderId, currentStep]
    );

    await dbQuery(
      `UPDATE orders SET approval_status = 'rejected' WHERE id = $1`,
      [orderId]
    );

    await dbQuery('COMMIT');
    logger.info('Order rejected', { orderId, approverId });
    return { status: 'rejected' };
  } catch (err) {
    await dbQuery('ROLLBACK');
    throw err;
  }
}

/**
 * 承認状況取得
 */
async function getApprovalStatus(orderId) {
  const approvals = await dbQuery(
    `SELECT oa.*, u.name AS approver_name
     FROM order_approvals oa
     LEFT JOIN users u ON u.id = oa.approver_id
     WHERE oa.order_id = $1
     ORDER BY oa.step_order ASC`,
    [orderId]
  );
  return approvals;
}

/**
 * 承認待ちの注文一覧（自分が承認者のもの）
 */
async function getPendingApprovals(userId, partnerId) {
  // ユーザーのロールを取得
  const userRoles = await dbQuery(
    `SELECT role FROM partner_member_roles WHERE partner_id = $1 AND user_id = $2`,
    [partnerId, userId]
  );
  const roles = userRoles.map(r => r.role);

  if (!roles.length) return [];

  // 自分のロールに該当するステップの承認待ち注文を取得
  const rolePh = roles.map((_, i) => `$${i + 3}`).join(',');
  const orders = await dbQuery(
    `SELECT o.id, o.created_at, o.total, o.subtotal, o.current_approval_step,
            o.approval_status, u.name AS submitted_by_name,
            oa.step_order, aws.role AS required_role
     FROM orders o
     JOIN order_approvals oa ON oa.order_id = o.id AND oa.status = 'pending'
     JOIN approval_workflow_steps aws ON aws.partner_id = $1 AND aws.step_order = oa.step_order
     LEFT JOIN users u ON u.id = o.submitted_by
     WHERE o.buyer_partner_id = $1
       AND o.approval_status = 'pending'
       AND oa.step_order = o.current_approval_step
       AND aws.role IN (${rolePh})
     ORDER BY o.created_at DESC`,
    [partnerId, userId, ...roles]
  );
  return orders;
}

// ============================================================
// 承認リクエスト関連（カート → 承認申請 → 承認 → 注文の新フロー）
// ============================================================

/**
 * カートから承認リクエストを作成
 */
async function createApprovalRequestFromCart(requesterId, buyerPartnerId, sellerPartnerId, cartItems, subtotal, total) {
  await dbQuery('BEGIN');
  try {
    const buyerPid = buyerPartnerId != null ? String(buyerPartnerId) : null;
    if (!buyerPid) throw new Error('buyer_partner_id is required');
    const steps = await getWorkflowSteps(buyerPid);

    // リクエスト作成（UUID 列に渡す値は文字列で統一）
    const rows = await dbQuery(
      `INSERT INTO approval_requests
         (buyer_partner_id, seller_partner_id, requester_id, status, current_approval_step, cart_items, subtotal, total)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'pending', $4, $5, $6, $7)
       RETURNING id`,
      [
        buyerPid,
        sellerPartnerId != null ? String(sellerPartnerId) : null,
        String(requesterId),
        steps.length ? steps[0].step_order : 1,
        JSON.stringify(cartItems),
        subtotal || 0,
        total || 0
      ]
    );
    const requestId = rows[0].id;

    if (!steps.length) {
      // ステップ未設定 → 自動承認
      await dbQuery(
        `UPDATE approval_requests SET status = 'approved' WHERE id = $1`,
        [requestId]
      );
      await dbQuery('COMMIT');
      logger.info('Approval request auto-approved (no steps)', { requestId });
      return { requestId, autoApproved: true };
    }

    // 最初のステップの承認レコード作成
    await dbQuery(
      `INSERT INTO approval_request_steps (request_id, step_order, status)
       VALUES ($1, $2, 'pending')`,
      [requestId, steps[0].step_order]
    );

    await dbQuery('COMMIT');
    logger.info('Approval request created', { requestId, buyerPartnerId, firstStep: steps[0].step_order });
    return { requestId, autoApproved: false };
  } catch (err) {
    await dbQuery('ROLLBACK');
    throw err;
  }
}

/**
 * 自分が提出した承認リクエスト一覧
 */
async function getMyApprovalRequests(userId) {
  return dbQuery(
    `SELECT ar.*, u.name AS requester_name
     FROM approval_requests ar
     LEFT JOIN users u ON u.id = ar.requester_id
     WHERE ar.requester_id = $1
     ORDER BY ar.created_at DESC`,
    [userId]
  );
}

/**
 * 承認リクエストの詳細取得
 */
async function getApprovalRequestDetail(requestId) {
  const rows = await dbQuery(
    `SELECT ar.*, u.name AS requester_name
     FROM approval_requests ar
     LEFT JOIN users u ON u.id = ar.requester_id
     WHERE ar.id = $1`,
    [requestId]
  );
  return rows[0] || null;
}

/**
 * 承認リクエストのステップ履歴
 */
async function getApprovalRequestSteps(requestId) {
  return dbQuery(
    `SELECT ars.*, u.name AS approver_name
     FROM approval_request_steps ars
     LEFT JOIN users u ON u.id = ars.approver_id
     WHERE ars.request_id = $1
     ORDER BY ars.step_order ASC`,
    [requestId]
  );
}

/**
 * 承認待ちの承認リクエスト一覧（承認者向け）
 * partnerId は文字列に正規化し、DB の UUID 比較を確実にする。
 * 段階的に取得して JOIN の型不一致を避ける。
 */
async function getPendingApprovalRequests(userId, partnerId) {
  const pid = partnerId != null ? String(partnerId) : null;
  if (!pid) return [];

  // 1) このユーザーが持つロール（partner_member_roles）
  const userRolesRows = await dbQuery(
    `SELECT role FROM partner_member_roles
     WHERE partner_id = $1::uuid AND user_id = $2::uuid`,
    [pid, String(userId)]
  );
  const roles = userRolesRows.map(r => r.role).filter(Boolean);
  if (!roles.length) return [];

  // 2) そのロールで承認できるステップの step_order 一覧（approval_workflow_steps）
  const rolePh = roles.map((_, i) => `$${i + 2}`).join(',');
  const stepsRows = await dbQuery(
    `SELECT step_order FROM approval_workflow_steps
     WHERE partner_id = $1::uuid AND role IN (${rolePh})`,
    [pid, ...roles]
  );
  const allowedStepOrders = stepsRows.map(r => r.step_order);
  if (!allowedStepOrders.length) return [];

  // 3) 承認待ちリクエストのうち、現在ステップが上記のいずれかで、pending の step が存在するもの
  const stepPh = allowedStepOrders.map((_, i) => `$${i + 2}`).join(',');
  return dbQuery(
    `SELECT ar.id, ar.created_at, ar.total, ar.subtotal, ar.current_approval_step,
            ar.status, ar.seller_partner_id, ar.cart_items,
            u.name AS requester_name,
            ars.step_order,
            (SELECT role FROM approval_workflow_steps aws2
             WHERE aws2.partner_id = ar.buyer_partner_id AND aws2.step_order = ars.step_order LIMIT 1) AS required_role
     FROM approval_requests ar
     INNER JOIN approval_request_steps ars
       ON ars.request_id = ar.id AND ars.status = 'pending'
       AND ars.step_order = ar.current_approval_step
       AND ars.step_order IN (${stepPh})
     LEFT JOIN users u ON u.id = ar.requester_id
     WHERE ar.buyer_partner_id = $1::uuid AND ar.status = 'pending'
     ORDER BY ar.created_at DESC`,
    [pid, ...allowedStepOrders]
  );
}

/**
 * 承認リクエストのステップを承認
 * 申請者（requester）本人が承認ルートの承認者ロールを持っていれば自己承認可能。
 */
async function approveRequestStep(requestId, approverId, comment) {
  await dbQuery('BEGIN');
  try {
    const reqRows = await dbQuery(
      `SELECT current_approval_step, buyer_partner_id, status
       FROM approval_requests WHERE id = $1 FOR UPDATE`,
      [requestId]
    );
    if (!reqRows.length) throw new Error('承認リクエストが見つかりません。');
    if (reqRows[0].status !== 'pending') {
      throw new Error('この承認リクエストは承認待ち状態ではありません。');
    }

    const currentStep = reqRows[0].current_approval_step;
    const partnerId = reqRows[0].buyer_partner_id;

    // ロールチェック
    const steps = await getWorkflowSteps(partnerId);
    const currentIdx = steps.findIndex(s => s.step_order === currentStep);
    if (currentIdx === -1) throw new Error('現在の承認ステップが見つかりません。');

    const requiredRole = steps[currentIdx].role;
    const hasRole = await dbQuery(
      `SELECT 1 FROM partner_member_roles
       WHERE partner_id = $1 AND user_id = $2 AND role = $3 LIMIT 1`,
      [partnerId, approverId, requiredRole]
    );
    if (!hasRole.length) throw new Error('この承認ステップに対する権限がありません。');

    // ステップ承認
    const updated = await dbQuery(
      `UPDATE approval_request_steps
       SET status = 'approved', approver_id = $1, comment = $2, decided_at = now()
       WHERE request_id = $3 AND step_order = $4 AND status = 'pending'
       RETURNING id`,
      [approverId, comment || null, requestId, currentStep]
    );
    if (!updated.length) throw new Error('承認レコードが見つかりません。');

    const nextStep = steps[currentIdx + 1];
    let result;

    if (nextStep) {
      await dbQuery(
        `INSERT INTO approval_request_steps (request_id, step_order, status) VALUES ($1, $2, 'pending')`,
        [requestId, nextStep.step_order]
      );
      await dbQuery(
        `UPDATE approval_requests SET current_approval_step = $1, updated_at = now() WHERE id = $2`,
        [nextStep.step_order, requestId]
      );
      result = { status: 'next_step', nextStep };
    } else {
      await dbQuery(
        `UPDATE approval_requests SET status = 'approved', updated_at = now() WHERE id = $1`,
        [requestId]
      );
      result = { status: 'approved' };
    }

    await dbQuery('COMMIT');
    logger.info('Approval request step approved', { requestId, approverId, result: result.status });
    return result;
  } catch (err) {
    await dbQuery('ROLLBACK');
    throw err;
  }
}

/**
 * 承認リクエストのステップを却下
 */
async function rejectRequestStep(requestId, approverId, comment) {
  await dbQuery('BEGIN');
  try {
    const reqRows = await dbQuery(
      `SELECT current_approval_step, buyer_partner_id, status
       FROM approval_requests WHERE id = $1 FOR UPDATE`,
      [requestId]
    );
    if (!reqRows.length) throw new Error('承認リクエストが見つかりません。');
    if (reqRows[0].status !== 'pending') {
      throw new Error('この承認リクエストは承認待ち状態ではありません。');
    }

    const currentStep = reqRows[0].current_approval_step;
    const partnerId = reqRows[0].buyer_partner_id;

    const steps = await getWorkflowSteps(partnerId);
    const currentIdx = steps.findIndex(s => s.step_order === currentStep);
    if (currentIdx === -1) throw new Error('現在の承認ステップが見つかりません。');

    const requiredRole = steps[currentIdx].role;
    const hasRole = await dbQuery(
      `SELECT 1 FROM partner_member_roles
       WHERE partner_id = $1 AND user_id = $2 AND role = $3 LIMIT 1`,
      [partnerId, approverId, requiredRole]
    );
    if (!hasRole.length) throw new Error('この承認ステップに対する権限がありません。');

    await dbQuery(
      `UPDATE approval_request_steps
       SET status = 'rejected', approver_id = $1, comment = $2, decided_at = now()
       WHERE request_id = $3 AND step_order = $4 AND status = 'pending'`,
      [approverId, comment || null, requestId, currentStep]
    );

    await dbQuery(
      `UPDATE approval_requests SET status = 'rejected', updated_at = now() WHERE id = $1`,
      [requestId]
    );

    await dbQuery('COMMIT');
    logger.info('Approval request rejected', { requestId, approverId });
    return { status: 'rejected' };
  } catch (err) {
    await dbQuery('ROLLBACK');
    throw err;
  }
}

/**
 * 承認リクエストを「注文済み」にマーク
 */
async function markApprovalRequestOrdered(requestId) {
  await dbQuery(
    `UPDATE approval_requests SET status = 'ordered', updated_at = now() WHERE id = $1`,
    [requestId]
  );
}

/**
 * 指定の申請者・購入者組織・出品者について、承認済みで未注文の承認リクエストを1件取得（カートで注文に進む用）
 */
async function getApprovedApprovalRequestForSeller(requesterId, buyerPartnerId, sellerPartnerId) {
  if (!requesterId || !buyerPartnerId || !sellerPartnerId) return null;
  const bid = String(buyerPartnerId);
  const sid = String(sellerPartnerId);
  const uid = String(requesterId);
  const rows = await dbQuery(
    `SELECT id FROM approval_requests
     WHERE requester_id = $1::uuid AND buyer_partner_id = $2::uuid
       AND seller_partner_id = $3::uuid AND status = 'approved'
     ORDER BY updated_at DESC
     LIMIT 1`,
    [uid, bid, sid]
  );
  return rows[0] || null;
}

module.exports = {
  isApprovalRequired,
  getWorkflowSteps,
  saveWorkflowSteps,
  createApprovalRequest,
  approveStep,
  rejectStep,
  getApprovalStatus,
  getPendingApprovals,
  // 新フロー
  createApprovalRequestFromCart,
  getMyApprovalRequests,
  getApprovalRequestDetail,
  getApprovalRequestSteps,
  getPendingApprovalRequests,
  approveRequestStep,
  rejectRequestStep,
  markApprovalRequestOrdered,
  getApprovedApprovalRequestForSeller
};
