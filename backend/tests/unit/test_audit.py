"""Dəyişməz Audit Jurnalı və Kriptoqrafik Heş Zənciri Vahid Testləri (Unit Tests for Audit).

Əhatə dairəsi:
1. Tranzaksiya atomarlığı (Audit və Outbox eyni DB tranzaksiyasında).
2. ORM və DB səviyyəsində dəyişməzlik (UPDATE və DELETE cəhdlərində AuditImmutableError).
3. Kriptoqrafik heş zəncirinin (Hash Chain) bütövlük təftişi (Integrity Verification).
4. Müdaxilə və saxtalaşdırmanın (Tampering) dəqiq hadisə ID-si ilə aşkarlanması.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuditImmutableError
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.audit.service import AuditService
from app.shared.audit import AuditEvent, record_audit_event
from app.shared.outbox import OutboxEvent, record_outbox_event


@pytest.fixture
def audit_service() -> AuditService:
    return AuditService()


@pytest.mark.asyncio
async def test_audit_and_outbox_transaction_atomicity(session: AsyncSession) -> None:
    """Audit və Outbox hadisələrinin eyni DB tranzaksiyasında atomar yazıldığını yoxlayır."""
    user_id = generate_uuid7()

    async with UnitOfWork() as uow:
        await record_audit_event(
            session=uow.session,
            action="USER_CREATED",
            resource_type="users",
            resource_id=str(user_id),
            actor_id=user_id,
            diff={"username": "test_atomic_user"},
        )
        from app.shared.events import DomainEvent

        event = DomainEvent(
            event_type="user.created",
            aggregate_type="users",
            aggregate_id=str(user_id),
            payload={"username": "test_atomic_user"},
        )
        await record_outbox_event(uow.session, event)
        await uow.commit()

    # Bazada hər iki hadisə mövcud olmalıdır
    async with UnitOfWork() as uow:
        audit_res = await uow.session.execute(
            select(AuditEvent).where(AuditEvent.resource_id == str(user_id))
        )
        outbox_res = await uow.session.execute(
            select(OutboxEvent).where(OutboxEvent.aggregate_id == str(user_id))
        )
        assert audit_res.scalar_one_or_none() is not None
        assert outbox_res.scalar_one_or_none() is not None

    # Rollback ssenarisini yoxlayırıq
    rollback_user_id = generate_uuid7()
    try:
        async with UnitOfWork() as uow:
            await record_audit_event(
                session=uow.session,
                action="USER_DELETED",
                resource_type="users",
                resource_id=str(rollback_user_id),
                actor_id=rollback_user_id,
            )
            raise RuntimeError("Tranzaksiya qəsdən dayandırıldı!")
    except RuntimeError:
        pass

    async with UnitOfWork() as uow:
        audit_check = await uow.session.execute(
            select(AuditEvent).where(AuditEvent.resource_id == str(rollback_user_id))
        )
        assert audit_check.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_audit_event_immutability_update_and_delete(session: AsyncSession) -> None:
    """Audit qeydinin redaktə edilməsi (UPDATE) və ya silinməsi (DELETE) cəhdində AuditImmutableError qaldırıldığını yoxlayır."""
    ev = await record_audit_event(
        session=session,
        action="LOGIN_SUCCESS",
        resource_type="users",
        resource_id="usr-123",
        diff={"info": "Initial log"},
    )
    await session.commit()

    # 1. ORM səviyyəsində UPDATE cəhdi
    ev.reason = "Dəyişdirilmiş qeyd"
    with pytest.raises(AuditImmutableError):
        await session.commit()

    await session.rollback()

    # 2. ORM səviyyəsində DELETE cəhdi
    await session.delete(ev)
    with pytest.raises(AuditImmutableError):
        await session.commit()

    await session.rollback()


@pytest.mark.asyncio
async def test_audit_hash_chain_verification_and_tamper_detection(
    audit_service: AuditService, session: AsyncSession
) -> None:
    """Kriptoqrafik heş zəncirinin bütövlüyünü və müdaxilə zamanı xətanın aşkarlanmasını təsdiqləyir."""
    # 1. Üç ardıcıl audit hadisəsi qeyd edirik
    ev1 = await record_audit_event(
        session=session,
        action="USER_REGISTERED",
        resource_type="users",
        resource_id="u-1",
        diff={"username": "user1"},
    )
    await session.commit()

    ev2 = await record_audit_event(
        session=session,
        action="USER_ROLE_ASSIGNED",
        resource_type="users",
        resource_id="u-1",
        diff={"role": "cashier"},
    )
    await session.commit()

    ev3 = await record_audit_event(
        session=session,
        action="PASSWORD_CHANGED",
        resource_type="users",
        resource_id="u-1",
        diff={"by": "self"},
    )
    await session.commit()

    # Hər bir hadisə əvvəlkinin heşinə bağlanmalıdır
    assert ev2.prev_hash == ev1.hash
    assert ev3.prev_hash == ev2.hash

    # Bütövlük təftişi (Integrity check) keçməlidir
    integrity_res = await audit_service.verify_integrity(actor=None)
    assert integrity_res.status == "valid"
    assert integrity_res.is_tampered is False
    assert integrity_res.checked_count >= 3

    # 2. İkinci hadisənin diff sahəsini saxtalaşdırırıq (Raw SQL ilə ORM listener-i keçirik)
    await session.execute(
        update(AuditEvent).where(AuditEvent.id == ev2.id).values(diff={"role": "system_admin"})
    )
    await session.commit()

    # İndi bütövlük təftişi müdaxiləni (tampering) aşkar etməlidir!
    tamper_res = await audit_service.verify_integrity(actor=None)
    assert tamper_res.status == "tampered"
    assert tamper_res.is_tampered is True
    assert tamper_res.broken_event_id == str(ev2.id)
    assert "uyğunsuzluğu" in tamper_res.message
