"""Qaytarmalar və Mübadilələr Modulu ORM Modelləri (Returns & Exchanges Models).

1. sale_line_return_states: Sətir üzrə paralel və təhlükəsiz qaytarma sayğacı (FOR UPDATE qoruyucusu).
2. sale_returns: Əsas qaytarma / mübadilə sənədi (Single source of truth).
3. sale_return_lines: Qaytarılan məhsul sətirləri (Orijinal sənəd snapshotları).
4. refunds: Geri ödəniş təfərrüatları (Nağd, kart, store credit).
5. store_credit_ledger: Müştəri mağaza krediti / balans hərəkətləri jurnalı.
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


class SaleLineReturnState(Base):
    """Satış Sətri Qaytarma Status Sayğacı (Row-level Concurrency Guard)."""

    __tablename__ = "sale_line_return_states"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    sale_line_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sale_lines.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    sold_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    returned_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reserved_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    __table_args__ = (
        CheckConstraint("sold_qty > 0", name="chk_return_state_sold_qty_positive"),
        CheckConstraint("returned_qty >= 0", name="chk_return_state_returned_qty_non_negative"),
        CheckConstraint("reserved_qty >= 0", name="chk_return_state_reserved_qty_non_negative"),
        CheckConstraint(
            "returned_qty + reserved_qty <= sold_qty", name="chk_return_state_sum_lte_sold"
        ),
    )


class SaleReturn(Base):
    """Qaytarma / Mübadilə Əsas Sənədi (Finalized Sale Return Record)."""

    __tablename__ = "sale_returns"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    return_no: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        unique=True,
        index=True,
        doc="Fasiləsiz unikal qaytarma nömrəsi (RET-...)",
    )
    original_sale_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sales.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
        doc="Orijinal satış sənədinin ID-si (çeksiz qaytarmalarda NULL)",
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
    processed_by_id: Mapped[uuid.UUID] = mapped_column(
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
        doc="DRAFT, PENDING_APPROVAL, COMPLETED, REJECTED, CANCELLED",
    )
    return_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="REFUND",
        index=True,
        doc="REFUND, EXCHANGE, STORE_CREDIT",
    )
    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        nullable=False,
        default=Decimal("0.00"),
        doc="Endirimsiz qaytarılan baza məbləğ",
    )
    discount_reversal_total: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00"), doc="Tərs hesablanmış endirim cəmi"
    )
    tax_reversal_total: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        nullable=False,
        default=Decimal("0.00"),
        doc="Tərs hesablanmış vergi (ƏDV) cəmi",
    )
    refund_total: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        nullable=False,
        default=Decimal("0.00"),
        doc="Müştəriyə geri ödənilən yekun məbləğ",
    )
    cost_total: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00"), doc="Geri qayıdan COGS maya dəyəri"
    )
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="AZN")
    refund_method_breakdown: Mapped[dict[str, Any] | None] = mapped_column(
        JSONBType, nullable=True, doc="Geri ödəniş metodları bölgüsü"
    )
    reason_summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    approval_reference: Mapped[str | None] = mapped_column(
        String(255), nullable=True, doc="Menecer təsdiq token referansı və ya qərar kodu"
    )
    approved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    exchange_group_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        index=True,
        doc="Mübadilə satış cütlüyü ilə əlaqələndirmə ID-si",
    )
    reprint_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    business_date: Mapped[date] = mapped_column(
        Date, nullable=False, index=True, doc="Biznes günü (Asia/Baku vaxtı ilə)"
    )
    correlation_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    lines: Mapped[list[SaleReturnLine]] = relationship(
        "SaleReturnLine",
        back_populates="sale_return",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    refunds: Mapped[list[Refund]] = relationship(
        "Refund", back_populates="sale_return", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        CheckConstraint("refund_total >= 0", name="chk_sale_return_refund_total_non_negative"),
        Index("ix_sale_returns_branch_business_date", "branch_id", "business_date"),
        Index("ix_sale_returns_register_created_at", "register_id", "created_at"),
    )


class SaleReturnLine(Base):
    """Qaytarma Sətri (Return Line Item Snapshot)."""

    __tablename__ = "sale_return_lines"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    sale_return_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sale_returns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)
    original_sale_line_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sale_lines.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("product_variants.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("products.id", ondelete="SET NULL"),
        nullable=True,
    )
    sku: Mapped[str] = mapped_column(String(100), nullable=False)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    reason_code: Mapped[str] = mapped_column(String(50), nullable=False)
    condition: Mapped[str] = mapped_column(
        String(30), nullable=False, doc="RESALABLE, DAMAGED, RESTRICTED"
    )
    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, doc="Orijinal satış sətirindən dondurulmuş vahid qiymət"
    )
    cost_price: Mapped[Decimal] = mapped_column(
        Numeric(14, 4),
        nullable=False,
        default=Decimal("0.0000"),
        doc="Orijinal COGS maya dəyəri anlıq surəti",
    )
    gross_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, doc="Endirimsiz ümumi qiymət"
    )
    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        nullable=False,
        default=Decimal("0.00"),
        doc="Mütənasib geri hesablanan endirim",
    )
    tax_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0.00"), doc="Vergi dərəcəsi (%)"
    )
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00"), doc="Geri hesablanan vergi məbləği"
    )
    refund_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, doc="Sətir üzrə faktiki geri ödəniləcək məbləğ"
    )
    destination_warehouse_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True
    )
    destination_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="available", doc="available, damaged, quarantine"
    )
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    sale_return: Mapped[SaleReturn] = relationship("SaleReturn", back_populates="lines")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="chk_sale_return_line_qty_positive"),
        CheckConstraint("refund_amount >= 0", name="chk_sale_return_line_refund_non_negative"),
        Index("uq_sale_return_line_return_no", "sale_return_id", "line_no", unique=True),
    )


class Refund(Base):
    """Geri Ödəniş Maliyyə Sətri (Refund Payment Record)."""

    __tablename__ = "refunds"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    sale_return_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sale_returns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tender_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True, doc="cash, card, store_credit, original_tender"
    )
    amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, doc="Geri ödənilən məbləğ"
    )
    provider_reference: Mapped[str | None] = mapped_column(
        String(100), nullable=True, doc="Bank/Ödəniş provayderi referansı (maskalanmış)"
    )
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="COMPLETED",
        index=True,
        doc="PENDING, COMPLETED, FAILED, UNKNOWN",
    )
    payment_attempt_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True, index=True
    )
    approval_code: Mapped[str | None] = mapped_column(
        String(100), nullable=True, doc="Avtorizasiya / RRN kodu"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    sale_return: Mapped[SaleReturn] = relationship("SaleReturn", back_populates="refunds")

    __table_args__ = (CheckConstraint("amount > 0", name="chk_refund_amount_positive"),)


class StoreCreditLedger(Base):
    """Müştəri Mağaza Krediti / Balans Jurnalı (Append-Only Store Credit Ledger)."""

    __tablename__ = "store_credit_ledger"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    entry_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        index=True,
        doc="ISSUE, REDEEM, EXPIRE, REVERSE",
    )
    amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, doc="Hərəkət məbləği (> 0)"
    )
    reference_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True, doc="RETURN, SALE, EXPIRY, MANUAL"
    )
    reference_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True, index=True
    )
    balance_after: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, doc="Hərəkətdən sonrakı toplam balans"
    )
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, index=True
    )

    __table_args__ = (
        CheckConstraint("amount > 0", name="chk_store_credit_amount_positive"),
        CheckConstraint("balance_after >= 0", name="chk_store_credit_balance_after_non_negative"),
        Index("ix_store_credit_customer_created", "customer_id", "created_at"),
    )
