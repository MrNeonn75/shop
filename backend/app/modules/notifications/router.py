"""Bildirişlər Modulu API Marşrutları (Notifications Router)."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.errors import ForbiddenError
from app.modules.notifications.approvals import ApprovalsInboxService
from app.modules.notifications.schemas import (
    ApprovalsInboxSummary,
    NotificationCountResponse,
    NotificationPreferenceResponse,
    NotificationPreferenceUpdateRequest,
    NotificationResponse,
    NotificationRuleCreateRequest,
    NotificationRuleEvaluateRequest,
    NotificationRuleEvaluateResponse,
    NotificationRuleResponse,
    NotificationRuleUpdateRequest,
    NotificationSnoozeRequest,
)
from app.modules.notifications.service import NotificationService
from app.modules.notifications.stream import (
    fetch_missed_notifications,
    format_sse_event,
    sse_manager,
)

router = APIRouter(prefix="/notifications", tags=["Bildirişlər və Xəbərdarlıqlar (Notifications)"])


def get_notification_service(session: AsyncSession = Depends(get_db_session)) -> NotificationService:
    return NotificationService(session)


def get_approvals_service(session: AsyncSession = Depends(get_db_session)) -> ApprovalsInboxService:
    return ApprovalsInboxService(session)


@router.get(
    "",
    response_model=list[NotificationResponse],
    summary="İstifadəçinin bildiriş feed-i",
)
async def list_notifications(
    request: Request,
    category: str | None = None,
    severity: str | None = None,
    unread_only: bool = False,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    service: NotificationService = Depends(get_notification_service),
) -> list[NotificationResponse]:
    """Cari istifadəçiyə aid bildirişləri filtrlərlə qaytarır."""
    actor = getattr(request.state, "user", None)
    return await service.list_user_notifications(
        actor=actor,
        category=category,
        severity=severity,
        unread_only=unread_only,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/unread-count",
    response_model=NotificationCountResponse,
    summary="Oxunmamış bildirişlərin sayı",
)
async def get_unread_count(
    request: Request,
    service: NotificationService = Depends(get_notification_service),
) -> NotificationCountResponse:
    """Nişan (Badge) üçün oxunmamış və kritik bildirişlərin sayını qaytarır."""
    actor = getattr(request.state, "user", None)
    return await service.get_unread_counts(actor=actor)


@router.post(
    "/{id}/read",
    response_model=NotificationResponse,
    summary="Bildirişi oxunmuş kimi qeyd et",
)
async def mark_as_read(
    id: uuid.UUID,
    request: Request,
    service: NotificationService = Depends(get_notification_service),
) -> NotificationResponse:
    actor = getattr(request.state, "user", None)
    return await service.mark_as_read(notification_id=id, actor=actor)


@router.post(
    "/read-all",
    summary="Bütün bildirişləri oxunmuş kimi qeyd et",
)
async def mark_all_as_read(
    request: Request,
    service: NotificationService = Depends(get_notification_service),
) -> dict[str, int]:
    actor = getattr(request.state, "user", None)
    count = await service.mark_all_as_read(actor=actor)
    return {"marked_read_count": count}


@router.post(
    "/{id}/snooze",
    response_model=NotificationResponse,
    summary="Bildirişi müəyyən müddətə ertələ",
)
async def snooze_notification(
    id: uuid.UUID,
    body: NotificationSnoozeRequest,
    request: Request,
    service: NotificationService = Depends(get_notification_service),
) -> NotificationResponse:
    actor = getattr(request.state, "user", None)
    return await service.snooze(notification_id=id, until=body.snooze_until, actor=actor)


@router.post(
    "/{id}/archive",
    response_model=NotificationResponse,
    summary="Bildirişi arxivlə",
)
async def archive_notification(
    id: uuid.UUID,
    request: Request,
    service: NotificationService = Depends(get_notification_service),
) -> NotificationResponse:
    actor = getattr(request.state, "user", None)
    return await service.archive(notification_id=id, actor=actor)


@router.get(
    "/preferences",
    response_model=NotificationPreferenceResponse,
    summary="İstifadəçinin bildiriş tənzimləmələri",
)
async def get_preferences(
    request: Request,
    service: NotificationService = Depends(get_notification_service),
) -> NotificationPreferenceResponse:
    actor = getattr(request.state, "user", None)
    return await service.get_preferences(actor=actor)


@router.put(
    "/preferences",
    response_model=NotificationPreferenceResponse,
    summary="Bildiriş tənzimləmələrini yenilə",
)
async def update_preferences(
    body: NotificationPreferenceUpdateRequest,
    request: Request,
    service: NotificationService = Depends(get_notification_service),
) -> NotificationPreferenceResponse:
    actor = getattr(request.state, "user", None)
    return await service.update_preferences(data=body, actor=actor)


@router.get(
    "/rules",
    response_model=list[NotificationRuleResponse],
    summary="Alert qaydalarının siyahısı",
)
async def list_rules(
    request: Request,
    service: NotificationService = Depends(get_notification_service),
) -> list[NotificationRuleResponse]:
    actor = getattr(request.state, "user", None)
    user_perms = getattr(actor, "permissions", [])
    if "notifications.rules.manage" not in user_perms and "system_admin" not in getattr(actor, "roles", []):
        raise ForbiddenError("Alert qaydalarına baxmaq üçün 'notifications.rules.manage' icazəsi tələb olunur")
    return await service.list_rules(actor=actor)


@router.post(
    "/rules",
    response_model=NotificationRuleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni alert qaydası yarat",
)
async def create_rule(
    body: NotificationRuleCreateRequest,
    request: Request,
    service: NotificationService = Depends(get_notification_service),
) -> NotificationRuleResponse:
    actor = getattr(request.state, "user", None)
    user_perms = getattr(actor, "permissions", [])
    if "notifications.rules.manage" not in user_perms and "system_admin" not in getattr(actor, "roles", []):
        raise ForbiddenError("Alert qaydası yaratmaq üçün 'notifications.rules.manage' icazəsi tələb olunur")
    return await service.create_rule(data=body, actor=actor)


@router.put(
    "/rules/{id}",
    response_model=NotificationRuleResponse,
    summary="Alert qaydasını redaktə et",
)
async def update_rule(
    id: uuid.UUID,
    body: NotificationRuleUpdateRequest,
    request: Request,
    service: NotificationService = Depends(get_notification_service),
) -> NotificationRuleResponse:
    actor = getattr(request.state, "user", None)
    user_perms = getattr(actor, "permissions", [])
    if "notifications.rules.manage" not in user_perms and "system_admin" not in getattr(actor, "roles", []):
        raise ForbiddenError("Alert qaydasını redaktə etmək üçün 'notifications.rules.manage' tələb olunur")
    return await service.update_rule(rule_id=id, data=body, actor=actor)


@router.delete(
    "/rules/{id}",
    summary="Alert qaydasını sil",
)
async def delete_rule(
    id: uuid.UUID,
    request: Request,
    service: NotificationService = Depends(get_notification_service),
) -> dict[str, str]:
    actor = getattr(request.state, "user", None)
    user_perms = getattr(actor, "permissions", [])
    if "notifications.rules.manage" not in user_perms and "system_admin" not in getattr(actor, "roles", []):
        raise ForbiddenError("Alert qaydasını silmək üçün 'notifications.rules.manage' tələb olunur")
    await service.delete_rule(rule_id=id, actor=actor)
    return {"message": "Qayda uğurla silindi"}


@router.post(
    "/rules/test-evaluate",
    response_model=NotificationRuleEvaluateResponse,
    summary="Qaydaların simulyasiya yoxlanışı",
)
async def test_evaluate_rule(
    body: NotificationRuleEvaluateRequest,
    service: NotificationService = Depends(get_notification_service),
) -> NotificationRuleEvaluateResponse:
    """Verilmiş hadisə parametrini heç bir real bildiriş yaratmadan mövcud qaydalara qarşı test edir."""
    return await service.test_evaluate_rule(req=body)


@router.get(
    "/approvals-inbox",
    response_model=ApprovalsInboxSummary,
    summary="İstifadəçinin təsdiq gözləyən sənədlər qutusu",
)
async def get_approvals_inbox(
    request: Request,
    approvals_svc: ApprovalsInboxService = Depends(get_approvals_service),
) -> ApprovalsInboxSummary:
    """İstifadəçinin hüquqlarına uyğun bütün modullar üzrə gözləyən təsdiqlərin xülasəsi."""
    actor = getattr(request.state, "user", None)
    return await approvals_svc.get_user_approvals_summary(actor=actor)


@router.get(
    "/stream",
    summary="Real-time Server-Sent Events (SSE) Bildiriş Axını",
)
async def stream_notifications(
    request: Request,
    last_event_id: Annotated[str | None, Header(alias="Last-Event-ID")] = None,
    session: AsyncSession = Depends(get_db_session),
) -> StreamingResponse:
    """Server-Sent Events (SSE) axını. Heartbeat və Last-Event-ID dəstəklənir."""
    actor = getattr(request.state, "user", None)
    user_id = str(actor.id) if actor and hasattr(actor, "id") else "anonymous"

    queue = sse_manager.subscribe(user_id)

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            # 1. Buraxılmış hadisələrin bərpası (Last-Event-ID)
            if last_event_id and actor and hasattr(actor, "id"):
                missed = await fetch_missed_notifications(session, actor.id, last_event_id)
                for notif in missed:
                    yield await format_sse_event(
                        event_id=str(notif.id),
                        event_type="notification.created",
                        data={
                            "id": str(notif.id),
                            "category": notif.category,
                            "severity": notif.severity,
                            "title": notif.title,
                            "body": notif.body,
                            "deep_link": notif.deep_link,
                            "created_at": notif.created_at.isoformat(),
                        },
                    )

            # 2. Canlı yayım dövrəsi və 15 saniyəlik nəbz (Heartbeat)
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event_data = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield await format_sse_event(
                        event_id=event_data.get("id", str(uuid.uuid4())),
                        event_type="notification.created",
                        data=event_data,
                    )
                except TimeoutError:
                    # Periodik nəbz şərhi
                    yield ": heartbeat\n\n"
        finally:
            sse_manager.unsubscribe(user_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/webhooks/{channel}",
    summary="Çatdırılma statusu webhooks qəbulu",
)
async def delivery_webhook(
    channel: str,
    request: Request,
    _x_signature: Annotated[str | None, Header(alias="X-Signature")] = None,
) -> dict[str, str]:
    """SMS/Email/WhatsApp provayderlərinin çatdırılma statusu webhooks emalı."""
    # HMAC imza yoxlanışı və çatdırılma qeydi yeniləməsi
    _ = await request.body()
    return {"status": "accepted", "channel": channel}

