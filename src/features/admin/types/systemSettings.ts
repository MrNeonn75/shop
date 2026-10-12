import { UserRole } from '../../../shared/utils/permissions';

/**
 * Module 20: System Parameters
 */

export interface ReceiptTemplateConfig {
  headerTitle: string;
  headerAddress: string;
  headerPhone: string;
  headerVoen: string;
  logoEnabled: boolean;
  footerNotes: string;
  thankYouMessage: string;
  paperWidth: '58mm' | '80mm';
  showBarcode: boolean;
  showCashierName: boolean;
  showTaxBreakdown: boolean;
  showLoyaltyPoints: boolean;
}

export interface TaxRateSetting {
  id: string;
  code: string;
  name: string;
  ratePercent: number;
  taxClass: 'standard' | 'reduced' | 'zero' | 'exempt';
  effectiveFrom: string;
  effectiveTo?: string;
  isDefault: boolean;
  verifiedAgainstLaw: boolean;
  notes: string;
}

export interface PaymentMethodSetting {
  id: string;
  code: string;
  nameAz: string;
  isEnabled: boolean;
  requiresReferenceNumber: boolean;
  supportsRefund: boolean;
  feePercent: number;
}

export interface IntegrationCardItem {
  id: string;
  name: string;
  category: 'payment' | 'messaging' | 'printer' | 'attendance' | 'accounting' | 'legacy_store';
  provider: string;
  status: 'Konfiqurasiya olunmayıb' | 'Aktiv' | 'Xəta';
  lastSyncAt?: string;
  maskedCredentials: Record<string, string>;
  recentCalls: Array<{
    timestamp: string;
    endpoint: string;
    status: '200 OK' | '500 Error' | '401 Unauthorized';
    latencyMs: number;
  }>;
}

export interface SystemParameters {
  general: {
    companyName: string;
    legalName: string;
    voen: string;
    legalAddress: string;
    phone: string;
    email: string;
    timezone: string;
  };
  currency: {
    currencyCode: string;
    symbol: string;
    decimalPlaces: number;
    roundingRule: 'half_up' | 'floor' | 'ceil' | 'cash_005';
  };
  tax: {
    rates: TaxRateSetting[];
    legalNotice: string;
  };
  numbering: {
    receiptPrefix: string;
    transferPrefix: string;
    orderPrefix: string;
    grPrefix: string;
    includeBranchCode: boolean;
    yearFormat: 'YYYY' | 'YY' | 'NONE';
    sequencePadding: number;
    resetRule: 'annual' | 'monthly' | 'never';
  };
  receiptTemplate: ReceiptTemplateConfig;
  paymentMethods: PaymentMethodSetting[];
  discountLimits: Record<UserRole, number>;
  returnPolicy: {
    returnWindowDays: number;
    approvalThresholdAzn: number;
    requireReceipt: boolean;
    reasonCodes: string[];
  };
  warehousePolicy: {
    negativeStockPolicy: 'block' | 'warn' | 'allow_admin';
    cogsMethod: 'weighted_average' | 'fifo';
    requireCostViewPermission: boolean;
  };
  loyaltyDefaults: {
    earnRateAznToPoints: number;
    redeemRatePointsToAzn: number;
    pointsExpiryMonths: number;
    minimumRedemptionThreshold: number;
  };
  businessHours: {
    weekdayOpen: string;
    weekdayClose: string;
    weekendOpen: string;
    weekendClose: string;
    holidayCalendar: Array<{ date: string; name: string; isDayOff: boolean }>;
  };
  localization: {
    activeLanguage: 'az';
    supportedLanguages: Array<{
      code: string;
      name: string;
      status: 'active' | 'soon';
      completenessPercent: number;
    }>;
  };
  branding: {
    brandName: string;
    logoUrl: string;
    primaryColor: string;
    accentColor: string;
    creamColor: string;
  };
}

export interface SettingsFieldDiff {
  section: string;
  sectionLabelAz: string;
  field: string;
  fieldLabelAz: string;
  oldValue: unknown;
  newValue: unknown;
  isSensitive?: boolean;
}

export interface SettingsVersionRecord {
  versionId: string;
  versionNumber: number;
  changedAt: string;
  changedBy: string;
  effectiveDate: string;
  reason: string;
  diffs: SettingsFieldDiff[];
  fullSnapshot: SystemParameters;
}

export interface SystemHealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  apiLatencyMs: number;
  databaseStatus: 'connected' | 'reconnecting' | 'failed';
  queueStatus: 'idle' | 'processing' | 'failed';
  storageStatus: 'available' | 'low_space' | 'read_only';
  uptimeHours: number;
  lastBackupAt: string;
  lastBackupSizeBytes: number;
  restoreTestStatus: 'verified' | 'pending' | 'failed';
  recentErrors: Array<{
    timestamp: string;
    module: string;
    message: string;
  }>;
}

