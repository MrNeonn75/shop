"""Filiallar Modulu Repozitori Qatı (Branches Repository)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.errors import OptimisticLockError
from app.modules.branches.models import Branch


class BranchRepository:
    """Filiallar üzrə verilənlər bazası sorğuları."""

    async def get_by_id(self, session: AsyncSession, branch_id: uuid.UUID) -> Branch | None:
        """ID üzrə filialı qaytarır."""
        stmt = select(Branch).where(Branch.id == branch_id, Branch.is_deleted.is_(False))
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_by_code(self, session: AsyncSession, code: str) -> Branch | None:
        """Qısa kod üzrə filialı qaytarır (böyük/kiçik hərf həssaslığı olmadan)."""
        stmt = select(Branch).where(
            func.lower(Branch.code) == code.strip().lower(),
            Branch.is_deleted.is_(False),
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_branches(
        self,
        session: AsyncSession,
        company_id: uuid.UUID | None = None,
        branch_scope_ids: list[uuid.UUID] | None = None,
        status: str | None = None,
    ) -> list[Branch]:
        """Filialları çıxış əhatəsi (Branch Scope) və statusa görə siyahılayır."""
        stmt = select(Branch).where(Branch.is_deleted.is_(False))

        if company_id is not None:
            stmt = stmt.where(Branch.company_id == company_id)

        if branch_scope_ids is not None:
            stmt = stmt.where(Branch.id.in_(branch_scope_ids))

        if status is not None:
            stmt = stmt.where(Branch.status == status)

        stmt = stmt.order_by(Branch.code.asc())
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def create(self, session: AsyncSession, branch: Branch) -> Branch:
        """Yeni filial əlavə edir."""
        session.add(branch)
        await session.flush()
        return branch

    async def update(self, session: AsyncSession, branch: Branch, expected_version: int) -> Branch:
        """Filial məlumatlarını optimistik kilidləmə ilə yeniləyir."""
        if branch.version != expected_version:
            raise OptimisticLockError(
                f"Filial məlumatları başqa istifadəçi tərəfindən yenilənib (Cari: v{branch.version}, Gözlənilən: v{expected_version})."
            )
        branch.version += 1
        branch.updated_at = utc_now()
        await session.flush()
        return branch
