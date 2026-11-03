"""POS (Kassa) Modulu HTTP API Marşrutları (POS Router)."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Header, Query, Request, status

from app.core.errors import ValidationError
from app.modules.company.service import get_company_service
from app.modules.pos.schemas import (
    CartRecallResponse,
    CartSummaryResponse,
    CartSuspendRequest,
    CashMovementCreate,
    CashMovementResponse,
    FraudIndicatorsResponse,
    PosCatalogLookupResponse,
    QuoteRequest,
    QuoteResponse,
    ReceiptPayloadResponse,
    SaleCheckoutRequest,
    ShiftCloseRequest,
    ShiftOpenRequest,
    ShiftReopenRequest,
    ShiftResponse,
    XReportResponse,
    ZReportResponse,
)
from app.modules.pos.service import PosService
from app.modules.sales.schemas import SaleCancelRequest, SaleDetailResponse

router = APIRouter(prefix="/pos", tags=["Kassa və POS (Point of Sale)"])


def get_current_actor(request: Request) -> Any:
    return getattr(request.state, "user", None)


def get_pos_service() -> PosService:
    return PosService()


# --- 1. Kassa Növbələri (Shifts) ---


@router.post(
    "/shifts/open",
    response_model=ShiftResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Kassa Növbəsi Açılması",
)
async def open_shift(
    data: ShiftOpenRequest,
    service: PosService = Depends(get_pos_service),
    actor: Any = Depends(get_current_actor),
) -> ShiftResponse:
    company = await get_company_service().get_company()
    return await service.open_shift(request=data, company_id=company.id, actor=actor)


@router.post(
    "/shifts/{shift_id}/close",
    response_model=ZReportResponse,
    summary="Kassa Növbəsinin Bağlanması (Z-Hesabat)",
)
async def close_shift(
    shift_id: uuid.UUID,
    data: ShiftCloseRequest,
    service: PosService = Depends(get_pos_service),
    actor: Any = Depends(get_current_actor),
) -> ZReportResponse:
    return await service.close_shift(shift_id=shift_id, request=data, actor=actor)


@router.post(
    "/shifts/{shift_id}/reopen",
    response_model=ShiftResponse,
    summary="Bağlanmış Kassa Növbəsinin Təkrar Açılması (Audited)",
)
async def reopen_shift(
    shift_id: uuid.UUID,
    data: ShiftReopenRequest,
    service: PosService = Depends(get_pos_service),
    actor: Any = Depends(get_current_actor),
) -> ShiftResponse:
    return await service.reopen_shift(shift_id=shift_id, request=data, actor=actor)


@router.get(
    "/shifts/{shift_id}/x-report",
    response_model=XReportResponse,
    summary="Aralıq X-Hesabat Çıxarılması",
)
async def get_shift_x_report(
    shift_id: uuid.UUID,
    service: PosService = Depends(get_pos_service),
    actor: Any = Depends(get_current_actor),
) -> XReportResponse:
    return await service.get_shift_x_report(shift_id=shift_id, actor=actor)


# --- 2. Nağd Pul Hərəkətləri (Cash In / Out / Drop) ---


@router.post(
    "/shifts/{shift_id}/cash-movements",
    response_model=CashMovementResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Kassaya Nağd Daxil / Xaric Qeydiyyatı",
)
async def record_cash_movement(
    shift_id: uuid.UUID,
    data: CashMovementCreate,
    service: PosService = Depends(get_pos_service),
    actor: Any = Depends(get_current_actor),
) -> CashMovementResponse:
    return await service.record_cash_movement(shift_id=shift_id, request=data, actor=actor)


# --- 3. Sürətli Kataloq Axtarışı (< 30 ms) ---


@router.get(
    "/lookup",
    response_model=PosCatalogLookupResponse,
    summary="POS Sürətli Barkod / SKU Axtarışı və Anbar Qalığı",
)
async def lookup_catalog_item(
    code: str = Query(..., min_length=1, description="Barkod və ya SKU"),
    register_id: uuid.UUID = Query(..., description="Kassa aparatı ID-si"),
    service: PosService = Depends(get_pos_service),
    actor: Any = Depends(get_current_actor),
) -> PosCatalogLookupResponse:
    return await service.lookup_catalog_item(code=code, register_id=register_id, actor=actor)


# --- 4. Saxlanılmış Səbətlər (Suspend / Recall) ---


@router.post(
    "/carts/suspend",
    response_model=CartSummaryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Səbətin Müvəqqəti Saxlanılması (Suspend)",
)
async def suspend_cart(
    data: CartSuspendRequest,
    service: PosService = Depends(get_pos_service),
    actor: Any = Depends(get_current_actor),
) -> CartSummaryResponse:
    company = await get_company_service().get_company()
    return await service.suspend_cart(request=data, company_id=company.id, actor=actor)


@router.get(
    "/carts",
    response_model=list[CartSummaryResponse],
    summary="Filial Üzrə Aktiv Saxlanılmış Səbətlərin Siyahısı",
)
async def list_suspended_carts(
    branch_id: uuid.UUID = Query(..., description="Filial ID-si"),
    service: PosService = Depends(get_pos_service),
    actor: Any = Depends(get_current_actor),
) -> list[CartSummaryResponse]:
    return await service.list_suspended_carts(branch_id=branch_id, actor=actor)


@router.post(
    "/carts/{cart_id}/recall",
    response_model=CartRecallResponse,
    summary="Saxlanılmış Səbətin Geri Çağırılması (Recall)",
)
async def recall_cart(
    cart_id: uuid.UUID,
    service: PosService = Depends(get_pos_service),
    actor: Any = Depends(get_current_actor),
) -> CartRecallResponse:
    return await service.recall_cart(cart_id=cart_id, actor=actor)


# --- 5. Qiymət Önizləməsi və Səbət Kalkulyasiyası ---


@router.post(
    "/quote",
    response_model=QuoteResponse,
    summary="Server-Tərəfli Dəqiq Qiymət və Endirim Kalkulyasiyası",
)
async def get_pos_quote(
    data: QuoteRequest,
    service: PosService = Depends(get_pos_service),
    actor: Any = Depends(get_current_actor),
) -> QuoteResponse:
    company = await get_company_service().get_company()
    from app.core.uow import UnitOfWork

    async with UnitOfWork() as uow:
        return await service.pricing.quote(
            session=uow.session,
            company_id=company.id,
            branch_id=data.branch_id,
            items=data.items,
            customer_id=data.customer_id,
            receipt_discount_percent=data.receipt_discount_percent,
            receipt_discount_amount=data.receipt_discount_amount,
            manager_approval_token=data.manager_approval_token,
            actor=actor,
            promo_code=data.promo_code,
        )


# --- 6. Atomik Satış Çıxışı (Atomic Checkout) ---


@router.post(
    "/sales",
    response_model=ReceiptPayloadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Atomik Kassa Satışının İcrası (10 Addımlı Tranzaksiya)",
)
async def checkout_sale(
    data: SaleCheckoutRequest,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    correlation_id: str | None = Header(None, alias="X-Correlation-ID"),
    service: PosService = Depends(get_pos_service),
    actor: Any = Depends(get_current_actor),
) -> ReceiptPayloadResponse:
    if not idempotency_key or not idempotency_key.strip():
        raise ValidationError(
            message="Kassa satışında 'Idempotency-Key' başlığı məcburidir.",
            details=[{"header": "Idempotency-Key", "issue": "missing"}],
        )

    company = await get_company_service().get_company()
    return await service.checkout(
        request=data,
        company_id=company.id,
        idempotency_key=idempotency_key.strip(),
        actor=actor,
        correlation_id=correlation_id,
    )


# --- 7. Satışın Ləğvi (Void Reversal) ---


@router.post(
    "/sales/{sale_id}/cancel",
    response_model=SaleDetailResponse,
    summary="Eyni Növbədə Satışın Ləğvi (Void və Kompensasiya Hərəkəti)",
)
async def cancel_sale(
    sale_id: uuid.UUID,
    data: SaleCancelRequest,
    service: PosService = Depends(get_pos_service),
    actor: Any = Depends(get_current_actor),
) -> SaleDetailResponse:
    return await service.cancel_sale(
        sale_id=sale_id,
        reason=data.reason,
        manager_approval_token=data.manager_approval_token,
        actor=actor,
    )


# --- 8. Fırıldaqçılıq və Risk Göstəriciləri (Fraud Indicators) ---


@router.get(
    "/fraud-indicators",
    response_model=FraudIndicatorsResponse,
    summary="Filial Üzrə Kassir və Növbə Risk Göstəriciləri",
)
async def get_fraud_indicators(
    branch_id: uuid.UUID = Query(..., description="Filial ID-si"),
    start_date: date = Query(..., description="Başlanğıc tarixi"),
    end_date: date = Query(..., description="Son tarix"),
    service: PosService = Depends(get_pos_service),
    actor: Any = Depends(get_current_actor),
) -> FraudIndicatorsResponse:
    return await service.get_fraud_indicators(
        branch_id=branch_id,
        start_date=start_date,
        end_date=end_date,
        actor=actor,
    )
