"""Hesabatlılıq Modulu Verilənlər Bazası Repozitorisi (Repository)."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.reporting.models import (
    AsyncReportJob,
    DailyReturnsSummary,
    DailySalesSummary,
    SavedReportBuilderSpec,
    SavedReportPreset,
    ScheduledReportDelivery,
)
from app.modules.sales.models import Sale


class ReportingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # =========================================================================
    # 1. YADDA SAXLANILMIŞ FİLTRLƏR (PRESETS)
    # =========================================================================

    async def create_preset(self, preset: SavedReportPreset) -> SavedReportPreset:
        self.session.add(preset)
        await self.session.flush()
        return preset

    async def get_preset(self, preset_id: uuid.UUID) -> SavedReportPreset | None:
        return await self.session.get(SavedReportPreset, preset_id)

    async def list_presets(
        self, user_id: uuid.UUID, report_id: str | None = None
    ) -> Sequence[SavedReportPreset]:
        stmt = select(SavedReportPreset).where(
            or_(
                SavedReportPreset.user_id == user_id,
                SavedReportPreset.is_shared.is_(True),
            )
        )
        if report_id:
            stmt = stmt.where(SavedReportPreset.report_id == report_id)
        stmt = stmt.order_by(SavedReportPreset.is_favorite.desc(), SavedReportPreset.name.asc())
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def delete_preset(self, preset_id: uuid.UUID) -> bool:
        stmt = delete(SavedReportPreset).where(SavedReportPreset.id == preset_id)
        res = await self.session.execute(stmt)
        await self.session.flush()
        return (res.rowcount or 0) > 0

    # =========================================================================
    # 2. AVTOMATİK ÇATDIRILMA CƏDVƏLLƏRİ (SCHEDULES)
    # =========================================================================

    async def create_schedule(self, schedule: ScheduledReportDelivery) -> ScheduledReportDelivery:
        self.session.add(schedule)
        await self.session.flush()
        return schedule

    async def get_schedule(self, schedule_id: uuid.UUID) -> ScheduledReportDelivery | None:
        return await self.session.get(ScheduledReportDelivery, schedule_id)

    async def list_schedules(
        self, user_id: uuid.UUID | None = None
    ) -> Sequence[ScheduledReportDelivery]:
        stmt = select(ScheduledReportDelivery)
        if user_id:
            stmt = stmt.where(ScheduledReportDelivery.user_id == user_id)
        res = await self.session.execute(stmt)
        return res.scalars().all()

    # =========================================================================
    # 3. ASINXRON TAPŞIRIQLAR (ASYNC JOBS)
    # =========================================================================

    async def create_async_job(self, job: AsyncReportJob) -> AsyncReportJob:
        self.session.add(job)
        await self.session.flush()
        return job

    async def get_async_job(self, job_id: uuid.UUID) -> AsyncReportJob | None:
        return await self.session.get(AsyncReportJob, job_id)

    # =========================================================================
    # 4. HESABAT KONSTRUKTORU ŞABLONLARI (BUILDER SPECS)
    # =========================================================================

    async def save_builder_spec(self, spec: SavedReportBuilderSpec) -> SavedReportBuilderSpec:
        self.session.add(spec)
        await self.session.flush()
        return spec

    async def get_builder_spec(self, spec_id: uuid.UUID) -> SavedReportBuilderSpec | None:
        return await self.session.get(SavedReportBuilderSpec, spec_id)

    async def list_builder_specs(
        self, user_id: uuid.UUID
    ) -> Sequence[SavedReportBuilderSpec]:
        stmt = select(SavedReportBuilderSpec).where(
            or_(
                SavedReportBuilderSpec.user_id == user_id,
                SavedReportBuilderSpec.is_shared.is_(True),
            )
        ).order_by(SavedReportBuilderSpec.created_at.desc())
        res = await self.session.execute(stmt)
        return res.scalars().all()

    # =========================================================================
    # 5. OXU MODELLƏRİ VƏ YEKUNLAŞDIRMA (RECONCILIATION)
    # =========================================================================

    async def add_daily_sales_summary(self, item: DailySalesSummary) -> DailySalesSummary:
        self.session.add(item)
        await self.session.flush()
        return item

    async def reconcile_sales_summary_for_date(
        self, target_date: date, branch_id: uuid.UUID
    ) -> tuple[Decimal, Decimal, bool]:
        """Tarix üzrə Summary cədvəlini ilkin mənbə (Sale/Returns) ilə tutuşdurur və drift yoxlayır."""
        # 1. İlkin mənbədən recompute
        stmt = (
            select(
                func.coalesce(func.sum(Sale.grand_total), Decimal("0.00")),
                func.count(Sale.id),
            )
            .where(
                Sale.branch_id == branch_id,
                func.date(Sale.created_at) == target_date,
                Sale.status == "COMPLETED",
            )
        )
        res = await self.session.execute(stmt)
        source_sales, source_count = res.one()

        # 2. Mövcud summary-dən oxu
        sum_stmt = select(
            func.coalesce(func.sum(DailySalesSummary.net_sales), Decimal("0.00"))
        ).where(
            DailySalesSummary.branch_id == branch_id,
            DailySalesSummary.report_date == target_date,
        )
        sum_res = await self.session.execute(sum_stmt)
        summary_sales = sum_res.scalar_one()

        is_drift = abs(source_sales - summary_sales) > Decimal("0.01")
        return source_sales, summary_sales, is_drift

    async def consume_sale_completed(self, payload: dict[str, Any]) -> None:
        """sale.completed hadisəsindən DailySalesSummary modelinə inkremental əlavə."""
        try:
            company_id = uuid.UUID(str(payload.get("company_id") or uuid.uuid4()))
            branch_id = uuid.UUID(str(payload["branch_id"]))
            cashier_id = (
                uuid.UUID(str(payload["cashier_id"])) if payload.get("cashier_id") else None
            )
            register_id = (
                uuid.UUID(str(payload["register_id"])) if payload.get("register_id") else None
            )
            grand_total = Decimal(str(payload.get("grand_total", "0.00")))
            items_count = int(payload.get("items_count", 1))
            tenders = payload.get("payment_tenders") or ["CASH"]
            tender_type = tenders[0] if tenders else "CASH"
            today = date.today()

            stmt = select(DailySalesSummary).where(
                DailySalesSummary.branch_id == branch_id,
                DailySalesSummary.report_date == today,
                DailySalesSummary.cashier_id == cashier_id,
                DailySalesSummary.register_id == register_id,
                DailySalesSummary.tender_type == tender_type,
            )
            res = await self.session.execute(stmt)
            existing = res.scalars().first()

            if existing:
                existing.gross_sales += grand_total
                existing.net_sales += grand_total
                existing.transaction_count += 1
                existing.units_sold += items_count
                existing.source_version += 1
            else:
                new_row = DailySalesSummary(
                    company_id=company_id,
                    report_date=today,
                    branch_id=branch_id,
                    cashier_id=cashier_id,
                    register_id=register_id,
                    tender_type=tender_type,
                    gross_sales=grand_total,
                    net_sales=grand_total,
                    discount_amount=Decimal("0.00"),
                    tax_amount=Decimal("0.00"),
                    cogs_amount=Decimal("0.00"),
                    gross_profit=grand_total,
                    transaction_count=1,
                    units_sold=items_count,
                    source_version=1,
                )
                self.session.add(new_row)
            await self.session.flush()
        except Exception:
            pass

    async def consume_return_completed(self, payload: dict[str, Any]) -> None:
        """return.completed hadisəsindən DailyReturnsSummary modelinə inkremental əlavə."""
        try:
            branch_id = uuid.UUID(str(payload["branch_id"]))
            cashier_id = (
                uuid.UUID(str(payload["cashier_id"])) if payload.get("cashier_id") else None
            )
            refund_total = Decimal(str(payload.get("refund_total", "0.00")))
            return_type = str(payload.get("return_type", "GENERAL"))
            company_id = uuid.UUID(str(payload.get("company_id") or uuid.uuid4()))
            today = date.today()

            stmt = select(DailyReturnsSummary).where(
                DailyReturnsSummary.branch_id == branch_id,
                DailyReturnsSummary.report_date == today,
                DailyReturnsSummary.cashier_id == cashier_id,
                DailyReturnsSummary.return_reason == return_type,
            )
            res = await self.session.execute(stmt)
            existing = res.scalars().first()

            if existing:
                existing.refund_amount += refund_total
                existing.return_count += 1
                existing.units_returned += 1
                existing.source_version += 1
            else:
                new_row = DailyReturnsSummary(
                    company_id=company_id,
                    report_date=today,
                    branch_id=branch_id,
                    cashier_id=cashier_id,
                    return_reason=return_type,
                    refund_tender="CASH",
                    return_count=1,
                    units_returned=1,
                    refund_amount=refund_total,
                    source_version=1,
                )
                self.session.add(new_row)
            await self.session.flush()
        except Exception:
            pass
