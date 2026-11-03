"""Kənar İnteqrasiyalar İcazə Siyasəti (Integrations Policies)."""

from __future__ import annotations

from typing import Any


def can_view_integrations(actor: Any) -> bool:
    """İnteqrasiyaların vəziyyətinə baxış hüququnu yoxlayır."""
    if not actor:
        return True  # Read-only status summary is open or checked by middleware
    roles = set(getattr(actor, "roles", []))
    permissions = set(getattr(actor, "permissions", []))
    if "system_admin" in roles or "admin" in roles:
        return True
    return bool(
        permissions.intersection({"settings.view", "settings.manage", "system.settings.view"})
    )


def can_manage_integrations(actor: Any) -> bool:
    """İnteqrasiyaları redaktə etmə və test bağlantısı icra etmə hüququnu yoxlayır."""
    if not actor:
        return False
    roles = set(getattr(actor, "roles", []))
    permissions = set(getattr(actor, "permissions", []))
    if "system_admin" in roles or "admin" in roles:
        return True
    return bool(permissions.intersection({"settings.manage", "system.settings.manage"}))
