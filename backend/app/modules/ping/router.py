"""Ping Modulu HTTP Router."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response, status
from fastapi.responses import JSONResponse

from app.core.idempotency import IdempotencyContext, get_idempotency_context
from app.core.pagination import FilterBarParams, PaginatedResponse
from app.modules.ping.schemas import PingCreate, PingResponse
from app.modules.ping.service import PingService

router = APIRouter(prefix="/api/v1/ping", tags=["Ping (Sistem Yoxlama)"])


def get_ping_service() -> PingService:
    return PingService()


@router.post(
    "",
    response_model=PingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Ping qeydi yaratmaq (Idempotent)",
)
async def create_ping(
    data: PingCreate,
    request: Request,
    idemp: Annotated[IdempotencyContext | None, Depends(get_idempotency_context)],
    service: Annotated[PingService, Depends(get_ping_service)],
) -> Response:
    """Yeni ping hadisəsi qeydə alır.

    Idempotency-Key başlığı təqdim edildikdə, təkrar sorğular keşdən qaytarılır.
    """
    if idemp:
        cached_response = await idemp.check_or_start()
        if cached_response is not None:
            return cached_response

    client_ip = request.client.host if request.client else None

    try:
        result = await service.create_ping(data=data, client_ip=client_ip)
        result_dict = result.model_dump(mode="json")

        if idemp:
            await idemp.complete(
                status_code=status.HTTP_201_CREATED,
                body=result_dict,
            )

        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=result_dict,
        )
    except Exception:
        if idemp:
            await idemp.fail()
        raise


@router.get(
    "/{ping_id}",
    response_model=PingResponse,
    summary="Tək bir Ping qeydini əldə etmək",
)
async def get_ping(
    request: Request,
    ping_id: uuid.UUID,
    service: Annotated[PingService, Depends(get_ping_service)],
) -> PingResponse:
    """ID üzrə ping qeydini oxuyur."""
    _ = getattr(request.state, "user", None)
    return await service.get_ping(ping_id)


@router.get(
    "",
    response_model=PaginatedResponse[PingResponse],
    summary="Ping qeydlərinin səhifələnmiş siyahısı",
)
async def list_pings(
    request: Request,
    service: Annotated[PingService, Depends(get_ping_service)],
    page: int = Query(default=1, ge=1, description="Səhifə nömrəsi"),
    page_size: int = Query(default=25, ge=1, le=100, description="Səhifədəki element sayı"),
    search: str | None = Query(default=None, description="Axtarış mətni"),
    sort_by: str = Query(default="created_at", description="Sıralama sütunu"),
    sort_order: str = Query(
        default="desc", pattern="^(asc|desc)$", description="Sıralama istiqaməti"
    ),
) -> PaginatedResponse[PingResponse]:
    """Frontend FilterBar ilə uyğun səhifələnmiş və filtrlənmiş siyahı."""
    _ = getattr(request.state, "user", None)
    params = FilterBarParams(
        page=page,
        page_size=page_size,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return await service.list_pings(params)
