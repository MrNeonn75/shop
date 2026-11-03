"""Təchizatçılar Modulu Repozitorisi (Suppliers Repository)."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.suppliers.models import (
    Supplier,
    SupplierContact,
    SupplierDocument,
    SupplierLedgerDirection,
    SupplierLedgerEntry,
    SupplierProduct,
)


class SupplierRepository:
    """Təchizatçı məlumatları və jurnalı üzrə verilənlər bazası əməliyyatları."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_supplier(self, supplier: Supplier) -> Supplier:
        self.session.add(supplier)
        await self.session.flush()
        return supplier

    async def get_supplier(
        self, supplier_id: uuid.UUID, with_relations: bool = True
    ) -> Supplier | None:
        stmt = select(Supplier).where(Supplier.id == supplier_id)
        if with_relations:
            stmt = stmt.options(
                selectinload(Supplier.contacts),
                selectinload(Supplier.documents),
                selectinload(Supplier.products),
            )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_by_code(self, company_id: uuid.UUID, code: str) -> Supplier | None:
        stmt = select(Supplier).where(
            Supplier.company_id == company_id,
            func.lower(Supplier.code) == code.lower().strip(),
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_by_tax_id(self, company_id: uuid.UUID, tax_id: str) -> Supplier | None:
        stmt = select(Supplier).where(
            Supplier.company_id == company_id,
            Supplier.tax_id == tax_id.strip(),
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_suppliers(
        self,
        company_id: uuid.UUID,
        status: str | None = None,
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Supplier], int]:
        stmt = (
            select(Supplier)
            .where(Supplier.company_id == company_id)
            .options(selectinload(Supplier.contacts))
        )
        count_stmt = select(func.count(Supplier.id)).where(Supplier.company_id == company_id)

        if status:
            stmt = stmt.where(Supplier.status == status)
            count_stmt = count_stmt.where(Supplier.status == status)

        if search:
            q = f"%{search.strip().lower()}%"
            filter_cond = or_(
                func.lower(Supplier.name).ilike(q),
                func.lower(Supplier.code).ilike(q),
                Supplier.tax_id.ilike(q),
            )
            stmt = stmt.where(filter_cond)
            count_stmt = count_stmt.where(filter_cond)

        total = (await self.session.execute(count_stmt)).scalar_one()
        stmt = stmt.order_by(Supplier.name.asc()).limit(limit).offset(offset)
        items = list((await self.session.execute(stmt)).scalars().all())
        return items, int(total)

    async def add_contact(self, contact: SupplierContact) -> SupplierContact:
        self.session.add(contact)
        await self.session.flush()
        return contact

    async def list_contacts(self, supplier_id: uuid.UUID) -> list[SupplierContact]:
        stmt = (
            select(SupplierContact)
            .where(SupplierContact.supplier_id == supplier_id)
            .order_by(SupplierContact.is_primary.desc(), SupplierContact.name.asc())
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def add_document(self, document: SupplierDocument) -> SupplierDocument:
        self.session.add(document)
        await self.session.flush()
        return document

    async def list_documents(self, supplier_id: uuid.UUID) -> list[SupplierDocument]:
        stmt = (
            select(SupplierDocument)
            .where(SupplierDocument.supplier_id == supplier_id)
            .order_by(SupplierDocument.valid_to.asc().nulls_last())
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def get_expiring_documents(
        self, company_id: uuid.UUID, as_of_date: date, days_ahead: int
    ) -> list[SupplierDocument]:
        _ = days_ahead
        stmt = (
            select(SupplierDocument)
            .join(Supplier, Supplier.id == SupplierDocument.supplier_id)
            .where(
                Supplier.company_id == company_id,
                Supplier.status == "active",
                SupplierDocument.valid_to == as_of_date,
            )
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def upsert_supplier_product(self, item: SupplierProduct) -> SupplierProduct:
        stmt = select(SupplierProduct).where(
            SupplierProduct.supplier_id == item.supplier_id,
            SupplierProduct.variant_id == item.variant_id,
        )
        existing = (await self.session.execute(stmt)).scalar_one_or_none()
        if existing:
            existing.supplier_sku = item.supplier_sku
            existing.last_price = item.last_price
            existing.currency = item.currency
            existing.lead_time_days = item.lead_time_days
            existing.min_order_qty = item.min_order_qty
            await self.session.flush()
            return existing
        self.session.add(item)
        await self.session.flush()
        return item

    async def list_supplier_products(self, supplier_id: uuid.UUID) -> list[SupplierProduct]:
        stmt = select(SupplierProduct).where(SupplierProduct.supplier_id == supplier_id)
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def get_supplier_product(
        self, supplier_id: uuid.UUID, variant_id: uuid.UUID
    ) -> SupplierProduct | None:
        stmt = select(SupplierProduct).where(
            SupplierProduct.supplier_id == supplier_id,
            SupplierProduct.variant_id == variant_id,
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    # --- Ledger & Balance Operations ---

    async def get_current_balance(self, supplier_id: uuid.UUID) -> Decimal:
        """Təchizatçının cari borc qalığını dəyişməz jurnaldan hesablayır."""
        # CREDIT increases payable, DEBIT decreases payable
        credit_stmt = select(
            func.coalesce(func.sum(SupplierLedgerEntry.amount), Decimal("0.0000"))
        ).where(
            SupplierLedgerEntry.supplier_id == supplier_id,
            SupplierLedgerEntry.direction == SupplierLedgerDirection.CREDIT.value,
        )
        debit_stmt = select(
            func.coalesce(func.sum(SupplierLedgerEntry.amount), Decimal("0.0000"))
        ).where(
            SupplierLedgerEntry.supplier_id == supplier_id,
            SupplierLedgerEntry.direction == SupplierLedgerDirection.DEBIT.value,
        )

        credit_total = (await self.session.execute(credit_stmt)).scalar_one()
        debit_total = (await self.session.execute(debit_stmt)).scalar_one()
        return Decimal(credit_total) - Decimal(debit_total)

    async def add_ledger_entry(self, entry: SupplierLedgerEntry) -> SupplierLedgerEntry:
        # Son qalığı tapırıq və balance_after təyin edirik
        current_bal = await self.get_current_balance(entry.supplier_id)
        if entry.direction == SupplierLedgerDirection.CREDIT.value:
            new_bal = current_bal + entry.amount
        else:
            new_bal = current_bal - entry.amount
        entry.balance_after = new_bal
        self.session.add(entry)
        await self.session.flush()
        return entry

    async def list_ledger_entries(
        self, supplier_id: uuid.UUID, limit: int = 100, offset: int = 0
    ) -> list[SupplierLedgerEntry]:
        stmt = (
            select(SupplierLedgerEntry)
            .where(SupplierLedgerEntry.supplier_id == supplier_id)
            .order_by(SupplierLedgerEntry.occurred_at.desc(), SupplierLedgerEntry.posted_at.desc())
            .limit(limit)
            .offset(offset)
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def re_point_relations(
        self, source_supplier_id: uuid.UUID, target_supplier_id: uuid.UUID
    ) -> None:
        """Birləşdirmə (Merge) zamanı bütün əlaqəli cədvəlləri yeni təchizatçıya yönləndirir."""
        await self.session.execute(
            update(SupplierContact)
            .where(SupplierContact.supplier_id == source_supplier_id)
            .values(supplier_id=target_supplier_id)
        )
        await self.session.execute(
            update(SupplierDocument)
            .where(SupplierDocument.supplier_id == source_supplier_id)
            .values(supplier_id=target_supplier_id)
        )
        await self.session.execute(
            update(SupplierProduct)
            .where(SupplierProduct.supplier_id == source_supplier_id)
            .values(supplier_id=target_supplier_id)
        )
        await self.session.execute(
            update(SupplierLedgerEntry)
            .where(SupplierLedgerEntry.supplier_id == source_supplier_id)
            .values(supplier_id=target_supplier_id)
        )
        await self.session.flush()
