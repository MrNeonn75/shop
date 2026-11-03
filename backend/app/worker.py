"""Arxa Plan İşçisi və Tapşırıq İcraçısı (ARQ Worker & Scheduler).

1. Transactional Outbox hadisələrinin emalı və xarici sistemlərə çatdırılması.
2. Köhnəlmiş İdempotency açarlarının təmizlənməsi.
3. Periodik tapşırıqlar (cron jobs).
4. Redis olmadıqda belə test və ya standalone rejimdə işləmə qabiliyyəti.
"""

from __future__ import annotations

import asyncio
import contextlib
import uuid
from typing import Any

from arq import cron
from arq.connections import RedisSettings
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

import app.core.database as db_module
from app.core.config import settings
from app.core.database import utc_now
from app.core.idempotency import IdempotencyRecord
from app.core.logging import logger, setup_logging
from app.modules.hr.jobs import (
    accrue_monthly_leave_job,
    anonymize_retention_expired_employees_job,
    check_document_expiry_alerts_job,
)
from app.shared.outbox import (
    fetch_and_claim_outbox_batch,
    mark_outbox_event_failed,
    mark_outbox_event_processed,
    record_event_delivery,
)


async def startup(_ctx: dict[str, Any]) -> None:
    """Worker işə düşdükdə icra olunur."""
    setup_logging()
    logger.info("ARQ Worker işə düşdü", env=settings.APP_ENV)


async def shutdown(_ctx: dict[str, Any]) -> None:
    """Worker dayandıqda icra olunur."""
    logger.info("ARQ Worker dayandırılır...")


async def dispatch_single_event(
    session: AsyncSession, event_id: uuid.UUID, event_type: str, payload: dict[str, Any]
) -> None:
    """Hadisə tipinə görə müvafiq icranı təmin edir."""
    # 1. Bildiriş və Alert Mühərrikinə yönləndirmə
    try:
        from app.modules.notifications.service import NotificationService

        notif_svc = NotificationService(session)
        branch_id_val = None
        if payload.get("branch_id"):
            with contextlib.suppress(Exception):
                branch_id_val = uuid.UUID(str(payload["branch_id"]))
        await notif_svc.dispatch_event_notifications(
            event_type=event_type,
            payload=payload,
            branch_id=branch_id_val,
            source_event_id=event_id,
        )
    except Exception as notif_exc:
        logger.warning("Bildiriş paylanmasında xəta (outbox axını davam edir)", error=str(notif_exc))

    # 2. Xüsusi biznes istehlakçıları
    if event_type == "ping.recorded":
        logger.info(
            "Outbox hadisəsi emal edildi: Ping qeydə alındı",
            ping_id=payload.get("ping_id"),
            message=payload.get("message"),
        )
    elif event_type in (
        "sale.completed",
        "return.completed",
        "goods_receipt.completed",
        "inventory.received",
        "supplier_invoice.approved",
        "payroll.finalized",
        "shift.closed",
    ):
        from app.modules.finance.consumer import FinanceOutboxConsumer

        consumer = FinanceOutboxConsumer(session)
        await consumer.consume_event(event_id, event_type, payload)

        # CRM və Loyallıq istehlakı
        if event_type == "sale.completed" and payload.get("customer_id"):
            try:
                import uuid as py_uuid
                from decimal import Decimal

                from app.modules.crm.service import CrmService

                crm_svc = CrmService(session)
                await crm_svc.update_aggregates_from_sale(
                    customer_id=py_uuid.UUID(str(payload["customer_id"])),
                    sale_amount=Decimal(str(payload.get("grand_total", "0.00"))),
                    sale_date=utc_now(),
                )
            except Exception as e:
                logger.error("CRM sale.completed istehlakında xəta", error=str(e))
        elif event_type == "return.completed" and payload.get("customer_id"):
            try:
                import uuid as py_uuid
                from decimal import Decimal

                from app.modules.crm.service import CrmService

                crm_svc = CrmService(session)
                await crm_svc.update_aggregates_from_return(
                    customer_id=py_uuid.UUID(str(payload["customer_id"])),
                    return_amount=Decimal(str(payload.get("refund_total", "0.00"))),
                )
            except Exception as e:
                logger.error("CRM return.completed istehlakında xəta", error=str(e))

        # Hesabatlılıq xülasə cədvəllərinin inkremental yenilənməsi
        if event_type == "sale.completed":
            try:
                from app.modules.reporting.repository import ReportingRepository

                rep_repo = ReportingRepository(session)
                await rep_repo.consume_sale_completed(payload)
            except Exception as e:
                logger.error("Reporting sale.completed xülasə yeniləməsində xəta", error=str(e))
        elif event_type == "return.completed":
            try:
                from app.modules.reporting.repository import ReportingRepository

                rep_repo = ReportingRepository(session)
                await rep_repo.consume_return_completed(payload)
            except Exception as e:
                logger.error("Reporting return.completed xülasə yeniləməsində xəta", error=str(e))
    else:
        logger.info("Outbox hadisəsi emal edildi", event_type=event_type)


