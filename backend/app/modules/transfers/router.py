"""Transferlər Modulu HTTP Marşrutları (Transfers API Router).

Filiallararası və anbarlararası transferlərin yaradılması, təsdiqlənməsi,
yola salınması, qəbul edilməsi və tranzit monitorinqi endpoint-ləri.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, Query, Request, status

from app.modules.company.service import get_company_service
from app.modules.transfers.policies import check_transfer_permission
from app.modules.transfers.schemas import (
    InTransitReportResponse,
    TransferCancelRequest,
    TransferCreate,
    TransferDispatchRequest,
    TransferPickRequest,
    TransferReceiveRequest,
    TransferResponse,
)
from app.modules.transfers.service import TransfersService, get_transfers_service

router = APIRouter(prefix="/transfers", tags=["Transferlər və Yerdəyişmə"])


def get_current_actor(request: Request) -> Any:
    return getattr(request.state, "user", None)


@router.post(
    "",
    response_model=TransferResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Transfer Yaratma (Draft)",
)
async def create_transfer(
    data: TransferCreate,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    service: TransfersService = Depends(get_transfers_service),
    actor: Any = Depends(get_current_actor),
) -> TransferResponse:
    _ = idempotency_key
    check_transfer_permission("transfers.manage", actor)
    company = await get_company_service().get_company()
    tr = await service.create_transfer(company.id, data, actor=actor)
    return TransferResponse.model_validate(tr)


@router.get(
    "",
    response_model=list[TransferResponse],
    summary="Transferlərin Siyahısı",
)
async def list_transfers(
    status: str | None = None,
    source_warehouse_id: uuid.UUID | None = None,
    destination_warehouse_id: uuid.UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    service: TransfersService = Depends(get_transfers_service),
    actor: Any = Depends(get_current_actor),
) -> list[TransferResponse]:
    check_transfer_permission("transfers.manage", actor)
    company = await get_company_service().get_company()
    items, _ = await service.list_transfers(
        company_id=company.id,
        status=status,
        source_warehouse_id=source_warehouse_id,
        destination_warehouse_id=destination_warehouse_id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
        actor=actor,
    )
    return [TransferResponse.model_validate(tr) for tr in items]


@router.get(
    "/in-transit",
    response_model=InTransitReportResponse,
    summary="Yolda Olan Transferlər və Gecikmə (SLA) Hesabatı",
)
@router.get(
    "/in-transit/report",
    response_model=InTransitReportResponse,
    summary="Yolda Olan Transferlər və Gecikmə (SLA) Hesabatı",
)
async def get_in_transit_report(
    service: TransfersService = Depends(get_transfers_service),
    actor: Any = Depends(get_current_actor),
) -> InTransitReportResponse:
    check_transfer_permission("transfers.manage", actor)
    company = await get_company_service().get_company()
    return await service.get_in_transit_report(company.id, actor=actor)


@router.get(
    "/{transfer_id}",
    response_model=TransferResponse,
    summary="Tək Transfer Məlumatları",
)
async def get_transfer(
    transfer_id: uuid.UUID,
    service: TransfersService = Depends(get_transfers_service),
    actor: Any = Depends(get_current_actor),
) -> TransferResponse:
    check_transfer_permission("transfers.manage", actor)
    tr = await service.get_transfer(transfer_id, actor=actor)
    return TransferResponse.model_validate(tr)


@router.post(
    "/{transfer_id}/submit",
    response_model=TransferResponse,
    summary="Transferi Təsdiqə Göndərmə (DRAFT -> SUBMITTED)",
)
async def submit_transfer(
    transfer_id: uuid.UUID,
    service: TransfersService = Depends(get_transfers_service),
    actor: Any = Depends(get_current_actor),
) -> TransferResponse:
    check_transfer_permission("transfers.manage", actor)
    tr = await service.submit_transfer(transfer_id, actor=actor)
    return TransferResponse.model_validate(tr)


@router.post(
    "/{transfer_id}/approve",
    response_model=TransferResponse,
    summary="Transferi Təsdiq Etmə və Malları Rezervasiya Etmə (SUBMITTED -> APPROVED)",
)
async def approve_transfer(
    transfer_id: uuid.UUID,
    service: TransfersService = Depends(get_transfers_service),
    actor: Any = Depends(get_current_actor),
) -> TransferResponse:
    check_transfer_permission("transfers.approve", actor)
    tr = await service.approve_transfer(transfer_id, actor=actor)
    return TransferResponse.model_validate(tr)


@router.post(
    "/{transfer_id}/reject",
    response_model=TransferResponse,
    summary="Transferdən İmtina Etmə (SUBMITTED -> REJECTED)",
)
async def reject_transfer(
    transfer_id: uuid.UUID,
    data: TransferCancelRequest,
    service: TransfersService = Depends(get_transfers_service),
    actor: Any = Depends(get_current_actor),
) -> TransferResponse:
    check_transfer_permission("transfers.approve", actor)
    tr = await service.reject_transfer(transfer_id, reason=data.reason, actor=actor)
    return TransferResponse.model_validate(tr)


@router.post(
    "/{transfer_id}/pick",
    response_model=TransferResponse,
    summary="Malların Anbardan Yığılması (APPROVED -> PICKING)",
)
async def pick_transfer(
    transfer_id: uuid.UUID,
    data: TransferPickRequest,
    service: TransfersService = Depends(get_transfers_service),
    actor: Any = Depends(get_current_actor),
) -> TransferResponse:
    check_transfer_permission("transfers.dispatch", actor)
    tr = await service.pick_transfer(transfer_id, data, actor=actor)
    return TransferResponse.model_validate(tr)


@router.post(
    "/{transfer_id}/dispatch",
    response_model=TransferResponse,
    summary="Transferi Yola Salma (TRANSFER_OUT: Mənbə -> Tranzit)",
)
async def dispatch_transfer(
    transfer_id: uuid.UUID,
    data: TransferDispatchRequest,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    service: TransfersService = Depends(get_transfers_service),
    actor: Any = Depends(get_current_actor),
) -> TransferResponse:
    _ = idempotency_key
    check_transfer_permission("transfers.dispatch", actor)
    tr = await service.dispatch_transfer(transfer_id, data, actor=actor)
    return TransferResponse.model_validate(tr)


@router.post(
    "/{transfer_id}/receive",
    response_model=TransferResponse,
    summary="Təyinat Anbarında Qəbul (TRANSFER_IN: Tranzit -> Təyinat)",
)
async def receive_transfer(
    transfer_id: uuid.UUID,
    data: TransferReceiveRequest,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    service: TransfersService = Depends(get_transfers_service),
    actor: Any = Depends(get_current_actor),
) -> TransferResponse:
    _ = idempotency_key
    check_transfer_permission("transfers.receive", actor)
    tr = await service.receive_transfer(transfer_id, data, actor=actor)
    return TransferResponse.model_validate(tr)


@router.post(
    "/{transfer_id}/cancel",
    response_model=TransferResponse,
    summary="Transferi Ləğv Etmə",
)
async def cancel_transfer(
    transfer_id: uuid.UUID,
    data: TransferCancelRequest,
    service: TransfersService = Depends(get_transfers_service),
    actor: Any = Depends(get_current_actor),
) -> TransferResponse:
    check_transfer_permission("transfers.cancel", actor)
    tr = await service.cancel_transfer(transfer_id, reason=data.reason, actor=actor)
    return TransferResponse.model_validate(tr)
