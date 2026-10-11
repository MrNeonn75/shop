import { UserRole } from '../../utils/permissions';

export interface CompanyProfile {
  name: string;
  legalName: string;
  voen: string; // VÖEN (Tax ID)
  legalAddress: string;
  phone: string;
  email: string;
  website: string;
  currency: string;
  timezone: string;
  defaultLanguage: string;
  bankName: string;
  bankVoen: string;
  iban: string;
  swift: string;
  logoUrl: string;
}

export interface AdminBranch {
  id: string;
  code: string;
  name: string;
  address: string;
  phone: string;
  managerName: string;
  workingHoursWeekday: string;
  workingHoursWeekend: string;
  cashRegistersCount: number;
  warehousesCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface AdminWarehouse {
  id: string;
  code: string;
  name: string;
  type: 'central' | 'branch' | 'in-transit';
  branchId: string;
  branchName: string;
  capacitySqM: number;
  isActive: boolean;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  username: string;
  role: UserRole;
  roleName: string;
  branchId: string;
  branchName: string;
  allowedBranchIds: string[];
  isActive: boolean;
  phone: string;
  lastLoginAt: string;
  mustResetPassword?: boolean;
}

export interface DocumentNumberingConfig {
  docType: string;
  docTypeName: string;
  prefix: string;
  includeBranchCode: boolean;
  yearFormat: 'YYYY' | 'YY' | 'NONE';
  sequencePadding: number;
  samplePreview: string;
}

export interface TaxRateConfig {
  id: string;
  code: string;
  name: string;
  ratePercent: number;
  taxClass: 'standard' | 'reduced' | 'zero' | 'exempt';
  description: string;
  isDefault: boolean;
}

export interface SystemIntegrationItem {
  id: string;
  name: string;
  category: 'sms' | 'fiscal_kassa' | 'e_taxes' | 'ecommerce';
  provider: string;
  status: 'unconfigured' | 'active' | 'error';
  lastSyncAt?: string;
  errorMessage?: string;
  configSummary?: string;
}

export interface SystemHealthMetrics {
  status: 'healthy' | 'degraded' | 'down';
  apiLatencyMs: number;
  databaseStatus: 'connected' | 'reconnecting' | 'failed';
  memoryUsedMb: number;
  memoryTotalMb: number;
  uptimeHours: number;
  lastBackupAt: string;
  lastBackupSizeBytes: number;
  version: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  module: string;
  action: string;
  branchName: string;
  ipAddress: string;
  details: string;
  beforeJson?: Record<string, unknown>;
  afterJson?: Record<string, unknown>;
}

export const MOCK_COMPANY_PROFILE: CompanyProfile = {
  name: 'BRAND HOUSE',
  legalName: 'BRAND HOUSE MMC',
  voen: '1405829141',
  legalAddress: 'Bakı şəhəri, Nəsimi rayonu, 28 May küç. 45',
  phone: '+994 12 490 00 00',
  email: 'info@brendhouse.az',
  website: 'https://brendhouse.az',
  currency: 'AZN',
  timezone: 'Asia/Baku',
  defaultLanguage: 'az',
  bankName: 'PAŞA Bank ASC',
  bankVoen: '1400823561',
  iban: 'AZ21PASHA0000000001234567890',
  swift: 'PASHAZ22',
  logoUrl: '/brand/logo-icon.svg',
};

export const MOCK_ADMIN_BRANCHES: AdminBranch[] = [
  {
    id: 'branch-1',
    code: 'BH-28M',
    name: '28 May Flaman Filialı',
    address: '28 May küç. 45, Nəsimi r-nu, Bakı',
    phone: '+994 12 490 11 22',
    managerName: 'Kamran Əliyev',
    workingHoursWeekday: '10:00 - 22:00',
    workingHoursWeekend: '10:00 - 23:00',
    cashRegistersCount: 3,
    warehousesCount: 2,
    isActive: true,
    createdAt: '2024-01-15T00:00:00Z',
  },
  {
    id: 'branch-2',
    code: 'BH-GM',
    name: 'Gənclik Mall Filialı',
    address: 'Fətəli Xan Xoyski küç. 14, Gənclik Mall 2-ci mərtəbə',
    phone: '+994 12 590 33 44',
    managerName: 'Rəşad Qasımov',
    workingHoursWeekday: '10:00 - 22:00',
    workingHoursWeekend: '10:00 - 22:00',
    cashRegistersCount: 4,
    warehousesCount: 1,
    isActive: true,
    createdAt: '2024-03-20T00:00:00Z',
  },
  {
    id: 'branch-3',
    code: 'BH-DM',
    name: 'Dəniz Mall Filialı',
    address: 'Neftçilər pr. 26A, Dəniz Mall 1-ci mərtəbə',
    phone: '+994 12 590 55 66',
    managerName: 'Aynur Səmədova',
    workingHoursWeekday: '10:00 - 22:00',
    workingHoursWeekend: '10:00 - 23:00',
    cashRegistersCount: 2,
    warehousesCount: 1,
    isActive: true,
    createdAt: '2024-06-10T00:00:00Z',
  },
  {
    id: 'branch-4',
    code: 'BH-SM',
    name: 'Sumqayıt Filialı',
    address: 'Sülh küç. 12, Sumqayıt',
    phone: '+994 18 642 10 20',
    managerName: 'Orxan Babayev',
    workingHoursWeekday: '10:00 - 21:00',
    workingHoursWeekend: '10:00 - 21:00',
    cashRegistersCount: 2,
    warehousesCount: 1,
    isActive: false,
    createdAt: '2025-02-01T00:00:00Z',
  },
];

export const MOCK_ADMIN_WAREHOUSES: AdminWarehouse[] = [
  {
    id: 'wh-1',
    code: 'WH-CENTRAL',
    name: 'Mərkəzi Loqistika Anbarı (Dərnəgül)',
    type: 'central',
    branchId: 'branch-1',
    branchName: 'Baş Ofis / Mərkəz',
    capacitySqM: 1200,
    isActive: true,
  },
  {
    id: 'wh-2',
    code: 'WH-28M',
    name: '28 May Filialının Alt Anbarı',
    type: 'branch',
    branchId: 'branch-1',
    branchName: '28 May Flaman Filialı',
    capacitySqM: 180,
    isActive: true,
  },
  {
    id: 'wh-3',
    code: 'WH-GM',
    name: 'Gənclik Mall Anbarı',
    type: 'branch',
    branchId: 'branch-2',
    branchName: 'Gənclik Mall Filialı',
    capacitySqM: 120,
    isActive: true,
  },
  {
    id: 'wh-4',
    code: 'WH-TRANSIT',
    name: 'Filiallararası Tranzit Anbarı',
    type: 'in-transit',
    branchId: 'branch-1',
    branchName: 'Mərkəz',
    capacitySqM: 0,
    isActive: true,
  },
];

export const MOCK_ADMIN_USERS: AdminUser[] = [
  {
    id: 'usr-001',
    name: 'Kamran Əliyev',
    email: 'admin@brendhouse.az',
    username: 'admin',
    role: 'superadmin',
    roleName: 'Sistem admini',
    branchId: 'branch-1',
    branchName: '28 May Flaman Filialı',
    allowedBranchIds: ['*'],
    isActive: true,
    phone: '+994 50 200 00 01',
    lastLoginAt: '2026-10-10T14:32:00Z',
  },
  {
    id: 'usr-002',
    name: 'Nərgiz Məmmədova',
    email: 'gm@brendhouse.az',
    username: 'manager',
    role: 'general_manager',
    roleName: 'Baş menecer',
    branchId: 'branch-1',
    branchName: 'Baş Ofis',
    allowedBranchIds: ['branch-1', 'branch-2', 'branch-3'],
    isActive: true,
    phone: '+994 50 300 00 02',
    lastLoginAt: '2026-10-10T12:15:00Z',
  },
  {
    id: 'usr-003',
    name: 'Rəşad Qasımov',
    email: 'bm.ganjlik@brendhouse.az',
    username: 'branch_mgr',
    role: 'branch_manager',
    roleName: 'Filial meneceri',
    branchId: 'branch-2',
    branchName: 'Gənclik Mall Filialı',
    allowedBranchIds: ['branch-2'],
    isActive: true,
    phone: '+994 50 400 00 03',
    lastLoginAt: '2026-10-10T10:45:00Z',
  },
  {
    id: 'usr-004',
    name: 'Aytən Həsənova',
    email: 'kassa1@brendhouse.az',
    username: 'cashier',
    role: 'cashier',
    roleName: 'Kassir',
    branchId: 'branch-2',
    branchName: 'Gənclik Mall Filialı',
    allowedBranchIds: ['branch-2'],
    isActive: true,
    phone: '+994 55 500 00 04',
    lastLoginAt: '2026-10-10T09:00:00Z',
  },
  {
    id: 'usr-005',
    name: 'Vüqar İsmayılov',
    email: 'anbar@brendhouse.az',
    username: 'anbar',
    role: 'warehouse_keeper',
    roleName: 'Anbardar',
    branchId: 'branch-1',
    branchName: '28 May Flaman Filialı',
    allowedBranchIds: ['branch-1'],
    isActive: true,
    phone: '+994 70 600 00 05',
    lastLoginAt: '2026-10-10T08:30:00Z',
  },
  {
    id: 'usr-006',
    name: 'Leyla Kərimova',
    email: 'muhasib@brendhouse.az',
    username: 'accountant',
    role: 'accountant',
    roleName: 'Mühasib',
    branchId: 'branch-1',
    branchName: 'Baş Ofis',
    allowedBranchIds: ['*'],
    isActive: true,
    phone: '+994 51 700 00 06',
    lastLoginAt: '2026-10-10T11:20:00Z',
  },
  {
    id: 'usr-007',
    name: 'Tural Səfərov',
    email: 'tural.s@brendhouse.az',
    username: 'tural_kassa',
    role: 'cashier',
    roleName: 'Kassir',
    branchId: 'branch-3',
    branchName: 'Dəniz Mall Filialı',
    allowedBranchIds: ['branch-3'],
    isActive: false,
    phone: '+994 50 888 12 34',
    lastLoginAt: '2026-09-15T16:00:00Z',
  },
];

export const MOCK_NUMBERING_CONFIGS: DocumentNumberingConfig[] = [
  {
    docType: 'receipt',
    docTypeName: 'Satış Çeki (POS)',
    prefix: 'CK',
    includeBranchCode: true,
    yearFormat: 'YYYY',
    sequencePadding: 6,
    samplePreview: 'CK-28M-2026-000142',
  },
  {
    docType: 'po',
    docTypeName: 'Satınalma Qaiməsi',
    prefix: 'PO',
    includeBranchCode: false,
    yearFormat: 'YYYY',
    sequencePadding: 5,
    samplePreview: 'PO-2026-00045',
  },
  {
    docType: 'transfer',
    docTypeName: 'Anbar Transfer Sorğusu',
    prefix: 'TR',
    includeBranchCode: true,
    yearFormat: 'YYYY',
    sequencePadding: 5,
    samplePreview: 'TR-28M-2026-00012',
  },
  {
    docType: 'return',
    docTypeName: 'Qaytarılma Çeki',
    prefix: 'RET',
    includeBranchCode: true,
    yearFormat: 'YYYY',
    sequencePadding: 5,
    samplePreview: 'RET-GM-2026-00007',
  },
  {
    docType: 'invoice',
    docTypeName: 'Elektron Qaimə / Faktura',
    prefix: 'INV',
    includeBranchCode: false,
    yearFormat: 'YYYY',
    sequencePadding: 6,
    samplePreview: 'INV-2026-000089',
  },
];

export const MOCK_TAX_RATES: TaxRateConfig[] = [
  {
    id: 'tax-1',
    code: 'EDV-18',
    name: 'Standart ƏDV (18%)',
    ratePercent: 18.0,
    taxClass: 'standard',
    description: 'Pərakəndə satış geyim, ayaqqabı və aksesuarlar üçün əsas ƏDV dərəcəsi.',
    isDefault: true,
  },
  {
    id: 'tax-2',
    code: 'SADE-2',
    name: 'Sadələşdirilmiş Vergi (2%)',
    ratePercent: 2.0,
    taxClass: 'reduced',
    description: 'Ticarət fəaliyyəti üzrə sadələşdirilmiş vergi rejimində çalışan subyektlər üçün.',
    isDefault: false,
  },
  {
    id: 'tax-3',
    code: 'SIFIR-0',
    name: '0% İxrac və Güzəştli',
    ratePercent: 0.0,
    taxClass: 'zero',
    description: 'Ölkə xaricinə göndərilən ixrac məhsulları və diplomatik nümayəndəliklər.',
    isDefault: false,
  },
  {
    id: 'tax-4',
    code: 'AZAD',
    name: 'Vergidən Azad Edilmiş',
    ratePercent: 0.0,
    taxClass: 'exempt',
    description: 'AR Vergi Məcəlləsinin 164-cü maddəsinə uyğun vergidən azad edilən mallar.',
    isDefault: false,
  },
];

export const MOCK_INTEGRATIONS: SystemIntegrationItem[] = [
  {
    id: 'int-1',
    name: 'SMS Bildiriş Şlüzü',
    category: 'sms',
    provider: 'Azercell / SMS.az API Gateway',
    status: 'unconfigured',
    errorMessage: 'API açarı və SMS Provider identifikatoru təyin edilməyib.',
    configSummary: 'Konfiqurasiya olunmayıb',
  },
  {
    id: 'int-2',
    name: 'Fiskal Kassa İnteqrasiyası',
    category: 'fiscal_kassa',
    provider: 'NBA Technologies / Smart Kassa Driver',
    status: 'active',
    lastSyncAt: '2026-10-10T14:40:00Z',
    configSummary: 'Protokol: v2.4 • 4 Kassa Qoşulub',
  },
  {
    id: 'int-3',
    name: 'ASAN Login & E-taxes Portalı',
    category: 'e_taxes',
    provider: 'Dövlət Vergi Xidməti (DVX) e-Qaimə API',
    status: 'unconfigured',
    errorMessage: 'ASAN İmza sertifikatı və token qoşulmayıb.',
    configSummary: 'Konfiqurasiya olunmayıb',
  },
  {
    id: 'int-4',
    name: 'BrendHouse.az Onlayn Mağaza API',
    category: 'ecommerce',
    provider: 'BrendHouse Legacy WooCommerce / Storefront',
    status: 'unconfigured',
    errorMessage: 'Mövcud onlayn mağaza API açarları daxil edilməyib.',
    configSummary: 'Konfiqurasiya olunmayıb (Placeholder)',
  },
];

export const MOCK_SYSTEM_HEALTH: SystemHealthMetrics = {
  status: 'healthy',
  apiLatencyMs: 24,
  databaseStatus: 'connected',
  memoryUsedMb: 412,
  memoryTotalMb: 1024,
  uptimeHours: 342,
  lastBackupAt: '2026-10-10T03:00:00Z',
  lastBackupSizeBytes: 52_428_800, // 50 MB
  version: 'BRAND HOUSE ERP v1.0.0-rc2',
};

export const MOCK_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'aud-101',
    timestamp: '2026-10-10T14:32:15Z',
    userId: 'usr-001',
    userName: 'Kamran Əliyev',
    userRole: 'Sistem admini',
    module: 'admin.branches',
    action: 'branch.update',
    branchName: '28 May Flaman Filialı',
    ipAddress: '185.11.23.45',
    details: '28 May filialının iş qrafiki yeniləndi.',
    beforeJson: {
      workingHoursWeekday: '10:00 - 21:00',
      cashRegistersCount: 2,
    },
    afterJson: {
      workingHoursWeekday: '10:00 - 22:00',
      cashRegistersCount: 3,
    },
  },
  {
    id: 'aud-102',
    timestamp: '2026-10-10T13:45:00Z',
    userId: 'usr-002',
    userName: 'Nərgiz Məmmədova',
    userRole: 'Baş menecer',
    module: 'admin.roles',
    action: 'role.permission.update',
    branchName: 'Baş Ofis',
    ipAddress: '82.194.18.102',
    details: '"Mühasib" roluna vergi tənzimləmə hüququ əlavə edildi.',
    beforeJson: {
      role: 'accountant',
      permissionsCount: 16,
    },
    afterJson: {
      role: 'accountant',
      permissionsCount: 18,
      added: ['admin.tax.manage', 'admin.document_numbering.manage'],
    },
  },
  {
    id: 'aud-103',
    timestamp: '2026-10-10T12:10:45Z',
    userId: 'usr-003',
    userName: 'Rəşad Qasımov',
    userRole: 'Filial meneceri',
    module: 'pos.terminal',
    action: 'pos.sale.cancel',
    branchName: 'Gənclik Mall Filialı',
    ipAddress: '185.11.23.49',
    details: 'Çek #CK-GM-2026-00088 müştərinin imtinası səbəbindən ləğv edildi.',
    beforeJson: {
      receiptNumber: 'CK-GM-2026-00088',
      status: 'pending_payment',
      totalAmount: '145.00 ₼',
    },
    afterJson: {
      receiptNumber: 'CK-GM-2026-00088',
      status: 'cancelled',
      cancelReason: 'Müştəri ölçü uyğunsuzluğuna görə kassada imtina etdi',
    },
  },
  {
    id: 'aud-104',
    timestamp: '2026-10-10T10:15:20Z',
    userId: 'usr-001',
    userName: 'Kamran Əliyev',
    userRole: 'Sistem admini',
    module: 'admin.users',
    action: 'user.create',
    branchName: 'Dəniz Mall Filialı',
    ipAddress: '185.11.23.45',
    details: 'Yeni kassir hesabı yaradıldı: Tural Səfərov.',
    beforeJson: undefined,
    afterJson: {
      id: 'usr-007',
      name: 'Tural Səfərov',
      role: 'cashier',
      branch: 'Dəniz Mall',
    },
  },
  {
    id: 'aud-105',
    timestamp: '2026-10-09T17:30:10Z',
    userId: 'usr-006',
    userName: 'Leyla Kərimova',
    userRole: 'Mühasib',
    module: 'admin.tax',
    action: 'tax.rate.update',
    branchName: 'Baş Ofis',
    ipAddress: '185.11.23.45',
    details: 'Sadələşdirilmiş vergi bəndinin şərhi redaktə olundu.',
    beforeJson: {
      code: 'SADE-2',
      rate: 2.0,
      description: 'Köhnə təsvir',
    },
    afterJson: {
      code: 'SADE-2',
      rate: 2.0,
      description: 'Ticarət fəaliyyəti üzrə sadələşdirilmiş vergi rejimində çalışan subyektlər üçün.',
    },
  },
];

