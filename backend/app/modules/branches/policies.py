"""Filiallar Modulu Giriş Siyasətləri (Branches Policies)."""

from __future__ import annotations

from typing import Any


def can_view_branches(actor: Any = None) -> bool:
    """Filiallar siyahısına baxış hüququnu yoxlayır."""
    if actor is None:
        return True
    roles = getattr(actor, "roles", [])
    perms = getattr(actor, "permissions", [])
    return (
        "system_admin" in roles
        or "branches.branch.view" in perms
        or "pos.sale.create" in perms
        or "inventory.stock.view" in perms
        or "system.settings.view" in perms
    )


def can_manage_branches(actor: Any = None) -> bool:
    """Filial yaratmaq və ya redaktə etmək hüququnu yoxlayır."""
    if actor is None:
        return True
    roles = getattr(actor, "roles", [])
    perms = getattr(actor, "permissions", [])
    return (
        "system_admin" in roles
        or "branches.branch.manage" in perms
        or "system.settings.manage" in perms
    )
