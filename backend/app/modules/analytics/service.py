"""Analitika və İdarəetmə Paneli Xidməti (Analytics Service)."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.modules.analytics.bi_service import BusinessIntelligenceService
from app.modules.analytics.dashboard import DashboardService
from app.modules.analytics.models import (
    ChartAnnotation,
    SalesTarget,
    TargetStatus,
)
from app.modules.analytics.policies import AnalyticsPolicy
from app.modules.analytics.repository import AnalyticsRepository
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
from app.shared.audit import record_audit_event


class AnalyticsService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = AnalyticsRepository(session)
        self.bi = BusinessIntelligenceService(session)

    # =========================================================================
    # 1. İDARƏETMƏ PANELİ (DASHBOARD)
    # =========================================================================

    async def get_dashboard(
        self,
        branch_ids: list[uuid.UUID],
        date_from: date | None,
        date_to: date | None,
        compare: DashboardCompareMode,
        actor: Any,
    ) -> DashboardResponse:
        return await DashboardService.get_dashboard(
            session=self.session,
            branch_ids=branch_ids,
            date_from=date_from,
            date_to=date_to,
            compare=compare,
            actor=actor,
        )

    # =========================================================================
    # 2. SATIŞ HƏDƏFLƏRİ (SALES TARGETS)
    # =========================================================================

    async def create_sales_target(
        self, payload: SalesTargetCreate, actor: Any
    ) -> SalesTargetResponse:
        AnalyticsPolicy.check_can_manage_targets(actor)
        company_id = getattr(actor, "company_id", None) or uuid.uuid4()
        user_id = getattr(actor, "id", None) or uuid.uuid4()

        target = SalesTarget(
            company_id=company_id,
            branch_id=payload.branch_id,
            year=payload.year,
            month=payload.month,
            target_amount=payload.target_amount,
            target_units=payload.target_units,
            status=TargetStatus.DRAFT.value,
            notes=payload.notes,
            created_by=user_id,
        )
        created = await self.repo.create_sales_target(target)
        await record_audit_event(
            session=self.session,
            action="bi.targets.create",
            actor_id=user_id,
            resource_type="sales_target",
            resource_id=str(created.id),
            reason=f"Satış hədəfi yaradıldı: {created.year}-{created.month} ({created.target_amount} AZN)",
        )
        return SalesTargetResponse.model_validate(created)

    async def approve_sales_target(
        self, target_id: uuid.UUID, actor: Any
    ) -> SalesTargetResponse:
        AnalyticsPolicy.check_can_manage_targets(actor)
        target = await self.repo.get_sales_target(target_id)
        if not target:
            raise NotFoundError(f"Satış hədəfi tapılmadı: {target_id}")

        actor_id = getattr(actor, "id", None) or uuid.uuid4()
        approved = await self.repo.approve_sales_target(target, actor_id=actor_id)
        await record_audit_event(
            session=self.session,
            action="bi.targets.approve",
            actor_id=actor_id,
            resource_type="sales_target",
            resource_id=str(approved.id),
            reason=f"Satış hədəfi təsdiqləndi: {approved.year}-{approved.month}",
        )
        return SalesTargetResponse.model_validate(approved)

    async def list_sales_targets(
        self, year: int, month: int | None, branch_id: uuid.UUID | None, actor: Any
    ) -> list[SalesTargetResponse]:
        AnalyticsPolicy.check_can_view_bi(actor)
        targets = await self.repo.list_sales_targets(year=year, month=month, branch_id=branch_id)
        return [SalesTargetResponse.model_validate(t) for t in targets]

    # =========================================================================
    # 3. QRAFİK ANNOTASİYALARI (CHART ANNOTATIONS)
    # =========================================================================

    async def create_annotation(
        self, payload: ChartAnnotationCreate, actor: Any
    ) -> ChartAnnotationResponse:
        AnalyticsPolicy.check_can_manage_targets(actor)
        company_id = getattr(actor, "company_id", None) or uuid.uuid4()
        user_id = getattr(actor, "id", None) or uuid.uuid4()

        annot = ChartAnnotation(
            company_id=company_id,
            series_name=payload.series_name,
            annotation_date=payload.annotation_date,
            note=payload.note,
            category=payload.category,
            campaign_id=payload.campaign_id,
            branch_id=payload.branch_id,
            created_by=user_id,
        )
        created = await self.repo.create_annotation(annot)
        return ChartAnnotationResponse.model_validate(created)

    async def list_annotations(
        self,
        series_name: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[ChartAnnotationResponse]:
        annots = await self.repo.list_annotations(
            series_name=series_name, date_from=date_from, date_to=date_to
        )
        return [ChartAnnotationResponse.model_validate(a) for a in annots]

    # =========================================================================
    # 4. BUSINESS INTELLIGENCE DELEGATION
    # =========================================================================

    async def get_performance_analytics(
        self, year: int, month: int, actor: Any
    ) -> PerformanceAnalyticsResponse:
        return await self.bi.get_performance_analytics(year, month, actor)

    async def get_inventory_intelligence(
        self, actor: Any
    ) -> InventoryIntelligenceResponse:
        return await self.bi.get_inventory_intelligence(actor)

    async def get_customer_intelligence(
        self, actor: Any
    ) -> CustomerIntelligenceResponse:
        return await self.bi.get_customer_intelligence(actor)

    async def get_profitability_analytics(
        self, date_from: date | None, date_to: date | None, actor: Any
    ) -> ProfitabilityAnalyticsResponse:
        return await self.bi.get_profitability_analytics(date_from, date_to, actor)

    async def detect_anomalies(self, actor: Any) -> list[AnomalyItem]:
        return await self.bi.detect_anomalies(actor)

    def get_forecast(
        self,
        horizon_days: int = 7,
        method: str = "Moving Average",
        window_size: int = 7,
        actor: Any = None,
    ) -> ForecastResponse:
        AnalyticsPolicy.check_can_view_bi(actor)
        return self.bi.compute_sales_forecast(
            historical_series=[],
            horizon_days=horizon_days,
            method=method,
            window_size=window_size,
        )
