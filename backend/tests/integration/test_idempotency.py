"""İdempotentlik İnteqrasiya Testləri (Idempotency Integration Tests).

Replay keşlənməsi, payload uyğunsuzluğunda 422 xətası və in-flight 409 xətası.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.idempotency import IdempotencyRecord


@pytest.mark.asyncio
async def test_idempotent_post_success_and_replay(client: AsyncClient) -> None:
    headers = {"Idempotency-Key": "test-key-001"}
    payload = {"message": "İlkin sorğu", "branch_id": None}

    # 1. İlkin sorğu
    res1 = await client.post("/api/v1/ping", json=payload, headers=headers)
    assert res1.status_code == 201
    data1 = res1.json()
    assert data1["message"] == "İlkin sorğu"
    assert "X-Idempotent-Replay" not in res1.headers

    # 2. Eyni açar və eyni payload ilə təkrar sorğu (Replay)
    res2 = await client.post("/api/v1/ping", json=payload, headers=headers)
    assert res2.status_code == 201
    data2 = res2.json()
    assert data2["id"] == data1["id"]
    assert res2.headers.get("x-idempotent-replay") == "true"


@pytest.mark.asyncio
async def test_idempotent_post_payload_mismatch_returns_422(client: AsyncClient) -> None:
    headers = {"Idempotency-Key": "test-key-mismatch"}
    payload1 = {"message": "Birinci mətn"}
    payload2 = {"message": "Fərqli mətn"}

    res1 = await client.post("/api/v1/ping", json=payload1, headers=headers)
    assert res1.status_code == 201

    # Eyni açar, amma fərqli payload
    res2 = await client.post("/api/v1/ping", json=payload2, headers=headers)
    assert res2.status_code == 422
    err_data = res2.json()
    assert err_data["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_idempotent_in_flight_returns_409(client: AsyncClient, session: AsyncSession) -> None:
    # Bazaya süni olaraq IN_PROGRESS qeydi yerləşdiririk
    record = IdempotencyRecord(
        key="test-key-in-flight",
        scope="POST:/api/v1/ping",
        user_id=None,
        request_hash="somehash123",
        status="IN_PROGRESS",
        expires_at=utc_now() + timedelta(minutes=5),
    )
    session.add(record)
    await session.commit()

    headers = {"Idempotency-Key": "test-key-in-flight"}
    payload = {"message": "Gözləmədə olan"}

    res = await client.post("/api/v1/ping", json=payload, headers=headers)
    assert res.status_code == 409
    err = res.json()["error"]
    assert err["code"] == "IDEMPOTENCY_IN_FLIGHT"
    assert res.headers.get("retry-after") == "2"
