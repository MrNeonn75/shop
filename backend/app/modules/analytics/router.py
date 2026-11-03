"""Analitika və İdarəetmə Paneli REST API Marşrutları (Analytics Router)."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, Query, Request, status

from app.core.uow import UnitOfWork
from app.modules.analytics.schemas import (
    AnomalyItem,
    ChartAnnotationCreate,
    ChartAnnotationResponse,
    CustomerIntelligenceResponse,
    DashboardCompareMode,
    DashboardResponse,
    ForecastResponse,
    InventoryIntelligenceResponse,
    PerformanceAnalyticsResponse,
    ProfitabilityAnalyticsResponse,
    SalesTargetCreate,
    SalesTargetResponse,
)
from app.modules.analytics.service import AnalyticsService

router = APIRouter(tags=["Analitika və İdarə Paneli (Analytics & BI)"])


def get_actor(request: Request) -> Any:
    return getattr(request.state, "user", None)


# =========================================================================
# 1. İDARƏETMƏ PANELİ (DASHBOARD)
# =========================================================================


@router.get(
    "/dashboard",
    response_model=DashboardResponse,
    summary="Master İdarəetmə Paneli (Dashboard)",
)
async def get_dashboard(
    request: Request,
    branch_ids: list[uuid.UUID] = Query(default=[]),
    date_from: date | None = None,
    date_to: date | None = None,
    compare: DashboardCompareMode = DashboardCompareMode.PREV_PERIOD,
) -> DashboardResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = AnalyticsService(uow.session)
        return await service.get_dashboard(
            branch_ids=branch_ids,
            date_from=date_from,
            date_to=date_to,
            compare=compare,
            actor=actor,
        )


@router.get(
    "/dashboard/branch/{branch_id}",
    response_model=DashboardResponse,
    summary="Filial İdarəetmə Paneli",
)
async def get_branch_dashboard(
    request: Request,
    branch_id: uuid.UUID,
    date_from: date | None = None,
    date_to: date | None = None,
    compare: DashboardCompareMode = DashboardCompareMode.PREV_PERIOD,
) -> DashboardResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = AnalyticsService(uow.session)
        return await service.get_dashboard(
            branch_ids=[branch_id],
            date_from=date_from,
            date_to=date_to,
            compare=compare,
            actor=actor,
        )


@router.get(
    "/dashboard/widgets/sales-trend",
    summary="Kassa Satış Dinamikası Vidceti",
)
async def get_sales_trend_widget(
    request: Request,
    branch_ids: list[uuid.UUID] = Query(default=[]),
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict[str, Any]:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = AnalyticsService(uow.session)
        dash = await service.get_dashboard(
            branch_ids=branch_ids,
            date_from=date_from,
            date_to=date_to,
            compare=DashboardCompareMode.PREV_PERIOD,
            actor=actor,
        )
        return {
            "series": dash.widgets.get("sales_trend", []),
            "data_as_of": dash.data_as_of,
        }


@router.get(
    "/dashboard/widgets/low-stock-alerts",
    summary="Kritik Qalıq Bildirişləri Vidceti",
)
async def get_low_stock_widget(request: Request) -> dict[str, Any]:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = AnalyticsService(uow.session)
        dash = await service.get_dashboard(
            branch_ids=[],
            date_from=None,
            date_to=None,
            compare=DashboardCompareMode.PREV_PERIOD,
            actor=actor,
        )
        return {
            "alerts": dash.widgets.get("low_stock_alerts", []),
            "data_as_of": dash.data_as_of,
        }


# =========================================================================
# 2. BİZNES İNTELLEKTİ (BI) VƏ PERFORMANS
# =========================================================================


@router.get(
    "/analytics/performance",
    response_model=PerformanceAnalyticsResponse,
    summary="Satış Performansı və Hədəf İcrası (Targets vs Actuals)",
)
async def get_performance_analytics(
    request: Request,
    year: int = Query(default=2026),
    month: int = Query(default=10),
) -> PerformanceAnalyticsResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = AnalyticsService(uow.session)
        return await service.get_performance_analytics(year=year, month=month, actor=actor)


@router.post(
    "/analytics/targets",
    response_model=SalesTargetResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Filial üçün Aylıq Satış Hədəfi Təyin Et",
)
async def create_sales_target(
    request: Request, payload: SalesTargetCreate
) -> SalesTargetResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = AnalyticsService(uow.session)
        target = await service.create_sales_target(payload, actor=actor)
        await uow.commit()
        return target


@router.post(
    "/analytics/targets/{target_id}/approve",
    response_model=SalesTargetResponse,
    summary="Satış Hədəfini Təsdiqlə (Approval)",
)
async def approve_sales_target(
    request: Request, target_id: uuid.UUID
) -> SalesTargetResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = AnalyticsService(uow.session)
        target = await service.approve_sales_target(target_id, actor=actor)
        await uow.commit()
        return target


@router.get(
    "/analytics/targets",
    response_model=list[SalesTargetResponse],
    summary="Satış Hədəflərinin Siyahısı",
)
async def list_sales_targets(
    request: Request,
    year: int = Query(default=2026),
    month: int | None = None,
    branch_id: uuid.UUID | None = None,
) -> list[SalesTargetResponse]:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = AnalyticsService(uow.session)
        return await service.list_sales_targets(
            year=year, month=month, branch_id=branch_id, actor=actor
        )


@router.get(
    "/analytics/inventory",
    response_model=InventoryIntelligenceResponse,
    summary="Anbar İntellekti (Sifariş Tövsiyəsi və Markdown)",
)
async def get_inventory_intelligence(request: Request) -> InventoryIntelligenceResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = AnalyticsService(uow.session)
        return await service.get_inventory_intelligence(actor=actor)


@router.get(
    "/analytics/customers",
    response_model=CustomerIntelligenceResponse,
    summary="Müştəri İntellekti (RFM, Səbət Təhlili, Churn Risk)",
)
async def get_customer_intelligence(request: Request) -> CustomerIntelligenceResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = AnalyticsService(uow.session)
        return await service.get_customer_intelligence(actor=actor)


@router.get(
    "/analytics/profitability",
    response_model=ProfitabilityAnalyticsResponse,
    summary="Rentabellik və İtki Göstəriciləri (Leakage & Shrinkage)",
)
async def get_profitability_analytics(
    request: Request,
    date_from: date | None = None,
    date_to: date | None = None,
) -> ProfitabilityAnalyticsResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = AnalyticsService(uow.session)
        return await service.get_profitability_analytics(
            date_from=date_from, date_to=date_to, actor=actor
        )


@router.get(
    "/analytics/anomalies",
    response_model=list[AnomalyItem],
    summary="Qayda Əsaslı Anomaliya Aşkarlanması",
)
async def get_anomalies(request: Request) -> list[AnomalyItem]:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = AnalyticsService(uow.session)
        return await service.detect_anomalies(actor=actor)


@router.get(
    "/analytics/forecast",
    response_model=ForecastResponse,
    summary="Satış Proqnozu (Moving Average / Seasonal)",
)
async def get_sales_forecast(
    request: Request,
    horizon_days: int = Query(default=7, ge=1, le=30),
) -> ForecastResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = AnalyticsService(uow.session)
        return service.get_forecast(horizon_days=horizon_days, actor=actor)


@router.post(
    "/analytics/annotations",
    response_model=ChartAnnotationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Qrafik Üzərində Annotasiya Yarat",
)
async def create_annotation(
    request: Request, payload: ChartAnnotationCreate
) -> ChartAnnotationResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = AnalyticsService(uow.session)
        annot = await service.create_annotation(payload, actor=actor)
        await uow.commit()
        return annot


@router.get(
    "/analytics/annotations",
    response_model=list[ChartAnnotationResponse],
    summary="Qrafik Annotasiyalarının Siyahısı",
)
async def list_annotations(
    _request: Request,
    series_name: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[ChartAnnotationResponse]:
    async with UnitOfWork() as uow:
        service = AnalyticsService(uow.session)
        return await service.list_annotations(
            series_name=series_name, date_from=date_from, date_to=date_to
        )
