"""Müştəri Münasibətləri İdarəedilməsi (CRM) ORM Modelləri."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base, utc_now

JSONBType = JSONB().with_variant(JSON(), "sqlite")  # type: ignore[no-untyped-call]


class CustomerStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    BLOCKED = "BLOCKED"
    ANONYMIZED = "ANONYMIZED"


class ConsentPurpose(str, enum.Enum):
    MARKETING_SMS = "marketing_sms"
    MARKETING_EMAIL = "marketing_email"
    MARKETING_WHATSAPP = "marketing_whatsapp"
    PROFILING = "profiling"
    LOYALTY_TERMS = "loyalty_terms"


class ConsentStatus(str, enum.Enum):
    GRANTED = "GRANTED"
    WITHDRAWN = "WITHDRAWN"


class ConsentSource(str, enum.Enum):
    POS = "POS"
    WEB_FORM = "WEB_FORM"
    IMPORT = "IMPORT"
    ADMIN = "ADMIN"


class PrivacyRequestType(str, enum.Enum):
    EXPORT = "EXPORT"
    ERASURE = "ERASURE"


class PrivacyRequestStatus(str, enum.Enum):
    RECEIVED = "RECEIVED"
    VERIFIED = "VERIFIED"
    PROCESSED = "PROCESSED"
    REJECTED = "REJECTED"


class Customer(Base):
    """Müştəri Məlumatı (Customer Profile)."""

    __tablename__ = "crm_customers"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    customer_no: Mapped[str] = mapped_column(
        String(50), nullable=False, unique=True, index=True
    )
    full_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(
        String(50), nullable=True, unique=True, index=True
    )
    email: Mapped[str | None] = mapped_column(
        String(255), nullable=True, unique=True, index=True
    )
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    preferred_language: Mapped[str] = mapped_column(String(10), default="AZ", nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), default=CustomerStatus.ACTIVE.value, nullable=False, index=True
    )
    source_branch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Təkrarlanan profillərin birləşdirilməsi (Tombstone Alias)
    is_tombstone: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    merged_into_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("crm_customers.id", ondelete="SET NULL"), nullable=True
    )

    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Aqreqat göstəricilər (Satış hadisələrindən dərhal və ya recompute ilə yenilənir)
    total_spent: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00"), nullable=False
    )
    order_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    average_order_value: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00"), nullable=False
    )
    last_purchase_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    first_purchase_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    return_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    return_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00"), nullable=False
    )
    preferred_categories: Mapped[list[Any]] = mapped_column(
        JSONBType, default=list, nullable=False
    )
    preferred_sizes: Mapped[list[Any]] = mapped_column(
        JSONBType, default=list, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    consents: Mapped[list[CustomerConsentRecord]] = relationship(
        "CustomerConsentRecord", back_populates="customer", cascade="all, delete-orphan", lazy="selectin"
    )


class CustomerConsentRecord(Base):
    """Müştəri Razılıq Tarixçəsi (Append-Only Consent Ledger)."""

    __tablename__ = "crm_consent_records"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("crm_customers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    purpose: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(20), default=ConsentStatus.GRANTED.value, nullable=False
    )
    channel_source: Mapped[str] = mapped_column(
        String(50), default=ConsentSource.POS.value, nullable=False
    )
    policy_version: Mapped[str] = mapped_column(String(50), default="1.0", nullable=False)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False, index=True
    )

    customer: Mapped[Customer] = relationship("Customer", back_populates="consents")

    __table_args__ = (
        Index("ix_crm_consent_customer_purpose", "customer_id", "purpose", "timestamp"),
    )


class CustomerSegment(Base):
    """Müştəri Seqmenti (Qayda Ağacı Əsaslı Qrup)."""

    __tablename__ = "crm_segments"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    type: Mapped[str] = mapped_column(String(20), default="DYNAMIC", nullable=False)
    rule_tree: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict, nullable=False)
    member_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_refreshed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class SegmentMembership(Base):
    """Seqment Üzvlüklərinin Anlıq Görüntüsü (Membership Snapshot)."""

    __tablename__ = "crm_segment_memberships"

    segment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("crm_segments.id", ondelete="CASCADE"), primary_key=True
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("crm_customers.id", ondelete="CASCADE"), primary_key=True
    )
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )


class CustomerPrivacyRequest(Base):
    """Məlumat Subyektinin Məxfilik Sorğusu (GDPR / Data Subject Request)."""

    __tablename__ = "crm_privacy_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("crm_customers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    request_type: Mapped[str] = mapped_column(
        String(30), default=PrivacyRequestType.EXPORT.value, nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(30), default=PrivacyRequestStatus.RECEIVED.value, nullable=False
    )
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    legal_hold_flag: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sla_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    processed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
