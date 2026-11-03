"""Qaytarmalar və Mübadilələr REST API Router (Returns Router)."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, Query, status

from app.core.errors import ValidationError
from app.modules.auth.policies import AuthenticatedUser, get_current_user
from app.modules.company.service import get_company_service
from app.modules.returns.schemas import (
    CustomerReturnsHistoryResponse,
    ExchangeCreateRequest,
    ReturnApproveRequest,
    ReturnCreateRequest,
    ReturnDetailResponse,
    ReturnFilterParams,
    ReturnFraudIndicatorsResponse,
    ReturnQuoteRequest,
    ReturnQuoteResponse,
    ReturnReasonResponse,
    ReturnReceiptPayload,
    ReturnRejectRequest,
    SaleReturnableInfoResponse,
)
from app.modules.returns.service import ReturnsService

router = APIRouter(tags=["Returns & Exchanges"])


def get_returns_service() -> ReturnsService:
    return ReturnsService()


@router.post(
    "/returns/quote",
    response_model=ReturnQuoteResponse,
    summary="Qaytarma Qiymət və Qayda Kalkulyasiyası (Quote)",
)
async def quote_return(
    request: ReturnQuoteRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    service: Annotated[ReturnsService, Depends(get_returns_service)],
) -> ReturnQuoteResponse:
    """Qaytarılacaq məhsullar üzrə dəqiq məbləği, endirim fərqini və qaydaları hesablayır."""
    company = await get_company_service().get_company()
    return await service.quote_return(
        company_id=company.id,
        request=request,
        actor=current_user,
    )


@router.post(
    "/returns",
    status_code=status.HTTP_201_CREATED,
    summary="Qaytarma Sənədinin Tamamlanması (Return Checkout)",
)
async def create_return(
    request: ReturnCreateRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    service: Annotated[ReturnsService, Depends(get_returns_service)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> ReturnReceiptPayload | ReturnDetailResponse:
    """Tək tranzaksiyada 100% atomik qaytarma əməliyyatını icra edir."""
    if not idempotency_key or len(idempotency_key.strip()) < 8:
        raise ValidationError(
            "Qaytarma sorğusu üçün 'Idempotency-Key' başlığı (ən azı 8 simvol) məcburidir."
        )

    company = await get_company_service().get_company()
    return await service.create_return(
        company_id=company.id,
        request=request,
        actor=current_user,
        idempotency_key=idempotency_key.strip(),
    )


@router.post(
    "/returns/exchange",
    status_code=status.HTTP_201_CREATED,
    summary="Mübadilə (Exchange: Qaytarma + Yeni Satış)",
)
async def create_exchange(
    request: ExchangeCreateRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    service: Annotated[ReturnsService, Depends(get_returns_service)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> dict[str, Any]:
    """Tək tranzaksiyada qaytarma və yeni satışı atomik birləşdirir."""
    if not idempotency_key or len(idempotency_key.strip()) < 8:
        raise ValidationError("Mübadilə sorğusu üçün 'Idempotency-Key' başlığı məcburidir.")

    company = await get_company_service().get_company()
    return await service.create_exchange(
        company_id=company.id,
        request=request,
        actor=current_user,
        idempotency_key=idempotency_key.strip(),
    )


@router.get(
    "/returns",
    response_model=dict[str, Any],
    summary="Qaytarmaların Siyahısı və Çoxmeyarlı Axtarış",
)
async def list_returns(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    service: Annotated[ReturnsService, Depends(get_returns_service)],
    branch_id: uuid.UUID | None = None,
    register_id: uuid.UUID | None = None,
    shift_id: uuid.UUID | None = None,
    cashier_id: uuid.UUID | None = None,
    customer_id: uuid.UUID | None = None,
    status: str | None = None,
    return_type: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    """Filtrlər üzrə qaytarma sənədlərini axtarır."""
    params = ReturnFilterParams(
        branch_id=branch_id,
        register_id=register_id,
        shift_id=shift_id,
        cashier_id=cashier_id,
        customer_id=customer_id,
        status=status,
        return_type=return_type,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size,
    )
    company = await get_company_service().get_company()
    return await service.search_returns(
        company_id=company.id,
        params=params,
        actor=current_user,
    )


@router.get(
    "/returns/reasons",
    response_model=list[ReturnReasonResponse],
    summary="Standart Qaytarma Səbəb Kodları",
)
async def get_return_reasons(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    service: Annotated[ReturnsService, Depends(get_returns_service)],
) -> list[dict[str, Any]]:
    """Sistemdə təyin olunmuş standart qaytarma səbəb kodlarını qaytarır."""
    _ = current_user
    return service.get_return_reasons()


@router.get(
    "/returns/fraud-indicators",
    response_model=ReturnFraudIndicatorsResponse,
    summary="Qaytarmalar üzrə Fırıldaqçılıq və Anomaliya Göstəriciləri",
)
async def get_fraud_indicators(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    service: Annotated[ReturnsService, Depends(get_returns_service)],
    branch_id: uuid.UUID,
    start_date: date,
    end_date: date,
) -> ReturnFraudIndicatorsResponse:
    """Şübhəli qaytarma nümunələrini və anomaliyaları təhlil edir."""
    company = await get_company_service().get_company()
    return await service.get_fraud_indicators(
        company_id=company.id,
        branch_id=branch_id,
        start_date=start_date,
        end_date=end_date,
        actor=current_user,
    )


@router.get(
    "/returns/{return_id}",
    response_model=ReturnDetailResponse,
    summary="Qaytarma Sənədinin Detalları",
)
async def get_return_by_id(
    return_id: uuid.UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    service: Annotated[ReturnsService, Depends(get_returns_service)],
) -> ReturnDetailResponse:
    """Tək qaytarma sənədini sətir və geri ödənişləri ilə gətirir."""
    company = await get_company_service().get_company()
    return await service.get_return_by_id(
        company_id=company.id,
        return_id=return_id,
        actor=current_user,
    )


@router.post(
    "/returns/{return_id}/approve",
    response_model=ReturnReceiptPayload,
    summary="PENDING_APPROVAL Qaytarmanın Təsdiqi",
)
async def approve_pending_return(
    return_id: uuid.UUID,
    request: ReturnApproveRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    service: Annotated[ReturnsService, Depends(get_returns_service)],
) -> ReturnReceiptPayload:
    """Təsdiq gözləyən qaytarmanı təsdiqləyir və stok/maliyyə hərəkətlərini icra edir."""
    company = await get_company_service().get_company()
    return await service.approve_pending_return(
        company_id=company.id,
        return_id=return_id,
        actor=current_user,
        request=request,
    )


@router.post(
    "/returns/{return_id}/reject",
    response_model=ReturnDetailResponse,
    summary="PENDING_APPROVAL Qaytarmanın Rədd Edilməsi",
)
async def reject_pending_return(
    return_id: uuid.UUID,
    request: ReturnRejectRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    service: Annotated[ReturnsService, Depends(get_returns_service)],
) -> ReturnDetailResponse:
    """Təsdiq gözləyən qaytarmanı rədd edir və rezervasiyaları ləğv edir."""
    company = await get_company_service().get_company()
    return await service.reject_pending_return(
        company_id=company.id,
        return_id=return_id,
        actor=current_user,
        request=request,
    )


@router.post(
    "/returns/{return_id}/reprint",
    response_model=ReturnReceiptPayload,
    summary="Qaytarma Çekinin Təkrar Çapı (Audited Reprint)",
)
async def reprint_return_receipt(
    return_id: uuid.UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    service: Annotated[ReturnsService, Depends(get_returns_service)],
) -> ReturnReceiptPayload:
    """Qaytarma çekinin su nişanlı nüsxəsini çap edir və audit hadisəsi qeyd edir."""
    company = await get_company_service().get_company()
    return await service.reprint_return_receipt(
        company_id=company.id,
        return_id=return_id,
        actor=current_user,
    )


@router.get(
    "/returns/customer/{customer_id}",
    response_model=CustomerReturnsHistoryResponse,
    summary="Müştərinin Qaytarma Tarixçəsi (CRM)",
)
async def get_customer_returns(
    customer_id: uuid.UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    service: Annotated[ReturnsService, Depends(get_returns_service)],
) -> CustomerReturnsHistoryResponse:
    """Müştərinin qaytarmalarını və mağaza kredit balansını gətirir."""
    company = await get_company_service().get_company()
    return await service.get_customer_returns_history(
        company_id=company.id,
        customer_id=customer_id,
        actor=current_user,
    )


@router.get(
    "/sales/{sale_id}/returnable",
    response_model=SaleReturnableInfoResponse,
    summary="Satış üzrə Qaytarıla Bilən Qalıq Saylar",
)
async def get_sale_returnable_info(
    sale_id: uuid.UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    service: Annotated[ReturnsService, Depends(get_returns_service)],
) -> SaleReturnableInfoResponse:
    """Orijinal satış üzrə sətir-sətir qalıq qaytarma hüququnu yoxlayır."""
    company = await get_company_service().get_company()
    return await service.get_sale_returnable_info(
        company_id=company.id,
        sale_id=sale_id,
        actor=current_user,
    )
