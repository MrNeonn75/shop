"""Sazlamalar Modulu Giriş Siyasətləri (Settings Policies)."""

from __future__ import annotations

import uuid
from typing import Any


def can_view_settings(actor: Any = None) -> bool:
    """Parametrlərə baxış icazəsini yoxlayır."""
    if actor is None:
        return True
    roles = getattr(actor, "roles", [])
    perms = getattr(actor, "permissions", [])
    return (
        "system_admin" in roles
        or "system.settings.view" in perms
        or "system.settings.manage" in perms
    )


def can_manage_settings(actor: Any = None) -> bool:
    """Parametrləri redaktə etmək hüququnu yoxlayır."""
    if actor is None:
        return True
    roles = getattr(actor, "roles", [])
    perms = getattr(actor, "permissions", [])
    return "system_admin" in roles or "system.settings.manage" in perms


def can_manage_branch_settings(actor: Any = None, branch_id: uuid.UUID | None = None) -> bool:
    """Müəyyən filialın parametrlərini redaktə hüququnu yoxlayır."""
    if actor is None:
        return True
    roles = getattr(actor, "roles", [])
    perms = getattr(actor, "permissions", [])
    if "system_admin" in roles or "system.settings.manage" in perms:
        return True
    if branch_id is None:
        return False
    # Filial meneceri öz filialının parametrlərini dəyişə bilər
    allowed_branches = getattr(actor, "allowed_branches", [])
    return "branch_manager" in roles and branch_id in allowed_branches
