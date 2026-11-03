"""Bildirişlər Modulu Sxemləri (Pydantic Schemas)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class NotificationResponse(BaseModel):
    """İstifadəçi bildirişinin təqdimat sxemi."""

    id: uuid.UUID
    recipient_user_id: uuid.UUID
    category: str
    severity: str
    title: str
    body: str
    deep_link: str | None = None
    source_event_id: uuid.UUID | None = None
    dedupe_key: str | None = None
    group_key: str | None = None
    branch_id: uuid.UUID | None = None
    read_at: datetime | None = None
    snoozed_until: datetime | None = None
    archived_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationCountResponse(BaseModel):
    """Oxunmamış və kritik bildirişlərin say xülasəsi."""

    unread_count: int
    critical_count: int


class NotificationSnoozeRequest(BaseModel):
    """Bildirişin müəyyən müddətə ertələnməsi (snooze)."""

    snooze_until: datetime = Field(..., description="Ertələnmə vaxtı (UTC)")


class NotificationPreferenceResponse(BaseModel):
    """İstifadəçinin bildiriş tənzimləmələri."""

    user_id: uuid.UUID
    channels_enabled: dict[str, bool]
    muted_categories: list[str]
    quiet_hours_start: str | None = None
    quiet_hours_end: str | None = None
    daily_digest: bool
    language: str

    model_config = {"from_attributes": True}


class NotificationPreferenceUpdateRequest(BaseModel):
    """İstifadəçinin bildiriş tənzimləmələrini yeniləmə sorğusu."""

    channels_enabled: dict[str, bool] | None = None
    muted_categories: list[str] | None = None
    quiet_hours_start: str | None = None
    quiet_hours_end: str | None = None
    daily_digest: bool | None = None
    language: str | None = None


class NotificationRuleResponse(BaseModel):
    """Bildiriş qaydasının təfərrüatları."""

    id: uuid.UUID
    name: str
    category: str
    event_type: str
    condition: dict[str, Any]
    channels: list[str]
    severity: str
    recipient_type: str
    recipient_target: str | None = None
    branch_scope: str
    target_branch_id: uuid.UUID | None = None
    escalate_after_minutes: int | None = None
    escalation_role: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationRuleCreateRequest(BaseModel):
    """Yeni bildiriş qaydasının yaradılması."""

    name: str = Field(..., max_length=100)
    category: str = Field(..., max_length=50)
    event_type: str = Field(..., max_length=100)
    condition: dict[str, Any] = Field(default_factory=dict)
    channels: list[str] = Field(default_factory=lambda: ["IN_APP"])
    severity: str = Field(default="info")
    recipient_type: str = Field(default="ROLE")
    recipient_target: str | None = None
    branch_scope: str = Field(default="SAME_BRANCH")
    target_branch_id: uuid.UUID | None = None
    escalate_after_minutes: int | None = None
    escalation_role: str | None = None
    is_active: bool = True


class NotificationRuleUpdateRequest(BaseModel):
    """Mövcud bildiriş qaydasının redaktəsi."""

    name: str | None = None
    condition: dict[str, Any] | None = None
    channels: list[str] | None = None
    severity: str | None = None
    recipient_type: str | None = None
    recipient_target: str | None = None
    branch_scope: str | None = None
    target_branch_id: uuid.UUID | None = None
    escalate_after_minutes: int | None = None
    escalation_role: str | None = None
    is_active: bool | None = None


class NotificationRuleEvaluateRequest(BaseModel):
    """Qaydanı test simulyasiyası ilə yoxlama sorğusu."""

    event_type: str
    payload: dict[str, Any]
    branch_id: uuid.UUID | None = None


class NotificationRuleEvaluateResponse(BaseModel):
    """Qaydanın test simulyasiyası nəticəsi."""

    matched_rules: list[str]
    resolved_recipients_count: int
    target_channels: list[str]
    sample_notification: dict[str, Any] | None = None


class ApprovalsInboxItem(BaseModel):
    """Təsdiq gözləyən əməliyyat obyekti."""

    id: str
    type: str = Field(..., description="PURCHASE_REQUEST | PURCHASE_ORDER | TRANSFER | EXPENSE | LEAVE | PAYROLL | PROMOTION")
    title: str
    requester_name: str | None = None
    branch_id: str | None = None
    amount: str | None = None
    currency: str | None = None
    created_at: str
    deep_link: str


class ApprovalsInboxSummary(BaseModel):
    """İstifadəçinin təsdiq gözləyən bütün sənədlərinin xülasəsi (Sidebar badge-ləri üçün)."""

    total_pending: int
    counts_by_type: dict[str, int]
    items: list[ApprovalsInboxItem]

