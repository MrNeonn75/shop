"""Anbarlar Modulu API Marşrutları (Warehouses Router)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response, status

from app.modules.company.service import CompanyService, get_company_service
from app.modules.warehouses.schemas import (
    WarehouseCreate,
    WarehouseResponse,
    WarehouseUpdate,
    WarehouseZoneCreate,
    WarehouseZoneResponse,
)
from app.modules.warehouses.service import WarehouseService, get_warehouse_service

router = APIRouter(prefix="/warehouses", tags=["Anbarlar Şəbəkəsi (Warehouses)"])


@router.get(
    "",
    response_model=list[WarehouseResponse],
    summary="Anbarların siyahısı",
)
async def list_warehouses(
    request: Request,
    service: Annotated[WarehouseService, Depends(get_warehouse_service)],
    branch_id: uuid.UUID | None = Query(None),
    warehouse_type: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
) -> list[WarehouseResponse]:
    """Filial və ya mərkəzi anbarların siyahısını qaytarır."""
    actor = getattr(request.state, "user", None)
    branch_scope = getattr(request.state, "branch_scope_ids", None)
    return await service.list_warehouses(
        branch_id=branch_id,
        warehouse_type=warehouse_type,
        status=status_filter,
        branch_scope_ids=branch_scope,
        actor=actor,
    )


@router.post(
    "",
    response_model=WarehouseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni anbar yarat",
)
async def create_warehouse(
    data: WarehouseCreate,
    request: Request,
    warehouse_service: Annotated[WarehouseService, Depends(get_warehouse_service)],
    company_service: Annotated[CompanyService, Depends(get_company_service)],
) -> WarehouseResponse:
    """Yeni fiziki və ya məntiqi anbar qeydiyyata alır."""
    actor = getattr(request.state, "user", None)
    company_id = await company_service.get_company_id()
    return await warehouse_service.create_warehouse(data=data, company_id=company_id, actor=actor)


@router.get(
    "/{warehouse_id}",
    response_model=WarehouseResponse,
    summary="Tək anbarın təfərrüatları",
)
async def get_warehouse(
    warehouse_id: uuid.UUID,
    request: Request,
    service: Annotated[WarehouseService, Depends(get_warehouse_service)],
) -> WarehouseResponse:
    """Anbar və ona bağlı zonaların məlumatlarını qaytarır."""
    actor = getattr(request.state, "user", None)
    return await service.get_warehouse(warehouse_id=warehouse_id, actor=actor)


@router.put(
    "/{warehouse_id}",
    response_model=WarehouseResponse,
    summary="Anbar məlumatlarını redaktə et",
)
async def update_warehouse(
    warehouse_id: uuid.UUID,
    data: WarehouseUpdate,
    request: Request,
    service: Annotated[WarehouseService, Depends(get_warehouse_service)],
) -> WarehouseResponse:
    """Anbarın ad və satış üçün standart olma parametrlərini yeniləyir."""
    actor = getattr(request.state, "user", None)
    return await service.update_warehouse(warehouse_id=warehouse_id, data=data, actor=actor)


@router.post(
    "/{warehouse_id}/activate",
    response_model=WarehouseResponse,
    summary="Anbarı aktivləşdir",
)
async def activate_warehouse(
    warehouse_id: uuid.UUID,
    request: Request,
    service: Annotated[WarehouseService, Depends(get_warehouse_service)],
) -> WarehouseResponse:
    """Anbarı aktiv vəziyyətə gətirir."""
    actor = getattr(request.state, "user", None)
    return await service.update_status(warehouse_id=warehouse_id, new_status="active", actor=actor)


@router.post(
    "/{warehouse_id}/deactivate",
    response_model=WarehouseResponse,
    summary="Anbarı dayandır (Deaktiv et)",
)
async def deactivate_warehouse(
    warehouse_id: uuid.UUID,
    request: Request,
    service: Annotated[WarehouseService, Depends(get_warehouse_service)],
) -> WarehouseResponse:
    """Anbarı dayandırır. Qalıq və ya açıq sənədlər olduqda blokerlərlə imtina edir."""
    actor = getattr(request.state, "user", None)
    return await service.update_status(
        warehouse_id=warehouse_id, new_status="inactive", actor=actor
    )


@router.delete(
    "/{warehouse_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Anbarı sil",
)
async def delete_warehouse(
    warehouse_id: uuid.UUID,
    request: Request,
    service: Annotated[WarehouseService, Depends(get_warehouse_service)],
) -> Response:
    """Anbarı silir. Sistem anbarı silinə bilməz."""
    actor = getattr(request.state, "user", None)
    await service.delete_warehouse(warehouse_id=warehouse_id, actor=actor)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/{warehouse_id}/zones",
    response_model=list[WarehouseZoneResponse],
    summary="Anbar zonalarının siyahısı",
)
async def list_warehouse_zones(
    warehouse_id: uuid.UUID,
    request: Request,
    service: Annotated[WarehouseService, Depends(get_warehouse_service)],
) -> list[WarehouseZoneResponse]:
    """Anbara aid stellaj və bölmə zonalarını qaytarır."""
    actor = getattr(request.state, "user", None)
    return await service.list_zones(warehouse_id=warehouse_id, actor=actor)


@router.post(
    "/{warehouse_id}/zones",
    response_model=WarehouseZoneResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Anbara yeni zona əlavə et",
)
async def create_warehouse_zone(
    warehouse_id: uuid.UUID,
    data: WarehouseZoneCreate,
    request: Request,
    service: Annotated[WarehouseService, Depends(get_warehouse_service)],
) -> WarehouseZoneResponse:
    """Anbar daxilində yeni bölmə/zona yaradır."""
    actor = getattr(request.state, "user", None)
    return await service.add_zone(warehouse_id=warehouse_id, data=data, actor=actor)
