"""Dayanıqlı Hadisə Modeli (Transactional Outbox Pattern).

Uğursuzluqlara qarşı mütləq icra olunmalı hadisələr biznes tranzaksiyası daxilində
eyni anda bu cədvələ yazılır və arxa plan işçisi tərəfindən zəmanətli icra olunur.
Dəstəklənən mexanizmlər:
- SELECT ... FOR UPDATE SKIP LOCKED və ya icarə kilidi (Lease lock)
- Eksponensial gözləmə və təsadüfi gecikmə (Exponential Backoff with Jitter)
- İstehlakçı üzrə çatdırılma və idempotensiya təqibi (EventDelivery, ProcessedEvent)
- Uğursuz hadisələr arxivi (Dead Letter Queue) və təkrar icra (Replay)
"""

from __future__ import annotations

import random
import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import (
    DateTime,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    delete,
    desc,
    func,
    select,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column, synonym
from sqlalchemy.types import JSON

from app.core.database import Base, BaseMixin, ensure_utc, utc_now
from app.core.ids import generate_uuid7
from app.core.logging import logger
from app.shared.events import DomainEvent

JSONBType = JSONB().with_variant(JSON(), "sqlite")  # type: ignore[no-untyped-call]


class OutboxEvent(Base, BaseMixin):
    """Verilənlər bazasında saxlanılan Outbox hadisəsi."""

    __tablename__ = "outbox_events"

    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    aggregate_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    aggregate_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    payload: Mapped[dict[str, Any]] = mapped_column(JSONBType, nullable=False)
    correlation_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    causation_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    status: Mapped[str] = mapped_column(
        String(30),
        default="PENDING",
        nullable=False,
        index=True,
        doc="PENDING | PROCESSING | DONE | PROCESSED | FAILED | DEAD",
    )

    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Keçmiş kodla geriyə uyğunluq üçün retry_count sinonimi
    retry_count: Mapped[int] = synonym("attempts")

    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    locked_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_outbox_events_status_created_at", "status", "created_at"),
        Index("ix_outbox_events_status_next_attempt", "status", "next_attempt_at"),
        Index("ix_outbox_events_aggregate", "aggregate_type", "aggregate_id"),
    )


class EventDelivery(Base, BaseMixin):
    """Fərdi istehlakçılar üzrə hadisə çatdırılma statusunun izlənməsi."""

    __tablename__ = "event_deliveries"

    event_id: Mapped[uuid.UUID] = mapped_column(
        String(36).with_variant(String(36), "sqlite"),
        nullable=False,
        index=True,
        doc="Outbox hadisəsinin unikal identifikatoru",
    )
    consumer: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
        doc="İstehlakçı xidmətin və ya portun unikal adı",
    )
    status: Mapped[str] = mapped_column(
        String(30),
        default="PENDING",
        nullable=False,
        index=True,
        doc="PENDING | PROCESSING | DONE | FAILED | DEAD",
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_event_deliveries_event_consumer", "event_id", "consumer", unique=True),
        Index("ix_event_deliveries_status_consumer", "status", "consumer"),
    )


class ProcessedEvent(Base):
    """İstehlakçıların idempotensiyasını təmin edən qeydiyyat cədvəli."""

    __tablename__ = "processed_events"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=generate_uuid7,
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
        index=True,
    )
    consumer_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PROCESSED")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("event_id", "consumer_name", name="uq_processed_events_event_consumer"),
        {"extend_existing": True},
    )


async def record_outbox_event(
    session: AsyncSession,
    event: DomainEvent,
    version: int = 1,
    causation_id: str | None = None,
) -> OutboxEvent:
    """Biznes tranzaksiyası daxilində hadisəni outbox cədvəlinə yazır."""
    outbox_entry = OutboxEvent(
        id=event.event_id,
        event_type=event.event_type,
        version=version,
        aggregate_type=event.aggregate_type,
        aggregate_id=event.aggregate_id,
        payload=event.payload,
        correlation_id=event.correlation_id,
        causation_id=causation_id,
        status="PENDING",
        attempts=0,
        next_attempt_at=None,
        locked_by=None,
        locked_until=None,
        created_at=event.occurred_at,
    )
    session.add(outbox_entry)
    return outbox_entry


