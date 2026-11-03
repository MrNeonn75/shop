"""Satınalma və Təchizat Sxemləri (Purchasing Pydantic Schemas)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# --- 1. Satınalma Sorğuları (Purchase Requests) ---


class PurchaseRequestLineCreate(BaseModel):
    """Sorğu sətri yaratma sxemi."""

    model_config = ConfigDict(extra="forbid")

    variant_id: uuid.UUID
    requested_qty: int = Field(..., ge=1)
    estimated_unit_price: Decimal = Field(default=Decimal("0.0000"), ge=0)
    needed_by: date | None = None
    notes: str | None = Field(default=None, max_length=255)


class PurchaseRequestCreate(BaseModel):
    """Yeni satınalma sorğusu (tələbnamə) yaratma sxemi."""

    model_config = ConfigDict(extra="forbid")

    requesting_warehouse_id: uuid.UUID
    needed_by: date
    reason: str = Field(..., min_length=3)
    notes: str | None = None
    lines: list[PurchaseRequestLineCreate] = Field(..., min_length=1)


class PurchaseRequestLineResponse(BaseModel):
    """Sorğu sətri cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    variant_id: uuid.UUID
    requested_qty: int
    estimated_unit_price: Decimal
    total_estimated_price: Decimal
    needed_by: date | None = None
    notes: str | None = None


class PurchaseRequestResponse(BaseModel):
    """Satınalma sorğusu cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    request_no: str
    requesting_branch_id: uuid.UUID | None = None
    requesting_warehouse_id: uuid.UUID
    requester_id: uuid.UUID
    needed_by: date
    reason: str
    status: str
    total_estimated_amount: Decimal
    notes: str | None = None
    version: int
    lines: list[PurchaseRequestLineResponse] = []
    created_at: datetime
    updated_at: datetime


class ReorderSuggestionItem(BaseModel):
    """Avtomatik sifariş tövsiyəsi bəndi."""

    variant_id: uuid.UUID
    product_name: str | None = None
    sku: str | None = None
    current_on_hand: int
    active_reservations: int
    current_available: int
    in_transit_qty: int
    open_po_qty: int
    min_stock: int
    sales_velocity_28d: float
    recommended_order_qty: int
    reason: str


class ReorderSuggestionResponse(BaseModel):
    """Sifariş tövsiyələri siyahısı cavabı."""

    warehouse_id: uuid.UUID
    generated_at: datetime
    total_suggestions: int
    suggestions: list[ReorderSuggestionItem] = []


# --- 2. Satınalma Sifarişləri (Purchase Orders) ---


class PurchaseOrderLineCreate(BaseModel):
    """PO sətri yaratma sxemi."""

    model_config = ConfigDict(extra="forbid")

    variant_id: uuid.UUID
    quantity: int = Field(..., ge=1)
    unit_price: Decimal = Field(..., ge=0)
    discount_percent: Decimal = Field(default=Decimal("0.00"), ge=0, le=100)
    tax_class_id: uuid.UUID | None = None
    tax_rate: Decimal = Field(default=Decimal("0.00"), ge=0, le=100)
    notes: str | None = Field(default=None, max_length=255)


class PurchaseOrderCreate(BaseModel):
    """Yeni Satınalma Sifarişi yaratma sxemi."""

    model_config = ConfigDict(extra="forbid")

    supplier_id: uuid.UUID
    delivery_warehouse_id: uuid.UUID
    expected_date: date
    currency: str = Field(default="AZN", max_length=3)
    payment_terms_days: int = Field(default=30, ge=0)
    purchase_request_id: uuid.UUID | None = None
    notes: str | None = None
    lines: list[PurchaseOrderLineCreate] = Field(..., min_length=1)


class PurchaseOrderLineResponse(BaseModel):
    """PO sətri cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    variant_id: uuid.UUID
    line_no: int
    quantity: int
    unit_price: Decimal
    discount_percent: Decimal
    tax_class_id: uuid.UUID | None = None
    tax_rate: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    received_qty: int
    cancelled_qty: int
    outstanding_qty: int
    notes: str | None = None


