"""Ping Modulu Servis Qatı Vahid Testləri."""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, NotFoundError
from app.core.pagination import FilterBarParams
from app.modules.ping.schemas import PingCreate
from app.modules.ping.service import PingService


@pytest.mark.asyncio
async def test_ping_service_create_and_get(session: AsyncSession) -> None:
    service = PingService()
    created = await service.create_ping(
        data=PingCreate(message="Servis birbaşa çağırış"),
        client_ip="127.0.0.1",
    )

    assert created.message == "Servis birbaşa çağırış"
    assert created.status == "active"

    fetched = await service.get_ping(created.id)
    assert fetched.id == created.id
    assert fetched.message == created.message


@pytest.mark.asyncio
async def test_ping_service_not_found() -> None:
    service = PingService()
    with pytest.raises(NotFoundError):
        await service.get_ping(uuid.uuid4())


@pytest.mark.asyncio
async def test_ping_service_policies_forbidden() -> None:
    service = PingService()

    with (
        patch("app.modules.ping.service.can_create_ping", return_value=False),
        pytest.raises(ForbiddenError),
    ):
        await service.create_ping(PingCreate(message="Bloklanmış"))

    with (
        patch("app.modules.ping.service.can_read_pings", return_value=False),
        pytest.raises(ForbiddenError),
    ):
        await service.get_ping(uuid.uuid4())

    with (
        patch("app.modules.ping.service.can_read_pings", return_value=False),
        pytest.raises(ForbiddenError),
    ):
        await service.list_pings(FilterBarParams())


@pytest.mark.asyncio
async def test_ping_service_list(session: AsyncSession) -> None:
    service = PingService()
    await service.create_ping(data=PingCreate(message="List test 1"))
    await service.create_ping(data=PingCreate(message="List test 2"))

    res = await service.list_pings(FilterBarParams(page=1, page_size=10))
    assert res.total >= 2
    assert len(res.items) >= 2
