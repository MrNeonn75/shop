"""Kataloq Modulu Məlumat Modelləri (Catalog Data Models).

Bu modul məhsul strukturu, variantlar matrisi, kateqoriya ağacı, brendlər,
ölçü vahidləri, vergi sinifləri, qiymət/maya dəyəri tarixçəsi, şəkillər
və idxal/ixrac cədvəllərini təyin edir.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base, utc_now

JsonType = JSON().with_variant(JSONB, "postgresql")


class Category(Base):
    """Kateqoriya ağacı (Tree: Bölmə -> Növ -> Kateqoriya -> Alt kateqoriya)."""

    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id"), nullable=False, index=True
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    level: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1
    )  # 1: Section, 2: Type, 3: Category, 4: Subcategory
    path: Mapped[str] = mapped_column(String(255), nullable=False, index=True)  # Məs: /id1/id2/id3
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    redirect_category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id"), nullable=True
    )
    default_min_stock: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    # Əlaqələr
    parent: Mapped[Category | None] = relationship(
        "Category", remote_side=[id], foreign_keys=[parent_id]
    )


class Brand(Base):
    """Məhsul Brendləri (Brands)."""

    __tablename__ = "brands"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class UnitOfMeasure(Base):
    """Ölçü Vahidləri (Units of Measure)."""

    __tablename__ = "units_of_measure"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(
        String(20), nullable=False, unique=True, index=True
    )  # ed, cut, dest, kq, m
    name_az: Mapped[str] = mapped_column(String(50), nullable=False)
    precision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class TaxClass(Base):
    """Vergi Təsnifatı Sinifləri (Tax Classes - Reyestrə istinad edir, faiz hardcode edilmir)."""

    __tablename__ = "tax_classes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name_az: Mapped[str] = mapped_column(String(100), nullable=False)
    rate_ref: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # settings.tax_rates-dəki koda istinad
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class ProductAttribute(Base):
    """Məhsul Atributları (Ölçü, Rəng, Üslub, Model və fərdi xassələr)."""

    __tablename__ = "product_attributes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    attribute_type: Mapped[str] = mapped_column(String(20), nullable=False, default="select")
    is_variant_defining: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    values: Mapped[list[ProductAttributeValue]] = relationship(
        "ProductAttributeValue", back_populates="attribute", cascade="all, delete-orphan"
    )


class ProductAttributeValue(Base):
    """Atribut Dəyərləri (məs: S, M, L və ya Qara, Ağ, Qırmızı)."""

    __tablename__ = "product_attribute_values"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    attribute_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("product_attributes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    value: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    color_hex: Mapped[str | None] = mapped_column(String(20), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    attribute: Mapped[ProductAttribute] = relationship("ProductAttribute", back_populates="values")


class Product(Base):
    """Valideyn Məhsul / Model Qeydi (Parent / Style Level)."""

    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id"), nullable=False, index=True
    )
    internal_code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    normalized_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    section: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )  # Kişi, Qadın, Uşaq, Digər
    type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )  # Geyim, Ayaqqabı, Aksesuar
    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("categories.id"), nullable=False, index=True
    )
    subcategory_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id"), nullable=True, index=True
    )
    brand_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("brands.id"), nullable=True, index=True
    )
    unit_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("units_of_measure.id"), nullable=True
    )
    tax_class_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tax_classes.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active", index=True
    )  # active, discontinued, draft
    is_sell_through: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    min_stock_default: Mapped[int | None] = mapped_column(Integer, nullable=True)
    attributes_schema: Mapped[dict[str, Any] | None] = mapped_column(JsonType, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    # Əlaqələr
    variants: Mapped[list[ProductVariant]] = relationship(
        "ProductVariant", back_populates="product", cascade="all, delete-orphan"
    )
    images: Mapped[list[ProductImage]] = relationship(
        "ProductImage", back_populates="product", cascade="all, delete-orphan"
    )
    tax_class: Mapped[TaxClass | None] = relationship("TaxClass")


class ProductVariant(Base):
    """Satış Vahidi / Variant (Sellable Unit)."""

    __tablename__ = "product_variants"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id"), nullable=False, index=True
    )
    sku: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    barcode: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True, index=True)
    size: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    color: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    other_attributes: Mapped[dict[str, Any] | None] = mapped_column(JsonType, nullable=True)
    attributes_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    price_override: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    cost_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    min_stock: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    product: Mapped[Product] = relationship("Product", back_populates="variants")

    __table_args__ = (
        Index("uq_product_variant_attributes", "product_id", "attributes_hash", unique=True),
    )


class ProductImage(Base):
    """Məhsul və Variant Şəkilləri."""

    __tablename__ = "product_images"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True, index=True
    )
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    thumbnail_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    file_key: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    product: Mapped[Product] = relationship("Product", back_populates="images")


class ProductSupplier(Base):
    """Məhsul Təchizatçıları (B6 üçün təməl cədvəl)."""

    __tablename__ = "product_suppliers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    supplier_sku: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="AZN")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class PriceList(Base):
    """Qiymət Cədvəlləri (Mərkəzi və ya Filial əsaslı qiymət siyahıları)."""

    __tablename__ = "price_lists"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id"), nullable=False, index=True
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("branches.id"), nullable=True, index=True
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="AZN")
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class PriceListItem(Base):
    """Qiymət Cədvəli Elementləri."""

    __tablename__ = "price_list_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    price_list_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("price_lists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    effective_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    effective_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PriceHistory(Base):
    """Dəyişməz Qiymət Tarixçəsi (APPEND-ONLY)."""

    __tablename__ = "price_history"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    variant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    price_list_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("price_lists.id"), nullable=True
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("branches.id"), nullable=True)
    value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="AZN")
    effective_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, index=True
    )
    effective_to: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    changed_by: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="manual")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class CostHistory(Base):
    """Dəyişməz Maya Dəyəri Tarixçəsi (APPEND-ONLY)."""

    __tablename__ = "cost_history"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    variant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="AZN")
    effective_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, index=True
    )
    effective_to: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    changed_by: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="manual")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class ExternalRef(Base):
    """Köhnə Veb-Sayt və Xarici Sistem İnteqrasiya İstinadları (Scaffold)."""

    __tablename__ = "external_refs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )  # product, variant, category
    internal_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    system_name: Mapped[str] = mapped_column(
        String(50), nullable=False, default="brendhouse_site", index=True
    )
    external_id: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="NOT_CONFIGURED")
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JsonType, nullable=True)


class ImportJob(Base):
    """Məhsul İdxal Tapşırığı (CSV / XLSX Staged Job)."""

    __tablename__ = "import_jobs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id"), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(10), nullable=False)  # csv, xlsx
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="UPLOADED", index=True
    )  # UPLOADED, VALIDATED, COMMITTED, FAILED
    mode: Mapped[str] = mapped_column(
        String(20), nullable=False, default="all_or_nothing"
    )  # all_or_nothing, valid_rows_only
    total_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    valid_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    committed_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    errors_summary: Mapped[list[dict[str, Any]] | None] = mapped_column(JsonType, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    rows: Mapped[list[ImportRow]] = relationship(
        "ImportRow", back_populates="job", cascade="all, delete-orphan"
    )


class ImportRow(Base):
    """İdxal Tapşırığının Sətirləri."""

    __tablename__ = "import_rows"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    job_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("import_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    raw_data: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)
    parsed_data: Mapped[dict[str, Any] | None] = mapped_column(JsonType, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="PENDING"
    )  # PENDING, VALID, ERROR, COMMITTED
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    job: Mapped[ImportJob] = relationship("ImportJob", back_populates="rows")
