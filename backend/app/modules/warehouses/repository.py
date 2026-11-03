"""Anbarlar Modulu Repozitori Qatı (Warehouses Repository)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.errors import OptimisticLockError
from app.modules.warehouses.models import Warehouse, WarehouseZone


class WarehouseRepository:
    """Anbarlar və zonalar üzrə verilənlər bazası sorğuları."""

    async def get_by_id(self, session: AsyncSession, warehouse_id: uuid.UUID) -> Warehouse | None:
        """ID üzrə anbarı qaytarır."""
        stmt = select(Warehouse).where(
            Warehouse.id == warehouse_id, Warehouse.is_deleted.is_(False)
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_by_code(self, session: AsyncSession, code: str) -> Warehouse | None:
        """Kod üzrə anbarı qaytarır (böyük/kiçik hərf fərqini nəzərə almadan)."""
        stmt = select(Warehouse).where(
            func.lower(Warehouse.code) == code.strip().lower(),
            Warehouse.is_deleted.is_(False),
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_in_transit_warehouse(
        self, session: AsyncSession, company_id: uuid.UUID
    ) -> Warehouse | None:
        """Şirkət üzrə sistem transfer (in_transit) anbarını qaytarır."""
        stmt = select(Warehouse).where(
            Warehouse.company_id == company_id,
            Warehouse.warehouse_type == "in_transit",
            Warehouse.is_system.is_(True),
            Warehouse.is_deleted.is_(False),
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_warehouses(
        self,
        session: AsyncSession,
        company_id: uuid.UUID | None = None,
        branch_id: uuid.UUID | None = None,
        warehouse_type: str | None = None,
        status: str | None = None,
        branch_scope_ids: list[uuid.UUID] | None = None,
    ) -> list[Warehouse]:
        """Anbarları filtrlər üzrə siyahılayır."""
        stmt = select(Warehouse).where(Warehouse.is_deleted.is_(False))

        if company_id is not None:
            stmt = stmt.where(Warehouse.company_id == company_id)

        if branch_id is not None:
            stmt = stmt.where(Warehouse.branch_id == branch_id)
        elif branch_scope_ids is not None:
            # Mərkəzi anbar və ya istifadəçinin icazəli filiallarının anbarları
            stmt = stmt.where(
                (Warehouse.branch_id.in_(branch_scope_ids)) | (Warehouse.branch_id.is_(None))
            )

        if warehouse_type is not None:
            stmt = stmt.where(Warehouse.warehouse_type == warehouse_type)

        if status is not None:
            stmt = stmt.where(Warehouse.status == status)

        stmt = stmt.order_by(Warehouse.code.asc())
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def count_warehouses_for_branch(self, session: AsyncSession, branch_id: uuid.UUID) -> int:
        """Filiala bağlı aktiv anbarların sayını qaytarır."""
        stmt = select(func.count(Warehouse.id)).where(
            Warehouse.branch_id == branch_id,
            Warehouse.is_deleted.is_(False),
        )
        res = await session.execute(stmt)
        return int(res.scalar_one_or_none() or 0)

    async def clear_default_for_sales(
        self, session: AsyncSession, branch_id: uuid.UUID, exclude_id: uuid.UUID | None = None
    ) -> None:
        """Filial daxilində digər anbarların satış üçün standart bayrağını sıfırlayır."""
        stmt = (
            update(Warehouse)
            .where(Warehouse.branch_id == branch_id, Warehouse.is_deleted.is_(False))
            .values(is_default_for_sales=False)
        )
        if exclude_id is not None:
            stmt = stmt.where(Warehouse.id != exclude_id)
        await session.execute(stmt)

    async def create(self, session: AsyncSession, warehouse: Warehouse) -> Warehouse:
        """Yeni anbar əlavə edir."""
        session.add(warehouse)
        await session.flush()
        return warehouse

    async def update(
        self, session: AsyncSession, warehouse: Warehouse, expected_version: int
    ) -> Warehouse:
        """Anbar məlumatlarını optimistik kilidləmə ilə yeniləyir."""
        if warehouse.version != expected_version:
            raise OptimisticLockError(
                f"Anbar məlumatları başqa istifadəçi tərəfindən yenilənib (Cari: v{warehouse.version}, Gözlənilən: v{expected_version})."
            )
        warehouse.version += 1
        warehouse.updated_at = utc_now()
        await session.flush()
        return warehouse

    async def delete(self, session: AsyncSession, warehouse: Warehouse) -> None:
        """Anbarı yumşaq silir (soft delete)."""
        warehouse.is_deleted = True
        warehouse.updated_at = utc_now()
        await session.flush()

    async def create_zone(self, session: AsyncSession, zone: WarehouseZone) -> WarehouseZone:
        """Anbara yeni zona əlavə edir."""
        session.add(zone)
        await session.flush()
        return zone

    async def list_zones(
        self, session: AsyncSession, warehouse_id: uuid.UUID
    ) -> list[WarehouseZone]:
        """Anbarın zonalarını qaytarır."""
        stmt = (
            select(WarehouseZone)
            .where(WarehouseZone.warehouse_id == warehouse_id, WarehouseZone.is_deleted.is_(False))
            .order_by(WarehouseZone.code.asc())
        )
        res = await session.execute(stmt)
        return list(res.scalars().all())
