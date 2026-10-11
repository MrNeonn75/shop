/**
 * BRAND HOUSE ERP — Role-Based Access Control (RBAC) & Permission Model
 *
 * Permission Format: "module.resource.action" (e.g. inventory.stock.adjust, pos.sale.cancel, hr.salary.view)
 *
 * IMPORTANT SECURITY NOTE:
 * Frontend permission checks are purely for UX and UI visibility control (e.g. hiding navigation,
 * disabling action buttons, masking sensitive fields). They MUST NEVER be relied upon for security enforcement.
 * The backend server is always authoritative and validates every request.
 */

export type UserRole =
  | 'superadmin'       // Sistem admini
  | 'general_manager'  // Baş menecer
  | 'branch_manager'   // Filial meneceri
  | 'cashier'          // Kassir
  | 'warehouse_keeper' // Anbardar
  | 'accountant';      // Mühasib

export type PermissionString = string;
export type Permission = PermissionString;

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  email: string;
  role: UserRole;
  roleName: string;
  permissions: PermissionString[];
  branchId: string;
  allowedBranchIds: string[]; // Array of branch IDs or ['*']
  canAccessAllBranches: boolean;
  avatarUrl?: string;
  phone?: string;
  lastLoginAt?: string;
}

export interface PermissionDefinition {
  code: PermissionString;
  name: string;
  description: string;
  category: 'operations' | 'inventory' | 'finance' | 'people' | 'admin';
  isSensitive?: boolean;
}

