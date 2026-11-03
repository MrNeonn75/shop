"""Transferlər Modulu Siyasətləri (Transfers Policies).

Filiallararası təsdiqləmə qaydaları, tranzit SLA hədləri və səlahiyyət yoxlamaları.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from app.core.database import utc_now
from app.core.errors import ForbiddenError, TransferInvalidTransitionError
from app.modules.transfers.models import TransferStatus


class TransferPolicy:
    """Transfer status keçidləri və SLA siyasəti."""

    DEFAULT_TRANSIT_SLA_HOURS = 48  # Standart SLA: 48 saat

    # İcazə verilən status keçidləri xəritəsi
    ALLOWED_TRANSITIONS: dict[TransferStatus, set[TransferStatus]] = {
        TransferStatus.DRAFT: {TransferStatus.SUBMITTED, TransferStatus.CANCELLED},
        TransferStatus.SUBMITTED: {
            TransferStatus.APPROVED,
            TransferStatus.REJECTED,
            TransferStatus.CANCELLED,
        },
        TransferStatus.APPROVED: {
            TransferStatus.PICKING,
            TransferStatus.DISPATCHED,
            TransferStatus.IN_TRANSIT,
            TransferStatus.CANCELLED,
        },
        TransferStatus.PICKING: {
            TransferStatus.DISPATCHED,
            TransferStatus.IN_TRANSIT,
            TransferStatus.CANCELLED,
        },
        TransferStatus.DISPATCHED: {
            TransferStatus.IN_TRANSIT,
            TransferStatus.PARTIALLY_RECEIVED,
            TransferStatus.RECEIVED,
            TransferStatus.CANCELLED,
        },
        TransferStatus.IN_TRANSIT: {
            TransferStatus.PARTIALLY_RECEIVED,
            TransferStatus.RECEIVED,
            TransferStatus.CANCELLED,
        },
        TransferStatus.PARTIALLY_RECEIVED: {TransferStatus.RECEIVED, TransferStatus.CANCELLED},
        TransferStatus.RECEIVED: set(),
        TransferStatus.REJECTED: set(),
        TransferStatus.CANCELLED: set(),
    }

    @classmethod
    def validate_transition(
        cls, current_status: TransferStatus, target_status: TransferStatus
    ) -> None:
        """Status keçidinin qanuniliyini yoxlayır."""
        allowed = cls.ALLOWED_TRANSITIONS.get(current_status, set())
        if target_status not in allowed:
            raise TransferInvalidTransitionError(
                message=f"Transfer statusu '{current_status.value}'-dən '{target_status.value}'-ə dəyişdirilə bilməz.",
                details=[
                    {
                        "current_status": current_status.value,
                        "target_status": target_status.value,
                        "allowed": [s.value for s in allowed],
                    }
                ],
            )

    @classmethod
    def is_transit_delayed(
        cls, dispatched_at: datetime | None, sla_hours: int = DEFAULT_TRANSIT_SLA_HOURS
    ) -> tuple[bool, int]:
        """Transferin SLA müddətini aşıb-aşmadığını və neçə gün yolda olduğunu hesablayır."""
        if not dispatched_at:
            return False, 0

        from datetime import UTC

        if dispatched_at.tzinfo is None:
            dispatched_at = dispatched_at.replace(tzinfo=UTC)

        now = utc_now()
        delta = now - dispatched_at
        hours_passed = delta.total_seconds() / 3600
        days_passed = int(delta.total_seconds() // 86400)

        is_delayed = hours_passed > sla_hours
        return is_delayed, days_passed

    @classmethod
    def check_transfer_dispatch_access(
        cls, source_branch_id: uuid.UUID | None, actor: Any | None
    ) -> None:
        """Göndərən filialdan yola salma hüququnu yoxlayır."""
        if actor is None:
            return
        is_superuser = getattr(actor, "is_superuser", False) or getattr(actor, "is_admin", False)
        if is_superuser:
            return

        permissions = getattr(actor, "permissions", set()) or set()
        if "transfer.dispatch" not in permissions and "transfers.dispatch" not in permissions:
            raise ForbiddenError(
                message="Malları yola salmaq ('transfer.dispatch') icazəniz yoxdur."
            )

        if source_branch_id is not None:
            allowed = getattr(actor, "allowed_branches", None)
            if allowed is not None and source_branch_id not in allowed:
                raise ForbiddenError(message="Göndərən filiala çıxış səlahiyyətiniz yoxdur.")

    @classmethod
    def check_transfer_receive_access(
        cls, destination_branch_id: uuid.UUID | None, actor: Any | None
    ) -> None:
        """Qəbul edən filiala daxil etmə hüququnu yoxlayır."""
        if actor is None:
            return
        is_superuser = getattr(actor, "is_superuser", False) or getattr(actor, "is_admin", False)
        if is_superuser:
            return

        permissions = getattr(actor, "permissions", set()) or set()
        if "transfer.receive" not in permissions and "transfers.receive" not in permissions:
            raise ForbiddenError(
                message="Malları qəbul etmək ('transfer.receive') icazəniz yoxdur."
            )

        if destination_branch_id is not None:
            allowed = getattr(actor, "allowed_branches", None)
            if allowed is not None and destination_branch_id not in allowed:
                raise ForbiddenError(message="Təyinat filialına çıxış səlahiyyətiniz yoxdur.")


def check_transfer_permission(permission: str, actor: Any | None) -> None:
    """Transfer əməliyyatları üçün istifadəçi icazəsini yoxlayır."""
    if actor is None:
        raise ForbiddenError(message="Autentifikasiya tələb olunur.")
    is_superuser = getattr(actor, "is_superuser", False) or getattr(actor, "is_admin", False)
    if is_superuser:
        return
    roles = set(getattr(actor, "roles", []) or [])
    if "system_admin" in roles or "general_manager" in roles:
        return
    perms = set(getattr(actor, "permissions", []) or [])
    if permission not in perms:
        raise ForbiddenError(message=f"Bu əməliyyat üçün '{permission}' icazəsi tələb olunur.")
