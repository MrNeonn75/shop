import {
  NotificationItem,
  UserNotificationPreference,
  AlertRule,
  ApprovalItem,
} from '../../../features/admin/types/notifications';
import { validateAlertRule } from '../../../features/admin/utils/alertRuleEngine';

export interface NotificationsRepository {
  getNotifications(): Promise<NotificationItem[]>;
  markAsRead(notificationId: string): Promise<boolean>;
  markAllAsRead(): Promise<boolean>;
  snoozeNotification(notificationId: string, hours: number): Promise<boolean>;

  getUserPreferences(userId: string): Promise<UserNotificationPreference>;
  updateUserPreferences(userId: string, prefs: Partial<UserNotificationPreference>): Promise<UserNotificationPreference>;

  getAlertRules(): Promise<AlertRule[]>;
  createAlertRule(rule: Partial<AlertRule>): Promise<AlertRule>;
  updateAlertRule(ruleId: string, updates: Partial<AlertRule>): Promise<AlertRule>;
  deleteAlertRule(ruleId: string): Promise<boolean>;
  testSendAlertRule(ruleId: string): Promise<{ success: boolean; message: string }>;

  getPendingApprovals(): Promise<ApprovalItem[]>;
  getApprovals(): Promise<ApprovalItem[]>;
  approvePendingItem(itemId: string, approverName: string, notes?: string): Promise<ApprovalItem>;
  rejectPendingItem(itemId: string, rejectorName: string, reason: string): Promise<ApprovalItem>;
  updateApprovalStatus(itemId: string, status: 'approved' | 'rejected', notes?: string): Promise<ApprovalItem>;
}

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    category: 'stock',
    severity: 'critical',
    title: 'Kritik Qalıq Xəbərdarlığı',
    message: 'Massimo Dutti İpək Bluz (Gənclik Mall) qalıq sayı 2 ədəd qalıb. Təhlükəsizlik ehtiyatı 10 ədəddir.',
    timestamp: '2026-10-12T11:45:00Z',
    isRead: false,
    isSnoozed: false,
    linkUrl: '/inventory/balances',
    eventKey: 'stock_low_TSH-WHT-M',
  },
  {
    id: 'notif-2',
    category: 'approval',
    severity: 'warning',
    title: 'Təsdiq Gözləyən Satınalma Sifarişi',
    message: 'PO #PO-2026-0042 (Təchizatçı: Silk Elegance MMC, Məbləğ: 14,250.00 ₼) Baş Menecer təsdiqi gözləyir.',
    timestamp: '2026-10-12T11:00:00Z',
    isRead: false,
    isSnoozed: false,
    linkUrl: '/approvals',
    eventKey: 'approval_po_0042',
  },
  {
    id: 'notif-3',
    category: 'transfer',
    severity: 'info',
    title: 'Transfer Yola Çıxdı',
    message: '#TR-2026-0089 nömrəli transfer Mərkəzi Anbardan 28 May filialına göndərildi.',
    timestamp: '2026-10-12T10:30:00Z',
    isRead: false,
    isSnoozed: false,
    linkUrl: '/transfers/tr-89',
    eventKey: 'transfer_dispatched_89',
  },
  {
    id: 'notif-4',
    category: 'security',
    severity: 'critical',
    title: 'Uğursuz Giriş Cəhdi Qeydə Alındı',
    message: 'Xarici IP (185.120.45.12) üzərindən admin hesabına ardıcıl 4 dəfə yanlış şifrə daxil edildi.',
    timestamp: '2026-10-12T08:15:00Z',
    isRead: true,
    isSnoozed: false,
    linkUrl: '/admin/security-events',
    eventKey: 'sec_failed_login_admin',
  },
  {
    id: 'notif-5',
    category: 'cash',
    severity: 'warning',
    title: 'Kassa Fərqi Siqnalı',
    message: 'Dəniz Mall Filialında gün sonu kassa sayımında -48.50 ₼ kənarlaşma aşkar edildi.',
    timestamp: '2026-10-11T21:40:00Z',
    isRead: true,
    isSnoozed: false,
    linkUrl: '/admin/audit',
    eventKey: 'cash_variance_deniz',
  },
];

