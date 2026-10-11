import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSessionStore } from '../../shared/stores/sessionStore';
import { hasPermission, hasBranchAccess, PermissionString } from '../../shared/utils/permissions';

interface ProtectedRouteProps {
  requiredPermission?: PermissionString | PermissionString[];
  requireAllPermissions?: boolean;
  requiredBranchId?: string;
  children?: React.ReactNode;
}

/**
 * ProtectedRoute guards routes against unauthorized access.
 *
 * UX NOTE: Frontend routing guards provide a smooth user experience.
 * Backend endpoints must enforce authoritative authorization on every request.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  requiredPermission,
  requireAllPermissions = false,
  requiredBranchId,
  children,
}) => {
  const location = useLocation();
  const { isAuthenticated, user } = useSessionStore();

  if (!isAuthenticated || !user) {
    const redirectUrl = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth/login?redirect=${redirectUrl}`} replace />;
  }

  // Check Permission
  if (requiredPermission && !hasPermission(user, requiredPermission, requireAllPermissions)) {
    return <Navigate to="/403" replace />;
  }

  // Check Branch Scoping
  if (requiredBranchId && !hasBranchAccess(user, requiredBranchId)) {
    return <Navigate to="/403" replace />;
  }

  return children ? <>{children}</> : null;
};

