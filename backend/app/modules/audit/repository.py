"""Audit Modulu Repozitorisi (Audit Repository)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import FilterBarParams, paginate_query
from app.shared.audit import AuditEvent


class AuditRepository:
    """Audit hadisələri sorğuları."""

    async def list_events(
        self,
        session: AsyncSession,
        params: FilterBarParams,
        module: str | None = None,
        action: str | None = None,
        resource_type: str | None = None,
        actor_id: uuid.UUID | None = None,
        branch_id: uuid.UUID | None = None,
        severity: str | None = None,
        correlation_id: str | None = None,
    ) -> tuple[list[AuditEvent], int]:
        query = select(AuditEvent)

        if module:
            query = query.where(AuditEvent.module == module)
        if action:
            query = query.where(AuditEvent.action == action)
        if resource_type:
            query = query.where(AuditEvent.resource_type == resource_type)
        if actor_id:
            query = query.where(AuditEvent.actor_id == actor_id)
        if branch_id:
            query = query.where(AuditEvent.branch_id == branch_id)
        if severity:
            query = query.where(AuditEvent.severity == severity)
        if correlation_id:
            query = query.where(AuditEvent.correlation_id == correlation_id)

        if params.date_from:
            query = query.where(AuditEvent.created_at >= params.date_from)
        if params.date_to:
            query = query.where(AuditEvent.created_at <= params.date_to)

        query = query.order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())

        items, total = await paginate_query(
            session=session,
            query=query,
            page=params.page,
            page_size=params.page_size,
        )
        return [item for item in items if isinstance(item, AuditEvent)], total

    async def get_timeline(
        self, session: AsyncSession, resource_type: str, resource_id: str
    ) -> list[AuditEvent]:
        stmt = (
            select(AuditEvent)
            .where(
                AuditEvent.resource_type == resource_type,
                AuditEvent.resource_id == resource_id,
            )
            .order_by(AuditEvent.created_at.asc(), AuditEvent.id.asc())
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def get_chain_events(
        self,
        session: AsyncSession,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[AuditEvent]:
        stmt = select(AuditEvent)
        if date_from:
            stmt = stmt.where(AuditEvent.created_at >= date_from)
        if date_to:
            stmt = stmt.where(AuditEvent.created_at <= date_to)

        # Xronoloji ardıcıllıq
        stmt = stmt.order_by(AuditEvent.created_at.asc(), AuditEvent.id.asc())
        result = await session.execute(stmt)
        return list(result.scalars().all())
