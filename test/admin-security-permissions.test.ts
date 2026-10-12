import { describe, it, expect } from 'vitest';
import {
  computeEffectivePermissions,
  calculateUserInactivity,
  buildUserAccessReview,
} from '../src/features/admin/utils/effectivePermissionsEngine';
import { detectSodViolations } from '../src/features/admin/utils/sodEngine';
import { validateAlertRule, formatTriggerDescription } from '../src/features/admin/utils/alertRuleEngine';
import { computeSettingsDiff } from '../src/features/admin/utils/settingsDiffEngine';
import { MockSecurityAuditAdapter } from '../src/shared/adapters/mock/mockSecurityAuditAdapter';
import { MockSystemAdapter } from '../src/shared/adapters/mock/mockSystemAdapter';
import { MockNotificationsAdapter } from '../src/shared/adapters/mock/mockNotificationsAdapter';
import { SystemParameters } from '../src/features/admin/types/systemSettings';
import { AdminUser } from '../src/shared/adapters/mock/adminMockData';

describe('Module 17: Advanced Users & Permissions Engine', () => {
  it('computes effective permissions with role defaults, grants, and revocations', () => {
    const role = 'cashier';
    const grants = [
      {
        id: 'grant-1',
        userId: 'usr-1',
        permission: 'products.cost_price.view',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        grantedBy: 'admin',
        reason: 'İnventar qiymətləndirməsi',
        status: 'active' as const,
      },
    ];
    const revocations = ['pos.sale.cancel'];

    const effective = computeEffectivePermissions(role, grants, revocations);

    // Should include base cashier permissions
    expect(effective).toContain('pos.terminal.access');
    expect(effective).toContain('pos.sale.create');

    // Should include grant
    expect(effective).toContain('products.cost_price.view');

    // Should NOT include revoked permission
    expect(effective).not.toContain('pos.sale.cancel');
  });

  it('handles superadmin wildcard permission correctly', () => {
    const effective = computeEffectivePermissions('superadmin', [], []);
    expect(effective).toEqual(['*']);
  });

  it('detects user inactivity > 30 days', () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const result = calculateUserInactivity(fortyDaysAgo);
    expect(result.isInactive30d).toBe(true);
    expect(result.inactivityDays).toBeGreaterThanOrEqual(39);

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const activeResult = calculateUserInactivity(twoDaysAgo);
    expect(activeResult.isInactive30d).toBe(false);
  });

  it('builds full user access review with inactive flag and effective permissions', () => {
    const user: AdminUser = {
      id: 'usr-10',
      name: 'Test Əməkdaş',
      email: 'test@brendhouse.az',
      username: 'test.user',
      role: 'cashier',
      roleName: 'Kassir',
      branchId: 'b-1',
      branchName: 'Gənclik Mall',
      allowedBranchIds: ['b-1', 'b-2'],
      isActive: true,
      phone: '+994 50 111 22 33',
      lastLoginAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const review = buildUserAccessReview(user, [], []);
    expect(review.userId).toBe('usr-10');
    expect(review.isInactive).toBe(true);
    expect(review.effectivePermissions).toContain('pos.terminal.access');
    expect(review.branchScope).toBe('2 filial');
  });

  it('detects Segregation of Duties (SoD) violations in conflicting permission sets', () => {
    // Conflict rule 1: Payment creation vs payment approval
    const conflictingPermissions = [
      'finance.expense.create',
      'finance.expense.approve',
    ];

    const violations = detectSodViolations(conflictingPermissions);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.ruleId === 'sod-finance-1')).toBe(true);
  });

  it('detects stock adjustment vs stock count approve conflict', () => {
    const conflictingPermissions = [
      'inventory.stock.adjust',
      'inventory.stock.count_approve',
    ];

    const violations = detectSodViolations(conflictingPermissions);
    expect(violations.some((v) => v.ruleId === 'sod-inventory-1')).toBe(true);
  });

  it('does NOT trigger SoD false positive for superadmin wildcard (*)', () => {
    const violations = detectSodViolations(['*']);
    expect(violations.length).toBe(0);
  });
});

