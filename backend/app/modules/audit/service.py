"""Audit Modulu Xidmət Qatı (Audit Service).

Audit axtarışı, obyekt xronologiyası (Timeline), Hash Chain bütövlük təftişi və ixrac.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from app.core.errors import ForbiddenError
from app.core.pagination import FilterBarParams
from app.core.uow import UnitOfWork
from app.modules.audit.policies import can_export_audit, can_view_audit
from app.modules.audit.repository import AuditRepository
from app.modules.audit.schemas import (
    AuditEventResponse,
    EntityTimelineEvent,
    EntityTimelineResponse,
    IntegrityVerifyResponse,
)
from app.shared.audit import GENESIS_HASH, compute_audit_hash, record_audit_event


class AuditService:
    """Audit və təhlükəsizlik xidməti."""

    def __init__(self, repository: AuditRepository | None = None) -> None:
        self.repo = repository or AuditRepository()

    async def list_events(
        self,
        params: FilterBarParams,
        module: str | None = None,
        action: str | None = None,
        resource_type: str | None = None,
        actor_id: uuid.UUID | None = None,
        branch_id: uuid.UUID | None = None,
        severity: str | None = None,
        correlation_id: str | None = None,
        actor: Any = None,
    ) -> tuple[list[AuditEventResponse], int]:
        """Audit hadisələrini filtrlər üzrə səhifələmə ilə gətirir."""
        if not can_view_audit(actor):
            raise ForbiddenError("Audit jurnalına baxış icazəniz yoxdur.")

        async with UnitOfWork() as uow:
            items, total = await self.repo.list_events(
                session=uow.session,
                params=params,
                module=module,
                action=action,
                resource_type=resource_type,
                actor_id=actor_id,
                branch_id=branch_id,
                severity=severity,
                correlation_id=correlation_id,
            )
            return [AuditEventResponse.model_validate(item) for item in items], total

    async def get_entity_timeline(
        self, entity_type: str, entity_id: str, actor: Any = None
    ) -> EntityTimelineResponse:
        """Müəyyən obyektin bütün dəyişiklik tarixçəsini (timeline) çıxarır."""
        if not can_view_audit(actor):
            raise ForbiddenError("Audit tarixçəsinə baxış icazəniz yoxdur.")

        async with UnitOfWork() as uow:
            events = await self.repo.get_timeline(uow.session, entity_type, entity_id)
            timeline_items = [
                EntityTimelineEvent(
                    id=e.id,
                    occurred_at=e.created_at,
                    action=e.action,
                    actor_id=e.actor_id,
                    actor_ip=e.actor_ip,
                    diff=e.diff,
                    reason=e.reason,
                    correlation_id=e.correlation_id,
                    severity=e.severity,
                )
                for e in events
            ]
            return EntityTimelineResponse(
                entity_type=entity_type,
                entity_id=entity_id,
                total_events=len(timeline_items),
                events=timeline_items,
            )

    async def verify_integrity(
        self,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        actor: Any = None,
    ) -> IntegrityVerifyResponse:
        """Kriptoqrafik heş zəncirini (Hash chain) təftiş edərək müdaxiləni aşkar edir."""
        if not can_view_audit(actor):
            raise ForbiddenError("Audit bütövlüyünü yoxlamaq icazəniz yoxdur.")

        async with UnitOfWork() as uow:
            events = await self.repo.get_chain_events(uow.session, date_from, date_to)

            if not events:
                return IntegrityVerifyResponse(
                    status="valid",
                    checked_count=0,
                    is_tampered=False,
                    message="Yoxlanılacaq audit hadisəsi tapılmadı.",
                )

            expected_prev = GENESIS_HASH if not date_from else events[0].prev_hash

            for idx, ev in enumerate(events):
                # 1. Əvvəlki heşlə əlaqənin yoxlanışı (ilk hadisə istisna olmaqla əgər date_from verilibsə)
                if idx > 0 and ev.prev_hash != expected_prev:
                    return IntegrityVerifyResponse(
                        status="tampered",
                        checked_count=idx + 1,
                        is_tampered=True,
                        broken_event_id=str(ev.id),
                        expected_hash=expected_prev,
                        actual_hash=ev.prev_hash,
                        message=f"Audit hadisəsində ({ev.id}) zəncir qırılması aşkarlandı: prev_hash uyğunsuzluğu!",
                    )

                # 2. Cari hadisənin heşinin yenidən hesablanaraq yoxlanışı
                calculated = compute_audit_hash(
                    prev_hash=ev.prev_hash,
                    event_id=ev.id,
                    occurred_at=ev.created_at,
                    actor_id=ev.actor_id,
                    action=ev.action,
                    entity_type=ev.resource_type,
                    entity_id=ev.resource_id,
                    diff=ev.diff,
                    severity=ev.severity,
                )

                if calculated != ev.hash:
                    return IntegrityVerifyResponse(
                        status="tampered",
                        checked_count=idx + 1,
                        is_tampered=True,
                        broken_event_id=str(ev.id),
                        expected_hash=calculated,
                        actual_hash=ev.hash,
                        message=f"Audit hadisəsinin ({ev.id}) məzmununda dəyişiklik aşkarlandı: Hash uyğunsuzluğu!",
                    )

                expected_prev = ev.hash

            return IntegrityVerifyResponse(
                status="valid",
                checked_count=len(events),
                is_tampered=False,
                message=f"Bütün {len(events)} ədəd audit hadisəsinin kriptoqrafik bütövlüyü təsdiqləndi.",
            )

    async def log_export(self, actor: Any = None, filter_summary: str = "ALL") -> None:
        """Audit ixracı əməliyyatının özünü audit jurnalı kimi qeyd edir."""
        if not can_export_audit(actor):
            raise ForbiddenError("Audit jurnalını ixrac etmək hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="AUDIT_EVENTS_EXPORTED",
                resource_type="audit",
                resource_id="export",
                actor_id=actor_id,
                diff={"filters": filter_summary},
                severity="security",
            )
            await uow.commit()


_audit_service: AuditService | None = None


def get_audit_service() -> AuditService:
    global _audit_service
    if _audit_service is None:
        _audit_service = AuditService()
    return _audit_service