export const ALL_PERMISSIONS: PermissionDefinition[] = [
  // Əməliyyatlar (Operations)
  { code: 'pos.terminal.access', name: 'POS Terminalına Giriş', description: 'POS kassa ekranına daxil olmaq', category: 'operations' },
  { code: 'pos.sale.create', name: 'POS Satışı İcra Etmək', description: 'Yeni satış çeki vurmaq', category: 'operations' },
  { code: 'pos.sale.cancel', name: 'Çeki Ləğv Etmək', description: 'Aktiv satışı və ya çeki ləğv etmək', category: 'operations' },
  { code: 'pos.discount.apply', name: 'Xüsusi Endirim Tətbiqi', description: 'Standartdan kənar endirim tətbiq etmək', category: 'operations' },
  { code: 'sales.orders.view', name: 'Satışlara Baxış', description: 'Bütün satış sifarişlərinin siyahısını görmək', category: 'operations' },
  { code: 'sales.orders.create', name: 'Satış Sənədi Yaratmaq', description: 'Topdan və ya pərakəndə satış sənədi açmaq', category: 'operations' },
  { code: 'sales.refund.process', name: 'Qaytarılma İcrası', description: 'Müştəri qaytarmalarını qəbul etmək', category: 'operations' },
  { code: 'inventory.transfer.view', name: 'Transferlərə Baxış', description: 'Filiallararası yerdəyişmələri görmək', category: 'operations' },
  { code: 'inventory.transfer.create', name: 'Transfer Yaratmaq', description: 'Yeni anbar transfer sorğusu açmaq', category: 'operations' },
  { code: 'inventory.transfer.approve', name: 'Transferi Təsdiqləmək', description: 'Daxil olan transferi qəbul edib təsdiqləmək', category: 'operations' },

  // Məhsul və Anbar (Inventory & Products)
  { code: 'products.catalog.view', name: 'Kataloqa Baxış', description: 'Məhsul kartotekasını görmək', category: 'inventory' },
  { code: 'products.catalog.create', name: 'Məhsul Yaratmaq', description: 'Yeni SKU / məhsul əlavə etmək', category: 'inventory' },
  { code: 'products.catalog.edit', name: 'Məhsulu Redaktə Etmək', description: 'Məhsul parametrlərini dəyişmək', category: 'inventory' },
  { code: 'products.catalog.delete', name: 'Məhsulu Silmək', description: 'Məhsulu kataloqdan silmək', category: 'inventory' },
  { code: 'products.cost_price.view', name: 'Maya Dəyərini Görmək', description: 'Məhsulun alış / maya dəyərini görmək (HƏSSAS)', category: 'inventory', isSensitive: true },
  { code: 'inventory.stock.view', name: 'Stok Qalıqlarına Baxış', description: 'Anbar və vitrin qalıqlarını görmək', category: 'inventory' },
  { code: 'inventory.stock.adjust', name: 'Stok Düzəlişi (Sayım)', description: 'İnventarizasiya və qalıq korreksiyası', category: 'inventory' },
  { code: 'procurement.orders.view', name: 'Satınalma Sifarişlərinə Baxış', description: 'Təchizat sifarişlərini görmək', category: 'inventory' },
  { code: 'procurement.orders.create', name: 'Satınalma Yaratmaq', description: 'Yeni satınalma qaiməsi daxil etmək', category: 'inventory' },
  { code: 'procurement.suppliers.view', name: 'Təchizatçılara Baxış', description: 'Tərəfdaş şirkətlərin siyahısını görmək', category: 'inventory' },
  { code: 'procurement.suppliers.manage', name: 'Təchizatçı İdarəetməsi', description: 'Yeni təchizatçı əlavə etmək / redaktə', category: 'inventory' },
  { code: 'procurement.supplier_price.view', name: 'Təchizatçı Qiymətlərini Görmək', description: 'Müqavilə alış qiymətlərini görmək (HƏSSAS)', category: 'inventory', isSensitive: true },

  // Maliyyə və Hesabatlar (Finance & BI)
  { code: 'finance.ledger.view', name: 'Baş Kitaba Baxış', description: 'Kassa və hesab qalıqlarını görmək', category: 'finance' },
  { code: 'finance.expense.view', name: 'Xərclərə Baxış', description: 'Filial və ofis xərclərini görmək', category: 'finance' },
  { code: 'finance.expense.create', name: 'Xərc Qeydiyyatı', description: 'Yeni xərc maddəsi daxil etmək', category: 'finance' },
  { code: 'finance.expense.approve', name: 'Xərcləri Təsdiqləmək', description: 'Böyük məbləğli ödənişləri təsdiqləmək', category: 'finance' },
  { code: 'reports.standard.view', name: 'Standart Hesabatlara Baxış', description: 'Dövriyyə və satış hesabatları', category: 'finance' },
  { code: 'reports.bi.view', name: 'BI Analitikasına Baxış', description: 'Qabaqcıl vizual qrafiklər və proqnozlar', category: 'finance' },
  { code: 'reports.export', name: 'Hesabatları İxrac Etmək', description: 'Məlumatları Excel / CSV formatında yükləmək', category: 'finance' },

  // İnsan və Müştəri (People, HR, CRM)
  { code: 'hr.employees.view', name: 'Əməkdaşlara Baxış', description: 'İşçi heyəti siyahısını görmək', category: 'people' },
  { code: 'hr.employees.manage', name: 'Əməkdaş İdarəetməsi', description: 'İşə qəbul, vəzifə dəyişikliyi', category: 'people' },
  { code: 'hr.salary.view', name: 'Əməkhaqqı Məlumatlarını Görmək', description: 'Maaş və bonusları görmək (HƏSSAS)', category: 'people', isSensitive: true },
  { code: 'crm.customers.view', name: 'Müştərilərə Baxış', description: 'Müştəri bazasını və loyallıq ballarını görmək', category: 'people' },
  { code: 'crm.customers.manage', name: 'Müştəri İdarəetməsi', description: 'Müştəri kartı yaratmaq və düzəliş', category: 'people' },
  { code: 'marketing.campaigns.view', name: 'Kampaniyalara Baxış', description: 'Aksiya və endirimləri görmək', category: 'people' },
  { code: 'marketing.discounts.manage', name: 'Aksiya Qaydaları Təyini', description: 'Endirim şərtlərini tənzimləmək', category: 'people' },

  // Sistem və Administrasiya (System & Admin)
  { code: 'admin.company.manage', name: 'Şirkət Profili İdarəetməsi', description: 'Şirkət rekvizitləri və rekvizit parametrləri', category: 'admin' },
  { code: 'admin.branches.view', name: 'Filiallاره Baxış', description: 'Filial siyahısını görmək', category: 'admin' },
  { code: 'admin.branches.manage', name: 'Filial İdarəetməsi', description: 'Yeni filial açmaq / bağlamaq / redaktə', category: 'admin' },
  { code: 'admin.branches.all', name: 'Bütün Filiallara Giriş', description: '"Bütün filiallar" konsolidasiya filtrini seçmək', category: 'admin' },
  { code: 'admin.warehouses.view', name: 'Anbarlara Baxış', description: 'Anbar siyahısını görmək', category: 'admin' },
  { code: 'admin.warehouses.manage', name: 'Anbar İdarəetməsi', description: 'Anbar yaratmaq və filial bağlamaq', category: 'admin' },
  { code: 'admin.users.view', name: 'İstifadəçilərə Baxış', description: 'İstifadəçi hesablarını görmək', category: 'admin' },
  { code: 'admin.users.manage', name: 'İstifadəçi İdarəetməsi', description: 'İstifadəçi yaratmaq, rol vermək, bloklamaq', category: 'admin' },
  { code: 'admin.roles.view', name: 'Rollara Baxış', description: 'Rollar və icazələr matrisini görmək', category: 'admin' },
  { code: 'admin.roles.manage', name: 'Rolların İdarəetməsi', description: 'Rolu redaktə etmək və ya kopyalamaq', category: 'admin' },
  { code: 'admin.document_numbering.manage', name: 'Sənəd Nömrələnməsi Tənzimləməsi', description: 'Prefiks, il və sayğac qaydalarını dəyişmək', category: 'admin' },
  { code: 'admin.tax.manage', name: 'Vergi Parametrləri', description: 'Vergi dərəcələri və siniflərini tənzimləmək', category: 'admin' },
  { code: 'admin.integrations.manage', name: 'İnteqrasiyalar İdarəetməsi', description: 'SMS, fiskal kassa, ASAN login, API açarları', category: 'admin' },
  { code: 'admin.system_health.view', name: 'Sistem Sağlamlığı və Backup', description: 'Server sağlamlığı və ehtiyat nüsxə monitorinqi', category: 'admin' },
  { code: 'admin.audit.view', name: 'Audit Jurnalına Baxış', description: 'Sistemdəki bütün əməliyyatların tarixçəsi', category: 'admin' },
  { code: 'admin.audit.export', name: 'Audit İxracı', description: 'Audit qeydlərini CSV ixrac etmək', category: 'admin' },
  { code: 'notifications.system.view', name: 'Bildirişləri İdarə Etmək', description: 'Sistem bildirişlərini görmək və konfiqurasiya', category: 'admin' },
  { code: 'settings.general.view', name: 'Ümumi Parametrlər', description: 'Sistem parametrlərini görmək', category: 'admin' },
];

