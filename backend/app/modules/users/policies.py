"""İstifadəçilər Modulu Siyasət və İcazə Qaydaları (Users Policies).

İstifadəçi idarəetməsi və öz hüquqlarını qanunsuz artırmağın (self-escalation) qarşısının alınması.
"""

from __future__ import annotations

import uuid
from typing import Any

from app.core.errors import SelfEscalationError


def can_manage_users(actor: Any = None) -> bool:
    """İstifadəçinin digər istifadəçiləri idarə etmək hüququnu yoxlayır."""
    if actor is None:
        return True  # Sistem daxili və ya ilkin bootstrap
    # Əgər rollarında sistem admini və ya users.user.manage icazəsi varsa
    permissions: set[str] = set(getattr(actor, "permissions", set()))
    roles: set[str] = set(getattr(actor, "roles", set()))
    return "system_admin" in roles or "users.user.manage" in permissions


def can_view_user(actor: Any, target_user_id: uuid.UUID) -> bool:
    """İstifadəçinin profili görmək hüququnu yoxlayır (öz profili və ya idarəçi)."""
    if actor is None:
        return True
    if getattr(actor, "id", None) == target_user_id:
        return True
    return can_manage_users(actor)


def check_self_escalation(
    actor_id: uuid.UUID | None,
    target_user_id: uuid.UUID,
    is_role_assignment: bool = False,
) -> None:
    """İstifadəçinin öz statusunu, rollarını və ya icazələrini artırmasını əngəlləyir."""
    if actor_id is not None and actor_id == target_user_id and is_role_assignment:
        raise SelfEscalationError(
            "İstifadəçi öz hesabına yeni rol və ya səlahiyyət təyin edə bilməz."
        )
