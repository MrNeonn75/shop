"""İşçi və Telemetriya Testləri (Worker & Telemetry)."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.telemetry import setup_telemetry
from app.worker import (
    cleanup_expired_records,
    dispatch_single_event,
    shutdown,
    startup,
)


@pytest.mark.asyncio
async def test_worker_lifecycle_functions(session: AsyncSession) -> None:
    ctx = {}
    await startup(ctx)
    await shutdown(ctx)

    # dispatch_single_event
    await dispatch_single_event(session, uuid.uuid4(), "ping.recorded", {"ping_id": "1", "message": "hello"})
    await dispatch_single_event(session, uuid.uuid4(), "custom.event", {"data": 123})


@pytest.mark.asyncio
async def test_worker_cleanup_expired_records(session: AsyncSession) -> None:
    deleted = await cleanup_expired_records()
    assert isinstance(deleted, int)


def test_setup_telemetry() -> None:
    # Boş olduqda
    settings.SENTRY_DSN = None
    settings.OPENTELEMETRY_ENDPOINT = None
    setup_telemetry()

    # Opentelemetry quraşdırılması
    settings.OPENTELEMETRY_ENDPOINT = "http://otel:4317"
    setup_telemetry()
    settings.OPENTELEMETRY_ENDPOINT = None
