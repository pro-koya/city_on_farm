/**
 * B2Bモジュール読み込み・構造テスト
 * 各モジュールが正しくexportされ、構文エラーがないことを確認
 */

// dbQueryモック
jest.mock('../services/db', () => ({
  dbQuery: jest.fn().mockResolvedValue([]),
  pool: {}
}));
jest.mock('../services/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn()
}));

describe('B2Bモジュール読み込みテスト', () => {

  test('creditService が正しくexportされる', () => {
    const mod = require('../services/creditService');
    expect(typeof mod.getCreditStatus).toBe('function');
    expect(typeof mod.checkCreditAvailable).toBe('function');
    expect(typeof mod.addCreditUsage).toBe('function');
    expect(typeof mod.releaseCreditUsage).toBe('function');
    expect(typeof mod.updateCreditLimit).toBe('function');
  });

  test('orgRoleService が正しくexportされる', () => {
    const mod = require('../services/orgRoleService');
    expect(typeof mod.getMemberRoles).toBe('function');
    expect(typeof mod.setMemberRole).toBe('function');
    expect(typeof mod.removeMemberRole).toBe('function');
    expect(typeof mod.hasOrgRole).toBe('function');
    expect(typeof mod.getUserOrgRoles).toBe('function');
    expect(typeof mod.setMemberRoles).toBe('function');
    expect(Array.isArray(mod.VALID_ROLES)).toBe(true);
  });

  test('approvalService が正しくexportされる', () => {
    const mod = require('../services/approvalService');
    expect(typeof mod.isApprovalRequired).toBe('function');
    expect(typeof mod.getWorkflowSteps).toBe('function');
    expect(typeof mod.saveWorkflowSteps).toBe('function');
    expect(typeof mod.createApprovalRequest).toBe('function');
    expect(typeof mod.approveStep).toBe('function');
    expect(typeof mod.rejectStep).toBe('function');
    expect(typeof mod.getApprovalStatus).toBe('function');
    expect(typeof mod.getPendingApprovals).toBe('function');
  });

  test('customerPriceService が正しくexportされる', () => {
    const mod = require('../services/customerPriceService');
    expect(typeof mod.getCustomerPrice).toBe('function');
    expect(typeof mod.getCustomerPricesForPartner).toBe('function');
    expect(typeof mod.setCustomerPrice).toBe('function');
    expect(typeof mod.deleteCustomerPrice).toBe('function');
    expect(typeof mod.applyCustomerPricing).toBe('function');
  });

  test('invoiceService が正しくexportされる', () => {
    const mod = require('../services/invoiceService');
    expect(typeof mod.generateMonthlyInvoices).toBe('function');
    expect(typeof mod.listInvoices).toBe('function');
    expect(typeof mod.getInvoiceDetail).toBe('function');
    expect(typeof mod.recordPayment).toBe('function');
  });
});

describe('B2Bルートモジュール読み込みテスト', () => {

  test('routes-order-templates が正しくexportされる', () => {
    const mod = require('../routes-order-templates');
    expect(typeof mod.registerOrderTemplateRoutes).toBe('function');
  });

  test('routes-customer-prices が正しくexportされる', () => {
    const mod = require('../routes-customer-prices');
    expect(typeof mod.registerCustomerPriceRoutes).toBe('function');
  });

  test('routes-org-members が正しくexportされる', () => {
    const mod = require('../routes-org-members');
    expect(typeof mod.registerOrgMemberRoutes).toBe('function');
  });

  test('routes-approval が正しくexportされる', () => {
    const mod = require('../routes-approval');
    expect(typeof mod.registerApprovalRoutes).toBe('function');
  });

  test('routes-admin-invoice が正しくexportされる', () => {
    const mod = require('../routes-admin-invoice');
    expect(typeof mod.registerAdminInvoiceRoutes).toBe('function');
  });
});

describe('ルート登録テスト', () => {
  let mockApp;
  let mockRequireAuth;

  beforeEach(() => {
    mockApp = {
      get: jest.fn(),
      post: jest.fn()
    };
    mockRequireAuth = jest.fn();
  });

  test('registerOrderTemplateRoutes がルートを正しく登録する', () => {
    const { registerOrderTemplateRoutes } = require('../routes-order-templates');
    const mockDbCartAdd = jest.fn();

    registerOrderTemplateRoutes(mockApp, mockRequireAuth, mockDbCartAdd);

    // GET ルートの確認
    const getRoutes = mockApp.get.mock.calls.map(c => c[0]);
    expect(getRoutes).toContain('/my/templates');
    expect(getRoutes).toContain('/my/templates/:id');

    // POST ルートの確認
    const postRoutes = mockApp.post.mock.calls.map(c => c[0]);
    expect(postRoutes).toContain('/my/templates');
    expect(postRoutes).toContain('/my/templates/:id/update');
    expect(postRoutes).toContain('/my/templates/:id/remove-item');
    expect(postRoutes).toContain('/my/templates/:id/delete');
    expect(postRoutes).toContain('/my/templates/:id/to-cart');
  });

  test('registerCustomerPriceRoutes がルートを正しく登録する', () => {
    const { registerCustomerPriceRoutes } = require('../routes-customer-prices');

    registerCustomerPriceRoutes(mockApp, mockRequireAuth);

    const getRoutes = mockApp.get.mock.calls.map(c => c[0]);
    expect(getRoutes).toContain('/seller/partners/:buyerId/prices');
    expect(getRoutes).toContain('/seller/customer-prices');

    const postRoutes = mockApp.post.mock.calls.map(c => c[0]);
    expect(postRoutes).toContain('/seller/partners/:buyerId/prices');
    expect(postRoutes).toContain('/seller/partners/:buyerId/prices/:priceId/delete');
  });

  test('registerOrgMemberRoutes がルートを正しく登録する', () => {
    const { registerOrgMemberRoutes } = require('../routes-org-members');

    registerOrgMemberRoutes(mockApp, mockRequireAuth);

    const getRoutes = mockApp.get.mock.calls.map(c => c[0]);
    expect(getRoutes).toContain('/my/org/members');

    const postRoutes = mockApp.post.mock.calls.map(c => c[0]);
    expect(postRoutes).toContain('/my/org/members/:userId/roles');
  });

  test('registerApprovalRoutes がルートを正しく登録する', () => {
    const { registerApprovalRoutes } = require('../routes-approval');

    registerApprovalRoutes(mockApp, mockRequireAuth);

    const getRoutes = mockApp.get.mock.calls.map(c => c[0]);
    expect(getRoutes).toContain('/my/org/workflow');
    expect(getRoutes).toContain('/my/approvals');
    expect(getRoutes).toContain('/my/approvals/:orderId');

    const postRoutes = mockApp.post.mock.calls.map(c => c[0]);
    expect(postRoutes).toContain('/my/org/workflow');
    expect(postRoutes).toContain('/my/approvals/:orderId/approve');
    expect(postRoutes).toContain('/my/approvals/:orderId/reject');
  });
});