class PORevisionResponse(BaseModel):
    """PO düzəliş/reviziya qeydi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    revision_number: int
    previous_total: Decimal
    new_total: Decimal
    change_reason: str
    changed_by_id: uuid.UUID | None = None
    created_at: datetime


class PurchaseOrderResponse(BaseModel):
    """Satınalma Sifarişi tam cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    po_no: str
    supplier_id: uuid.UUID
    delivery_warehouse_id: uuid.UUID
    purchase_request_id: uuid.UUID | None = None
    order_date: date
    expected_date: date
    currency: str
    payment_terms_days: int
    status: str
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    total_amount: Decimal
    created_by_id: uuid.UUID | None = None
    approved_by_id: uuid.UUID | None = None
    approved_at: datetime | None = None
    sent_at: datetime | None = None
    closed_at: datetime | None = None
    close_reason: str | None = None
    notes: str | None = None
    version: int
    lines: list[PurchaseOrderLineResponse] = []
    revisions: list[PORevisionResponse] = []
    created_at: datetime
    updated_at: datetime


class POCloseShortRequest(BaseModel):
    """Sifarişi qalıq miqdarla vaxtından əvvəl bağlama sorğusu."""

    model_config = ConfigDict(extra="forbid")

    reason: str = Field(..., min_length=5, description="Təchizatçının təmin edə bilməmə səbəbi")


class PORevisionCreate(BaseModel):
    """Təsdiqlənmiş sifarişə düzəliş (amendment) sorğusu."""

    model_config = ConfigDict(extra="forbid")

    reason: str = Field(..., min_length=5)
    lines: list[PurchaseOrderLineCreate] = Field(..., min_length=1)


# --- 3. Malların Qəbul Aktları (Goods Receipts) ---


class GoodsReceiptLineCreate(BaseModel):
    """Qəbul sətri daxiletmə sxemi."""

    model_config = ConfigDict(extra="forbid")

    po_line_id: uuid.UUID | None = None
    variant_id: uuid.UUID
    received_qty: int = Field(..., ge=1)
    damaged_qty: int = Field(default=0, ge=0)
    rejected_qty: int = Field(default=0, ge=0)
    batch_number: str | None = Field(default=None, max_length=50)
    expiry_date: date | None = None
    unit_cost: Decimal | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=255)


class GoodsReceiptCreate(BaseModel):
    """Yeni Malların Qəbul Aktı (Draft) yaratma sxemi."""

    model_config = ConfigDict(extra="forbid")

    po_id: uuid.UUID | None = None
    supplier_id: uuid.UUID
    warehouse_id: uuid.UUID
    delivery_note_number: str = Field(..., min_length=1, max_length=100)
    received_date: date | None = None
    attachments: list[dict[str, Any]] | None = None
    notes: str | None = None
    lines: list[GoodsReceiptLineCreate] = Field(..., min_length=1)


class GoodsReceiptLineResponse(BaseModel):
    """Qəbul aktı sətri cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    po_line_id: uuid.UUID | None = None
    variant_id: uuid.UUID
    line_no: int
    ordered_qty: int
    previously_received_qty: int
    received_qty: int
    rejected_qty: int
    damaged_qty: int
    batch_number: str | None = None
    expiry_date: date | None = None
    unit_cost: Decimal
    total_cost: Decimal
    notes: str | None = None


class ReceiptDiscrepancyResponse(BaseModel):
    """Qəbul kənarlaşması cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    variant_id: uuid.UUID
    ordered_qty: int
    received_qty: int
    damaged_qty: int
    rejected_qty: int
    variance_qty: int
    status: str
    resolution_notes: str | None = None


