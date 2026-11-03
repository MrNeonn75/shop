"""Sessiyalar Modulu Repozitorisi (Sessions Repository)."""

from __future__ import annotations

import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.modules.sessions.models import Session


class SessionRepository:
    """Verilənlər bazasında sessiya əməliyyatları."""

    async def create(self, session: AsyncSession, s: Session) -> Session:
        session.add(s)
        await session.flush()
        return s

    async def get_by_id(self, session: AsyncSession, session_id: uuid.UUID) -> Session | None:
        stmt = select(Session).where(Session.id == session_id, Session.is_deleted.is_(False))
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_refresh_token_hash(
        self, session: AsyncSession, token_hash: str
    ) -> Session | None:
        stmt = select(Session).where(
            Session.refresh_token_hash == token_hash,
            Session.is_deleted.is_(False),
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_active_by_user(self, session: AsyncSession, user_id: uuid.UUID) -> list[Session]:
        now = utc_now()
        stmt = (
            select(Session)
            .where(
                Session.user_id == user_id,
                Session.expires_at > now,
                Session.revoked_at.is_(None),
                Session.is_deleted.is_(False),
            )
            .order_by(Session.last_seen_at.desc())
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def revoke(self, session: AsyncSession, session_id: uuid.UUID) -> None:
        now = utc_now()
        stmt = (
            update(Session)
            .where(Session.id == session_id, Session.revoked_at.is_(None))
            .values(revoked_at=now, updated_at=now)
        )
        await session.execute(stmt)
        await session.flush()

    async def revoke_family(self, session: AsyncSession, family_id: uuid.UUID) -> int:
        """Token family-yə aid bütün aktiv sessiyaları ləğv edir (Reuse Detection)."""
        now = utc_now()
        stmt = (
            update(Session)
            .where(Session.family_id == family_id, Session.revoked_at.is_(None))
            .values(revoked_at=now, updated_at=now)
        )
        res = await session.execute(stmt)
        await session.flush()
        return res.rowcount or 0

    async def revoke_all_for_user(self, session: AsyncSession, user_id: uuid.UUID) -> int:
        now = utc_now()
        stmt = (
            update(Session)
            .where(Session.user_id == user_id, Session.revoked_at.is_(None))
            .values(revoked_at=now, updated_at=now)
        )
        res = await session.execute(stmt)
        await session.flush()
        return res.rowcount or 0

    async def update_last_seen(self, session: AsyncSession, session_id: uuid.UUID) -> None:
        now = utc_now()
        stmt = (
            update(Session).where(Session.id == session_id).values(last_seen_at=now, updated_at=now)
        )
        await session.execute(stmt)
        await session.flush()
