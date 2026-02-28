// services/orgRoleService.js
// 組織内ロール管理

const { dbQuery } = require('./db');
const logger = require('./logger');

const VALID_ROLES = ['orderer', 'approver', 'accountant', 'org_admin'];

/**
 * 組織メンバーとロール一覧
 */
async function getMemberRoles(partnerId) {
  const rows = await dbQuery(
    `SELECT u.id AS user_id, u.name, u.email,
            COALESCE(
              (SELECT json_agg(pmr.role ORDER BY pmr.role)
               FROM partner_member_roles pmr
               WHERE pmr.partner_id = $1 AND pmr.user_id = u.id),
              '[]'::json
            ) AS roles
     FROM users u
     WHERE u.partner_id = $1
     ORDER BY u.name ASC`,
    [partnerId]
  );
  return rows;
}

/**
 * ロール設定（追加）
 */
async function setMemberRole(partnerId, userId, role) {
  if (!VALID_ROLES.includes(role)) throw new Error(`Invalid role: ${role}`);
  await dbQuery(
    `INSERT INTO partner_member_roles (partner_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (partner_id, user_id, role) DO NOTHING`,
    [partnerId, userId, role]
  );
  logger.info('Org role set', { partnerId, userId, role });
}

/**
 * ロール削除
 */
async function removeMemberRole(partnerId, userId, role) {
  await dbQuery(
    `DELETE FROM partner_member_roles
     WHERE partner_id = $1 AND user_id = $2 AND role = $3`,
    [partnerId, userId, role]
  );
  logger.info('Org role removed', { partnerId, userId, role });
}

/**
 * ユーザーが指定ロールを持つかチェック
 */
async function hasOrgRole(userId, partnerId, role) {
  const rows = await dbQuery(
    `SELECT 1 FROM partner_member_roles
     WHERE partner_id = $1 AND user_id = $2 AND role = $3
     LIMIT 1`,
    [partnerId, userId, role]
  );
  return rows.length > 0;
}

/**
 * ユーザーが持つ全組織ロールを取得
 */
async function getUserOrgRoles(userId, partnerId) {
  const rows = await dbQuery(
    `SELECT role FROM partner_member_roles
     WHERE partner_id = $1 AND user_id = $2`,
    [partnerId, userId]
  );
  return rows.map(r => r.role);
}

/**
 * ユーザーがメンバーとして所属する partner_id 一覧を取得
 * （users.partner_id が未設定でも partner_member_roles のみの所属で取得可能）
 */
async function getPartnerIdsForUser(userId) {
  if (!userId) return [];
  const rows = await dbQuery(
    `SELECT DISTINCT partner_id FROM partner_member_roles WHERE user_id = $1 ORDER BY partner_id`,
    [userId]
  );
  return rows.map(r => r.partner_id);
}

/**
 * メンバーのロールを一括更新（既存を全削除→再追加）
 */
async function setMemberRoles(partnerId, userId, roles) {
  const validRoles = roles.filter(r => VALID_ROLES.includes(r));
  await dbQuery('BEGIN');
  try {
    await dbQuery(
      `DELETE FROM partner_member_roles WHERE partner_id = $1 AND user_id = $2`,
      [partnerId, userId]
    );
    for (const role of validRoles) {
      await dbQuery(
        `INSERT INTO partner_member_roles (partner_id, user_id, role) VALUES ($1, $2, $3)`,
        [partnerId, userId, role]
      );
    }
    await dbQuery('COMMIT');
    logger.info('Org roles updated', { partnerId, userId, roles: validRoles });
  } catch (err) {
    await dbQuery('ROLLBACK');
    throw err;
  }
}

module.exports = {
  VALID_ROLES,
  getMemberRoles,
  setMemberRole,
  removeMemberRole,
  hasOrgRole,
  getUserOrgRoles,
  setMemberRoles,
  getPartnerIdsForUser
};
