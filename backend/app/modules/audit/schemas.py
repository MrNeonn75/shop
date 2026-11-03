"""Audit Modulu Sxemləri (Audit DTOs)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class AuditEventResponse(BaseModel):
    """Audit hadisəsi cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    occurred_at: datetime = Field(alias="created_at")
    actor_id: uuid.UUID | None
    actor_session_id: uuid.UUID | None
    branch_id: uuid.UUID | None
    module: str
    resource_type: str
    resource_id: str
    action: str
    diff: dict[str, Any] | None
    reason: str | None
    actor_ip: str | None
    user_agent: str | None
    correlation_id: str
    severity: str
    prev_hash: str
    hash: str


class EntityTimelineEvent(BaseModel):
    """Obyektin tarixçəsində tək bir hadisə."""

    id: uuid.UUID
    occurred_at: datetime
    action: str
    actor_id: uuid.UUID | None
    actor_ip: str | None
    diff: dict[str, Any] | None
    reason: str | None
    correlation_id: str
    severity: str


class EntityTimelineResponse(BaseModel):
    """Obyektin tam xronoloji tarixçəsi."""

    entity_type: str
    entity_id: str
    total_events: int
    events: list[EntityTimelineEvent]


class IntegrityVerifyResponse(BaseModel):
    """Audit bütövlüyü yoxlanışı nəticəsi."""

    status: Literal["valid", "tampered"]
    checked_count: int
    is_tampered: bool
    broken_event_id: str | None = None
    expected_hash: str | None = None
    actual_hash: str | None = None
    message: str
