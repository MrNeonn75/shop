"""Biznes İntellekti və İdarəetmə Paneli Giriş Hüquqları (Analytics Policies)."""

from __future__ import annotations

from typing import Any

from app.core.errors import ForbiddenError


class AnalyticsPolicy:
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
    def check_can_view_bi(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "bi.view"):
            raise ForbiddenError("Biznes intellekti və qabaqcıl analitikaya baxış hüququnuz yoxdur (bi.view).")

    @classmethod
    def check_can_manage_targets(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "bi.targets.manage"):
            raise ForbiddenError("Satış hədəflərini idarə etmək hüququnuz yoxdur (bi.targets.manage).")

    @classmethod
    def check_can_view_dashboard(cls, actor: Any, role_variant: str = "executive") -> None:
        perm_map = {
            "executive": "dashboard.view.executive",
            "branch": "dashboard.view.branch",
            "cashier": "dashboard.view.cashier",
            "inventory": "dashboard.view.inventory",
            "finance": "dashboard.view.finance",
        }
        req_perm = perm_map.get(role_variant, "dashboard.view.executive")
        if not cls._has_permission(actor, req_perm):
            # Əgər ən azı hər hansı bir dashboard icazəsi varsa icazə veririk
            any_dash = any(cls._has_permission(actor, p) for p in perm_map.values())
            if not any_dash:
                raise ForbiddenError(f"İdarəetmə panelinə baxış hüququnuz yoxdur ({req_perm}).")

