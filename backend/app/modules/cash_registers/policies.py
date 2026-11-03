"""Kassa Aparatları Modulu Giriş Siyasətləri (Cash Registers Policies)."""

from __future__ import annotations

from typing import Any


def can_view_cash_registers(actor: Any = None) -> bool:
    """Kassalar siyahısına baxış icazəsini yoxlayır."""
    if actor is None:
        return True
    roles = getattr(actor, "roles", [])
    perms = getattr(actor, "permissions", [])
    return (
        "system_admin" in roles
        or "branch_manager" in roles
        or "cashier" in roles
        or "registers.register.view" in perms
        or "pos.sale.create" in perms
        or "system.settings.view" in perms
    )


def can_manage_cash_registers(actor: Any = None) -> bool:
    """Kassa qeydiyyatı və redaktəsi hüququnu yoxlayır."""
    if actor is None:
        return True
    roles = getattr(actor, "roles", [])
    perms = getattr(actor, "permissions", [])
    return (
        "system_admin" in roles
        or "branch_manager" in roles
        or "registers.register.manage" in perms
        or "system.settings.manage" in perms
    )
