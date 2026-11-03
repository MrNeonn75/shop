"""Ping Modulu Repozitorisi (Data Access Layer)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import FilterBarParams, paginate_query, parse_sort_expression
from app.modules.ping.models import PingLog


class PingRepository:
    """PingLog modeli üzrə SQL sorğularını icra edən repozitori."""

    ALLOWED_SORT_FIELDS: dict[str, Any] = {
        "created_at": PingLog.created_at,
        "message": PingLog.message,
        "status": PingLog.status,
    }

    async def create(self, session: AsyncSession, item: PingLog) -> PingLog:
        session.add(item)
        await session.flush()
        return item

    async def get_by_id(self, session: AsyncSession, ping_id: uuid.UUID) -> PingLog | None:
        stmt = select(PingLog).where(PingLog.id == ping_id, PingLog.is_deleted.is_(False))
        res = await session.execute(stmt)
        return res.scalars().first()

    async def list_pings(
        self, session: AsyncSession, params: FilterBarParams
    ) -> tuple[list[PingLog], int]:
        stmt = select(PingLog).where(PingLog.is_deleted.is_(False))

        # 1. Filtrlər
        if params.branch_id:
            stmt = stmt.where(PingLog.branch_id == params.branch_id)
        if params.status:
            stmt = stmt.where(PingLog.status == params.status)
        if params.date_from:
            stmt = stmt.where(PingLog.created_at >= params.date_from)
        if params.date_to:
            stmt = stmt.where(PingLog.created_at <= params.date_to)
        if params.q:
            stmt = stmt.where(PingLog.message.ilike(f"%{params.q}%"))

        # 2. Çeşidləmə
        sort_clauses = parse_sort_expression(
            sort_str=params.sort,
            allowed_fields=self.ALLOWED_SORT_FIELDS,
            default_sort=PingLog.created_at.desc(),
        )
        stmt = stmt.order_by(*sort_clauses)

        # 3. Səhifələmə
        return await paginate_query(session, stmt, page=params.page, page_size=params.page_size)
