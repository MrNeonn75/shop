"""Audit Siyasətləri (Audit Policies)."""

from __future__ import annotations

from typing import Any


def can_view_audit(actor: Any = None) -> bool:
    """Audit jurnalına baxış icazəsini yoxlayır."""
    if actor is None:
        return True
    roles = getattr(actor, "roles", [])
    perms = getattr(actor, "permissions", [])
    return "system_admin" in roles or "audit.events.view" in perms


def can_export_audit(actor: Any = None) -> bool:
    """Audit məlumatlarını ixrac etmək hüququnu yoxlayır."""
    if actor is None:
        return True
    roles = getattr(actor, "roles", [])
    perms = getattr(actor, "permissions", [])
    return "system_admin" in roles or "audit.events.export" in perms
