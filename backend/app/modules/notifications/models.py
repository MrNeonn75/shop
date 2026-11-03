"""Bildirişlər və Xəbərdarlıqlar Sistemi ORM Modelləri (Notifications Models).

1. notifications - Daxili istifadəçi bildirişləri feed-i
2. notification_rules - Dinamik alert qaydaları və eskalasiya siyasətləri
3. notification_preferences - Fərdi istifadəçi bildiriş kanalı və səssiz saat sazlamaları
4. notification_delivery_logs - Kanal üzrə çatdırılma və audit jurnalı
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base, BaseMixin

JSONBType = JSONB().with_variant(JSON(), "sqlite")  # type: ignore[no-untyped-call]


class Notification(Base, BaseMixin):
    """Sistem istifadəçisinə ünvanlanmış bildiriş."""

    __tablename__ = "notifications"

    recipient_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
        index=True,
        doc="Bildirişin ünvanlandığı istifadəçi ID-si",
    )
    category: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        doc="STOCK | PAYMENT | ORDER | TRANSFER | REGISTER | APPROVAL | SECURITY | SYSTEM",
    )
    severity: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="info",
        index=True,
        doc="info | warning | critical",
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    deep_link: Mapped[str | None] = mapped_column(String(255), nullable=True)

    source_event_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        index=True,
        doc="Bildirişə səbəb olmuş outbox hadisəsi",
    )
    dedupe_key: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        index=True,
        doc="Təkrarlanan bildirişlərin qarşısını almaq üçün unikal açar",
    )
    group_key: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        index=True,
        doc="Qruplaşdırılmış UI görünüşü üçün açar",
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        index=True,
        doc="Əlaqəli filial ID-si",
    )

    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    snoozed_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    delivery_logs: Mapped[list[NotificationDeliveryLog]] = relationship(
        "NotificationDeliveryLog",
        back_populates="notification",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        Index("ix_notifications_user_unread", "recipient_user_id", "read_at", "archived_at"),
        Index("ix_notifications_user_created", "recipient_user_id", "created_at"),
    )


class NotificationRule(Base, BaseMixin):
    """Avtomatik xəbərdarlıq qaydası (Alert Rule)."""

    __tablename__ = "notification_rules"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    condition: Mapped[dict[str, Any]] = mapped_column(
        JSONBType,
        nullable=False,
        default=dict,
        doc="Şərt lüğəti: {'field': 'amount', 'op': '>=', 'value': 1000}",
    )
    channels: Mapped[list[str]] = mapped_column(
        JSONBType,
        nullable=False,
        default=lambda: ["IN_APP"],
        doc="Aktiv kanallar siyahısı: ['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH']",
    )
    severity: Mapped[str] = mapped_column(
        String(20),
        default="info",
        nullable=False,
        doc="info | warning | critical",
    )

    recipient_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="ROLE",
        doc="ROLE | BRANCH_MANAGER | DELEGATE | SPECIFIC_USER",
    )
    recipient_target: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        doc="Rol kodu və ya konkret user_id",
    )
    branch_scope: Mapped[str] = mapped_column(
        String(50),
        default="SAME_BRANCH",
        nullable=False,
        doc="SAME_BRANCH | ALL_BRANCHES | SPECIFIC",
    )
    target_branch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
    )

    escalate_after_minutes: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        doc="Oxunmadıqda neçə dəqiqə sonra eskalasiya edilsin",
    )
    escalation_role: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        doc="Eskalasiya olunacaq rəhbər rolu (məs: executive, branch_manager)",
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class NotificationPreference(Base, BaseMixin):
    """Fərdi istifadəçi bildiriş kanalı və rejim sazlamaları."""

    __tablename__ = "notification_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
        unique=True,
        index=True,
    )
    channels_enabled: Mapped[dict[str, bool]] = mapped_column(
        JSONBType,
        nullable=False,
        default=lambda: {
            "IN_APP": True,
            "EMAIL": True,
            "SMS": False,
            "WHATSAPP": False,
            "PUSH": True,
        },
    )
    muted_categories: Mapped[list[str]] = mapped_column(
        JSONBType,
        nullable=False,
        default=list,
    )
    quiet_hours_start: Mapped[str | None] = mapped_column(
        String(10),
        nullable=True,
        doc="'22:00' formatında sakit saat başlanğıcı",
    )
    quiet_hours_end: Mapped[str | None] = mapped_column(
        String(10),
        nullable=True,
        doc="'08:00' formatında sakit saat sonu",
    )
    daily_digest: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    language: Mapped[str] = mapped_column(String(10), default="az", nullable=False)


class NotificationDeliveryLog(Base, BaseMixin):
    """Müəyyən bildirişin kanallar üzrə göndəriş nəticəsi."""

    __tablename__ = "notification_delivery_logs"

    notification_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("notifications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        doc="IN_APP | EMAIL | SMS | WHATSAPP | PUSH",
    )
    status: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        doc="DELIVERED | FAILED | SKIPPED_NOT_CONFIGURED | SKIPPED_QUIET_HOURS | SKIPPED_PREFERENCE | SKIPPED_UNAUTHORIZED",
    )
    recipient_masked: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        doc="PII maskalanmış ünvan (məs: e***n@brandhouse.az, +99450***12)",
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    notification: Mapped[Notification] = relationship(
        "Notification",
        back_populates="delivery_logs",
    )

