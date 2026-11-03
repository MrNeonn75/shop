"""Sessiyalar Modulu API Marşrutları (Sessions Router)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status

from app.core.errors import UnauthenticatedError
from app.modules.sessions.schemas import SessionResponse
from app.modules.sessions.service import SessionService, get_session_service

router = APIRouter(tags=["Sessions"])


@router.get(
    "/me/sessions",
    response_model=list[SessionResponse],
    summary="Cari istifadəçinin aktiv sessiyaları",
)
async def get_my_sessions(
    request: Request,
    service: Annotated[SessionService, Depends(get_session_service)],
) -> list[SessionResponse]:
    """İstifadəçinin bütün aktiv cihaz və sessiyalarını qaytarır."""
    user = getattr(request.state, "user", None)
    if not user:
        raise UnauthenticatedError("Giriş tələb olunur.")

    current_sess_id = getattr(request.state, "session_id", None)
    return await service.list_user_sessions(user.id, current_session_id=current_sess_id)


@router.delete(
    "/me/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cari istifadəçinin müəyyən sessiyasını ləğv et",
)
async def revoke_my_session(
    session_id: uuid.UUID,
    request: Request,
    service: Annotated[SessionService, Depends(get_session_service)],
) -> Response:
    """İstifadəçi öz köhnə və ya digər cihazdakı sessiyasını bağlayır."""
    user = getattr(request.state, "user", None)
    if not user:
        raise UnauthenticatedError("Giriş tələb olunur.")

    await service.revoke_session(session_id, user_id=user.id, actor=user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/users/{user_id}/sessions",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="İstifadəçinin bütün sessiyalarını ləğv et (Admin)",
)
async def revoke_all_user_sessions_admin(
    user_id: uuid.UUID,
    request: Request,
    service: Annotated[SessionService, Depends(get_session_service)],
) -> Response:
    """İnzibatçı tərəfindən istifadəçinin bütün aktiv sessiyalarının bağlanması."""
    actor = getattr(request.state, "user", None)
    await service.revoke_all_user_sessions(user_id, actor=actor, reason="Admin forced logout")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
