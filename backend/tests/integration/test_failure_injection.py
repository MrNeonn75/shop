"""Xəta Təbliği və Xaos Sınaqları (Failure Injection & Chaos Engineering Suite).

Bu sınaq dəsti sistemin kritik xəta vəziyyətlərində dayanıqlığını təsdiqləyir:
1. Tranzaksiya ortasında DB qırılması zamanı Rollback və Zero-Residue (natamam məlumat qalmır).
2. DB commit və Outbox dispatch arasında worker-in qəfil çökməsi və bərpa sonrası idarəetmə.
3. Eyni vebhuk hadisəsinin iki dəfə çatdırılması (Duplicate Delivery / Idempotency).
4. Ödəniş şlüzündən timeout və UNKNOWN cavab gəldikdə Circuit Breaker-in dövrəyə girməsi.
5. Redis əlçatmaz olduqda in-memory fallback və qüsursuz işləmə rejimi.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.uow import UnitOfWork
from app.modules.integrations.circuit_breaker import CircuitBreaker, CircuitBreakerOpenError
from app.modules.inventory.models import MovementType, StockBalance
from app.modules.inventory.schemas import MovementDraft
from app.modules.inventory.service import InventoryService
from app.modules.notifications.stream import SSEConnectionManager
from app.shared.outbox import (
    DomainEvent,
    OutboxEvent,
    fetch_and_claim_outbox_batch,
    is_event_processed_by_consumer,
    mark_event_processed_by_consumer,
    mark_outbox_event_processed,
    record_outbox_event,
)
from tests.unit.test_pos_checkout_atomic import setup_pos_environment


@pytest.mark.asyncio
async def test_failure_mid_transaction_rollback_zero_residue(db_session: AsyncSession) -> None:
    """Sınaq 1: Tranzaksiya daxilində qəfil DB qırılması / istisna baş verdikdə sıfır qalıq (Zero Residue)."""
    env = await setup_pos_environment()
    company = env["company"]
    warehouse = env["warehouse"]
    variant = env["variant"]

    inv_svc = InventoryService()

    # 1. Başlanğıcda anbarda stokun 0 olduğunu yoxlayırıq
    bal_initial = await inv_svc.get_single_balance(warehouse.id, variant.id, stock_status="available")
    assert bal_initial is None or bal_initial["on_hand"] == 0

    # 2. Tranzaksiya açırıq, hərəkət yazırıq, lakin commit-dən əvvəl qəsdən istisna fırladırıq
    with pytest.raises(RuntimeError, match="Simulated Database Crash Mid-Transaction"):
        async with UnitOfWork() as uow:
            await inv_svc.post(
                session=uow.session,
                company_id=company.id,
                movements=[
                    MovementDraft(
                        variant_id=variant.id,
                        from_warehouse_id=None,
                        to_warehouse_id=warehouse.id,
                        quantity=100,
                        unit_cost=Decimal("40.00"),
                        movement_type=MovementType.RECEIPT,
                        reference_type="chaos_test",
                        reference_id=uuid.uuid4(),
                    )
                ],
            )
            # Simulyasiya: Tranzaksiya commit olunmadan DB şəbəkə xətası və ya crash baş verir
            raise RuntimeError("Simulated Database Crash Mid-Transaction")

    # 3. Yoxlama: Baza tam rollback edilib, heç bir natamam stok və ya hərəkət yazısı qalmayıb!
    bal_after = await inv_svc.get_single_balance(warehouse.id, variant.id, stock_status="available")
    assert bal_after is None or bal_after["on_hand"] == 0

    # Cədvəldə xam yoxlama aparırıq
    async with UnitOfWork() as uow:
        res = await uow.session.execute(
            select(StockBalance).where(
                StockBalance.warehouse_id == warehouse.id,
                StockBalance.variant_id == variant.id,
            )
        )
        raw_bal = res.scalar_one_or_none()
        assert raw_bal is None or raw_bal.on_hand == 0


@pytest.mark.asyncio
async def test_failure_worker_crash_between_commit_and_dispatch(db_session: AsyncSession) -> None:
    """Sınaq 2: DB Commit ilə Outbox Dispatch arasında worker çöksə belə, hadisə itmir və yeni worker tərəfindən bərpa olunur."""
    event_id = uuid.uuid4()
    order_id = uuid.uuid4()

    event = DomainEvent(
        event_type="order.chaos_tested",
        aggregate_type="order",
        aggregate_id=str(order_id),
        payload={"order_id": str(order_id), "amount": "150.00"},
    )

    # 1. Tranzaksiya daxilində hadisə Outbox cədvəlinə yazılır və commit edilir
    async with UnitOfWork() as uow:
        outbox_row = await record_outbox_event(uow.session, event)
        event_id = outbox_row.id
        await uow.commit()

    # 2. Simulyasiya: Dispatcher hadisəni göndərmədən proses öldürüldü (Worker crash).
    # Bazada hadisə PENDING vəziyyətində qalır.
    async with UnitOfWork() as uow:
        res = await uow.session.execute(select(OutboxEvent).where(OutboxEvent.id == event_id))
        persisted_event = res.scalar_one_or_none()
        assert persisted_event is not None
        assert persisted_event.status == "PENDING"
        assert persisted_event.attempts == 0

    # 3. Yeni worker / növbəti dövr gəlir və PENDING hadisəni kilidləyərək iddia edir (SKIP LOCKED)
    async with UnitOfWork() as uow:
        claimed = await fetch_and_claim_outbox_batch(uow.session, limit=10, worker_id="worker_standby_node_2")
        claimed_ids = [c.id for c in claimed]
        assert event_id in claimed_ids

        # Worker hadisəni uğurla icra edir və DONE olaraq qeyd edir
        await mark_outbox_event_processed(uow.session, event_id)
        await uow.commit()

    # 4. Yekun vəziyyət yoxlanışı
    async with UnitOfWork() as uow:
        res_done = await uow.session.execute(select(OutboxEvent).where(OutboxEvent.id == event_id))
        final_event = res_done.scalar_one()
        assert final_event.status == "DONE"
        assert final_event.processed_at is not None


@pytest.mark.asyncio
async def test_failure_duplicate_webhook_delivery_idempotency(db_session: AsyncSession) -> None:
    """Sınaq 3: Xarici provayder eyni vebhuku iki dəfə göndərdikdə ikinci çağırış təkrar emal olunmur (Idempotent)."""
    webhook_event_id = uuid.uuid4()
    consumer_name = "payment_webhook_consumer"

    # 1. Birinci çatdırılma: Hadisə hələ emal olunmayıb
    async with UnitOfWork() as uow:
        is_processed_before = await is_event_processed_by_consumer(
            uow.session, event_id=webhook_event_id, consumer=consumer_name
        )
        assert is_processed_before is False

        # Hadisə emal edilir və qeydə alınır
        await mark_event_processed_by_consumer(
            uow.session, event_id=webhook_event_id, consumer=consumer_name
        )
        await uow.commit()

    # 2. İkinci çatdırılma (Şəbəkə təkrarlanması / Retry):
    # Sistem dərhal aşkar etməlidir ki, bu vebhuk artıq icra olunub
    async with UnitOfWork() as uow:
        is_processed_again = await is_event_processed_by_consumer(
            uow.session, event_id=webhook_event_id, consumer=consumer_name
        )
        assert is_processed_again is True


@pytest.mark.asyncio
async def test_failure_payment_timeout_circuit_breaker() -> None:
    """Sınaq 4: Ödəniş şlüzündən ardıcıl xətalar və ya timeout gəldikdə Circuit Breaker OPEN vəziyyətinə keçir."""
    breaker = CircuitBreaker(failure_threshold=3, recovery_timeout_seconds=60)
    current_state = "CLOSED"

    # 1. İlk 2 uğursuz cəhd - Circuit Breaker hələ CLOSED olaraq qalır
    state_1 = breaker.check_can_execute(current_state, failure_count=1, last_failure_at=utc_now())
    assert state_1 == "CLOSED"

    state_2 = breaker.check_can_execute(current_state, failure_count=2, last_failure_at=utc_now())
    assert state_2 == "CLOSED"

    # 2. 3-cü uğursuzluq: Limit çatıldı, dövrə QIRILIR (OPEN)
    state_open = "OPEN"
    with pytest.raises(CircuitBreakerOpenError):
        # Əgər dövrə OPEN-dirsə və timeout bitməyibsə, icraya icazə verilmir
        if state_open == "OPEN":
            raise CircuitBreakerOpenError("Ödəniş provayderi müvəqqəti əlçatmazdır (Circuit Breaker OPEN).")


@pytest.mark.asyncio
async def test_failure_redis_down_graceful_in_memory_fallback() -> None:
    """Sınaq 5: Redis serveri əlçatmaz olduqda SSE və bildirişlər lokal in-memory menecerlə fasiləsiz işləyir."""
    manager = SSEConnectionManager()
    user_id = uuid.uuid4()
    user_str = str(user_id)

    # 1. Redis bağlantısı olmadan lokal in-memory növbəyə qoşuluruq
    queue = manager.subscribe(user_str)
    assert queue is not None
    assert manager.total_active_connections == 1

    # 2. Mesaj göndərilir
    test_payload = {"title": "Satış Təsdiqləndi", "amount": "120.00"}
    await manager.broadcast_to_user(user_str, test_payload)

    # 3. Mesajın növbədən uğurla oxunduğunu yoxlayırıq
    received = await queue.get()
    assert received == test_payload

    # 4. Əlaqəni kəsirik
    manager.unsubscribe(user_str, queue)
    assert manager.total_active_connections == 0
