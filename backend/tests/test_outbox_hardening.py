"""Transactional Outbox Hardening və Hadisə Sxem Reyestri Testləri."""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.shared.event_registry import (
    EventSchemaIncompatibleError,
    EventSchemaValidationError,
    check_schema_compatibility,
    validate_event_payload,
)
from app.shared.events import DomainEvent
from app.shared.outbox import (
    archive_processed_events,
    bulk_replay_dead_letter_events,
    fetch_and_claim_outbox_batch,
    fetch_dead_letter_events,
    get_outbox_metrics,
    is_event_processed_by_consumer,
    mark_event_processed_by_consumer,
    mark_outbox_event_failed,
    mark_outbox_event_processed,
    record_event_delivery,
    record_outbox_event,
    replay_dead_letter_event,
)


@pytest.mark.asyncio
async def test_record_and_claim_outbox_batch(session: AsyncSession) -> None:
    """Outbox hadisəsinin qeydi və işçi tərəfindən lease-lock ilə bloklanması."""
    event = DomainEvent(
        event_type="sale.completed",
        aggregate_type="sale",
        aggregate_id="sale_123",
        payload={"sale_id": "sale_123", "branch_id": "br_1", "grand_total": "150.00"},
    )
    record = await record_outbox_event(session, event, version=1)
    await session.commit()

    assert record.id == event.event_id
    assert record.status == "PENDING"
    assert record.version == 1

    # İşçi paketi çəkir
    claimed = await fetch_and_claim_outbox_batch(session, worker_id="worker_alpha", limit=10, lease_seconds=30)
    assert len(claimed) == 1
    assert claimed[0].id == record.id
    assert claimed[0].status == "PROCESSING"
    assert claimed[0].locked_by == "worker_alpha"
    assert claimed[0].locked_until is not None

    # İkinci işçi dərhal çəkdikdə həmin hadisəni almamalıdır (artıq bloklanıb)
    second_claim = await fetch_and_claim_outbox_batch(session, worker_id="worker_beta", limit=10)
    assert len(second_claim) == 0

    # Uğurla tamamlandıqda kilid azad edilir
    await mark_outbox_event_processed(session, record.id)
    assert record.status == "DONE"
    assert record.locked_by is None
    assert record.locked_until is None


@pytest.mark.asyncio
async def test_outbox_exponential_backoff_and_dead_letter(session: AsyncSession) -> None:
    """Uğursuz cəhdlər zamanı eksponensial gözləmə və maksimal həddən sonra DEAD statusuna keçid."""
    event = DomainEvent(
        event_type="stock.changed",
        aggregate_type="variant",
        aggregate_id="var_1",
        payload={"variant_id": "var_1", "warehouse_id": "wh_1", "quantity_change": 5},
    )
    record = await record_outbox_event(session, event)
    await session.commit()

    # 1-ci uğursuzluq
    updated = await mark_outbox_event_failed(session, record.id, error="Network timeout", max_attempts=3)
    assert updated is not None
    assert updated.status == "FAILED"
    assert updated.attempts == 1
    assert updated.next_attempt_at is not None

    # 2-ci uğursuzluq
    updated = await mark_outbox_event_failed(session, record.id, error="Connection refused", max_attempts=3)
    assert updated is not None
    assert updated.status == "FAILED"
    assert updated.attempts == 2

    # 3-cü uğursuzluq (maksimal cəhd həddi -> DEAD)
    updated = await mark_outbox_event_failed(session, record.id, error="Final crash", max_attempts=3)
    assert updated is not None
    assert updated.status == "DEAD"
    assert updated.attempts == 3
    assert updated.next_attempt_at is None


@pytest.mark.asyncio
async def test_dead_letter_replay(session: AsyncSession) -> None:
    """DEAD hadisənin inzibati qaydada tək və ya toplu replay edilməsi."""
    event1 = DomainEvent(
        event_type="test.event",
        aggregate_type="test",
        aggregate_id="test_1",
        payload={"data": "val1"},
    )
    event2 = DomainEvent(
        event_type="test.event",
        aggregate_type="test",
        aggregate_id="test_2",
        payload={"data": "val2"},
    )
    rec1 = await record_outbox_event(session, event1)
    rec2 = await record_outbox_event(session, event2)
    rec1.status = "DEAD"
    rec1.attempts = 5
    rec2.status = "DEAD"
    rec2.attempts = 5
    await session.commit()

    # Dead-letter hadisələrini çəkirik
    dead_list = await fetch_dead_letter_events(session)
    assert len(dead_list) >= 2

    # Tək hadisəni replay edirik
    replayed = await replay_dead_letter_event(session, rec1.id)
    assert replayed.status == "PENDING"
    assert replayed.attempts == 0
    assert replayed.last_error is None

    # Toplu replay
    count = await bulk_replay_dead_letter_events(session, event_type="test.event")
    assert count >= 1
    assert rec2.status == "PENDING"


