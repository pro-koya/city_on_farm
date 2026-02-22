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
  const rows = await dbQuery(
    `SELECT id, step_order, role FROM approval_workflow_steps
     WHERE partner_id = $1
     ORDER BY step_order ASC`,
    [partnerId]
  );
  return rows;
}

/**
 * ワークフローステップ設定を保存
 */
async function saveWorkflowSteps(partnerId, steps) {
  // 既存を削除して再作成
  await dbQuery(`DELETE FROM approval_workflow_steps WHERE partner_id = $1`, [partnerId]);
  for (const step of steps) {
    await dbQuery(
      `INSERT INTO approval_workflow_steps (partner_id, step_order, role)
       VALUES ($1, $2, $3)`,
      [partnerId, step.step_order, step.role]
    );
  }
  logger.info('Workflow steps saved', { partnerId, stepCount: steps.length });
}

/**
 * 承認リクエスト作成（注文確定時に呼ばれる）
 */
async function createApprovalRequest(orderId, partnerId) {
  const steps = await getWorkflowSteps(partnerId);
  if (!steps.length) {
    logger.warn('No workflow steps configured', { partnerId });
    return null;
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
  // 現在のステップを取得
  const orderRows = await dbQuery(
    `SELECT current_approval_step, buyer_partner_id FROM orders WHERE id = $1`, [orderId]
  );
  if (!orderRows.length) throw new Error('Order not found');

  const currentStep = orderRows[0].current_approval_step;
  const partnerId = orderRows[0].buyer_partner_id;

  // 承認レコード更新
  await dbQuery(
    `UPDATE order_approvals
     SET status = 'approved', approver_id = $1, comment = $2, decided_at = now()
     WHERE order_id = $3 AND step_order = $4 AND status = 'pending'`,
    [approverId, comment || null, orderId, currentStep]
  );

  // 次のステップがあるか確認
  const steps = await getWorkflowSteps(partnerId);
  const currentIdx = steps.findIndex(s => s.step_order === currentStep);
  const nextStep = steps[currentIdx + 1];

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
    return { status: 'next_step', nextStep };
  } else {
    // 全ステップ承認済み → 注文確定
    await dbQuery(
      `UPDATE orders SET approval_status = 'approved', status = 'processing' WHERE id = $1`,
      [orderId]
    );
    logger.info('Order fully approved', { orderId });
    return { status: 'approved' };
  }
}

/**
 * 却下
 */
async function rejectStep(orderId, approverId, comment) {
  const orderRows = await dbQuery(
    `SELECT current_approval_step FROM orders WHERE id = $1`, [orderId]
  );
  if (!orderRows.length) throw new Error('Order not found');

  const currentStep = orderRows[0].current_approval_step;

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

  logger.info('Order rejected', { orderId, approverId });
  return { status: 'rejected' };
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

module.exports = {
  isApprovalRequired,
  getWorkflowSteps,
  saveWorkflowSteps,
  createApprovalRequest,
  approveStep,
  rejectStep,
  getApprovalStatus,
  getPendingApprovals
};
