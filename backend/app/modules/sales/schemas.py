"""Satışlar Modulu Pydantic Şemaları (Sales Schemas & DTOs)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class SaleFilterParams(BaseModel):
    """Satış axtarışı və filtrasiyası parametrləri."""

    branch_id: uuid.UUID | None = None
    register_id: uuid.UUID | None = None
    shift_id: uuid.UUID | None = None
    cashier_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None
    status: str | None = None
    tender_type: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    query: str | None = None
    min_amount: Decimal | None = None
    max_amount: Decimal | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=100)


class SaleLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    line_no: int
    variant_id: uuid.UUID
    product_id: uuid.UUID
    sku: str
    barcode: str | None = None
    product_name: str
    quantity: int
    unit_price: Decimal
    cost_price: Decimal | None = None  # sales.cost.view hüququ olmadıqda gizlədilir
    gross_amount: Decimal
    discount_amount: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    margin_amount: Decimal | None = None  # sales.cost.view hüququ olduqda hesablanır


class SalePaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tender_type: str
    amount: Decimal
    tendered_amount: Decimal
    change_amount: Decimal
    provider_confirmation_id: str | None = None
    approval_code: str | None = None
    masked_reference: str | None = None
    created_at: datetime


class SaleEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_type: str
    actor_id: uuid.UUID | None = None
    reason: str | None = None
    metadata_json: dict[str, Any] | None = None
    created_at: datetime


class SaleSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    receipt_no: str
    branch_id: uuid.UUID
    register_id: uuid.UUID
    shift_id: uuid.UUID
    cashier_id: uuid.UUID
    customer_id: uuid.UUID | None = None
    status: str
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    grand_total: Decimal
    paid_amount: Decimal
    change_amount: Decimal
    cost_total: Decimal | None = None  # Gated by sales.cost.view
    margin_amount: Decimal | None = None  # Gated by sales.cost.view
    margin_percent: Decimal | None = None  # Gated by sales.cost.view
    currency: str = "AZN"
    business_date: date
    created_at: datetime
    reprint_count: int


class SaleDetailResponse(SaleSummaryResponse):
    breakdown: dict[str, Any] | None = None
    payment_summary: list[dict[str, Any]] | None = None
    cancelled_at: datetime | None = None
    cancelled_by_id: uuid.UUID | None = None
    cancellation_reason: str | None = None
    lines: list[SaleLineResponse] = Field(default_factory=list)
    payments: list[SalePaymentResponse] = Field(default_factory=list)
    events: list[SaleEventResponse] = Field(default_factory=list)


class SaleListResponse(BaseModel):
    items: list[SaleSummaryResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class ReprintRequest(BaseModel):
    """Çəkin təkrar çapı sorğusu."""

    reason: str = Field(min_length=3, max_length=255)


class ReprintResponse(BaseModel):
    sale_id: uuid.UUID
    receipt_no: str
    reprint_number: int
    reprinted_at: datetime
    is_copy: bool = True
    esc_pos_bytes_base64: str
    html_receipt: str
    receipt_data: dict[str, Any]


class SaleCancelRequest(BaseModel):
    """Satışın ləğvi (Void) sorğusu."""

    reason: str = Field(min_length=5, max_length=500)
    manager_approval_token: str | None = None
