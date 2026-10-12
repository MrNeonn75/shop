import {
  AuditLogEntryExtended,
  SavedAuditView,
  SecurityEvent,
  SecuritySettings,
  SuspiciousActivityMetric,
  DataRetentionPolicy,
  PiiAccessRecord,
  DataSubjectRequest,
} from '../../../features/admin/types/securityAudit';
import { MOCK_AUDIT_LOGS } from './adminMockData';

export interface SecurityAuditRepository {
  getAuditLogs(params?: {
    searchQuery?: string;
    module?: string;
    entityType?: string;
    entityId?: string;
    correlationId?: string;
    isSensitiveOnly?: boolean;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<AuditLogEntryExtended[]>;
  getEntityTimeline(entityType: string, entityId: string): Promise<AuditLogEntryExtended[]>;
  logAuditEvent(entry: Omit<AuditLogEntryExtended, 'id' | 'timestamp'>): Promise<AuditLogEntryExtended>;
  getSavedAuditViews(): Promise<SavedAuditView[]>;
  exportAuditLogs(params?: Record<string, unknown>, exportedBy?: string): Promise<{ dataUri: string; filename: string }>;

  getSecurityEvents(params?: {
    severity?: string;
    type?: string;
    status?: string;
  }): Promise<SecurityEvent[]>;
  updateSecurityEventStatus(
    eventId: string,
    status: SecurityEvent['status'],
    resolutionNotes?: string,
    assignedTo?: string
  ): Promise<SecurityEvent>;

  getSecuritySettings(): Promise<SecuritySettings>;
  updateSecuritySettings(newSettings: Partial<SecuritySettings>): Promise<SecuritySettings>;

  getSuspiciousActivityMetrics(): Promise<SuspiciousActivityMetric[]>;
  getDataRetentionPolicies(): Promise<DataRetentionPolicy[]>;
  updateDataRetentionPolicies(policies: DataRetentionPolicy[]): Promise<DataRetentionPolicy[]>;
  getPiiAccessReports(): Promise<PiiAccessRecord[]>;
  getDataSubjectRequests(): Promise<DataSubjectRequest[]>;
  createDataSubjectRequest(req: Omit<DataSubjectRequest, 'id' | 'requestedAt' | 'status'>): Promise<DataSubjectRequest>;
  updateDataSubjectRequestStatus(id: string, status: DataSubjectRequest['status'], processedBy: string): Promise<DataSubjectRequest>;
}

export const INITIAL_EXTENDED_AUDIT_LOGS: AuditLogEntryExtended[] = [
  ...MOCK_AUDIT_LOGS.map((base, idx) => ({
    ...base,
    entityType: (idx % 2 === 0 ? 'sale' : 'product') as 'sale' | 'product',
    entityId: idx % 2 === 0 ? `CK-28M-2026-000${140 + idx}` : `PRD-00${idx + 1}`,
    correlationId: `CORR-TX-${202600 + idx}`,
    fieldDiffs:
      idx === 1
        ? [
            { field: 'role', labelAz: 'İstifadəçi Rolu', beforeValue: 'Kassir', afterValue: 'Filial Meneceri' },
            { field: 'allowedBranches', labelAz: 'İcazəli Filiallar', beforeValue: ['branch-2'], afterValue: ['branch-1', 'branch-2'] },
          ]
        : idx === 2
        ? [
            { field: 'price', labelAz: 'Satış Qiyməti', beforeValue: '75.00 ₼', afterValue: '65.00 ₼', isSensitive: true },
          ]
        : undefined,
  })),
  {
    id: 'audit-corr-1',
    timestamp: '2026-10-12T11:30:00Z',
    userId: 'usr-004',
    userName: 'Aytən Həsənova',
    userRole: 'cashier',
    module: 'pos.sale',
    action: 'Çek Vuruldu (Satış Tamamlandı)',
    branchName: 'Gənclik Mall Filialı',
    ipAddress: '192.168.1.104',
    details: 'Satış çeki vuruldu: 2 ədəd Premium Köynək, ümumi məbləğ 130.00 ₼. Nağdsız POS ödənişi.',
    entityType: 'sale',
    entityId: 'CK-GM-2026-004120',
    correlationId: 'CORR-SALE-4120',
    fieldDiffs: [
      { field: 'paymentStatus', labelAz: 'Ödəniş Statusu', beforeValue: 'draft', afterValue: 'completed' },
      { field: 'cashier', labelAz: 'Kassir', beforeValue: '—', afterValue: 'Aytən Həsənova' },
    ],
  },
  {
    id: 'audit-corr-2',
    timestamp: '2026-10-12T11:30:01Z',
    userId: 'usr-004',
    userName: 'Sistem Avtomatı',
    userRole: 'system',
    module: 'inventory.stock',
    action: 'Stok Silinməsi (Satış əsasında)',
    branchName: 'Gənclik Mall Filialı',
    ipAddress: '127.0.0.1',
    details: 'SKU TSH-WHT-M üzrə qalıq 16 ədəddən 14 ədədə azaldıldı.',
    entityType: 'sale',
    entityId: 'CK-GM-2026-004120',
    correlationId: 'CORR-SALE-4120',
    fieldDiffs: [
      { field: 'stockQuantity', labelAz: 'Mövcud Qalıq', beforeValue: 16, afterValue: 14 },
    ],
  },
  {
    id: 'audit-corr-3',
    timestamp: '2026-10-12T11:30:02Z',
    userId: 'usr-004',
    userName: 'Sistem Avtomatı',
    userRole: 'system',
    module: 'crm.loyalty',
    action: 'Loyallıq Balı Hesablandı',
    branchName: 'Gənclik Mall Filialı',
    ipAddress: '127.0.0.1',
    details: 'Müştəri Günel Qasımova kartına 130 bal əlavə edildi.',
    entityType: 'sale',
    entityId: 'CK-GM-2026-004120',
    correlationId: 'CORR-SALE-4120',
    fieldDiffs: [
      { field: 'loyaltyPoints', labelAz: 'Loyallıq Balı', beforeValue: 450, afterValue: 580 },
    ],
  },
  {
    id: 'audit-sensitive-1',
    timestamp: '2026-10-12T09:15:00Z',
    userId: 'usr-002',
    userName: 'Nərgiz Məmmədova',
    userRole: 'general_manager',
    module: 'hr.salary',
    action: 'Əməkhaqqı Məlumatına Baxış (Reveal)',
    branchName: 'Baş Ofis',
    ipAddress: '192.168.1.15',
    details: 'İşçi Aytən Həsənovanın maaş və bonus profilinə baxış açıldı (Maskalanma açıldı).',
    entityType: 'user',
    entityId: 'usr-004',
    correlationId: 'CORR-HR-SAL-004',
    isSensitive: true,
  },
];

export const INITIAL_SECURITY_EVENTS: SecurityEvent[] = [
  {
    id: 'sec-1',
    timestamp: '2026-10-12T08:14:22Z',
    type: 'failed_login',
    severity: 'medium',
    actorName: 'naməlum (admin hesabı)',
    actorIp: '185.120.45.12',
    target: 'admin@brendhouse.az',
    details: 'Ardıcıl 4 dəfə yanlış şifrə cəhdi qeydə alındı.',
    status: 'investigating',
    assignedTo: 'Kamran Əliyev',
  },
  {
    id: 'sec-2',
    timestamp: '2026-10-12T08:15:00Z',
    type: 'lockout',
    severity: 'high',
    actorName: 'Təhlükəsizlik Sistemi',
    actorIp: '127.0.0.1',
    target: 'admin@brendhouse.az',
    details: '5 uğursuz cəhddən sonra hesab 15 dəqiqə müddətinə müvəqqəti bloklandı.',
    status: 'acknowledged',
    assignedTo: 'Kamran Əliyev',
    resolutionNotes: 'Şifrə cəhdləri xarici IP-dən olub, IP izlənilir.',
  },
  {
    id: 'sec-3',
    timestamp: '2026-10-11T23:42:10Z',
    type: 'after_hours_activity',
    severity: 'medium',
    actorName: 'Tural Səfərov',
    actorIp: '192.168.1.180',
    target: 'Kassa Modulu',
    details: 'Mağazanın rəsmi iş saatından kənar (saat 23:42) kassa terminalına giriş cəhdi.',
    status: 'new',
  },
  {
    id: 'sec-4',
    timestamp: '2026-10-11T16:20:00Z',
    type: 'void',
    severity: 'medium',
    actorName: 'Aytən Həsənova',
    actorIp: '192.168.1.104',
    target: 'CK-GM-2026-004085',
    details: 'Satış zamanı 180 ₼ məbləğində çek kassir tərəfindən ləğv edildi (Void). Menecer təsdiqi tələb olundu.',
    status: 'resolved',
    resolutionNotes: 'Müştərinin kartında vəsait çatışmadığı üçün ləğv edilib.',
  },
  {
    id: 'sec-5',
    timestamp: '2026-10-11T14:10:00Z',
    type: 'price_override',
    severity: 'high',
    actorName: 'Rəşad Qasımov (Menecer PIN)',
    actorIp: '192.168.1.104',
    target: 'WNT-COAT-XL',
    details: 'Qışlıq palto qiyməti 220 ₼-dən əl ilə 140 ₼-ə endirildi (36% güzəşt).',
    status: 'resolved',
    resolutionNotes: 'Məhsulda qüsur olduğu üçün filial meneceri PIN ilə təsdiq edib.',
  },
  {
    id: 'sec-6',
    timestamp: '2026-10-10T11:05:00Z',
    type: 'export_logged',
    severity: 'info',
    actorName: 'Leyla Kərimova',
    actorIp: '192.168.1.55',
    target: 'Audit Jurnalı CSV İxracı',
    details: 'Bütün filiallar üzrə son 30 günün audit qeydləri CSV faylına ixrac edildi.',
    status: 'resolved',
    resolutionNotes: 'Rüblük maliyyə auditi üçün planlaşdırılmış ixrac.',
  },
];

export const INITIAL_SECURITY_SETTINGS: SecuritySettings = {
  passwordPolicy: {
    minLength: 8,
    requireUppercase: true,
    requireNumbers: true,
    requireSymbols: true,
    expiryDays: 90,
    historyCount: 3,
  },
  twoFactorPolicy: {
    requiredRoles: ['superadmin', 'general_manager', 'accountant'],
    totpSupported: false,
    defaultStatusText: 'Dəstəklənmir (İki Faktorlu TOTP Autentifikasiya servisi hazırda konfiqurasiya olunmayıb)',
    recoveryCodesCount: 8,
  },
  sessionTimeoutMinutes: 30,
  concurrentSessionLimit: 2,
  ipAllowList: ['192.168.1.0/24', '10.0.0.0/8'],
  maxLoginAttempts: 5,
  lockoutDurationMinutes: 15,
};

export const INITIAL_SUSPICIOUS_METRICS: SuspiciousActivityMetric[] = [
  {
    id: 'susp-1',
    cashierId: 'usr-007',
    cashierName: 'Tural Səfərov',
    branchName: 'Dəniz Mall Filialı',
    voidRatePercent: 8.4,
    discountRatePercent: 14.2,
    returnRatePercent: 12.0,
    cashVarianceAzn: -48.5,
    manualAdjustmentsCount: 7,
    riskScore: 'critical',
    criteria: 'Ləğv faizi > 5%, Qaytarma > 10% və kassa kənarlaşması davamlı mənfi',
    evidenceUrl: '/admin/audit?search=Tural+S%C9%99f%C9%99rov',
  },
  {
    id: 'susp-2',
    cashierId: 'usr-004',
    cashierName: 'Aytən Həsənova',
    branchName: 'Gənclik Mall Filialı',
    voidRatePercent: 2.1,
    discountRatePercent: 4.5,
    returnRatePercent: 1.8,
    cashVarianceAzn: 1.2,
    manualAdjustmentsCount: 1,
    riskScore: 'normal',
    criteria: 'Bütün göstəricilər qəbul edilmiş normal limitlər daxilindədir',
    evidenceUrl: '/admin/audit?search=Ayt%C9%99n+H%C9%99s%C9%99nova',
  },
];

export class MockSecurityAuditAdapter implements SecurityAuditRepository {
  private auditLogs: AuditLogEntryExtended[] = JSON.parse(JSON.stringify(INITIAL_EXTENDED_AUDIT_LOGS));
  private securityEvents: SecurityEvent[] = JSON.parse(JSON.stringify(INITIAL_SECURITY_EVENTS));
  private securitySettings: SecuritySettings = JSON.parse(JSON.stringify(INITIAL_SECURITY_SETTINGS));
  private suspiciousMetrics: SuspiciousActivityMetric[] = JSON.parse(JSON.stringify(INITIAL_SUSPICIOUS_METRICS));
  private retentionPolicies: DataRetentionPolicy[] = [
    { id: 'ret-1', entityType: 'sales_transactions', titleAz: 'Satış və Kassa Çekləri', retentionPeriodDays: 1825, autoAnonymize: false, legalBasis: 'AR Vergi Məcəlləsi (5 il məcburi saxlama)' },
    { id: 'ret-2', entityType: 'customer_pii', titleAz: 'Müştəri Fərdi Məlumatları (PII)', retentionPeriodDays: 1095, autoAnonymize: true, legalBasis: 'Fərdi Məlumatlar Haqqında AR Qanunu (3 il qeyri-aktivlikdən sonra)' },
    { id: 'ret-3', entityType: 'audit_logs', titleAz: 'Sistem Audit Qeydləri', retentionPeriodDays: 2555, autoAnonymize: false, legalBasis: 'Korporativ İdarəetmə və Təhlükəsizlik Standartı (7 il)' },
  ];
  private piiReports: PiiAccessRecord[] = [
    {
      id: 'pii-1',
      timestamp: '2026-10-12 10:14:00',
      viewerName: 'Kamran Əliyev',
      customerId: 'cust-101',
      customerName: 'Günel Qasımova',
      fieldsAccessed: ['telefon', 'email', 'doğum tarixi'],
      reason: 'VIP müştəri kartı ünvan dəqiqləşdirməsi',
    },
    {
      id: 'pii-2',
      timestamp: '2026-10-11 15:30:00',
      viewerName: 'Aytən Həsənova',
      customerId: 'cust-102',
      customerName: 'Elnur Məmmədov',
      fieldsAccessed: ['telefon'],
      reason: 'Kassa qeydiyyatı zamanı telefon nömrəsi axtarışı',
    },
  ];
  private dataSubjectRequests: DataSubjectRequest[] = [
    {
      id: 'dsr-1',
      customerId: 'cust-109',
      customerName: 'Rauf İsmayılov',
      customerPhone: '+994 50 777 44 22',
      requestType: 'anonymize',
      status: 'pending',
      requestedAt: '2026-10-11 12:00:00',
      reason: 'Müştəri SMS və bildiriş siyahısından çıxarılmasını və şəxsi nömrəsinin silinməsini tələb edir.',
    },
    {
      id: 'dsr-2',
      customerId: 'cust-104',
      customerName: 'Leyla Vəliyeva',
      customerPhone: '+994 55 222 33 11',
      requestType: 'export',
      status: 'completed',
      requestedAt: '2026-10-09 14:15:00',
      reason: 'Alış tarixçəsi və loyallıq çıxarışı tələbi.',
      processedBy: 'Kamran Əliyev',
    },
  ];

  async getAuditLogs(params?: {
    searchQuery?: string;
    module?: string;
    entityType?: string;
    entityId?: string;
    correlationId?: string;
    isSensitiveOnly?: boolean;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<AuditLogEntryExtended[]> {
    return this.auditLogs.filter((log) => {
      if (params?.searchQuery) {
        const q = params.searchQuery.toLowerCase();
        const match =
          log.userName.toLowerCase().includes(q) ||
          log.details.toLowerCase().includes(q) ||
          log.action.toLowerCase().includes(q) ||
          (log.entityId && log.entityId.toLowerCase().includes(q)) ||
          (log.correlationId && log.correlationId.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (params?.module && params.module !== 'all' && !log.module.startsWith(params.module)) {
        return false;
      }
      if (params?.entityType && log.entityType !== params.entityType) {
        return false;
      }
      if (params?.entityId && log.entityId !== params.entityId) {
        return false;
      }
      if (params?.correlationId && log.correlationId !== params.correlationId) {
        return false;
      }
      if (params?.isSensitiveOnly && !log.isSensitive) {
        return false;
      }
      return true;
    });
  }

  async getEntityTimeline(entityType: string, entityId: string): Promise<AuditLogEntryExtended[]> {
    return this.auditLogs
      .filter((l) => l.entityId === entityId || (l.entityType === entityType && l.details.includes(entityId)))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async logAuditEvent(entry: Omit<AuditLogEntryExtended, 'id' | 'timestamp'>): Promise<AuditLogEntryExtended> {
    const newEntry: AuditLogEntryExtended = {
      ...entry,
      id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
    };
    this.auditLogs.unshift(newEntry);
    return newEntry;
  }

  async getSavedAuditViews(): Promise<SavedAuditView[]> {
    return [
      { id: 'v-1', name: 'Bütün Qeydlər', description: 'Standart xronoloji görünüş' },
      { id: 'v-2', name: 'Həssas Məlumat Açılışları', description: 'Yalnız maaş, PII və maya dəyəri baxışları', isSensitiveOnly: true },
      { id: 'v-3', name: 'Kassa və Satış Əməliyyatları', description: 'POS çekləri və qaytarmalar', module: 'pos' },
      { id: 'v-4', name: 'Rol və İcazə Dəyişiklikləri', description: 'Rollar və icazələrin təftişi', module: 'admin.roles' },
    ];
  }

  async exportAuditLogs(params?: Record<string, unknown>, exportedBy: string = 'İstifadəçi'): Promise<{ dataUri: string; filename: string }> {
    // Crucial requirement: Export access is logged to audit trail itself!
    await this.logAuditEvent({
      userId: 'current-user',
      userName: exportedBy,
      userRole: 'general_manager',
      module: 'admin.audit',
      action: 'Audit Jurnalı İxrac Edildi',
      branchName: 'Baş Ofis',
      ipAddress: '192.168.1.1',
      details: `İstifadəçi audit jurnalını CSV formatında ixrac etdi. Filtrlər: ${JSON.stringify(params || {})}`,
      isSensitive: true,
    });

    const csvHeader = 'Tarix,İstifadəçi,Rol,Modul,Əməliyyat,Filial,IP,Detallar,EntityID,KorrelyasiyaID\n';
    const rows = this.auditLogs
      .map(
        (l) =>
          `"${l.timestamp}","${l.userName}","${l.userRole}","${l.module}","${l.action}","${l.branchName}","${l.ipAddress}","${l.details.replace(/"/g, '""')}","${l.entityId || ''}","${l.correlationId || ''}"`
      )
      .join('\n');

    const base64Data = btoa(unescape(encodeURIComponent('\uFEFF' + csvHeader + rows)));
    return {
      dataUri: `data:text/csv;charset=utf-8;base64,${base64Data}`,
      filename: `brand_house_audit_export_${new Date().toISOString().slice(0, 10)}.csv`,
    };
  }

  async getSecurityEvents(params?: {
    severity?: string;
    type?: string;
    status?: string;
  }): Promise<SecurityEvent[]> {
    return this.securityEvents.filter((ev) => {
      if (params?.severity && params.severity !== 'all' && ev.severity !== params.severity) return false;
      if (params?.type && params.type !== 'all' && ev.type !== params.type) return false;
      if (params?.status && params.status !== 'all' && ev.status !== params.status) return false;
      return true;
    });
  }

  async updateSecurityEventStatus(
    eventId: string,
    status: SecurityEvent['status'],
    resolutionNotes?: string,
    assignedTo?: string
  ): Promise<SecurityEvent> {
    const ev = this.securityEvents.find((e) => e.id === eventId);
    if (!ev) throw new Error('Təhlükəsizlik hadisəsi tapılmadı');

    ev.status = status;
    if (resolutionNotes) ev.resolutionNotes = resolutionNotes;
    if (assignedTo) ev.assignedTo = assignedTo;

    return { ...ev };
  }

  async getSecuritySettings(): Promise<SecuritySettings> {
    return JSON.parse(JSON.stringify(this.securitySettings));
  }

  async updateSecuritySettings(newSettings: Partial<SecuritySettings>): Promise<SecuritySettings> {
    this.securitySettings = {
      ...this.securitySettings,
      ...newSettings,
    };
    return JSON.parse(JSON.stringify(this.securitySettings));
  }

  async getSuspiciousActivityMetrics(): Promise<SuspiciousActivityMetric[]> {
    return [...this.suspiciousMetrics];
  }

  async getDataRetentionPolicies(): Promise<DataRetentionPolicy[]> {
    return [...this.retentionPolicies];
  }

  async updateDataRetentionPolicies(policies: DataRetentionPolicy[]): Promise<DataRetentionPolicy[]> {
    this.retentionPolicies = [...policies];
    return [...this.retentionPolicies];
  }

  async getPiiAccessReports(): Promise<PiiAccessRecord[]> {
    return [...this.piiReports];
  }

  async getDataSubjectRequests(): Promise<DataSubjectRequest[]> {
    return [...this.dataSubjectRequests];
  }

  async createDataSubjectRequest(req: Omit<DataSubjectRequest, 'id' | 'requestedAt' | 'status'>): Promise<DataSubjectRequest> {
    const created: DataSubjectRequest = {
      ...req,
      id: `dsr-${Date.now()}`,
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };
    this.dataSubjectRequests.unshift(created);
    return created;
  }

  async updateDataSubjectRequestStatus(
    id: string,
    status: DataSubjectRequest['status'],
    processedBy: string
  ): Promise<DataSubjectRequest> {
    const item = this.dataSubjectRequests.find((r) => r.id === id);
    if (!item) throw new Error('Sorğu tapılmadı');

    item.status = status;
    item.processedBy = processedBy;
    return { ...item };
  }
}

