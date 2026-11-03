"""RBAC İcazə Qaydaları, BranchScope və Siyasət Qatı (RBAC Policies).

1. `require_permission("module.resource.action")` asılılığı.
2. `BranchScope` filial təcridi asılılığı.
3. Vəzifələrin bölünməsi (Segregation of Duties) köməkçisi.
4. Həssas məlumatların (əmək haqqı, maya dəyəri, PII) maskalanması köməkçisi.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

from fastapi import Request
from sqlalchemy import Select

from app.core.errors import (
    CrossBranchAccessError,
    ForbiddenError,
    SegregationOfDutiesError,
    UnauthenticatedError,
)


def require_permission(permission_key: str) -> Callable[[Request], Any]:
    """Endpoint üçün xüsusi icazə tələb edən FastAPI dependency fabriki."""

    async def _dependency(request: Request) -> Any:
        user = getattr(request.state, "user", None)
        if not user:
            raise UnauthenticatedError("Giriş tələb olunur.")

        roles = set(getattr(user, "roles", []))
        if "system_admin" in roles:
            return user  # Sistem admini bütün icazələrə sahibdir

        permissions = set(getattr(user, "permissions", []))
        if permission_key not in permissions:
            raise ForbiddenError(
                f"Bu əməliyyatı icra etmək üçün '{permission_key}' icazəniz yoxdur."
            )
        return user

    return _dependency


class BranchScope:
    """Filial təcridi üçün mərkəzi asılılıq (Branch Scope Dependency)."""

    def __init__(
        self,
        user_id: uuid.UUID | None,
        is_all_branches: bool,
        allowed_branch_ids: set[uuid.UUID],
    ) -> None:
        self.user_id = user_id
        self.is_all_branches = is_all_branches
        self.allowed_branch_ids = allowed_branch_ids

    def has_access_to(self, branch_id: uuid.UUID) -> bool:
        """Müəyyən filiala çıxış hüququnu yoxlayır."""
        if self.is_all_branches:
            return True
        return branch_id in self.allowed_branch_ids

    def ensure_branch_access(self, branch_id: uuid.UUID) -> None:
        """Filiala çıxış yoxdursa, CrossBranchAccessError xətası qaldırır."""
        if not self.has_access_to(branch_id):
            raise CrossBranchAccessError(
                f"'{branch_id}' filialının məlumatlarına müraciət icazəniz yoxdur."
            )

    def filter_query(self, query: Select[Any], branch_column: Any) -> Select[Any]:
        """SQLAlchemy sorğusuna filial filtrini tətbiq edir."""
        if self.is_all_branches:
            return query
        if not self.allowed_branch_ids:
            # Heç bir filiala icazəsi yoxdursa, boş qaytarır
            return query.where(branch_column.in_([]))
        return query.where(branch_column.in_(list(self.allowed_branch_ids)))


async def get_branch_scope(request: Request) -> BranchScope:
    """Request kontekstindən filial icazələrini oxuyaraq BranchScope obyektini yaradır."""
    user = getattr(request.state, "user", None)
    if not user:
        return BranchScope(user_id=None, is_all_branches=False, allowed_branch_ids=set())

    roles = set(getattr(user, "roles", []))
    permissions = set(getattr(user, "permissions", []))

    # Bütün filiallara icazə
    if "system_admin" in roles or "system.branches.all" in permissions:
        return BranchScope(
            user_id=getattr(user, "id", None),
            is_all_branches=True,
            allowed_branch_ids=set(),
        )

    branch_ids = set(getattr(user, "allowed_branches", []))
    return BranchScope(
        user_id=getattr(user, "id", None),
        is_all_branches=False,
        allowed_branch_ids=branch_ids,
    )


def verify_segregation_of_duties(
    actor_id: uuid.UUID,
    document_creator_id: uuid.UUID,
    action: str = "approve",
) -> None:
    """Sənədi yaradan və təsdiq edənin eyni şəxs olmasını yoxlayır (SoD qaydası)."""
    if actor_id == document_creator_id:
        raise SegregationOfDutiesError(
            f"Vəzifələrin bölünməsi qaydası: Öz yaratdığınız sənədi təsdiq ({action}) edə bilməzsiniz."
        )


def mask_sensitive_fields(
    data: dict[str, Any],
    can_view_sensitive: bool = False,
    sensitive_keys: set[str] | None = None,
) -> dict[str, Any]:
    """Həssas sahələri (əmək haqqı, maya dəyəri, PII) maskalayır."""
    if can_view_sensitive:
        return data

    keys = sensitive_keys or {
        "salary",
        "net_salary",
        "gross_salary",
        "cost_price",
        "margin",
        "passport_number",
        "id_card_number",
        "bank_account",
    }

    masked = dict(data)
    for k, v in masked.items():
        if k.lower() in keys and v is not None:
            masked[k] = "****"
        elif isinstance(v, dict):
            masked[k] = mask_sensitive_fields(v, can_view_sensitive, keys)
        elif isinstance(v, list):
            masked[k] = [
                mask_sensitive_fields(item, can_view_sensitive, keys)
                if isinstance(item, dict)
                else item
                for item in v
            ]
    return masked
