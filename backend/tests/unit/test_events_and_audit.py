"""Domen Hadisələri və Audit Jurnalı Testləri (EventBus & Audit)."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import generate_uuid7
from app.shared.audit import AuditEvent, record_audit_event
from app.shared.events import DomainEvent, EventBus


@pytest.mark.asyncio
async def test_event_bus_publish_and_subscribe() -> None:
    bus = EventBus()
    received_events: list[DomainEvent] = []

    async def handler(event: DomainEvent) -> None:
        received_events.append(event)

    bus.subscribe("order.created", handler)

    event = DomainEvent(
        event_type="order.created",
        aggregate_type="orders",
        aggregate_id="ord-001",
        payload={"total": "150.00"},
    )

    await bus.publish(event)
    assert len(received_events) == 1
    assert received_events[0].aggregate_id == "ord-001"

    # Digər hadisə göndərildikdə dinləyici çağırılmamalıdır
    other_event = DomainEvent(
        event_type="other.event",
        aggregate_type="items",
        aggregate_id="it-1",
        payload={},
    )
    await bus.publish(other_event)
    assert len(received_events) == 1


@pytest.mark.asyncio
async def test_record_audit_event(session: AsyncSession) -> None:
    actor_id = generate_uuid7()
    audit = await record_audit_event(
        session=session,
        action="USER_ROLE_UPDATED",
        resource_type="users",
        resource_id=str(actor_id),
        actor_id=actor_id,
        actor_ip="192.168.1.50",
        diff={"before": {"role": "CASHIER"}, "after": {"role": "MANAGER"}},
    )
    await session.commit()

    res = await session.execute(select(AuditEvent).where(AuditEvent.id == audit.id))
    saved = res.scalars().first()
    assert saved is not None
    assert saved.action == "USER_ROLE_UPDATED"
    assert saved.actor_ip == "192.168.1.50"
    assert saved.diff["after"]["role"] == "MANAGER"
