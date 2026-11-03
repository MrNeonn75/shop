"""Sənəd Nömrələnməsi İcazə Siyasəti (Numbering Policies)."""

from __future__ import annotations

from typing import Any


def can_view_numbering(actor: Any) -> bool:
    """Nömrələnmə ardıcıllıqlarına baxış icazəsini yoxlayır."""
    if not actor:
        return False
    roles = set(getattr(actor, "roles", []))
    permissions = set(getattr(actor, "permissions", []))
    if "system_admin" in roles or "admin" in roles:
        return True
    return bool(
        permissions.intersection({"settings.view", "settings.manage", "system.settings.view"})
    )


def can_manage_numbering(actor: Any) -> bool:
    """Nömrələnmə ardıcıllıqlarını idarəetmə icazəsini yoxlayır."""
    if not actor:
        return False
    roles = set(getattr(actor, "roles", []))
    permissions = set(getattr(actor, "permissions", []))
    if "system_admin" in roles or "admin" in roles:
        return True
    return bool(permissions.intersection({"settings.manage", "system.settings.manage"}))
