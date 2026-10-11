import { AuthUser, ROLE_DEFAULT_PERMISSIONS, ROLE_LABELS, UserRole } from '../../utils/permissions';

export interface DemoUserAccount {
  user: AuthUser;
  password: string;
  badgeLabel: string;
  description: string;
}

export const DEMO_USERS: Record<UserRole, DemoUserAccount> = {
  superadmin: {
    user: {
      id: 'usr-001',
      name: 'Kamran Əliyev',
      username: 'admin',
      email: 'admin@brendhouse.az',
      role: 'superadmin',
      roleName: ROLE_LABELS.superadmin,
      permissions: ROLE_DEFAULT_PERMISSIONS.superadmin,
      branchId: 'branch-1',
      allowedBranchIds: ['*'],
      canAccessAllBranches: true,
      phone: '+994 50 200 00 01',
      lastLoginAt: '2026-10-10T14:32:00Z',
    },
    password: 'AdminPassword123!',
    badgeLabel: 'Sistem admini',
    description: 'Bütün modullara və filiallara qeyri-məhdud tam nəzarət hüququ.',
  },

  general_manager: {
    user: {
      id: 'usr-002',
      name: 'Nərgiz Məmmədova',
      username: 'manager',
      email: 'gm@brendhouse.az',
      role: 'general_manager',
      roleName: ROLE_LABELS.general_manager,
      permissions: ROLE_DEFAULT_PERMISSIONS.general_manager,
      branchId: 'branch-1',
      allowedBranchIds: ['branch-1', 'branch-2', 'branch-3'],
      canAccessAllBranches: true,
      phone: '+994 50 300 00 02',
      lastLoginAt: '2026-10-10T12:15:00Z',
    },
    password: 'ManagerPassword123!',
    badgeLabel: 'Baş menecer',
    description: 'Şəbəkə üzrə bütün filialların satışı, anbarı, maliyyəsi və BI hesabatları.',
  },

  branch_manager: {
    user: {
      id: 'usr-003',
      name: 'Rəşad Qasımov',
      username: 'branch_mgr',
      email: 'bm.ganjlik@brendhouse.az',
      role: 'branch_manager',
      roleName: ROLE_LABELS.branch_manager,
      permissions: ROLE_DEFAULT_PERMISSIONS.branch_manager,
      branchId: 'branch-2',
      allowedBranchIds: ['branch-2'],
      canAccessAllBranches: false,
      phone: '+994 50 400 00 03',
      lastLoginAt: '2026-10-10T10:45:00Z',
    },
    password: 'BranchPassword123!',
    badgeLabel: 'Filial meneceri',
    description: 'Yalnız Gənclik Mall filialının əməliyyatları, kassa və yerli heyət idarəetməsi.',
  },

  cashier: {
    user: {
      id: 'usr-004',
      name: 'Aytən Həsənova',
      username: 'cashier',
      email: 'kassa1@brendhouse.az',
      role: 'cashier',
      roleName: ROLE_LABELS.cashier,
      permissions: ROLE_DEFAULT_PERMISSIONS.cashier,
      branchId: 'branch-2',
      allowedBranchIds: ['branch-2'],
      canAccessAllBranches: false,
      phone: '+994 55 500 00 04',
      lastLoginAt: '2026-10-10T09:00:00Z',
    },
    password: 'CashierPassword123!',
    badgeLabel: 'Kassir',
    description: 'POS kassa terminalı, satış çekləri, müştəri qeydiyyatı və qaytarmalar.',
  },

  warehouse_keeper: {
    user: {
      id: 'usr-005',
      name: 'Vüqar İsmayılov',
      username: 'anbar',
      email: 'anbar@brendhouse.az',
      role: 'warehouse_keeper',
      roleName: ROLE_LABELS.warehouse_keeper,
      permissions: ROLE_DEFAULT_PERMISSIONS.warehouse_keeper,
      branchId: 'branch-1',
      allowedBranchIds: ['branch-1'],
      canAccessAllBranches: false,
      phone: '+994 70 600 00 05',
      lastLoginAt: '2026-10-10T08:30:00Z',
    },
    password: 'AnbarPassword123!',
    badgeLabel: 'Anbardar',
    description: 'Anbar qalıqları, sayım, daxili transferlər və təchizat qəbulları.',
  },

  accountant: {
    user: {
      id: 'usr-006',
      name: 'Leyla Kərimova',
      username: 'accountant',
      email: 'muhasib@brendhouse.az',
      role: 'accountant',
      roleName: ROLE_LABELS.accountant,
      permissions: ROLE_DEFAULT_PERMISSIONS.accountant,
      branchId: 'branch-1',
      allowedBranchIds: ['*'],
      canAccessAllBranches: true,
      phone: '+994 51 700 00 06',
      lastLoginAt: '2026-10-10T11:20:00Z',
    },
    password: 'AccountantPassword123!',
    badgeLabel: 'Mühasib',
    description: 'Xərclər, baş kitab, vergi parametrləri, maya dəyəri və maliyyə hesabatları.',
  },
};

export const DEMO_USERS_LIST = Object.values(DEMO_USERS);

