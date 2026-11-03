"""İstifadəçilər Modulu API Marşrutları (Users Router).

İstifadəçi hesablarının idarə olunması endpoint-ləri.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.idempotency import IdempotencyContext, get_idempotency_context
from app.core.pagination import FilterBarParams, PaginatedResponse
from app.modules.users.schemas import (
    UserBranchAssignment,
    UserCreate,
    UserResponse,
    UserSetPin,
    UserStatusUpdate,
    UserUpdate,
)
from app.modules.users.service import UserService, get_user_service

router = APIRouter(prefix="/users", tags=["Users"])


class UserCreateResult(BaseModel):
    user: UserResponse
    initial_password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post(
    "",
    response_model=UserCreateResult,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni istifadəçi yarat",
)
async def create_user(
    data: UserCreate,
    request: Request,
    idemp: Annotated[IdempotencyContext | None, Depends(get_idempotency_context)],
    service: Annotated[UserService, Depends(get_user_service)],
) -> Response:
    """Yeni istifadəçi hesabı yaradır.

    Yaradılmış ilkin şifrə yalnız bu cavabda bir dəfə göstərilir.
    """
    if idemp:
        cached = await idemp.check_or_start()
        if cached is not None:
            return cached

    actor = getattr(request.state, "user", None)
    user_resp, raw_pwd = await service.create_user(data, actor=actor)
    result = UserCreateResult(user=user_resp, initial_password=raw_pwd)
    result_dict = result.model_dump(mode="json")

    if idemp:
        await idemp.complete(
            status_code=status.HTTP_201_CREATED,
            body=result_dict,
        )
    return JSONResponse(status_code=status.HTTP_201_CREATED, content=result_dict)


@router.get(
    "",
    response_model=PaginatedResponse[UserResponse],
    summary="İstifadəçiləri səhifələmə ilə gətir",
)
async def list_users(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: str | None = Query(None),
    status: str | None = Query(None),
    sort: str | None = Query(None),
    service: Annotated[UserService, Depends(get_user_service)] = None,  # type: ignore[assignment]
) -> PaginatedResponse[UserResponse]:
    """FilterBar parametrlərinə uyğun istifadəçi siyahısını təqdim edir."""
    params = FilterBarParams(page=page, page_size=page_size, q=q, status=status, sort=sort)
    actor = getattr(request.state, "user", None)
    branch_scope_ids = getattr(request.state, "branch_scope_ids", None)

    items, total = await service.list_users(
        params=params, actor=actor, branch_scope_ids=branch_scope_ids
    )
    return PaginatedResponse.create(
        items=items,
        total=total,
        page=params.page,
        page_size=params.page_size,
    )


@router.get(
    "/{user_id}",
    response_model=UserResponse,
    summary="İstifadəçi profilini ID ilə gətir",
)
async def get_user(
    user_id: uuid.UUID,
    request: Request,
    service: Annotated[UserService, Depends(get_user_service)],
) -> UserResponse:
    """Tək istifadəçi profilini qaytarır."""
    actor = getattr(request.state, "user", None)
    return await service.get_user_by_id(user_id, actor=actor)


@router.put(
    "/{user_id}",
    response_model=UserResponse,
    summary="İstifadəçi profilini yenilə",
)
async def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    request: Request,
    service: Annotated[UserService, Depends(get_user_service)],
) -> UserResponse:
    """İstifadəçi məlumatlarını yeniləyir."""
    actor = getattr(request.state, "user", None)
    return await service.update_user(user_id, data=data, actor=actor)


@router.patch(
    "/{user_id}/status",
    response_model=UserResponse,
    summary="İstifadəçi statusunu dəyiş (Aktiv / Dayandırılmış)",
)
async def update_user_status(
    user_id: uuid.UUID,
    data: UserStatusUpdate,
    request: Request,
    service: Annotated[UserService, Depends(get_user_service)],
) -> UserResponse:
    """Hesab statusunu dəyişir. Dayandırıldıqda bütün sessiyalar dərhal ləğv edilir."""
    actor = getattr(request.state, "user", None)
    return await service.update_status(user_id, data=data, actor=actor)


@router.post(
    "/{user_id}/force-password-reset",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Növbəti girişdə məcburi şifrə dəyişilməsini tələb et",
)
async def force_password_reset(
    user_id: uuid.UUID,
    request: Request,
    service: Annotated[UserService, Depends(get_user_service)],
) -> Response:
    """İstifadəçinin must_change_password bayrağını True edir."""
    actor = getattr(request.state, "user", None)
    await service.force_password_reset(user_id, actor=actor)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/{user_id}/branches",
    response_model=list[uuid.UUID],
    summary="İstifadəçiyə filial icazələrini təyin et",
)
async def assign_branches(
    user_id: uuid.UUID,
    data: UserBranchAssignment,
    request: Request,
    service: Annotated[UserService, Depends(get_user_service)],
) -> list[uuid.UUID]:
    """İstifadəçinin daxil ola biləcəyi filialların siyahısını təyin edir."""
    actor = getattr(request.state, "user", None)
    return await service.assign_branches(user_id, data=data, actor=actor)


@router.put(
    "/{user_id}/manager-pin",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Menecer PIN kodunu quraşdır",
)
async def set_manager_pin(
    user_id: uuid.UUID,
    data: UserSetPin,
    request: Request,
    service: Annotated[UserService, Depends(get_user_service)],
) -> Response:
    """POS kassada əməliyyatların təsdiqi üçün menecer PIN kodunu saxlayır."""
    actor = getattr(request.state, "user", None)
    await service.set_manager_pin(user_id, pin=data.pin, actor=actor)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/{user_id}/pos-pin",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Kassir üçün POS PIN kodunu quraşdır",
)
async def set_pos_pin(
    user_id: uuid.UUID,
    data: UserSetPin,
    request: Request,
    service: Annotated[UserService, Depends(get_user_service)],
) -> Response:
    """POS kassaya sürətli giriş üçün PIN kodu saxlayır."""
    actor = getattr(request.state, "user", None)
    await service.set_pos_pin(user_id, pin=data.pin, actor=actor)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{user_id}/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="İstifadəçi şifrəsini dəyiş",
)
async def change_password(
    user_id: uuid.UUID,
    data: ChangePasswordRequest,
    service: Annotated[UserService, Depends(get_user_service)],
) -> Response:
    """İstifadəçinin öz şifrəsini yeniləməsi."""
    await service.change_password(
        user_id=user_id,
        current_password=data.current_password,
        new_password=data.new_password,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
