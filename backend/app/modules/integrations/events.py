"""Kənar İnteqrasiyalar Hadisələri (Integrations Events)."""

from __future__ import annotations

from typing import Any

from app.shared.events import DomainEvent


class IntegrationUpdatedEvent(DomainEvent):
    """İnteqrasiya konfiqurasiyası yeniləndikdə baş verir."""

    def __init__(self, key: str, diff: dict[str, Any] | None = None) -> None:
        super().__init__(
            event_type="integrations.updated",
            aggregate_type="integration",
            aggregate_id=key,
            payload={
                "key": key,
                "diff": diff or {},
            },
        )


class IntegrationVerifiedEvent(DomainEvent):
    """İnteqrasiya uğurla yoxlanıldıqda və ACTIVE vəziyyətə keçdikdə baş verir."""

    def __init__(self, key: str, status: str) -> None:
        super().__init__(
            event_type="integrations.verified",
            aggregate_type="integration",
            aggregate_id=key,
            payload={
                "key": key,
                "status": status,
            },
        )


class IntegrationErrorEvent(DomainEvent):
    """İnteqrasiya əlaqəsində xəta baş verdikdə baş verir."""

    def __init__(self, key: str, error_message: str) -> None:
        super().__init__(
            event_type="integrations.error",
            aggregate_type="integration",
            aggregate_id=key,
            payload={
                "key": key,
                "error_message": error_message,
            },
        )
