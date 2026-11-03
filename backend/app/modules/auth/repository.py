"""Autentifikasiya Modulu Repozitorisi (Auth Repository)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.modules.auth.models import ManagerApprovalToken, PasswordResetToken


class AuthRepository:
    """Şifrə bərpa və təsdiq tokenləri üçün DB əməliyyatları."""

    async def create_password_reset_token(
        self,
        session: AsyncSession,
        user_id: uuid.UUID,
        token_hash: str,
        expires_at: datetime,
    ) -> PasswordResetToken:
        token_obj = PasswordResetToken(
            id=uuid.uuid4(),
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            created_at=utc_now(),
        )
        session.add(token_obj)
        await session.flush()
        return token_obj

    async def get_password_reset_token(
        self, session: AsyncSession, token_hash: str
    ) -> PasswordResetToken | None:
        stmt = select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.is_deleted.is_(False),
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def mark_password_reset_token_used(
        self, session: AsyncSession, token_id: uuid.UUID
    ) -> None:
        stmt = (
            update(PasswordResetToken)
            .where(PasswordResetToken.id == token_id)
            .values(used_at=utc_now(), updated_at=utc_now())
        )
        await session.execute(stmt)
        await session.flush()

    async def create_manager_approval_token(
        self, session: AsyncSession, token: ManagerApprovalToken
    ) -> ManagerApprovalToken:
        session.add(token)
        await session.flush()
        return token

    async def get_manager_approval_token(
        self, session: AsyncSession, token_hash: str
    ) -> ManagerApprovalToken | None:
        stmt = select(ManagerApprovalToken).where(
            ManagerApprovalToken.token_hash == token_hash,
            ManagerApprovalToken.is_deleted.is_(False),
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def mark_manager_approval_token_used(
        self, session: AsyncSession, token_id: uuid.UUID
    ) -> None:
        stmt = (
            update(ManagerApprovalToken)
            .where(ManagerApprovalToken.id == token_id)
            .values(used_at=utc_now(), updated_at=utc_now())
        )
        await session.execute(stmt)
        await session.flush()
