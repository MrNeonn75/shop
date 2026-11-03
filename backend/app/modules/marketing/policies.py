"""Marketinq Modulu Təhlükəsizlik və SoD Qaydaları (Policies)."""

from __future__ import annotations

import uuid
from typing import Any

from app.core.errors import BusinessRuleViolationError, ForbiddenError


class MarketingPolicy:
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
    def check_can_view_campaigns(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "marketing.campaign.view"):
            raise ForbiddenError("Kampaniyalara baxış hüququnuz yoxdur (marketing.campaign.view).")

    @classmethod
    def check_can_create_campaign(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "marketing.campaign.create"):
            raise ForbiddenError("Kampaniya yaratmaq hüququnuz yoxdur (marketing.campaign.create).")

    @classmethod
    def check_can_approve_campaign(cls, actor: Any, created_by: uuid.UUID) -> None:
        # SoD yoxlanışı: Kampaniyanı yaradan şəxs onu özü təsdiq edə bilməz!
        actor_id = getattr(actor, "id", None)
        if actor_id and actor_id == created_by:
            raise BusinessRuleViolationError(
                code="SOD_VIOLATION_SELF_APPROVAL",
                message="Kampaniyanı yaradan şəxs onu özü təsdiq edə bilməz (SoD).",
            )
        if not cls._has_permission(actor, "marketing.campaign.approve"):
            raise ForbiddenError("Kampaniyanı təsdiq etmək hüququnuz yoxdur (marketing.campaign.approve).")

    @classmethod
    def check_can_manage_promotions(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "marketing.promotion.manage"):
            raise ForbiddenError("Aksiya qaydalarını idarə etmək hüququnuz yoxdur (marketing.promotion.manage).")

    @classmethod
    def check_can_manage_promocodes(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "marketing.promocode.manage"):
            raise ForbiddenError("Promokodları idarə etmək hüququnuz yoxdur (marketing.promocode.manage).")

    @classmethod
    def check_can_send_messages(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "marketing.message.send"):
            raise ForbiddenError("Bildiriş göndərmək hüququnuz yoxdur (marketing.message.send).")

    @classmethod
    def check_can_simulate(cls, actor: Any) -> None:
        if not cls._has_permission(actor, "marketing.simulate"):
            raise ForbiddenError("Simulyasiya hüququnuz yoxdur (marketing.simulate).")

