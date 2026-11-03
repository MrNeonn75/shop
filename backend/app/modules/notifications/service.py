"""Bildirişlər Modulu Xidmət Qatı (Notification Service)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.errors import ForbiddenError, NotFoundError
from app.core.ids import generate_uuid7
from app.modules.notifications.channels import (
    EmailNotificationChannel,
    InAppNotificationChannel,
    PushNotificationChannel,
    SmsNotificationChannel,
    WhatsAppNotificationChannel,
    is_in_quiet_hours,
)
from app.modules.notifications.models import (
    Notification,
    NotificationDeliveryLog,
    NotificationRule,
)
from app.modules.notifications.repository import NotificationRepository
from app.modules.notifications.rules import (
    evaluate_condition,
    is_duplicate_notification,
    resolve_rule_recipients,
)
from app.modules.notifications.schemas import (
    NotificationCountResponse,
    NotificationPreferenceResponse,
    NotificationPreferenceUpdateRequest,
    NotificationResponse,
    NotificationRuleCreateRequest,
    NotificationRuleEvaluateRequest,
    NotificationRuleEvaluateResponse,
    NotificationRuleResponse,
    NotificationRuleUpdateRequest,
)
from app.modules.notifications.stream import sse_manager


class NotificationService:
    """Bildirişlərin idarəetmə və çatdırılma xidməti."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = NotificationRepository(session)
        self.channels = {
            "IN_APP": InAppNotificationChannel(),
            "EMAIL": EmailNotificationChannel(),
            "SMS": SmsNotificationChannel(),
            "WHATSAPP": WhatsAppNotificationChannel(),
            "PUSH": PushNotificationChannel(),
        }

    def _extract_user_id(self, actor: Any) -> uuid.UUID:
        raw_id = getattr(actor, "id", None)
        if not raw_id:
            raise ForbiddenError("Autentifikasiya tələb olunur")
        return raw_id if isinstance(raw_id, uuid.UUID) else uuid.UUID(str(raw_id))

    async def list_user_notifications(
        self,
        actor: Any,
        category: str | None = None,
        severity: str | None = None,
        unread_only: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> list[NotificationResponse]:
        """Cari istifadəçinin bildirişlərini çəkir."""
        user_id = self._extract_user_id(actor)

        records = await self.repo.list_notifications(
            user_id=user_id,
            category=category,
            severity=severity,
            unread_only=unread_only,
            limit=limit,
            offset=offset,
        )
        return [NotificationResponse.model_validate(r) for r in records]

    async def get_unread_counts(self, actor: Any) -> NotificationCountResponse:
        """Oxunmamış və kritik bildirişlərin sayını qaytarır."""
        raw_id = getattr(actor, "id", None)
        if not raw_id:
            return NotificationCountResponse(unread_count=0, critical_count=0)
        user_id = raw_id if isinstance(raw_id, uuid.UUID) else uuid.UUID(str(raw_id))

        unread_count, critical_count = await self.repo.count_unread(user_id=user_id)
        return NotificationCountResponse(unread_count=unread_count, critical_count=critical_count)

    async def mark_as_read(self, notification_id: uuid.UUID, actor: Any) -> NotificationResponse:
        """Tək bildirişi oxunmuş kimi qeyd edir."""
        user_id = self._extract_user_id(actor)
        record = await self.repo.mark_as_read(notification_id=notification_id, user_id=user_id)
        if not record:
            raise NotFoundError("Bildiriş tapılmadı və ya sizə aid deyil")
        return NotificationResponse.model_validate(record)

    async def mark_all_as_read(self, actor: Any) -> int:
        """Bütün bildirişləri oxunmuş edir."""
        user_id = self._extract_user_id(actor)
        return await self.repo.mark_all_as_read(user_id=user_id)

    async def snooze(self, notification_id: uuid.UUID, until: datetime, actor: Any) -> NotificationResponse:
        """Bildirişi ertələyir."""
        user_id = self._extract_user_id(actor)
        record = await self.repo.snooze(notification_id=notification_id, user_id=user_id, until=until)
        if not record:
            raise NotFoundError("Bildiriş tapılmadı")
        return NotificationResponse.model_validate(record)

    async def archive(self, notification_id: uuid.UUID, actor: Any) -> NotificationResponse:
        """Bildirişi arxivləyir."""
        user_id = self._extract_user_id(actor)
        record = await self.repo.archive(notification_id=notification_id, user_id=user_id)
        if not record:
            raise NotFoundError("Bildiriş tapılmadı")
        return NotificationResponse.model_validate(record)

    async def get_preferences(self, actor: Any) -> NotificationPreferenceResponse:
        """İstifadəçinin fərdi tənzimləmələrini qaytarır."""
        user_id = self._extract_user_id(actor)
        pref = await self.repo.get_or_create_preference(user_id=user_id)
        return NotificationPreferenceResponse.model_validate(pref)

    async def update_preferences(
        self,
        data: NotificationPreferenceUpdateRequest,
        actor: Any,
    ) -> NotificationPreferenceResponse:
        """İstifadəçi bildiriş tənzimləmələrini yeniləyir."""
        user_id = self._extract_user_id(actor)
        pref = await self.repo.get_or_create_preference(user_id=user_id)

        if data.channels_enabled is not None:
            pref.channels_enabled = data.channels_enabled
        if data.muted_categories is not None:
            pref.muted_categories = data.muted_categories
        if data.quiet_hours_start is not None:
            pref.quiet_hours_start = data.quiet_hours_start
        if data.quiet_hours_end is not None:
            pref.quiet_hours_end = data.quiet_hours_end
        if data.daily_digest is not None:
            pref.daily_digest = data.daily_digest
        if data.language is not None:
            pref.language = data.language

        await self.session.commit()
        return NotificationPreferenceResponse.model_validate(pref)

    async def list_rules(self, actor: Any = None) -> list[NotificationRuleResponse]:
        """Bütün bildiriş qaydalarını qaytarır."""
        _ = actor
        rules = await self.repo.list_rules()
        return [NotificationRuleResponse.model_validate(r) for r in rules]

    async def create_rule(
        self,
        data: NotificationRuleCreateRequest,
        actor: Any = None,
    ) -> NotificationRuleResponse:
        """Yeni bildiriş qaydası yaradır."""
        _ = actor
        rule = NotificationRule(
            id=generate_uuid7(),
            name=data.name,
            category=data.category,
            event_type=data.event_type,
            condition=data.condition,
            channels=data.channels,
            severity=data.severity,
            recipient_type=data.recipient_type,
            recipient_target=data.recipient_target,
            branch_scope=data.branch_scope,
            target_branch_id=data.target_branch_id,
            escalate_after_minutes=data.escalate_after_minutes,
            escalation_role=data.escalation_role,
            is_active=data.is_active,
        )
        created = await self.repo.create_rule(rule)
        return NotificationRuleResponse.model_validate(created)

    async def update_rule(
        self,
        rule_id: uuid.UUID,
        data: NotificationRuleUpdateRequest,
        actor: Any = None,
    ) -> NotificationRuleResponse:
        """Bildiriş qaydasını redaktə edir."""
        _ = actor
        rule = await self.repo.get_rule(rule_id)
        if not rule:
            raise NotFoundError("Qayda tapılmadı")

        if data.name is not None:
            rule.name = data.name
        if data.condition is not None:
            rule.condition = data.condition
        if data.channels is not None:
            rule.channels = data.channels
        if data.severity is not None:
            rule.severity = data.severity
        if data.recipient_type is not None:
            rule.recipient_type = data.recipient_type
        if data.recipient_target is not None:
            rule.recipient_target = data.recipient_target
        if data.branch_scope is not None:
            rule.branch_scope = data.branch_scope
        if data.target_branch_id is not None:
            rule.target_branch_id = data.target_branch_id
        if data.escalate_after_minutes is not None:
            rule.escalate_after_minutes = data.escalate_after_minutes
        if data.escalation_role is not None:
            rule.escalation_role = data.escalation_role
        if data.is_active is not None:
            rule.is_active = data.is_active

        await self.session.commit()
        return NotificationRuleResponse.model_validate(rule)

    async def delete_rule(self, rule_id: uuid.UUID, actor: Any = None) -> bool:
        """Qaydanı silir."""
        _ = actor
        success = await self.repo.delete_rule(rule_id)
        if not success:
            raise NotFoundError("Qayda tapılmadı")
        return True

    async def test_evaluate_rule(
        self,
        req: NotificationRuleEvaluateRequest,
    ) -> NotificationRuleEvaluateResponse:
        """Qaydaların hadisəyə qarşı simulyasiya testi."""
        rules = await self.repo.list_rules()
        matched: list[str] = []
        all_channels: set[str] = set()
        total_recipients = 0

        for r in rules:
            if not r.is_active or r.event_type != req.event_type:
                continue
            if evaluate_condition(req.payload, r.condition):
                matched.append(r.name)
                for ch in r.channels:
                    all_channels.add(ch)
                recipients = await resolve_rule_recipients(self.session, r, req.branch_id)
                total_recipients += len(recipients)

        sample = None
        if matched:
            sample = {
                "title": f"Test Bildiriş ({req.event_type})",
                "body": f"Hadisə parametrləri uğurla uyğunlaşdı: {req.payload}",
                "severity": "info",
            }

        return NotificationRuleEvaluateResponse(
            matched_rules=matched,
            resolved_recipients_count=total_recipients,
            target_channels=list(all_channels),
            sample_notification=sample,
        )

    async def dispatch_event_notifications(
        self,
        event_type: str,
        payload: dict[str, Any],
        branch_id: uuid.UUID | None = None,
        source_event_id: uuid.UUID | None = None,
    ) -> int:
        """Domen hadisəsini qaydalara əsasən bildirişlərə çevirir və göndərir."""
        rules = await self.repo.list_rules()
        dispatched_count = 0

        for rule in rules:
            if not rule.is_active or rule.event_type != event_type:
                continue

            if not evaluate_condition(payload, rule.condition):
                continue

            recipients = await resolve_rule_recipients(self.session, rule, branch_id)
            for recip in recipients:
                user_id = recip["user_id"]
                dedupe_key = f"{rule.category}:{event_type}:{payload.get('id', payload.get('sale_id', ''))}"

                # Dublikat yoxlanışı
                if await is_duplicate_notification(self.session, user_id, dedupe_key, window_minutes=15):
                    continue

                pref = await self.repo.get_or_create_preference(user_id)
                if rule.category in pref.muted_categories:
                    continue

                title = f"[{rule.category}] {rule.name}"
                body = f"Hadisə: {event_type}. Ətraflı: {payload}"

                notification = Notification(
                    id=generate_uuid7(),
                    recipient_user_id=user_id,
                    category=rule.category,
                    severity=rule.severity,
                    title=title,
                    body=body,
                    deep_link=payload.get("deep_link"),
                    source_event_id=source_event_id,
                    dedupe_key=dedupe_key,
                    group_key=f"{rule.category}_group",
                    branch_id=branch_id,
                    created_at=utc_now(),
                )
                self.session.add(notification)
                await self.session.commit()
                dispatched_count += 1

                # Real-time SSE axınına təkan
                await sse_manager.broadcast_to_user(
                    user_id=str(user_id),
                    event_data={
                        "id": str(notification.id),
                        "category": notification.category,
                        "severity": notification.severity,
                        "title": notification.title,
                        "body": notification.body,
                        "deep_link": notification.deep_link,
                        "created_at": notification.created_at.isoformat(),
                    },
                    branch_id=str(branch_id) if branch_id else None,
                )

                # Fərdi kanallar üzrə göndəriş
                now_str = utc_now().strftime("%H:%M")
                in_quiet = is_in_quiet_hours(now_str, pref.quiet_hours_start, pref.quiet_hours_end)

                for ch_name in rule.channels:
                    channel_handler = self.channels.get(ch_name)
                    if not channel_handler:
                        continue

                    # Sakit saatlar və qeyri-kritik bildirişlər
                    if in_quiet and rule.severity != "critical" and ch_name != "IN_APP":
                        log = NotificationDeliveryLog(
                            notification_id=notification.id,
                            channel=ch_name,
                            status="SKIPPED_QUIET_HOURS",
                            recipient_masked=recip.get("email") or recip.get("phone") or "USER",
                            error_message="İstifadəçinin sakit saat rejimi aktivdir",
                            created_at=utc_now(),
                        )
                        self.session.add(log)
                        continue

                    log = await channel_handler.deliver(notification, recip)
                    self.session.add(log)

                await self.session.commit()

        return dispatched_count

