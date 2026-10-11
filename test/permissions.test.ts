import { describe, it, expect } from 'vitest';
import {
  checkPermissionMatch,
  hasPermission,
  hasRole,
  hasBranchAccess,
  isSuperAdmin,
  maskSensitiveValue,
  AuthUser,
  ROLE_DEFAULT_PERMISSIONS,
} from '../src/shared/utils/permissions';

describe('RBAC & Permission Model Unit Tests', () => {
  const superAdminUser: AuthUser = {
    id: 'usr-admin',
    name: 'Super Admin',
    username: 'admin',
    email: 'admin@brendhouse.az',
    role: 'superadmin',
    roleName: 'Sistem admini',
    permissions: ['*'],
    branchId: 'branch-1',
    allowedBranchIds: ['*'],
    canAccessAllBranches: true,
  };

  const cashierUser: AuthUser = {
    id: 'usr-cashier',
    name: 'Kassir Aytən',
    username: 'cashier',
    email: 'cashier@brendhouse.az',
    role: 'cashier',
    roleName: 'Kassir',
    permissions: ROLE_DEFAULT_PERMISSIONS.cashier,
    branchId: 'branch-2',
    allowedBranchIds: ['branch-2'],
    canAccessAllBranches: false,
  };

  const accountantUser: AuthUser = {
    id: 'usr-accountant',
    name: 'Mühasib Leyla',
    username: 'accountant',
    email: 'muhasib@brendhouse.az',
    role: 'accountant',
    roleName: 'Mühasib',
    permissions: ROLE_DEFAULT_PERMISSIONS.accountant,
    branchId: 'branch-1',
    allowedBranchIds: ['*'],
    canAccessAllBranches: true,
  };

  describe('checkPermissionMatch wildcard matching', () => {
    it('matches exact permission', () => {
      expect(checkPermissionMatch(['pos.sale.create'], 'pos.sale.create')).toBe(true);
      expect(checkPermissionMatch(['pos.sale.create'], 'pos.sale.cancel')).toBe(false);
    });

    it('matches universal wildcard (*)', () => {
      expect(checkPermissionMatch(['*'], 'admin.users.manage')).toBe(true);
      expect(checkPermissionMatch(['*'], 'hr.salary.view')).toBe(true);
    });

    it('matches module wildcard (e.g. admin.*)', () => {
      expect(checkPermissionMatch(['admin.*'], 'admin.company.manage')).toBe(true);
      expect(checkPermissionMatch(['admin.*'], 'admin.tax.manage')).toBe(true);
      expect(checkPermissionMatch(['admin.*'], 'pos.sale.create')).toBe(false);
    });

    it('matches resource wildcard (e.g. inventory.stock.*)', () => {
      expect(checkPermissionMatch(['inventory.stock.*'], 'inventory.stock.view')).toBe(true);
      expect(checkPermissionMatch(['inventory.stock.*'], 'inventory.stock.adjust')).toBe(true);
      expect(checkPermissionMatch(['inventory.stock.*'], 'inventory.transfer.create')).toBe(false);
    });
  });

  describe('hasPermission verification', () => {
    it('superadmin always evaluates to true for any permission', () => {
      expect(hasPermission(superAdminUser, 'any.unreal.permission')).toBe(true);
    });

    it('null or undefined user evaluates to false', () => {
      expect(hasPermission(null, 'pos.terminal.access')).toBe(false);
      expect(hasPermission(undefined, 'pos.terminal.access')).toBe(false);
    });

    it('cashier has pos.terminal.access and pos.sale.create, but not admin.users.manage', () => {
      expect(hasPermission(cashierUser, 'pos.terminal.access')).toBe(true);
      expect(hasPermission(cashierUser, 'pos.sale.create')).toBe(true);
      expect(hasPermission(cashierUser, 'admin.users.manage')).toBe(false);
      expect(hasPermission(cashierUser, 'products.cost_price.view')).toBe(false);
    });

    it('accountant has cost price view permission and ledger view', () => {
      expect(hasPermission(accountantUser, 'products.cost_price.view')).toBe(true);
      expect(hasPermission(accountantUser, 'finance.ledger.view')).toBe(true);
      expect(hasPermission(accountantUser, 'pos.sale.cancel')).toBe(false);
    });

    it('handles multiple permissions with requireAll=false (ANY)', () => {
      // Cashier has pos.terminal.access, doesn't have admin.company.manage
      expect(
        hasPermission(cashierUser, ['pos.terminal.access', 'admin.company.manage'], false)
      ).toBe(true);
    });

    it('handles multiple permissions with requireAll=true (ALL)', () => {
      expect(
        hasPermission(cashierUser, ['pos.terminal.access', 'pos.sale.create'], true)
      ).toBe(true);
      expect(
        hasPermission(cashierUser, ['pos.terminal.access', 'admin.company.manage'], true)
      ).toBe(false);
    });
  });

  describe('hasRole verification', () => {
    it('superadmin matches any requested role', () => {
      expect(hasRole(superAdminUser, 'cashier')).toBe(true);
      expect(hasRole(superAdminUser, ['accountant', 'general_manager'])).toBe(true);
    });

    it('checks specific role for regular users', () => {
      expect(hasRole(cashierUser, 'cashier')).toBe(true);
      expect(hasRole(cashierUser, 'accountant')).toBe(false);
      expect(hasRole(cashierUser, ['cashier', 'accountant'])).toBe(true);
    });

    it('returns false for null user', () => {
      expect(hasRole(null, 'cashier')).toBe(false);
    });
  });

  describe('hasBranchAccess branch scoping', () => {
    it('superadmin can access all branches including global "all"', () => {
      expect(hasBranchAccess(superAdminUser, 'branch-1')).toBe(true);
      expect(hasBranchAccess(superAdminUser, 'branch-2')).toBe(true);
      expect(hasBranchAccess(superAdminUser, 'all')).toBe(true);
    });

    it('user with canAccessAllBranches can access "all"', () => {
      expect(hasBranchAccess(accountantUser, 'all')).toBe(true);
    });

    it('cashier is scoped only to their assigned branch (branch-2)', () => {
      expect(hasBranchAccess(cashierUser, 'branch-2')).toBe(true);
      expect(hasBranchAccess(cashierUser, 'branch-1')).toBe(false);
      expect(hasBranchAccess(cashierUser, 'all')).toBe(false);
    });
  });

  describe('maskSensitiveValue utility', () => {
    it('returns original value when authorized', () => {
      expect(maskSensitiveValue('45.00 ₼', true)).toBe('45.00 ₼');
      expect(maskSensitiveValue(1450, true)).toBe('1450');
    });

    it('returns mask string when unauthorized', () => {
      expect(maskSensitiveValue('45.00 ₼', false)).toBe('*** ₼');
      expect(maskSensitiveValue('45.00 ₼', false, 'GİZLİ')).toBe('GİZLİ');
    });
  });

  describe('isSuperAdmin helper', () => {
    it('identifies superadmin accurately', () => {
      expect(isSuperAdmin(superAdminUser)).toBe(true);
      expect(isSuperAdmin(cashierUser)).toBe(false);
      expect(isSuperAdmin(null)).toBe(false);
    });
  });
});

