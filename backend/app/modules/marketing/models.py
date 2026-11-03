"""Marketinq (Marketing), Kampaniyalar və Aksiya Mühərriki ORM Modelləri."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base, utc_now

JSONBType = JSONB().with_variant(JSON(), "sqlite")  # type: ignore[no-untyped-call]


class CampaignType(str, enum.Enum):
    SEASONAL = "SEASONAL"
    PRODUCT = "PRODUCT"
    CATEGORY = "CATEGORY"
    BRAND = "BRAND"
    BRANCH = "BRANCH"
    LOYALTY = "LOYALTY"
    PROMO_CODE = "PROMO_CODE"


class CampaignStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    SCHEDULED = "SCHEDULED"
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    ENDED = "ENDED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class PromotionType(str, enum.Enum):
    PERCENT_OFF = "PERCENT_OFF"
    FIXED_OFF = "FIXED_OFF"
    FIXED_PRICE = "FIXED_PRICE"
    BOGO = "BOGO"
    QUANTITY_TIER = "QUANTITY_TIER"
    BUNDLE = "BUNDLE"
    LOYALTY_MEMBER = "LOYALTY_MEMBER"
    RECEIPT_THRESHOLD = "RECEIPT_THRESHOLD"
    PROMO_CODE = "PROMO_CODE"


class StackingMode(str, enum.Enum):
    EXCLUSIVE = "EXCLUSIVE"
    STACKABLE_WITH_GROUPS = "STACKABLE_WITH_GROUPS"
    ALWAYS_STACK = "ALWAYS_STACK"


class PromoCodeStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    EXHAUSTED = "EXHAUSTED"
    EXPIRED = "EXPIRED"


class Campaign(Base):
    """Marketinq Kampaniyası."""

    __tablename__ = "marketing_campaigns"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    objective: Mapped[str | None] = mapped_column(String(255), nullable=True)
    type: Mapped[str] = mapped_column(
        String(50), default=CampaignType.SEASONAL.value, nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(50), default=CampaignStatus.DRAFT.value, nullable=False, index=True
    )
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    budget: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)

    target_branches: Mapped[list[Any]] = mapped_column(JSONBType, default=list, nullable=False)
    target_segments: Mapped[list[Any]] = mapped_column(JSONBType, default=list, nullable=False)
    eligibility_criteria: Mapped[dict[str, Any]] = mapped_column(
        JSONBType, default=dict, nullable=False
    )

    created_by: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    promotions: Mapped[list[Promotion]] = relationship(
        "Promotion", back_populates="campaign", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        CheckConstraint("start_date < end_date", name="chk_campaign_dates_order"),
    )


class Promotion(Base):
    """Aksiya və Endirim Qaydası (Promotions Rule)."""

    __tablename__ = "marketing_promotions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("marketing_campaigns.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)

    # Validasiya olunmuş dəqiq JSON qaydası
    rule_definition: Mapped[dict[str, Any]] = mapped_column(
        JSONBType, default=dict, nullable=False
    )

    priority: Mapped[int] = mapped_column(Integer, default=100, nullable=False, index=True)
    stacking_mode: Mapped[str] = mapped_column(
        String(30), default=StackingMode.STACKABLE_WITH_GROUPS.value, nullable=False
    )
    exclusion_groups: Mapped[list[Any]] = mapped_column(JSONBType, default=list, nullable=False)

    max_discount_per_line: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    max_discount_per_receipt: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    never_below_cost: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allow_below_cost_override: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    campaign: Mapped[Campaign | None] = relationship("Campaign", back_populates="promotions")


class PromoCode(Base):
    """Promokod (Voucher / Coupon Code)."""

    __tablename__ = "marketing_promo_codes"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("marketing_campaigns.id", ondelete="SET NULL"), nullable=True
    )
    promotion_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("marketing_promotions.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(30), default=PromoCodeStatus.ACTIVE.value, nullable=False, index=True
    )
    max_total_uses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_uses_per_customer: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    max_uses_per_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    current_uses: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    target_branches: Mapped[list[Any]] = mapped_column(JSONBType, default=list, nullable=False)
    target_segments: Mapped[list[Any]] = mapped_column(JSONBType, default=list, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    promotion: Mapped[Promotion] = relationship("Promotion")


class PromoCodeRedemption(Base):
    """Promokod İstifadə Qeydi (Atomic / Double-Redemption Safe)."""

    __tablename__ = "marketing_promo_code_redemptions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    promo_code_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("marketing_promo_codes.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True, index=True
    )
    sale_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), nullable=False, index=True
    )
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="REDEEMED", nullable=False)
    redeemed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    reversed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("promo_code_id", "sale_id", name="uq_promo_code_sale"),
    )


class MessageTemplate(Base):
    """Bildiriş Şablonu (SMS / Email / WhatsApp)."""

    __tablename__ = "marketing_message_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    channel: Mapped[str] = mapped_column(String(30), default="SMS", nullable=False)
    language: Mapped[str] = mapped_column(String(10), default="AZ", nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    body_template: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class MessageSendRequest(Base):
    """Kütləvi Bildiriş Göndəriş Sorğusu."""

    __tablename__ = "marketing_message_send_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("marketing_message_templates.id", ondelete="RESTRICT"), nullable=False
    )
    segment_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    channel: Mapped[str] = mapped_column(String(30), default="SMS", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="DRAFT", nullable=False)
    dry_run_summary: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict, nullable=False)

    created_by: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    sent_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )


class MessageDeliveryLog(Base):
    """Çatdırılma Audit Qeydi (Delivery Log)."""

    __tablename__ = "marketing_message_delivery_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    send_request_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("marketing_message_send_requests.id", ondelete="CASCADE"), nullable=False
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    recipient: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="SENT", nullable=False)
    error_message: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
