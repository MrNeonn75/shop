"""Filiallar Modulu API Marşrutları (Branches Router)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from app.modules.branches.schemas import (
    BranchCreate,
    BranchResponse,
    BranchSummaryResponse,
    BranchUpdate,
)
from app.modules.branches.service import BranchService, get_branch_service
from app.modules.company.service import CompanyService, get_company_service

router = APIRouter(prefix="/branches", tags=["Filiallar Şəbəkəsi (Branches)"])


@router.get(
    "",
    response_model=list[BranchResponse],
    summary="Filialların siyahısı (Çıxış dairəsinə uyğun)",
)
async def list_branches(
    request: Request,
    service: Annotated[BranchService, Depends(get_branch_service)],
    status_filter: str | None = Query(None, alias="status"),
) -> list[BranchResponse]:
    """İstifadəçinin hüququ çatan filialların siyahısını qaytarır."""
    actor = getattr(request.state, "user", None)
    branch_scope = getattr(request.state, "branch_scope_ids", None)
    return await service.list_branches(
        branch_scope_ids=branch_scope,
        status=status_filter,
        actor=actor,
    )


@router.post(
    "",
    response_model=BranchResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni filial yarat",
)
async def create_branch(
    data: BranchCreate,
    request: Request,
    branch_service: Annotated[BranchService, Depends(get_branch_service)],
    company_service: Annotated[CompanyService, Depends(get_company_service)],
) -> BranchResponse:
    """Yeni pərakəndə satış nöqtəsi / filial qeydiyyata alır."""
    actor = getattr(request.state, "user", None)
    company_id = await company_service.get_company_id()
    return await branch_service.create_branch(data=data, company_id=company_id, actor=actor)


@router.get(
    "/{branch_id}",
    response_model=BranchResponse,
    summary="Tək filialın təfərrüatları",
)
async def get_branch(
    branch_id: uuid.UUID,
    request: Request,
    service: Annotated[BranchService, Depends(get_branch_service)],
) -> BranchResponse:
    """Filialın iş saatları və sazlamaları ilə birlikdə məlumatlarını qaytarır."""
    actor = getattr(request.state, "user", None)
    return await service.get_branch(branch_id=branch_id, actor=actor)


@router.put(
    "/{branch_id}",
    response_model=BranchResponse,
    summary="Filial məlumatlarını redaktə et",
)
async def update_branch(
    branch_id: uuid.UUID,
    data: BranchUpdate,
    request: Request,
    service: Annotated[BranchService, Depends(get_branch_service)],
) -> BranchResponse:
    """Filialın ünvan, əlaqə və iş saatlarını yeniləyir."""
    actor = getattr(request.state, "user", None)
    return await service.update_branch(branch_id=branch_id, data=data, actor=actor)


@router.post(
    "/{branch_id}/activate",
    response_model=BranchResponse,
    summary="Filialı aktivləşdir",
)
async def activate_branch(
    branch_id: uuid.UUID,
    request: Request,
    service: Annotated[BranchService, Depends(get_branch_service)],
) -> BranchResponse:
    """Dayandırılmış filialı yenidən aktiv vəziyyətə gətirir."""
    actor = getattr(request.state, "user", None)
    return await service.update_status(branch_id=branch_id, new_status="active", actor=actor)


@router.post(
    "/{branch_id}/deactivate",
    response_model=BranchResponse,
    summary="Filialı dayandır (Deaktiv et)",
)
async def deactivate_branch(
    branch_id: uuid.UUID,
    request: Request,
    service: Annotated[BranchService, Depends(get_branch_service)],
) -> BranchResponse:
    """Filialı dayandırır. Açıq kassa, anbar qalığı və ya açıq sənədlər olduqda blokerlərlə imtina edir."""
    actor = getattr(request.state, "user", None)
    return await service.update_status(branch_id=branch_id, new_status="inactive", actor=actor)


@router.get(
    "/{branch_id}/summary",
    response_model=BranchSummaryResponse,
    summary="Filial üzrə icmal statistikası",
)
async def get_branch_summary(
    branch_id: uuid.UUID,
    request: Request,
    service: Annotated[BranchService, Depends(get_branch_service)],
) -> BranchSummaryResponse:
    """Filiala aid anbar, kassa və işçi sayını servis interfeysləri ilə hesablayır."""
    actor = getattr(request.state, "user", None)
    return await service.get_branch_summary(branch_id=branch_id, actor=actor)
