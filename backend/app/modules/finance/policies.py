"""Maliyyə Siyasəti, İcazələr və Vəzifələrin Bölünməsi (Finance Policies)."""

from __future__ import annotations

import uuid
from typing import Any

from app.core.errors import BusinessRuleViolationError, ForbiddenError, ValidationError

ALLOWED_ATTACHMENT_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
}
MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


class FinancePolicy:
    """Maliyyə modulu üzrə təhlükəsizlik, icazə və SoD qaydaları."""

    @staticmethod
    def _has_permission(actor: Any, permission: str) -> bool:
        roles = getattr(actor, "roles", []) or []
        perms = getattr(actor, "permissions", []) or []
        return "system_admin" in roles or permission in perms

    @classmethod
    def check_can_view_account(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "finance.account.view"):
            raise ForbiddenError("Maliyyə hesablarına baxış hüququnuz yoxdur (finance.account.view).")

    @classmethod
    def check_can_manage_account(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "finance.account.manage"):
            raise ForbiddenError("Maliyyə hesablarını idarə etmək hüququnuz yoxdur (finance.account.manage).")

    @classmethod
    def check_can_transfer(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "finance.cash.transfer"):
            raise ForbiddenError("Pul köçürməsi aparmaq hüququnuz yoxdur (finance.cash.transfer).")

    @classmethod
    def check_can_create_expense(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "finance.expense.create"):
            raise ForbiddenError("Xərc sənədi yaratmaq hüququnuz yoxdur (finance.expense.create).")

    @classmethod
    def check_can_approve_expense(cls, actor: Any, expense_creator_id: uuid.UUID) -> None:
        if not cls._has_permission(actor, "finance.expense.approve"):
            raise ForbiddenError("Xərc sənədlərini təsdiqləmək hüququnuz yoxdur (finance.expense.approve).")
        # Segregation of Duties (SoD)
        actor_id = getattr(actor, "id", None)
        if actor_id and actor_id == expense_creator_id:
            roles = getattr(actor, "roles", []) or []
            if "system_admin" not in roles:
                raise BusinessRuleViolationError(
                    "Vəzifələrin Bölünməsi (SoD) Qaydası: Xərc sənədini tərtib edən şəxs onu özü təsdiq edə bilməz."
                )

    @classmethod
    def check_can_pay_expense(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "finance.expense.pay"):
            raise ForbiddenError("Xərci ödəmək hüququnuz yoxdur (finance.expense.pay).")

    @classmethod
    def check_can_reverse_expense(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "finance.expense.reverse"):
            raise ForbiddenError("Xərci ləğv/tərs əməliyyat etmək hüququnuz yoxdur (finance.expense.reverse).")

    @classmethod
    def check_can_create_income(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "finance.income.create"):
            raise ForbiddenError("Qeyri-satış gəliri yaratmaq hüququnuz yoxdur (finance.income.create).")

    @classmethod
    def check_can_manage_budget(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "finance.budget.manage"):
            raise ForbiddenError("Büdcəni idarə etmək hüququnuz yoxdur (finance.budget.manage).")

    @classmethod
    def check_can_approve_budget(cls, actor: Any, budget_creator_id: uuid.UUID) -> None:
        if not cls._has_permission(actor, "finance.budget.approve"):
            raise ForbiddenError("Büdcəni təsdiqləmək hüququnuz yoxdur (finance.budget.approve).")
        # SoD
        actor_id = getattr(actor, "id", None)
        if actor_id and actor_id == budget_creator_id:
            roles = getattr(actor, "roles", []) or []
            if "system_admin" not in roles:
                raise BusinessRuleViolationError(
                    "Vəzifələrin Bölünməsi (SoD) Qaydası: Büdcəni tərtib edən şəxs onu özü təsdiq edə bilməz."
                )

    @classmethod
    def check_can_run_reconciliation(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "finance.reconciliation.run"):
            raise ForbiddenError("Üzləşmə əməliyyatlarını icra etmək hüququnuz yoxdur (finance.reconciliation.run).")

    @classmethod
    def check_can_close_period(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "finance.period.close"):
            raise ForbiddenError("Maliyyə dövrünü bağlamaq hüququnuz yoxdur (finance.period.close).")

    @classmethod
    def check_can_reopen_period(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "finance.period.reopen"):
            raise ForbiddenError("Bağlanmış maliyyə dövrünü yenidən açmaq hüququnuz yoxdur (finance.period.reopen).")

    @classmethod
    def check_can_view_gl(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "finance.gl.view"):
            raise ForbiddenError("Baş Mühasibat Kitabına (GL) baxış hüququnuz yoxdur (finance.gl.view).")

    @classmethod
    def check_can_post_gl(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "finance.gl.post"):
            raise ForbiddenError("Baş Kitaba manual qeyd vurmaq hüququnuz yoxdur (finance.gl.post).")

    @classmethod
    def check_can_configure_gl(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "finance.gl.configure"):
            raise ForbiddenError("GL konfiqurasiyası hüququnuz yoxdur (finance.gl.configure).")

    @classmethod
    def check_can_view_report(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "finance.report.view"):
            raise ForbiddenError("Maliyyə hesabatlarına baxış hüququnuz yoxdur (finance.report.view).")

    @classmethod
    def check_can_view_profit(cls, actor: Any) -> None:
        """Həssas mənfəət və maya dəyəri məlumatlarına baxışı məhdudlaşdırır."""
        roles = getattr(actor, "roles", []) or []
        perms = getattr(actor, "permissions", []) or []
        if (
            "system_admin" not in roles
            and "finance.profit.view" not in perms
            and "finance.report.sensitive" not in perms
        ):
            raise ForbiddenError("Həssas mənfəət və maya dəyəri göstəricilərinə baxış hüququnuz yoxdur (finance.profit.view).")

    @classmethod
    def check_can_export(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "finance.export"):
            raise ForbiddenError("Maliyyə məlumatlarını ixrac etmək hüququnuz yoxdur (finance.export).")

    @staticmethod
    def validate_attachments(attachments: list[dict[str, Any]]) -> None:
        """Qoşma faylların format və ölçü tələblərini yoxlayır."""
        for att in attachments:
            mime = att.get("mime_type", "").lower()
            size = att.get("size_bytes", 0)
            if mime not in ALLOWED_ATTACHMENT_MIME_TYPES:
                raise ValidationError(
                    f"Dəstəklənməyən fayl formatı: {mime}. Yalnız PDF və Şəkillər (JPEG, PNG, WebP) qəbul edilir."
                )
            if size > MAX_ATTACHMENT_SIZE_BYTES:
                raise ValidationError(
                    f"Fayl ölçüsü ({size} bayt) maksimal 10 MB həddini aşır."
                )

