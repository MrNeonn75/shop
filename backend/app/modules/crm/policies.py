"""CRM Modulu Təhlükəsizlik və İcazə Qaydaları (Policies)."""

from __future__ import annotations

from typing import Any

from app.core.errors import ForbiddenError


class CrmPolicy:
    """Müştəri məlumatlarına çıxış və SoD yoxlamaları."""

    @staticmethod
    def _has_permission(actor: Any, permission: str) -> bool:
        if not actor:
            return False
        roles = getattr(actor, "roles", []) or []
        if "system_admin" in roles:
            return True
        perms = getattr(actor, "permissions", []) or []
        return permission in perms

    @classmethod
    def check_can_view(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "crm.customer.view"):
            raise ForbiddenError("Müştəri siyahısını görmək hüququnuz yoxdur (crm.customer.view).")

    @classmethod
    def check_can_manage(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "crm.customer.manage"):
            raise ForbiddenError("Müştəri məlumatlarını redaktə etmək hüququnuz yoxdur (crm.customer.manage).")

    @classmethod
    def check_can_view_pii(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "crm.pii.view"):
            raise ForbiddenError("Maskalanmamış fərdi məlumatları görmək hüququnuz yoxdur (crm.pii.view).")

    @classmethod
    def check_can_merge(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "crm.customer.merge"):
            raise ForbiddenError("Müştəri profillərini birləşdirmək hüququnuz yoxdur (crm.customer.merge).")

    @classmethod
    def check_can_manage_consent(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "crm.consent.manage"):
            raise ForbiddenError("Müştəri razılıqlarını idarə etmək hüququnuz yoxdur (crm.consent.manage).")

    @classmethod
    def check_can_manage_segments(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "crm.segment.manage"):
            raise ForbiddenError("Müştəri seqmentlərini idarə etmək hüququnuz yoxdur (crm.segment.manage).")

    @classmethod
    def check_can_export(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "crm.export"):
            raise ForbiddenError("Müştəri məlumatlarını ixrac etmək hüququnuz yoxdur (crm.export).")

    @classmethod
    def check_can_process_privacy(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "crm.privacy.process"):
            raise ForbiddenError("Məxfilik və silinmə sorğularını icra etmək hüququnuz yoxdur (crm.privacy.process).")

