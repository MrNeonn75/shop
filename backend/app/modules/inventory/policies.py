"""İnventar Modulu Siyasətləri və Biznes Qaydaları (Inventory Policies).

Mənfi qalıq qadağaları, sayım kənarlaşması hədləri və filial məhdudiyyətləri.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from app.core.errors import ForbiddenError, NegativeStockForbiddenError


class InventoryPolicy:
    """İnventar əməliyyatlarının biznes qaydalarını yoxlayan siyasət sinfi."""

    DEFAULT_NEGATIVE_STOCK_POLICY = "FORBIDDEN"
    DEFAULT_COUNT_VARIANCE_THRESHOLD_QTY = 5
    DEFAULT_COUNT_VARIANCE_THRESHOLD_VAL = Decimal("50.00")

    @classmethod
    def check_negative_stock_allowed(
        cls,
        allow_override_flag: bool,
        reason: str | None,
        actor: Any | None,
    ) -> None:
        """Mənfi stoka icazənin olub-olmadığını yoxlayır."""
        if not allow_override_flag:
            raise NegativeStockForbiddenError(
                message="Mənfi stok qalığına icazə verilmir.",
                details=[{"field": "allow_negative", "issue": "policy_forbidden"}],
            )

        if not reason or len(reason.strip()) < 5:
            raise NegativeStockForbiddenError(
                message="Mənfi stok üçün ən az 5 simvoldan ibarət əsaslandırma səbəbi mütləqdir.",
                details=[{"field": "override_reason", "issue": "reason_required"}],
            )

        if actor is not None:
            # Əgər actor ötürülübsə, icazəsini yoxlayırıq
            permissions = getattr(actor, "permissions", set()) or set()
            is_superuser = getattr(actor, "is_superuser", False) or getattr(
                actor, "is_admin", False
            )
            if not is_superuser and "inventory.negative.override" not in permissions:
                raise ForbiddenError(
                    message="Mənfi stok qalığı təyin etmək üçün 'inventory.negative.override' icazəniz yoxdur."
                )

    @classmethod
    def check_warehouse_access(
        cls,
        warehouse_branch_id: uuid.UUID | None,
        actor: Any | None,
    ) -> None:
        """İstifadəçinin anbara (filiala) çıxış hüququnu yoxlayır."""
        if actor is None:
            return

        is_superuser = getattr(actor, "is_superuser", False) or getattr(actor, "is_admin", False)
        if is_superuser:
            return

        # Mərkəzi anbar (branch_id is None) - ümumi icazə
        if warehouse_branch_id is None:
            return

        allowed_branches = getattr(actor, "allowed_branches", None)
        if allowed_branches is not None and warehouse_branch_id not in allowed_branches:
            raise ForbiddenError(
                message=f"Təyin olunmamış filiala ({warehouse_branch_id}) aid anbarla əməliyyat apara bilməzsiniz."
            )

    @classmethod
    def requires_supervisor_count_approval(
        cls,
        variance_qty: int,
        variance_val: Decimal,
        threshold_qty: int = DEFAULT_COUNT_VARIANCE_THRESHOLD_QTY,
        threshold_val: Decimal = DEFAULT_COUNT_VARIANCE_THRESHOLD_VAL,
    ) -> bool:
        """Kənarlaşmanın rəhbər təsdiqi tələb edib-etmədiyini müəyyən edir."""
        return abs(variance_qty) >= threshold_qty or abs(variance_val) >= threshold_val


def check_inventory_permission(permission: str, actor: Any | None) -> None:
    """İnventar əməliyyatları üçün istifadəçi icazəsini yoxlayır."""
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
