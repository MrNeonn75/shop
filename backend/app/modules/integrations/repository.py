"""Kənar İnteqrasiyalar Repozitorisi (Integrations Repository)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.concurrency import verify_version
from app.core.database import utc_now
from app.modules.integrations.models import Integration, IntegrationCallLog


class IntegrationRepository:
    """İnteqrasiyalar cədvəli və çağırış jurnalları üzrə DB əməliyyatları."""

    async def get_by_key(self, session: AsyncSession, key: str) -> Integration | None:
        """Açar üzrə inteqrasiyanı tapır."""
        stmt = select(Integration).where(Integration.key == key)
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_all(self, session: AsyncSession) -> list[Integration]:
        """Bütün qeydiyyatdan keçmiş inteqrasiyaları qaytarır."""
        stmt = select(Integration).order_by(Integration.key)
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def create(self, session: AsyncSession, integration: Integration) -> Integration:
        """Yeni inteqrasiya sətri yaradır."""
        session.add(integration)
        await session.flush()
        return integration

    async def update(
        self,
        session: AsyncSession,
        integration: Integration,
        expected_version: int | None = None,
    ) -> Integration:
        """İnteqrasiyanı yeniləyir."""
        if expected_version is not None:
            verify_version(integration.version, expected_version)
            integration.version += 1
        integration.updated_at = utc_now()
        await session.flush()
        return integration

    async def record_call_log(
        self, session: AsyncSession, log: IntegrationCallLog
    ) -> IntegrationCallLog:
        """Çağırış jurnalına yeni qeyd əlavə edir."""
        session.add(log)
        await session.flush()
        return log

    async def list_logs(
        self, session: AsyncSession, integration_key: str, limit: int = 50
    ) -> list[IntegrationCallLog]:
        """İnteqrasiya üzrə son N çağırış jurnalını qaytarır."""
        stmt = (
            select(IntegrationCallLog)
            .where(IntegrationCallLog.integration_key == integration_key)
            .order_by(IntegrationCallLog.created_at.desc())
            .limit(limit)
        )
        res = await session.execute(stmt)
        return list(res.scalars().all())
