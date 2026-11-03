"""Bildirişlər Modulu Domen Hadisələri (Notification Events)."""

from __future__ import annotations

import uuid
from typing import Any

from app.shared.events import DomainEvent


class NotificationCreatedEvent(DomainEvent):
    """Yeni istifadəçi bildirişi yaradıldıqda yayımlanan hadisə."""

    def __init__(
        self,
        notification_id: uuid.UUID,
        recipient_user_id: uuid.UUID,
        category: str,
        severity: str,
        title: str,
        deep_link: str | None = None,
        branch_id: uuid.UUID | None = None,
        correlation_id: str | None = None,
    ) -> None:
        payload = {
            "notification_id": str(notification_id),
            "recipient_user_id": str(recipient_user_id),
            "category": category,
            "severity": severity,
            "title": title,
            "deep_link": deep_link,
            "branch_id": str(branch_id) if branch_id else None,
        }
        kwargs: dict[str, Any] = {
            "event_type": "notification.created",
            "aggregate_type": "notification",
            "aggregate_id": str(notification_id),
            "payload": payload,
        }
        if correlation_id:
            kwargs["correlation_id"] = correlation_id
        super().__init__(**kwargs)

