"""Ping Modulu Servis Qatı (Business Logic Layer)."""

from __future__ import annotations

import uuid
from typing import Any

from app.core.errors import ForbiddenError, NotFoundError
from app.core.pagination import FilterBarParams, PaginatedResponse
from app.core.uow import unit_of_work
from app.modules.ping.events import create_ping_recorded_event
from app.modules.ping.models import PingLog
from app.modules.ping.policies import can_create_ping, can_read_pings
from app.modules.ping.repository import PingRepository
from app.modules.ping.schemas import PingCreate, PingResponse
from app.shared.events import event_bus
from app.shared.outbox import record_outbox_event


class PingService:
    """Ping biznes məntiqini icra edən servis."""

    def __init__(self, repo: PingRepository | None = None) -> None:
        self.repo = repo or PingRepository()

    async def create_ping(
        self, data: PingCreate, client_ip: str | None = None, user: Any = None
    ) -> PingResponse:
        if not can_create_ping(user):
            raise ForbiddenError("Ping yaratmaq üçün icazəniz yoxdur.")

        async with unit_of_work() as uow:
            ping = PingLog(
                message=data.message,
                branch_id=data.branch_id,
                client_ip=client_ip,
                status="active",
            )
            created_ping = await self.repo.create(uow.session, ping)

            # 1. Domen Hadisəsi formalaşdırırıq
            event = create_ping_recorded_event(
                ping_id=created_ping.id,
                message=created_ping.message,
                client_ip=created_ping.client_ip,
                branch_id=created_ping.branch_id,
            )

            # 2. Transactional Outbox-a yazırıq (eyni tranzaksiyada kommit olur)
            await record_outbox_event(uow.session, event)

            # 3. Daxili in-process dinləyicilərə xəbər veririk
            await event_bus.publish(event)

            # Blokdan çıxdıqda UoW avtomatik commit edir

        return PingResponse.model_validate(created_ping)

    async def get_ping(self, ping_id: uuid.UUID, user: Any = None) -> PingResponse:
        if not can_read_pings(user):
            raise ForbiddenError("Ping oxumaq üçün icazəniz yoxdur.")

        async with unit_of_work() as uow:
            ping = await self.repo.get_by_id(uow.session, ping_id)
            if not ping:
                raise NotFoundError(f"'{ping_id}' nömrəli Ping qeydi tapılmadı.")
            return PingResponse.model_validate(ping)

    async def list_pings(
        self, params: FilterBarParams, user: Any = None
    ) -> PaginatedResponse[PingResponse]:
        if not can_read_pings(user):
            raise ForbiddenError("Ping siyahısını oxumaq üçün icazəniz yoxdur.")

        async with unit_of_work() as uow:
            items, total = await self.repo.list_pings(uow.session, params)
            response_items = [PingResponse.model_validate(i) for i in items]
            return PaginatedResponse.create(
                items=response_items,
                total=total,
                page=params.page,
                page_size=params.page_size,
            )
