"""Qaytarmalar və Mübadilələr Qaydaları və Siyasəti (Returns Policies)."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from app.core.errors import (
    BusinessRuleViolationError,
    ForbiddenError,
    ManagerApprovalError,
    ValidationError,
)
from app.modules.pos.policies import PosPolicy


class ReturnsPolicy:
    """Qaytarma və mübadilə əməliyyatlarının səlahiyyət və biznes qaydaları."""

    @staticmethod
    def check_can_create_return(actor: Any) -> None:
        """Qaytarma sənədi yaratmaq hüququnu yoxlayır."""
        roles = getattr(actor, "roles", []) or []
        perms = getattr(actor, "permissions", []) or []
        if "system_admin" not in roles and "returns.create" not in perms:
            raise ForbiddenError("Qaytarma sənədi yaratmaq üçün hüququnuz yoxdur (returns.create).")

    @staticmethod
    def check_can_exchange(actor: Any) -> None:
        """Mübadilə (Exchange) əməliyyatı hüququnu yoxlayır."""
        roles = getattr(actor, "roles", []) or []
        perms = getattr(actor, "permissions", []) or []
        if "system_admin" not in roles and "returns.exchange" not in perms:
            raise ForbiddenError(
                "Mübadilə (Exchange) əməliyyatı aparmaq hüququnuz yoxdur (returns.exchange)."
            )

    @staticmethod
    def check_can_approve(actor: Any) -> None:
        """Qaytarmaları təsdiqləmək və ya rədd etmək hüququnu yoxlayır."""
        roles = getattr(actor, "roles", []) or []
        perms = getattr(actor, "permissions", []) or []
        if "system_admin" not in roles and "returns.approve" not in perms:
            raise ForbiddenError("Qaytarmaları təsdiq etmək hüququnuz yoxdur (returns.approve).")

    @staticmethod
    def check_return_window(
        sale_date: date,
        business_date: date,
        window_days: int,
        actor: Any,
        manager_token: str | None,
        reason: str | None,
        branch_id: uuid.UUID,
    ) -> None:
        """Qaytarma vaxt həddini (Return Window) yoxlayır."""
        days_elapsed = (business_date - sale_date).days
        if days_elapsed <= window_days:
            return

        roles = getattr(actor, "roles", []) or []
        perms = getattr(actor, "permissions", []) or []
        if (
            "system_admin" not in roles
            and "returns.override_window" not in perms
            and not manager_token
        ):
            raise ManagerApprovalError(
                f"Satış tarixindən {days_elapsed} gün keçib (Qaytarma müddəti: {window_days} gün). "
                f"Müddəti aşmış qaytarma üçün menecer təsdiq tokeni (returns.override_window) tələb olunur."
            )

        if not reason or len(reason.strip()) < 5:
            raise ValidationError(
                "Qaytarma müddəti aşılmış əməliyyat üçün ətraflı izahat qeyd edilməlidir.",
                details=[{"field": "override_window_reason", "issue": "required_min_5_chars"}],
            )

        if manager_token:
            PosPolicy.verify_manager_approval_token(
                token=manager_token,
                required_action="returns.override_window",
                branch_id=branch_id,
            )

    @staticmethod
    def check_no_receipt_allowed(
        actor: Any,
        manager_token: str | None,
        customer_id: uuid.UUID | None,
        requires_customer: bool,
        branch_id: uuid.UUID,
    ) -> None:
        """Çeksiz (qəbzsiz) qaytarma qaydalarını yoxlayır."""
        roles = getattr(actor, "roles", []) or []
        perms = getattr(actor, "permissions", []) or []
        if "system_admin" not in roles and "returns.no_receipt" not in perms:
            raise ForbiddenError(
                "Çeksiz qaytarma icra etmək hüququnuz yoxdur (returns.no_receipt)."
            )

        if requires_customer and not customer_id:
            raise ValidationError(
                "Tənzimləmələrə əsasən çeksiz qaytarmalarda müştərinin müəyyənləşdirilməsi məcburidir.",
                details=[{"field": "customer_id", "issue": "required_for_no_receipt"}],
            )

        if "system_admin" not in roles and not manager_token:
            raise ManagerApprovalError(
                "Çeksiz qaytarma üçün mütləq menecer təsdiq tokeni (returns.no_receipt) tələb olunur."
            )

        if manager_token:
            PosPolicy.verify_manager_approval_token(
                token=manager_token,
                required_action="returns.no_receipt",
                branch_id=branch_id,
            )

    @staticmethod
    def check_refund_limits(
        actor: Any,
        refund_total: Decimal,
        refund_limits: dict[str, float],
        manager_token: str | None,
        branch_id: uuid.UUID,
    ) -> None:
        """Rol üzrə maksimal geri ödəniş limitini yoxlayır."""
        roles = getattr(actor, "roles", []) or []
        if "system_admin" in roles:
            return

        max_limit = Decimal("0.00")
        for r in roles:
            limit_val = refund_limits.get(r, 0.0)
            if Decimal(str(limit_val)) > max_limit:
                max_limit = Decimal(str(limit_val))

        # Default limit
        if not roles:
            max_limit = Decimal(str(refund_limits.get("cashier", 50.0)))

        if refund_total > max_limit:
            if not manager_token:
                raise ManagerApprovalError(
                    f"Geri ödəniş məbləği ({refund_total} AZN) rol limitinizi ({max_limit} AZN) aşır. "
                    f"Menecer təsdiq tokeni tələb olunur."
                )
            PosPolicy.verify_manager_approval_token(
                token=manager_token,
                required_action="returns.refund",
                branch_id=branch_id,
                required_amount=refund_total,
            )

    @staticmethod
    def check_cash_refund_allowed(
        actor: Any,
        shift_status: str,
        refund_amount: Decimal,
        drawer_cash: Decimal,
    ) -> None:
        """Nağd geri ödəniş qaydalarını və kassa qalıq kifayətliyini yoxlayır."""
        roles = getattr(actor, "roles", []) or []
        perms = getattr(actor, "permissions", []) or []
        if "system_admin" not in roles and "returns.refund.cash" not in perms:
            raise ForbiddenError("Nağd geri ödəniş etmək hüququnuz yoxdur (returns.refund.cash).")

        if shift_status != "OPEN":
            raise BusinessRuleViolationError(
                code="SHIFT_NOT_OPEN",
                message=f"Nağd geri ödəniş üçün kassa növbəsi açıq olmalıdır (Status: {shift_status}).",
            )

        if refund_amount > drawer_cash:
            raise BusinessRuleViolationError(
                code="INSUFFICIENT_DRAWER_CASH",
                message=(
                    f"Kassada kifayət qədər nağd pul yoxdur! Geri ödəniləcək: {refund_amount} AZN, "
                    f"Kassa qalığı: {drawer_cash} AZN. Kassaya mədaxil (CASH_IN) icra edilməlidir."
                ),
            )

    @staticmethod
    def check_card_refund_allowed(
        actor: Any,
        provider_mode: str,
        allow_cash_fallback: bool,
    ) -> None:
        """Kart geri ödəniş qaydalarını və provayder konfiqurasiyasını yoxlayır."""
        roles = getattr(actor, "roles", []) or []
        perms = getattr(actor, "permissions", []) or []
        if "system_admin" not in roles and "returns.refund.provider" not in perms:
            raise ForbiddenError(
                "Kartla geri ödəniş etmək hüququnuz yoxdur (returns.refund.provider)."
            )

        if provider_mode == "NOT_CONFIGURED" and not allow_cash_fallback:
            raise BusinessRuleViolationError(
                code="PAYMENT_PROVIDER_NOT_CONFIGURED",
                message="Bank kartına geri qaytarma üçün ödəniş provayderi konfiqurasiya edilməyib.",
            )

    @staticmethod
    def check_store_credit_allowed(
        customer_id: uuid.UUID | None, store_credit_enabled: bool
    ) -> None:
        """Mağaza krediti (Store Credit) buraxılış qaydalarını yoxlayır."""
        if not store_credit_enabled:
            raise BusinessRuleViolationError(
                code="STORE_CREDIT_DISABLED",
                message="Mağaza krediti (Store Credit) sistemi tənzimləmələrdə qeyri-aktivdir.",
            )
        if not customer_id:
            raise ValidationError(
                "Mağaza krediti buraxılması üçün müştəri seçilməlidir.",
                details=[{"field": "customer_id", "issue": "required_for_store_credit"}],
            )
