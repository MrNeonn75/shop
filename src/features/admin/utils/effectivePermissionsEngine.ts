import { ROLE_DEFAULT_PERMISSIONS, UserRole } from '../../../shared/utils/permissions';
import { UserEffectivePermissions } from '../types/permissionsAdvanced';
import { AdminUser } from '../../../shared/adapters/mock/adminMockData';

/**
 * Computes effective permissions for a user given their role, direct grants, and revocations
 */
export function computeEffectivePermissions(
  role: UserRole,
  directGrants: (string | { permission: string })[] = [],
  directRevocations: string[] = []
): string[] {
  const rolePermissions = ROLE_DEFAULT_PERMISSIONS[role] || [];

  if (rolePermissions.includes('*')) {
    // Root administrator retains wildcard
    return ['*'];
  }

  const effectiveSet = new Set<string>(rolePermissions);

  // Add individual direct grants
  directGrants.forEach((p) => {
    const code = typeof p === 'string' ? p : p.permission;
    if (code) effectiveSet.add(code);
  });

  // Subtract direct revocations
  directRevocations.forEach((p) => effectiveSet.delete(p));

  return Array.from(effectiveSet).sort();
}

/**
 * Calculates user inactivity metrics (30 days threshold)
 */
export function calculateUserInactivity(
  lastLoginAt?: string,
  referenceDate: Date = new Date()
): { isInactive: boolean; isInactive30d: boolean; inactiveDays: number; inactivityDays: number } {
  if (!lastLoginAt) {
    return { isInactive: true, isInactive30d: true, inactiveDays: 999, inactivityDays: 999 };
  }

  const loginDate = new Date(lastLoginAt);
  const diffMs = referenceDate.getTime() - loginDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const isInactive = diffDays >= 30;

  return {
    isInactive,
    isInactive30d: isInactive,
    inactiveDays: Math.max(0, diffDays),
    inactivityDays: Math.max(0, diffDays),
  };
}

/**
 * Builds user access review record from AdminUser data
 */
export function buildUserAccessReview(
  user: AdminUser,
  directGrants: (string | { permission: string })[] = [],
  directRevocations: string[] = []
): UserEffectivePermissions {
  const effectivePermissions = computeEffectivePermissions(
    user.role,
    directGrants,
    directRevocations
  );
  const { isInactive, inactiveDays } = calculateUserInactivity(user.lastLoginAt);

  const branchScope = user.allowedBranchIds?.includes('*')
    ? 'Bütün filiallar'
    : user.allowedBranchIds?.length
    ? `${user.allowedBranchIds.length} filial`
    : '1 filial';

  return {
    userId: user.id,
    userName: user.name,
    email: user.email,
    role: user.role,
    roleName: user.roleName,
    directGrants: directGrants.map((g) => (typeof g === 'string' ? g : g.permission)),
    directRevocations,
    effectivePermissions,
    allowedBranchIds: user.allowedBranchIds || [user.branchId],
    canAccessAllBranches: user.allowedBranchIds?.includes('*') || false,
    lastLoginAt: user.lastLoginAt,
    isInactive: !user.isActive || isInactive,
    inactiveDays,
    branchScope,
  };
}
