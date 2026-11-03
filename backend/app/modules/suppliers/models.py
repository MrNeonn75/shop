"""Təchizatçılar Modulu ORM Modelləri (Suppliers Models).

Təchizatçıların əsas məlumatları, əlaqəli şəxslər (contacts), sənəd və müqavilələr (documents),
təchizatçı məhsul kataloqu (supplier_products) və dəyişməz təchizatçı jurnalı
(supplier_ledger_entries - Single Source of Truth for balances and aging).
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
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


class SupplierStatus(str, enum.Enum):
    """Təchizatçı statusları."""

    ACTIVE = "active"
    BLOCKED = "blocked"
    ARCHIVED = "archived"


class SupplierLedgerEntryType(str, enum.Enum):
    """Təchizatçı jurnalının əməliyyat növləri."""

    INVOICE = "INVOICE"  # Qaimə - borcu artırır (Credit payable)
    CREDIT_NOTE = "CREDIT_NOTE"  # Qaytarma / Kredit notası - borcu azaldır (Debit payable)
    PAYMENT = "PAYMENT"  # Ödəniş - borcu azaldır (Debit payable)
    ADJUSTMENT = "ADJUSTMENT"  # Düzəliş
    REVERSAL = "REVERSAL"  # Tərs əməliyyat (kompensasiya)


class SupplierLedgerDirection(str, enum.Enum):
    """Mühasibat istiqaməti."""

    CREDIT = "CREDIT"  # Təchizatçı qarşısında borcun artması
    DEBIT = "DEBIT"  # Təchizatçı qarşısında borcun azalması


class Supplier(Base, BaseMixin):
    """Təchizatçı əsas məlumat cədvəli."""

    __tablename__ = "suppliers"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    legal_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tax_id: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SupplierStatus.ACTIVE.value, index=True
    )
    payment_terms_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    payment_method: Mapped[str] = mapped_column(String(50), nullable=False, default="bank_transfer")
    default_currency: Mapped[str] = mapped_column(String(3), nullable=False, default="AZN")
    bank_details: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    contacts: Mapped[list[SupplierContact]] = relationship(
        "SupplierContact",
        back_populates="supplier",
        cascade="all, delete-orphan",
        order_by="SupplierContact.is_primary.desc()",
    )
    documents: Mapped[list[SupplierDocument]] = relationship(
        "SupplierDocument",
        back_populates="supplier",
        cascade="all, delete-orphan",
    )
    products: Mapped[list[SupplierProduct]] = relationship(
        "SupplierProduct",
        back_populates="supplier",
        cascade="all, delete-orphan",
    )
    ledger_entries: Mapped[list[SupplierLedgerEntry]] = relationship(
        "SupplierLedgerEntry",
        back_populates="supplier",
        order_by="SupplierLedgerEntry.occurred_at.desc()",
    )

    __table_args__ = (UniqueConstraint("company_id", "code", name="uq_suppliers_company_code"),)


class SupplierContact(Base, BaseMixin):
    """Təchizatçının əlaqəli şəxsləri."""

    __tablename__ = "supplier_contacts"

    supplier_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    role: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    supplier: Mapped[Supplier] = relationship("Supplier", back_populates="contacts")


class SupplierDocument(Base, BaseMixin):
    """Təchizatçı sənədləri (Müqavilələr, lisenziyalar, sertifikatlar)."""

    __tablename__ = "supplier_documents"

    supplier_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    doc_type: Mapped[str] = mapped_column(String(50), nullable=False)
    doc_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    file_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    valid_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    metadata_info: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)

    supplier: Mapped[Supplier] = relationship("Supplier", back_populates="documents")


class SupplierProduct(Base, BaseMixin):
    """Təchizatçının təklif etdiyi məhsul və çeşidlər (Variant link, son qiymət, MOQ)."""

    __tablename__ = "supplier_products"

    supplier_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        index=True,
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
        index=True,
    )
    supplier_sku: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 4), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="AZN")
    lead_time_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    min_order_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    supplier: Mapped[Supplier] = relationship("Supplier", back_populates="products")

    __table_args__ = (
        UniqueConstraint("supplier_id", "variant_id", name="uq_supplier_products_supplier_variant"),
    )


class SupplierLedgerEntry(Base, BaseMixin):
    """Dəyişməz Təchizatçı Hesablaşma Jurnalı (Append-Only Ledger).

    Təchizatçının cari borc qalığı heç vaxt ayrıca redaktə edilə bilən xana kimi saxlanmır.
    Bütün borc və ödənişlər yalnız bu jurnaldan törədilir.
    """

    __tablename__ = "supplier_ledger_entries"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    entry_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="AZN")
    reference_type: Mapped[str] = mapped_column(String(50), nullable=False)
    reference_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    posted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    balance_after: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False, default=Decimal("0.0000")
    )

    supplier: Mapped[Supplier] = relationship("Supplier", back_populates="ledger_entries")

    __table_args__ = (Index("ix_supplier_ledger_aging", "supplier_id", "due_date", "direction"),)