class GoodsReceiptResponse(BaseModel):
    """Malların Qəbul Aktı cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    receipt_no: str
    po_id: uuid.UUID | None = None
    supplier_id: uuid.UUID
    warehouse_id: uuid.UUID
    delivery_note_number: str
    received_date: date
    receiving_user_id: uuid.UUID
    status: str
    total_quantity: int
    total_cost: Decimal
    attachments: list[dict[str, Any]] = []
    notes: str | None = None
    version: int
    lines: list[GoodsReceiptLineResponse] = []
    discrepancies: list[ReceiptDiscrepancyResponse] = []
    created_at: datetime
    updated_at: datetime


class GoodsReceiptReversalRequest(BaseModel):
    """Təsdiqlənmiş qəbul aktının ləğvi sorğusu."""

    model_config = ConfigDict(extra="forbid")

    reason: str = Field(..., min_length=5, description="Ləğv edilmə səbəbi")
    allow_consumed_override: bool = Field(
        default=False, description="Xüsusi hüquqla mənfi qalıq icazəsi"
    )


class LandedCostAllocationCreate(BaseModel):
    """Qaimə xərclərinin paylanması sətirləri."""

    model_config = ConfigDict(extra="forbid")

    receipt_line_id: uuid.UUID
    allocated_amount: Decimal = Field(..., ge=0)


class LandedCostCreate(BaseModel):
    """Əlavə daşıma/gömrük xərcinin qəbula tətbiqi."""

    model_config = ConfigDict(extra="forbid")

    cost_type: str = Field(..., max_length=50)
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(default="AZN", max_length=3)
    allocation_method: Literal["by_value", "by_quantity", "by_weight"] = "by_value"
    notes: str | None = None
    allocations: list[LandedCostAllocationCreate] | None = None


class LandedCostResponse(BaseModel):
    """Əlavə maya dəyəri sənədi cavabı."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_no: str
    receipt_id: uuid.UUID
    cost_type: str
    amount: Decimal
    currency: str
    allocation_method: str
    notes: str | None = None
    created_at: datetime


# --- 4. Təchizatçı Qaimələri və 3-Tərəfli Uyğunlaşma (Invoices & 3-Way Match) ---


class SupplierInvoiceLineCreate(BaseModel):
    """Qaimə sətri daxil etmə sxemi."""

    model_config = ConfigDict(extra="forbid")

    po_line_id: uuid.UUID | None = None
    receipt_line_id: uuid.UUID | None = None
    variant_id: uuid.UUID
    quantity: int = Field(..., ge=1)
    unit_price: Decimal = Field(..., ge=0)
    tax_rate: Decimal = Field(default=Decimal("0.00"), ge=0, le=100)


class SupplierInvoiceCreate(BaseModel):
    """Yeni Təchizatçı Fakturası / Qaiməsi yaratma sxemi."""

    model_config = ConfigDict(extra="forbid")

    supplier_id: uuid.UUID
    supplier_invoice_number: str = Field(..., min_length=1, max_length=100)
    invoice_date: date
    due_date: date
    po_id: uuid.UUID | None = None
    receipt_id: uuid.UUID | None = None
    currency: str = Field(default="AZN", max_length=3)
    attachments: list[dict[str, Any]] | None = None
    notes: str | None = None
    lines: list[SupplierInvoiceLineCreate] = Field(..., min_length=1)


class SupplierInvoiceLineResponse(BaseModel):
    """Qaimə sətri cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    po_line_id: uuid.UUID | None = None
    receipt_line_id: uuid.UUID | None = None
    variant_id: uuid.UUID
    quantity: int
    unit_price: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    match_result: str
    variance_reason: str | None = None


class SupplierInvoiceResponse(BaseModel):
    """Təchizatçı Qaiməsi cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    invoice_no: str
    supplier_id: uuid.UUID
    supplier_invoice_number: str
    invoice_date: date
    due_date: date
    po_id: uuid.UUID | None = None
    receipt_id: uuid.UUID | None = None
    currency: str
    subtotal: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    paid_amount: Decimal
    match_status: str
    status: str
    attachments: list[dict[str, Any]] = []
    notes: str | None = None
    version: int
    lines: list[SupplierInvoiceLineResponse] = []
    created_at: datetime
    updated_at: datetime


class ThreeWayMatchLineResult(BaseModel):
    """Tək sətrin 3-tərəfli uyğunlaşma nəticəsi."""

    variant_id: uuid.UUID
    po_quantity: int
    po_unit_price: Decimal
    receipt_quantity: int
    invoice_quantity: int
    invoice_unit_price: Decimal
    quantity_variance: int
    price_variance: Decimal
    status: Literal["MATCHED", "TOLERATED", "DISCREPANCY"]
    reason: str | None = None


