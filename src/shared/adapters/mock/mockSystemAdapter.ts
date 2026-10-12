import {
  SystemParameters,
  SettingsVersionRecord,
  IntegrationCardItem,
  SystemHealthStatus,
  SettingsFieldDiff,
} from '../../../features/admin/types/systemSettings';
import { computeSettingsDiff } from '../../../features/admin/utils/settingsDiffEngine';

export interface SystemRepository {
  getSystemSettings(): Promise<SystemParameters>;
  getSystemParameters(): Promise<SystemParameters>;
  saveSystemSettings(
    newSettings: SystemParameters,
    reason: string,
    author: string
  ): Promise<{ settings: SystemParameters; version: SettingsVersionRecord }>;
  saveSystemParametersWithVersion(
    newSettings: SystemParameters,
    reason: string,
    author?: string
  ): Promise<SettingsVersionRecord>;
  rollbackSystemSettings(versionId: string, author: string): Promise<SystemParameters>;
  rollbackToVersion(versionId: string, author?: string): Promise<SystemParameters>;
  getSettingsVersionHistory(): Promise<SettingsVersionRecord[]>;
  getVersionHistory(): Promise<SettingsVersionRecord[]>;
  getIntegrations(): Promise<IntegrationCardItem[]>;
  testIntegrationConnection(integrationId: string): Promise<{ success: boolean; message: string; latencyMs: number }>;
  testIntegration(integrationId: string): Promise<{ success: boolean; message: string; latencyMs: number }>;
  getSystemHealth(): Promise<SystemHealthStatus>;
  triggerBackup(): Promise<SystemHealthStatus>;
}

