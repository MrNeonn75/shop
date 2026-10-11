import React from 'react';
import { useSessionStore } from '../../shared/stores/sessionStore';
import { hasPermission, hasRole, Permission, UserRole } from '../../shared/utils/permissions';

export interface PermissionGateProps {
  permission?: Permission | Permission[];
  role?: UserRole | UserRole[];
  requireAll?: boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * PermissionGate controls UI element visibility based on user session role and permissions.
 *
 * NOTE: Frontend permission checks are purely for UX and UI visibility control.
 * The backend API enforces true authorization checks on every single request.
 */
export const PermissionGate: React.FC<PermissionGateProps> = ({
  permission,
  role,
  requireAll = false,
  fallback = null,
  children,
}) => {
  const user = useSessionStore((state) => state.user);

  if (!user) {
    return <>{fallback}</>;
  }

  // Superadmin always has full access
  if (user.role === 'superadmin') {
    return <>{children}</>;
  }

  // Check role requirement
  if (role && !hasRole(user, role)) {
    return <>{fallback}</>;
  }

  // Check permission requirement
  if (permission && !hasPermission(user, permission, requireAll)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

