"""Loyallıq Modulu Təhlükəsizlik və İcazə Qaydaları (Policies)."""

from __future__ import annotations

from typing import Any

from app.core.errors import ForbiddenError


class LoyaltyPolicy:
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
    def check_can_manage_program(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "loyalty.program.manage"):
            raise ForbiddenError("Loyallıq proqramını idarə etmək hüququnuz yoxdur (loyalty.program.manage).")

    @classmethod
    def check_can_adjust_points(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "loyalty.points.adjust"):
            raise ForbiddenError("Xalları manual tənzimləmək hüququnuz yoxdur (loyalty.points.adjust).")

    @classmethod
    def check_can_manage_rewards(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "loyalty.reward.manage"):
            raise ForbiddenError("Mükafatlar kataloqunu idarə etmək hüququnuz yoxdur (loyalty.reward.manage).")

