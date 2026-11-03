"""Kataloq Modulu Sxemləri (Catalog Pydantic Schemas / DTOs)."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# --- Kateqoriyalar ---


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    parent_id: uuid.UUID | None = None
    name: str
    code: str
    level: int
    path: str
    sort_order: int
    is_active: bool
    redirect_category_id: uuid.UUID | None = None
    default_min_stock: int | None = None
    created_at: datetime
    updated_at: datetime
    children: list[CategoryResponse] = []


class CategoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=2, max_length=150)
    code: str = Field(..., min_length=2, max_length=50)
    parent_id: uuid.UUID | None = None
    level: int = Field(default=3, ge=1, le=4)
    sort_order: int = Field(default=0)
    default_min_stock: int | None = Field(default=None, ge=0)


class CategoryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=2, max_length=150)
    parent_id: uuid.UUID | None = None
    sort_order: int | None = None
    is_active: bool | None = None
    default_min_stock: int | None = Field(default=None, ge=0)


class CategoryMergeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_category_id: uuid.UUID = Field(
        ..., description="Məhsulların köçürüləcəyi hədəf kateqoriya"
    )
    reason: str = Field(..., min_length=3, description="Birləşdirmənin səbəbi")


# --- Brendlər ---


class BrandResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    code: str
    logo_url: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class BrandCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=2, max_length=150)
    code: str = Field(..., min_length=2, max_length=50)
    logo_url: str | None = Field(default=None, max_length=500)


class BrandUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=2, max_length=150)
    logo_url: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None


# --- Ölçü Vahidləri və Vergi Sinifləri ---


class UnitOfMeasureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name_az: str
    precision: int
    is_active: bool


class UnitOfMeasureCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(..., min_length=1, max_length=20)
    name_az: str = Field(..., min_length=1, max_length=50)
    precision: int = Field(default=0, ge=0, le=4)


class TaxClassResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    code: str
    name_az: str
    rate_ref: str
    is_active: bool


class TaxClassCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(..., min_length=2, max_length=50)
    name_az: str = Field(..., min_length=2, max_length=100)
    rate_ref: str = Field(
        ..., min_length=2, max_length=50, description="settings.tax_rates-dəki koda istinad"
    )


# --- Atributlar ---


class ProductAttributeValueResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    attribute_id: uuid.UUID
    value: str
    code: str
    color_hex: str | None = None
    sort_order: int


class ProductAttributeValueCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=1, max_length=50)
    color_hex: str | None = Field(default=None, max_length=20)
    sort_order: int = Field(default=0)


class ProductAttributeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    code: str
    attribute_type: str
    is_variant_defining: bool
    is_active: bool
    sort_order: int
    values: list[ProductAttributeValueResponse] = []


class ProductAttributeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=2, max_length=100)
    code: str = Field(..., min_length=2, max_length=50)
    attribute_type: str = Field(default="select")
    is_variant_defining: bool = Field(default=True)
    sort_order: int = Field(default=0)
    values: list[ProductAttributeValueCreate] = []


# --- Şəkillər ---


class ProductImageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    variant_id: uuid.UUID | None = None
    url: str
    thumbnail_url: str | None = None
    is_primary: bool
    sort_order: int
    created_at: datetime


class ProductImageReorderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image_ids: list[uuid.UUID]


# --- Məhsul Variantları ---


class ProductVariantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    company_id: uuid.UUID
    sku: str
    barcode: str | None = None
    size: str | None = None
    color: str | None = None
    other_attributes: dict[str, Any] | None = None
    price: Decimal | None = None
    price_override: Decimal | None = None
    cost_price: Decimal | None = None  # catalog.cost.view icazəsi olmadıqda None qayıdır
    margin_percent: Decimal | None = None
    min_stock: int | None = None
    effective_min_stock: int = 5
    status: str
    version: int
    stock_on_hand: int = 0
    stock_available: int = 0
    stock_status: str = "out_of_stock"
    created_at: datetime
    updated_at: datetime


class ProductVariantCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sku: str | None = Field(default=None, max_length=100)
    barcode: str | None = Field(default=None, max_length=100)
    size: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=50)
    other_attributes: dict[str, Any] | None = None
    price_override: Decimal | None = Field(default=None, ge=0)
    cost_price: Decimal | None = Field(default=None, ge=0)
    min_stock: int | None = Field(default=None, ge=0)


class ProductVariantUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sku: str | None = Field(default=None, max_length=100)
    barcode: str | None = Field(default=None, max_length=100)
    size: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=50)
    other_attributes: dict[str, Any] | None = None
    price_override: Decimal | None = Field(default=None, ge=0)
    cost_price: Decimal | None = Field(default=None, ge=0)
    min_stock: int | None = Field(default=None, ge=0)
    status: str | None = None
    version: int | None = Field(default=None, ge=1)


class VariantUniquenessCheckRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sku: str
    barcode: str | None = None
    exclude_variant_id: uuid.UUID | None = None


class VariantUniquenessCheckResponse(BaseModel):
    is_sku_available: bool
    is_barcode_available: bool
    conflicting_sku_variant_id: uuid.UUID | None = None
    conflicting_barcode_variant_id: uuid.UUID | None = None


# --- Valideyn Məhsul (Product) ---


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    internal_code: str
    name: str
    description: str | None = None
    section: str
    type: str
    category_id: uuid.UUID
    subcategory_id: uuid.UUID | None = None
    brand_id: uuid.UUID | None = None
    unit_id: uuid.UUID | None = None
    tax_class_id: uuid.UUID | None = None
    status: str
    is_sell_through: bool
    min_stock_default: int | None = None
    attributes_schema: dict[str, Any] | None = None
    version: int
    variants: list[ProductVariantResponse] = []
    images: list[ProductImageResponse] = []
    created_at: datetime
    updated_at: datetime


class ProductListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    internal_code: str
    name: str
    section: str
    type: str
    category_id: uuid.UUID
    category_name: str | None = None
    brand_id: uuid.UUID | None = None
    brand_name: str | None = None
    status: str
    is_sell_through: bool
    variants_count: int = 0
    min_price: Decimal | None = None
    max_price: Decimal | None = None
    total_stock_on_hand: int = 0
    total_stock_available: int = 0
    primary_image_url: str | None = None
    created_at: datetime


class ProductCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    internal_code: str | None = Field(default=None, max_length=50)
    name: str = Field(..., min_length=2, max_length=255)
    description: str | None = None
    section: str = Field(..., min_length=2, max_length=50)
    type: str = Field(..., min_length=2, max_length=50)
    category_id: uuid.UUID
    subcategory_id: uuid.UUID | None = None
    brand_id: uuid.UUID | None = None
    unit_id: uuid.UUID | None = None
    tax_class_id: uuid.UUID | None = None
    min_stock_default: int | None = Field(default=None, ge=0)
    attributes_schema: dict[str, Any] | None = None
    initial_variants: list[ProductVariantCreate] = []


class ProductUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = None
    section: str | None = None
    type: str | None = None
    category_id: uuid.UUID | None = None
    subcategory_id: uuid.UUID | None = None
    brand_id: uuid.UUID | None = None
    unit_id: uuid.UUID | None = None
    tax_class_id: uuid.UUID | None = None
    min_stock_default: int | None = Field(default=None, ge=0)
    attributes_schema: dict[str, Any] | None = None
    status: str | None = None
    is_sell_through: bool | None = None
    version: int = Field(..., ge=1)


class ProductDiscontinueRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_sell_through: bool = Field(
        default=True, description="Stokdakı malların satışına icazə verilsinmi?"
    )
    reason: str | None = Field(default=None, description="Dayandırma səbəbi")


class ProductBulkStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_ids: list[uuid.UUID]
    new_status: Literal["active", "discontinued", "draft"]


class ProductBulkCategoryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_ids: list[uuid.UUID]
    category_id: uuid.UUID


# --- Matris Variant Generatoru ---


class VariantMatrixGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sizes: list[str] = Field(..., min_length=1)
    colors: list[str] = Field(..., min_length=1)
    dry_run: bool = Field(default=True, description="Dry-run rejimində yalnız önizləmə qaytarılır")
    default_price: Decimal | None = Field(default=None, ge=0)
    default_cost: Decimal | None = Field(default=None, ge=0)


class VariantMatrixItemPreview(BaseModel):
    sku: str
    size: str
    color: str
    barcode: str | None = None
    price: Decimal | None = None
    cost: Decimal | None = None
    will_create: bool
    conflict_reason: str | None = None


class VariantMatrixGenerateResponse(BaseModel):
    total_combinations: int
    to_create: int
    conflicts: int
    items: list[VariantMatrixItemPreview]


# --- Qiymət və Maya Dəyəri Dəyişikliyi ---


class PriceChangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    price: Decimal = Field(..., ge=0, description="Yeni satış qiyməti")
    effective_from: datetime | None = None
    reason: str | None = Field(default=None, description="Qiymət dəyişikliyi əsaslandırması")
    branch_id: uuid.UUID | None = None


class PriceHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    variant_id: uuid.UUID
    product_id: uuid.UUID
    price_list_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    value: Decimal
    currency: str
    effective_from: datetime
    effective_to: datetime | None = None
    changed_by: uuid.UUID | None = None
    reason: str | None = None
    source: str
    created_at: datetime


class CostChangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cost: Decimal = Field(..., ge=0, description="Yeni maya dəyəri")
    effective_from: datetime | None = None
    reason: str | None = Field(default=None, description="Maya dəyəri dəyişikliyi əsaslandırması")


class CostHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    variant_id: uuid.UUID
    product_id: uuid.UUID
    value: Decimal
    currency: str
    effective_from: datetime
    effective_to: datetime | None = None
    changed_by: uuid.UUID | None = None
    reason: str | None = None
    source: str
    created_at: datetime


class BulkPriceItemUpdate(BaseModel):
    variant_id: uuid.UUID
    new_price: Decimal = Field(..., ge=0)


class BulkPriceUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    updates: list[BulkPriceItemUpdate]
    reason: str = Field(..., min_length=3)
    dry_run: bool = Field(default=True)
    effective_from: datetime | None = None


class BulkPriceUpdateResponse(BaseModel):
    total_items: int
    dry_run: bool
    preview: list[dict[str, Any]]


# --- POS üçün Sürətli Axtarış (Lookup) ---


class PosLookupResponse(BaseModel):
    variant_id: uuid.UUID
    product_id: uuid.UUID
    internal_code: str
    product_name: str
    sku: str
    barcode: str | None = None
    size: str | None = None
    color: str | None = None
    effective_price: Decimal
    currency: str = "AZN"
    tax_class: str | None = None
    stock_available: int = 0
    stock_status: str = "out_of_stock"


# --- Etiket / Barkod PDF Render ---


class LabelItem(BaseModel):
    variant_id: uuid.UUID
    quantity: int = Field(default=1, ge=1, le=1000)


class LabelRenderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[LabelItem]
    template_code: Literal["58x40", "40x25", "a4_sheet"] = "58x40"
    show_price: bool = True
    show_name: bool = True
    show_barcode: bool = True
    show_sku: bool = True


# --- İdxal və İxrac (Import & Export) ---


class ImportUploadResponse(BaseModel):
    job_id: uuid.UUID
    filename: str
    file_type: str
    total_rows: int
    status: str
    message: str


class ImportPreviewResponse(BaseModel):
    job_id: uuid.UUID
    total_rows: int
    valid_rows: int
    error_rows: int
    status: str
    errors: list[dict[str, Any]] = []


class ImportCommitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["all_or_nothing", "valid_rows_only"] = "all_or_nothing"


class ImportCommitResponse(BaseModel):
    job_id: uuid.UUID
    committed_rows: int
    status: str
    message: str


class CatalogExportRequest(BaseModel):
    columns: list[str] | None = None
    section: str | None = None
    type: str | None = None
    category_id: uuid.UUID | None = None
    brand_id: uuid.UUID | None = None
    status: str | None = None
    file_format: Literal["csv", "xlsx"] = "csv"
