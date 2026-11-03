"""Şirkət Modulu Repozitori Qatı (Company Repository)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.errors import OptimisticLockError
from app.modules.company.models import Company


class CompanyRepository:
    """Şirkət məlumatları üzrə verilənlər bazası əməliyyatları."""

    async def get_default_company(self, session: AsyncSession) -> Company | None:
        """Əsas aktiv şirkət profilini qaytarır."""
        stmt = (
            select(Company)
            .where(Company.is_deleted.is_(False))
            .order_by(Company.created_at.asc())
            .limit(1)
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_by_id(self, session: AsyncSession, company_id: uuid.UUID) -> Company | None:
        """ID üzrə şirkəti qaytarır."""
        stmt = select(Company).where(Company.id == company_id, Company.is_deleted.is_(False))
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def create(self, session: AsyncSession, company: Company) -> Company:
        """Yeni şirkət qeydi yaradır."""
        session.add(company)
        await session.flush()
        return company

    async def update(
        self, session: AsyncSession, company: Company, expected_version: int
    ) -> Company:
        """Şirkət profilini optimistik kilidləmə ilə yeniləyir."""
        if company.version != expected_version:
            raise OptimisticLockError(
                f"Şirkət məlumatları başqa istifadəçi tərəfindən yenilənib (Cari: v{company.version}, Gözlənilən: v{expected_version})."
            )
        company.version += 1
        company.updated_at = utc_now()
        await session.flush()
        return company
