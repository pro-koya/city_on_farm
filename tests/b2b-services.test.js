/**
 * B2B機能 サービス層ユニットテスト
 * DB呼び出しをモックして、ロジックの正しさを検証
 */

// dbQuery モック
const mockDbQuery = jest.fn();
jest.mock('../services/db', () => ({
  dbQuery: (...args) => mockDbQuery(...args),
  pool: {}
}));
jest.mock('../services/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

beforeEach(() => {
  mockDbQuery.mockReset();
});

// ============================================================
// creditService テスト
// ============================================================
describe('creditService', () => {
  const { getCreditStatus, checkCreditAvailable, addCreditUsage, releaseCreditUsage, updateCreditLimit } = require('../services/creditService');

  describe('getCreditStatus', () => {
    test('パートナーが存在する場合、与信情報を返す', async () => {
      mockDbQuery.mockResolvedValueOnce([{ credit_limit: 100000, credit_used: 30000, payment_terms_days: 30 }]);
      const status = await getCreditStatus('partner-1');
      expect(status).toEqual({
        limit: 100000,
        used: 30000,
        remaining: 70000,
        paymentTermsDays: 30
      });
    });

    test('パートナーが存在しない場合、nullを返す', async () => {
      mockDbQuery.mockResolvedValueOnce([]);
      const status = await getCreditStatus('nonexistent');
      expect(status).toBeNull();
    });

    test('credit_limitがnullの場合、0として扱う', async () => {
      mockDbQuery.mockResolvedValueOnce([{ credit_limit: null, credit_used: null, payment_terms_days: null }]);
      const status = await getCreditStatus('partner-1');
      expect(status.limit).toBe(0);
      expect(status.used).toBe(0);
      expect(status.remaining).toBe(0);
      expect(status.paymentTermsDays).toBe(30);
    });

    test('remainingが負にならない', async () => {
      mockDbQuery.mockResolvedValueOnce([{ credit_limit: 10000, credit_used: 15000, payment_terms_days: 30 }]);
      const status = await getCreditStatus('partner-1');
      expect(status.remaining).toBe(0);
    });
  });

  describe('checkCreditAvailable', () => {
    test('与信限度なし（0）は無制限として扱う', async () => {
      mockDbQuery.mockResolvedValueOnce([{ credit_limit: 0, credit_used: 0, payment_terms_days: 30 }]);
      const result = await checkCreditAvailable('partner-1', 50000);
      expect(result.available).toBe(true);
    });

    test('与信残高が十分な場合、available=true', async () => {
      mockDbQuery.mockResolvedValueOnce([{ credit_limit: 100000, credit_used: 30000, payment_terms_days: 30 }]);
      const result = await checkCreditAvailable('partner-1', 50000);
      expect(result.available).toBe(true);
    });

    test('与信残高が不足の場合、available=false', async () => {
      mockDbQuery.mockResolvedValueOnce([{ credit_limit: 100000, credit_used: 80000, payment_terms_days: 30 }]);
      const result = await checkCreditAvailable('partner-1', 30000);
      expect(result.available).toBe(false);
      expect(result.reason).toContain('与信残高が不足');
    });

    test('partnerIdがnullの場合、available=true', async () => {
      const result = await checkCreditAvailable(null, 50000);
      expect(result.available).toBe(true);
    });

    test('パートナーが存在しない場合、available=true（未設定扱い）', async () => {
      mockDbQuery.mockResolvedValueOnce([]);
      const result = await checkCreditAvailable('nonexistent', 50000);
      expect(result.available).toBe(true);
    });
  });

  describe('addCreditUsage', () => {
    test('正常な加算', async () => {
      mockDbQuery.mockResolvedValueOnce([]);
      await addCreditUsage('partner-1', 5000);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('credit_used = COALESCE(credit_used, 0) + $1'),
        [5000, 'partner-1']
      );
    });

    test('amountが0以下の場合は何もしない', async () => {
      await addCreditUsage('partner-1', 0);
      expect(mockDbQuery).not.toHaveBeenCalled();
    });

    test('amountが負の場合は何もしない', async () => {
      await addCreditUsage('partner-1', -100);
      expect(mockDbQuery).not.toHaveBeenCalled();
    });

    test('partnerIdがnullの場合は何もしない', async () => {
      await addCreditUsage(null, 5000);
      expect(mockDbQuery).not.toHaveBeenCalled();
    });
  });

  describe('releaseCreditUsage', () => {
    test('正常な減算', async () => {
      mockDbQuery.mockResolvedValueOnce([]);
      await releaseCreditUsage('partner-1', 3000);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('GREATEST(0, COALESCE(credit_used, 0) - $1)'),
        [3000, 'partner-1']
      );
    });

    test('amountが0以下の場合は何もしない', async () => {
      await releaseCreditUsage('partner-1', 0);
      expect(mockDbQuery).not.toHaveBeenCalled();
    });
  });

  describe('updateCreditLimit', () => {
    test('正常な更新', async () => {
      mockDbQuery.mockResolvedValueOnce([]);
      await updateCreditLimit('partner-1', 200000);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('credit_limit = $1'),
        [200000, 'partner-1']
      );
    });

    test('負の値はエラーになる', async () => {
      await expect(updateCreditLimit('partner-1', -100)).rejects.toThrow('0以上');
    });

    test('NaNはエラーになる', async () => {
      await expect(updateCreditLimit('partner-1', 'abc')).rejects.toThrow('0以上');
    });
  });
});

