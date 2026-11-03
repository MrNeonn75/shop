"""Satışlar Modulu HTTP API Marşrutları (Sales Router)."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Query, Request

from app.modules.company.service import get_company_service
from app.modules.sales.schemas import (
    ReprintRequest,
    ReprintResponse,
    SaleDetailResponse,
    SaleFilterParams,
    SaleListResponse,
)
from app.modules.sales.service import SalesService

router = APIRouter(prefix="/sales", tags=["Satışlar və Qəbzlər (Sales Records)"])


def get_current_actor(request: Request) -> Any:
    return getattr(request.state, "user", None)


def get_sales_service() -> SalesService:
    return SalesService()


@router.get(
    "",
    response_model=SaleListResponse,
    summary="Satış Qeydlərinin Çoxmeyarlı Axtarışı və Filtrasiyası",
)
async def list_sales(
    branch_id: uuid.UUID | None = Query(None, description="Filial ID-si"),
    register_id: uuid.UUID | None = Query(None, description="Kassa aparatı ID-si"),
    shift_id: uuid.UUID | None = Query(None, description="Kassa növbəsi ID-si"),
    cashier_id: uuid.UUID | None = Query(None, description="Kassir ID-si"),
    customer_id: uuid.UUID | None = Query(None, description="Müştəri ID-si"),
    status: str | None = Query(
        None, description="COMPLETED, CANCELLED, RETURNED, PARTIALLY_RETURNED"
    ),
    tender_type: str | None = Query(None, description="Ödəniş növü (cash, card və s.)"),
    start_date: date | None = Query(None, description="Başlanğıc tarixi"),
    end_date: date | None = Query(None, description="Son tarix"),
    query: str | None = Query(None, description="Çək nömrəsi, barkod və ya SKU axtarışı"),
    min_amount: Decimal | None = Query(None, description="Minimum məbləğ"),
    max_amount: Decimal | None = Query(None, description="Maksimum məbləğ"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    service: SalesService = Depends(get_sales_service),
    actor: Any = Depends(get_current_actor),
) -> SaleListResponse:
    company = await get_company_service().get_company()
    filters = SaleFilterParams(
        branch_id=branch_id,
        register_id=register_id,
        shift_id=shift_id,
        cashier_id=cashier_id,
        customer_id=customer_id,
        status=status,
        tender_type=tender_type,
        start_date=start_date,
        end_date=end_date,
        query=query,
        min_amount=min_amount,
        max_amount=max_amount,
        page=page,
        page_size=page_size,
    )
    return await service.search_sales(filters=filters, company_id=company.id, actor=actor)


@router.get(
    "/{sale_id}",
    response_model=SaleDetailResponse,
    summary="Tək Satışın Detallı Məlumatları (Xərc və marja hüquqa bağlıdır)",
)
async def get_sale_detail(
    sale_id: uuid.UUID,
    service: SalesService = Depends(get_sales_service),
    actor: Any = Depends(get_current_actor),
) -> SaleDetailResponse:
    return await service.get_sale_by_id(sale_id=sale_id, actor=actor)


@router.get(
    "/by-receipt/{receipt_no}",
    response_model=SaleDetailResponse,
    summary="Çək Nömrəsi və ya Barkod Üzrə Satış Axtarışı",
)
async def get_sale_by_receipt(
    receipt_no: str,
    service: SalesService = Depends(get_sales_service),
    actor: Any = Depends(get_current_actor),
) -> SaleDetailResponse:
    return await service.get_sale_by_receipt_no(receipt_no=receipt_no, actor=actor)


@router.post(
    "/{sale_id}/reprint",
    response_model=ReprintResponse,
    summary="Kassa Çəkinin Təkrar Çapı (Reprint - ESC/POS və HTML formatlarında)",
)
async def reprint_receipt(
    sale_id: uuid.UUID,
    data: ReprintRequest,
    service: SalesService = Depends(get_sales_service),
    actor: Any = Depends(get_current_actor),
) -> ReprintResponse:
    return await service.reprint_receipt(sale_id=sale_id, reason=data.reason, actor=actor)