describe('Module 18: Audit & Security Repository', () => {
  it('retrieves audit logs and filters by correlation ID and sensitive flag', async () => {
    const repo = new MockSecurityAuditAdapter();
    const allLogs = await repo.getAuditLogs();
    expect(allLogs.length).toBeGreaterThan(0);

    const sensitiveLogs = await repo.getAuditLogs({ isSensitiveOnly: true });
    expect(sensitiveLogs.every((l) => l.isSensitive)).toBe(true);

    const correlationLogs = await repo.getAuditLogs({ correlationId: 'CORR-SALE-4120' });
    expect(correlationLogs.length).toBe(3);
  });

  it('logs export action to the audit trail itself upon exporting audit logs', async () => {
    const repo = new MockSecurityAuditAdapter();
    const initialLogsCount = (await repo.getAuditLogs()).length;

    const { filename } = await repo.exportAuditLogs({ module: 'pos' }, 'Audit Müfəttişi');
    expect(filename).toContain('brand_house_audit_export');

    const logsAfterExport = await repo.getAuditLogs();
    expect(logsAfterExport.length).toBe(initialLogsCount + 1);

    const latestLog = logsAfterExport[0];
    expect(latestLog.module).toBe('admin.audit');
    expect(latestLog.action).toBe('Audit Jurnalı İxrac Edildi');
    expect(latestLog.isSensitive).toBe(true);
  });

  it('updates security event status with resolution notes and assigned investigator', async () => {
    const repo = new MockSecurityAuditAdapter();
    const events = await repo.getSecurityEvents();
    expect(events.length).toBeGreaterThan(0);

    const firstEvent = events[0];
    const updated = await repo.updateSecurityEventStatus(
      firstEvent.id,
      'resolved',
      'IP bloklandı və şifrə dəyişdirildi',
      'Baş Admin'
    );

    expect(updated.status).toBe('resolved');
    expect(updated.resolutionNotes).toBe('IP bloklandı və şifrə dəyişdirildi');
    expect(updated.assignedTo).toBe('Baş Admin');
  });

  it('manages data subject requests (anonymize, export, delete)', async () => {
    const repo = new MockSecurityAuditAdapter();
    const requests = await repo.getDataSubjectRequests();
    expect(requests.length).toBeGreaterThan(0);

    const newReq = await repo.createDataSubjectRequest({
      customerId: 'cust-999',
      customerName: 'Aytac Əliyeva',
      customerPhone: '+994 50 999 88 77',
      requestType: 'delete',
      reason: 'Fərdi məlumatların silinməsi tələbi',
    });

    expect(newReq.id).toBeDefined();
    expect(newReq.status).toBe('pending');

    const processed = await repo.updateDataSubjectRequestStatus(
      newReq.id,
      'completed',
      'Məlumat Mühafizəsi Zabiti'
    );
    expect(processed.status).toBe('completed');
  });
});

describe('Module 19: Notifications & Alert Rules', () => {
  it('validates alert rules accurately', () => {
    const validRule = {
      id: 'rule-1',
      name: 'Minimum Qalıq',
      triggerType: 'low_stock' as const,
      thresholdValue: 10,
      thresholdUnit: 'ədəd',
      recipientRoles: ['warehouse_keeper'],
      recipientBranchIds: ['all'],
      escalationMinutes: 30,
      isEnabled: true,
      testSendStatus: 'Konfiqurasiya olunmayıb' as const,
    };

    const validResult = validateAlertRule(validRule);
    expect(validResult.isValid).toBe(true);

    const invalidRule = {
      ...validRule,
      name: '',
      thresholdValue: -5,
      recipientRoles: [],
    };

    const invalidResult = validateAlertRule(invalidRule);
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.errors.length).toBe(3);
  });

  it('formats trigger description correctly', () => {
    const rule = {
      id: 'rule-2',
      name: 'Kassa Kəsiri',
      triggerType: 'register_variance' as const,
      thresholdValue: 25,
      thresholdUnit: '₼',
      recipientRoles: ['branch_manager'],
      recipientBranchIds: ['all'],
      escalationMinutes: 15,
      isEnabled: true,
      testSendStatus: 'Konfiqurasiya olunmayıb' as const,
    };

    const desc = formatTriggerDescription(rule);
    expect(desc).toContain('25 ₼');
    expect(desc).toContain('Kassa Fərqi');
  });

  it('marks notifications as read and snoozes correctly', async () => {
    const repo = new MockNotificationsAdapter();
    const notifications = await repo.getNotifications();
    expect(notifications.length).toBeGreaterThan(0);

    const firstId = notifications[0].id;
    await repo.markAsRead(firstId);
    let updatedList = await repo.getNotifications();
    expect(updatedList.find((n) => n.id === firstId)?.isRead).toBe(true);

    await repo.snoozeNotification(firstId, 60);
    updatedList = await repo.getNotifications();
    expect(updatedList.find((n) => n.id === firstId)?.isSnoozed).toBe(true);

    await repo.markAllAsRead();
    updatedList = await repo.getNotifications();
    expect(updatedList.every((n) => n.isRead)).toBe(true);
  });

  it('handles external channel unconfigured status safely without fake simulation', async () => {
    const repo = new MockNotificationsAdapter();
    const prefs = await repo.getUserPreferences('usr-001');

    expect(prefs.inAppEnabled).toBe(true);
    expect(prefs.emailChannelStatus).toBe('Konfiqurasiya olunmayıb');
    expect(prefs.smsChannelStatus).toBe('Konfiqurasiya olunmayıb');
    expect(prefs.pushChannelStatus).toBe('Konfiqurasiya olunmayıb');
  });

  it('processes approvals in the approvals inbox', async () => {
    const repo = new MockNotificationsAdapter();
    const approvals = await repo.getApprovals();
    expect(approvals.length).toBeGreaterThan(0);

    const pending = approvals.find((a) => a.status === 'pending');
    expect(pending).toBeDefined();

    if (pending) {
      const approved = await repo.updateApprovalStatus(pending.id, 'approved', 'Büdcəyə uyğundur');
      expect(approved.status).toBe('approved');
    }
  });
});