export const INITIAL_ALERT_RULES: AlertRule[] = [
  {
    id: 'rule-1',
    name: 'Kritik Stok Səviyyəsi Siqnalı',
    triggerType: 'low_stock',
    thresholdValue: 5,
    thresholdUnit: 'ədəd',
    recipientRoles: ['branch_manager', 'warehouse_keeper'],
    recipientBranchIds: ['*'],
    escalationMinutes: 60,
    isEnabled: true,
    testSendStatus: 'Konfiqurasiya olunmayıb',
  },
  {
    id: 'rule-2',
    name: 'Gecikən Təchizatçı Ödənişi Siqnalı',
    triggerType: 'overdue_payment',
    thresholdValue: 3,
    thresholdUnit: 'gün',
    recipientRoles: ['accountant', 'general_manager'],
    recipientBranchIds: ['*'],
    escalationMinutes: 120,
    isEnabled: true,
    testSendStatus: 'Konfiqurasiya olunmayıb',
  },
  {
    id: 'rule-3',
    name: 'Gecikmiş Tranzit Transferi',
    triggerType: 'transfer_transit_delayed',
    thresholdValue: 2,
    thresholdUnit: 'gün',
    recipientRoles: ['branch_manager', 'general_manager'],
    recipientBranchIds: ['*'],
    escalationMinutes: 30,
    isEnabled: true,
    testSendStatus: 'Konfiqurasiya olunmayıb',
  },
  {
    id: 'rule-4',
    name: 'Kassa Kənarlaşması Limiti',
    triggerType: 'register_variance',
    thresholdValue: 20,
    thresholdUnit: 'AZN',
    recipientRoles: ['general_manager', 'branch_manager'],
    recipientBranchIds: ['*'],
    escalationMinutes: 15,
    isEnabled: true,
    testSendStatus: 'Konfiqurasiya olunmayıb',
  },
  {
    id: 'rule-5',
    name: 'Böyük Qaytarılma Əməliyyatı',
    triggerType: 'large_refund',
    thresholdValue: 150,
    thresholdUnit: 'AZN',
    recipientRoles: ['branch_manager', 'general_manager'],
    recipientBranchIds: ['*'],
    escalationMinutes: 0,
    isEnabled: true,
    testSendStatus: 'Konfiqurasiya olunmayıb',
  },
];

export const INITIAL_PENDING_APPROVALS: ApprovalItem[] = [
  {
    id: 'appr-1',
    type: 'po',
    typeLabelAz: 'Satınalma Sifarişi',
    documentNumber: 'PO-2026-0042',
    title: 'Yeni Mövsüm İpək Köynək və Palto Tədarükü',
    amountAzn: 14250.0,
    requesterName: 'Vüqar İsmayılov (Satınalma)',
    branchName: 'Mərkəzi Anbar',
    requestedAt: '2026-10-12 10:15 (Asia/Baku)',
    urgency: 'high',
    linkUrl: '/purchasing/orders/po-0042',
    status: 'pending',
  },
  {
    id: 'appr-2',
    type: 'expense',
    typeLabelAz: 'Filial Əməliyyat Xərci',
    documentNumber: 'EXP-2026-0118',
    title: 'Gənclik Mall Filialı Kondisioner Texniki Baxış və Təmiri',
    amountAzn: 680.0,
    requesterName: 'Rəşad Qasımov (Filial Meneceri)',
    branchName: 'Gənclik Mall Filialı',
    requestedAt: '2026-10-12 09:30 (Asia/Baku)',
    urgency: 'normal',
    linkUrl: '/finance/expenses',
    status: 'pending',
  },
  {
    id: 'appr-3',
    type: 'transfer',
    typeLabelAz: 'Anbar Transfer Sorğusu',
    documentNumber: 'TR-2026-0095',
    title: 'Təcili Ölçü Tamamlama: 28 May Filialına 40 ədəd cins şalvar',
    requesterName: 'Kamran Əliyev',
    branchName: '28 May Filialı',
    requestedAt: '2026-10-11 18:20 (Asia/Baku)',
    urgency: 'high',
    linkUrl: '/transfers',
    status: 'pending',
  },
  {
    id: 'appr-4',
    type: 'campaign',
    typeLabelAz: 'Marketinq Aksiyası',
    documentNumber: 'MKT-2026-008',
    title: 'Payız Kolleksiyası 20% Tələbə Endirimi Aksiyası',
    amountAzn: 3500.0,
    requesterName: 'Nigar Rzayeva (Marketinq)',
    branchName: 'Bütün Filiallar',
    requestedAt: '2026-10-11 14:00 (Asia/Baku)',
    urgency: 'normal',
    linkUrl: '/marketing/approvals',
    status: 'pending',
  },
];

export class MockNotificationsAdapter implements NotificationsRepository {
  private notifications: NotificationItem[] = JSON.parse(JSON.stringify(INITIAL_NOTIFICATIONS));
  private alertRules: AlertRule[] = JSON.parse(JSON.stringify(INITIAL_ALERT_RULES));
  private pendingApprovals: ApprovalItem[] = JSON.parse(JSON.stringify(INITIAL_PENDING_APPROVALS));
  private userPreferences: Map<string, UserNotificationPreference> = new Map();

  async getNotifications(): Promise<NotificationItem[]> {
    return [...this.notifications];
  }

  async markAsRead(notificationId: string): Promise<boolean> {
    const item = this.notifications.find((n) => n.id === notificationId);
    if (item) {
      item.isRead = true;
      return true;
    }
    return false;
  }

  async markAllAsRead(): Promise<boolean> {
    this.notifications.forEach((n) => (n.isRead = true));
    return true;
  }

