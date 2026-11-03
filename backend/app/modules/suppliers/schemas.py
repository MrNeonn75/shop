"""Təchizatçılar Modulu Pydantic Sxemləri (Suppliers Schemas)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# --- 1. Əlaqəli Şəxslər (Contacts) ---


class SupplierContactCreate(BaseModel):
    """Təchizatçı əlaqəli şəxs yaratma sxemi."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=2, max_length=100)
    email: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=50)
    role: str | None = Field(default=None, max_length=100)
    is_primary: bool = False


class SupplierContactResponse(BaseModel):
    """Təchizatçı əlaqəli şəxs cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    supplier_id: uuid.UUID
    name: str
    email: str | None = None
    phone: str | None = None
    role: str | None = None
    is_primary: bool
    created_at: datetime
    updated_at: datetime


# --- 2. Sənədlər və Müqavilələr (Documents) ---


class SupplierDocumentCreate(BaseModel):
    """Təchizatçı sənədi daxil etmə sxemi."""

    model_config = ConfigDict(extra="forbid")

    doc_type: str = Field(..., max_length=50, description="contract, certificate, license, etc.")
    doc_number: str | None = Field(default=None, max_length=100)
    file_url: str | None = Field(default=None, max_length=500)
    valid_from: date | None = None
    valid_to: date | None = None
    metadata_info: dict[str, Any] | None = None


class SupplierDocumentResponse(BaseModel):
    """Təchizatçı sənədi cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    supplier_id: uuid.UUID
    doc_type: str
    doc_number: str | None = None
    file_url: str | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    metadata_info: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


# --- 3. Təchizatçı Məhsulları (Products Link) ---


class SupplierProductCreate(BaseModel):
    """Təchizatçı məhsul əlaqələndirmə sxemi."""

    model_config = ConfigDict(extra="forbid")

    variant_id: uuid.UUID
    product_id: uuid.UUID | None = None
    supplier_sku: str | None = Field(default=None, max_length=100)
    last_price: Decimal | None = Field(default=None, ge=0)
    currency: str = Field(default="AZN", max_length=3)
    lead_time_days: int = Field(default=0, ge=0)
    min_order_qty: int = Field(default=1, ge=1)


class SupplierProductResponse(BaseModel):
    """Təchizatçı məhsul cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    supplier_id: uuid.UUID
    product_id: uuid.UUID | None = None
    variant_id: uuid.UUID
    supplier_sku: str | None = None
    last_price: Decimal | None = None
    currency: str
    lead_time_days: int
    min_order_qty: int
    created_at: datetime
    updated_at: datetime


# --- 4. Təchizatçı Əsas Sxemləri (Supplier CRUD) ---


class SupplierCreate(BaseModel):
    """Yeni təchizatçı qeydiyyatı."""

    model_config = ConfigDict(extra="forbid")

    code: str | None = Field(
        default=None, max_length=50, description="Boş qaldıqda avtomatik SUP nömrələnir"
    )
    name: str = Field(..., min_length=2, max_length=200)
    legal_name: str | None = Field(default=None, max_length=255)
    tax_id: str | None = Field(default=None, max_length=50, description="VÖEN (10 rəqəm)")
    status: str = Field(default="active", pattern="^(active|blocked|archived)$")
    payment_terms_days: int = Field(default=30, ge=0)
    payment_method: str = Field(default="bank_transfer", max_length=50)
    default_currency: str = Field(default="AZN", max_length=3)
    bank_details: dict[str, Any] | None = None
    notes: str | None = None
    contacts: list[SupplierContactCreate] | None = None


class SupplierUpdate(BaseModel):
    """Təchizatçı məlumatlarının yenilənməsi."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=2, max_length=200)
    legal_name: str | None = Field(default=None, max_length=255)
    tax_id: str | None = Field(default=None, max_length=50)
    status: str | None = Field(default=None, pattern="^(active|blocked|archived)$")
    payment_terms_days: int | None = Field(default=None, ge=0)
    payment_method: str | None = Field(default=None, max_length=50)
    default_currency: str | None = Field(default=None, max_length=3)
    bank_details: dict[str, Any] | None = None
    notes: str | None = None