/**
 * 6 Realistic Demo Roles matching BRAND HOUSE Retail operations
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, PermissionString[]> = {
  superadmin: ['*'], // Superadmin has unrestricted access to everything

  general_manager: [
    'pos.terminal.access',
    'sales.orders.view',
    'sales.orders.create',
    'sales.refund.process',
    'inventory.transfer.view',
    'inventory.transfer.create',
    'inventory.transfer.approve',
    'products.catalog.view',
    'products.catalog.create',
    'products.catalog.edit',
    'products.cost_price.view',
    'inventory.stock.view',
    'inventory.stock.adjust',
    'procurement.orders.view',
    'procurement.orders.create',
    'procurement.suppliers.view',
    'procurement.supplier_price.view',
    'finance.ledger.view',
    'finance.expense.view',
    'finance.expense.create',
    'finance.expense.approve',
    'reports.standard.view',
    'reports.bi.view',
    'reports.export',
    'hr.employees.view',
    'hr.salary.view',
    'crm.customers.view',
    'crm.customers.manage',
    'marketing.campaigns.view',
    'admin.company.manage',
    'admin.branches.view',
    'admin.branches.all',
    'admin.warehouses.view',
    'admin.users.view',
    'admin.roles.view',
    'admin.system_health.view',
    'admin.audit.view',
    'admin.audit.export',
    'notifications.system.view',
    'settings.general.view',
  ],

  branch_manager: [
    'pos.terminal.access',
    'pos.sale.create',
    'pos.sale.cancel',
    'pos.discount.apply',
    'sales.orders.view',
    'sales.orders.create',
    'sales.refund.process',
    'inventory.transfer.view',
    'inventory.transfer.create',
    'inventory.transfer.approve',
    'products.catalog.view',
    'inventory.stock.view',
    'inventory.stock.adjust',
    'reports.standard.view',
    'reports.export',
    'crm.customers.view',
    'crm.customers.manage',
    'hr.employees.view',
    'admin.branches.view',
    'notifications.system.view',
  ],

  cashier: [
    'pos.terminal.access',
    'pos.sale.create',
    'sales.orders.view',
    'sales.orders.create',
    'sales.refund.process',
    'products.catalog.view',
    'inventory.stock.view',
    'crm.customers.view',
    'crm.customers.manage',
  ],

  warehouse_keeper: [
    'products.catalog.view',
    'inventory.stock.view',
    'inventory.stock.adjust',
    'inventory.transfer.view',
    'inventory.transfer.create',
    'inventory.transfer.approve',
    'procurement.orders.view',
    'procurement.suppliers.view',
    'reports.standard.view',
  ],

  accountant: [
    'sales.orders.view',
    'products.catalog.view',
    'products.cost_price.view',
    'inventory.stock.view',
    'procurement.orders.view',
    'procurement.suppliers.view',
    'procurement.supplier_price.view',
    'finance.ledger.view',
    'finance.expense.view',
    'finance.expense.create',
    'finance.expense.approve',
    'reports.standard.view',
    'reports.export',
    'admin.branches.view',
    'admin.branches.all',
    'admin.tax.manage',
    'admin.document_numbering.manage',
    'admin.audit.view',
    'admin.audit.export',
  ],
};

export const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Sistem admini',
  general_manager: 'Baş menecer',
  branch_manager: 'Filial meneceri',
  cashier: 'Kassir',
  warehouse_keeper: 'Anbardar',
  accountant: 'Mühasib',
};

/**
 * Evaluates whether a user's permissions array includes the requested permission.
 * Supports wildcards:
 * - "*" allows everything.
 * - "admin.*" allows all admin sub-permissions (e.g. "admin.users.view").
 */
