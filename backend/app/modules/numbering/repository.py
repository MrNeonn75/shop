"""Sənəd Nömrələnməsi Repozitorisi (Numbering Repository)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.concurrency import verify_version
from app.core.database import utc_now
from app.modules.numbering.models import AllocatedNumber, NumberingSequence


class NumberingRepository:
    """Nömrələnmə ardıcıllıqları və verilmiş nömrələr üzrə DB əməliyyatları."""

    async def get_by_id(
        self, session: AsyncSession, sequence_id: uuid.UUID
    ) -> NumberingSequence | None:
        """ID üzrə ardıcıllığı tapır."""
        stmt = select(NumberingSequence).where(
            NumberingSequence.id == sequence_id,
            NumberingSequence.is_deleted.is_(False),
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_sequences(
        self,
        session: AsyncSession,
        company_id: uuid.UUID | None = None,
        document_type: str | None = None,
        scope: str | None = None,
        is_active: bool | None = None,
    ) -> list[NumberingSequence]:
        """Ardıcıllıqların siyahısını qaytarır."""
        stmt = select(NumberingSequence).where(NumberingSequence.is_deleted.is_(False))

        if company_id:
            stmt = stmt.where(NumberingSequence.company_id == company_id)
        if document_type:
            stmt = stmt.where(NumberingSequence.document_type == document_type)
        if scope:
            stmt = stmt.where(NumberingSequence.scope == scope)
        if is_active is not None:
            stmt = stmt.where(NumberingSequence.is_active == is_active)

        stmt = stmt.order_by(NumberingSequence.document_type, NumberingSequence.created_at)
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def find_matching_sequence(
        self,
        session: AsyncSession,
        company_id: uuid.UUID,
        document_type: str,
        branch_id: uuid.UUID | None = None,
        register_id: uuid.UUID | None = None,
        for_update: bool = False,
    ) -> NumberingSequence | None:
        """Ən uyğun nömrələnmə ardıcıllığını tapır (Register -> Branch -> Company).

        Yarış vəziyyətlərinin qarşısını almaq və gapless qəbzlər üçün `for_update=True`
        olduqda ardıcıllıq sətri `SELECT ... FOR UPDATE` ilə cari tranzaksiya üçün kilidlənir.
        """
        # 1. Kassa səviyyəli axtarış
        if register_id:
            stmt1 = select(NumberingSequence).where(
                NumberingSequence.company_id == company_id,
                NumberingSequence.document_type == document_type,
                NumberingSequence.register_id == register_id,
                NumberingSequence.is_active.is_(True),
                NumberingSequence.is_deleted.is_(False),
            )
            if for_update:
                stmt1 = stmt1.with_for_update()
            res1 = await session.execute(stmt1)
            seq = res1.scalar_one_or_none()
            if seq:
                return seq

        # 2. Filial səviyyəli axtarış
        if branch_id:
            stmt2 = select(NumberingSequence).where(
                NumberingSequence.company_id == company_id,
                NumberingSequence.document_type == document_type,
                NumberingSequence.branch_id == branch_id,
                NumberingSequence.register_id.is_(None),
                NumberingSequence.is_active.is_(True),
                NumberingSequence.is_deleted.is_(False),
            )
            if for_update:
                stmt2 = stmt2.with_for_update()
            res2 = await session.execute(stmt2)
            seq = res2.scalar_one_or_none()
            if seq:
                return seq

        # 3. Şirkət səviyyəli standart axtarış
        stmt3 = select(NumberingSequence).where(
            NumberingSequence.company_id == company_id,
            NumberingSequence.document_type == document_type,
            NumberingSequence.branch_id.is_(None),
            NumberingSequence.register_id.is_(None),
            NumberingSequence.is_active.is_(True),
            NumberingSequence.is_deleted.is_(False),
        )
        if for_update:
            stmt3 = stmt3.with_for_update()
        res3 = await session.execute(stmt3)
        return res3.scalar_one_or_none()

    async def create(self, session: AsyncSession, sequence: NumberingSequence) -> NumberingSequence:
        """Yeni ardıcıllıq yazır."""
        session.add(sequence)
        await session.flush()
        return sequence

    async def update(
        self,
        session: AsyncSession,
        sequence: NumberingSequence,
        expected_version: int | None = None,
    ) -> NumberingSequence:
        """Ardıcıllığı yeniləyir (optimistik kilidləmə ilə)."""
        if expected_version is not None:
            verify_version(sequence.version, expected_version)
            sequence.version += 1
        sequence.updated_at = utc_now()
        await session.flush()
        return sequence

    async def record_allocated_number(
        self, session: AsyncSession, record: AllocatedNumber
    ) -> AllocatedNumber:
        """Ayrılmış sənəd nömrəsini qeydə alır."""
        session.add(record)
        await session.flush()
        return record

    async def is_number_allocated(
        self, session: AsyncSession, document_type: str, number: str
    ) -> bool:
        """Nömrənin artıq verilib-verilmədiyini yoxlayır."""
        stmt = select(AllocatedNumber.id).where(
            AllocatedNumber.document_type == document_type,
            AllocatedNumber.number == number,
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none() is not None
