"""İnventar Modulu Sxemləri və DTO-lar (Inventory Pydantic Schemas).

Stok hərəkətləri (ledger), cari qalıqlar (balances), rezervasiyalar (reservations),
anbar sənədləri (documents), fiziki sayım/inventarizasiya (counts),
maya dəyəri və qiymətləndirmə (valuation) və balans audit hesabatları.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# --- 1. Stok Hərəkəti (Stock Movement / Ledger) ---


class MovementDraft(BaseModel):
    """Posting engine-ə göndərilən stok hərəkəti layihəsi."""

    model_config = ConfigDict(extra="forbid")

    variant_id: uuid.UUID
    quantity: int = Field(..., gt=0, description="Hərəkət miqdarı (müsbət tam ədəd)")
    movement_type: str = Field(..., description="RECEIPT, ISSUE, SALE, TRANSFER_OUT və s.")
    from_warehouse_id: uuid.UUID | None = None
    to_warehouse_id: uuid.UUID | None = None
    from_status: str = Field(default="available", description="available, damaged, quarantine")
    to_status: str = Field(default="available", description="available, damaged, quarantine")
    unit_cost: Decimal = Field(default=Decimal("0.0000"), ge=0)
    reference_type: str = Field(..., description="stock_document, transfer, pos_sale və s.")
    reference_id: uuid.UUID | None = None
    reference_line_id: uuid.UUID | None = None
    reverses_movement_id: uuid.UUID | None = None
    reason_code_id: str | None = None
    notes: str | None = None
    occurred_at: datetime | None = None


class BatchPostRequest(BaseModel):
    """Toplu stok hərəkəti qeydiyyatı sorğusu."""

    model_config = ConfigDict(extra="forbid")

    movements: list[MovementDraft] = Field(..., min_length=1)
    idempotency_key: str | None = Field(
        default=None, description="Təkrarlanmanın qarşısını alan unikal sorğu açarı"
    )
    allow_negative_override: bool = Field(
        default=False,
        description="Mənfi qalıq qadağasını səlahiyyətli istifadəçi üçün aşmaq bayrağı",
    )
    override_reason: str | None = Field(
        default=None, description="Mənfi qalıq icazəsi zamanı məcburi əsaslandırma"
    )


class StockMovementResponse(BaseModel):
    """Stok hərəkəti jurnal sətri cavabı."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    movement_no: str
    occurred_at: datetime
    posted_at: datetime
    variant_id: uuid.UUID
    from_warehouse_id: uuid.UUID | None = None
    to_warehouse_id: uuid.UUID | None = None
    from_status: str | None = None
    to_status: str | None = None
    quantity: int
    movement_type: str
    reference_type: str
    reference_id: uuid.UUID | None = None
    reference_line_id: uuid.UUID | None = None
    reverses_movement_id: uuid.UUID | None = None
    unit_cost: Decimal
    total_cost: Decimal
    user_id: uuid.UUID | None = None
    reason_code_id: str | None = None
    correlation_id: str | None = None
    idempotency_key: str | None = None
    notes: str | None = None


class BatchPostResponse(BaseModel):
    """Toplu hərəkət qeydiyyatının cavabı."""

    model_config = ConfigDict(from_attributes=True)

    posted_movements: list[StockMovementResponse]
    total_quantity: int
    total_cost: Decimal


# --- 2. Stok Qalıqları (Stock Balances & Availability) ---


