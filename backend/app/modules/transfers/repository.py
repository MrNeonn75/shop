"""Transferlər Modulu Məlumat Bazası Əməliyyatları (Transfers Repository).

Anbarlararası və filiallararası transfer sənədləri, sətirlər, qəbul aktları və
tranzit monitorinqi üçün repozitori.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.transfers.models import (
    StockTransfer,
    TransferReceivingEvent,
    TransferStatus,
)


class TransfersRepository:
    """Transferlər modulu verilənlər bazası əməliyyatları."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_transfer(self, transfer: StockTransfer) -> StockTransfer:
        self.session.add(transfer)
        await self.session.flush()
        return transfer

    async def get_transfer(
        self, transfer_id: uuid.UUID, with_relations: bool = True
    ) -> StockTransfer | None:
        stmt = select(StockTransfer).where(StockTransfer.id == transfer_id)
        if with_relations:
            stmt = stmt.options(
                selectinload(StockTransfer.lines),
                selectinload(StockTransfer.receiving_events).selectinload(
                    TransferReceivingEvent.lines
                ),
            )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def get_transfer_by_no(
        self, company_id: uuid.UUID, transfer_no: str
    ) -> StockTransfer | None:
        stmt = (
            select(StockTransfer)
            .where(
                StockTransfer.company_id == company_id,
                StockTransfer.transfer_no == transfer_no,
            )
            .options(selectinload(StockTransfer.lines))
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_transfers(
        self,
        company_id: uuid.UUID,
        status: str | None = None,
        source_warehouse_id: uuid.UUID | None = None,
        destination_warehouse_id: uuid.UUID | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[StockTransfer], int]:
        query = select(StockTransfer).where(StockTransfer.company_id == company_id)

        if status:
            query = query.where(StockTransfer.status == status)
        if source_warehouse_id:
            query = query.where(StockTransfer.source_warehouse_id == source_warehouse_id)
        if destination_warehouse_id:
            query = query.where(StockTransfer.destination_warehouse_id == destination_warehouse_id)
        if date_from:
            query = query.where(StockTransfer.created_at >= date_from)
        if date_to:
            query = query.where(StockTransfer.created_at <= date_to)

        count_stmt = select(func.count()).select_from(query.subquery())
        total = (await self.session.execute(count_stmt)).scalar_one()

        items_stmt = (
            query.options(selectinload(StockTransfer.lines))
            .order_by(StockTransfer.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        items = list((await self.session.execute(items_stmt)).scalars().all())
        return items, total

    async def create_receiving_event(self, event: TransferReceivingEvent) -> TransferReceivingEvent:
        self.session.add(event)
        await self.session.flush()
        return event

    async def list_in_transit_transfers(self, company_id: uuid.UUID) -> list[StockTransfer]:
        """Yolda olan transferləri qaytarır (DISPATCHED, IN_TRANSIT, PARTIALLY_RECEIVED)."""
        stmt = (
            select(StockTransfer)
            .where(
                StockTransfer.company_id == company_id,
                StockTransfer.status.in_(
                    [
                        TransferStatus.DISPATCHED.value,
                        TransferStatus.IN_TRANSIT.value,
                        TransferStatus.PARTIALLY_RECEIVED.value,
                    ]
                ),
            )
            .order_by(StockTransfer.dispatched_at.asc())
        )
        return list((await self.session.execute(stmt)).scalars().all())
