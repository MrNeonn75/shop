"""Analitika və BI Verilənlər Bazası Repozitorisi (Analytics Repository)."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.modules.analytics.models import (
    AnomalyDetectionLog,
    ChartAnnotation,
    SalesTarget,
    TargetStatus,
)


class AnalyticsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # =========================================================================
    # 1. SATIŞ HƏDƏFLƏRİ (SALES TARGETS)
    # =========================================================================

    async def create_sales_target(self, target: SalesTarget) -> SalesTarget:
        self.session.add(target)
        await self.session.flush()
        return target

    async def get_sales_target(self, target_id: uuid.UUID) -> SalesTarget | None:
        return await self.session.get(SalesTarget, target_id)

    async def list_sales_targets(
        self,
        year: int,
        month: int | None = None,
        branch_id: uuid.UUID | None = None,
    ) -> Sequence[SalesTarget]:
        stmt = select(SalesTarget).where(SalesTarget.year == year)
        if month:
            stmt = stmt.where(SalesTarget.month == month)
        if branch_id:
            stmt = stmt.where(SalesTarget.branch_id == branch_id)
        stmt = stmt.order_by(SalesTarget.month.asc(), SalesTarget.branch_id.asc())
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def approve_sales_target(
        self, target: SalesTarget, actor_id: uuid.UUID
    ) -> SalesTarget:
        target.status = TargetStatus.APPROVED.value
        target.approved_by = actor_id
        target.approved_at = utc_now()
        target.version += 1
        await self.session.flush()
        return target

    # =========================================================================
    # 2. QRAFİK ANNOTASİYALARI (CHART ANNOTATIONS)
    # =========================================================================

    async def create_annotation(self, annotation: ChartAnnotation) -> ChartAnnotation:
        self.session.add(annotation)
        await self.session.flush()
        return annotation

    async def list_annotations(
        self,
        series_name: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> Sequence[ChartAnnotation]:
        stmt = select(ChartAnnotation)
        conds = []
        if series_name:
            conds.append(ChartAnnotation.series_name == series_name)
        if date_from:
            conds.append(ChartAnnotation.annotation_date >= date_from)
        if date_to:
            conds.append(ChartAnnotation.annotation_date <= date_to)
        if conds:
            stmt = stmt.where(and_(*conds))
        stmt = stmt.order_by(ChartAnnotation.annotation_date.asc())
        res = await self.session.execute(stmt)
        return res.scalars().all()

    # =========================================================================
    # 3. ANOMALİYA JURNALI (ANOMALY LOGS)
    # =========================================================================

    async def log_anomaly(self, anomaly: AnomalyDetectionLog) -> AnomalyDetectionLog:
        self.session.add(anomaly)
        await self.session.flush()
        return anomaly

    async def list_anomalies(
        self, status: str | None = None, severity: str | None = None
    ) -> Sequence[AnomalyDetectionLog]:
        stmt = select(AnomalyDetectionLog)
        if status:
            stmt = stmt.where(AnomalyDetectionLog.status == status)
        if severity:
            stmt = stmt.where(AnomalyDetectionLog.severity == severity)
        stmt = stmt.order_by(AnomalyDetectionLog.created_at.desc())
        res = await self.session.execute(stmt)
        return res.scalars().all()
