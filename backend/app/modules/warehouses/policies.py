"""Anbarlar Modulu Giriş Siyasətləri (Warehouses Policies)."""

from __future__ import annotations

from typing import Any


def can_view_warehouses(actor: Any = None) -> bool:
    """Anbarlar siyahısına baxış icazəsini yoxlayır."""
    if actor is None:
        return True
    roles = getattr(actor, "roles", [])
    perms = getattr(actor, "permissions", [])
    return (
        "system_admin" in roles
        or "warehouse_keeper" in roles
        or "warehouses.warehouse.view" in perms
        or "inventory.stock.view" in perms
        or "system.settings.view" in perms
    )


def can_manage_warehouses(actor: Any = None) -> bool:
    """Anbar yaratmaq, redaktə etmək və ya silmək hüququnu yoxlayır."""
    if actor is None:
        return True
    roles = getattr(actor, "roles", [])
    perms = getattr(actor, "permissions", [])
    return (
        "system_admin" in roles
        or "warehouses.warehouse.manage" in perms
        or "system.settings.manage" in perms
    )