class StockBalanceResponse(BaseModel):
    """Anbar və variant üzrə stok qalığı cavabı."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    warehouse_id: uuid.UUID
    variant_id: uuid.UUID
    stock_status: str
    on_hand: int
    reserved: int = 0
    available: int = 0
    allow_negative: bool
    updated_at: datetime
    version: int
    sku: str | None = None
    barcode: str | None = None
    product_name: str | None = None
    warehouse_name: str | None = None


class VariantStockDetailResponse(BaseModel):
    """Bir variantın bütün anbarlar üzrə cəmlənmiş stok mənzərəsi."""

    variant_id: uuid.UUID
    total_on_hand: int
    total_reserved: int
    total_available: int
    balances: list[StockBalanceResponse]


# --- 3. Stok Rezervasiyaları (Stock Reservations) ---


class StockReservationCreate(BaseModel):
    """Rezervasiya yaratmaq üçün sorğu."""

    model_config = ConfigDict(extra="forbid")

    warehouse_id: uuid.UUID
    variant_id: uuid.UUID
    quantity: int = Field(..., gt=0)
    reference_type: str = Field(..., description="transfer, pos_cart, web_order")
    reference_id: uuid.UUID
    reference_line_id: uuid.UUID | None = None
    expires_at: datetime | None = None


class StockReservationResponse(BaseModel):
    """Rezervasiya cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    warehouse_id: uuid.UUID
    variant_id: uuid.UUID
    quantity: int
    reference_type: str
    reference_id: uuid.UUID
    reference_line_id: uuid.UUID | None = None
    status: str
    expires_at: datetime | None = None
    created_at: datetime


# --- 4. Anbar Sənədləri (Stock Documents) ---


class StockDocumentLineCreate(BaseModel):
    """Anbar sənədi sətri yaratma sxemi."""

    model_config = ConfigDict(extra="forbid")

    variant_id: uuid.UUID
    quantity: int = Field(..., gt=0)
    unit_cost: Decimal = Field(default=Decimal("0.0000"), ge=0)
    target_status: str = Field(default="available", description="available, damaged, quarantine")
    notes: str | None = Field(default=None, max_length=255)


class StockDocumentLineResponse(BaseModel):
    """Anbar sənədi sətri cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID
    line_no: int
    variant_id: uuid.UUID
    quantity: int
    unit_cost: Decimal
    total_cost: Decimal
    target_status: str
    notes: str | None = None


class StockDocumentCreate(BaseModel):
    """Yeni anbar sənədi (qaralama) yaratma sorğusu."""

    model_config = ConfigDict(extra="forbid")

    document_type: str = Field(
        ...,
        description="receipt, issue, adjustment, damaged, lost, returned_classification, opening_balance",
    )
    warehouse_id: uuid.UUID
    target_warehouse_id: uuid.UUID | None = None
    reason_code: str | None = None
    reason_text: str | None = None
    notes: str | None = None
    attachments: list[dict[str, Any]] | None = None
    lines: list[StockDocumentLineCreate] = Field(..., min_length=1)


class StockDocumentResponse(BaseModel):
    """Anbar sənədi tam cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    document_no: str
    document_type: str
    warehouse_id: uuid.UUID
    target_warehouse_id: uuid.UUID | None = None
    status: str
    total_items: int
    total_quantity: int
    total_cost: Decimal
    creator_id: uuid.UUID | None = None
    approver_id: uuid.UUID | None = None
    confirmed_at: datetime | None = None
    reversed_at: datetime | None = None
    reversal_document_id: uuid.UUID | None = None
    reason_code: str | None = None
    reason_text: str | None = None
    notes: str | None = None
    attachments: list[dict[str, Any]] | None = None
    version: int
    lines: list[StockDocumentLineResponse] = []
    created_at: datetime
    updated_at: datetime


class StockDocumentReverseRequest(BaseModel):
    """Anbar sənədinin ləğvi (kompensasiya) sorğusu."""

    model_config = ConfigDict(extra="forbid")

    reason_code: str = Field(..., min_length=2, max_length=50)
    reason_text: str | None = Field(default=None, max_length=500)


# --- 5. Fiziki İnventarizasiya və Sayım Sessiyaları (Physical Stock Counts) ---


class CountEntryCreate(BaseModel):
    """Sayım zamanı edilən barkod oxunuşu / daxiletmə."""

    model_config = ConfigDict(extra="forbid")

    variant_id: uuid.UUID | None = None
    barcode: str | None = None
    counted_qty: int = Field(default=1, gt=0)
    device_id: str | None = None