async def dispatch_outbox_batch(_ctx: dict[str, Any] | None = None) -> int:
    """Gözləyən outbox hadisələrini təhlükəsiz şəkildə bloklayaraq çəkir və emal edir."""
    processed_count = 0
    async with db_module.AsyncSessionLocal() as session:
        events = await fetch_and_claim_outbox_batch(session, worker_id="arq_dispatcher", limit=50)
        for event in events:
            try:
                await dispatch_single_event(session, event.id, event.event_type, event.payload)
                await mark_outbox_event_processed(session, event.id)
                await record_event_delivery(
                    session=session,
                    event_id=event.id,
                    consumer="main_dispatcher",
                    status="DONE",
                    attempts=event.attempts + 1,
                )
                processed_count += 1
            except Exception as exc:
                logger.error(
                    "Outbox hadisəsi emal edilərkən xəta",
                    event_id=str(event.id),
                    error=str(exc),
                )
                await mark_outbox_event_failed(session, event.id, str(exc))
                await record_event_delivery(
                    session=session,
                    event_id=event.id,
                    consumer="main_dispatcher",
                    status="FAILED",
                    attempts=event.attempts + 1,
                    error=str(exc),
                )

    if processed_count > 0:
        logger.info("Outbox paketi emal olundu", processed_count=processed_count)
    return processed_count


async def generate_recurring_expenses_job(_ctx: dict[str, Any] | None = None) -> int:
    """Dövrü xərcləri formalaşdıran gündəlik tapşırıq."""
    from app.modules.finance.service import FinanceService

    service = FinanceService()
    count = await service.generate_recurring_expenses()
    logger.info("Dövrü xərclər formalaşdırıldı", count=count)
    return count


async def cleanup_expired_records(_ctx: dict[str, Any] | None = None) -> int:
    """Müddəti bitmiş Idempotency açarlarını təmizləyir."""
    now = utc_now()
    async with db_module.AsyncSessionLocal() as session:
        stmt = delete(IdempotencyRecord).where(IdempotencyRecord.expires_at <= now)
        res = await session.execute(stmt)
        await session.commit()
        deleted_count = res.rowcount or 0
        if deleted_count > 0:
            logger.info("Köhnəlmiş Idempotency açarları təmizləndi", deleted_count=deleted_count)
        return deleted_count


async def transition_campaign_statuses_job(_ctx: dict[str, Any] | None = None) -> int:
    """Kampaniyaların başlama və bitmə tarixləri üzrə status keçidləri."""
    from sqlalchemy import select

    from app.modules.marketing.engine import PromotionEngineImpl
    from app.modules.marketing.models import Campaign, CampaignStatus

    now = utc_now()
    count = 0
    async with db_module.AsyncSessionLocal() as session:
        stmt = select(Campaign).where(
            Campaign.status.in_([CampaignStatus.SCHEDULED.value, CampaignStatus.ACTIVE.value])
        )
        res = await session.execute(stmt)
        for c in res.scalars().all():
            if c.status == CampaignStatus.SCHEDULED.value and c.start_date <= now:
                c.status = CampaignStatus.ACTIVE.value
                count += 1
            elif c.status == CampaignStatus.ACTIVE.value and c.end_date <= now:
                c.status = CampaignStatus.ENDED.value
                count += 1
        if count > 0:
            PromotionEngineImpl.invalidate_cache()
            await session.commit()
    return count


async def expire_loyalty_lots_job(_ctx: dict[str, Any] | None = None) -> int:
    """Vaxtı bitmiş FIFO loyallıq xal partiyalarını dondurur."""
    from app.modules.loyalty.service import LoyaltyService

    async with db_module.AsyncSessionLocal() as session:
        svc = LoyaltyService(session)
        exp = await svc.expire_lots()
        await session.commit()
        return exp


async def refresh_dynamic_segments_job(_ctx: dict[str, Any] | None = None) -> int:
    """Dinamik CRM seqmentlərinin üzvlüyünü yenidən hesablayır."""
    from sqlalchemy import select

    from app.modules.crm.models import CustomerSegment
    from app.modules.crm.service import CrmService

    count = 0
    async with db_module.AsyncSessionLocal() as session:
        stmt = select(CustomerSegment).where(CustomerSegment.type == "DYNAMIC")
        res = await session.execute(stmt)
        svc = CrmService(session)
        for seg in res.scalars().all():
            await svc.refresh_segment(seg.id)
            count += 1
        await session.commit()
    return count