describe('Module 20: System Parameters & Versioning', () => {
  it('computes field-level diff between initial and modified settings', () => {
    const oldSettings: Partial<SystemParameters> = {
      general: {
        companyName: 'BRAND HOUSE',
        legalName: 'Brand House MMC',
        voen: '1234567891',
        legalAddress: 'Bakı ş., Nizami küç. 45',
        phone: '+994 12 598 00 00',
        email: 'info@brendhouse.az',
        timezone: 'Asia/Baku',
      },
      returnPolicy: {
        returnWindowDays: 14,
        approvalThresholdAzn: 50,
        requireReceipt: true,
        reasonCodes: ['Qüsur'],
      },
    };

    const newSettings: Partial<SystemParameters> = {
      general: {
        companyName: 'BRAND HOUSE ENTERPRISE',
        legalName: 'Brand House MMC',
        voen: '1234567891',
        legalAddress: 'Bakı ş., Nizami küç. 45',
        phone: '+994 12 598 00 00',
        email: 'info@brendhouse.az',
        timezone: 'Asia/Baku',
      },
      returnPolicy: {
        returnWindowDays: 30,
        approvalThresholdAzn: 100,
        requireReceipt: true,
        reasonCodes: ['Qüsur'],
      },
    };

    const diffs = computeSettingsDiff(oldSettings, newSettings);
    expect(diffs.length).toBe(3);

    const companyDiff = diffs.find((d) => d.field === 'companyName');
    expect(companyDiff).toBeDefined();
    expect(companyDiff?.oldValue).toBe('BRAND HOUSE');
    expect(companyDiff?.newValue).toBe('BRAND HOUSE ENTERPRISE');

    const returnWindowDiff = diffs.find((d) => d.field === 'returnWindowDays');
    expect(returnWindowDiff?.oldValue).toBe(14);
    expect(returnWindowDiff?.newValue).toBe(30);
  });

  it('saves system parameters with versioning and performs rollback', async () => {
    const repo = new MockSystemAdapter();
    const initial = await repo.getSystemParameters();
    const historyBefore = await repo.getVersionHistory();

    const modified: SystemParameters = {
      ...initial,
      general: {
        ...initial.general,
        companyName: 'BRAND HOUSE LUXURY',
      },
    };

    const savedVersion = await repo.saveSystemParametersWithVersion(
      modified,
      'Rebranding üzrə şirkət adının yenilənməsi',
      'Admin'
    );

    expect(savedVersion.versionNumber).toBe(historyBefore.length + 1);
    expect(savedVersion.reason).toBe('Rebranding üzrə şirkət adının yenilənməsi');

    const current = await repo.getSystemParameters();
    expect(current.general.companyName).toBe('BRAND HOUSE LUXURY');

    // Rollback to original version
    const oldestVersionId = historyBefore[historyBefore.length - 1].versionId;
    const restored = await repo.rollbackToVersion(oldestVersionId, 'Test Rollback');
    expect(restored.general.companyName).toBe(initial.general.companyName);
  });

  it('keeps unconfigured integrations in explicit unconfigured state', async () => {
    const repo = new MockSystemAdapter();
    const integrations = await repo.getIntegrations();

    expect(integrations.length).toBe(6);
    const unconfigured = integrations.filter((i) => i.status === 'Konfiqurasiya olunmayıb');
    expect(unconfigured.length).toBeGreaterThan(0);

    // Testing an unconfigured integration must return false without fake connection
    const testResult = await repo.testIntegration(unconfigured[0].id);
    expect(testResult.success).toBe(false);
    expect(testResult.message).toContain('Konfiqurasiya olunmayıb');
  });
});
