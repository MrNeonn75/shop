"""Paralellik və Kilidləmə Testləri (Concurrency & Locking Tests).

Optimistic concurrency (version sütunu), deadlock qarşısının alınması və deterministik sıralama.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.concurrency import sort_keys_for_locking, verify_version
from app.core.errors import ConcurrencyError
from app.modules.ping.models import PingLog


def test_sort_keys_for_locking() -> None:
    u1 = uuid.UUID("018b3f88-1000-7000-8000-000000000001")
    u2 = uuid.UUID("018b3f88-2000-7000-8000-000000000002")
    u3 = uuid.UUID("018b3f88-3000-7000-8000-000000000003")

    unsorted_ids = [u3, u1, u2]
    sorted_ids = sort_keys_for_locking(unsorted_ids)

    assert sorted_ids == [u1, u2, u3]


@pytest.mark.asyncio
async def test_optimistic_locking_version_check(session: AsyncSession) -> None:
    ping = PingLog(
        message="Concurrency test",
        version=1,
    )
    session.add(ping)
    await session.commit()
    await session.refresh(ping)

    # Düzgün versiya ilə yoxlama keçir
    verify_version(ping, expected_version=1)

    # Köhnəlmiş və ya fərqli versiya ilə yoxlama 409 xətası atır
    with pytest.raises(ConcurrencyError) as exc_info:
        verify_version(ping, expected_version=2)

    assert exc_info.value.code == "VERSION_CONFLICT"
    assert exc_info.value.status_code == 409