// ============================================================
// orgRoleService テスト
// ============================================================
describe('orgRoleService', () => {
  const { VALID_ROLES, setMemberRole, hasOrgRole, getUserOrgRoles, setMemberRoles } = require('../services/orgRoleService');

  test('VALID_ROLES に正しいロールが含まれる', () => {
    expect(VALID_ROLES).toContain('orderer');
    expect(VALID_ROLES).toContain('approver');
    expect(VALID_ROLES).toContain('accountant');
    expect(VALID_ROLES).toContain('org_admin');
    expect(VALID_ROLES).toHaveLength(4);
  });

  describe('setMemberRole', () => {
    test('有効なロールで設定', async () => {
      mockDbQuery.mockResolvedValueOnce([]);
      await setMemberRole('partner-1', 'user-1', 'approver');
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO partner_member_roles'),
        ['partner-1', 'user-1', 'approver']
      );
    });

    test('無効なロールでエラー', async () => {
      await expect(setMemberRole('partner-1', 'user-1', 'superadmin')).rejects.toThrow('Invalid role');
    });
  });

  describe('hasOrgRole', () => {
    test('ロールがある場合true', async () => {
      mockDbQuery.mockResolvedValueOnce([{ '?column?': 1 }]);
      const result = await hasOrgRole('user-1', 'partner-1', 'approver');
      expect(result).toBe(true);
    });

    test('ロールがない場合false', async () => {
      mockDbQuery.mockResolvedValueOnce([]);
      const result = await hasOrgRole('user-1', 'partner-1', 'approver');
      expect(result).toBe(false);
    });
  });

  describe('setMemberRoles', () => {
    test('トランザクション内で実行される', async () => {
      mockDbQuery.mockResolvedValue([]);
      await setMemberRoles('partner-1', 'user-1', ['orderer', 'approver']);

      const calls = mockDbQuery.mock.calls.map(c => c[0]);
      expect(calls[0]).toBe('BEGIN');
      expect(calls).toContain('COMMIT');
      expect(calls.some(c => c.includes('DELETE FROM partner_member_roles'))).toBe(true);
    });

    test('無効なロールはフィルタリングされる', async () => {
      mockDbQuery.mockResolvedValue([]);
      await setMemberRoles('partner-1', 'user-1', ['orderer', 'superadmin', 'hacker']);

      // DELETE(1) + INSERT(ordererのみ1回) + BEGIN + COMMIT = 4回
      const insertCalls = mockDbQuery.mock.calls.filter(c => c[0].includes('INSERT'));
      expect(insertCalls).toHaveLength(1);
    });

    test('エラー時にROLLBACKされる', async () => {
      mockDbQuery
        .mockResolvedValueOnce([]) // BEGIN
        .mockRejectedValueOnce(new Error('DB Error')); // DELETE

      await expect(setMemberRoles('partner-1', 'user-1', ['orderer'])).rejects.toThrow('DB Error');
      const calls = mockDbQuery.mock.calls.map(c => c[0]);
      expect(calls).toContain('ROLLBACK');
    });
  });
});