class CountEntryResponse(BaseModel):
    """Sayım daxiletməsi cavabı."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    variant_id: uuid.UUID
    counter_user_id: uuid.UUID | None = None
    device_id: str | None = None
    counted_qty: int
    scan_barcode: str | None = None
    is_undone: bool
    entered_at: datetime


class CountSessionLineResponse(BaseModel):
    """Sayım müqayisə sətri cavabı."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    variant_id: uuid.UUID
    snapshot_qty: int
    net_movements_since_freeze: int
    expected_qty: int
    counted_qty: int
    variance_qty: int
    unit_cost: Decimal
    variance_value: Decimal
    notes: str | None = None


class CountSessionCreate(BaseModel):
    """Yeni sayım sessiyası yaratma sorğusu."""

    model_config = ConfigDict(extra="forbid")

    warehouse_id: uuid.UUID
    count_scope: str = Field(default="full", description="'full', 'category', 'sample'")
    category_id: uuid.UUID | None = None
    blind_count: bool = Field(default=False)
    notes: str | None = None


class CountSessionResponse(BaseModel):
    """Sayım sessiyası cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    session_no: str
    warehouse_id: uuid.UUID
    count_scope: str
    category_id: uuid.UUID | None = None
    status: str
    blind_count: bool
    frozen_at: datetime | None = None
    watermark_movement_id: uuid.UUID | None = None
    creator_id: uuid.UUID | None = None
    approver_id: uuid.UUID | None = None
    adjustment_document_id: uuid.UUID | None = None
    notes: str | None = None
    version: int
    lines: list[CountSessionLineResponse] = []
    created_at: datetime
    updated_at: datetime


class CountSessionApproveRequest(BaseModel):
    """Sayımın təsdiqi və COUNT_VARIANCE sənədinin avtomatik generasiyası."""

    model_config = ConfigDict(extra="forbid")

    reason_code: str = Field(default="COUNT_VARIANCE", max_length=50)
    notes: str | None = None


# --- 6. Qiymətləndirmə (Valuation) və Balans Bərpası (Rebuild / Reconcile) ---


class StockValuationItem(BaseModel):
    """Qiymətləndirmə hesabatı elementi."""

    warehouse_id: uuid.UUID
    warehouse_name: str | None = None
    variant_id: uuid.UUID
    sku: str | None = None
    product_name: str | None = None
    quantity: int
    unit_cost: Decimal
    total_value: Decimal


class StockValuationReportResponse(BaseModel):
    """Maya dəyəri və anbar qiymətləndirmə hesabatı."""

    as_of_date: date
    total_items: int
    total_quantity: int
    total_value: Decimal
    items: list[StockValuationItem]


class DriftItem(BaseModel):
    """Balans və jurnal uyğunsuzluq qeydi."""

    warehouse_id: uuid.UUID
    variant_id: uuid.UUID
    stock_status: str
    balance_on_hand: int
    ledger_calculated_on_hand: int
    drift: int


class ReconciliationReportResponse(BaseModel):
    """Ledger və Balans uyğunluq (Drift) yoxlama hesabatı."""

    checked_at: datetime
    total_records_checked: int
    drifts_count: int
    status: Literal["OK", "DRIFT_DETECTED"]
    is_consistent: bool = True
    drifts: list[DriftItem] = []


class RebuildBalancesRequest(BaseModel):
    """Balansları ledger-dən sıfırdan bərpa etmə sorğusu."""

    model_config = ConfigDict(extra="forbid")

    warehouse_id: uuid.UUID | None = None
    variant_id: uuid.UUID | None = None
    force_overwrite: bool = Field(
        default=False, description="Mövcud balans sətirlərini yenidən yazmaq"
    )


class RebuildBalancesResponse(BaseModel):
    """Balans bərpa nəticəsi."""

    success: bool
    records_rebuilt: int
    drifts_repaired: int
    message: str
