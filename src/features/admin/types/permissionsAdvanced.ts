import { UserRole } from '../../../shared/utils/permissions';

/**
 * Module 17: Users & Permissions (Advanced)
 */

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface PermissionCatalogItem {
  id: string;
  code: string;
  module: string;
  resource: string;
  action: string;
  azName: string;
  azDescription: string;
  category: 'operations' | 'inventory' | 'finance' | 'people' | 'admin';
  isSensitive: boolean;
  riskLevel: RiskLevel;
  riskRationale?: string;
  rolesHolding: UserRole[];
}

export interface UserEffectivePermissions {
  userId: string;
  userName: string;
  email: string;
  role: UserRole;
  roleName: string;
  directGrants: string[];
  directRevocations: string[];
  effectivePermissions: string[];
  allowedBranchIds: string[];
  canAccessAllBranches: boolean;
  lastLoginAt: string;
  isInactive: boolean;
  inactiveDays: number;
  branchScope?: string;
}

export interface TemporaryAccessGrant {
  id: string;
  userId: string;
  userName: string;
  permissionOrRole: string;
  scopeBranchId: string;
  scopeBranchName: string;
  startsAt: string;
  expiresAt: string;
  reason: string;
  approverId: string;
  approverName: string;
  status: 'active' | 'expired' | 'revoked';
}

export interface AccessDelegation {
  id: string;
  delegatorId: string;
  delegatorName: string;
  substituteId: string;
  substituteName: string;
  role: UserRole;
  startDate: string;
  endDate: string;
  reason: string;
  isActive: boolean;
}

export interface SodRule {
  id: string;
  code: string;
  titleAz: string;
  descriptionAz: string;
  riskLevel: 'high' | 'critical';
  conflictingPermissions: [string, string];
  mitigationGuideAz: string;
}

export interface SodViolation {
  rule: SodRule;
  ruleId?: string;
  presentPermissions: [string, string];
}

export interface ManagerPinConfig {
  userId: string;
  userName: string;
  branchId: string;
  isPinSet: boolean;
  failedAttempts: number;
  isLocked: boolean;
  lockedUntil?: string;
  lastChangedAt: string;
}