// ============================================================
// approvalService テスト
// ============================================================
describe('approvalService', () => {
  const { isApprovalRequired, createApprovalRequest, approveStep, rejectStep } = require('../services/approvalService');

  describe('isApprovalRequired', () => {
    test('承認ワークフローが有効な場合true', async () => {
      mockDbQuery.mockResolvedValueOnce([{ approval_workflow_enabled: true }]);
      const result = await isApprovalRequired('partner-1');
      expect(result).toBe(true);
    });

    test('承認ワークフローが無効な場合false', async () => {
      mockDbQuery.mockResolvedValueOnce([{ approval_workflow_enabled: false }]);
      const result = await isApprovalRequired('partner-1');
      expect(result).toBe(false);
    });

    test('パートナーIDがnullの場合false', async () => {
      const result = await isApprovalRequired(null);
      expect(result).toBe(false);
    });

    test('パートナーが存在しない場合false', async () => {
      mockDbQuery.mockResolvedValueOnce([]);
      const result = await isApprovalRequired('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('createApprovalRequest', () => {
    test('ステップ未設定時は自動承認', async () => {
      // getWorkflowSteps returns empty
      mockDbQuery.mockResolvedValueOnce([]);
      // auto-approve UPDATE
      mockDbQuery.mockResolvedValueOnce([]);

      const result = await createApprovalRequest('order-1', 'partner-1');
      expect(result.autoApproved).toBe(true);
    });

    test('ステップあり時は承認レコード作成', async () => {
      // getWorkflowSteps
      mockDbQuery.mockResolvedValueOnce([{ id: 's1', step_order: 1, role: 'approver' }]);
      // INSERT order_approvals
      mockDbQuery.mockResolvedValueOnce([]);
      // UPDATE orders
      mockDbQuery.mockResolvedValueOnce([]);

      const result = await createApprovalRequest('order-1', 'partner-1');
      expect(result.step.step_order).toBe(1);
    });
  });

  describe('approveStep', () => {
    test('権限のないユーザーはエラー', async () => {
      // BEGIN
      mockDbQuery.mockResolvedValueOnce([]);
      // SELECT FOR UPDATE
      mockDbQuery.mockResolvedValueOnce([{
        current_approval_step: 1,
        buyer_partner_id: 'partner-1',
        approval_status: 'pending'
      }]);
      // getWorkflowSteps
      mockDbQuery.mockResolvedValueOnce([{ id: 's1', step_order: 1, role: 'approver' }]);
      // hasRole check - empty = no role
      mockDbQuery.mockResolvedValueOnce([]);
      // ROLLBACK
      mockDbQuery.mockResolvedValueOnce([]);

      await expect(approveStep('order-1', 'user-no-role', 'OK'))
        .rejects.toThrow('権限');
    });

    test('承認待ち以外のステータスはエラー', async () => {
      // BEGIN
      mockDbQuery.mockResolvedValueOnce([]);
      // SELECT FOR UPDATE
      mockDbQuery.mockResolvedValueOnce([{
        current_approval_step: 1,
        buyer_partner_id: 'partner-1',
        approval_status: 'approved'
      }]);
      // ROLLBACK
      mockDbQuery.mockResolvedValueOnce([]);

      await expect(approveStep('order-1', 'user-1', 'OK'))
        .rejects.toThrow('承認待ち状態ではありません');
    });

    test('最終ステップ承認で注文確定', async () => {
      // BEGIN
      mockDbQuery.mockResolvedValueOnce([]);
      // SELECT FOR UPDATE
      mockDbQuery.mockResolvedValueOnce([{
        current_approval_step: 1,
        buyer_partner_id: 'partner-1',
        approval_status: 'pending'
      }]);
      // getWorkflowSteps - only 1 step
      mockDbQuery.mockResolvedValueOnce([{ id: 's1', step_order: 1, role: 'approver' }]);
      // hasRole check
      mockDbQuery.mockResolvedValueOnce([{ '?column?': 1 }]);
      // UPDATE order_approvals RETURNING
      mockDbQuery.mockResolvedValueOnce([{ id: 'oa1' }]);
      // UPDATE orders to approved
      mockDbQuery.mockResolvedValueOnce([]);
      // COMMIT
      mockDbQuery.mockResolvedValueOnce([]);

      const result = await approveStep('order-1', 'user-1', 'OK');
      expect(result.status).toBe('approved');
    });

    test('中間ステップ承認で次ステップに遷移', async () => {
      // BEGIN
      mockDbQuery.mockResolvedValueOnce([]);
      // SELECT FOR UPDATE
      mockDbQuery.mockResolvedValueOnce([{
        current_approval_step: 1,
        buyer_partner_id: 'partner-1',
        approval_status: 'pending'
      }]);
      // getWorkflowSteps - 2 steps
      mockDbQuery.mockResolvedValueOnce([
        { id: 's1', step_order: 1, role: 'approver' },
        { id: 's2', step_order: 2, role: 'org_admin' }
      ]);
      // hasRole check
      mockDbQuery.mockResolvedValueOnce([{ '?column?': 1 }]);
      // UPDATE order_approvals RETURNING
      mockDbQuery.mockResolvedValueOnce([{ id: 'oa1' }]);
      // INSERT next step approval
      mockDbQuery.mockResolvedValueOnce([]);
      // UPDATE orders current_approval_step
      mockDbQuery.mockResolvedValueOnce([]);
      // COMMIT
      mockDbQuery.mockResolvedValueOnce([]);

      const result = await approveStep('order-1', 'user-1', 'OK');
      expect(result.status).toBe('next_step');
      expect(result.nextStep.step_order).toBe(2);
    });
  });

  describe('rejectStep', () => {
    test('却下でapproval_statusがrejectedに', async () => {
      // BEGIN
      mockDbQuery.mockResolvedValueOnce([]);
      // SELECT FOR UPDATE
      mockDbQuery.mockResolvedValueOnce([{
        current_approval_step: 1,
        approval_status: 'pending',
        buyer_partner_id: 'partner-1'
      }]);
      // getWorkflowSteps
      mockDbQuery.mockResolvedValueOnce([{ id: 's1', step_order: 1, role: 'approver' }]);
      // hasRole check
      mockDbQuery.mockResolvedValueOnce([{ '?column?': 1 }]);
      // UPDATE order_approvals
      mockDbQuery.mockResolvedValueOnce([]);
      // UPDATE orders
      mockDbQuery.mockResolvedValueOnce([]);
      // COMMIT
      mockDbQuery.mockResolvedValueOnce([]);

      const result = await rejectStep('order-1', 'user-1', '予算超過');
      expect(result.status).toBe('rejected');
    });
  });
});

// ============================================================
// customerPriceService テスト
// ============================================================
describe('customerPriceService', () => {
  const { getCustomerPrice, setCustomerPrice, applyCustomerPricing } = require('../services/customerPriceService');

  describe('getCustomerPrice', () => {
    test('パラメータ不足でnull', async () => {
      const result = await getCustomerPrice(null, 'product-1');
      expect(result).toBeNull();
    });

    test('価格が存在する場合、値を返す', async () => {
      mockDbQuery.mockResolvedValueOnce([{ price: 500 }]);
      const result = await getCustomerPrice('partner-1', 'product-1');
      expect(result).toBe(500);
    });

    test('価格が存在しない場合、null', async () => {
      mockDbQuery.mockResolvedValueOnce([]);
      const result = await getCustomerPrice('partner-1', 'product-1');
      expect(result).toBeNull();
    });
  });

  describe('applyCustomerPricing', () => {
    test('パートナーIDなしの場合はアイテムをそのまま返す', async () => {
      const items = [{ product_id: 'p1', price: 1000 }];
      const result = await applyCustomerPricing(items, null);
      expect(result).toEqual(items);
    });

    test('カスタム価格が適用される', async () => {
      // getCustomerPricesForPartner内のdbQuery
      mockDbQuery.mockResolvedValueOnce([
        { product_id: 'p1', price: 800 }
      ]);

      const items = [
        { product_id: 'p1', price: 1000 },
        { product_id: 'p2', price: 2000 }
      ];
      const result = await applyCustomerPricing(items, 'partner-1');

      const p1 = result.find(i => i.product_id === 'p1');
      expect(p1.price).toBe(800);
      expect(p1.standardPrice).toBe(1000);
      expect(p1.hasCustomerPrice).toBe(true);

      const p2 = result.find(i => i.product_id === 'p2');
      expect(p2.price).toBe(2000);
      expect(p2.hasCustomerPrice).toBeFalsy();
    });
  });
});
