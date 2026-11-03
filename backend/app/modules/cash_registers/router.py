"""Kassa Aparatları API Marşrutları (Cash Registers Router)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from app.modules.cash_registers.schemas import (
    CashRegisterCreate,
    CashRegisterResponse,
    CashRegisterUpdate,
)
from app.modules.cash_registers.service import (
    CashRegisterService,
    get_cash_register_service,
)
from app.modules.company.service import CompanyService, get_company_service

router = APIRouter(prefix="/cash-registers", tags=["Kassa Aparatları (Cash Registers)"])


@router.get(
    "",
    response_model=list[CashRegisterResponse],
    summary="Kassa aparatlarının siyahısı",
)
async def list_cash_registers(
    request: Request,
    service: Annotated[CashRegisterService, Depends(get_cash_register_service)],
    branch_id: uuid.UUID | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
) -> list[CashRegisterResponse]:
    """Kassa aparatlarını filial və statusa görə siyahılayır."""
    actor = getattr(request.state, "user", None)
    branch_scope = getattr(request.state, "branch_scope_ids", None)
    return await service.list_registers(
        branch_id=branch_id,
        status=status_filter,
        branch_scope_ids=branch_scope,
        actor=actor,
    )


@router.post(
    "",
    response_model=CashRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni kassa aparatı qeydiyyata al",
)
async def create_cash_register(
    data: CashRegisterCreate,
    request: Request,
    reg_service: Annotated[CashRegisterService, Depends(get_cash_register_service)],
    company_service: Annotated[CompanyService, Depends(get_company_service)],
) -> CashRegisterResponse:
    """Yeni POS kassa terminalını müvafiq filiala və standart anbara bağlayır."""
    actor = getattr(request.state, "user", None)
    company_id = await company_service.get_company_id()
    return await reg_service.create_register(data=data, company_id=company_id, actor=actor)


@router.get(
    "/{register_id}",
    response_model=CashRegisterResponse,
    summary="Tək kassa aparatının məlumatları",
)
async def get_cash_register(
    register_id: uuid.UUID,
    request: Request,
    service: Annotated[CashRegisterService, Depends(get_cash_register_service)],
) -> CashRegisterResponse:
    """Kassa aparatının konfiqurasiya məlumatlarını qaytarır."""
    actor = getattr(request.state, "user", None)
    return await service.get_register(register_id=register_id, actor=actor)


@router.put(
    "/{register_id}",
    response_model=CashRegisterResponse,
    summary="Kassa aparatı məlumatlarını redaktə et",
)
async def update_cash_register(
    register_id: uuid.UUID,
    data: CashRegisterUpdate,
    request: Request,
    service: Annotated[CashRegisterService, Depends(get_cash_register_service)],
) -> CashRegisterResponse:
    """Kassanın adını, standart anbarını və ya çap profilini yeniləyir."""
    actor = getattr(request.state, "user", None)
    return await service.update_register(register_id=register_id, data=data, actor=actor)


@router.post(
    "/{register_id}/activate",
    response_model=CashRegisterResponse,
    summary="Kassa aparatını aktivləşdir",
)
async def activate_cash_register(
    register_id: uuid.UUID,
    request: Request,
    service: Annotated[CashRegisterService, Depends(get_cash_register_service)],
) -> CashRegisterResponse:
    """Kassanı aktiv vəziyyətə gətirir."""
    actor = getattr(request.state, "user", None)
    return await service.update_status(register_id=register_id, new_status="active", actor=actor)


@router.post(
    "/{register_id}/deactivate",
    response_model=CashRegisterResponse,
    summary="Kassa aparatını dayandır (Deaktiv et)",
)
async def deactivate_cash_register(
    register_id: uuid.UUID,
    request: Request,
    service: Annotated[CashRegisterService, Depends(get_cash_register_service)],
) -> CashRegisterResponse:
    """Kassa aparatını dayandırır."""
    actor = getattr(request.state, "user", None)
    return await service.update_status(register_id=register_id, new_status="inactive", actor=actor)
