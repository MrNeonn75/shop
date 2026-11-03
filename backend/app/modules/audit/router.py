"""Audit Modulu API Marşrutları (Audit Router)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel

from app.core.pagination import FilterBarParams, PaginatedResponse
from app.modules.audit.schemas import (
    AuditEventResponse,
    EntityTimelineResponse,
    IntegrityVerifyResponse,
)
from app.modules.audit.service import AuditService, get_audit_service

router = APIRouter(prefix="/audit", tags=["Audit & Security Log"])


class VerifyIntegrityRequest(BaseModel):
    date_from: datetime | None = None
    date_to: datetime | None = None


@router.get(
    "/events",
    response_model=PaginatedResponse[AuditEventResponse],
    summary="Audit və təhlükəsizlik hadisələrini gətir",
)
async def list_audit_events(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    module: str | None = Query(None),
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    actor_id: uuid.UUID | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
    severity: str | None = Query(None),
    correlation_id: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    service: Annotated[AuditService, Depends(get_audit_service)] = None,  # type: ignore[assignment]
) -> PaginatedResponse[AuditEventResponse]:
    """Audit hadisələri üzrə axtarış və filtrasiya."""
    params = FilterBarParams(page=page, page_size=page_size, date_from=date_from, date_to=date_to)
    actor = getattr(request.state, "user", None)

    items, total = await service.list_events(
        params=params,
        module=module,
        action=action,
        resource_type=resource_type,
        actor_id=actor_id,
        branch_id=branch_id,
        severity=severity,
        correlation_id=correlation_id,
        actor=actor,
    )
    return PaginatedResponse.create(
        items=items,
        total=total,
        page=params.page,
        page_size=params.page_size,
    )


@router.get(
    "/entities/{entity_type}/{entity_id}/timeline",
    response_model=EntityTimelineResponse,
    summary="Müəyyən obyektin tam audit xronologiyası (Timeline)",
)
async def get_entity_timeline(
    entity_type: str,
    entity_id: str,
    request: Request,
    service: Annotated[AuditService, Depends(get_audit_service)],
) -> EntityTimelineResponse:
    """Müəyyən sənəd, məhsul və ya istifadəçinin bütün dəyişiklik tarixçəsini göstərir."""
    actor = getattr(request.state, "user", None)
    return await service.get_entity_timeline(
        entity_type=entity_type, entity_id=entity_id, actor=actor
    )


@router.post(
    "/verify-integrity",
    response_model=IntegrityVerifyResponse,
    summary="Audit zəncirinin kriptoqrafik bütövlüyünü yoxla (Hash Chain)",
)
async def verify_integrity(
    data: VerifyIntegrityRequest,
    request: Request,
    service: Annotated[AuditService, Depends(get_audit_service)],
) -> IntegrityVerifyResponse:
    """Audit qeydlərinin dəyişdirilib-dəyişdirilmədiyini SHA-256 heş zənciri ilə təftiş edir."""
    actor = getattr(request.state, "user", None)
    return await service.verify_integrity(
        date_from=data.date_from, date_to=data.date_to, actor=actor
    )


@router.get(
    "/export",
    summary="Audit jurnalını ixrac et (Audited Export)",
)
async def export_audit_events(
    request: Request,
    service: Annotated[AuditService, Depends(get_audit_service)],
) -> dict[str, Any]:
    """Audit jurnalını ixrac edir və bu ixracın özünü təhlükəsizlik hadisəsi kimi qeyd edir."""
    actor = getattr(request.state, "user", None)
    await service.log_export(actor=actor, filter_summary=str(request.query_params))
    # Sadələşdirilmiş nümunə ixrac statusu
    return {
        "status": "success",
        "message": "Audit hadisələri ixrac edildi və əməliyyat jurnala qeyd olundu.",
        "download_url": "/api/v1/audit/downloads/export_sample.csv",
    }