export const INITIAL_SYSTEM_PARAMETERS: SystemParameters = {
  general: {
    companyName: 'BRAND HOUSE',
    legalName: 'BRAND HOUSE MMC',
    voen: '1405829141',
    legalAddress: 'Bakı şəhəri, Nəsimi rayonu, 28 May küç. 45',
    phone: '+994 12 490 00 00',
    email: 'info@brendhouse.az',
    timezone: 'Asia/Baku',
  },
  currency: {
    currencyCode: 'AZN',
    symbol: '₼',
    decimalPlaces: 2,
    roundingRule: 'half_up',
  },
  tax: {
    rates: [
      {
        id: 'tax-1',
        code: 'VAT-18',
        name: 'Standart ƏDV (18%)',
        ratePercent: 18,
        taxClass: 'standard',
        effectiveFrom: '2024-01-01',
        isDefault: true,
        verifiedAgainstLaw: true,
        notes: 'AR Vergi Məcəlləsinin 159-cu maddəsinə uyğun standart dərəcə.',
      },
      {
        id: 'tax-2',
        code: 'VAT-0',
        name: 'Sıfır Dərəcəli ƏDV (0%)',
        ratePercent: 0,
        taxClass: 'zero',
        effectiveFrom: '2024-01-01',
        isDefault: false,
        verifiedAgainstLaw: true,
        notes: 'İxrac və beynəlxalq daşımalar üçün 0% dərəcə.',
      },
      {
        id: 'tax-3',
        code: 'VAT-EXEMPT',
        name: 'ƏDV-dən Azad Olunan',
        ratePercent: 0,
        taxClass: 'exempt',
        effectiveFrom: '2024-01-01',
        isDefault: false,
        verifiedAgainstLaw: true,
        notes: 'Vergi Məcəlləsinin 164-cü maddəsində göstərilən azadolmalar.',
      },
    ],
    legalNotice:
      'Qeyd: Vergi dərəcələri Azərbaycan Respublikasının qüvvədə olan Vergi Məcəlləsinə əsasən yoxlanılmalı və tənzimlənməlidir. Sistem daxilində sərt kodlanmış dərəcələr yoxdur.',
  },
  numbering: {
    receiptPrefix: 'CK',
    transferPrefix: 'TR',
    orderPrefix: 'SO',
    grPrefix: 'GR',
    includeBranchCode: true,
    yearFormat: 'YYYY',
    sequencePadding: 6,
    resetRule: 'annual',
  },
  receiptTemplate: {
    headerTitle: 'BRAND HOUSE RETAIL',
    headerAddress: '28 May küç. 45, Bakı',
    headerPhone: '+994 12 490 00 00',
    headerVoen: 'VÖEN: 1405829141',
    logoEnabled: true,
    footerNotes: 'Mallar AR Qanunvericiliyinə əsasən 14 gün ərzində qaytarıla bilər.',
    thankYouMessage: 'Bizi seçdiyiniz üçün təşəkkür edirik!',
    paperWidth: '80mm',
    showBarcode: true,
    showCashierName: true,
    showTaxBreakdown: true,
    showLoyaltyPoints: true,
  },
  paymentMethods: [
    { id: 'pay-1', code: 'cash', nameAz: 'Nağd Ödəniş', isEnabled: true, requiresReferenceNumber: false, supportsRefund: true, feePercent: 0 },
    { id: 'pay-2', code: 'card', nameAz: 'Bank Kartı (POS)', isEnabled: true, requiresReferenceNumber: true, supportsRefund: true, feePercent: 1.2 },
    { id: 'pay-3', code: 'birkart', nameAz: 'Birkart / Tamkart Taksit', isEnabled: true, requiresReferenceNumber: true, supportsRefund: true, feePercent: 3.5 },
    { id: 'pay-4', code: 'gift_card', nameAz: 'Hədiyyə Sertifikatı', isEnabled: true, requiresReferenceNumber: true, supportsRefund: false, feePercent: 0 },
    { id: 'pay-5', code: 'loyalty_points', nameAz: 'Loyallıq Balları', isEnabled: true, requiresReferenceNumber: false, supportsRefund: false, feePercent: 0 },
  ],
  discountLimits: {
    superadmin: 100,
    general_manager: 50,
    branch_manager: 15,
    cashier: 5,
    accountant: 10,
    warehouse_keeper: 0,
  },
  returnPolicy: {
    returnWindowDays: 14,
    approvalThresholdAzn: 100,
    requireReceipt: true,
    reasonCodes: ['Ölçü uyğunsuzluğu', 'Qüsur və defekt', 'Fikir dəyişikliyi', 'Yanlış məhsul'],
  },
  warehousePolicy: {
    negativeStockPolicy: 'block',
    cogsMethod: 'weighted_average',
    requireCostViewPermission: true,
  },
  loyaltyDefaults: {
    earnRateAznToPoints: 1.0,
    redeemRatePointsToAzn: 0.01,
    pointsExpiryMonths: 12,
    minimumRedemptionThreshold: 100,
  },
  businessHours: {
    weekdayOpen: '10:00',
    weekdayClose: '22:00',
    weekendOpen: '10:00',
    weekendClose: '23:00',
    holidayCalendar: [
      { date: '2026-01-01', name: 'Yeni İl', isDayOff: true },
      { date: '2026-01-20', name: 'Ümumxalq Hüzn Günü', isDayOff: true },
      { date: '2026-03-20', name: 'Novruz Bayramı', isDayOff: true },
      { date: '2026-05-28', name: 'Müstəqillik Günü', isDayOff: true },
      { date: '2026-11-08', name: 'Zəfər Günü', isDayOff: true },
    ],
  },
  localization: {
    activeLanguage: 'az',
    supportedLanguages: [
      { code: 'az', name: 'Azərbaycan dili', status: 'active', completenessPercent: 100 },
      { code: 'en', name: 'English', status: 'soon', completenessPercent: 45 },
      { code: 'ru', name: 'Русский', status: 'soon', completenessPercent: 38 },
    ],
  },
  branding: {
    brandName: 'Brand House',
    logoUrl: '/brand/logo-icon.svg',
    primaryColor: '#111111',
    accentColor: '#D97706',
    creamColor: '#F9F6F0',
  },
};

