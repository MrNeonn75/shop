"""POS Modulu Biznes Qaydaları və Siyasətləri (POS Policies).

Növbə status keçidləri, menecer təsdiq tokenləri, endirim limitləri,
kassa kənarlaşması dözümlülüyü və ödəniş təhlükəsizlik yoxlanışları.
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal
from typing import Any

import jwt

from app.core.config import settings
from app.core.database import utc_now
from app.core.errors import (
    BusinessRuleViolationError,
    ForbiddenError,
    ManagerApprovalError,
    TokenExpiredError,
    TokenInvalidError,
    ValidationError,
)


class PosPolicy:
    """POS əməliyyatları üzrə avtorizasiya və biznes siyasəti."""

    @staticmethod
    def check_shift_open_allowed(
        actor: Any,
        register_branch_id: uuid.UUID,
        register_status: str,
        opening_cash: Decimal,
        expected_float: Decimal,
        mismatch_reason: str | None,
        has_active_shift_on_register: bool,
        has_active_shift_for_cashier: bool,
    ) -> None:
        """Kassa növbəsinin açılma şərtlərini yoxlayır."""
        # 1. Hüquq yoxlanışı
        permissions = getattr(actor, "permissions", []) or []
        roles = getattr(actor, "roles", []) or []
        is_admin = "system_admin" in roles

        if not is_admin and "pos.shift.open" not in permissions:
            raise ForbiddenError(
                "Kassa növbəsini açmaq hüququnuz yoxdur (pos.shift.open tələb olunur)."
            )

        # 2. Filial çıxış hüququ
        can_access_all = is_admin or "system.branches.all" in permissions
        if not can_access_all:
            allowed_branches = getattr(actor, "allowed_branches", []) or []
            actor_branch_id = getattr(actor, "branch_id", None)
            if allowed_branches and register_branch_id not in allowed_branches:
                raise ForbiddenError(
                    "Bu filialın kassa aparatında növbə açmaq səlahiyyətiniz yoxdur."
                )
            if actor_branch_id and str(actor_branch_id) != str(register_branch_id):
                raise ForbiddenError(
                    "Bu filialın kassa aparatında növbə açmaq səlahiyyətiniz yoxdur."
                )

        # 3. Kassa aparatı aktiv olmalıdır
        if register_status != "active":
            raise BusinessRuleViolationError(
                code="REGISTER_INACTIVE",
                message=f"Kassa aparatı aktiv deyil (Status: {register_status}). Növbə açıla bilməz.",
            )

        # 4. Kassa aparatında aktiv növbə olmamalıdır
        if has_active_shift_on_register:
            raise BusinessRuleViolationError(
                code="SHIFT_ALREADY_OPEN",
                message="Bu kassa aparatında artıq aktiv (OPEN) növbə mövcuddur.",
            )

        # 5. Kassirin başqa aktiv növbəsi olmamalıdır
        if has_active_shift_for_cashier:
            raise BusinessRuleViolationError(
                code="CASHIER_ALREADY_HAS_OPEN_SHIFT",
                message="Bu kassir üçün artıq başqa bir kassa aparatında açıq növbə mövcuddur.",
            )

        # 6. İlkin qalıq fərqi varsa səbəb məcburidir
        if opening_cash != expected_float and not mismatch_reason:
            raise ValidationError(
                message=f"İlkin qalıq gözlənilən məbləğdən ({expected_float} AZN) fərqlidir ({opening_cash} AZN). Səbəb göstərilməlidir.",
                details=[{"field": "mismatch_reason", "issue": "required_on_float_mismatch"}],
            )

    @staticmethod
    def check_cash_movement_allowed(
        actor: Any,
        movement_type: str,
        amount: Decimal,
        approval_threshold: Decimal,
        manager_token: str | None,
        branch_id: uuid.UUID,
    ) -> None:
        """Kassaya nağd daxil/xaric əməliyyatını yoxlayır."""
        permissions = getattr(actor, "permissions", []) or []
        roles = getattr(actor, "roles", []) or []
        is_admin = "system_admin" in roles

        required_perm = "pos.cash.in" if movement_type == "CASH_IN" else "pos.cash.out"
        if not is_admin and required_perm not in permissions:
            raise ForbiddenError(
                f"Nağd vəsait əməliyyatı üçün hüququnuz yoxdur ({required_perm} tələb olunur)."
            )

        # Limitdən artıq olduqda menecer tokeni tələb olunur
        if amount > approval_threshold:
            if not manager_token:
                raise ManagerApprovalError(
                    f"Məbləğ {approval_threshold} AZN həddini aşdığı üçün menecer təsdiq tokeni tələb olunur."
                )
            PosPolicy.verify_manager_approval_token(
                token=manager_token,
                required_action="pos.cash.movement",
                branch_id=branch_id,
                required_amount=amount,
            )

    @staticmethod
    def check_shift_close_allowed(
        actor: Any,
        shift_status: str,
        variance: Decimal,
        tolerance: Decimal,
        explanation: str | None,
        manager_token: str | None,
        branch_id: uuid.UUID,
    ) -> None:
        """Növbə bağlanışını (Z-hesabat) yoxlayır."""
        if shift_status != "OPEN":
            raise BusinessRuleViolationError(
                code="SHIFT_NOT_OPEN",
                message=f"Yalnız 'OPEN' statuslu növbə bağlana bilər (Cari status: {shift_status}).",
            )

        permissions = getattr(actor, "permissions", []) or []
        roles = getattr(actor, "roles", []) or []
        if "system_admin" not in roles and "pos.shift.close" not in permissions:
            raise ForbiddenError(
                "Növbəni bağlamaq hüququnuz yoxdur (pos.shift.close tələb olunur)."
            )

        # Kassa fərqi dözümlülük həddini aşdıqda izahat və menecer təsdiqi məcburidir
        if abs(variance) > tolerance:
            if not explanation:
                raise ValidationError(
                    message=f"Kassa fərqi ({variance} AZN) dözümlülük həddini ({tolerance} AZN) aşır. İzahat mütləqdir.",
                    details=[{"field": "variance_explanation", "issue": "required"}],
                )
            if not manager_token:
                raise ManagerApprovalError(
                    f"Kassa kənarlaşması ({variance} AZN) limitdən böyük olduğu üçün menecer təsdiq tokeni tələb olunur."
                )
            PosPolicy.verify_manager_approval_token(
                token=manager_token,
                required_action="pos.shift.variance",
                branch_id=branch_id,
                required_amount=abs(variance),
            )

    @staticmethod
    def check_shift_reopen_allowed(
        actor: Any,
        shift_status: str,
        reason: str,
        manager_token: str | None,
        branch_id: uuid.UUID,
    ) -> None:
        """Bağlanmış növbənin təkrar açılmasını yoxlayır."""
        if shift_status != "CLOSED":
            raise BusinessRuleViolationError(
                code="SHIFT_NOT_CLOSED",
                message=f"Yalnız 'CLOSED' statuslu növbə təkrar açıla bilər (Cari status: {shift_status}).",
            )

        permissions = getattr(actor, "permissions", []) or []
        roles = getattr(actor, "roles", []) or []
        if "system_admin" not in roles and "pos.shift.reopen" not in permissions:
            raise ForbiddenError(
                "Bağlanmış növbəni təkrar açmaq üçün hüququnuz yoxdur (pos.shift.reopen)."
            )

        if len(reason.strip()) < 5:
            raise ValidationError(
                "Növbənin təkrar açılması üçün ətraflı əsaslandırma qeyd edilməlidir."
            )

        if not manager_token and "system_admin" not in roles:
            raise ManagerApprovalError(
                "Növbənin təkrar açılması üçün menecer təsdiq tokeni tələb olunur."
            )

        if manager_token:
            PosPolicy.verify_manager_approval_token(
                token=manager_token,
                required_action="pos.shift.reopen",
                branch_id=branch_id,
            )

    @staticmethod
    def check_discount_allowed(
        actor: Any,
        discount_percent: Decimal,
        discount_limits: dict[str, float],
        manager_token: str | None,
        branch_id: uuid.UUID,
    ) -> None:
        """Tətbiq edilən fərdi endirimin istifadəçinin rol limitinə uyğunluğunu yoxlayır."""
        if discount_percent <= Decimal("0.00"):
            return

        roles = getattr(actor, "roles", []) or []
        permissions = getattr(actor, "permissions", []) or []

        if "system_admin" in roles:
            return  # Administrator üçün məhdudiyyət yoxdur

        if "pos.discount.apply" not in permissions:
            raise ForbiddenError(
                "Endirim tətbiq etmək hüququnuz yoxdur (pos.discount.apply tələb olunur)."
            )

        # Kassirin/İstifadəçinin maksimum icazə verilən endirim faizini tapırıq
        user_max_limit = Decimal("0.0")
        for role in roles:
            if role in discount_limits:
                limit_val = Decimal(str(discount_limits[role]))
                if limit_val > user_max_limit:
                    user_max_limit = limit_val

        # Əgər rol limitində heç nə tapılmadısa standart 0%
        if discount_percent <= user_max_limit:
            return

        # Limit aşılıb: ya pos.discount.override hüququ olmalıdır, ya da menecer tokeni
        if "pos.discount.override" in permissions:
            return

        if not manager_token:
            raise ManagerApprovalError(
                f"Tətbiq edilən endirim ({discount_percent}%) rol limitini ({user_max_limit}%) aşır. Menecer təsdiq tokeni tələb olunur."
            )

        PosPolicy.verify_manager_approval_token(
            token=manager_token,
            required_action="pos.discount.override",
            branch_id=branch_id,
            required_amount=discount_percent,
        )

    @staticmethod
    def check_card_payment_allowed(
        tender_type: str,
        provider_mode: str,
        external_terminal_enabled: bool,
        approval_code: str | None,
        provider_confirmation_id: str | None,
    ) -> None:
        """Kart və ya xarici POS terminal vasitəsilə ödənişin qəbul edilmə qaydasını yoxlayır."""
        if tender_type not in ("card", "external_terminal"):
            return

        # Provayder aktivdirsə confirmation_id olmalıdır
        if provider_mode != "NOT_CONFIGURED":
            if not provider_confirmation_id:
                raise ValidationError(
                    "Kart ödənişi üçün provayder təsdiq ID-si (provider_confirmation_id) məcburidir."
                )
            return

        # Provayder inteqrasiyası NOT_CONFIGURED olduqda
        if not external_terminal_enabled:
            raise BusinessRuleViolationError(
                code="PAYMENT_PROVIDER_NOT_CONFIGURED",
                message="Bank kartı inteqrasiyası konfiqurasiya edilməyib və xarici terminal aktiv deyil.",
            )

        # Xarici terminal rejimində approval_code (RRN / Avtorizasiya kodu) məcburidir
        if not approval_code and not provider_confirmation_id:
            raise ValidationError(
                message="Xarici POS terminal ilə ödənişdə bank slipindən avtorizasiya referansı (RRN / Auth Code) qeyd edilməlidir.",
                details=[{"field": "approval_code", "issue": "required_for_external_terminal"}],
            )

    @staticmethod
    def create_manager_approval_token(
        manager_id: uuid.UUID,
        action: str,
        branch_id: uuid.UUID,
        max_amount: Decimal | None = None,
        expires_minutes: int = 15,
    ) -> str:
        """Menecer təsdiqi üçün qısamüddətli, təkrar istifadəsi bloklanan JWT token yaradır."""
        now = utc_now()
        exp = now + timedelta(minutes=expires_minutes)
        jti = str(uuid.uuid4())
        secret = settings.SECRET_KEY.get_secret_value()

        payload = {
            "sub": str(manager_id),
            "jti": jti,
            "action": action,
            "branch_id": str(branch_id),
            "max_amount": str(max_amount) if max_amount is not None else None,
            "iat": int(now.timestamp()),
            "exp": int(exp.timestamp()),
        }
        return jwt.encode(payload, secret, algorithm=settings.JWT_ALGORITHM)

    @staticmethod
    def verify_manager_approval_token(
        token: str,
        required_action: str,
        branch_id: uuid.UUID | None = None,
        required_amount: Decimal | None = None,
    ) -> dict[str, Any]:
        """Menecer təsdiq tokenini yoxlayır və payload-ı qaytarır."""
        secret = settings.SECRET_KEY.get_secret_value()
        try:
            payload: dict[str, Any] = jwt.decode(
                token,
                secret,
                algorithms=[settings.JWT_ALGORITHM],
                options={"require": ["exp", "iat", "sub", "jti", "action"]},
            )
        except jwt.ExpiredSignatureError as exc:
            raise TokenExpiredError("Menecer təsdiq tokeninin vaxtı bitib.") from exc
        except jwt.PyJWTError as exc:
            raise TokenInvalidError(f"Menecer təsdiq tokeni etibarsızdır: {exc!s}") from exc

        # Fəaliyyət uyğunluğu (action binding)
        if payload.get("action") != required_action:
            raise ManagerApprovalError(
                f"Token tələb olunan əməliyyat ({required_action}) üçün nəzərdə tutulmayıb (Token action: {payload.get('action')})."
            )

        # Filial uyğunluğu
        token_branch = payload.get("branch_id")
        if token_branch and branch_id is not None and token_branch != str(branch_id):
            raise ManagerApprovalError("Menecer təsdiq tokeni başqa bir filial üçün verilib.")

        # Məbləğ həddi
        token_max_amount = payload.get("max_amount")
        if token_max_amount and required_amount is not None:
            max_amt = Decimal(str(token_max_amount))
            if required_amount > max_amt:
                raise ManagerApprovalError(
                    f"Əməliyyat məbləği ({required_amount}) menecerin icazə verdiyi maksimal həddi ({max_amt}) aşır."
                )

        return payload
