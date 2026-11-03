"""Hesabatlılıq Modulu Pydantic Şemaları (Schemas)."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.modules.reporting.models import ExportFormat, ScheduleChannel


class ReportRunRequest(BaseModel):
    filters: dict[str, Any] = Field(default_factory=dict)
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=500)
    sort_by: str | None = None
    sort_desc: bool = False


class ReportColumnMetadata(BaseModel):
    key: str
    az_label: str
    type: str
    format: str | None = None
    sortable: bool = True
    is_masked: bool = False


class ReportSummaryKPI(BaseModel):
    definition_id: str
    label: str
    value: Decimal | None
    unit: str
    state: str
    missing_inputs: list[str] = Field(default_factory=list)
    caveats: str = ""
    compare_value: Decimal | None = None
    delta: Decimal | None = None
    delta_percent: Decimal | None = None


class ReportChartPoint(BaseModel):
    x: str | int | float
    y: Decimal | float | int


class ReportChartSeries(BaseModel):
    name: str
    series_type: str = "bar"  # bar, line, pie, area
    points: list[ReportChartPoint] = Field(default_factory=list)


class DrillDownInfo(BaseModel):
    target_report_id: str
    filter_mapping: dict[str, str]


class ReportExecutionResponse(BaseModel):
    report_id: str
    az_title: str
    data_as_of: datetime
    applied_filters: dict[str, Any]
    columns: list[ReportColumnMetadata]
    rows: list[dict[str, Any]]
    total_rows: int
    page: int
    page_size: int
    summary_kpis: list[ReportSummaryKPI] = Field(default_factory=list)
    charts: list[ReportChartSeries] = Field(default_factory=list)
    drill_down_links: list[DrillDownInfo] = Field(default_factory=list)


# =========================================================================
# ASINXRON TAPŞIRIQLAR VƏ İXRAC
# =========================================================================


class AsyncReportJobCreate(BaseModel):
    filters: dict[str, Any] = Field(default_factory=dict)


class AsyncReportJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    report_id: str
    status: str
    progress_pct: int
    file_url: str | None = None
    row_count: int = 0
    expires_at: datetime
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None


class ReportExportRequest(BaseModel):
    format: ExportFormat = ExportFormat.CSV
    filters: dict[str, Any] = Field(default_factory=dict)
    sensitive_reason: str | None = None


# =========================================================================
# YADDA SAXLANILMIŞ FİLTRLƏR (PRESETS)
# =========================================================================


class SavedReportPresetCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    description: str | None = None
    filters: dict[str, Any] = Field(default_factory=dict)
    is_shared: bool = False
    is_favorite: bool = False


class SavedReportPresetUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    filters: dict[str, Any] | None = None
    is_shared: bool | None = None
    is_favorite: bool | None = None


class SavedReportPresetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    report_id: str
    user_id: uuid.UUID
    name: str
    description: str | None = None
    filters: dict[str, Any]
    is_shared: bool
    is_favorite: bool
    created_at: datetime
    updated_at: datetime


# =========================================================================
# AVTOMATİK ÇATDIRILMA CƏDVƏLLƏRİ (SCHEDULED REPORTS)
# =========================================================================


class ScheduledReportCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    cron_expression: str = Field(..., min_length=5, max_length=50)
    format: ExportFormat = ExportFormat.XLSX
    channel: ScheduleChannel = ScheduleChannel.EMAIL
    destination: str = Field(..., min_length=3, max_length=255)
    filters: dict[str, Any] = Field(default_factory=dict)


class ScheduledReportUpdate(BaseModel):
    name: str | None = None
    cron_expression: str | None = None
    format: ExportFormat | None = None
    channel: ScheduleChannel | None = None
    destination: str | None = None
    filters: dict[str, Any] | None = None
    is_active: bool | None = None


class ScheduledReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    report_id: str
    user_id: uuid.UUID
    cron_expression: str
    format: str
    channel: str
    destination: str
    filters: dict[str, Any]
    is_active: bool
    status: str
    last_run_at: datetime | None = None
    next_run_at: datetime | None = None
    created_at: datetime


# =========================================================================
# SƏRBƏST HESABAT KONSTRUKTORU (REPORT BUILDER)
# =========================================================================


class BuilderFilter(BaseModel):
    field: str
    operator: str  # eq, neq, gt, gte, lt, lte, in, contains, between
    value: Any


class BuilderQuerySpec(BaseModel):
    dataset: str  # sales_lines, stock_movements, purchase_lines, expenses, customer_aggregates
    dimensions: list[str] = Field(default_factory=list)
    measures: list[str] = Field(default_factory=list)
    filters: list[BuilderFilter] = Field(default_factory=list)
    group_by: list[str] = Field(default_factory=list)
    sort_by: str | None = None
    sort_desc: bool = False
    limit: int = Field(default=100, ge=1, le=10000)


class BuilderSaveSpec(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    description: str | None = None
    dataset: str
    spec: BuilderQuerySpec
    is_shared: bool = False


class BuilderSpecResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None = None
    dataset: str
    spec_json: dict[str, Any]
    is_shared: bool
    created_at: datetime
    updated_at: datetime


class BuilderDatasetField(BaseModel):
    name: str
    az_label: str
    type: str  # dimension, measure
    data_type: str  # string, number, decimal, date
    requires_permission: str | None = None


class BuilderDatasetMetadata(BaseModel):
    dataset: str
    az_label: str
    description: str
    fields: list[BuilderDatasetField]
