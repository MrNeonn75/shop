"""Ping Modulu Domen Hadisələri."""

from __future__ import annotations

import uuid

from app.core.ids import generate_uuid7
from app.shared.events import DomainEvent


def create_ping_recorded_event(
    ping_id: uuid.UUID | None = None,
    message: str = "",
    client_ip: str | None = None,
    branch_id: uuid.UUID | None = None,
) -> DomainEvent:
    actual_id = ping_id or generate_uuid7()
    return DomainEvent(
        event_type="ping.recorded",
        aggregate_type="ping_logs",
        aggregate_id=str(actual_id),
        payload={
            "ping_id": str(actual_id),
            "message": message,
            "client_ip": client_ip,
            "branch_id": str(branch_id) if branch_id else None,
        },
    )
