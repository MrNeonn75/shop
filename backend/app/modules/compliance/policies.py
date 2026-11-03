"""Compliance icazə yoxlamaları."""

from __future__ import annotations

from typing import Any

from app.core.errors import ForbiddenError


class CompliancePolicy:
    """compliance.* permission checks."""

    @staticmethod
    def _has_permission(actor: Any, permission: str) -> bool:
        if actor is None:
            return False
        roles = getattr(actor, "roles", []) or []
        perms = getattr(actor, "permissions", []) or []
        return "system_admin" in roles or permission in perms

    @classmethod
    def check_rules_view(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "compliance.rules.view"):
            raise ForbiddenError("Qaydalara baxış hüququnuz yoxdur (compliance.rules.view).")

    @classmethod
    def check_rules_edit(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "compliance.rules.edit"):
            raise ForbiddenError("Qaydaları redaktə hüququnuz yoxdur (compliance.rules.edit).")

    @classmethod
    def check_rules_verify(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "compliance.rules.verify"):
            raise ForbiddenError("Qaydaları yoxlamaq hüququnuz yoxdur (compliance.rules.verify).")

    @classmethod
    def check_rules_activate(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "compliance.rules.activate"):
            raise ForbiddenError(
                "Qayda paketini aktivləşdirmək hüququnuz yoxdur (compliance.rules.activate)."
            )

    @classmethod
    def check_obligations_manage(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "compliance.obligations.manage"):
            raise ForbiddenError(
                "Öhdəlikləri idarə etmək hüququnuz yoxdur (compliance.obligations.manage)."
            )

    @classmethod
    def check_privacy_manage(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "compliance.privacy.manage"):
            raise ForbiddenError(
                "Məxfilik qeydlərini idarə etmək hüququnuz yoxdur (compliance.privacy.manage)."
            )

    @classmethod
    def check_register_view(cls, actor: Any) -> None:
        if not (
            cls._has_permission(actor, "compliance.register.view")
            or cls._has_permission(actor, "compliance.rules.view")
        ):
            raise ForbiddenError(
                "Reyestrə baxış hüququnuz yoxdur (compliance.register.view)."
            )

    @classmethod
    def check_fiscal_manage(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "compliance.fiscal.manage"):
            raise ForbiddenError(
                "Fiskal uyğunluğu idarə etmək hüququnuz yoxdur (compliance.fiscal.manage)."
            )

    @classmethod
    def check_export(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "compliance.export"):
            raise ForbiddenError("Uyğunluq ixracı hüququnuz yoxdur (compliance.export).")