export const INITIAL_INTEGRATIONS: IntegrationCardItem[] = [
  {
    id: 'int-1',
    name: 'Kapital Bank & PAŞA Bank POS Terminal İnteqrasiyası',
    category: 'payment',
    provider: 'Kapital Bank Smart E-Commerce & Smart POS Agent',
    status: 'Konfiqurasiya olunmayıb',
    maskedCredentials: {
      merchantId: '••••••••••••9201',
      terminalId: '••••••••7431',
      apiKey: '••••••••••••••••••••••••••••••••',
    },
    recentCalls: [],
  },
  {
    id: 'int-2',
    name: 'Azercell SMS Gateway & WhatsApp Business API',
    category: 'messaging',
    provider: 'Azercell Bulk SMS Gateway & Infobip WhatsApp',
    status: 'Konfiqurasiya olunmayıb',
    maskedCredentials: {
      senderName: 'BRANDHOUSE',
      apiUser: '••••••••••',
      apiSecret: '••••••••••••••••••••••••••••••••',
    },
    recentCalls: [],
  },
  {
    id: 'int-3',
    name: 'ESC/POS Şəbəkə və USB Çek Printeri',
    category: 'printer',
    provider: 'Epson TM-T88VI & Xprinter USB Agent',
    status: 'Aktiv',
    lastSyncAt: '2026-10-12 11:45:00 (Asia/Baku)',
    maskedCredentials: {
      printerIp: '192.168.1.150:9100',
      deviceModel: 'EPSON TM-T88VI (80mm)',
    },
    recentCalls: [
      { timestamp: '2026-10-12 11:45:00', endpoint: '/printer/status', status: '200 OK', latencyMs: 12 },
      { timestamp: '2026-10-12 11:30:15', endpoint: '/printer/print-receipt', status: '200 OK', latencyMs: 45 },
    ],
  },
  {
    id: 'int-4',
    name: 'ZKTeco Biometrik və FaceID Davamiyyət Terminalları',
    category: 'attendance',
    provider: 'ZKTeco BioTime 8.5 Local Server',
    status: 'Konfiqurasiya olunmayıb',
    maskedCredentials: {
      serverUrl: 'http://192.168.1.200:8080',
      apiKey: '••••••••••••••••••••••••',
    },
    recentCalls: [],
  },
  {
    id: 'int-5',
    name: 'Mühasibatlıq və Baş Kitab İnteqrasiyası (1C:Müəssisə 8.3)',
    category: 'accounting',
    provider: '1C:Müəssisə OData / REST API Gateway',
    status: 'Konfiqurasiya olunmayıb',
    maskedCredentials: {
      odataEndpoint: 'https://1c.brendhouse.az/trade/odata/standard.odata',
      authBasic: '••••••••••••••••',
    },
    recentCalls: [],
  },
  {
    id: 'int-6',
    name: 'brendhouse.az Onlayn Mağaza API (BrendHouseLegacyAdapter)',
    category: 'legacy_store',
    provider: 'Brend House E-commerce Backend REST API',
    status: 'Aktiv',
    lastSyncAt: '2026-10-12 12:00:00 (Asia/Baku)',
    maskedCredentials: {
      storeApiUrl: 'https://api.brendhouse.az/v1/sync',
      token: '••••••••••••••••••••••••••••••••',
    },
    recentCalls: [
      { timestamp: '2026-10-12 12:00:00', endpoint: '/v1/sync/stock', status: '200 OK', latencyMs: 85 },
      { timestamp: '2026-10-12 11:00:00', endpoint: '/v1/sync/orders', status: '200 OK', latencyMs: 92 },
    ],
  },
];

export class MockSystemAdapter implements SystemRepository {
  private settings: SystemParameters = JSON.parse(JSON.stringify(INITIAL_SYSTEM_PARAMETERS));
  private versions: SettingsVersionRecord[] = [
    {
      versionId: 'ver-initial',
      versionNumber: 1,
      changedAt: '2026-10-01 10:00:00 (Asia/Baku)',
      changedBy: 'Kamran Əliyev (superadmin)',
      effectiveDate: '2026-10-01',
      reason: 'Sistem ilkin parametr bazasının qurulması və təsdiqi',
      diffs: [],
      fullSnapshot: JSON.parse(JSON.stringify(INITIAL_SYSTEM_PARAMETERS)),
    },
  ];
  private integrations: IntegrationCardItem[] = JSON.parse(JSON.stringify(INITIAL_INTEGRATIONS));

  async getSystemSettings(): Promise<SystemParameters> {
    return JSON.parse(JSON.stringify(this.settings));
  }

  async saveSystemSettings(
    newSettings: SystemParameters,
    reason: string,
    author: string
  ): Promise<{ settings: SystemParameters; version: SettingsVersionRecord }> {
    const diffs: SettingsFieldDiff[] = computeSettingsDiff(this.settings, newSettings);

    const versionRecord: SettingsVersionRecord = {
      versionId: `ver-${Date.now()}`,
      versionNumber: this.versions.length + 1,
      changedAt: new Date().toISOString(),
      changedBy: author,
      effectiveDate: new Date().toISOString().slice(0, 10),
      reason: reason || 'Parametrlərdə dövri yeniləmə',
      diffs,
      fullSnapshot: JSON.parse(JSON.stringify(newSettings)),
    };

    this.versions.unshift(versionRecord);
    this.settings = JSON.parse(JSON.stringify(newSettings));

    return {
      settings: JSON.parse(JSON.stringify(this.settings)),
      version: versionRecord,
    };
  }

