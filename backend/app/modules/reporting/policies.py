"""Hesabatlılıq Modulu Giriş Hüquqları və Maskalama Qaydaları (Policies)."""

from __future__ import annotations

from typing import Any

from app.core.errors import ForbiddenError
from app.modules.reporting.report_registry import ReportColumn, ReportDefinition


class ReportingPolicy:
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
    def can_view_cost(cls, actor: Any) -> bool:
        return cls._has_permission(actor, "reports.cost.view")

    @classmethod
    def can_view_profit(cls, actor: Any) -> bool:
        return cls._has_permission(actor, "reports.profit.view")

    @classmethod
    def can_view_salary(cls, actor: Any) -> bool:
        return cls._has_permission(actor, "hr.salary.view")

    @classmethod
    def check_can_view_report(cls, actor: Any, report_def: ReportDefinition) -> None:
        """İstifadəçinin konkret hesabata baxış hüququnu yoxlayır."""
        for req_perm in report_def.required_permissions:
            if not cls._has_permission(actor, req_perm):
                raise ForbiddenError(
                    f"Bu hesabatı görmək üçün '{req_perm}' hüququnuz tələb olunur."
                )

    @classmethod
    def check_can_export(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "reports.export"):
            raise ForbiddenError("Hesabat məlumatlarını ixrac etmək hüququnuz yoxdur (reports.export).")

    @classmethod
    def check_can_manage_schedules(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "reports.schedule.manage"):
            raise ForbiddenError("Hesabat çatdırılma cədvəlini idarə etmək hüququnuz yoxdur (reports.schedule.manage).")

    @classmethod
    def check_can_use_builder(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "reports.builder.use"):
            raise ForbiddenError("Hesabat konstruktorundan istifadə hüququnuz yoxdur (reports.builder.use).")

    @classmethod
    def check_can_share_builder(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "reports.builder.share"):
            raise ForbiddenError("Konstruktor şablonlarını paylaşmaq hüququnuz yoxdur (reports.builder.share).")

    @classmethod
    def filter_and_mask_columns(
        cls, columns: list[ReportColumn], actor: Any
    ) -> list[ReportColumn]:
        """İstifadəçinin hüququ çatmayan həssas sütunları maskalanmış və ya çıxarılmış edir."""
        has_cost = cls.can_view_cost(actor)
        has_profit = cls.can_view_profit(actor)
        has_salary = cls.can_view_salary(actor)

        safe_cols: list[ReportColumn] = []
        for col in columns:
            if col.masked_by_permission == "reports.cost.view" and not has_cost:
                continue
            if col.masked_by_permission == "reports.profit.view" and not has_profit:
                continue
            if col.masked_by_permission == "hr.salary.view" and not has_salary:
                continue
            safe_cols.append(col)
        return safe_cols

    @classmethod
    def get_visible_column_keys(
        cls, actor: Any, report_def: ReportDefinition
    ) -> set[str]:
        """İstifadəçi üçün görünən sütun açarlarının çoxluğunu qaytarır."""
        cols = cls.filter_and_mask_columns(report_def.columns, actor)
        return {c.key for c in cols}

    @classmethod
    def sanitize_rows(
        cls, rows: list[dict[str, Any]], visible_column_keys: set[str]
    ) -> list[dict[str, Any]]:
        """Sətirlərdən istifadəçiyə görünməməli olan məlumatları silir."""
        sanitized: list[dict[str, Any]] = []
        for r in rows:
            clean_row = {k: v for k, v in r.items() if k in visible_column_keys}
            sanitized.append(clean_row)
        return sanitized
