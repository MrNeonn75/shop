"""Compliance outbox / domain event helpers."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.events import DomainEvent
from app.shared.outbox import record_outbox_event


class ComplianceRulesChangedEvent(DomainEvent):
    def __init__(
        self,
        *,
        domain: str,
        pack_version_id: uuid.UUID | None = None,
        rule_ids: list[str] | None = None,
        reason: str = "changed",
    ) -> None:
        super().__init__(
            event_type="compliance.rules.changed",
            aggregate_type="compliance_domain",
            aggregate_id=domain,
            payload={
                "domain": domain,
                "pack_version_id": str(pack_version_id) if pack_version_id else None,
                "rule_ids": rule_ids or [],
                "reason": reason,
            },
        )


class ComplianceRulesInvalidatedEvent(DomainEvent):
    def __init__(
        self,
        *,
        domains: list[str] | None = None,
        reason: str = "invalidate",
    ) -> None:
        super().__init__(
            event_type="compliance.rules.invalidated",
            aggregate_type="compliance_cache",
            aggregate_id="rules_cache",
            payload={
                "domains": domains or [],
                "reason": reason,
            },
        )


class CompliancePackActivatedEvent(DomainEvent):
    def __init__(
        self,
        *,
        pack_id: uuid.UUID,
        pack_version_id: uuid.UUID,
        domain: str,
        effective_from: datetime,
        banner_unverified: bool,
        activated_by: uuid.UUID | None,
    ) -> None:
        super().__init__(
            event_type="compliance.pack.activated",
            aggregate_type="rule_pack",
            aggregate_id=str(pack_id),
            payload={
                "pack_id": str(pack_id),
                "pack_version_id": str(pack_version_id),
                "domain": domain,
                "effective_from": effective_from.isoformat(),
                "banner_unverified": banner_unverified,
                "activated_by": str(activated_by) if activated_by else None,
            },
        )


class ComplianceObligationDueEvent(DomainEvent):
    def __init__(
        self,
        *,
        obligation_id: uuid.UUID,
        title_az: str,
        next_due: date | None,
        owner_user_id: uuid.UUID | None,
    ) -> None:
        super().__init__(
            event_type="compliance.obligation.due",
            aggregate_type="obligation",
            aggregate_id=str(obligation_id),
            payload={
                "obligation_id": str(obligation_id),
                "title_az": title_az,
                "next_due": next_due.isoformat() if next_due else None,
                "owner_user_id": str(owner_user_id) if owner_user_id else None,
            },
        )


async def publish_rules_changed(
    session: AsyncSession,
    *,
    domain: str,
    pack_version_id: uuid.UUID | None = None,
    rule_ids: list[str] | None = None,
    reason: str = "changed",
) -> None:
    await record_outbox_event(
        session,
        ComplianceRulesChangedEvent(
            domain=domain,
            pack_version_id=pack_version_id,
            rule_ids=rule_ids,
            reason=reason,
        ),
    )


async def publish_rules_invalidated(
    session: AsyncSession,
    *,
    domains: list[str] | None = None,
    reason: str = "invalidate",
) -> None:
    await record_outbox_event(
        session,
        ComplianceRulesInvalidatedEvent(domains=domains, reason=reason),
    )


async def publish_pack_activated(
    session: AsyncSession,
    *,
    pack_id: uuid.UUID,
    pack_version_id: uuid.UUID,
    domain: str,
    effective_from: datetime,
    banner_unverified: bool,
    activated_by: uuid.UUID | None,
) -> None:
    await record_outbox_event(
        session,
        CompliancePackActivatedEvent(
            pack_id=pack_id,
            pack_version_id=pack_version_id,
            domain=domain,
            effective_from=effective_from,
            banner_unverified=banner_unverified,
            activated_by=activated_by,
        ),
    )


async def publish_obligation_due(
    session: AsyncSession,
    *,
    obligation_id: uuid.UUID,
    title_az: str,
    next_due: date | None,
    owner_user_id: uuid.UUID | None,
) -> None:
    await record_outbox_event(
        session,
        ComplianceObligationDueEvent(
            obligation_id=obligation_id,
            title_az=title_az,
            next_due=next_due,
            owner_user_id=owner_user_id,
        ),
    )


def serialize_model_snapshot(obj: Any, fields: list[str]) -> dict[str, Any]:
    """Shallow JSON-safe snapshot for before/after event payloads."""
    out: dict[str, Any] = {}
    for f in fields:
        val = getattr(obj, f, None)
        if isinstance(val, uuid.UUID):
            out[f] = str(val)
        elif isinstance(val, datetime | date):
            out[f] = val.isoformat()
        else:
            out[f] = val
    return out
