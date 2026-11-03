"""Satınalma Modulu HTTP Marşrutları (Purchasing API Router)."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Header, Query, Request, status

from app.modules.company.service import get_company_service
from app.modules.purchasing.policies import check_purchasing_permission
from app.modules.purchasing.schemas import (
    GoodsReceiptCreate,
    GoodsReceiptResponse,
    GoodsReceiptReversalRequest,
    InvoiceOverrideApprovalRequest,
    LandedCostCreate,
    LandedCostResponse,
    PayablesAgingResponse,
    POCloseShortRequest,
    PORevisionCreate,
    PurchaseOrderCreate,
    PurchaseOrderResponse,
    PurchaseRequestCreate,
    PurchaseRequestResponse,
    PurchaseReturnCreate,
    PurchaseReturnResponse,
    ReceiptDiscrepancyResponse,
    ReorderSuggestionResponse,
    SupplierInvoiceCreate,
    SupplierInvoiceResponse,
    SupplierPaymentCreate,
    SupplierPaymentResponse,
)
from app.modules.purchasing.service import PurchasingService, get_purchasing_service

router = APIRouter(prefix="/purchasing", tags=["Satınalma və Təchizat (Purchasing)"])


def get_current_actor(request: Request) -> Any:
    return getattr(request.state, "user", None)


# --- 1. Satınalma Sorğuları (Purchase Requests) ---


@router.post(
    "/requests",
    response_model=PurchaseRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Satınalma Sorğusu Yaratma",
)
async def create_purchase_request(
    data: PurchaseRequestCreate,
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> PurchaseRequestResponse:
    check_purchasing_permission("purchasing.request.create", actor)
    company = await get_company_service().get_company()
    pr = await service.create_request(company.id, data, actor=actor)
    return PurchaseRequestResponse.model_validate(pr)


@router.post(
    "/requests/{request_id}/submit",
    response_model=PurchaseRequestResponse,
    summary="Satınalma Sorğusunu Təsdiqə Göndərmə",
)
async def submit_purchase_request(
    request_id: uuid.UUID,
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> PurchaseRequestResponse:
    check_purchasing_permission("purchasing.request.create", actor)
    pr = await service.submit_request(request_id, actor=actor)
    return PurchaseRequestResponse.model_validate(pr)


@router.get(
    "/requests/reorder-suggestions",
    response_model=ReorderSuggestionResponse,
    summary="Avtomatik Sifariş / Ehtiyat Bərpa Tövsiyələri",
)
async def get_reorder_suggestions(
    warehouse_id: uuid.UUID = Query(...),
    category_id: uuid.UUID | None = None,
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> ReorderSuggestionResponse:
    check_purchasing_permission("purchasing.request.create", actor)
    company = await get_company_service().get_company()
    return await service.get_reorder_suggestions(
        company_id=company.id,
        warehouse_id=warehouse_id,
        category_id=category_id,
        actor=actor,
    )


# --- 2. Satınalma Sifarişləri (Purchase Orders) ---


@router.post(
    "/orders",
    response_model=PurchaseOrderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Satınalma Sifarişi (PO) Yaratma",
)
async def create_purchase_order(
    data: PurchaseOrderCreate,
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> PurchaseOrderResponse:
    check_purchasing_permission("purchasing.order.create", actor)
    company = await get_company_service().get_company()
    po = await service.create_po(company.id, data, actor=actor)
    return PurchaseOrderResponse.model_validate(po)


@router.get(
    "/orders",
    response_model=list[PurchaseOrderResponse],
    summary="Satınalma Sifarişlərinin Siyahısı",
)
async def list_purchase_orders(
    supplier_id: uuid.UUID | None = None,
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> list[PurchaseOrderResponse]:
    check_purchasing_permission("purchasing.order.create", actor)
    company = await get_company_service().get_company()
    items, _ = await service.list_pos(
        company_id=company.id,
        supplier_id=supplier_id,
        status=status,
        limit=limit,
        offset=offset,
        actor=actor,
    )
    return [PurchaseOrderResponse.model_validate(p) for p in items]


@router.get(
    "/orders/{po_id}",
    response_model=PurchaseOrderResponse,
    summary="Tək Satınalma Sifarişi Təfərrüatları",
)
async def get_purchase_order(
    po_id: uuid.UUID,
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> PurchaseOrderResponse:
    check_purchasing_permission("purchasing.order.create", actor)
    po = await service.get_po(po_id, actor=actor)
    return PurchaseOrderResponse.model_validate(po)


@router.post(
    "/orders/{po_id}/approve",
    response_model=PurchaseOrderResponse,
    summary="Satınalma Sifarişini Təsdiqləmə",
)
async def approve_purchase_order(
    po_id: uuid.UUID,
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> PurchaseOrderResponse:
    check_purchasing_permission("purchasing.order.approve", actor)
    po = await service.approve_po(po_id, actor=actor)
    return PurchaseOrderResponse.model_validate(po)


@router.post(
    "/orders/{po_id}/send",
    response_model=PurchaseOrderResponse,
    summary="Sifarişi Təchizatçıya Göndərmə",
)
async def send_purchase_order(
    po_id: uuid.UUID,
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> PurchaseOrderResponse:
    check_purchasing_permission("purchasing.order.send", actor)
    po = await service.send_po(po_id, actor=actor)
    return PurchaseOrderResponse.model_validate(po)


@router.post(
    "/orders/{po_id}/close-short",
    response_model=PurchaseOrderResponse,
    summary="Sifarişi Qalıq Miqdarla Bağlama (Close Short)",
)
async def close_purchase_order_short(
    po_id: uuid.UUID,
    data: POCloseShortRequest,
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> PurchaseOrderResponse:
    check_purchasing_permission("purchasing.order.cancel", actor)
    po = await service.close_po_short(po_id, data, actor=actor)
    return PurchaseOrderResponse.model_validate(po)


@router.post(
    "/orders/{po_id}/revisions",
    response_model=PurchaseOrderResponse,
    summary="Təsdiqlənmiş Sifarişə Düzəliş (Amendment Revision)",
)
async def create_po_revision(
    po_id: uuid.UUID,
    data: PORevisionCreate,
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> PurchaseOrderResponse:
    check_purchasing_permission("purchasing.order.create", actor)
    po = await service.create_po_revision(po_id, data, actor=actor)
    return PurchaseOrderResponse.model_validate(po)


# --- 3. Malların Qəbul Aktları (Goods Receipts) ---


@router.post(
    "/receipts",
    response_model=GoodsReceiptResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Malların Qəbul Aktı (Draft) Yaratma",
)
async def create_goods_receipt(
    data: GoodsReceiptCreate,
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> GoodsReceiptResponse:
    check_purchasing_permission("purchasing.receipt.confirm", actor)
    company = await get_company_service().get_company()
    gr = await service.create_receipt(company.id, data, actor=actor)
    return GoodsReceiptResponse.model_validate(gr)


@router.get(
    "/receipts",
    response_model=list[GoodsReceiptResponse],
    summary="Qəbul Aktlarının Siyahısı",
)
async def list_goods_receipts(
    supplier_id: uuid.UUID | None = None,
    po_id: uuid.UUID | None = None,
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> list[GoodsReceiptResponse]:
    check_purchasing_permission("purchasing.receipt.confirm", actor)
    company = await get_company_service().get_company()
    items, _ = await service.list_receipts(
        company_id=company.id,
        supplier_id=supplier_id,
        po_id=po_id,
        status=status,
        limit=limit,
        offset=offset,
        actor=actor,
    )
    return [GoodsReceiptResponse.model_validate(g) for g in items]


@router.get(
    "/receipts/{receipt_id}",
    response_model=GoodsReceiptResponse,
    summary="Tək Qəbul Aktı Təfərrüatları",
)
async def get_goods_receipt(
    receipt_id: uuid.UUID,
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> GoodsReceiptResponse:
    check_purchasing_permission("purchasing.receipt.confirm", actor)
    gr = await service.get_receipt(receipt_id, actor=actor)
    return GoodsReceiptResponse.model_validate(gr)


@router.post(
    "/receipts/{receipt_id}/confirm",
    response_model=GoodsReceiptResponse,
    summary="Malların Qəbulunu Təsdiqləmə (İnventar Mədaxili)",
)
async def confirm_goods_receipt(
    receipt_id: uuid.UUID,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> GoodsReceiptResponse:
    check_purchasing_permission("purchasing.receipt.confirm", actor)
    gr = await service.confirm_receipt(receipt_id, idempotency_key=idempotency_key, actor=actor)
    return GoodsReceiptResponse.model_validate(gr)


@router.post(
    "/receipts/{receipt_id}/reverse",
    response_model=GoodsReceiptResponse,
    summary="Qəbul Aktının Ləğvi (Reversal və Tərs İnventar Hərəkəti)",
)
async def reverse_goods_receipt(
    receipt_id: uuid.UUID,
    data: GoodsReceiptReversalRequest,
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> GoodsReceiptResponse:
    check_purchasing_permission("purchasing.receipt.reverse", actor)
    gr = await service.reverse_receipt(receipt_id, data, actor=actor)
    return GoodsReceiptResponse.model_validate(gr)


@router.post(
    "/receipts/{receipt_id}/landed-costs",
    response_model=LandedCostResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Qəbul Aktına Əlavə Maya Xərci Bölüşdürmə",
)
async def add_landed_cost(
    receipt_id: uuid.UUID,
    data: LandedCostCreate,
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> LandedCostResponse:
    check_purchasing_permission("purchasing.receipt.confirm", actor)
    lc = await service.add_landed_cost(receipt_id, data, actor=actor)
    return LandedCostResponse.model_validate(lc)


@router.get(
    "/discrepancies",
    response_model=list[ReceiptDiscrepancyResponse],
    summary="Qəbul Kənarlaşmaları Hesabatı",
)
async def list_discrepancies(
    status: str | None = None,
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> list[ReceiptDiscrepancyResponse]:
    check_purchasing_permission("purchasing.receipt.confirm", actor)
    company = await get_company_service().get_company()
    items = await service.list_discrepancies(company.id, status=status, actor=actor)
    return [ReceiptDiscrepancyResponse.model_validate(d) for d in items]


# --- 4. Təchizatçı Qaimələri və 3-Tərəfli Uyğunlaşma (Invoices) ---


@router.post(
    "/invoices",
    response_model=SupplierInvoiceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Təchizatçı Fakturası / Qaiməsi Daxil Etmə",
)
async def create_supplier_invoice(
    data: SupplierInvoiceCreate,
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> SupplierInvoiceResponse:
    check_purchasing_permission("purchasing.invoice.approve", actor)
    company = await get_company_service().get_company()
    inv = await service.create_invoice(company.id, data, actor=actor)
    return SupplierInvoiceResponse.model_validate(inv)


@router.post(
    "/invoices/{invoice_id}/approve",
    response_model=SupplierInvoiceResponse,
    summary="Qaiməni Təsdiqləmə (Borc Jurnalına Qeyd)",
)
async def approve_supplier_invoice(
    invoice_id: uuid.UUID,
    data: InvoiceOverrideApprovalRequest | None = None,
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> SupplierInvoiceResponse:
    if data and data.reason:
        check_purchasing_permission("purchasing.invoice.override_match", actor)
        reason = data.reason
    else:
        check_purchasing_permission("purchasing.invoice.approve", actor)
        reason = None
    inv = await service.approve_invoice(invoice_id, override_reason=reason, actor=actor)
    return SupplierInvoiceResponse.model_validate(inv)


# --- 5. Təchizatçıya Qaytarma (Purchase Returns) ---


@router.post(
    "/returns",
    response_model=PurchaseReturnResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Təchizatçıya Mal Qaytarma Aktı Yaratma",
)
async def create_purchase_return(
    data: PurchaseReturnCreate,
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> PurchaseReturnResponse:
    check_purchasing_permission("purchasing.receipt.reverse", actor)
    company = await get_company_service().get_company()
    pr = await service.create_purchase_return(company.id, data, actor=actor)
    return PurchaseReturnResponse.model_validate(pr)


# --- 6. Təchizatçı Ödənişləri və Yaşlanma (Payments & Aging) ---


@router.post(
    "/payments",
    response_model=SupplierPaymentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Təchizatçıya Ödəniş Qeydiyyatı və Bölüşdürmə",
)
async def create_supplier_payment(
    data: SupplierPaymentCreate,
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> SupplierPaymentResponse:
    check_purchasing_permission("purchasing.payment.create", actor)
    company = await get_company_service().get_company()
    sp = await service.create_payment(company.id, data, actor=actor)
    return SupplierPaymentResponse.model_validate(sp)


@router.get(
    "/payables/aging",
    response_model=PayablesAgingResponse,
    summary="Kreditor Borcların Yaşlanma Hesabatı (Payables Aging)",
)
async def get_payables_aging(
    as_of_date: date | None = None,
    service: PurchasingService = Depends(get_purchasing_service),
    actor: Any = Depends(get_current_actor),
) -> PayablesAgingResponse:
    check_purchasing_permission("purchasing.payment.create", actor)
    company = await get_company_service().get_company()
    return await service.get_payables_aging(company.id, as_of_date=as_of_date, actor=actor)
