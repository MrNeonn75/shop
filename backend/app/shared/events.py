"""Daxili Domen Hadisələri Şini (In-Process Domain Event Bus).

Eyni proses daxilində sinxron/asinxron hadisə yayımı və dinləyicilərin qeydiyyatı.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.core.database import utc_now
from app.core.errors import get_current_correlation_id
from app.core.ids import generate_uuid7
from app.core.logging import logger


@dataclass(frozen=True, slots=True)
class DomainEvent:
    """Bütün domen hadisələrinin baza sinfi."""

    event_type: str
    aggregate_type: str
    aggregate_id: str
    payload: dict[str, Any]
    event_id: uuid.UUID = field(default_factory=generate_uuid7)
    correlation_id: str = field(default_factory=get_current_correlation_id)
    occurred_at: datetime = field(default_factory=utc_now)


EventHandler = Callable[[DomainEvent], Awaitable[None]]


class EventBus:
    """Asinxron in-process hadisə şini."""

    def __init__(self) -> None:
        self._subscribers: dict[str, list[EventHandler]] = defaultdict(list)

    def subscribe(self, event_type: str, handler: EventHandler) -> None:
        """Müəyyən hadisə tipinə dinləyici qeydiyyatdan keçirir."""
        self._subscribers[event_type].append(handler)

    async def publish(self, event: DomainEvent) -> None:
        """Hadisəni bütün qeydiyyatdan keçmiş dinləyicilərə çatdırır."""
        handlers = self._subscribers.get(event.event_type, [])
        # Həmçinin qlobal wildcard dinləyicilərə çatdırır
        wildcard_handlers = self._subscribers.get("*", [])

        all_handlers = handlers + wildcard_handlers
        if not all_handlers:
            return

        for handler in all_handlers:
            try:
                await handler(event)
            except Exception as exc:
                logger.error(
                    "Domen hadisəsi emal edilərkən xəta baş verdi",
                    event_type=event.event_type,
                    event_id=str(event.event_id),
                    error=str(exc),
                )


# Qlobal hadisə şini singleton nüsxəsi
event_bus = EventBus()
