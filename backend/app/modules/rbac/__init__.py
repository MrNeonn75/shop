"""RBAC Module for Brand House ERP."""

from app.modules.rbac.catalog import PERMISSIONS_CATALOG, SOD_CONFLICTING_PAIRS
from app.modules.rbac.models import (
    Permission,
    Role,
    RolePermission,
    UserPermissionOverride,
    UserRole,
    UserTemporaryGrant,
)
from app.modules.rbac.policies import (
    BranchScope,
    get_branch_scope,
    mask_sensitive_fields,
    require_permission,
    verify_segregation_of_duties,
)
from app.modules.rbac.service import RbacService, get_rbac_service

__all__ = [
    "PERMISSIONS_CATALOG",
    "SOD_CONFLICTING_PAIRS",
    "Permission",
    "Role",
    "RolePermission",
    "UserRole",
    "UserPermissionOverride",
    "UserTemporaryGrant",
    "BranchScope",
    "get_branch_scope",
    "require_permission",
    "verify_segregation_of_duties",
    "mask_sensitive_fields",
    "RbacService",
    "get_rbac_service",
]
