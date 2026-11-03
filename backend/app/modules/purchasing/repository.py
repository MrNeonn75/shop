"""Satınalma Modulu Repozitorisi (Purchasing Repository)."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.purchasing.models import (
    GoodsReceipt,
    LandedCostDocument,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseRequest,
    PurchaseReturn,
    ReceiptDiscrepancy,
    SupplierInvoice,
    SupplierPayment,
)


class PurchasingRepository:
    """Satınalma əməliyyatları üzrə verilənlər bazası sorğuları."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # --- 1. Purchase Requests ---

    async def create_request(self, pr: PurchaseRequest) -> PurchaseRequest:
        self.session.add(pr)
        await self.session.flush()
        return pr

    async def get_request(
        self, request_id: uuid.UUID, with_lines: bool = True
    ) -> PurchaseRequest | None:
        stmt = select(PurchaseRequest).where(PurchaseRequest.id == request_id)
        if with_lines:
            stmt = stmt.options(selectinload(PurchaseRequest.lines))
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_requests(
        self,
        company_id: uuid.UUID,
        status: str | None = None,
        warehouse_id: uuid.UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[PurchaseRequest], int]:
        stmt = (
            select(PurchaseRequest)
            .where(PurchaseRequest.company_id == company_id)
            .options(selectinload(PurchaseRequest.lines))
        )
        count_stmt = select(func.count(PurchaseRequest.id)).where(
            PurchaseRequest.company_id == company_id
        )

        if status:
            stmt = stmt.where(PurchaseRequest.status == status)
            count_stmt = count_stmt.where(PurchaseRequest.status == status)
        if warehouse_id:
            stmt = stmt.where(PurchaseRequest.requesting_warehouse_id == warehouse_id)
            count_stmt = count_stmt.where(PurchaseRequest.requesting_warehouse_id == warehouse_id)

        total = (await self.session.execute(count_stmt)).scalar_one()
        stmt = stmt.order_by(PurchaseRequest.created_at.desc()).limit(limit).offset(offset)
        items = list((await self.session.execute(stmt)).scalars().all())
        return items, int(total)

    # --- 2. Purchase Orders ---

    async def create_po(self, po: PurchaseOrder) -> PurchaseOrder:
        self.session.add(po)
        await self.session.flush()
        return po

    async def get_po(
        self, po_id: uuid.UUID, with_relations: bool = True, for_update: bool = False
    ) -> PurchaseOrder | None:
        stmt = select(PurchaseOrder).where(PurchaseOrder.id == po_id)
        if for_update:
            stmt = stmt.with_for_update()
        if with_relations:
            stmt = stmt.options(
                selectinload(PurchaseOrder.lines),
                selectinload(PurchaseOrder.revisions),
            )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_pos(
        self,
        company_id: uuid.UUID,
        supplier_id: uuid.UUID | None = None,
        status: str | None = None,
        warehouse_id: uuid.UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[PurchaseOrder], int]:
        stmt = (
            select(PurchaseOrder)
            .where(PurchaseOrder.company_id == company_id)
            .options(selectinload(PurchaseOrder.lines))
        )
        count_stmt = select(func.count(PurchaseOrder.id)).where(
            PurchaseOrder.company_id == company_id
        )

        if supplier_id:
            stmt = stmt.where(PurchaseOrder.supplier_id == supplier_id)
            count_stmt = count_stmt.where(PurchaseOrder.supplier_id == supplier_id)
        if status:
            stmt = stmt.where(PurchaseOrder.status == status)
            count_stmt = count_stmt.where(PurchaseOrder.status == status)
        if warehouse_id:
            stmt = stmt.where(PurchaseOrder.delivery_warehouse_id == warehouse_id)
            count_stmt = count_stmt.where(PurchaseOrder.delivery_warehouse_id == warehouse_id)

        total = (await self.session.execute(count_stmt)).scalar_one()
        stmt = stmt.order_by(PurchaseOrder.created_at.desc()).limit(limit).offset(offset)
        items = list((await self.session.execute(stmt)).scalars().all())
        return items, int(total)

    async def get_po_line(
        self, line_id: uuid.UUID, for_update: bool = False
    ) -> PurchaseOrderLine | None:
        stmt = select(PurchaseOrderLine).where(PurchaseOrderLine.id == line_id)
        if for_update:
            stmt = stmt.with_for_update()
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_open_po_quantity_for_variant(
        self, company_id: uuid.UUID, variant_id: uuid.UUID, warehouse_id: uuid.UUID | None = None
    ) -> int:
        stmt = (
            select(
                func.coalesce(
                    func.sum(
                        PurchaseOrderLine.quantity
                        - PurchaseOrderLine.received_qty
                        - PurchaseOrderLine.cancelled_qty
                    ),
                    0,
                )
            )
            .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.po_id)
            .where(
                PurchaseOrder.company_id == company_id,
                PurchaseOrder.status.in_(["APPROVED", "SENT", "PARTIALLY_RECEIVED"]),
                PurchaseOrderLine.variant_id == variant_id,
            )
        )
        if warehouse_id:
            stmt = stmt.where(PurchaseOrder.delivery_warehouse_id == warehouse_id)
        return int((await self.session.execute(stmt)).scalar_one())

    # --- 3. Goods Receipts ---

    async def create_receipt(self, gr: GoodsReceipt) -> GoodsReceipt:
        self.session.add(gr)
        await self.session.flush()
        return gr

    async def get_receipt(
        self, receipt_id: uuid.UUID, with_relations: bool = True, for_update: bool = False
    ) -> GoodsReceipt | None:
        stmt = select(GoodsReceipt).where(GoodsReceipt.id == receipt_id)
        if for_update:
            stmt = stmt.with_for_update()
        if with_relations:
            stmt = stmt.options(
                selectinload(GoodsReceipt.lines),
                selectinload(GoodsReceipt.discrepancies),
            )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_receipt_by_delivery_note(
        self, company_id: uuid.UUID, supplier_id: uuid.UUID, delivery_note_number: str
    ) -> GoodsReceipt | None:
        stmt = select(GoodsReceipt).where(
            GoodsReceipt.company_id == company_id,
            GoodsReceipt.supplier_id == supplier_id,
            GoodsReceipt.delivery_note_number == delivery_note_number.strip(),
            GoodsReceipt.status != "REVERSED",
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_receipts(
        self,
        company_id: uuid.UUID,
        supplier_id: uuid.UUID | None = None,
        po_id: uuid.UUID | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[GoodsReceipt], int]:
        stmt = (
            select(GoodsReceipt)
            .where(GoodsReceipt.company_id == company_id)
            .options(selectinload(GoodsReceipt.lines))
        )
        count_stmt = select(func.count(GoodsReceipt.id)).where(
            GoodsReceipt.company_id == company_id
        )

        if supplier_id:
            stmt = stmt.where(GoodsReceipt.supplier_id == supplier_id)
            count_stmt = count_stmt.where(GoodsReceipt.supplier_id == supplier_id)
        if po_id:
            stmt = stmt.where(GoodsReceipt.po_id == po_id)
            count_stmt = count_stmt.where(GoodsReceipt.po_id == po_id)
        if status:
            stmt = stmt.where(GoodsReceipt.status == status)
            count_stmt = count_stmt.where(GoodsReceipt.status == status)

        total = (await self.session.execute(count_stmt)).scalar_one()
        stmt = stmt.order_by(GoodsReceipt.created_at.desc()).limit(limit).offset(offset)
        items = list((await self.session.execute(stmt)).scalars().all())
        return items, int(total)

    async def list_discrepancies(
        self, company_id: uuid.UUID, status: str | None = None
    ) -> list[ReceiptDiscrepancy]:
        stmt = (
            select(ReceiptDiscrepancy)
            .join(GoodsReceipt, GoodsReceipt.id == ReceiptDiscrepancy.receipt_id)
            .where(GoodsReceipt.company_id == company_id)
        )
        if status:
            stmt = stmt.where(ReceiptDiscrepancy.status == status)
        stmt = stmt.order_by(ReceiptDiscrepancy.created_at.desc())
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def create_landed_cost(self, lc: LandedCostDocument) -> LandedCostDocument:
        self.session.add(lc)
        await self.session.flush()
        return lc

    # --- 4. Supplier Invoices ---

    async def create_invoice(self, inv: SupplierInvoice) -> SupplierInvoice:
        self.session.add(inv)
        await self.session.flush()
        return inv

    async def get_invoice(
        self, invoice_id: uuid.UUID, with_lines: bool = True
    ) -> SupplierInvoice | None:
        stmt = select(SupplierInvoice).where(SupplierInvoice.id == invoice_id)
        if with_lines:
            stmt = stmt.options(selectinload(SupplierInvoice.lines))
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def find_duplicate_invoice(
        self,
        company_id: uuid.UUID,
        supplier_id: uuid.UUID,
        supplier_invoice_number: str,
        invoice_date: date,
        total_amount: Decimal,
        exclude_id: uuid.UUID | None = None,
    ) -> SupplierInvoice | None:
        stmt = select(SupplierInvoice).where(
            SupplierInvoice.company_id == company_id,
            SupplierInvoice.supplier_id == supplier_id,
            SupplierInvoice.status != "CANCELLED",
            or_(
                SupplierInvoice.supplier_invoice_number == supplier_invoice_number.strip(),
                and_(
                    SupplierInvoice.invoice_date == invoice_date,
                    SupplierInvoice.total_amount == total_amount,
                ),
            ),
        )
        if exclude_id:
            stmt = stmt.where(SupplierInvoice.id != exclude_id)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_invoices(
        self,
        company_id: uuid.UUID,
        supplier_id: uuid.UUID | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[SupplierInvoice], int]:
        stmt = (
            select(SupplierInvoice)
            .where(SupplierInvoice.company_id == company_id)
            .options(selectinload(SupplierInvoice.lines))
        )
        count_stmt = select(func.count(SupplierInvoice.id)).where(
            SupplierInvoice.company_id == company_id
        )

        if supplier_id:
            stmt = stmt.where(SupplierInvoice.supplier_id == supplier_id)
            count_stmt = count_stmt.where(SupplierInvoice.supplier_id == supplier_id)
        if status:
            stmt = stmt.where(SupplierInvoice.status == status)
            count_stmt = count_stmt.where(SupplierInvoice.status == status)

        total = (await self.session.execute(count_stmt)).scalar_one()
        stmt = stmt.order_by(SupplierInvoice.invoice_date.desc()).limit(limit).offset(offset)
        items = list((await self.session.execute(stmt)).scalars().all())
        return items, int(total)

    # --- 5. Purchase Returns ---

    async def create_return(self, pr: PurchaseReturn) -> PurchaseReturn:
        self.session.add(pr)
        await self.session.flush()
        return pr

    async def get_return(
        self, return_id: uuid.UUID, with_lines: bool = True
    ) -> PurchaseReturn | None:
        stmt = select(PurchaseReturn).where(PurchaseReturn.id == return_id)
        if with_lines:
            stmt = stmt.options(selectinload(PurchaseReturn.lines))
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    # --- 6. Supplier Payments ---

    async def create_payment(self, payment: SupplierPayment) -> SupplierPayment:
        self.session.add(payment)
        await self.session.flush()
        return payment

    async def get_payment(
        self, payment_id: uuid.UUID, with_allocations: bool = True
    ) -> SupplierPayment | None:
        stmt = select(SupplierPayment).where(SupplierPayment.id == payment_id)
        if with_allocations:
            stmt = stmt.options(selectinload(SupplierPayment.allocations))
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_payments(
        self,
        company_id: uuid.UUID,
        supplier_id: uuid.UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[SupplierPayment], int]:
        stmt = (
            select(SupplierPayment)
            .where(SupplierPayment.company_id == company_id)
            .options(selectinload(SupplierPayment.allocations))
        )
        count_stmt = select(func.count(SupplierPayment.id)).where(
            SupplierPayment.company_id == company_id
        )

        if supplier_id:
            stmt = stmt.where(SupplierPayment.supplier_id == supplier_id)
            count_stmt = count_stmt.where(SupplierPayment.supplier_id == supplier_id)

        total = (await self.session.execute(count_stmt)).scalar_one()
        stmt = stmt.order_by(SupplierPayment.payment_date.desc()).limit(limit).offset(offset)
        items = list((await self.session.execute(stmt)).scalars().all())
        return items, int(total)

    async def get_unpaid_invoices_for_aging(
        self, company_id: uuid.UUID, as_of_date: date
    ) -> list[SupplierInvoice]:
        """Ödənilməmiş və ya qismən ödənilmiş fakturaları qaytarır."""
        _ = as_of_date
        stmt = (
            select(SupplierInvoice)
            .where(
                SupplierInvoice.company_id == company_id,
                SupplierInvoice.status.in_(["APPROVED_FOR_PAYMENT", "PARTIALLY_PAID"]),
                SupplierInvoice.total_amount > SupplierInvoice.paid_amount,
            )
            .order_by(SupplierInvoice.due_date.asc())
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())
