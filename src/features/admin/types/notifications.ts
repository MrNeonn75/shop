/**
 * Module 19: Notifications
 */

export type NotificationCategory =
  | 'stock'
  | 'payment'
  | 'order'
  | 'transfer'
  | 'cash'
  | 'approval'
  | 'security'
  | 'system';

export type NotificationSeverity = 'critical' | 'warning' | 'info' | 'success';

export interface NotificationItem {
  id: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  isSnoozed: boolean;
  snoozeUntil?: string;
  linkUrl?: string;
  eventKey?: string;
  correlationId?: string;
}

export interface UserNotificationPreference {
  userId: string;
  enabledCategories: NotificationCategory[];
  inAppEnabled: boolean;
  emailChannelStatus: 'Konfiqurasiya olunmayıb' | 'Aktiv' | 'Xəta';
  smsChannelStatus: 'Konfiqurasiya olunmayıb' | 'Aktiv' | 'Xəta';
  pushChannelStatus: 'Konfiqurasiya olunmayıb' | 'Aktiv' | 'Xəta';
  quietHoursStart: string;
  quietHoursEnd: string;
  digestFrequency: 'instant' | 'daily_digest';
}

export type AlertTriggerType =
  | 'low_stock'
  | 'overdue_payment'
  | 'po_delay'
  | 'transfer_transit_delayed'
  | 'register_variance'
  | 'large_refund'
  | 'failed_integration'
  | 'backup_failure'
  | 'document_expiry';

export interface AlertRule {
  id: string;
  name: string;
  triggerType: AlertTriggerType;
  thresholdValue: number;
  thresholdUnit: string;
  recipientRoles: string[];
  recipientBranchIds: string[];
  escalationMinutes: number;
  isEnabled: boolean;
  testSendStatus: 'Konfiqurasiya olunmayıb' | 'sent' | 'error';
}

export interface ApprovalItem {
  id: string;
  type: 'expense' | 'po' | 'transfer' | 'payroll' | 'campaign';
  typeLabelAz: string;
  documentNumber: string;
  title: string;
  amountAzn?: number;
  requesterName: string;
  branchName: string;
  requestedAt: string;
  urgency: 'normal' | 'high' | 'critical';
  linkUrl: string;
  status: 'pending' | 'approved' | 'rejected';
}

