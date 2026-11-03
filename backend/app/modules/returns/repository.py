"""Qaytarmalar və Mübadilələr Repozitori Qatı (Returns Repository)."""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.ids import generate_uuid7
from app.modules.catalog.models import ProductVariant
from app.modules.returns.models import (
    SaleLineReturnState,
    SaleReturn,
    StoreCreditLedger,
)
from app.modules.returns.schemas import ReturnFilterParams
from app.modules.sales.models import Sale, SaleLine


class ReturnsRepository:
    """Verilənlər bazası ilə qaytarma və mübadilə əməliyyatları."""

    async def lock_return_states(
        self, session: AsyncSession, sale_line_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, SaleLineReturnState]:
        """Sətir sayğaclarını deterministik sıralama ilə kilidləyir (Deadlock-safe SELECT FOR UPDATE)."""
        if not sale_line_ids:
            return {}

        # Deterministik sıralama
        sorted_ids = sorted(sale_line_ids, key=lambda x: str(x))

        # 1. Mövcud sayğacları oxuyuruq
        stmt_existing = select(SaleLineReturnState).where(
            SaleLineReturnState.sale_line_id.in_(sorted_ids)
        )
        res_existing = await session.execute(stmt_existing)
        existing_states = {s.sale_line_id: s for s in res_existing.scalars().all()}

        # 2. Çatışmayan sayğacları orijinal satış sətirlərindən tapıb dərhal yaradırıq
        missing_ids = [lid for lid in sorted_ids if lid not in existing_states]
        if missing_ids:
            stmt_lines = select(SaleLine).where(SaleLine.id.in_(missing_ids))
            res_lines = await session.execute(stmt_lines)
            created_states: list[SaleLineReturnState] = []
            for s_line in res_lines.scalars().all():
                new_state = SaleLineReturnState(
                    id=generate_uuid7(),
                    sale_line_id=s_line.id,
                    sold_qty=s_line.quantity,
                    returned_qty=0,
                    reserved_qty=0,
                    version=1,
                )
                session.add(new_state)
                created_states.append(new_state)
            try:
                async with session.begin_nested():
                    await session.flush()
            except Exception:
                for cs in created_states:
                    session.expunge(cs)

        # 3. İndi bütün sətirləri FOR UPDATE ilə kilidləyirik
        stmt_lock = (
            select(SaleLineReturnState)
            .where(SaleLineReturnState.sale_line_id.in_(sorted_ids))
            .order_by(SaleLineReturnState.sale_line_id)
            .with_for_update()
        )
        res_locked = await session.execute(stmt_lock)
        return {s.sale_line_id: s for s in res_locked.scalars().all()}

    async def get_or_create_return_state(
        self, session: AsyncSession, sale_line: SaleLine
    ) -> SaleLineReturnState:
        """Oxuma məqsədli sətir sayğacını gətirir və ya yaradır (Kilidsiz)."""
        stmt = select(SaleLineReturnState).where(SaleLineReturnState.sale_line_id == sale_line.id)
        res = await session.execute(stmt)
        state = res.scalar_one_or_none()
        if not state:
            state = SaleLineReturnState(
                id=generate_uuid7(),
                sale_line_id=sale_line.id,
                sold_qty=sale_line.quantity,
                returned_qty=0,
                reserved_qty=0,
                version=1,
            )
            session.add(state)
            try:
                async with session.begin_nested():
                    await session.flush()
            except Exception:
                session.expunge(state)
                res2 = await session.execute(stmt)
                state = res2.scalar_one()
        return state

    async def create_return(self, session: AsyncSession, return_doc: SaleReturn) -> SaleReturn:
        """Yeni qaytarma sənədini bazaya yazır."""
        session.add(return_doc)
        await session.flush()
        return return_doc

    async def get_return_by_id(
        self, session: AsyncSession, return_id: uuid.UUID
    ) -> SaleReturn | None:
        """ID üzrə qaytarma sənədini sətir və ödənişləri ilə birlikdə gətirir."""
        stmt = (
            select(SaleReturn)
            .options(
                selectinload(SaleReturn.lines),
                selectinload(SaleReturn.refunds),
            )
            .where(SaleReturn.id == return_id)
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_return_by_no(self, session: AsyncSession, return_no: str) -> SaleReturn | None:
        """Qaytarma nömrəsi üzrə sənədi gətirir."""
        stmt = (
            select(SaleReturn)
            .options(
                selectinload(SaleReturn.lines),
                selectinload(SaleReturn.refunds),
            )
            .where(SaleReturn.return_no == return_no)
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def search_returns(
        self, session: AsyncSession, company_id: uuid.UUID, filters: ReturnFilterParams
    ) -> tuple[list[SaleReturn], int]:
        """Çoxmeyarlı axtarış və səhifələmə."""
        base_query = select(SaleReturn).where(SaleReturn.company_id == company_id)

        if filters.branch_id:
            base_query = base_query.where(SaleReturn.branch_id == filters.branch_id)
        if filters.register_id:
            base_query = base_query.where(SaleReturn.register_id == filters.register_id)
        if filters.shift_id:
            base_query = base_query.where(SaleReturn.shift_id == filters.shift_id)
        if filters.cashier_id:
            base_query = base_query.where(SaleReturn.processed_by_id == filters.cashier_id)
        if filters.customer_id:
            base_query = base_query.where(SaleReturn.customer_id == filters.customer_id)
        if filters.status:
            base_query = base_query.where(SaleReturn.status == filters.status)
        if filters.return_type:
            base_query = base_query.where(SaleReturn.return_type == filters.return_type)
        if filters.start_date:
            base_query = base_query.where(SaleReturn.business_date >= filters.start_date)
        if filters.end_date:
            base_query = base_query.where(SaleReturn.business_date <= filters.end_date)
        if filters.min_amount is not None:
            base_query = base_query.where(SaleReturn.refund_total >= filters.min_amount)
        if filters.max_amount is not None:
            base_query = base_query.where(SaleReturn.refund_total <= filters.max_amount)

        # Ümumi sayı hesablamaq
        count_stmt = select(func.count()).select_from(base_query.subquery())
        total_res = await session.execute(count_stmt)
        total_count = total_res.scalar_one() or 0

        # Məlumatları gətirmək
        offset = (filters.page - 1) * filters.page_size
        stmt = (
            base_query.options(
                selectinload(SaleReturn.lines),
                selectinload(SaleReturn.refunds),
            )
            .order_by(SaleReturn.created_at.desc())
            .offset(offset)
            .limit(filters.page_size)
        )
        res = await session.execute(stmt)
        return list(res.scalars().all()), total_count

    async def get_returns_for_sale(
        self, session: AsyncSession, sale_id: uuid.UUID
    ) -> list[SaleReturn]:
        """Orijinal satış üzrə bütün qaytarma sənədlərini gətirir."""
        stmt = (
            select(SaleReturn)
            .options(
                selectinload(SaleReturn.lines),
                selectinload(SaleReturn.refunds),
            )
            .where(
                SaleReturn.original_sale_id == sale_id,
                SaleReturn.status.in_(["COMPLETED", "PENDING_APPROVAL"]),
            )
            .order_by(SaleReturn.created_at.desc())
        )
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def get_customer_returns(
        self, session: AsyncSession, company_id: uuid.UUID, customer_id: uuid.UUID, limit: int = 100
    ) -> list[SaleReturn]:
        """Müştərinin qaytarmalarını gətirir."""
        stmt = (
            select(SaleReturn)
            .options(selectinload(SaleReturn.lines), selectinload(SaleReturn.refunds))
            .where(
                SaleReturn.company_id == company_id,
                SaleReturn.customer_id == customer_id,
            )
            .order_by(SaleReturn.created_at.desc())
            .limit(limit)
        )
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def get_customer_store_credit_balance(
        self, session: AsyncSession, company_id: uuid.UUID, customer_id: uuid.UUID
    ) -> Decimal:
        """Müştərinin cari mağaza krediti (Store Credit) qalığını qaytarır."""
        stmt = (
            select(StoreCreditLedger.balance_after)
            .where(
                StoreCreditLedger.company_id == company_id,
                StoreCreditLedger.customer_id == customer_id,
            )
            .order_by(StoreCreditLedger.created_at.desc())
            .limit(1)
        )
        res = await session.execute(stmt)
        bal = res.scalar_one_or_none()
        return bal if bal is not None else Decimal("0.00")

    async def append_store_credit_entry(
        self, session: AsyncSession, entry: StoreCreditLedger
    ) -> StoreCreditLedger:
        """Mağaza krediti jurnalına yeni qeyd əlavə edir."""
        session.add(entry)
        await session.flush()
        return entry

    async def get_sale_by_id(self, session: AsyncSession, sale_id: uuid.UUID) -> Sale | None:
        """Orijinal satışı sətirləri və ödənişləri ilə birgə oxuyur."""
        stmt = (
            select(Sale)
            .options(
                selectinload(Sale.lines),
                selectinload(Sale.payments),
                selectinload(Sale.events),
            )
            .where(Sale.id == sale_id)
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_product_variant(
        self, session: AsyncSession, variant_id: uuid.UUID
    ) -> ProductVariant | None:
        """Məhsul variantını və məhsulunu gətirir."""
        stmt = (
            select(ProductVariant)
            .options(selectinload(ProductVariant.product))
            .where(ProductVariant.id == variant_id)
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()