class SupplierResponse(BaseModel):
    """Təchizatçı cavab sxemi (bank rekvizitləri maskalanmış və ya açıq)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    code: str
    name: str
    legal_name: str | None = None
    tax_id: str | None = None
    status: str
    payment_terms_days: int
    payment_method: str
    default_currency: str
    bank_details: dict[str, Any] | None = None
    notes: str | None = None
    version: int
    contacts: list[SupplierContactResponse] = []
    created_at: datetime
    updated_at: datetime


# --- 5. Dublikat Yoxlanışı və Birləşdirmə (Duplicate & Merge) ---


class DuplicateCandidate(BaseModel):
    """Aşkarlanmış bənzər və ya eyni təchizatçı."""

    id: uuid.UUID
    code: str
    name: str
    tax_id: str | None = None
    match_reason: str
    similarity_score: float


class SupplierDuplicateCheckRequest(BaseModel):
    """Dublikat axtarış sorğusu."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=2)
    tax_id: str | None = None


class SupplierDuplicateCheckResponse(BaseModel):
    """Dublikat yoxlama nəticəsi."""

    has_duplicate: bool
    candidates: list[DuplicateCandidate]


class SupplierMergeRequest(BaseModel):
    """İki təchizatçının birləşdirilməsi sorğusu."""

    model_config = ConfigDict(extra="forbid")

    source_supplier_id: uuid.UUID = Field(
        ..., description="Arxivləşdiriləcək və sənədləri köçürüləcək təchizatçı"
    )
    target_supplier_id: uuid.UUID = Field(..., description="Əsas saxlanılacaq təchizatçı")
    reason: str = Field(..., min_length=5, description="Birləşdirmənin səbəbi (audit üçün)")


class SupplierMergePreviewResponse(BaseModel):
    """Birləşdirmədən əvvəl ilkin baxış."""

    source_supplier_id: uuid.UUID
    target_supplier_id: uuid.UUID
    contacts_count: int
    documents_count: int
    products_count: int
    purchase_orders_count: int
    invoices_count: int
    payments_count: int
    ledger_entries_count: int
    current_source_balance: Decimal
    current_target_balance: Decimal
    combined_balance: Decimal


# --- 6. Hesablaşma Jurnalı və Çıxarış (Ledger & Statement) ---


class SupplierLedgerEntryResponse(BaseModel):
    """Təchizatçı jurnal sətri."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entry_type: str
    direction: str
    amount: Decimal
    currency: str
    reference_type: str
    reference_id: uuid.UUID
    due_date: date | None = None
    occurred_at: datetime
    posted_at: datetime
    balance_after: Decimal
    notes: str | None = None


class AgingBuckets(BaseModel):
    """Borcun yaş kateqoriyaları (Gecikmə müddəti üzrə)."""

    current: Decimal = Decimal("0.0000")  # Hələ vaxtı çatmayıb
    days_1_30: Decimal = Decimal("0.0000")  # 1-30 gün gecikmiş
    days_31_60: Decimal = Decimal("0.0000")  # 31-60 gün gecikmiş
    days_61_90: Decimal = Decimal("0.0000")  # 61-90 gün gecikmiş
    days_90_plus: Decimal = Decimal("0.0000")  # 90+ gün gecikmiş
    total_overdue: Decimal = Decimal("0.0000")


class SupplierStatementResponse(BaseModel):
    """Təchizatçı borc çıxarışı (Statement)."""

    supplier_id: uuid.UUID
    supplier_name: str
    as_of_date: date
    total_payable: Decimal  # Şirkətin təchizatçıya olan xalis borcu
    aging: AgingBuckets
    entries: list[SupplierLedgerEntryResponse] = []


# --- 7. Performans Metrikaları (Metrics) ---


class SupplierMetricsResponse(BaseModel):
    """Təchizatçının icra və keyfiyyət metrikaları."""

    supplier_id: uuid.UUID
    total_orders_count: int
    on_time_delivery_rate: Decimal = Field(..., description="Vaxtında çatdırılma faizi (0-100%)")
    fill_rate: Decimal = Field(..., description="Sifarişin tam yerinə yetirilmə faizi (0-100%)")
    discrepancy_rate: Decimal = Field(..., description="Kənarlaşma və qüsur faizi (0-100%)")
    price_variance_vs_last_price: Decimal = Field(
        ..., description="Son qiymətə nisbətən qiymət dəyişmə meyli (%)"
    )
    average_lead_time_days: Decimal = Field(..., description="Orta sifariş icra müddəti (gün)")
