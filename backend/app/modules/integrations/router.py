"""Kənar İnteqrasiyalar Modulu API Marşrutları (Integrations Router)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.modules.integrations.schemas import (
    BulkReplayRequest,
    DeadLetterEventResponse,
    IntegrationCallLogResponse,
    IntegrationResponse,
    IntegrationTestConnectionResponse,
    IntegrationUpdateRequest,
    SecretsRotateResponse,
    SyncRunResponse,
    SyncTriggerRequest,
)
from app.modules.integrations.service import (
    IntegrationService,
    get_integration_service,
)
from app.shared.integrations import AllIntegrationsStatusResponse, get_integrations_status_dict

router = APIRouter(prefix="/integrations", tags=["Kənar İnteqrasiyalar (Integrations)"])


@router.get(
    "",
    response_model=list[IntegrationResponse],
    summary="Bütün inteqrasiyaların status reyestri",
)
async def list_integrations(
    request: Request,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
) -> list[IntegrationResponse]:
    """Sistemdəki bütün kənar inteqrasiyaların siyahısını və vəziyyətini qaytarır."""
    actor = getattr(request.state, "user", None)
    return await service.list_integrations(actor=actor)


@router.get(
    "/status",
    response_model=AllIntegrationsStatusResponse,
    summary="Kənar inteqrasiyaların ümumi vəziyyəti (B1 uyğunluğu)",
)
async def get_all_integrations_status(request: Request) -> AllIntegrationsStatusResponse:
    """Bütün əsas xidmətlərin .env konfiqurasiya xülasəsi."""
    _ = getattr(request.state, "user", None)
    data = get_integrations_status_dict()
    return AllIntegrationsStatusResponse(**data)


@router.get(
    "/dead-letter/events",
    response_model=list[DeadLetterEventResponse],
    summary="Dead-letter hadisələrinin siyahısı",
)
async def list_dead_letters(
    request: Request,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[DeadLetterEventResponse]:
    """Maksimal cəhd sayını aşıb dayandırılmış outbox hadisələrinin siyahısı."""
    actor = getattr(request.state, "user", None)
    return await service.list_dead_letters(limit=limit, offset=offset, actor=actor)


@router.post(
    "/dead-letter/{event_id}/replay",
    response_model=DeadLetterEventResponse,
    summary="Dead-letter hadisəsini təkrar icraya burax",
)
async def replay_dead_letter(
    event_id: uuid.UUID,
    request: Request,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
) -> DeadLetterEventResponse:
    """Tək hadisəni yenidən PENDING statusuna qaytararaq emala buraxır."""
    actor = getattr(request.state, "user", None)
    return await service.replay_dead_letter(event_id=event_id, actor=actor)


@router.post(
    "/dead-letter/bulk-replay",
    summary="Toplu dead-letter hadisələrini təkrar icraya burax",
)
async def bulk_replay_dead_letters(
    body: BulkReplayRequest,
    request: Request,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
) -> dict[str, int]:
    """Filtrlənmiş aralıqdakı bütün dead-letter hadisələrini yenidən icraya buraxır."""
    actor = getattr(request.state, "user", None)
    count = await service.bulk_replay(
        event_type=body.event_type,
        start_time=body.start_time,
        end_time=body.end_time,
        actor=actor,
    )
    return {"replayed_count": count}


@router.get(
    "/{key}",
    response_model=IntegrationResponse,
    summary="İnteqrasiyanın detalları",
)
async def get_integration(
    key: str,
    request: Request,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
) -> IntegrationResponse:
    """Tək inteqrasiyanın statusunu və maskalanmış göstəricisini qaytarır."""
    actor = getattr(request.state, "user", None)
    return await service.get_integration(key=key, actor=actor)


@router.put(
    "/{key}",
    response_model=IntegrationResponse,
    summary="İnteqrasiya konfiqurasiyasını yenilə (Açarlar write-only)",
)
async def update_integration(
    key: str,
    data: IntegrationUpdateRequest,
    request: Request,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
) -> IntegrationResponse:
    """Məxfi açarları və parametrləri yeniləyir. Açarlar cavabda heç vaxt geri qaytarılmır."""
    actor = getattr(request.state, "user", None)
    return await service.update_integration(key=key, data=data, actor=actor)


@router.post(
    "/{key}/rotate-secrets",
    response_model=SecretsRotateResponse,
    summary="Məxfi açarların kriptoqrafik rotasiyası",
)
async def rotate_secrets(
    key: str,
    request: Request,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
) -> SecretsRotateResponse:
    """İnteqrasiyanın şifrələnmiş açarlarını yeni əsas açarla yenidən şifrələyir."""
    actor = getattr(request.state, "user", None)
    return await service.rotate_secrets(key=key, actor=actor)


@router.post(
    "/{key}/test-connection",
    response_model=IntegrationTestConnectionResponse,
    summary="İnteqrasiya ilə əlaqəni yoxla (test-connection)",
)
async def test_connection(
    key: str,
    request: Request,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
) -> IntegrationTestConnectionResponse:
    """Xarici sistemlə real əlaqəni test edir. Konfiqurasiya yoxdursa NOT_CONFIGURED qaytarır."""
    actor = getattr(request.state, "user", None)
    return await service.test_connection(key=key, actor=actor)


@router.post(
    "/{key}/sync",
    response_model=SyncRunResponse,
    summary="İnteqrasiya üzrə məlumat sinxronizasiyasını başlat",
)
async def trigger_sync(
    key: str,
    body: SyncTriggerRequest,
    request: Request,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
) -> SyncRunResponse:
    """Sinxronizasiya sessiyası başladır. Status ACTIVE deyilsə xəta qaytarır."""
    actor = getattr(request.state, "user", None)
    return await service.trigger_sync(
        key=key,
        direction=body.direction,
        is_dry_run=body.is_dry_run,
        actor=actor,
    )


@router.get(
    "/{key}/sync-runs",
    response_model=list[SyncRunResponse],
    summary="Sinxronizasiya sessiyalarının tarixi",
)
async def list_sync_runs(
    key: str,
    request: Request,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
    limit: int = Query(20, ge=1, le=100),
) -> list[SyncRunResponse]:
    """İnteqrasiya üzrə keçirilmiş sinxronizasiyaların siyahısı."""
    actor = getattr(request.state, "user", None)
    return await service.list_sync_runs(key=key, limit=limit, actor=actor)


@router.get(
    "/{key}/logs",
    response_model=list[IntegrationCallLogResponse],
    summary="İnteqrasiyanın redaktə olunmuş çağırış jurnalı",
)
async def list_integration_logs(
    key: str,
    request: Request,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
    limit: int = Query(50, ge=1, le=200),
) -> list[IntegrationCallLogResponse]:
    """İnteqrasiyaya edilən son sorğu və cavabların jurnalı (Məxfi məlumatlar maskalanmışdır)."""
    actor = getattr(request.state, "user", None)
    return await service.list_logs(key=key, limit=limit, actor=actor)
