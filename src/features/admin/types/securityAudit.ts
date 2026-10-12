import { UserRole } from '../../../shared/utils/permissions';

/**
 * Module 18: Audit & Security
 */

export interface FieldDiffItem {
  field: string;
  labelAz: string;
  beforeValue: unknown;
  afterValue: unknown;
  isSensitive?: boolean;
}

export interface AuditLogEntryExtended {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole | string;
  module: string;
  action: string;
  branchName: string;
  ipAddress: string;
  details: string;
  entityType?: 'product' | 'sale' | 'user' | 'transfer' | 'expense' | 'role' | 'setting' | 'audit' | 'po';
  entityId?: string;
  correlationId?: string;
  fieldDiffs?: FieldDiffItem[];
  beforeJson?: Record<string, unknown>;
  afterJson?: Record<string, unknown>;
  isSensitive?: boolean;
}

export interface SavedAuditView {
  id: string;
  name: string;
  description: string;
  module?: string;
  isSensitiveOnly?: boolean;
  searchKeyword?: string;
}

export type SecurityEventType =
  | 'failed_login'
  | 'lockout'
  | 'password_reset'
  | 'role_change'
  | 'permission_override'
  | 'session_revoked'
  | 'sensitive_reveal'
  | 'export_logged'
  | 'reprint'
  | 'void'
  | 'large_refund'
  | 'manual_adjustment'
  | 'price_override'
  | 'after_hours_activity';

export type SecurityEventSeverity = 'info' | 'medium' | 'high' | 'critical';
export type SecurityEventStatus = 'new' | 'investigating' | 'acknowledged' | 'resolved';

export interface SecurityEvent {
  id: string;
  timestamp: string;
  type: SecurityEventType;
  severity: SecurityEventSeverity;
  actorName: string;
  actorIp: string;
  target: string;
  details: string;
  correlationId?: string;
  status: SecurityEventStatus;
  assignedTo?: string;
  resolutionNotes?: string;
}

export interface SecuritySettings {
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireNumbers: boolean;
    requireSymbols: boolean;
    expiryDays: number;
    historyCount: number;
  };
  twoFactorPolicy: {
    requiredRoles: UserRole[];
    totpSupported: boolean;
    defaultStatusText: string;
    totpQrMock?: string;
    recoveryCodesCount: number;
  };
  sessionTimeoutMinutes: number;
  concurrentSessionLimit: number;
  ipAllowList: string[];
  maxLoginAttempts: number;
  lockoutDurationMinutes: number;
}

export interface SuspiciousActivityMetric {
  id: string;
  cashierId: string;
  cashierName: string;
  branchName: string;
  voidRatePercent: number;
  discountRatePercent: number;
  returnRatePercent: number;
  cashVarianceAzn: number;
  manualAdjustmentsCount: number;
  riskScore: 'normal' | 'warning' | 'critical';
  criteria: string;
  evidenceUrl: string;
}

export interface DataRetentionPolicy {
  id: string;
  entityType: string;
  titleAz: string;
  retentionPeriodDays: number;
  autoAnonymize: boolean;
  legalBasis: string;
}

export interface PiiAccessRecord {
  id: string;
  timestamp: string;
  viewerName: string;
  customerId: string;
  customerName: string;
  fieldsAccessed: string[];
  reason: string;
}

export interface DataSubjectRequest {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  requestType: 'export' | 'anonymize' | 'delete';
  status: 'pending' | 'approved' | 'completed' | 'rejected';
  requestedAt: string;
  reason: string;
  processedBy?: string;
}