  async rollbackSystemSettings(versionId: string, author: string): Promise<SystemParameters> {
    const targetVersion = this.versions.find((v) => v.versionId === versionId);
    if (!targetVersion) {
      throw new Error(`Göstərilən versiya tapılmadı: ${versionId}`);
    }

    const diffs = computeSettingsDiff(this.settings, targetVersion.fullSnapshot);
    const rollbackRecord: SettingsVersionRecord = {
      versionId: `ver-${Date.now()}`,
      versionNumber: this.versions.length + 1,
      changedAt: new Date().toISOString(),
      changedBy: author,
      effectiveDate: new Date().toISOString().slice(0, 10),
      reason: `v${targetVersion.versionNumber} versiyasına geri qayıdış (Rollback)`,
      diffs,
      fullSnapshot: JSON.parse(JSON.stringify(targetVersion.fullSnapshot)),
    };

    this.versions.unshift(rollbackRecord);
    this.settings = JSON.parse(JSON.stringify(targetVersion.fullSnapshot));

    return JSON.parse(JSON.stringify(this.settings));
  }

  async getSettingsVersionHistory(): Promise<SettingsVersionRecord[]> {
    return [...this.versions];
  }

  async getIntegrations(): Promise<IntegrationCardItem[]> {
    return [...this.integrations];
  }

  async testIntegrationConnection(
    integrationId: string
  ): Promise<{ success: boolean; message: string; latencyMs: number }> {
    const integration = this.integrations.find((i) => i.id === integrationId);
    if (!integration) {
      throw new Error('İnteqrasiya tapılmadı');
    }

    if (integration.status === 'Konfiqurasiya olunmayıb') {
      return {
        success: false,
        message: 'İnteqrasiya parametrləri və API açarları daxil edilməyib (Konfiqurasiya olunmayıb).',
        latencyMs: 0,
      };
    }

    if (integration.status === 'Xəta') {
      return {
        success: false,
        message: 'Bağlantı xətası: Uzaq server cavab vermədi və ya autentifikasiya uğursuz oldu.',
        latencyMs: 120,
      };
    }

    // Active connection check
    const latency = Math.floor(Math.random() * 40) + 15;
    integration.lastSyncAt = new Date().toISOString();
    integration.recentCalls.unshift({
      timestamp: new Date().toISOString(),
      endpoint: '/test-connection',
      status: '200 OK',
      latencyMs: latency,
    });

    return {
      success: true,
      message: `Bağlantı uğurla təsdiqləndi. Server cavab müddəti: ${latency} ms.`,
      latencyMs: latency,
    };
  }

  async getSystemHealth(): Promise<SystemHealthStatus> {
    return {
      status: 'healthy',
      apiLatencyMs: 18,
      databaseStatus: 'connected',
      queueStatus: 'idle',
      storageStatus: 'available',
      uptimeHours: 342,
      lastBackupAt: '2026-10-12 04:00:00 (Asia/Baku)',
      lastBackupSizeBytes: 48512000,
      restoreTestStatus: 'verified',
      recentErrors: [
        {
          timestamp: '2026-10-11 23:14:02',
          module: 'SMS Gateway',
          message: 'SMS Gateway konfiqurasiya olunmayıb (kod 404).',
        },
      ],
    };
  }

  async getSystemParameters(): Promise<SystemParameters> {
    return this.getSystemSettings();
  }

  async getVersionHistory(): Promise<SettingsVersionRecord[]> {
    return this.getSettingsVersionHistory();
  }

  async saveSystemParametersWithVersion(
    newSettings: SystemParameters,
    reason: string,
    author: string = 'Sistem Administratoru'
  ): Promise<SettingsVersionRecord> {
    const res = await this.saveSystemSettings(newSettings, reason, author);
    return res.version;
  }

  async rollbackToVersion(versionId: string, author: string = 'Sistem Administratoru'): Promise<SystemParameters> {
    return this.rollbackSystemSettings(versionId, author);
  }

  async testIntegration(integrationId: string): Promise<{ success: boolean; message: string; latencyMs: number }> {
    return this.testIntegrationConnection(integrationId);
  }

  async triggerBackup(): Promise<SystemHealthStatus> {
    const health = await this.getSystemHealth();
    health.lastBackupAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' (Asia/Baku)';
    health.lastBackupSizeBytes = 51200000;
    return { ...health };
  }
}
