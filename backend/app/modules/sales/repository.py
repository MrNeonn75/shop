"""Satışlar Modulu Verilənlər Bazası Repozitorisi (Sales Repository)."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import utc_now
from app.modules.sales.models import Sale, SaleEvent, SaleLine, SalePayment


class SalesRepository:
    """Satış əməliyyatlarının və arxivinin verilənlər bazası repozitorisi."""

    def __init__(self, session: AsyncSession | None = None) -> None:
        self._session = session

    async def create_sale(self, session: AsyncSession, sale: Sale) -> Sale:
        session.add(sale)
        await session.flush()
        return sale

    async def get_sale_by_id(self, session: AsyncSession, sale_id: uuid.UUID) -> Sale | None:
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

    async def get_sale_by_receipt_no(self, session: AsyncSession, receipt_no: str) -> Sale | None:
        clean = receipt_no.strip()
        stmt = (
            select(Sale)
            .options(
                selectinload(Sale.lines),
                selectinload(Sale.payments),
                selectinload(Sale.events),
            )
            .where(Sale.receipt_no == clean)
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def search_sales(
        self,
        session: AsyncSession,
        company_id: uuid.UUID | None = None,
        branch_id: uuid.UUID | None = None,
        register_id: uuid.UUID | None = None,
        shift_id: uuid.UUID | None = None,
        cashier_id: uuid.UUID | None = None,
        customer_id: uuid.UUID | None = None,
        status: str | None = None,
        tender_type: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        query: str | None = None,
        min_amount: Decimal | None = None,
        max_amount: Decimal | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[Sale], int]:
        filters = []
        if company_id:
            filters.append(Sale.company_id == company_id)
        if branch_id:
            filters.append(Sale.branch_id == branch_id)
        if register_id:
            filters.append(Sale.register_id == register_id)
        if shift_id:
            filters.append(Sale.shift_id == shift_id)
        if cashier_id:
            filters.append(Sale.cashier_id == cashier_id)
        if customer_id:
            filters.append(Sale.customer_id == customer_id)
        if status:
            filters.append(Sale.status == status)
        if start_date:
            filters.append(Sale.business_date >= start_date)
        if end_date:
            filters.append(Sale.business_date <= end_date)
        if min_amount is not None:
            filters.append(Sale.grand_total >= min_amount)
        if max_amount is not None:
            filters.append(Sale.grand_total <= max_amount)

        if query:
            clean_q = f"%{query.strip()}%"
            filters.append(
                or_(
                    Sale.receipt_no.ilike(clean_q),
                    Sale.id.in_(
                        select(SaleLine.sale_id).where(
                            or_(
                                SaleLine.sku.ilike(clean_q),
                                SaleLine.barcode.ilike(clean_q),
                                SaleLine.product_name.ilike(clean_q),
                            )
                        )
                    ),
                )
            )

        if tender_type:
            filters.append(
                Sale.id.in_(
                    select(SalePayment.sale_id).where(SalePayment.tender_type == tender_type)
                )
            )

        # Count total
        count_stmt = select(func.count()).select_from(Sale)
        if filters:
            count_stmt = count_stmt.where(and_(*filters))
        total = await session.scalar(count_stmt) or 0

        # Query items
        stmt = (
            select(Sale)
            .options(
                selectinload(Sale.lines),
                selectinload(Sale.payments),
                selectinload(Sale.events),
            )
            .order_by(desc(Sale.created_at))
        )
        if filters:
            stmt = stmt.where(and_(*filters))
        stmt = stmt.offset(offset).limit(limit)

        res = await session.execute(stmt)
        return list(res.scalars().all()), total

    async def add_sale_event(self, session: AsyncSession, event: SaleEvent) -> SaleEvent:
        session.add(event)
        await session.flush()
        return event

    async def get_sales_by_shift(self, session: AsyncSession, shift_id: uuid.UUID) -> list[Sale]:
        stmt = (
            select(Sale)
            .options(
                selectinload(Sale.lines),
                selectinload(Sale.payments),
            )
            .where(Sale.shift_id == shift_id)
            .order_by(Sale.created_at)
        )
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def cancel_sale(
        self, session: AsyncSession, sale: Sale, cancelled_by_id: uuid.UUID, reason: str
    ) -> Sale:
        now = utc_now()
        sale.status = "CANCELLED"
        sale.cancelled_at = now
        sale.cancelled_by_id = cancelled_by_id
        sale.cancellation_reason = reason
        sale.version += 1
        await session.flush()
        return sale
