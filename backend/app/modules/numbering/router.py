"""Sənəd Nömrələnməsi Modulu API Marşrutları (Numbering Router)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from app.modules.company.service import get_company_service
from app.modules.numbering.schemas import (
    NextNumberRequest,
    NextNumberResponse,
    NumberingPreviewRequest,
    NumberingPreviewResponse,
    NumberingSequenceCreate,
    NumberingSequenceResponse,
    NumberingSequenceUpdate,
)
from app.modules.numbering.service import NumberingService, get_numbering_service

router = APIRouter(prefix="/numbering", tags=["Sənəd Nömrələnməsi (Numbering)"])


@router.get(
    "/sequences",
    response_model=list[NumberingSequenceResponse],
    summary="Nömrələnmə ardıcıllıqlarının siyahısı",
)
async def list_sequences(
    request: Request,
    service: Annotated[NumberingService, Depends(get_numbering_service)],
    document_type: str | None = Query(None),
    scope: str | None = Query(None),
    is_active: bool | None = Query(None),
) -> list[NumberingSequenceResponse]:
    """Bütün sənəd növləri üzrə aktiv ardıcıllıqları qaytarır."""
    actor = getattr(request.state, "user", None)
    return await service.list_sequences(
        document_type=document_type,
        scope=scope,
        is_active=is_active,
        actor=actor,
    )


@router.post(
    "/sequences",
    response_model=NumberingSequenceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni nömrələnmə ardıcıllığı yarat",
)
async def create_sequence(
    data: NumberingSequenceCreate,
    request: Request,
    service: Annotated[NumberingService, Depends(get_numbering_service)],
) -> NumberingSequenceResponse:
    """Müəyyən sənəd növü və əhatə dairəsi üçün yeni nömrələnmə ardıcıllığı təyin edir."""
    actor = getattr(request.state, "user", None)
    company_svc = get_company_service()
    comp = await company_svc.get_company()
    return await service.create_sequence(data=data, company_id=comp.id, actor=actor)


@router.get(
    "/sequences/{sequence_id}",
    response_model=NumberingSequenceResponse,
    summary="Nömrələnmə ardıcıllığının detalları",
)
async def get_sequence(
    sequence_id: uuid.UUID,
    request: Request,
    service: Annotated[NumberingService, Depends(get_numbering_service)],
) -> NumberingSequenceResponse:
    """Tək ardıcıllığın cari sayğac və şablon məlumatlarını gətirir."""
    actor = getattr(request.state, "user", None)
    return await service.get_sequence(sequence_id=sequence_id, actor=actor)


@router.put(
    "/sequences/{sequence_id}",
    response_model=NumberingSequenceResponse,
    summary="Nömrələnmə ardıcıllığını redaktə et",
)
async def update_sequence(
    sequence_id: uuid.UUID,
    data: NumberingSequenceUpdate,
    request: Request,
    service: Annotated[NumberingService, Depends(get_numbering_service)],
) -> NumberingSequenceResponse:
    """Ardıcıllığın şablonunu və ya sıfırlanma qaydasını yeniləyir (yalnız gələcək sənədlərə təsir edir)."""
    actor = getattr(request.state, "user", None)
    return await service.update_sequence(sequence_id=sequence_id, data=data, actor=actor)


@router.post(
    "/preview",
    response_model=NumberingPreviewResponse,
    summary="Nömrə şablonunun nümunəvi önizlənməsi",
)
async def preview_pattern(
    data: NumberingPreviewRequest,
    request: Request,
    service: Annotated[NumberingService, Depends(get_numbering_service)],
) -> NumberingPreviewResponse:
    """Verilmiş şablonun necə nömrə generasiya edəcəyini göstərir (bazada heç nə dəyişmir)."""
    _ = getattr(request.state, "user", None)
    return service.preview_pattern(data)


@router.post(
    "/next",
    response_model=NextNumberResponse,
    summary="Növbəti sənəd nömrəsini ayır (Manual test / interfeys)",
)
async def allocate_next_number(
    data: NextNumberRequest,
    request: Request,
    service: Annotated[NumberingService, Depends(get_numbering_service)],
) -> NextNumberResponse:
    """Verilmiş sənəd növü üçün yarış vəziyyətlərinə davamlı şəkildə növbəti nömrəni ayırır."""
    actor = getattr(request.state, "user", None)
    number = await service.next(
        document_type=data.document_type,
        branch_id=data.branch_id,
        register_id=data.register_id,
        actor=actor,
    )
    return NextNumberResponse(
        document_type=data.document_type,
        number=number,
        sequence_id=uuid.UUID("00000000-0000-0000-0000-000000000000"),
    )
