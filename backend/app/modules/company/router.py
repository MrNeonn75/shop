"""Şirkət Modulu API Marşrutları (Company Router)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.modules.company.schemas import CompanyResponse, CompanyUpdate
from app.modules.company.service import CompanyService, get_company_service

router = APIRouter(prefix="/company", tags=["Şirkət Profili (Company)"])


@router.get(
    "",
    response_model=CompanyResponse,
    summary="Şirkət profil məlumatlarını əldə et",
)
async def get_company_profile(
    request: Request,
    service: Annotated[CompanyService, Depends(get_company_service)],
) -> CompanyResponse:
    """Əsas şirkətin hüquqi rekvizitləri, əlaqə və sistem sazlamalarını qaytarır."""
    actor = getattr(request.state, "user", None)
    return await service.get_company(actor=actor)


@router.put(
    "",
    response_model=CompanyResponse,
    summary="Şirkət profil məlumatlarını yenilə",
)
async def update_company_profile(
    data: CompanyUpdate,
    request: Request,
    service: Annotated[CompanyService, Depends(get_company_service)],
) -> CompanyResponse:
    """Şirkət məlumatlarını optimistik kilidləmə (version) ilə yeniləyir və auditə qeyd edir."""
    actor = getattr(request.state, "user", None)
    return await service.update_company(data=data, actor=actor)
