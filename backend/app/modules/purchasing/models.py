"""Satınalma və Təchizat Modulu ORM Modelləri (Purchasing Models).

Satınalma sorğuları (Purchase Requests), Sifarişlər (Purchase Orders),
Qəbul aktları (Goods Receipts), Təchizatçı qaimələri (Invoices & 3-way match),
Qaytarmalar (Purchase Returns) və Təchizatçı ödənişləri (Payments).
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base, BaseMixin, utc_now

JSONBType = JSONB().with_variant(JSON(), "sqlite")  # type: ignore[no-untyped-call]


# --- Status Enums ---


class PurchaseRequestStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    RETURNED = "RETURNED"
    CONVERTED = "CONVERTED"
    CANCELLED = "CANCELLED"


class PurchaseOrderStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    SENT = "SENT"
    PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED"
    RECEIVED = "RECEIVED"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"


class GoodsReceiptStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    CONFIRMED = "CONFIRMED"
    REVERSED = "REVERSED"


class SupplierInvoiceStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    MATCHING = "MATCHING"
    APPROVED_FOR_PAYMENT = "APPROVED_FOR_PAYMENT"
    DISPUTED = "DISPUTED"
    ON_HOLD = "ON_HOLD"
    PARTIALLY_PAID = "PARTIALLY_PAID"
    PAID = "PAID"
    CANCELLED = "CANCELLED"


class PaymentStatus(str, enum.Enum):
    POSTED = "POSTED"
    REVERSED = "REVERSED"


# --- 1. Satınalma Sorğuları (Purchase Requests) ---


class PurchaseRequest(Base, BaseMixin):
    """Filial və ya anbarın daxili satınalma tələbnaməsi."""

    __tablename__ = "purchase_requests"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    request_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    requesting_branch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    requesting_warehouse_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warehouses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    requester_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    needed_by: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=PurchaseRequestStatus.DRAFT.value, index=True
    )
    total_estimated_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False, default=Decimal("0.0000")
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    lines: Mapped[list[PurchaseRequestLine]] = relationship(
        "PurchaseRequestLine",
        back_populates="request",
        cascade="all, delete-orphan",
        order_by="PurchaseRequestLine.id",
    )

    __table_args__ = (
        UniqueConstraint("company_id", "request_no", name="uq_pr_company_request_no"),
    )


class PurchaseRequestLine(Base, BaseMixin):
    """Satınalma sorğusunun sətirləri."""

    __tablename__ = "purchase_request_lines"

    request_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("purchase_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    requested_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    estimated_unit_price: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False, default=Decimal("0.0000")
    )
    total_estimated_price: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False, default=Decimal("0.0000")
    )
    needed_by: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)

    request: Mapped[PurchaseRequest] = relationship("PurchaseRequest", back_populates="lines")


# --- 2. Satınalma Sifarişləri (Purchase Orders) ---


class PurchaseOrder(Base, BaseMixin):
    """Təchizatçıya rəsmi Satınalma Sifarişi (PO)."""

    __tablename__ = "purchase_orders"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    po_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    delivery_warehouse_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warehouses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    purchase_request_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("purchase_requests.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    order_date: Mapped[date] = mapped_column(Date, nullable=False, default=utc_now)
    expected_date: Mapped[date] = mapped_column(Date, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="AZN")
    payment_terms_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    status: Mapped[str] = mapped_column(
        String(25), nullable=False, default=PurchaseOrderStatus.DRAFT.value, index=True
    )
    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False, default=Decimal("0.0000")
    )
    discount_total: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False, default=Decimal("0.0000")
    )
    tax_total: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False, default=Decimal("0.0000")
    )
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False, default=Decimal("0.0000")
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    approved_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    close_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    lines: Mapped[list[PurchaseOrderLine]] = relationship(
        "PurchaseOrderLine",
        back_populates="po",
        cascade="all, delete-orphan",
        order_by="PurchaseOrderLine.line_no",
    )
    revisions: Mapped[list[PORevision]] = relationship(
        "PORevision",
        back_populates="po",
        cascade="all, delete-orphan",
        order_by="PORevision.revision_number.desc()",
    )

    __table_args__ = (UniqueConstraint("company_id", "po_no", name="uq_po_company_po_no"),)


class PurchaseOrderLine(Base, BaseMixin):
    """Sifariş sətirləri."""

    __tablename__ = "purchase_order_lines"

    po_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("purchase_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    line_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    discount_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0.00")
    )
    tax_class_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    tax_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0.00")
    )
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False, default=Decimal("0.0000")
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    received_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cancelled_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)

    po: Mapped[PurchaseOrder] = relationship("PurchaseOrder", back_populates="lines")

    @property
    def outstanding_qty(self) -> int:
        return max(0, self.quantity - self.received_qty - self.cancelled_qty)


class PORevision(Base, BaseMixin):
    """Təsdiqdən sonra PO dəyişiklik tarixcəsi (Amendment)."""

    __tablename__ = "po_revisions"

    po_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("purchase_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    previous_total: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    new_total: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    change_reason: Mapped[str] = mapped_column(Text, nullable=False)
    changed_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    diff_data: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)

    po: Mapped[PurchaseOrder] = relationship("PurchaseOrder", back_populates="revisions")


# --- 3. Malların Qəbul Aktları (Goods Receipts - Inventory Gateway) ---


class GoodsReceipt(Base, BaseMixin):
    """Satınalınmış malların anbara fiziki daxil olma aktı.

    Qeyd: Satınalma mallarının inventara daxil olmasının YEGANA yoludur.
    """

    __tablename__ = "goods_receipts"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    receipt_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    po_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("purchase_orders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warehouses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    delivery_note_number: Mapped[str] = mapped_column(String(100), nullable=False)
    received_date: Mapped[date] = mapped_column(Date, nullable=False, default=utc_now)
    receiving_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=GoodsReceiptStatus.DRAFT.value, index=True
    )
    total_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_cost: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False, default=Decimal("0.0000")
    )
    attachments: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONBType, nullable=False, default=list
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    lines: Mapped[list[GoodsReceiptLine]] = relationship(
        "GoodsReceiptLine",
        back_populates="receipt",
        cascade="all, delete-orphan",
        order_by="GoodsReceiptLine.line_no",
    )
    discrepancies: Mapped[list[ReceiptDiscrepancy]] = relationship(
        "ReceiptDiscrepancy",
        back_populates="receipt",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("company_id", "receipt_no", name="uq_gr_company_receipt_no"),
        Index("ix_gr_delivery_note_dup", "company_id", "supplier_id", "delivery_note_number"),
    )


class GoodsReceiptLine(Base, BaseMixin):
    """Qəbul aktının sətirləri."""

    __tablename__ = "goods_receipt_lines"

    receipt_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("goods_receipts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    po_line_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("purchase_order_lines.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    line_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    ordered_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    previously_received_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    received_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    rejected_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    damaged_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    batch_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    total_cost: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)

    receipt: Mapped[GoodsReceipt] = relationship("GoodsReceipt", back_populates="lines")


class LandedCostDocument(Base, BaseMixin):
    """Gömrük və daşıma xərclərinin qəbul sənədinə bölüşdürülməsi."""

    __tablename__ = "landed_cost_documents"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    receipt_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("goods_receipts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    cost_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # freight, customs, insurance
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="AZN")
    allocation_method: Mapped[str] = mapped_column(
        String(20), nullable=False, default="by_value"
    )  # by_value, by_quantity, by_weight
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    allocations: Mapped[list[LandedCostAllocation]] = relationship(
        "LandedCostAllocation",
        back_populates="landed_cost",
        cascade="all, delete-orphan",
    )


class LandedCostAllocation(Base, BaseMixin):
    """Qəbul aktının hər sətrinə düşən əlavə maya payı."""

    __tablename__ = "landed_cost_allocations"

    landed_cost_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("landed_cost_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    receipt_line_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("goods_receipt_lines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    allocated_amount: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    additional_unit_cost: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)

    landed_cost: Mapped[LandedCostDocument] = relationship(
        "LandedCostDocument", back_populates="allocations"
    )


class ReceiptDiscrepancy(Base, BaseMixin):
    """Sifariş ilə faktiki qəbul arasındakı kənarlaşma qeydi."""

    __tablename__ = "receipt_discrepancies"

    receipt_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("goods_receipts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    ordered_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    received_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    damaged_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rejected_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    variance_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="OPEN"
    )  # OPEN, RESOLVED, ACCEPTED
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    receipt: Mapped[GoodsReceipt] = relationship("GoodsReceipt", back_populates="discrepancies")


# --- 4. Təchizatçı Qaimələri (Supplier Invoices & 3-Way Match) ---


class SupplierInvoice(Base, BaseMixin):
    """Təchizatçının təqdim etdiyi vergi/satış qaiməsi (3-way match predmeti)."""

    __tablename__ = "supplier_invoices"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    invoice_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    supplier_invoice_number: Mapped[str] = mapped_column(String(100), nullable=False)
    invoice_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    po_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("purchase_orders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    receipt_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("goods_receipts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="AZN")
    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False, default=Decimal("0.0000")
    )
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False, default=Decimal("0.0000")
    )
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False, default=Decimal("0.0000")
    )
    paid_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False, default=Decimal("0.0000")
    )
    match_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="MATCHED"
    )  # MATCHED, VARIANCE_TOLERATED, DISPUTED
    status: Mapped[str] = mapped_column(
        String(25), nullable=False, default=SupplierInvoiceStatus.DRAFT.value, index=True
    )
    attachments: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONBType, nullable=False, default=list
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    lines: Mapped[list[SupplierInvoiceLine]] = relationship(
        "SupplierInvoiceLine",
        back_populates="invoice",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("company_id", "invoice_no", name="uq_si_company_invoice_no"),
        Index("ix_si_supplier_inv_num", "company_id", "supplier_id", "supplier_invoice_number"),
    )


class SupplierInvoiceLine(Base, BaseMixin):
    """Təchizatçı qaiməsinin sətirləri."""

    __tablename__ = "supplier_invoice_lines"

    invoice_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("supplier_invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    po_line_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    receipt_line_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    variant_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0.00")
    )
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False, default=Decimal("0.0000")
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    match_result: Mapped[str] = mapped_column(String(30), nullable=False, default="MATCHED")
    variance_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    invoice: Mapped[SupplierInvoice] = relationship("SupplierInvoice", back_populates="lines")


# --- 5. Təchizatçıya Qaytarma və Kredit Notası (Purchase Returns & Credit Notes) ---


class PurchaseReturn(Base, BaseMixin):
    """Təchizatçıya mal qaytarma sənədi."""

    __tablename__ = "purchase_returns"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    return_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    receipt_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("goods_receipts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warehouses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    reason_code: Mapped[str] = mapped_column(String(50), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False, default=Decimal("0.0000")
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="CONFIRMED")

    lines: Mapped[list[PurchaseReturnLine]] = relationship(
        "PurchaseReturnLine",
        back_populates="return_doc",
        cascade="all, delete-orphan",
    )


class PurchaseReturnLine(Base, BaseMixin):
    """Qaytarma sətirləri."""

    __tablename__ = "purchase_return_lines"

    return_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("purchase_returns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)

    return_doc: Mapped[PurchaseReturn] = relationship("PurchaseReturn", back_populates="lines")


# --- 6. Təchizatçı Ödənişləri (Supplier Payments & Allocations) ---


class SupplierPayment(Base, BaseMixin):
    """Təchizatçıya faktiki ödəniş."""

    __tablename__ = "supplier_payments"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    payment_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    payment_method: Mapped[str] = mapped_column(String(50), nullable=False, default="bank_transfer")
    source_account_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False, default=utc_now)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="AZN")
    reference_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=PaymentStatus.POSTED.value, index=True
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    approved_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    allocations: Mapped[list[PaymentAllocation]] = relationship(
        "PaymentAllocation",
        back_populates="payment",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("company_id", "payment_no", name="uq_sp_company_payment_no"),
    )


class PaymentAllocation(Base, BaseMixin):
    """Ödənişin konkret qaimələrə bölüşdürülməsi."""

    __tablename__ = "payment_allocations"

    payment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("supplier_payments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("supplier_invoices.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    allocated_amount: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)

    payment: Mapped[SupplierPayment] = relationship("SupplierPayment", back_populates="allocations")
