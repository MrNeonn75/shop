"""HR Modulu Təhlükəsizlik Siyasəti və İcazələr (HR Policies).

İşçi məlumatları, cədvəl, davamiyyət və məzuniyyət icazələri,
branch-scoping və PII məlumatlarının açılması üçün sərt audit qaydaları.
"""

from __future__ import annotations

import uuid
from typing import Any

from app.core.errors import BusinessRuleViolationError, ForbiddenError


class HRPolicy:
    """HR modulu üzrə təhlükəsizlik, icazə və SoD qaydaları."""

    @staticmethod
    def _has_permission(actor: Any, permission: str) -> bool:
        roles = getattr(actor, "roles", []) or []
        perms = getattr(actor, "permissions", []) or []
        return "system_admin" in roles or permission in perms

    @classmethod
    def check_can_view_employee(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "hr.employee.view"):
            raise ForbiddenError("İşçilərin siyahısına baxış hüququnuz yoxdur (hr.employee.view).")

    @classmethod
    def check_can_manage_employee(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "hr.employee.manage"):
            raise ForbiddenError("İşçi heyətini idarə etmək hüququnuz yoxdur (hr.employee.manage).")

    @classmethod
    def check_can_reveal_pii(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "hr.pii.view"):
            raise ForbiddenError(
                "Həssas fərdi məlumatları (PII) açmaq hüququnuz yoxdur (hr.pii.view)."
            )

    @classmethod
    def check_can_view_schedule(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "hr.schedule.view"):
            raise ForbiddenError("İş cədvəllərinə baxış hüququnuz yoxdur (hr.schedule.view).")

    @classmethod
    def check_can_manage_schedule(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "hr.schedule.manage"):
            raise ForbiddenError("İş cədvəlini idarə etmək hüququnuz yoxdur (hr.schedule.manage).")

    @classmethod
    def check_can_view_attendance(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "hr.attendance.view"):
            raise ForbiddenError("Davamiyyət qeydlərinə baxış hüququnuz yoxdur (hr.attendance.view).")

    @classmethod
    def check_can_record_attendance(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "hr.attendance.record"):
            raise ForbiddenError("Davamiyyət qeydi vurmaq hüququnuz yoxdur (hr.attendance.record).")

    @classmethod
    def check_can_correct_attendance(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "hr.attendance.correct"):
            raise ForbiddenError("Davamiyyətə düzəliş etmək hüququnuz yoxdur (hr.attendance.correct).")

    @classmethod
    def check_can_view_timesheet(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "hr.timesheet.view"):
            raise ForbiddenError("Tabel qeydlərinə baxış hüququnuz yoxdur (hr.timesheet.view).")

    @classmethod
    def check_can_manage_timesheet(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "hr.timesheet.manage"):
            raise ForbiddenError("Tabeli təsdiqləmək və kilidləmək hüququnuz yoxdur (hr.timesheet.manage).")

    @classmethod
    def check_can_reopen_timesheet(cls, actor: Any, locking_user_id: uuid.UUID | None) -> None:
        if not cls._has_permission(actor, "hr.timesheet.reopen"):
            raise ForbiddenError("Kilidlənmiş tabeli yenidən açmaq hüququnuz yoxdur (hr.timesheet.reopen).")
        # SoD: Tabeli kilidləyən şəxs təkbaşına onu yenidən aça bilməz
        actor_id = getattr(actor, "id", None)
        if actor_id and locking_user_id and actor_id == locking_user_id:
            roles = getattr(actor, "roles", []) or []
            if "system_admin" not in roles:
                raise BusinessRuleViolationError(
                    "SoD Qaydası: Tabeli kilidləyən istifadəçi onu təkbaşına yenidən aça bilməz."
                )

    @classmethod
    def check_can_request_leave(cls, actor: Any, target_employee_user_id: uuid.UUID | None) -> None:
        actor_id = getattr(actor, "id", None)
        # İstifadəçi özü üçün sorğu verirsə, icazə verilir
        if actor_id and target_employee_user_id and actor_id == target_employee_user_id:
            return
        if not cls._has_permission(actor, "hr.leave.request"):
            raise ForbiddenError("Məzuniyyət sorğusu vermək hüququnuz yoxdur (hr.leave.request).")

    @classmethod
    def check_can_approve_leave(cls, actor: Any, applicant_user_id: uuid.UUID | None) -> None:
        # SoD: Heç kim öz məzuniyyətini özü təsdiq edə bilməz
        actor_id = getattr(actor, "id", None)
        if actor_id and applicant_user_id and actor_id == applicant_user_id:
            roles = getattr(actor, "roles", []) or []
            if "system_admin" not in roles:
                raise BusinessRuleViolationError(
                    "SoD Qaydası: İşçi öz məzuniyyət sorğusunu özü təsdiq edə bilməz."
                )
        if not cls._has_permission(actor, "hr.leave.approve"):
            raise ForbiddenError("Məzuniyyət sorğularını təsdiq etmək hüququnuz yoxdur (hr.leave.approve).")

    @classmethod
    def check_can_view_leave_ledger(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "hr.leave.ledger.view"):
            raise ForbiddenError("Məzuniyyət jurnalına baxış hüququnuz yoxdur (hr.leave.ledger.view).")

    @classmethod
    def check_can_adjust_leave_ledger(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "hr.leave.ledger.adjust"):
            raise ForbiddenError("Məzuniyyət jurnalına düzəliş etmək hüququnuz yoxdur (hr.leave.ledger.adjust).")

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
            or "system.branches.all" in perms
        ):
            return
        allowed_branches = getattr(actor, "allowed_branches", []) or []
        if branch_id not in allowed_branches:
            raise ForbiddenError("Bu filialın məlumatlarına çıxış icazəniz yoxdur.")
