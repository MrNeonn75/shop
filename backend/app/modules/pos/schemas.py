"""POS Modulu Pydantic Şemaları (POS Schemas & DTOs)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ShiftOpenRequest(BaseModel):
    """Kassa növbəsinin açılması sorğusu."""

    register_id: uuid.UUID
    opening_cash: Decimal = Field(ge=Decimal("0.00"), default=Decimal("0.00"))
    opening_denominations: dict[str, int] | None = None
    mismatch_reason: str | None = None


class ShiftCloseRequest(BaseModel):
    """Kassa növbəsinin bağlanması sorğusu (Z-hesabat)."""

    counted_cash: Decimal = Field(ge=Decimal("0.00"))
    counted_cash_by_tender: dict[str, Decimal] | None = None
    closing_denominations: dict[str, int] | None = None
    variance_explanation: str | None = None
    manager_approval_token: str | None = None
    closing_notes: str | None = None


class ShiftReopenRequest(BaseModel):
    """Bağlanmış növbənin təkrar açılması sorğusu."""

    reason: str = Field(min_length=5, max_length=500)
    manager_approval_token: str | None = None


class ShiftResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    shift_no: str
    register_id: uuid.UUID
    branch_id: uuid.UUID
    cashier_id: uuid.UUID
    status: str
    opened_at: datetime
    closed_at: datetime | None = None
    opening_cash: Decimal
    variance: Decimal | None = None
    version: int


class ShiftDetailResponse(ShiftResponse):
    opening_denominations: dict[str, Any] | None = None
    closing_denominations: dict[str, Any] | None = None
    expected_cash_by_tender: dict[str, Any] | None = None
    counted_cash_by_tender: dict[str, Any] | None = None
    closing_approver_id: uuid.UUID | None = None
    closing_notes: str | None = None
    reopened_at: datetime | None = None
    reopened_by_id: uuid.UUID | None = None
    reopen_reason: str | None = None


class CashMovementCreate(BaseModel):
    """Kassaya nağd vəsait daxil/xaric sorğusu."""

    movement_type: str = Field(pattern="^(CASH_IN|CASH_OUT|DROP|FLOAT_ADJUST)$")
    amount: Decimal = Field(gt=Decimal("0.00"))
    reason_code: str = Field(min_length=2, max_length=100)
    notes: str | None = None
    attachment_url: str | None = None
    manager_approval_token: str | None = None


class CashMovementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    movement_no: str
    shift_id: uuid.UUID
    register_id: uuid.UUID
    movement_type: str
    amount: Decimal
    reason_code: str
    notes: str | None = None
    attachment_url: str | None = None
    approved_by_id: uuid.UUID | None = None
    created_by_id: uuid.UUID
    created_at: datetime


class CartLineInput(BaseModel):
    """Səbət / Satış sətir daxiletməsi."""

    variant_id: uuid.UUID
    quantity: int = Field(gt=0)
    discount_percent: Decimal | None = Field(default=None, ge=Decimal("0.00"), le=Decimal("100.00"))
    discount_amount: Decimal | None = Field(default=None, ge=Decimal("0.00"))
    notes: str | None = None


class CartSuspendRequest(BaseModel):
    """Səbətin saxlanılması sorğusu."""

    shift_id: uuid.UUID
    label: str = Field(min_length=1, max_length=100)
    customer_id: uuid.UUID | None = None
    lines: list[CartLineInput] = Field(min_length=1)


class CartSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    cart_no: str
    shift_id: uuid.UUID
    label: str
    status: str
    line_count: int
    suspended_at: datetime
    expires_at: datetime


class QuoteRequest(BaseModel):
    """Qiymət və vergi hesablanması / önizləmə sorğusu."""

    branch_id: uuid.UUID
    register_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None
    items: list[CartLineInput] = Field(min_length=1)
    receipt_discount_percent: Decimal | None = Field(
        default=None, ge=Decimal("0.00"), le=Decimal("100.00")
    )
    receipt_discount_amount: Decimal | None = Field(default=None, ge=Decimal("0.00"))
    manager_approval_token: str | None = None
    promo_code: str | None = None


class QuoteLineBreakdown(BaseModel):
    variant_id: uuid.UUID
    product_id: uuid.UUID
    sku: str
    product_name: str
    quantity: int
    unit_price: Decimal
    gross_amount: Decimal
    discount_amount: Decimal
    discount_rate: Decimal
    discount_sources: list[dict[str, Any]] = Field(default_factory=list)
    net_amount: Decimal
    tax_class_id: uuid.UUID | None = None
    tax_rate: Decimal
    tax_amount: Decimal
    total_amount: Decimal


class QuoteResponse(BaseModel):
    subtotal: Decimal
    discount_total: Decimal
    net_subtotal: Decimal
    tax_total: Decimal
    grand_total: Decimal
    currency: str = "AZN"
    items: list[QuoteLineBreakdown]
    receipt_discount_amount: Decimal = Decimal("0.00")


class CartRecallResponse(BaseModel):
    id: uuid.UUID
    cart_no: str
    label: str
    customer_id: uuid.UUID | None = None
    lines: list[CartLineInput]
    quote: QuoteResponse


class TenderPaymentInput(BaseModel):
    """Satış zamanı ödəniş vasitəsi daxiletməsi."""

    tender_type: str = Field(
        pattern="^(cash|card|external_terminal|gift_card|loyalty_points|store_credit)$"
    )
    amount: Decimal = Field(gt=Decimal("0.00"))
    tendered_amount: Decimal | None = Field(default=None, ge=Decimal("0.00"))
    provider_confirmation_id: str | None = None
    approval_code: str | None = None
    masked_reference: str | None = None


class SaleCheckoutRequest(BaseModel):
    """Atomik Çıxış / Satış Tamamlama Sorğusu."""

    register_id: uuid.UUID
    shift_id: uuid.UUID
    customer_id: uuid.UUID | None = None
    items: list[CartLineInput] = Field(min_length=1)
    receipt_discount_percent: Decimal | None = Field(
        default=None, ge=Decimal("0.00"), le=Decimal("100.00")
    )
    receipt_discount_amount: Decimal | None = Field(default=None, ge=Decimal("0.00"))
    manager_approval_token: str | None = None
    promo_code: str | None = None
    expected_grand_total: Decimal
    payments: list[TenderPaymentInput] = Field(min_length=1)
    loyalty_points_to_redeem: int | None = Field(default=None, ge=0)


class ReceiptItemResponse(BaseModel):
    line_no: int
    sku: str
    name: str
    quantity: int
    unit_price: Decimal
    discount_amount: Decimal
    tax_rate: Decimal
    total_amount: Decimal


class ReceiptPayloadResponse(BaseModel):
    sale_id: uuid.UUID
    receipt_no: str
    business_date: date
    created_at: datetime
    branch_id: uuid.UUID
    register_id: uuid.UUID
    cashier_id: uuid.UUID
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    grand_total: Decimal
    paid_amount: Decimal
    change_amount: Decimal
    currency: str
    payments: list[dict[str, Any]]
    items: list[ReceiptItemResponse]
    qr_code_data: str
    fiscal_status: str = "NOT_CONFIGURED"
    fiscal_doc_id: str | None = None


class PosCatalogLookupResponse(BaseModel):
    """POS üçün sürətli axtarış cavabı."""

    variant_id: uuid.UUID
    product_id: uuid.UUID
    internal_code: str
    product_name: str
    sku: str
    barcode: str | None
    size: str | None
    color: str | None
    effective_price: Decimal
    currency: str = "AZN"
    tax_class: str | None = None
    stock_available: int
    stock_status: str
    promotions_preview: list[dict[str, Any]] = Field(default_factory=list)


class XReportResponse(BaseModel):
    """Aralıq X-Hesabat."""

    report_type: str = "X_REPORT"
    shift_no: str
    register_code: str
    cashier_name: str
    opened_at: datetime
    generated_at: datetime
    opening_cash: Decimal
    sales_count: int
    gross_sales: Decimal
    discount_total: Decimal
    tax_total: Decimal
    net_sales: Decimal
    cash_in_total: Decimal
    cash_out_total: Decimal
    drops_total: Decimal
    expected_cash: Decimal
    tender_breakdown: dict[str, Decimal]


class ZReportResponse(XReportResponse):
    """Yekun Z-Hesabat (Növbə Bağlanışı)."""

    report_type: str = "Z_REPORT"
    closed_at: datetime
    counted_cash: Decimal
    variance: Decimal
    closing_notes: str | None = None


class DailyRegisterReportResponse(BaseModel):
    """Gündəlik Kassa Hesabatı."""

    register_id: uuid.UUID
    report_date: date
    shifts_count: int
    total_sales_count: int
    total_revenue: Decimal
    total_discount: Decimal
    total_cash: Decimal
    total_card: Decimal
    total_variance: Decimal
    shifts: list[ZReportResponse] = Field(default_factory=list)


class CashierFraudMetric(BaseModel):
    cashier_id: uuid.UUID
    cashier_name: str
    total_sales: int
    cancelled_sales: int
    void_rate: Decimal
    discount_count: int
    avg_discount_rate: Decimal
    cash_movements_count: int
    net_cash_variance: Decimal
    is_flagged: bool
    flag_reasons: list[str] = Field(default_factory=list)


class FraudIndicatorsResponse(BaseModel):
    branch_id: uuid.UUID
    period_start: date
    period_end: date
    anomalies_detected: int
    cashier_metrics: list[CashierFraudMetric]
