"""Sazlamalar Modulu Repozitori Qatı (Settings Repository)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.errors import OptimisticLockError
from app.modules.settings.models import ReasonCode, SettingValue


class SettingsRepository:
    """Parametrlər və səbəb kodları üzrə verilənlər bazası əməliyyatları."""

    async def get_effective_value(
        self,
        session: AsyncSession,
        key: str,
        branch_id: uuid.UUID | None = None,
        at: datetime | None = None,
    ) -> SettingValue | None:
        """Tarix və filial üzrə qüvvədə olan parametr qeydini çəkir."""
        target_time = at or utc_now()
        stmt = (
            select(SettingValue)
            .where(
                SettingValue.key == key,
                SettingValue.effective_from <= target_time,
            )
            .order_by(SettingValue.effective_from.desc(), SettingValue.created_at.desc())
        )

        if branch_id is not None:
            stmt = stmt.where(SettingValue.branch_id == branch_id)
        else:
            stmt = stmt.where(SettingValue.branch_id.is_(None))

        stmt = stmt.limit(1)
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_latest_version(
        self, session: AsyncSession, key: str, branch_id: uuid.UUID | None = None
    ) -> int:
        """Cari parametr üçün ən son versiya nömrəsini qaytarır."""
        stmt = select(func.max(SettingValue.version)).where(SettingValue.key == key)
        if branch_id is not None:
            stmt = stmt.where(SettingValue.branch_id == branch_id)
        else:
            stmt = stmt.where(SettingValue.branch_id.is_(None))
        res = await session.execute(stmt)
        return int(res.scalar_one_or_none() or 0)

    async def create_value(self, session: AsyncSession, setting_val: SettingValue) -> SettingValue:
        """Yeni versiyalı parametr dəyərini bazaya daxil edir (heç vaxt köhnə sətir silinmir)."""
        session.add(setting_val)
        await session.flush()
        return setting_val

    async def list_history(
        self, session: AsyncSession, key: str, branch_id: uuid.UUID | None = None
    ) -> list[SettingValue]:
        """Parametrin tam dəyişiklik tarixçəsini qaytarır."""
        stmt = (
            select(SettingValue)
            .where(SettingValue.key == key)
            .order_by(SettingValue.created_at.desc(), SettingValue.version.desc())
        )
        if branch_id is not None:
            stmt = stmt.where(SettingValue.branch_id == branch_id)
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def get_value_by_id(
        self, session: AsyncSession, history_id: uuid.UUID
    ) -> SettingValue | None:
        """ID üzrə tarixçə qeydini qaytarır."""
        stmt = select(SettingValue).where(SettingValue.id == history_id)
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    # --- Səbəb Kodları (Reason Codes) ---

    async def list_reason_codes(
        self,
        session: AsyncSession,
        category: str | None = None,
        is_active: bool | None = None,
    ) -> list[ReasonCode]:
        """Səbəb kodlarını filtrlər üzrə siyahılayır."""
        stmt = select(ReasonCode).where(ReasonCode.is_deleted.is_(False))
        if category is not None:
            stmt = stmt.where(ReasonCode.category == category)
        if is_active is not None:
            stmt = stmt.where(ReasonCode.is_active == is_active)
        stmt = stmt.order_by(ReasonCode.category.asc(), ReasonCode.code.asc())
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def get_reason_code_by_id(
        self, session: AsyncSession, code_id: uuid.UUID
    ) -> ReasonCode | None:
        """ID üzrə səbəb kodunu qaytarır."""
        stmt = select(ReasonCode).where(ReasonCode.id == code_id, ReasonCode.is_deleted.is_(False))
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    get_by_id = get_reason_code_by_id

    async def get_reason_code_by_category_and_code(
        self, session: AsyncSession, category: str, code: str
    ) -> ReasonCode | None:
        """Kateqoriya və kod üzrə səbəb kodunu qaytarır."""
        stmt = select(ReasonCode).where(
            ReasonCode.category == category,
            func.lower(ReasonCode.code) == code.strip().lower(),
            ReasonCode.is_deleted.is_(False),
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def create_reason_code(self, session: AsyncSession, rc: ReasonCode) -> ReasonCode:
        """Yeni səbəb kodu əlavə edir."""
        session.add(rc)
        await session.flush()
        return rc

    async def update_reason_code(
        self, session: AsyncSession, rc: ReasonCode, expected_version: int
    ) -> ReasonCode:
        """Səbəb kodunu optimistik kilidləmə ilə yeniləyir."""
        if rc.version != expected_version:
            raise OptimisticLockError(
                f"Səbəb kodu başqa istifadəçi tərəfindən yenilənib (Cari: v{rc.version}, Gözlənilən: v{expected_version})."
            )
        rc.version += 1
        rc.updated_at = utc_now()
        await session.flush()
        return rc

    async def delete_reason_code(self, session: AsyncSession, rc: ReasonCode) -> None:
        """Səbəb kodunu silir (soft delete)."""
        rc.is_deleted = True
        rc.updated_at = utc_now()
        await session.flush()