export function checkPermissionMatch(userPermissions: string[], required: string): boolean {
  if (userPermissions.includes('*')) return true;
  if (userPermissions.includes(required)) return true;

  const parts = required.split('.');
  if (parts.length >= 2) {
    const moduleWildcard = `${parts[0]}.*`;
    if (userPermissions.includes(moduleWildcard)) return true;

    const resourceWildcard = `${parts[0]}.${parts[1]}.*`;
    if (userPermissions.includes(resourceWildcard)) return true;
  }

  return false;
}

/**
 * Checks if a user has a specific permission or set of permissions.
 */
export function hasPermission(
  user: AuthUser | null | undefined,
  requiredPermission: PermissionString | PermissionString[],
  requireAll = false
): boolean {
  if (!user) return false;
  if (user.role === 'superadmin' || user.permissions.includes('*')) return true;

  const permissions = Array.isArray(requiredPermission)
    ? requiredPermission
    : [requiredPermission];

  if (requireAll) {
    return permissions.every((p) => checkPermissionMatch(user.permissions, p));
  }

  return permissions.some((p) => checkPermissionMatch(user.permissions, p));
}

/**
 * Checks if a user is allowed to access/view a specific branch's data.
 */
export function hasBranchAccess(user: AuthUser | null | undefined, branchId: string): boolean {
  if (!user) return false;
  if (user.role === 'superadmin' || user.canAccessAllBranches) return true;
  if (branchId === 'all') return user.canAccessAllBranches;
  return user.allowedBranchIds.includes(branchId) || user.allowedBranchIds.includes('*');
}

/**
 * Checks if user has a specific role or one of multiple roles.
 */
export function hasRole(user: AuthUser | null | undefined, roles: UserRole | UserRole[]): boolean {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  const roleList = Array.isArray(roles) ? roles : [roles];
  return roleList.includes(user.role);
}

/**
 * Checks if user is superadmin.
 */
export function isSuperAdmin(user: AuthUser | null | undefined): boolean {
  return Boolean(user && user.role === 'superadmin');
}

/**
 * Utility to mask sensitive values (e.g. salary, cost price) if user lacks permission.
 * Note: UX only; server will not return real value if not authorized.
 */
export function maskSensitiveValue(
  value: string | number,
  canView: boolean,
  mask = '*** ₼'
): string {
  return canView ? String(value) : mask;
}

