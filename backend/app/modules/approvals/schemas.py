"""Təsdiqləmə Mühərriki Sxemləri (Approval Engine Pydantic Schemas)."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ApprovalRuleCreate(BaseModel):
    """Yeni təsdiqləmə qaydası yaratma sxemi."""

    model_config = ConfigDict(extra="forbid")

    document_type: str = Field(..., max_length=50)
    branch_id: uuid.UUID | None = None
    min_amount: Decimal = Field(default=Decimal("0.0000"), ge=0)
    max_amount: Decimal | None = Field(default=None, ge=0)
    level: int = Field(default=1, ge=1)
    required_role: str | None = Field(default=None, max_length=50)
    required_permission: str | None = Field(default=None, max_length=100)
    is_active: bool = True
    description: str | None = Field(default=None, max_length=255)


class ApprovalRuleResponse(BaseModel):
    """Təsdiqləmə qaydası cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    document_type: str
    branch_id: uuid.UUID | None = None
    min_amount: Decimal
    max_amount: Decimal | None = None
    level: int
    required_role: str | None = None
    required_permission: str | None = None
    is_active: bool
    description: str | None = None
    created_at: datetime
    updated_at: datetime


class ApprovalStepResponse(BaseModel):
    """Təsdiqləmə addımı cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    level: int
    required_role: str | None = None
    required_permission: str | None = None
    status: str
    decided_by_id: uuid.UUID | None = None
    delegated_from_user_id: uuid.UUID | None = None
    decision_reason: str | None = None
    decided_at: datetime | None = None


class ApprovalHistoryResponse(BaseModel):
    """Təsdiqləmə tarixçəsi qeydi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    action: str
    actor_id: uuid.UUID | None = None
    level: int | None = None
    reason: str | None = None
    created_at: datetime


class ApprovalRequestResponse(BaseModel):
    """Təsdiqləmə sorğusu tam cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    document_type: str
    document_id: uuid.UUID
    requester_id: uuid.UUID
    branch_id: uuid.UUID | None = None
    amount: Decimal
    current_level: int
    total_levels: int
    status: str
    notes: str | None = None
    steps: list[ApprovalStepResponse] = []
    history: list[ApprovalHistoryResponse] = []
    created_at: datetime
    updated_at: datetime


class ApprovalDecisionRequest(BaseModel):
    """Təsdiqləmə və ya imtina qərarı sorğusu."""

    model_config = ConfigDict(extra="forbid")

    decision: Literal["APPROVE", "REJECT", "RETURN"]
    reason: str | None = Field(
        default=None, max_length=1000, description="İmtina və ya geri qaytarmada mütləqdir"
    )
    delegated_from_user_id: uuid.UUID | None = None

