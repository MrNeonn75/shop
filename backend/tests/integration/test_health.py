"""Sağlamlıq və Monitorinq İnteqrasiya Testləri (Health Probes).

Liveness, Readiness və Admin Diaqnostika endpoint-ləri.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_health_live(client: AsyncClient) -> None:
    res = await client.get("/health/live")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "alive"
    assert "timestamp" in data
    assert "app" in data


@pytest.mark.asyncio
async def test_health_ready(client: AsyncClient) -> None:
    res = await client.get("/health/ready")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ready"
    assert "checks" in data
    assert "database" in data["checks"]


@pytest.mark.asyncio
async def test_health_details(client: AsyncClient) -> None:
    res = await client.get("/health/details")
    assert res.status_code == 200
    data = res.json()
    assert "queue" in data
    assert "last_backup" in data
    assert "integrations" in data


@pytest.mark.asyncio
async def test_health_details_with_backup_and_outbox(
    client: AsyncClient, session: AsyncSession
) -> None:
    from app.core.database import utc_now
    from app.shared.backup_model import BackupRecord
    from app.shared.outbox import OutboxEvent

    b = BackupRecord(
        backup_type="full",
        started_at=utc_now(),
        completed_at=utc_now(),
        status="SUCCESS",
        size_bytes=1024,
        checksum="dummy_checksum",
    )
    session.add(b)
    outbox = OutboxEvent(
        event_type="test.event",
        aggregate_type="test",
        aggregate_id="1",
        payload={},
        correlation_id="cid-1",
        status="PENDING",
        created_at=utc_now(),
    )
    session.add(outbox)
    await session.commit()

    res = await client.get("/health/details")
    assert res.status_code == 200
    data = res.json()
    assert data["last_backup"]["status"] == "SUCCESS"
    assert data["queue"]["pending_outbox_events"] >= 1