  async snoozeNotification(notificationId: string, hours: number): Promise<boolean> {
    const item = this.notifications.find((n) => n.id === notificationId);
    if (item) {
      item.isSnoozed = true;
      const until = new Date();
      until.setHours(until.getHours() + hours);
      item.snoozeUntil = until.toISOString();
      return true;
    }
    return false;
  }

  async getUserPreferences(userId: string): Promise<UserNotificationPreference> {
    if (!this.userPreferences.has(userId)) {
      this.userPreferences.set(userId, {
        userId,
        enabledCategories: ['stock', 'payment', 'order', 'transfer', 'cash', 'approval', 'security', 'system'],
        inAppEnabled: true,
        emailChannelStatus: 'Konfiqurasiya olunmayıb',
        smsChannelStatus: 'Konfiqurasiya olunmayıb',
        pushChannelStatus: 'Konfiqurasiya olunmayıb',
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
        digestFrequency: 'instant',
      });
    }
    return JSON.parse(JSON.stringify(this.userPreferences.get(userId)!));
  }

  async updateUserPreferences(
    userId: string,
    prefs: Partial<UserNotificationPreference>
  ): Promise<UserNotificationPreference> {
    const current = await this.getUserPreferences(userId);
    const updated: UserNotificationPreference = {
      ...current,
      ...prefs,
      // External channels strictly maintain unconfigured state until provider is set up
      emailChannelStatus: 'Konfiqurasiya olunmayıb',
      smsChannelStatus: 'Konfiqurasiya olunmayıb',
      pushChannelStatus: 'Konfiqurasiya olunmayıb',
    };
    this.userPreferences.set(userId, updated);
    return JSON.parse(JSON.stringify(updated));
  }

  async getAlertRules(): Promise<AlertRule[]> {
    return [...this.alertRules];
  }

  async createAlertRule(rule: Partial<AlertRule>): Promise<AlertRule> {
    const validation = validateAlertRule(rule);
    if (!validation.isValid) {
      throw new Error(`Validasiya xətası: ${Object.values(validation.errors).join(', ')}`);
    }

    const created: AlertRule = {
      id: `rule-${Date.now()}`,
      name: rule.name!,
      triggerType: rule.triggerType!,
      thresholdValue: Number(rule.thresholdValue || 0),
      thresholdUnit: rule.thresholdUnit || 'ədəd',
      recipientRoles: rule.recipientRoles || ['general_manager'],
      recipientBranchIds: rule.recipientBranchIds || ['*'],
      escalationMinutes: Number(rule.escalationMinutes || 0),
      isEnabled: rule.isEnabled !== undefined ? rule.isEnabled : true,
      testSendStatus: 'Konfiqurasiya olunmayıb',
    };

    this.alertRules.unshift(created);
    return created;
  }

  async updateAlertRule(ruleId: string, updates: Partial<AlertRule>): Promise<AlertRule> {
    const rule = this.alertRules.find((r) => r.id === ruleId);
    if (!rule) throw new Error('Qayda tapılmadı');

    Object.assign(rule, updates);
    return { ...rule };
  }

  async deleteAlertRule(ruleId: string): Promise<boolean> {
    const initialLen = this.alertRules.length;
    this.alertRules = this.alertRules.filter((r) => r.id !== ruleId);
    return this.alertRules.length < initialLen;
  }

  async testSendAlertRule(ruleId: string): Promise<{ success: boolean; message: string }> {
    const rule = this.alertRules.find((r) => r.id === ruleId);
    if (!rule) throw new Error('Qayda tapılmadı');

    // Requirement: test-send only when a channel is configured; otherwise explicit message
    return {
      success: false,
      message: 'Xarici rabitə provayderi (SMS / Email Gateway) konfiqurasiya olunmayıb. Test bildiriş göndərilmədi.',
    };
  }

  async getPendingApprovals(): Promise<ApprovalItem[]> {
    return this.pendingApprovals.filter((a) => a.status === 'pending');
  }

  async getApprovals(): Promise<ApprovalItem[]> {
    return [...this.pendingApprovals];
  }

  async approvePendingItem(itemId: string, _approverName: string, _notes?: string): Promise<ApprovalItem> {
    const item = this.pendingApprovals.find((a) => a.id === itemId);
    if (!item) throw new Error('Sənəd tapılmadı');

    item.status = 'approved';
    return { ...item };
  }

  async rejectPendingItem(itemId: string, _rejectorName: string, _reason: string): Promise<ApprovalItem> {
    const item = this.pendingApprovals.find((a) => a.id === itemId);
    if (!item) throw new Error('Sənəd tapılmadı');

    item.status = 'rejected';
    return { ...item };
  }

  async updateApprovalStatus(itemId: string, status: 'approved' | 'rejected', _notes?: string): Promise<ApprovalItem> {
    const item = this.pendingApprovals.find((a) => a.id === itemId);
    if (!item) throw new Error('Sənəd tapılmadı');

    item.status = status;
    return { ...item };
  }
}
