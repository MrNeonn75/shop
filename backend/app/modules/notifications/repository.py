"""Bildirişlər Modulu Repozitori Qatı (Notifications Repository)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import delete, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.modules.notifications.models import (
    Notification,
    NotificationPreference,
    NotificationRule,
)


class NotificationRepository:
    """Verilənlər bazası ilə əlaqəli bildiriş əməliyyatları."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_notifications(
        self,
        user_id: uuid.UUID,
        category: str | None = None,
        severity: str | None = None,
        unread_only: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Notification]:
        """İstifadəçinin bildiriş feed-ini çəkir."""
        now = utc_now()
        stmt = (
            select(Notification)
            .where(
                Notification.recipient_user_id == user_id,
                Notification.archived_at.is_(None),
                (Notification.snoozed_until.is_(None)) | (Notification.snoozed_until <= now),
            )
            .order_by(desc(Notification.created_at))
            .limit(limit)
            .offset(offset)
        )
        if category:
            stmt = stmt.where(Notification.category == category)
        if severity:
            stmt = stmt.where(Notification.severity == severity)
        if unread_only:
            stmt = stmt.where(Notification.read_at.is_(None))

        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def count_unread(self, user_id: uuid.UUID) -> tuple[int, int]:
        """Oxunmamış və kritik bildirişlərin sayını hesablayır."""
        now = utc_now()
        base_filter = [
            Notification.recipient_user_id == user_id,
            Notification.read_at.is_(None),
            Notification.archived_at.is_(None),
            (Notification.snoozed_until.is_(None)) | (Notification.snoozed_until <= now),
        ]

        # Ümumi oxunmamışlar
        stmt_unread = select(func.count(Notification.id)).where(*base_filter)
        res_unread = await self.session.execute(stmt_unread)
        unread_count = res_unread.scalar() or 0

        # Kritik oxunmamışlar
        stmt_critical = select(func.count(Notification.id)).where(*base_filter, Notification.severity == "critical")
        res_critical = await self.session.execute(stmt_critical)
        critical_count = res_critical.scalar() or 0

        return unread_count, critical_count

    async def get_notification(self, notification_id: uuid.UUID) -> Notification | None:
        """ID üzrə bildirişi qaytarır."""
        stmt = select(Notification).where(Notification.id == notification_id)
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def mark_as_read(self, notification_id: uuid.UUID, user_id: uuid.UUID) -> Notification | None:
        """Bildirişi oxunmuş kimi qeyd edir."""
        stmt = select(Notification).where(
            Notification.id == notification_id,
            Notification.recipient_user_id == user_id,
        )
        res = await self.session.execute(stmt)
        record = res.scalars().first()
        if record and not record.read_at:
            record.read_at = utc_now()
            await self.session.commit()
        return record

    async def mark_all_as_read(self, user_id: uuid.UUID) -> int:
        """İstifadəçinin bütün oxunmamış bildirişlərini oxunmuş edir."""
        now = utc_now()
        stmt = (
            update(Notification)
            .where(
                Notification.recipient_user_id == user_id,
                Notification.read_at.is_(None),
            )
            .values(read_at=now)
        )
        res = await self.session.execute(stmt)
        await self.session.commit()
        return int(res.rowcount or 0)

    async def snooze(self, notification_id: uuid.UUID, user_id: uuid.UUID, until: datetime) -> Notification | None:
        """Bildirişi təyin olunmuş vaxta qədər ertələyir."""
        stmt = select(Notification).where(
            Notification.id == notification_id,
            Notification.recipient_user_id == user_id,
        )
        res = await self.session.execute(stmt)
        record = res.scalars().first()
        if record:
            record.snoozed_until = until
            await self.session.commit()
        return record

    async def archive(self, notification_id: uuid.UUID, user_id: uuid.UUID) -> Notification | None:
        """Bildirişi arxivləyir."""
        stmt = select(Notification).where(
            Notification.id == notification_id,
            Notification.recipient_user_id == user_id,
        )
        res = await self.session.execute(stmt)
        record = res.scalars().first()
        if record:
            record.archived_at = utc_now()
            await self.session.commit()
        return record

    async def get_or_create_preference(self, user_id: uuid.UUID) -> NotificationPreference:
        """İstifadəçi tənzimləməsini qaytarır və ya defolt nüsxə yaradır."""
        stmt = select(NotificationPreference).where(NotificationPreference.user_id == user_id)
        res = await self.session.execute(stmt)
        pref = res.scalars().first()
        if not pref:
            pref = NotificationPreference(
                user_id=user_id,
                channels_enabled={
                    "IN_APP": True,
                    "EMAIL": True,
                    "SMS": False,
                    "WHATSAPP": False,
                    "PUSH": True,
                },
                muted_categories=[],
                quiet_hours_start="22:00",
                quiet_hours_end="08:00",
                daily_digest=False,
                language="az",
            )
            self.session.add(pref)
            await self.session.commit()
        return pref

    async def list_rules(self) -> list[NotificationRule]:
        """Bütün bildiriş qaydalarını qaytarır."""
        stmt = select(NotificationRule).order_by(NotificationRule.created_at.asc())
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def get_rule(self, rule_id: uuid.UUID) -> NotificationRule | None:
        """ID üzrə qaydanı çəkir."""
        stmt = select(NotificationRule).where(NotificationRule.id == rule_id)
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def create_rule(self, rule: NotificationRule) -> NotificationRule:
        """Yeni qayda qeyd edir."""
        self.session.add(rule)
        await self.session.commit()
        return rule

    async def delete_rule(self, rule_id: uuid.UUID) -> bool:
        """Qaydanı silir."""
        stmt = delete(NotificationRule).where(NotificationRule.id == rule_id)
        res = await self.session.execute(stmt)
        await self.session.commit()
        return bool(res.rowcount and res.rowcount > 0)

