"""Biznes İntellekti və Analitika Şemaları (Analytics Schemas)."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class DashboardCompareMode(str, enum.Enum):
    PREV_PERIOD = "prev_period"
    PREV_YEAR = "prev_year"


class SalesTargetCreate(BaseModel):
    branch_id: uuid.UUID | None = None
    year: int = Field(..., ge=2020, le=2050)
    month: int = Field(..., ge=1, le=12)
    target_amount: Decimal = Field(..., ge=Decimal("0.00"))
    target_units: int = Field(default=0, ge=0)
    notes: str | None = None


class SalesTargetUpdate(BaseModel):
    target_amount: Decimal | None = Field(default=None, ge=Decimal("0.00"))
    target_units: int | None = Field(default=None, ge=0)
    notes: str | None = None


class SalesTargetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    branch_id: uuid.UUID | None = None
    year: int
    month: int
    target_amount: Decimal
    target_units: int
    version: int
    status: str
    created_by: uuid.UUID | None = None
    approved_by: uuid.UUID | None = None
    approved_at: datetime | None = None
    notes: str | None = None
    created_at: datetime


class ChartAnnotationCreate(BaseModel):
    series_name: str
    annotation_date: date
    note: str = Field(..., min_length=2, max_length=500)
    category: str = "MANAGER_NOTE"
    campaign_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None


class ChartAnnotationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    series_name: str
    annotation_date: date
    note: str
    category: str
    campaign_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    created_at: datetime


# =========================================================================
# DASHBOARD SCHEMAS
# =========================================================================


class DashboardKPIWidget(BaseModel):
    definition_id: str
    label: str
    current_value: Decimal | None
    compare_value: Decimal | None = None
    delta: Decimal | None = None
    delta_percent: Decimal | None = None
    unit: str
    state: str
    sparkline: list[Decimal] = Field(default_factory=list)
    missing_inputs: list[str] = Field(default_factory=list)


class DashboardResponse(BaseModel):
    data_as_of: datetime
    branch_ids: list[uuid.UUID] = Field(default_factory=list)
    kpis: list[DashboardKPIWidget]
    widgets: dict[str, Any] = Field(default_factory=dict)


# =========================================================================
# BUSINESS INTELLIGENCE (BI) SCHEMAS
# =========================================================================


class PerformanceTargetItem(BaseModel):
    branch_id: uuid.UUID | None
    branch_name: str
    year: int
    month: int
    target_amount: Decimal
    actual_sales: Decimal
    achievement_percent: Decimal
    status: str


class PerformanceAnalyticsResponse(BaseModel):
    overall_growth_percent: Decimal
    branch_ranking: list[dict[str, Any]]
    targets_vs_actuals: list[PerformanceTargetItem]
    data_as_of: datetime


class ReorderSuggestionItem(BaseModel):
    sku: str
    product_name: str
    current_on_hand: int
    in_transit: int
    daily_velocity: Decimal
    lead_time_days: int
    safety_stock: int
    suggested_quantity: int
    formula_text: str = Field(
        default="(Daily Velocity * Lead Time) + Safety Stock - On Hand - In Transit"
    )
    status_label: str = "SUGGESTION"


class MarkdownCandidateItem(BaseModel):
    sku: str
    product_name: str
    on_hand: int
    sell_through_percent: Decimal
    days_of_inventory: Decimal
    markdown_reason: str


class InventoryIntelligenceResponse(BaseModel):
    average_days_of_inventory: Decimal
    markdown_candidates: list[MarkdownCandidateItem]
    reorder_suggestions: list[ReorderSuggestionItem]
    data_as_of: datetime


class RFMSegmentDistribution(BaseModel):
    segment_name: str  # Champions, Loyal, Potential, At-Risk, Hibernating
    customer_count: int
    share_percent: Decimal


class BasketAnalysisRule(BaseModel):
    antecedent: list[str]  # e.g. ["Köynək"]
    consequent: list[str]  # e.g. ["Qalstuk"]
    support: Decimal
    confidence: Decimal
    lift: Decimal


class CustomerChurnRiskItem(BaseModel):
    customer_id: uuid.UUID
    customer_name: str
    days_since_last_purchase: int
    personal_avg_interval_days: int
    risk_level: str  # LOW, MEDIUM, HIGH


class CustomerIntelligenceResponse(BaseModel):
    new_vs_returning_ratio: Decimal
    rfm_segments: list[RFMSegmentDistribution]
    basket_rules: list[BasketAnalysisRule]
    churn_risk_list: list[CustomerChurnRiskItem]
    data_as_of: datetime


class ProfitabilityAnalyticsResponse(BaseModel):
    gross_margin_percent: Decimal | None = None
    discount_leakage_amount: Decimal
    return_cost_amount: Decimal
    shrinkage_amount: Decimal
    data_as_of: datetime


class AnomalyItem(BaseModel):
    id: uuid.UUID
    rule_code: str
    severity: str
    metric_name: str
    expected_value: Decimal
    actual_value: Decimal
    z_score: Decimal | None
    detected_date: date
    evidence_transaction_ids: list[str]


class ForecastPoint(BaseModel):
    date: str
    forecast_value: Decimal
    lower_bound: Decimal
    upper_bound: Decimal


class ForecastResponse(BaseModel):
    metric: str
    method: str  # Moving Average, Simple Seasonal
    window_size: int
    mae: Decimal
    mape: Decimal
    points: list[ForecastPoint]

