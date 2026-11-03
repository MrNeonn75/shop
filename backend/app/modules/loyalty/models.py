"""Loyallıq (Loyalty) Proqramı ORM Modelləri."""

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
    Index,
    Integer,
    Numeric,
    String,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base, utc_now

JSONBType = JSONB().with_variant(JSON(), "sqlite")  # type: ignore[no-untyped-call]


class LoyaltyEntryType(str, enum.Enum):
    EARN = "EARN"
    REDEEM = "REDEEM"
    EXPIRE = "EXPIRE"
    REVERSE_EARN = "REVERSE_EARN"
    RESTORE_REDEEM = "RESTORE_REDEEM"
    ADJUST = "ADJUST"
    BONUS = "BONUS"


class RewardType(str, enum.Enum):
    DISCOUNT_VOUCHER = "DISCOUNT_VOUCHER"
    FREE_ITEM = "FREE_ITEM"


class LoyaltyProgram(Base):
    """Versiyalaşdırılmış və Qüvvədə Olma Tarixli Loyallıq Proqramı."""

    __tablename__ = "loyalty_programs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    effective_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    effective_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Qaydalar strukturu (JSON Schema tərəfindən idarə olunur)
    earn_rules: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict, nullable=False)
    redemption_rules: Mapped[dict[str, Any]] = mapped_column(
        JSONBType, default=dict, nullable=False
    )
    tier_rules: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict, nullable=False)
    expiry_rules: Mapped[dict[str, Any]] = mapped_column(JSONBType, default=dict, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class LoyaltyCustomerSummary(Base):
    """Müştərinin Loyallıq Balansı və Cari Səviyyəsi (Row-Lockable)."""

    __tablename__ = "loyalty_customer_summaries"

    customer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True
    )
    current_tier: Mapped[str] = mapped_column(String(50), default="Bronze", nullable=False)
    tier_valid_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rolling_spend: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00"), nullable=False
    )
    available_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    lifetime_earned_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    lifetime_redeemed_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    __table_args__ = (
        CheckConstraint("available_points >= 0", name="chk_loyalty_available_points_non_negative"),
    )


class LoyaltyLedgerEntry(Base):
    """Müştəri Loyallıq Jurnalı (APPEND-ONLY FIFO Qalıq Partiyaları)."""

    __tablename__ = "loyalty_ledger"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), nullable=False, index=True
    )
    entry_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True, index=True
    )
    program_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    remaining_lot_points: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False, index=True
    )

    __table_args__ = (
        Index("ix_loyalty_ledger_fifo", "customer_id", "entry_type", "expires_at", "remaining_lot_points"),
    )


class LoyaltyTierHistory(Base):
    """Müştərinin Səviyyə Dəyişikliyi Audit Tarixçəsi."""

    __tablename__ = "loyalty_tier_history"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), nullable=False, index=True
    )
    old_tier: Mapped[str] = mapped_column(String(50), nullable=False)
    new_tier: Mapped[str] = mapped_column(String(50), nullable=False)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )


class LoyaltyReward(Base):
    """Mükafatlar Kataloqu (Rewards Catalog)."""

    __tablename__ = "loyalty_rewards"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    points_cost: Mapped[int] = mapped_column(Integer, nullable=False)
    reward_type: Mapped[str] = mapped_column(
        String(30), default=RewardType.DISCOUNT_VOUCHER.value, nullable=False
    )
    benefit_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    stock_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    redeemed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    valid_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class LoyaltyRewardRedemption(Base):
    """Mükafat Dəyişdirilməsi və Generasiya Edilmiş Vauçer."""

    __tablename__ = "loyalty_reward_redemptions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), nullable=False, index=True
    )
    reward_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("loyalty_rewards.id", ondelete="RESTRICT"), nullable=False
    )
    voucher_code: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )
    points_spent: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="ACTIVE", nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    used_in_sale_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    reward: Mapped[LoyaltyReward] = relationship("LoyaltyReward")

