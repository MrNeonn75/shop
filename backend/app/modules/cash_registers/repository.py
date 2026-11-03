"""Kassa Aparatları Modulu Repozitori Qatı (Cash Registers Repository)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.errors import OptimisticLockError
from app.modules.cash_registers.models import CashRegister


class CashRegisterRepository:
    """Kassa aparatları üzrə verilənlər bazası sorğuları."""

    async def get_by_id(self, session: AsyncSession, register_id: uuid.UUID) -> CashRegister | None:
        """ID üzrə kassanı qaytarır."""
        stmt = select(CashRegister).where(
            CashRegister.id == register_id, CashRegister.is_deleted.is_(False)
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_by_branch_and_code(
        self, session: AsyncSession, branch_id: uuid.UUID, code: str
    ) -> CashRegister | None:
        """Filial və kod üzrə kassanı qaytarır."""
        stmt = select(CashRegister).where(
            CashRegister.branch_id == branch_id,
            func.lower(CashRegister.code) == code.strip().lower(),
            CashRegister.is_deleted.is_(False),
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_registers(
        self,
        session: AsyncSession,
        company_id: uuid.UUID | None = None,
        branch_id: uuid.UUID | None = None,
        status: str | None = None,
        branch_scope_ids: list[uuid.UUID] | None = None,
    ) -> list[CashRegister]:
        """Kassaları filtrlər üzrə siyahılayır."""
        stmt = select(CashRegister).where(CashRegister.is_deleted.is_(False))

        if company_id is not None:
            stmt = stmt.where(CashRegister.company_id == company_id)

        if branch_id is not None:
            stmt = stmt.where(CashRegister.branch_id == branch_id)
        elif branch_scope_ids is not None:
            stmt = stmt.where(CashRegister.branch_id.in_(branch_scope_ids))

        if status is not None:
            stmt = stmt.where(CashRegister.status == status)

        stmt = stmt.order_by(CashRegister.code.asc())
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def count_active_by_branch(self, session: AsyncSession, branch_id: uuid.UUID) -> int:
        """Filial üzrə aktiv statuslu kassaların sayını qaytarır."""
        stmt = select(func.count(CashRegister.id)).where(
            CashRegister.branch_id == branch_id,
            CashRegister.status == "active",
            CashRegister.is_deleted.is_(False),
        )
        res = await session.execute(stmt)
        return int(res.scalar_one_or_none() or 0)

    async def create(self, session: AsyncSession, register: CashRegister) -> CashRegister:
        """Yeni kassa aparatı əlavə edir."""
        session.add(register)
        await session.flush()
        return register

    async def update(
        self, session: AsyncSession, register: CashRegister, expected_version: int
    ) -> CashRegister:
        """Kassa məlumatlarını optimistik kilidləmə ilə yeniləyir."""
        if register.version != expected_version:
            raise OptimisticLockError(
                f"Kassa məlumatları başqa istifadəçi tərəfindən yenilənib (Cari: v{register.version}, Gözlənilən: v{expected_version})."
            )
        register.version += 1
        register.updated_at = utc_now()
        await session.flush()
        return register
