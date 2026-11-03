"""CRM Modulu Pydantic Sxemləri (Schemas)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.modules.crm.models import (
    ConsentPurpose,
    ConsentSource,
    ConsentStatus,
    CustomerStatus,
    PrivacyRequestType,
)


class ConsentInput(BaseModel):
    purpose: ConsentPurpose
    status: ConsentStatus = ConsentStatus.GRANTED
    channel_source: ConsentSource = ConsentSource.POS
    policy_version: str = "1.0"


class CustomerCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    phone: str | None = None
    email: EmailStr | None = None
    birth_date: date | None = None
    gender: str | None = Field(default=None, max_length=20)
    preferred_language: str = Field(default="AZ", max_length=10)
    source_branch_id: uuid.UUID | None = None
    notes: str | None = None
    consents: list[ConsentInput] = Field(default_factory=list)


class QuickCustomerCreate(BaseModel):
    """Kassada sürətli müştəri qeydiyyatı (Ad + Telefon + Razılıq)."""

    full_name: str = Field(min_length=2, max_length=200)
    phone: str = Field(min_length=7, max_length=50)
    email: EmailStr | None = None
    source_branch_id: uuid.UUID | None = None
    marketing_sms_consent: bool = True
    marketing_email_consent: bool = False


class CustomerUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=200)
    email: EmailStr | None = None
    birth_date: date | None = None
    gender: str | None = None
    preferred_language: str | None = None
    status: CustomerStatus | None = None
    notes: str | None = None


class CustomerResponse(BaseModel):
    id: uuid.UUID
    customer_no: str
    full_name: str
    phone: str | None = None  # Maskalanmış
    email: str | None = None  # Maskalanmış
    birth_date: date | None = None
    gender: str | None = None
    preferred_language: str
    status: str
    source_branch_id: uuid.UUID | None = None
    notes: str | None = None
    is_tombstone: bool
    merged_into_id: uuid.UUID | None = None
    total_spent: Decimal
    order_count: int
    average_order_value: Decimal
    last_purchase_date: datetime | None = None
    first_purchase_date: datetime | None = None
    return_count: int
    return_amount: Decimal
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CustomerDetailResponse(CustomerResponse):
    """Açıq həssas PII məlumatları ilə birlikdə (crm.pii.view tələb olunur)."""

    raw_phone: str | None = None
    raw_email: str | None = None
    consents: list[ConsentRecordResponse] = Field(default_factory=list)


class CustomerDuplicateCandidate(BaseModel):
    customer: CustomerResponse
    match_reasons: list[str]


class CustomerMergeRequest(BaseModel):
    winner_customer_id: uuid.UUID
    loser_customer_id: uuid.UUID
    audit_reason: str = Field(min_length=5, max_length=500)


class CustomerMergePreviewResponse(BaseModel):
    winner_customer_id: uuid.UUID
    loser_customer_id: uuid.UUID
    sales_to_transfer: int
    loyalty_points_to_transfer: int
    consents_to_transfer: int
    warnings: list[str] = Field(default_factory=list)


class ConsentRecordCreate(BaseModel):
    customer_id: uuid.UUID
    purpose: ConsentPurpose
    status: ConsentStatus
    channel_source: ConsentSource = ConsentSource.ADMIN
    policy_version: str = "1.0"


class ConsentRecordResponse(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    purpose: str
    status: str
    channel_source: str
    policy_version: str
    actor_id: uuid.UUID | None = None
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)


class SegmentCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str | None = None
    type: str = "DYNAMIC"
    rule_tree: dict[str, Any] = Field(default_factory=dict)


class SegmentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    rule_tree: dict[str, Any] | None = None


class SegmentResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    type: str
    rule_tree: dict[str, Any]
    member_count: int
    last_refreshed_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SegmentPreviewRequest(BaseModel):
    rule_tree: dict[str, Any]


class SegmentPreviewResponse(BaseModel):
    matched_count: int
    sample_customers: list[CustomerResponse]


class PrivacyRequestCreate(BaseModel):
    customer_id: uuid.UUID
    request_type: PrivacyRequestType = PrivacyRequestType.ERASURE
    reason: str | None = None


class PrivacyRequestResponse(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    request_type: str
    status: str
    reason: str | None = None
    legal_hold_flag: bool
    sla_deadline: datetime
    processed_by: uuid.UUID | None = None
    processed_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