async def reconcile_reporting_summaries_job(_ctx: dict[str, Any] | None = None) -> int:
    """Gündəlik hesabatlılıq xülasə cədvəllərinin mənbə ilə tutuşdurulması (Reconciliation)."""
    from datetime import date, timedelta

    from sqlalchemy import select

    from app.modules.branches.models import Branch
    from app.modules.reporting.repository import ReportingRepository

    yesterday = date.today() - timedelta(days=1)
    drift_count = 0
    async with db_module.AsyncSessionLocal() as session:
        branches_res = await session.execute(select(Branch.id).where(Branch.status == "active"))
        branch_ids = branches_res.scalars().all()
        repo = ReportingRepository(session)
        for b_id in branch_ids:
            try:
                source_sales, summary_sales, is_drift = (
                    await repo.reconcile_sales_summary_for_date(
                        target_date=yesterday,
                        branch_id=b_id,
                    )
                )
                if is_drift:
                    drift_count += 1
                    logger.warning(
                        "Hesabatlılıq xülasəsində drift aşkarlandı",
                        branch_id=str(b_id),
                        date=str(yesterday),
                        source_sales=str(source_sales),
                        summary_sales=str(summary_sales),
                    )
            except Exception as exc:
                logger.error(
                    "Reconciliation yoxlanışında xəta", branch_id=str(b_id), error=str(exc)
                )
    return drift_count


class WorkerSettings:
    """ARQ Worker konfiqurasiyası."""

    functions = [
        dispatch_outbox_batch,
        cleanup_expired_records,
        generate_recurring_expenses_job,
        check_document_expiry_alerts_job,
        accrue_monthly_leave_job,
        anonymize_retention_expired_employees_job,
        transition_campaign_statuses_job,
        expire_loyalty_lots_job,
        refresh_dynamic_segments_job,
        reconcile_reporting_summaries_job,
    ]
    cron_jobs = [
        # Hər 10 saniyədən bir outbox yoxlanışı
        cron(dispatch_outbox_batch, second=set(range(0, 60, 10))),  # type: ignore[arg-type]
        # Hər saatın əvvəlində köhnə qeydlərin təmizlənməsi
        cron(cleanup_expired_records, minute=0),  # type: ignore[arg-type]
        # Hər 5 dəqiqədən bir kampaniya status keçidləri
        cron(transition_campaign_statuses_job, minute=set(range(0, 60, 5))),  # type: ignore[arg-type]
        # Hər gecə saat 00:05-də dövrü xərclərin DRAFT formalaşdırılması
        cron(generate_recurring_expenses_job, hour=0, minute=5),  # type: ignore[arg-type]
        # Hər gecə saat 00:30-da vaxtı bitmiş loyallıq xallarının dondurulması
        cron(expire_loyalty_lots_job, hour=0, minute=30),  # type: ignore[arg-type]
        # Hər gecə saat 01:00-da sənəd müddəti bildirişləri
        cron(check_document_expiry_alerts_job, hour=1, minute=0),  # type: ignore[arg-type]
        # Hər gecə saat 01:30-da dinamik seqmentlərin yenilənməsi
        cron(refresh_dynamic_segments_job, hour=1, minute=30),  # type: ignore[arg-type]
        # Hər gecə saat 02:30-da hesabatlılıq xülasə cədvəllərinin uzlaşdırılması (Reconciliation)
        cron(reconcile_reporting_summaries_job, hour=2, minute=30),  # type: ignore[arg-type]
        # Hər ayın 1-i məzuniyyət hesablama tapşırığı
        cron(accrue_monthly_leave_job, month=set(range(1, 13)), day=1, hour=2, minute=0),  # type: ignore[arg-type]
        # Hər ayın 1-i saxlama müddəti bitmiş işçilərin anonimləşdirilməsi
        cron(anonymize_retention_expired_employees_job, month=set(range(1, 13)), day=1, hour=3, minute=0),  # type: ignore[arg-type]
    ]
    on_startup = startup
    on_shutdown = shutdown

    # Redis bağlantısı
    if settings.REDIS_URL:
        # redis://[:password@]host[:port][/db] parsing
        import urllib.parse

        parsed = urllib.parse.urlparse(settings.REDIS_URL)
        redis_settings = RedisSettings(
            host=parsed.hostname or "localhost",
            port=parsed.port or 6379,
            password=parsed.password,
            database=int(parsed.path.lstrip("/") or 0) if parsed.path else 0,
        )


async def run_worker_standalone_loop() -> None:
    """Redis mövcud olmadıqda və ya lokal inkişaf zamanı daxili dövrəli işçi."""
    setup_logging()
    logger.info("Standalone Outbox Dispatcher işə düşdü...")
    while True:
        try:
            await dispatch_outbox_batch()
            await cleanup_expired_records()
        except Exception as exc:
            logger.error("Daxili işçi dövrəsində xəta", error=str(exc))
        await asyncio.sleep(5)


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "loop":
        asyncio.run(run_worker_standalone_loop())
    else:
        # Standart ARQ CLI işə salınması üçün təlimat
        print("ARQ Worker işə salmaq üçün: arq app.worker.WorkerSettings")
        print("Və ya standalone rejim üçün: python -m app.worker loop")
