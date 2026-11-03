"""Satışlar Modulu ORM Modelləri (Sales Models).

Tamamlanmış satış qeydləri, immutable sətirlər, ödənişlər və satış hadisələri.
Tarixçə silinməzdir (Never delete finalized sales/payments), ləğv yalnız əlaqəli reversalla mümkündür.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base, utc_now

JSONBType = JSONB().with_variant(JSON(), "sqlite")  # type: ignore[no-untyped-call]


class Sale(Base):
    """Tamamlanmış Satış Sənədi (Finalized Sale Record)."""

    __tablename__ = "sales"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    receipt_no: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        unique=True,
        index=True,
        doc="Fasiləsiz fiskal/qeydiyyat çək nömrəsi",
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    register_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("cash_registers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    shift_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("pos_shifts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    cashier_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="COMPLETED",
        index=True,
        doc="COMPLETED, PARTIALLY_RETURNED, RETURNED, CANCELLED",
    )
    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00"), doc="Endirimsiz ümumi məbləğ"
    )
    discount_total: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00"), doc="Toplam endirim"
    )
    tax_total: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00"), doc="Toplam vergi (ƏDV)"
    )
    grand_total: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00"), doc="Yekun ödəniləcək məbləğ"
    )
    paid_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00"), doc="Ödənilmiş məbləğ"
    )
    change_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00"), doc="Qaytarılan qalıq (pul qalığı)"
    )
    cost_total: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00"), doc="Toplam COGS maya dəyəri"
    )
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="AZN")
    breakdown: Mapped[dict[str, Any] | None] = mapped_column(
        JSONBType, nullable=True, doc="Endirim və vergi kalkulyasiyasının dondurulmuş anlıq surəti"
    )
    payment_summary: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSONBType, nullable=True, doc="Ödəniş üsulları üzrə xülasə"
    )
    reprint_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, doc="Təkrar çap edilmə sayı"
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    cancellation_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    business_date: Mapped[date] = mapped_column(
        Date, nullable=False, index=True, doc="Biznes günü (Asia/Baku vaxtı ilə)"
    )
    correlation_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    exchange_group_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        index=True,
        doc="Mübadilə (Exchange) əməliyyatını bağlayan qrup ID",
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    lines: Mapped[list[SaleLine]] = relationship(
        "SaleLine", back_populates="sale", cascade="all, delete-orphan", lazy="selectin"
    )
    payments: Mapped[list[SalePayment]] = relationship(
        "SalePayment", back_populates="sale", cascade="all, delete-orphan", lazy="selectin"
    )
    events: Mapped[list[SaleEvent]] = relationship(
        "SaleEvent", back_populates="sale", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        CheckConstraint("grand_total >= 0", name="chk_sale_grand_total_non_negative"),
        CheckConstraint("paid_amount >= grand_total", name="chk_sale_paid_gte_grand_total"),
        Index("ix_sales_branch_business_date", "branch_id", "business_date"),
        Index("ix_sales_register_created_at", "register_id", "created_at"),
    )


class SaleLine(Base):
    """Satış Sətri (Immutable Sale Line Item Snapshot)."""

    __tablename__ = "sale_lines"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    sale_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sales.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)
    variant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("product_variants.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    sku: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    barcode: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, doc="Tətbiq edilmiş satış vahid qiyməti"
    )
    cost_price: Mapped[Decimal] = mapped_column(
        Numeric(14, 4),
        nullable=False,
        default=Decimal("0.0000"),
        doc="Maya dəyəri anlıq surəti (COGS snapshot)",
    )
    gross_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, doc="Endirimsiz ümumi qiymət (unit_price * quantity)"
    )
    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00"), doc="Sətir üzrə endirim"
    )
    tax_class_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    tax_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0.00"), doc="Vergi dərəcəsi (%)"
    )
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00"), doc="Sətir üzrə vergi məbləği"
    )
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, doc="Sətir yekun məbləği (gross - discount)"
    )
    promotion_info: Mapped[dict[str, Any] | None] = mapped_column(
        JSONBType, nullable=True, doc="Tətbiq edilmiş kampaniya və endirim detalları"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    sale: Mapped[Sale] = relationship("Sale", back_populates="lines")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="chk_sale_line_qty_positive"),
        CheckConstraint("unit_price >= 0", name="chk_sale_line_unit_price_non_negative"),
        Index("uq_sale_line_sale_no", "sale_id", "line_no", unique=True),
    )


class SalePayment(Base):
    """Satış Ödənişi Sətiri (Sale Payment Tender Record)."""

    __tablename__ = "sale_payments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    sale_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sales.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tender_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        doc="cash, card, gift_card, loyalty_points, external_terminal",
    )
    amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, doc="Hesablanan xalis ödəniş məbləği"
    )
    tendered_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, doc="Müştəri tərəfindən təqdim edilən məbləğ"
    )
    change_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00"), doc="Qaytarılan qalıq"
    )
    payment_attempt_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True, index=True
    )
    provider_confirmation_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True, doc="Bank/Ödəniş provayderinin təsdiq ID-si"
    )
    approval_code: Mapped[str | None] = mapped_column(
        String(100), nullable=True, doc="Bank tranzaksiya avtorizasiya kodu (RRN/AuthCode)"
    )
    masked_reference: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        doc="Maskalanmış kart sonluğu (məs: ****1234) və ya terminal referansı",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    sale: Mapped[Sale] = relationship("Sale", back_populates="payments")

    __table_args__ = (
        CheckConstraint("amount > 0", name="chk_sale_payment_amount_positive"),
        CheckConstraint("tendered_amount >= amount", name="chk_sale_payment_tendered_gte_amount"),
    )


class SaleEvent(Base):
    """Satış Hadisələri Xronologiyası (Sale Audit / Lifecycle Timeline)."""

    __tablename__ = "sale_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    sale_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sales.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True, doc="CREATED, REPRINTED, CANCELLED, RETURN_LINKED"
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, index=True
    )

    sale: Mapped[Sale] = relationship("Sale", back_populates="events")
