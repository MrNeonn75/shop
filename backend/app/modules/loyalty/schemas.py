"""Loyallıq (Loyalty) Modulu Pydantic Sxemləri."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.modules.loyalty.models import RewardType


class LoyaltyProgramCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    effective_from: datetime | None = None
    effective_to: datetime | None = None
    earn_rules: dict[str, Any] = Field(
        default_factory=lambda: {
            "points_per_azn": 1,
            "category_multipliers": {},
            "exclude_discounted_items": False,
        }
    )
    redemption_rules: dict[str, Any] = Field(
        default_factory=lambda: {
            "point_value_azn": "0.01",  # 100 xal = 1 AZN
            "min_points_to_redeem": 100,
            "max_receipt_percent": 50,  # qəbzin maksimum 50%-i
        }
    )
    tier_rules: dict[str, Any] = Field(
        default_factory=lambda: {
            "rolling_window_days": 365,
            "tiers": [
                {"name": "Bronze", "threshold_spend": 0, "earn_multiplier": 1.0},
                {"name": "Silver", "threshold_spend": 500, "earn_multiplier": 1.2},
                {"name": "Gold", "threshold_spend": 2000, "earn_multiplier": 1.5},
                {"name": "Platinum", "threshold_spend": 5000, "earn_multiplier": 2.0},
            ],
        }
    )
    expiry_rules: dict[str, Any] = Field(
        default_factory=lambda: {
            "lot_expiry_days": 365,
        }
    )


class LoyaltyProgramResponse(BaseModel):
    id: uuid.UUID
    name: str
    version: int
    is_active: bool
    effective_from: datetime
    effective_to: datetime | None = None
    earn_rules: dict[str, Any]
    redemption_rules: dict[str, Any]
    tier_rules: dict[str, Any]
    expiry_rules: dict[str, Any]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LoyaltyCustomerSummaryResponse(BaseModel):
    customer_id: uuid.UUID
    current_tier: str
    tier_valid_until: datetime | None = None
    rolling_spend: Decimal
    available_points: int
    lifetime_earned_points: int
    lifetime_redeemed_points: int
    version: int
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LoyaltyLedgerEntryResponse(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    entry_type: str
    points: int
    source_type: str
    source_id: uuid.UUID | None = None
    program_version: int
    expires_at: datetime | None = None
    remaining_lot_points: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LoyaltyRedeemPreviewRequest(BaseModel):
    customer_id: uuid.UUID
    points_to_redeem: int = Field(gt=0)
    receipt_subtotal: Decimal = Field(gt=Decimal("0.00"))


class LoyaltyRedeemPreviewResponse(BaseModel):
    allowed: bool
    points_to_redeem: int
    discount_amount: Decimal
    available_points: int
    reason: str | None = None


class LoyaltyManualAdjustmentRequest(BaseModel):
    customer_id: uuid.UUID
    points: int = Field(description="Müsbət (əlavə) və ya mənfi (tutulma) xal")
    reason: str = Field(min_length=5, max_length=255)
    notes: str | None = None


class LoyaltyRewardCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str | None = None
    points_cost: int = Field(gt=0)
    reward_type: RewardType = RewardType.DISCOUNT_VOUCHER
    benefit_value: Decimal = Field(gt=Decimal("0.00"))
    stock_limit: int | None = None
    valid_days: int = Field(default=30, ge=1, le=365)


class LoyaltyRewardResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    points_cost: int
    reward_type: str
    benefit_value: Decimal
    stock_limit: int | None = None
    redeemed_count: int
    valid_days: int
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LoyaltyRewardRedemptionResponse(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    reward_id: uuid.UUID
    voucher_code: str
    points_spent: int
    status: str
    expires_at: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
