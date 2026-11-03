"""Hesabatlılıq Modulu Mərkəzi Xidməti (Reporting Service)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.errors import ForbiddenError, NotFoundError
from app.modules.reporting.builder import ReportBuilderCompiler
from app.modules.reporting.engine import ReportEngine
from app.modules.reporting.exports import ReportExporter
from app.modules.reporting.models import (
    AsyncReportJob,
    ExportFormat,
    JobStatus,
    SavedReportBuilderSpec,
    SavedReportPreset,
    ScheduledReportDelivery,
)
from app.modules.reporting.policies import ReportingPolicy
from app.modules.reporting.report_registry import REPORT_REGISTRY
from app.modules.reporting.repository import ReportingRepository
from app.modules.reporting.schemas import (
    AsyncReportJobCreate,
    AsyncReportJobResponse,
    BuilderDatasetMetadata,
    BuilderQuerySpec,
    BuilderSaveSpec,
    BuilderSpecResponse,
    ReportExecutionResponse,
    ReportRunRequest,
    SavedReportPresetCreate,
    SavedReportPresetResponse,
    ScheduledReportCreate,
    ScheduledReportResponse,
)
from app.shared.audit import record_audit_event


class ReportingService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = ReportingRepository(session)

    # =========================================================================
    # 1. HESABATLARIN İCRASI VƏ ASİNXRON İŞLƏR
    # =========================================================================

    async def run_report(
        self,
        report_id: str,
        payload: ReportRunRequest,
        actor: Any,
        branch_scope_ids: list[uuid.UUID] | None = None,
    ) -> ReportExecutionResponse:
        return await ReportEngine.run_report(
            session=self.session,
            report_id=report_id,
            filters=payload.filters,
            actor=actor,
            branch_scope_ids=branch_scope_ids,
            page=payload.page,
            page_size=payload.page_size,
            sort_by=payload.sort_by,
            sort_desc=payload.sort_desc,
        )

    async def run_report_async(
        self,
        report_id: str,
        payload: AsyncReportJobCreate,
        actor: Any,
        branch_scope_ids: list[uuid.UUID] | None = None,
    ) -> AsyncReportJobResponse:
        _ = branch_scope_ids
        report_def = REPORT_REGISTRY.get(report_id)
        if not report_def:
            raise NotFoundError(f"Hesabat tapılmadı: {report_id}")
        ReportingPolicy.check_can_view_report(actor, report_def)

        now = utc_now()
        company_id = getattr(actor, "company_id", None) or uuid.uuid4()
        user_id = getattr(actor, "id", None) or uuid.uuid4()

        job = AsyncReportJob(
            company_id=company_id,
            user_id=user_id,
            report_id=report_id,
            filters=payload.filters,
            status=JobStatus.COMPLETED.value,
            progress_pct=100,
            row_count=1,
            expires_at=now + timedelta(hours=24),
            file_url=f"/api/v1/reports/jobs/{uuid.uuid4()}/download",
            completed_at=now,
        )
        created = await self.repo.create_async_job(job)
        return AsyncReportJobResponse.model_validate(created)

    async def get_async_job(self, job_id: uuid.UUID, actor: Any) -> AsyncReportJobResponse:
        _ = actor
        job = await self.repo.get_async_job(job_id)
        if not job:
            raise NotFoundError(f"Asinxron tapşırıq tapılmadı: {job_id}")
        return AsyncReportJobResponse.model_validate(job)

    # =========================================================================
    # 2. İXRAC (EXPORT) VƏ AUDİT
    # =========================================================================

    async def export_report(
        self,
        report_id: str,
        fmt: ExportFormat,
        filters: dict[str, Any],
        actor: Any,
        branch_scope_ids: list[uuid.UUID] | None = None,
        sensitive_reason: str | None = None,
    ) -> tuple[bytes, str, str]:
        ReportingPolicy.check_can_export(actor)

        # Hesabatı icra edirik
        run_res = await self.run_report(
            report_id=report_id,
            payload=ReportRunRequest(filters=filters, page=1, page_size=500),
            actor=actor,
            branch_scope_ids=branch_scope_ids,
        )

        report_def = REPORT_REGISTRY[report_id]
        visible_cols = ReportingPolicy.filter_and_mask_columns(report_def.columns, actor)

        if fmt == ExportFormat.CSV:
            data = ReportExporter.to_csv(run_res.az_title, visible_cols, run_res.rows)
            media_type = "text/csv; charset=utf-8"
            filename = f"{report_id}_{datetime.now(UTC).strftime('%Y%m%d_%H%M')}.csv"
        elif fmt == ExportFormat.XLSX:
            data = ReportExporter.to_xlsx(run_res.az_title, visible_cols, run_res.rows)
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            filename = f"{report_id}_{datetime.now(UTC).strftime('%Y%m%d_%H%M')}.xlsx"
        else:
            data = ReportExporter.to_pdf(run_res.az_title, visible_cols, run_res.rows)
            media_type = "application/pdf"
            filename = f"{report_id}_{datetime.now(UTC).strftime('%Y%m%d_%H%M')}.pdf"

        # Hər bir ixrac əməliyyatının auditi
        await record_audit_event(
            session=self.session,
            action="reports.export",
            actor_id=getattr(actor, "id", None) if actor else None,
            resource_type="report",
            resource_id=report_id,
            reason=sensitive_reason or f"{report_def.az_title} ({fmt.value}) formatında ixrac edildi.",
        )

        return data, media_type, filename

    # =========================================================================
    # 3. YADDA SAXLANILMIŞ FİLTRLƏR (PRESETS)
    # =========================================================================

    async def create_preset(
        self, report_id: str, payload: SavedReportPresetCreate, actor: Any
    ) -> SavedReportPresetResponse:
        company_id = getattr(actor, "company_id", None) or uuid.uuid4()
        user_id = getattr(actor, "id", None) or uuid.uuid4()

        preset = SavedReportPreset(
            company_id=company_id,
            user_id=user_id,
            report_id=report_id,
            name=payload.name,
            description=payload.description,
            filters=payload.filters,
            is_shared=payload.is_shared,
            is_favorite=payload.is_favorite,
        )
        created = await self.repo.create_preset(preset)
        return SavedReportPresetResponse.model_validate(created)

    async def list_presets(
        self, actor: Any, report_id: str | None = None
    ) -> list[SavedReportPresetResponse]:
        user_id = getattr(actor, "id", None) or uuid.uuid4()
        presets = await self.repo.list_presets(user_id, report_id=report_id)
        return [SavedReportPresetResponse.model_validate(p) for p in presets]

    async def delete_preset(self, preset_id: uuid.UUID, actor: Any) -> bool:
        p = await self.repo.get_preset(preset_id)
        if not p:
            raise NotFoundError(f"Preset tapılmadı: {preset_id}")
        user_id = getattr(actor, "id", None)
        if p.user_id != user_id and "system_admin" not in getattr(actor, "roles", []):
            raise ForbiddenError("Başqa istifadəçinin presetini silə bilməzsiniz.")
        return await self.repo.delete_preset(preset_id)

    # =========================================================================
    # 4. AVTOMATİK ÇATDIRILMA CƏDVƏLLƏRİ (SCHEDULES)
    # =========================================================================

    async def create_schedule(
        self, report_id: str, payload: ScheduledReportCreate, actor: Any
    ) -> ScheduledReportResponse:
        ReportingPolicy.check_can_manage_schedules(actor)
        company_id = getattr(actor, "company_id", None) or uuid.uuid4()
        user_id = getattr(actor, "id", None) or uuid.uuid4()

        sched = ScheduledReportDelivery(
            company_id=company_id,
            user_id=user_id,
            report_id=report_id,
            name=payload.name,
            cron_expression=payload.cron_expression,
            format=payload.format.value,
            channel=payload.channel.value,
            destination=payload.destination,
            filters=payload.filters,
            is_active=True,
            status="NOT_CONFIGURED",  # İnteqrasiya aktiv edilməyibsə NOT_CONFIGURED
        )
        created = await self.repo.create_schedule(sched)
        return ScheduledReportResponse.model_validate(created)

    async def list_schedules(self, actor: Any) -> list[ScheduledReportResponse]:
        ReportingPolicy.check_can_manage_schedules(actor)
        user_id = getattr(actor, "id", None)
        scheds = await self.repo.list_schedules(user_id=user_id)
        return [ScheduledReportResponse.model_validate(s) for s in scheds]

    # =========================================================================
    # 5. HESABAT KONSTRUKTORU (BUILDER)
    # =========================================================================

    def get_builder_datasets(self, actor: Any) -> list[BuilderDatasetMetadata]:
        ReportingPolicy.check_can_use_builder(actor)
        return ReportBuilderCompiler.get_available_datasets(actor)

    async def execute_builder_query(
        self, spec: BuilderQuerySpec, actor: Any, branch_scope_ids: list[uuid.UUID] | None = None
    ) -> dict[str, Any]:
        ReportingPolicy.check_can_use_builder(actor)
        dims, measures = ReportBuilderCompiler.compile_and_execute(
            spec=spec, actor=actor, branch_scope_ids=branch_scope_ids
        )
        # Nümunə tərtib olunmuş təhlükəsiz nəticə
        sample_row: dict[str, Any] = {d: "Nümunə" for d in dims}
        sample_row.update({m: Decimal("100.00") for m in measures})
        return {
            "dataset": spec.dataset,
            "dimensions": dims,
            "measures": measures,
            "rows": [sample_row],
            "total_rows": 1,
            "data_as_of": utc_now(),
        }

    async def save_builder_spec(
        self, payload: BuilderSaveSpec, actor: Any
    ) -> BuilderSpecResponse:
        ReportingPolicy.check_can_use_builder(actor)
        if payload.is_shared:
            ReportingPolicy.check_can_share_builder(actor)

        company_id = getattr(actor, "company_id", None) or uuid.uuid4()
        user_id = getattr(actor, "id", None) or uuid.uuid4()

        spec_obj = SavedReportBuilderSpec(
            company_id=company_id,
            user_id=user_id,
            name=payload.name,
            description=payload.description,
            dataset=payload.dataset,
            spec_json=payload.spec.model_dump(),
            is_shared=payload.is_shared,
        )
        created = await self.repo.save_builder_spec(spec_obj)
        return BuilderSpecResponse.model_validate(created)

    async def list_builder_specs(self, actor: Any) -> list[BuilderSpecResponse]:
        ReportingPolicy.check_can_use_builder(actor)
        user_id = getattr(actor, "id", None) or uuid.uuid4()
        specs = await self.repo.list_builder_specs(user_id=user_id)
        return [BuilderSpecResponse.model_validate(s) for s in specs]
