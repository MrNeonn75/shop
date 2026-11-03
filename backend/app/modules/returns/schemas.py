"""Qaytarmalar və Mübadilələr Modulu Pydantic Sxemləri (Returns DTOs)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

ReturnStatus = Literal["DRAFT", "PENDING_APPROVAL", "COMPLETED", "REJECTED", "CANCELLED"]
ReturnType = Literal["REFUND", "EXCHANGE", "STORE_CREDIT"]
ItemCondition = Literal["RESALABLE", "DAMAGED", "RESTRICTED"]
RefundStatus = Literal["PENDING", "COMPLETED", "FAILED", "UNKNOWN"]
RefundTenderType = Literal["cash", "card", "store_credit", "original_tender"]


class ReturnLineInput(BaseModel):
    """Qaytarma sorğusunda daxil edilən tək məhsul sətiri."""

    original_sale_line_id: uuid.UUID | None = Field(
        None, description="Orijinal satış sətrinin ID-si (çeksiz qaytarmada boş ola bilər)"
    )
    variant_id: uuid.UUID = Field(..., description="Məhsul variantının ID-si")
    quantity: int = Field(..., gt=0, description="Qaytarılan say (müsbət tam ədəd)")
    reason_code: str = Field(
        ..., min_length=2, max_length=50, description="DEFECTIVE, WRONG_SIZE, CHANGED_MIND və s."
    )
    condition: ItemCondition = Field("RESALABLE", description="RESALABLE, DAMAGED və ya RESTRICTED")
    notes: str | None = Field(None, max_length=500, description="Əlavə qeydlər")


class ReturnQuoteRequest(BaseModel):
    """Qaytarma məbləği və qaydalarının önizləməsi (Quote) sorğusu."""

    original_sale_id: uuid.UUID | None = Field(
        None, description="Orijinal satış ID-si (çeksiz olduqda None)"
    )
    branch_id: uuid.UUID = Field(..., description="Qaytarmanın icra edildiyi filial")
    items: list[ReturnLineInput] = Field(
        ..., min_length=1, description="Qaytarılacaq məhsul sətirləri"
    )
    return_type: ReturnType = Field("REFUND", description="REFUND, EXCHANGE və ya STORE_CREDIT")
    customer_id: uuid.UUID | None = Field(None, description="Müştəri ID-si")
    strict_promotion_invalidation: bool | None = Field(
        None,
        description="Aksiya pozulduqda itirilmiş faydanın tutulub-tutulmaması (None = setting-dən götür)",
    )


class ReturnQuoteLine(BaseModel):
    """Qaytarma kalkulyasiyasında hesablanmış sətir detalları."""

    line_no: int
    original_sale_line_id: uuid.UUID | None
    variant_id: uuid.UUID
    sku: str
    product_name: str
    quantity: int
    unit_price: Decimal
    cost_price: Decimal
    gross_amount: Decimal
    discount_amount: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    refund_amount: Decimal
    lost_promotion_benefit: Decimal = Decimal("0.00")
    destination_status: str
    notes: str | None = None


class ReturnQuoteResponse(BaseModel):
    """Server-authoritative qaytarma qiymət və qayda kalkulyasiyası cavabı."""

    original_sale_id: uuid.UUID | None
    return_type: ReturnType
    subtotal: Decimal = Field(..., description="Endirimsiz qaytarılan baza məbləğ")
    discount_reversal_total: Decimal = Field(..., description="Tərs hesablanan endirim")
    tax_reversal_total: Decimal = Field(..., description="Tərs hesablanan vergi (ƏDV)")
    refund_total: Decimal = Field(..., description="Müştəriyə ödəniləcək yekun məbləğ")
    cost_total: Decimal = Field(..., description="Geri qayıdan toplam maya dəyəri (COGS)")
    currency: str = "AZN"
    items: list[ReturnQuoteLine]
    promotion_invalidation_applied: bool = False
    lost_promotion_benefit_total: Decimal = Decimal("0.00")
    window_valid: bool = True
    window_days_elapsed: int = 0
    requires_manager_approval: bool = False
    approval_reason: str | None = None


class RefundMethodInput(BaseModel):
    """Geri ödəniş metodunun daxil edilməsi."""

    tender_type: str = Field(..., description="cash, card, store_credit, original_tender")
    amount: Decimal = Field(..., gt=0, description="Bu metodla geri ödəniləcək məbləğ")
    provider_confirmation_id: str | None = Field(None, description="Bank geri qaytarma referansı")
    approval_code: str | None = Field(None, description="Avtorizasiya / RRN kodu")


class ReturnCreateRequest(BaseModel):
    """Tamamlanmış qaytarma əməliyyatının başladılması sorğusu."""

    original_sale_id: uuid.UUID | None = Field(
        None, description="Orijinal satış ID-si (çeksiz qaytarmada None)"
    )
    register_id: uuid.UUID = Field(..., description="Kassa aparatı ID-si")
    shift_id: uuid.UUID = Field(..., description="Açıq kassa növbəsi ID-si")
    items: list[ReturnLineInput] = Field(..., min_length=1, description="Qaytarılan sətirlər")
    return_type: ReturnType = Field("REFUND", description="REFUND, EXCHANGE və ya STORE_CREDIT")
    refund_methods: list[RefundMethodInput] = Field(
        default_factory=list, description="Geri ödəniş bölgüsü"
    )
    customer_id: uuid.UUID | None = Field(None, description="Müştəri ID-si")
    reason_summary: str | None = Field(None, max_length=500, description="Ümumi səbəb xülasəsi")
    manager_approval_token: str | None = Field(None, description="Menecer təsdiq JWT tokeni")
    override_window_reason: str | None = Field(None, description="Vaxt həddi aşıldıqda izahat")
    expected_refund_total: Decimal = Field(
        ..., description="Müştərinin təsdiqlədiyi gözlənilən məbləğ"
    )
    save_as_pending_if_approval_needed: bool = Field(
        False, description="Təsdiq çatışmadıqda sənədi PENDING_APPROVAL saxla"
    )


class ExchangeLineInput(BaseModel):
    """Mübadilədə yeni verilən məhsul sətri."""

    variant_id: uuid.UUID = Field(..., description="Yeni seçilən məhsul variantının ID-si")
    quantity: int = Field(..., gt=0, description="Yeni məhsulun sayı")
    discount_percent: Decimal | None = Field(None, ge=0, le=100)
    discount_amount: Decimal | None = Field(None, ge=0)


class ExchangeCreateRequest(BaseModel):
    """Mübadilə (Exchange: Qaytarma + Yeni Satış) Sorğusu."""

    original_sale_id: uuid.UUID = Field(..., description="Əvəzlənən orijinal satış ID-si")
    register_id: uuid.UUID = Field(..., description="Kassa aparatı ID-si")
    shift_id: uuid.UUID = Field(..., description="Açıq kassa növbəsi ID-si")
    return_items: list[ReturnLineInput] = Field(
        ..., min_length=1, description="Geri qaytarılan mallar"
    )
    new_sale_items: list[ExchangeLineInput] = Field(
        ..., min_length=1, description="Yeni alınan mallar"
    )
    payment_methods: list[RefundMethodInput] = Field(
        default_factory=list,
        description="Fərq müsbətdirsə əlavə ödəniş metodları, mənfidirsə geri qaytarma metodları",
    )
    customer_id: uuid.UUID | None = Field(None, description="Müştəri ID-si")
    reason_summary: str | None = Field(None, max_length=500, description="Mübadilə səbəbi")
    manager_approval_token: str | None = Field(None, description="Menecer təsdiq tokeni")
    expected_net_difference: Decimal = Field(
        ..., description="Gözlənilən qiymət fərqi (Yeni Satış - Qaytarma Məbləği)"
    )


class ReturnApproveRequest(BaseModel):
    """PENDING_APPROVAL statuslu qaytarmanın təsdiqi."""

    manager_approval_token: str | None = Field(None, description="Menecer təsdiq tokeni")
    notes: str | None = Field(None, max_length=500, description="Təsdiq qeydi")


class ReturnRejectRequest(BaseModel):
    """PENDING_APPROVAL statuslu qaytarmanın rədd edilməsi."""

    reason: str = Field(..., min_length=3, max_length=500, description="Rədd etmə səbəbi")


class SaleReturnableLineResponse(BaseModel):
    """Satış sətri üzrə qalıq qaytarıla bilən məlumat."""

    sale_line_id: uuid.UUID
    line_no: int
    variant_id: uuid.UUID
    sku: str
    product_name: str
    sold_quantity: int
    already_returned_quantity: int
    reserved_quantity: int
    returnable_quantity: int
    unit_price: Decimal
    paid_per_unit: Decimal
    tax_rate: Decimal


class SaleReturnableInfoResponse(BaseModel):
    """Orijinal satış üzrə qaytarma hüququ və sətir qalıqları."""

    sale_id: uuid.UUID
    receipt_no: str
    sale_date: date
    window_days: int
    is_within_window: bool
    days_since_sale: int
    lines: list[SaleReturnableLineResponse]


class ReturnLineResponse(BaseModel):
    """Qaytarma sətri çıxış cavabı."""

    id: uuid.UUID
    line_no: int
    original_sale_line_id: uuid.UUID | None
    variant_id: uuid.UUID
    sku: str
    product_name: str
    quantity: int
    reason_code: str
    condition: str
    unit_price: Decimal
    gross_amount: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    refund_amount: Decimal
    destination_status: str
    notes: str | None

    model_config = ConfigDict(from_attributes=True)


class RefundResponse(BaseModel):
    """Geri ödəniş çıxış cavabı."""

    id: uuid.UUID
    tender_type: str
    amount: Decimal
    status: str
    provider_reference: str | None
    approval_code: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReturnSummaryResponse(BaseModel):
    """Qaytarma sənədinin xülasə çıxış cavabı."""

    id: uuid.UUID
    return_no: str
    original_sale_id: uuid.UUID | None
    branch_id: uuid.UUID
    register_id: uuid.UUID
    shift_id: uuid.UUID
    processed_by_id: uuid.UUID
    customer_id: uuid.UUID | None
    status: str
    return_type: str
    subtotal: Decimal
    discount_reversal_total: Decimal
    tax_reversal_total: Decimal
    refund_total: Decimal
    currency: str
    exchange_group_id: uuid.UUID | None
    business_date: date
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReturnDetailResponse(ReturnSummaryResponse):
    """Qaytarma sənədinin tam təfərrüatlı çıxış cavabı."""

    reason_summary: str | None = None
    refund_method_breakdown: dict[str, Any] | None = None
    approval_reference: str | None = None
    reprint_count: int = 0
    lines: list[ReturnLineResponse] = Field(default_factory=list)
    refunds: list[RefundResponse] = Field(default_factory=list)


class ReturnReceiptPayload(BaseModel):
    """Qaytarma qəbzinin çap mətni və strukturu."""

    return_id: uuid.UUID
    return_no: str
    original_receipt_no: str | None
    business_date: date
    created_at: datetime
    cashier_id: uuid.UUID
    branch_id: uuid.UUID
    register_id: uuid.UUID
    refund_total: Decimal
    currency: str
    is_reprint: bool = False
    reprint_watermark: str | None = None
    esc_pos_text: str
    html_receipt: str


class CustomerReturnsHistoryResponse(BaseModel):
    """Müştərinin qaytarma tarixçəsi (CRM inteqrasiyası)."""

    customer_id: uuid.UUID
    total_returns_count: int
    total_refunded_amount: Decimal
    store_credit_balance: Decimal
    returns: list[ReturnSummaryResponse]


class FraudIndicatorItem(BaseModel):
    """Fırıldaqçılıq indikator xəbərdarlığı."""

    indicator: str
    entity_type: str
    entity_id: str
    threshold: str
    actual_value: str
    explanation: str
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]


class ReturnFraudIndicatorsResponse(BaseModel):
    """Qaytarmalar üzrə fırıldaqçılıq və anomaliya hesabatı."""

    branch_id: uuid.UUID
    start_date: date
    end_date: date
    total_returns: int
    total_refund_amount: Decimal
    no_receipt_count: int
    no_receipt_ratio: Decimal
    alerts: list[FraudIndicatorItem]


class ReturnReasonResponse(BaseModel):
    """Standart qaytarma səbəb kodu cavabı."""

    code: str
    label: str
    description: str
    requires_notes: bool = False


class ReturnFilterParams(BaseModel):
    """Qaytarmaların axtarışı üçün filter parametrləri."""

    branch_id: uuid.UUID | None = None
    register_id: uuid.UUID | None = None
    shift_id: uuid.UUID | None = None
    cashier_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None
    status: str | None = None
    return_type: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    min_amount: Decimal | None = None
    max_amount: Decimal | None = None
    original_receipt_no: str | None = None
    page: int = 1
    page_size: int = 50
