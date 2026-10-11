import { useSessionStore } from '../stores/sessionStore';
import {
  hasPermission,
  hasBranchAccess,
  isSuperAdmin as checkIsSuperAdmin,
  PermissionString,
  UserRole,
} from '../utils/permissions';

/**
 * usePermission provides reactive permission checking hooks for the authenticated session.
 *
 * IMPORTANT SECURITY REMINDER:
 * Frontend permission checks are UX conveniences only (hiding UI items, disabling actions).
 * The server-side backend API validates all authorization and rejects unauthorized payloads.
 */
export function usePermission() {
  const user = useSessionStore((state) => state.user);
  const activeBranchId = useSessionStore((state) => state.activeBranchId);

  const can = (permission: PermissionString): boolean => {
    return hasPermission(user, permission);
  };

  const canAny = (permissions: PermissionString[]): boolean => {
    return hasPermission(user, permissions, false);
  };

  const canAll = (permissions: PermissionString[]): boolean => {
    return hasPermission(user, permissions, true);
  };

  const canBranch = (branchId: string): boolean => {
    return hasBranchAccess(user, branchId);
  };

  const hasRole = (role: UserRole | UserRole[]): boolean => {
    if (!user) return false;
    if (user.role === 'superadmin') return true;
    const roles = Array.isArray(role) ? role : [role];
    return roles.includes(user.role);
  };

  return {
    user,
    role: user?.role,
    roleName: user?.roleName,
    isSuperAdmin: checkIsSuperAdmin(user),
    canAccessAllBranches: Boolean(user?.canAccessAllBranches || user?.role === 'superadmin'),
    activeBranchId,
    can,
    canAny,
    canAll,
    canBranch,
    hasRole,
  };
}