class ThreeWayMatchReportResponse(BaseModel):
    """Qaimə üzrə 3-tərəfli uyğunlaşma hesabatı."""

    invoice_id: uuid.UUID
    overall_match_status: str
    can_auto_approve: bool
    discrepancy_count: int
    lines: list[ThreeWayMatchLineResult] = []


class InvoiceOverrideApprovalRequest(BaseModel):
    """Uyğunsuzluğu olan qaimənin xüsusi icazə ilə təsdiqi."""

    model_config = ConfigDict(extra="forbid")

    reason: str = Field(..., min_length=5, description="Kənarlaşmanın qəbul edilmə əsaslandırması")


# --- 5. Təchizatçıya Qaytarma (Purchase Returns) ---


class PurchaseReturnLineCreate(BaseModel):
    """Qaytarma sətri sxemi."""

    model_config = ConfigDict(extra="forbid")

    variant_id: uuid.UUID
    quantity: int = Field(..., ge=1)
    notes: str | None = None


class PurchaseReturnCreate(BaseModel):
    """Təchizatçıya mal qaytarma aktı yaratma sxemi."""

    model_config = ConfigDict(extra="forbid")

    receipt_id: uuid.UUID
    reason_code: str = Field(..., max_length=50)
    notes: str | None = None
    lines: list[PurchaseReturnLineCreate] = Field(..., min_length=1)


class PurchaseReturnLineResponse(BaseModel):
    """Qaytarma sətri cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    variant_id: uuid.UUID
    quantity: int
    unit_cost: Decimal
    total_amount: Decimal
    notes: str | None = None


class PurchaseReturnResponse(BaseModel):
    """Qaytarma aktı cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    return_no: str
    receipt_id: uuid.UUID
    supplier_id: uuid.UUID
    warehouse_id: uuid.UUID
    reason_code: str
    status: str
    total_quantity: int
    total_amount: Decimal
    notes: str | None = None
    lines: list[PurchaseReturnLineResponse] = []
    created_at: datetime


# --- 6. Təchizatçı Ödənişləri (Supplier Payments) ---


class PaymentAllocationCreate(BaseModel):
    """Ödənişin qaiməyə bölüşdürülməsi sətri."""

    model_config = ConfigDict(extra="forbid")

    invoice_id: uuid.UUID
    allocated_amount: Decimal = Field(..., gt=0)


class SupplierPaymentCreate(BaseModel):
    """Təchizatçıya yeni ödəniş yaratma sxemi."""

    model_config = ConfigDict(extra="forbid")

    supplier_id: uuid.UUID
    payment_method: str = Field(default="bank_transfer", max_length=50)
    source_account_id: uuid.UUID | None = None
    payment_date: date | None = None
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(default="AZN", max_length=3)
    reference_number: str | None = Field(default=None, max_length=100)
    notes: str | None = None
    allocations: list[PaymentAllocationCreate] | None = None


class PaymentAllocationResponse(BaseModel):
    """Bölüşdürmə sətri cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    invoice_id: uuid.UUID
    allocated_amount: Decimal


class SupplierPaymentResponse(BaseModel):
    """Təchizatçı ödənişi cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    payment_no: str
    supplier_id: uuid.UUID
    payment_method: str
    source_account_id: uuid.UUID | None = None
    payment_date: date
    amount: Decimal
    currency: str
    reference_number: str | None = None
    status: str
    notes: str | None = None
    version: int
    allocations: list[PaymentAllocationResponse] = []
    created_at: datetime


class PayablesAgingBucket(BaseModel):
    """Kreditor borcların yaşlanma qrupu."""

    current: Decimal = Decimal("0.0000")
    days_1_30: Decimal = Decimal("0.0000")
    days_31_60: Decimal = Decimal("0.0000")
    days_61_90: Decimal = Decimal("0.0000")
    days_90_plus: Decimal = Decimal("0.0000")
    total: Decimal = Decimal("0.0000")


class PayablesAgingResponse(BaseModel):
    """Bütün şirkət üzrə ödəmə borclarının yaşlanma hesabatı."""

    as_of_date: date
    total_payables: Decimal
    aging: PayablesAgingBucket
    suppliers_count: int
