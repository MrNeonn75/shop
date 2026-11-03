"""Əmək Haqqı (Payroll) Siyasətləri və SoD Qaydaları (Policies).

Qaydalar:
- SoD: Maaş cədvəlini hazırlayan (preparer) şəxs onu özü təsdiq (approver) edə bilməz.
- Həssas əmək haqqı rəqəmlərinə çıxış yalnız səlahiyyətli rollara icazə verilir.
- Filial səviyyəsində məlumat çıxışı (Branch scoping).
"""

from __future__ import annotations

import uuid
from typing import Any

from app.core.errors import BusinessRuleViolationError, ForbiddenError


class PayrollPolicy:
    """Əmək haqqı üzrə icazə və SoD qaydaları."""

    @staticmethod
    def _has_permission(actor: Any, permission: str) -> bool:
        roles = getattr(actor, "roles", []) or []
        perms = getattr(actor, "permissions", []) or []
        return "system_admin" in roles or permission in perms

    @classmethod
    def check_can_view_profile(cls, actor: Any) -> None:
        if not (cls._has_permission(actor, "payroll.profile.view") or cls._has_permission(actor, "hr.salary.view")):
            raise ForbiddenError("Maaş profillərinə baxış hüququnuz yoxdur (payroll.profile.view).")

    @classmethod
    def check_can_manage_profile(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "payroll.profile.manage"):
            raise ForbiddenError("Maaş profillərini idarə etmək hüququnuz yoxdur (payroll.profile.manage).")

    @classmethod
    def check_can_manage_rules(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "payroll.rules.manage"):
            raise ForbiddenError("Maaş qaydalarını idarə etmək hüququnuz yoxdur (payroll.rules.manage).")

    @classmethod
    def check_can_view_run(cls, actor: Any) -> None:
        if not (cls._has_permission(actor, "payroll.run.view") or cls._has_permission(actor, "hr.salary.view")):
            raise ForbiddenError("Maaş hesablama dövrlərinə baxış hüququnuz yoxdur (payroll.run.view).")

    @classmethod
    def check_can_create_run(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "payroll.run.create"):
            raise ForbiddenError("Maaş hesablama sənədi yaratmaq hüququnuz yoxdur (payroll.run.create).")

    @classmethod
    def check_can_approve_run(cls, actor: Any, prepared_by: uuid.UUID | None) -> None:
        # SoD: Preparer != Approver
        actor_id = getattr(actor, "id", None)
        if actor_id and prepared_by and actor_id == prepared_by:
            roles = getattr(actor, "roles", []) or []
            if "system_admin" not in roles:
                raise BusinessRuleViolationError(
                    "SoD Qaydası: Maaş layihəsini hazırlayan şəxs onu özü təsdiq edə bilməz."
                )
        if not cls._has_permission(actor, "payroll.run.approve"):
            raise ForbiddenError("Maaş cədvəlini təsdiqləmək hüququnuz yoxdur (payroll.run.approve).")

    @classmethod
    def check_can_finalize_run(cls, actor: Any) -> None:
        if not (cls._has_permission(actor, "payroll.run.finalize") or cls._has_permission(actor, "hr.salary.finalize")):
            raise ForbiddenError("Maaş cədvəlini yekunlaşdırmaq hüququnuz yoxdur (payroll.run.finalize).")

    @classmethod
    def check_can_pay_run(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "payroll.run.pay"):
            raise ForbiddenError("Maaşları ödənişə göndərmək hüququnuz yoxdur (payroll.run.pay).")

    @classmethod
    def check_can_view_all_payslips(cls, actor: Any) -> None:
        if not (cls._has_permission(actor, "payroll.payslip.view") or cls._has_permission(actor, "hr.salary.view")):
            raise ForbiddenError("Maaş vərəqələrinə baxış hüququnuz yoxdur (payroll.payslip.view).")

    @classmethod
    def check_can_export(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "payroll.export"):
            raise ForbiddenError("Maaş və bank fayllarını ixrac etmək hüququnuz yoxdur (payroll.export).")

    @classmethod
    def check_branch_scope(cls, actor: Any, branch_id: uuid.UUID | None) -> None:
        if branch_id is None:
            return
        roles = getattr(actor, "roles", []) or []
        perms = getattr(actor, "permissions", []) or []
        if (
            "system_admin" in roles
            or "general_manager" in roles
            or "hr_manager" in roles
            or "accountant" in roles
            or "system.branches.all" in perms
        ):
            return
        allowed_branches = getattr(actor, "allowed_branches", []) or []
        if branch_id not in allowed_branches:
            raise ForbiddenError("Bu filialın maliyyə/əməkhaqqı məlumatlarına çıxış icazəniz yoxdur.")