async def fetch_and_claim_outbox_batch(
    session: AsyncSession,
    worker_id: str = "default_worker",
    limit: int = 50,
    lease_seconds: int = 60,
) -> list[OutboxEvent]:
    """İşçi üçün gözləyən və ya icarə vaxtı keçmiş hadisələri təhlükəsiz şəkildə bloklayaraq çəkir.

    PostgreSQL üçün SKIP LOCKED, SQLite üçün isə timestamp lease locking tətbiq olunur.
    """
    now = utc_now()
    lease_expiry = now + timedelta(seconds=lease_seconds)

    bind = session.get_bind()
    is_postgres = bind is not None and bind.dialect.name == "postgresql"

    if is_postgres:
        stmt = (
            select(OutboxEvent)
            .where(
                OutboxEvent.status.in_(["PENDING", "FAILED"]),
                (OutboxEvent.next_attempt_at.is_(None)) | (OutboxEvent.next_attempt_at <= now),
                (OutboxEvent.locked_until.is_(None)) | (OutboxEvent.locked_until <= now),
            )
            .order_by(OutboxEvent.created_at.asc())
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
        res = await session.execute(stmt)
        events = list(res.scalars().all())
        for ev in events:
            ev.status = "PROCESSING"
            ev.locked_by = worker_id
            ev.locked_until = lease_expiry
        if events:
            await session.commit()
        return events
    else:
        # SQLite / in-memory test mühiti üçün leas-lock
        stmt = (
            select(OutboxEvent)
            .where(
                OutboxEvent.status.in_(["PENDING", "FAILED"]),
                (OutboxEvent.next_attempt_at.is_(None)) | (OutboxEvent.next_attempt_at <= now),
                (OutboxEvent.locked_until.is_(None)) | (OutboxEvent.locked_until <= now),
            )
            .order_by(OutboxEvent.created_at.asc())
            .limit(limit)
        )
        res = await session.execute(stmt)
        events = list(res.scalars().all())
        for ev in events:
            ev.status = "PROCESSING"
            ev.locked_by = worker_id
            ev.locked_until = lease_expiry
        if events:
            await session.commit()
        return events


async def fetch_pending_outbox_events(session: AsyncSession, limit: int = 50) -> list[OutboxEvent]:
    """Keçmiş işçi metodları ilə geriyə uyğunluq üçün saxlanılan funksiya."""
    return await fetch_and_claim_outbox_batch(session, worker_id="legacy_worker", limit=limit)


async def mark_outbox_event_processed(session: AsyncSession, event_id: uuid.UUID) -> None:
    """Hadisəni uğurla tamamlanmış (DONE) kimi qeyd edir və kilidləri azad edir."""
    stmt = select(OutboxEvent).where(OutboxEvent.id == event_id)
    res = await session.execute(stmt)
    record = res.scalars().first()
    if record:
        record.status = "DONE"
        record.processed_at = utc_now()
        record.locked_by = None
        record.locked_until = None
        await session.commit()


async def mark_outbox_event_failed(
    session: AsyncSession,
    event_id: uuid.UUID,
    error: str,
    max_attempts: int = 5,
    base_backoff_seconds: float = 2.0,
) -> OutboxEvent | None:
    """Hadisə uğursuz olduqda cəhd sayını artırır, eksponensial gecikmə hesablayır və ya Dead-Letter-ə keçirir."""
    stmt = select(OutboxEvent).where(OutboxEvent.id == event_id)
    res = await session.execute(stmt)
    record = res.scalars().first()
    if not record:
        return None

    record.attempts += 1
    record.last_error = error
    record.locked_by = None
    record.locked_until = None

    if record.attempts >= max_attempts:
        record.status = "DEAD"
        record.next_attempt_at = None
        logger.error(
            "Outbox hadisəsi maksimal cəhd sayını aşdı və DEAD-LETTER vəziyyətinə keçdi",
            event_id=str(event_id),
            event_type=record.event_type,
            attempts=record.attempts,
            error=error,
        )
    else:
        record.status = "FAILED"
        # Eksponensial gözləmə + jitter
        jitter = random.uniform(0.1, 1.0)
        delay = (base_backoff_seconds ** record.attempts) + jitter
        record.next_attempt_at = utc_now() + timedelta(seconds=delay)
        logger.warning(
            "Outbox hadisəsi uğursuz oldu, təkrar icra planlaşdırıldı",
            event_id=str(event_id),
            event_type=record.event_type,
            attempts=record.attempts,
            next_attempt_in_seconds=round(delay, 2),
            error=error,
        )

    await session.commit()
    return record


async def is_event_processed_by_consumer(
    session: AsyncSession,
    event_id: uuid.UUID | str,
    consumer: str,
) -> bool:
    """İstehlakçının bu hadisəni artıq emal edib-etmədiyini yoxlayır (İdempotensiya)."""
    parsed_id = uuid.UUID(str(event_id)) if isinstance(event_id, str) else event_id
    stmt = select(ProcessedEvent).where(
        ProcessedEvent.event_id == parsed_id,
        ProcessedEvent.consumer_name == consumer,
    )
    res = await session.execute(stmt)
    return res.scalars().first() is not None


async def mark_event_processed_by_consumer(
    session: AsyncSession,
    event_id: uuid.UUID | str,
    consumer: str,
) -> None:
    """İstehlakçının hadisəni emal etdiyini idempotensiya cədvəlində qeyd edir."""
    parsed_id = uuid.UUID(str(event_id)) if isinstance(event_id, str) else event_id
    entry = ProcessedEvent(
        id=generate_uuid7(),
        event_id=parsed_id,
        consumer_name=consumer,
        status="PROCESSED",
        processed_at=utc_now(),
    )
    session.add(entry)
    await session.commit()


async def record_event_delivery(
    session: AsyncSession,
    event_id: uuid.UUID | str,
    consumer: str,
    status: str,
    attempts: int = 1,
    error: str | None = None,
) -> EventDelivery:
    """Müəyyən istehlakçı üçün çatdırılma statusunu qeyd və ya yenilə edir."""
    stmt = select(EventDelivery).where(
        EventDelivery.event_id == str(event_id),
        EventDelivery.consumer == consumer,
    )
    res = await session.execute(stmt)
    delivery = res.scalars().first()
    now = utc_now()

    if not delivery:
        delivery = EventDelivery(
            id=generate_uuid7(),
            event_id=str(event_id),
            consumer=consumer,
            status=status,
            attempts=attempts,
            last_error=error,
            delivered_at=now if status == "DONE" else None,
            created_at=now,
        )
        session.add(delivery)
    else:
        delivery.status = status
        delivery.attempts = attempts
        delivery.last_error = error
        if status == "DONE":
            delivery.delivered_at = now

    await session.commit()
    return delivery


async def fetch_dead_letter_events(
    session: AsyncSession,
    limit: int = 100,
    offset: int = 0,
) -> list[OutboxEvent]:
    """Dead-letter statusunda olan hadisələri inzibati baxış üçün çəkir."""
    stmt = (
        select(OutboxEvent)
        .where(OutboxEvent.status == "DEAD")
        .order_by(desc(OutboxEvent.created_at))
        .limit(limit)
        .offset(offset)
    )
    res = await session.execute(stmt)
    return list(res.scalars().all())


async def replay_dead_letter_event(session: AsyncSession, event_id: uuid.UUID | str) -> OutboxEvent:
    """Tək bir dead-letter hadisəsini yenidən PENDING statusuna qaytararaq təkrar icraya buraxır."""
    parsed_id = uuid.UUID(str(event_id)) if isinstance(event_id, str) else event_id
    stmt = select(OutboxEvent).where(OutboxEvent.id == parsed_id)
    res = await session.execute(stmt)
    record = res.scalars().first()
    if not record:
        raise ValueError(f"Hadisə tapılmadı: {event_id}")

    record.status = "PENDING"
    record.attempts = 0
    record.next_attempt_at = None
    record.locked_by = None
    record.locked_until = None
    record.last_error = None
    await session.commit()
    return record


async def bulk_replay_dead_letter_events(
    session: AsyncSession,
    event_type: str | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
) -> int:
    """Filtrlənmiş şəkildə bütün dead-letter hadisələrini yenidən icraya qaytarır."""
    stmt = select(OutboxEvent).where(OutboxEvent.status == "DEAD")
    if event_type:
        stmt = stmt.where(OutboxEvent.event_type == event_type)
    if start_time:
        stmt = stmt.where(OutboxEvent.created_at >= start_time)
    if end_time:
        stmt = stmt.where(OutboxEvent.created_at <= end_time)

    res = await session.execute(stmt)
    dead_events = list(res.scalars().all())
    count = 0
    for ev in dead_events:
        ev.status = "PENDING"
        ev.attempts = 0
        ev.next_attempt_at = None
        ev.locked_by = None
        ev.locked_until = None
        ev.last_error = None
        count += 1

    if count > 0:
        await session.commit()
    return count


async def archive_processed_events(session: AsyncSession, retention_days: int = 30) -> int:
    """Uğurla tamamlanmış köhnə hadisələri təmizləyir/arxivləyir."""
    cutoff = utc_now() - timedelta(days=retention_days)
    stmt = delete(OutboxEvent).where(
        OutboxEvent.status.in_(["DONE", "PROCESSED"]),
        OutboxEvent.processed_at <= cutoff,
    )
    res = await session.execute(stmt)
    await session.commit()
    return int(res.rowcount or 0)


async def get_outbox_metrics(session: AsyncSession) -> dict[str, Any]:
    """Outbox monitorinqi üçün kəmiyyət və gecikmə göstəricilərini hesablayır."""
    # Statuslar üzrə saylar
    stmt = select(OutboxEvent.status, func.count(OutboxEvent.id)).group_by(OutboxEvent.status)
    res = await session.execute(stmt)
    counts: dict[str, int] = {str(row[0]): int(row[1]) for row in res.all()}

    pending_count = counts.get("PENDING", 0)
    processing_count = counts.get("PROCESSING", 0)
    dead_count = counts.get("DEAD", 0)
    failed_count = counts.get("FAILED", 0)
    done_count = counts.get("DONE", 0) + counts.get("PROCESSED", 0)

    # Ən köhnə gözləyən hadisənin gecikməsi
    oldest_stmt = (
        select(OutboxEvent.created_at)
        .where(OutboxEvent.status.in_(["PENDING", "PROCESSING"]))
        .order_by(OutboxEvent.created_at.asc())
        .limit(1)
    )
    oldest_res = await session.execute(oldest_stmt)
    oldest_created_at = oldest_res.scalars().first()

    lag_seconds = 0.0
    if oldest_created_at:
        lag_seconds = max(0.0, (utc_now() - ensure_utc(oldest_created_at)).total_seconds())

    return {
        "pending": pending_count,
        "processing": processing_count,
        "dead": dead_count,
        "failed": failed_count,
        "done": done_count,
        "oldest_lag_seconds": round(lag_seconds, 2),
        "total_active": pending_count + processing_count + failed_count,
    }
