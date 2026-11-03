"""Audit və Təhlükəsizlik Hadisələri Skeleti (Immutable Audit with Hash Chain).

Bütün kritik sistem hərəkətləri bu dəyişməz cədvələ yazılır.
Blokçeyn bənzəri Hash Chain ilə təftiş və bütövlük təmin olunur.
Heç bir redaktə və ya silmə əməliyyatına icazə verilmir.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Index, String, Text, Uuid, event, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base, BaseMixin, ensure_utc, utc_now
from app.core.errors import AuditImmutableError, get_current_correlation_id
from app.core.ids import generate_uuid7

JSONBType = JSONB().with_variant(JSON(), "sqlite")  # type: ignore[no-untyped-call]

GENESIS_HASH = "0" * 64


def compute_audit_hash(
    prev_hash: str,
    event_id: uuid.UUID,
    occurred_at: datetime,
    actor_id: uuid.UUID | None,
    action: str,
    entity_type: str,
    entity_id: str,
    diff: dict[str, Any] | None,
    severity: str,
) -> str:
    """Audit hadisəsinin kriptoqrafik SHA-256 heşini hesablayır."""
    diff_str = json.dumps(diff or {}, sort_keys=True)
    dt_utc = ensure_utc(occurred_at)
    time_str = f"{dt_utc.strftime('%Y-%m-%dT%H:%M:%S')}.{dt_utc.microsecond:06d}Z"
    payload = f"{prev_hash}|{event_id}|{time_str}|{actor_id}|{action}|{entity_type}|{entity_id}|{diff_str}|{severity}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class AuditEvent(Base, BaseMixin):
    """Sistemdəki bütün hərəkətlərin dəyişməz audit jurnalı."""

    __tablename__ = "audit_events"

    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True, index=True
    )
    actor_session_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True, index=True
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True, index=True
    )

    module: Mapped[str] = mapped_column(String(50), nullable=False, default="core", index=True)
    resource_type: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True, doc="Obyekt tipi (users, roles, products və s.)"
    )
    resource_id: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True, doc="Obyektin unikal identifikatoru"
    )
    action: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True, doc="Əməliyyat (məs: USER_CREATED, LOGIN_SUCCESS)"
    )

    diff: Mapped[dict[str, Any] | None] = mapped_column(
        JSONBType,
        nullable=True,
        doc="Dəyişiklikdən əvvəlki və sonrakı vəziyyət (before/after/details)",
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    actor_ip: Mapped[str | None] = mapped_column(String(50), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    correlation_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    severity: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="info",
        index=True,
        doc="info, warning, critical, security",
    )

    # Kriptoqrafik zəncir (Hash chain)
    prev_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    __table_args__ = (
        Index("ix_audit_events_resource", "resource_type", "resource_id", "created_at"),
        Index("ix_audit_events_module_action", "module", "action", "created_at"),
        Index("ix_audit_events_severity_created", "severity", "created_at"),
    )


# Dəyişməzlik Mühafizəsi (ORM səviyyəsində UPDATE və DELETE qadağası)
@event.listens_for(AuditEvent, "before_update", propagate=True)
def _prevent_audit_update(_mapper: Any, _connection: Any, _target: Any) -> None:
    raise AuditImmutableError()


@event.listens_for(AuditEvent, "before_delete", propagate=True)
def _prevent_audit_delete(_mapper: Any, _connection: Any, _target: Any) -> None:
    raise AuditImmutableError()


async def record_audit_event(
    session: AsyncSession,
    action: str,
    resource_type: str,
    resource_id: str,
    actor_id: uuid.UUID | None = None,
    actor_session_id: uuid.UUID | None = None,
    branch_id: uuid.UUID | None = None,
    module: str = "core",
    actor_ip: str | None = None,
    user_agent: str | None = None,
    diff: dict[str, Any] | None = None,
    reason: str | None = None,
    severity: str = "info",
) -> AuditEvent:
    """Audit hadisəsini kriptoqrafik heş zəncirinə əlavə edərək tranzaksiyaya qeyd edir."""
    # Ən son əlavə olunmuş hadisənin heşini tapırıq
    stmt = (
        select(AuditEvent.hash)
        .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
        .limit(1)
    )
    res = await session.execute(stmt)
    prev_hash = res.scalar_one_or_none() or GENESIS_HASH

    event_id = generate_uuid7()
    occurred_at = utc_now()

    event_hash = compute_audit_hash(
        prev_hash=prev_hash,
        event_id=event_id,
        occurred_at=occurred_at,
        actor_id=actor_id,
        action=action,
        entity_type=resource_type,
        entity_id=resource_id,
        diff=diff,
        severity=severity,
    )

    event_obj = AuditEvent(
        id=event_id,
        actor_id=actor_id,
        actor_session_id=actor_session_id,
        branch_id=branch_id,
        module=module,
        resource_type=resource_type,
        resource_id=resource_id,
        action=action,
        diff=diff,
        reason=reason,
        actor_ip=actor_ip,
        user_agent=user_agent,
        correlation_id=get_current_correlation_id(),
        severity=severity,
        prev_hash=prev_hash,
        hash=event_hash,
        created_at=occurred_at,
    )
    session.add(event_obj)
    return event_obj
