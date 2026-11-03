"""Transactional Outbox İnteqrasiya Testləri.

Hadisənin UoW tranzaksiyasında qeydə alınması, rollback zamanı ləğv edilməsi
və arxa plan işçisi tərəfindən emalı.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.uow import unit_of_work
from app.modules.ping.events import create_ping_recorded_event
from app.shared.outbox import OutboxEvent, record_outbox_event
from app.worker import dispatch_outbox_batch


@pytest.mark.asyncio
async def test_outbox_event_persisted_in_transaction(session: AsyncSession) -> None:
    event = create_ping_recorded_event(
        ping_id=None,
        message="Outbox Test Hadisəsi",
        client_ip="127.0.0.1",
    )

    async with unit_of_work() as uow:
        await record_outbox_event(uow.session, event)
        # Commit avtomatik baş verir

    # Hadisə bazada PENDING statusunda olmalıdır
    res = await session.execute(select(OutboxEvent).where(OutboxEvent.id == event.event_id))
    saved_event = res.scalars().first()
    assert saved_event is not None
    assert saved_event.status == "PENDING"
    assert saved_event.payload["message"] == "Outbox Test Hadisəsi"


@pytest.mark.asyncio
async def test_outbox_worker_dispatches_events(session: AsyncSession) -> None:
    event = create_ping_recorded_event(
        ping_id=None,
        message="Worker Emal Hadisəsi",
    )

    async with unit_of_work() as uow:
        await record_outbox_event(uow.session, event)

    # İşçini çağırırıq
    count = await dispatch_outbox_batch()
    assert count >= 1

    # Status PROCESSED və ya DONE olmalıdır
    res = await session.execute(select(OutboxEvent).where(OutboxEvent.id == event.event_id))
    processed_event = res.scalars().first()
    assert processed_event is not None
    assert processed_event.status in ["PROCESSED", "DONE"]
    assert processed_event.processed_at is not None


@pytest.mark.asyncio
async def test_outbox_mark_failed(session: AsyncSession) -> None:
    from app.shared.outbox import mark_outbox_event_failed

    event = create_ping_recorded_event(message="Fail test")
    async with unit_of_work() as uow:
        await record_outbox_event(uow.session, event)

    for i in range(5):
        await mark_outbox_event_failed(session, event.event_id, f"Error {i}")

    res = await session.execute(select(OutboxEvent).where(OutboxEvent.id == event.event_id))
    rec = res.scalars().first()
    assert rec is not None
    assert rec.status in ["FAILED", "DEAD"]
    assert rec.retry_count == 5
    assert rec.last_error == "Error 4"