@pytest.mark.asyncio
async def test_consumer_idempotency_and_delivery_tracking(session: AsyncSession) -> None:
    """İstehlakçı səviyyəsində idempotensiya və çatdırılma qeydiyyatı."""
    test_event_id = uuid.uuid4()
    consumer = "finance_consumer"

    # Başlanğıcda emal edilməyib
    is_done = await is_event_processed_by_consumer(session, test_event_id, consumer)
    assert not is_done

    # Çatdırılma statusu qeyd edirik
    delivery = await record_event_delivery(
        session,
        event_id=test_event_id,
        consumer=consumer,
        status="DONE",
        attempts=1,
    )
    assert delivery.status == "DONE"
    assert delivery.consumer == consumer

    # İdempotensiya qeydini yazırıq
    await mark_event_processed_by_consumer(session, test_event_id, consumer)

    # İndi emal edilmiş sayılmalıdır
    is_done = await is_event_processed_by_consumer(session, test_event_id, consumer)
    assert is_done


@pytest.mark.asyncio
async def test_outbox_metrics_and_archival(session: AsyncSession) -> None:
    """Outbox gecikmə/say metrikaları və köhnə hadisələrin arxivlənməsi."""
    # Metrikaları yoxlayırıq
    metrics = await get_outbox_metrics(session)
    assert "pending" in metrics
    assert "dead" in metrics
    assert "oldest_lag_seconds" in metrics

    # Arxivləmə testi
    old_event = DomainEvent(
        event_type="old.event",
        aggregate_type="old",
        aggregate_id="1",
        payload={},
    )
    rec = await record_outbox_event(session, old_event)
    rec.status = "DONE"
    rec.processed_at = utc_now() - timedelta(days=40)
    await session.commit()

    archived_count = await archive_processed_events(session, retention_days=30)
    assert archived_count >= 1


def test_event_schema_registry_validation() -> None:
    """Hadisə yükünün sxem üzrə doğrulanması."""
    # 1. Düzgün payload
    valid_payload = {
        "sale_id": "s_100",
        "branch_id": "b_1",
        "grand_total": "120.50",
    }
    validate_event_payload("sale.completed", valid_payload, version=1)

    # 2. Çatışmayan tələb olunan sahə
    invalid_payload = {
        "sale_id": "s_100",
        # branch_id çatışmır
        "grand_total": "120.50",
    }
    with pytest.raises(EventSchemaValidationError) as exc:
        validate_event_payload("sale.completed", invalid_payload, version=1)
    assert "branch_id" in str(exc.value)

    # 3. Səhv tip
    invalid_type_payload = {
        "sale_id": 12345,  # int deyil, str gözlənilir
        "branch_id": "b_1",
        "grand_total": "120.50",
    }
    with pytest.raises(EventSchemaValidationError) as exc:
        validate_event_payload("sale.completed", invalid_type_payload, version=1)
    assert "səhv tip" in str(exc.value)


def test_schema_backward_compatibility() -> None:
    """Sxem versiyaları arasında geriyə uyğunluğun yoxlanması."""
    old_schema = {
        "required_fields": {"sale_id": str, "amount": float},
        "optional_fields": {"notes": str},
    }

    # 1. Yeni optional sahə əlavə etmək OK-dir
    compatible_new_schema = {
        "required_fields": {"sale_id": str, "amount": float},
        "optional_fields": {"notes": str, "coupon_code": str},
    }
    assert check_schema_compatibility(old_schema, compatible_new_schema)

    # 2. Mövcud required sahəni silmək breaking change-dir
    incompatible_schema_removed = {
        "required_fields": {"sale_id": str},  # amount silinib
        "optional_fields": {},
    }
    with pytest.raises(EventSchemaIncompatibleError):
        check_schema_compatibility(old_schema, incompatible_schema_removed)

    # 3. Yeni məcburi sahə əlavə etmək breaking change-dir
    incompatible_schema_new_required = {
        "required_fields": {"sale_id": str, "amount": float, "new_mandatory": str},
        "optional_fields": {},
    }
    with pytest.raises(EventSchemaIncompatibleError):
        check_schema_compatibility(old_schema, incompatible_schema_new_required)


@pytest.mark.asyncio
async def test_outbox_edge_cases_and_helpers(session: AsyncSession) -> None:
    """Outbox funksiyalarının qalan kənar ssenariləri və köməkçi metodları."""
    from app.shared.outbox import (
        fetch_pending_outbox_events,
        mark_outbox_event_failed,
        record_event_delivery,
        replay_dead_letter_event,
    )

    # 1. Non-existent event failure
    res_none = await mark_outbox_event_failed(session, uuid.uuid4(), error="non-existent")
    assert res_none is None

    # 2. Non-existent dead letter replay
    with pytest.raises(ValueError) as exc:
        await replay_dead_letter_event(session, uuid.uuid4())
    assert "tapılmadı" in str(exc.value)

    # 3. Record delivery update existing
    ev_id = uuid.uuid4()
    del1 = await record_event_delivery(session, ev_id, "consumer_a", status="PENDING", attempts=1)
    assert del1.status == "PENDING"
    del2 = await record_event_delivery(session, ev_id, "consumer_a", status="DONE", attempts=2)
    assert del2.status == "DONE"
    assert del2.attempts == 2

    # 4. Legacy fetch_pending_outbox_events
    ev = DomainEvent(
        event_type="test.legacy",
        aggregate_type="test",
        aggregate_id="1",
        payload={},
    )
    await record_outbox_event(session, ev)
    await session.commit()
    pending = await fetch_pending_outbox_events(session, limit=5)
    assert len(pending) >= 1

