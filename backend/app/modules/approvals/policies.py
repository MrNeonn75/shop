"""Təsdiqləmə Mühərriki Qaydaları və SoD Yoxlamaları (Approval Policies)."""

from __future__ import annotations

import uuid
from typing import Any

from app.core.errors import BusinessRuleViolationError, ForbiddenError


class ApprovalPolicy:
    """Təsdiqləmə və Vəzifələrin Bölünməsi (SoD) siyasəti."""

    @staticmethod
    def validate_sod(requester_id: uuid.UUID, actor: Any) -> None:
        """Sorğunu yaradan şəxs öz sorğusunu təsdiq edə bilməz (Segregation of Duties)."""
        if not actor:
            return
        actor_id = getattr(actor, "id", None)
        if actor_id and str(actor_id) == str(requester_id):
            is_superuser = getattr(actor, "is_superuser", False) or getattr(
                actor, "is_admin", False
            )
            if not is_superuser:
                raise BusinessRuleViolationError(
                    "Vəzifələrin Bölünməsi (SoD) Qaydası: Sorğunu yaradan şəxs öz sorğusunu təsdiq edə bilməz."
                )

    @staticmethod
    def validate_approver_authority(
        required_role: str | None,
        required_permission: str | None,
        actor: Any,
    ) -> None:
        """İstifadəçinin pillə üzrə təsdiq səlahiyyətini yoxlayır."""
        if not actor:
            raise ForbiddenError("Autentifikasiya tələb olunur.")

        is_superuser = getattr(actor, "is_superuser", False) or getattr(actor, "is_admin", False)
        roles = set(getattr(actor, "roles", []) or [])
        if is_superuser or "system_admin" in roles or "general_manager" in roles:
            return

        permissions = set(getattr(actor, "permissions", []) or [])

        role_match = bool(required_role and required_role in roles)
        perm_match = bool(required_permission and required_permission in permissions)

        if not required_role and not required_permission:
            return

        if not (role_match or perm_match):
            needed = required_role or required_permission or "təsdiqçi"
            raise ForbiddenError(f"Bu addımı təsdiqləmək üçün '{needed}' səlahiyyəti tələb olunur.")

    @staticmethod
    def validate_decision_reason(decision: str, reason: str | None) -> None:
        """İmtina və ya geri qaytarma qərarlarında əsaslandırma səbəbinin olmasını yoxlayır."""
        if decision in ("REJECT", "RETURN") and (not reason or len(reason.strip()) < 3):
            raise BusinessRuleViolationError(
                f"'{decision}' qərarı üçün ən azı 3 simvoldan ibarət əsaslandırma səbəbi mütləqdir."
            )
