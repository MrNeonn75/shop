"""Compliance REST API — prefix /compliance."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.modules.auth.policies import AuthenticatedUser, get_current_user
from app.modules.compliance.schemas import (
    ActivatePackRequest,
    ComplianceBannerResponse,
    ComplianceStatusResponse,
    LegalRuleResponse,
    ObligationCreate,
    ObligationResponse,
    ObligationUpdate,
    PackVersionResponse,
    ProposeChangeRequest,
    RegisterExportResponse,
    RejectPackRequest,
    VerifyPackRequest,
    VersionDiffResponse,
)
from app.modules.compliance.service import ComplianceService, get_compliance_service

router = APIRouter(prefix="/compliance", tags=["Compliance"])


def _svc() -> ComplianceService:
    return get_compliance_service()


# ------------------------------------------
# Rules
# ------------------------------------------


@router.get("/rules", response_model=list[LegalRuleResponse], summary="Qaydaların siyahısı")
async def list_rules(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    service: Annotated[ComplianceService, Depends(_svc)],
    domain: str | None = None,
    rule_key: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    pack_version_id: uuid.UUID | None = None,
    at: datetime | None = None,
) -> list[LegalRuleResponse]:
    rows = await service.list_rules(
        session,
        current_user,
        domain=domain,
        rule_key=rule_key,
        status=status_filter,
        pack_version_id=pack_version_id,
        at=at,
    )
    return [LegalRuleResponse.model_validate(r) for r in rows]


@router.get("/rules/{rule_id}", response_model=LegalRuleResponse, summary="Qayda detalı")
async def get_rule(
    rule_id: uuid.UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    service: Annotated[ComplianceService, Depends(_svc)],
) -> LegalRuleResponse:
    row = await service.get_rule_by_id(session, current_user, rule_id)
    return LegalRuleResponse.model_validate(row)


@router.get(
    "/rules/{rule_id}/history",
    response_model=list[LegalRuleResponse],
    summary="Qayda tarixçəsi",
)
async def get_rule_history(
    rule_id: uuid.UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    service: Annotated[ComplianceService, Depends(_svc)],
) -> list[LegalRuleResponse]:
    rows = await service.get_rule_history(session, current_user, rule_id)
    return [LegalRuleResponse.model_validate(r) for r in rows]


# ------------------------------------------
# Packs / versions
# ------------------------------------------


@router.post(
    "/packs/{pack_id}/versions",
    response_model=PackVersionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni DRAFT paket versiyası (propose)",
)
async def propose_pack_version(
    pack_id: uuid.UUID,
    request: ProposeChangeRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    service: Annotated[ComplianceService, Depends(_svc)],
) -> PackVersionResponse:
    version = await service.propose_change(session, current_user, pack_id, request)
    await session.commit()
    return PackVersionResponse.model_validate(version)


@router.post(
    "/pack-versions/{version_id}/verify",
    response_model=PackVersionResponse,
    summary="Paket versiyasını yoxla (two-person)",
)
async def verify_pack_version(
    version_id: uuid.UUID,
    request: VerifyPackRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    service: Annotated[ComplianceService, Depends(_svc)],
) -> PackVersionResponse:
    version = await service.verify_pack(session, current_user, version_id, request)
    await session.commit()
    return PackVersionResponse.model_validate(version)


@router.post(
    "/pack-versions/{version_id}/reject",
    response_model=PackVersionResponse,
    summary="Paket versiyasını rədd et",
)
async def reject_pack_version(
    version_id: uuid.UUID,
    request: RejectPackRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    service: Annotated[ComplianceService, Depends(_svc)],
) -> PackVersionResponse:
    version = await service.reject_pack(session, current_user, version_id, request)
    await session.commit()
    return PackVersionResponse.model_validate(version)


@router.post(
    "/pack-versions/{version_id}/activate",
    response_model=PackVersionResponse,
    summary="Paket versiyasını aktivləşdir",
)
async def activate_pack_version(
    version_id: uuid.UUID,
    request: ActivatePackRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    service: Annotated[ComplianceService, Depends(_svc)],
) -> PackVersionResponse:
    version = await service.activate_pack(session, current_user, version_id, request)
    await session.commit()
    return PackVersionResponse.model_validate(version)


@router.get(
    "/pack-versions/{version_a_id}/diff/{version_b_id}",
    response_model=VersionDiffResponse,
    summary="İki paket versiyası arasında fərq",
)
async def diff_pack_versions(
    version_a_id: uuid.UUID,
    version_b_id: uuid.UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    service: Annotated[ComplianceService, Depends(_svc)],
) -> VersionDiffResponse:
    return await service.diff_versions(session, current_user, version_a_id, version_b_id)


# ------------------------------------------
# Status / banner / export
# ------------------------------------------


@router.get("/status", response_model=ComplianceStatusResponse, summary="Uyğunluq statusu")
async def compliance_status(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    service: Annotated[ComplianceService, Depends(_svc)],
) -> ComplianceStatusResponse:
    return await service.get_compliance_status(session, current_user)


@router.get("/banner", response_model=ComplianceBannerResponse, summary="UNVERIFIED banner")
async def compliance_banner(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    service: Annotated[ComplianceService, Depends(_svc)],
) -> ComplianceBannerResponse:
    return await service.get_banner(session)


@router.get(
    "/register/export",
    response_model=RegisterExportResponse,
    summary="Hüquqi reyestr ixracı (csv|pdf)",
)
async def export_register(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    service: Annotated[ComplianceService, Depends(_svc)],
    format: str = Query("csv", pattern="^(csv|pdf)$"),
) -> RegisterExportResponse | Response:
    result = await service.export_register(session, current_user, fmt=format)
    return RegisterExportResponse(
        format=result["format"],
        content_type=result["content_type"],
        filename=result["filename"],
        body=result["body"],
        disclaimer=result["disclaimer"],
    )


# ------------------------------------------
# Obligations CRUD
# ------------------------------------------


@router.get("/obligations", response_model=list[ObligationResponse], summary="Öhdəliklər")
async def list_obligations(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    service: Annotated[ComplianceService, Depends(_svc)],
    status_filter: str | None = Query(None, alias="status"),
    company_id: uuid.UUID | None = None,
) -> list[ObligationResponse]:
    rows = await service.list_obligations(
        session, current_user, status=status_filter, company_id=company_id
    )
    return [ObligationResponse.model_validate(r) for r in rows]


@router.post(
    "/obligations",
    response_model=ObligationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Öhdəlik yarat",
)
async def create_obligation(
    data: ObligationCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    service: Annotated[ComplianceService, Depends(_svc)],
) -> ObligationResponse:
    row = await service.create_obligation(session, current_user, data)
    await session.commit()
    return ObligationResponse.model_validate(row)


@router.get(
    "/obligations/{obligation_id}",
    response_model=ObligationResponse,
    summary="Öhdəlik detalı",
)
async def get_obligation(
    obligation_id: uuid.UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    service: Annotated[ComplianceService, Depends(_svc)],
) -> ObligationResponse:
    row = await service.get_obligation(session, current_user, obligation_id)
    return ObligationResponse.model_validate(row)


@router.patch(
    "/obligations/{obligation_id}",
    response_model=ObligationResponse,
    summary="Öhdəlik yenilə",
)
async def update_obligation(
    obligation_id: uuid.UUID,
    data: ObligationUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    service: Annotated[ComplianceService, Depends(_svc)],
) -> ObligationResponse:
    row = await service.update_obligation(session, current_user, obligation_id, data)
    await session.commit()
    return ObligationResponse.model_validate(row)


@router.delete(
    "/obligations/{obligation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Öhdəliyi ləğv et",
)
async def delete_obligation(
    obligation_id: uuid.UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    service: Annotated[ComplianceService, Depends(_svc)],
) -> Response:
    await service.delete_obligation(session, current_user, obligation_id)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
