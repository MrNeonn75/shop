"""Şirkət Modulu Giriş Siyasətləri (Company Policies)."""

from __future__ import annotations

from typing import Any


def can_view_company(actor: Any = None) -> bool:
    """Şirkət profilinə baxış hüququnu yoxlayır."""
    if actor is None:
        return True
    roles = getattr(actor, "roles", [])
    perms = getattr(actor, "permissions", [])
    return (
        "system_admin" in roles
        or "company.profile.view" in perms
        or "system.settings.view" in perms
    )


def can_manage_company(actor: Any = None) -> bool:
    """Şirkət profilini redaktə hüququnu yoxlayır."""
    if actor is None:
        return True
    roles = getattr(actor, "roles", [])
    perms = getattr(actor, "permissions", [])
    return (
        "system_admin" in roles
        or "company.profile.manage" in perms
        or "system.settings.manage" in perms
    )
