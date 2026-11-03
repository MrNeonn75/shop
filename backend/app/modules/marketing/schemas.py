"""Marketinq (Marketing) Modulu Pydantic Sxemləri."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.modules.marketing.models import (
    CampaignType,
    PromotionType,
    StackingMode,
)

# ==========================================
# 1. CAMPAIGNS
# ==========================================


class CampaignCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    objective: str | None = None
    type: CampaignType = CampaignType.SEASONAL
    start_date: datetime
    end_date: datetime
    budget: Decimal | None = None
    target_branches: list[uuid.UUID] = Field(default_factory=list)
    target_segments: list[uuid.UUID] = Field(default_factory=list)
    eligibility_criteria: dict[str, Any] = Field(default_factory=dict)


class CampaignUpdate(BaseModel):
    name: str | None = None
    objective: str | None = None
    budget: Decimal | None = None
    target_branches: list[uuid.UUID] | None = None
    target_segments: list[uuid.UUID] | None = None
    eligibility_criteria: dict[str, Any] | None = None


class CampaignResponse(BaseModel):
    id: uuid.UUID
    name: str
    objective: str | None = None
    type: str
    status: str
    start_date: datetime
    end_date: datetime
    budget: Decimal | None = None
    target_branches: list[uuid.UUID]
    target_segments: list[uuid.UUID]
    eligibility_criteria: dict[str, Any]
    created_by: uuid.UUID
    approved_by: uuid.UUID | None = None
    approved_at: datetime | None = None
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# 2. PROMOTIONS
# ==========================================


class PromotionRuleCreate(BaseModel):
    campaign_id: uuid.UUID | None = None
    name: str = Field(min_length=2, max_length=150)
    description: str | None = None
    type: PromotionType
    rule_definition: dict[str, Any] = Field(default_factory=dict)
    priority: int = 100
    stacking_mode: StackingMode = StackingMode.STACKABLE_WITH_GROUPS
    exclusion_groups: list[str] = Field(default_factory=list)
    max_discount_per_line: Decimal | None = None
    max_discount_per_receipt: Decimal | None = None
    never_below_cost: bool = True
    allow_below_cost_override: bool = False
    start_date: datetime | None = None
    end_date: datetime | None = None


class PromotionRuleResponse(BaseModel):
    id: uuid.UUID
    campaign_id: uuid.UUID | None = None
    name: str
    description: str | None = None
    type: str
    rule_definition: dict[str, Any]
    priority: int
    stacking_mode: str
    exclusion_groups: list[str]
    max_discount_per_line: Decimal | None = None
    max_discount_per_receipt: Decimal | None = None
    never_below_cost: bool
    allow_below_cost_override: bool
    is_active: bool
    start_date: datetime | None = None
    end_date: datetime | None = None
    version: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# 3. PROMO CODES
# ==========================================


class PromoCodeCreate(BaseModel):
    code: str | None = None  # None olarsa, avtomatik təhlükəsiz kod generasiya edilir
    campaign_id: uuid.UUID | None = None
    promotion_id: uuid.UUID
    max_total_uses: int | None = None
    max_uses_per_customer: int = 1
    max_uses_per_day: int | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    target_branches: list[uuid.UUID] = Field(default_factory=list)
    target_segments: list[uuid.UUID] = Field(default_factory=list)


class BulkPromoCodeGenerateRequest(BaseModel):
    count: int = Field(ge=1, le=1000)
    prefix: str = Field(default="PROMO", max_length=10)
    length: int = Field(default=8, ge=6, le=16)
    campaign_id: uuid.UUID | None = None
    promotion_id: uuid.UUID
    max_total_uses: int | None = 1
    max_uses_per_customer: int = 1
    start_date: datetime | None = None
    end_date: datetime | None = None


class PromoCodeResponse(BaseModel):
    id: uuid.UUID
    code: str
    campaign_id: uuid.UUID | None = None
    promotion_id: uuid.UUID
    status: str
    max_total_uses: int | None = None
    max_uses_per_customer: int
    max_uses_per_day: int | None = None
    current_uses: int
    start_date: datetime | None = None
    end_date: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# 4. SIMULATOR & QUOTE INTEGRATION
# ==========================================


class CartItemSimulationInput(BaseModel):
    variant_id: uuid.UUID
    product_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    brand_id: uuid.UUID | None = None
    unit_price: Decimal
    cost_price: Decimal = Decimal("0.00")
    quantity: int = 1


class SimulatorRequest(BaseModel):
    branch_id: uuid.UUID
    customer_id: uuid.UUID | None = None
    customer_tier: str | None = None
    promo_code: str | None = None
    at_time: datetime | None = None
    items: list[CartItemSimulationInput] = Field(min_length=1)


class LineDiscountExplanation(BaseModel):
    promotion_id: uuid.UUID | None = None
    promotion_name: str
    rule_type: str
    discount_amount: Decimal
    reason: str


class SimulatedLineResult(BaseModel):
    variant_id: uuid.UUID
    quantity: int
    unit_price: Decimal
    gross_amount: Decimal
    discount_amount: Decimal
    net_amount: Decimal
    cost_price: Decimal
    discounts_applied: list[LineDiscountExplanation] = Field(default_factory=list)
    discounts_rejected: list[dict[str, str]] = Field(default_factory=list)


class SimulatorResponse(BaseModel):
    subtotal: Decimal
    discount_total: Decimal
    net_subtotal: Decimal
    promo_code_applied: str | None = None
    items: list[SimulatedLineResult]
    receipt_promotions: list[LineDiscountExplanation] = Field(default_factory=list)


# ==========================================
# 5. COMMUNICATIONS
# ==========================================


class MessageTemplateCreate(BaseModel):
    channel: str = "SMS"
    language: str = "AZ"
    name: str = Field(min_length=2, max_length=100)
    body_template: str = Field(min_length=5)


class MessageTemplateResponse(BaseModel):
    id: uuid.UUID
    channel: str
    language: str
    name: str
    body_template: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MessageSendRequestCreate(BaseModel):
    template_id: uuid.UUID
    segment_id: uuid.UUID | None = None
    channel: str = "SMS"


class MessageSendRequestResponse(BaseModel):
    id: uuid.UUID
    template_id: uuid.UUID
    segment_id: uuid.UUID | None = None
    channel: str
    status: str
    dry_run_summary: dict[str, Any]
    sent_count: int
    created_by: uuid.UUID
    approved_by: uuid.UUID | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
