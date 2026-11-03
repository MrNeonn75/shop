"""Hesabatlılıq Modulu REST API Marşrutları (Reporting Router)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Request, Response, status

from app.core.uow import UnitOfWork
from app.modules.reporting.report_registry import REPORT_REGISTRY
from app.modules.reporting.schemas import (
    AsyncReportJobCreate,
    AsyncReportJobResponse,
    BuilderDatasetMetadata,
    BuilderQuerySpec,
    BuilderSaveSpec,
    BuilderSpecResponse,
    ReportExecutionResponse,
    ReportExportRequest,
    ReportRunRequest,
    SavedReportPresetCreate,
    SavedReportPresetResponse,
    ScheduledReportCreate,
    ScheduledReportResponse,
)
from app.modules.reporting.service import ReportingService

router = APIRouter(prefix="/reports", tags=["Hesabatlılıq (Reports)"])


def get_actor(request: Request) -> Any:
    return getattr(request.state, "user", None)


def get_branch_scope(request: Request) -> list[uuid.UUID] | None:
    return getattr(request.state, "branch_scope_ids", None)


@router.get("/definitions", summary="Mövcud Hesabatların Kataloqu")
async def list_report_definitions(_request: Request) -> list[dict[str, Any]]:
    """Sistemdə təyin olunmuş bütün hesabatların siyahısı və metadataları."""
    defs = []
    for r_def in REPORT_REGISTRY.values():
        defs.append({
            "id": r_def.id,
            "az_title": r_def.az_title,
            "module": r_def.module,
            "description": r_def.description,
            "required_permissions": r_def.required_permissions,
            "allowed_filters": r_def.allowed_filters,
            "columns_count": len(r_def.columns),
        })
    return defs


@router.post(
    "/{report_id}/run",
    response_model=ReportExecutionResponse,
    summary="Hesabatı İcra Et (Generic Report Execution)",
)
async def run_report(
    request: Request, report_id: str, payload: ReportRunRequest
) -> ReportExecutionResponse:
    actor = get_actor(request)
    branch_scope = get_branch_scope(request)
    async with UnitOfWork() as uow:
        service = ReportingService(uow.session)
        return await service.run_report(
            report_id=report_id,
            payload=payload,
            actor=actor,
            branch_scope_ids=branch_scope,
        )


@router.post(
    "/{report_id}/run-async",
    response_model=AsyncReportJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Asinxron Hesabat Tapşırığı Başlat",
)
async def run_report_async(
    request: Request, report_id: str, payload: AsyncReportJobCreate
) -> AsyncReportJobResponse:
    actor = get_actor(request)
    branch_scope = get_branch_scope(request)
    async with UnitOfWork() as uow:
        service = ReportingService(uow.session)
        job = await service.run_report_async(
            report_id=report_id,
            payload=payload,
            actor=actor,
            branch_scope_ids=branch_scope,
        )
        await uow.commit()
        return job


@router.get(
    "/jobs/{job_id}",
    response_model=AsyncReportJobResponse,
    summary="Asinxron Tapşırığın Statusu",
)
async def get_async_job(request: Request, job_id: uuid.UUID) -> AsyncReportJobResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = ReportingService(uow.session)
        return await service.get_async_job(job_id, actor=actor)


@router.post(
    "/{report_id}/export",
    summary="Hesabatı Fayla İxrac Et (CSV, XLSX, PDF)",
)
async def export_report(
    request: Request, report_id: str, payload: ReportExportRequest
) -> Response:
    actor = get_actor(request)
    branch_scope = get_branch_scope(request)
    async with UnitOfWork() as uow:
        service = ReportingService(uow.session)
        file_bytes, media_type, filename = await service.export_report(
            report_id=report_id,
            fmt=payload.format,
            filters=payload.filters,
            actor=actor,
            branch_scope_ids=branch_scope,
            sensitive_reason=payload.sensitive_reason,
        )
        await uow.commit()

        return Response(
            content=file_bytes,
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )


# =========================================================================
# PRESETS (YADDA SAXLANILMIŞ FİLTRLƏR)
# =========================================================================


@router.post(
    "/{report_id}/presets",
    response_model=SavedReportPresetResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Filtr Şablonunu Yadda Saxla",
)
async def create_preset(
    request: Request, report_id: str, payload: SavedReportPresetCreate
) -> SavedReportPresetResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = ReportingService(uow.session)
        preset = await service.create_preset(report_id, payload, actor=actor)
        await uow.commit()
        return preset


@router.get(
    "/presets",
    response_model=list[SavedReportPresetResponse],
    summary="Yadda Saxlanılmış Filtrlərin Siyahısı",
)
async def list_presets(
    request: Request, report_id: str | None = None
) -> list[SavedReportPresetResponse]:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = ReportingService(uow.session)
        return await service.list_presets(actor=actor, report_id=report_id)


@router.delete(
    "/presets/{preset_id}",
    summary="Filtr Şablonunu Sil",
)
async def delete_preset(request: Request, preset_id: uuid.UUID) -> dict[str, bool]:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = ReportingService(uow.session)
        success = await service.delete_preset(preset_id, actor=actor)
        await uow.commit()
        return {"success": success}


# =========================================================================
# SCHEDULES (AVTOMATİK ÇATDIRILMA CƏDVƏLLƏRİ)
# =========================================================================


@router.post(
    "/{report_id}/schedules",
    response_model=ScheduledReportResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Avtomatik Hesabat Çatdırılma Cədvəli Qur",
)
async def create_schedule(
    request: Request, report_id: str, payload: ScheduledReportCreate
) -> ScheduledReportResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = ReportingService(uow.session)
        sched = await service.create_schedule(report_id, payload, actor=actor)
        await uow.commit()
        return sched


@router.get(
    "/schedules",
    response_model=list[ScheduledReportResponse],
    summary="Hesabat Çatdırılma Cədvəllərinin Siyahısı",
)
async def list_schedules(request: Request) -> list[ScheduledReportResponse]:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = ReportingService(uow.session)
        return await service.list_schedules(actor=actor)


# =========================================================================
# REPORT BUILDER (SƏRBƏST KONSTRUKTOR)
# =========================================================================


@router.get(
    "/builder/datasets",
    response_model=list[BuilderDatasetMetadata],
    summary="Konstruktor üçün Mövcud Datasetlər və Sahələr",
)
async def get_builder_datasets(request: Request) -> list[BuilderDatasetMetadata]:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = ReportingService(uow.session)
        return service.get_builder_datasets(actor=actor)


@router.post(
    "/builder/run",
    summary="Sərbəst Hesabat Konstruktoru Sorğusunu İcra Et",
)
@router.post(
    "/builder/query",
    include_in_schema=False,
)
async def run_builder_query(
    request: Request, spec: BuilderQuerySpec
) -> dict[str, Any]:
    actor = get_actor(request)
    branch_scope = get_branch_scope(request)
    async with UnitOfWork() as uow:
        service = ReportingService(uow.session)
        return await service.execute_builder_query(spec, actor=actor, branch_scope_ids=branch_scope)


@router.post(
    "/builder/specs",
    response_model=BuilderSpecResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Konstruktor Hesabat Şablonunu Yadda Saxla",
)
async def save_builder_spec(
    request: Request, payload: BuilderSaveSpec
) -> BuilderSpecResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = ReportingService(uow.session)
        res = await service.save_builder_spec(payload, actor=actor)
        await uow.commit()
        return res


@router.get(
    "/builder/specs",
    response_model=list[BuilderSpecResponse],
    summary="Yadda Saxlanılmış Konstruktor Şablonları",
)
async def list_builder_specs(request: Request) -> list[BuilderSpecResponse]:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = ReportingService(uow.session)
        return await service.list_builder_specs(actor=actor)
