"""Sazlamalar Modulu API Marşrutları (Settings Router)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy import select

from app.core.config import settings
from app.core.database import utc_now
from app.core.uow import UnitOfWork
from app.modules.settings.schemas import (
    ReasonCodeCreate,
    ReasonCodeResponse,
    ReasonCodeUpdate,
    SettingGroupResponse,
    SettingHistoryResponse,
    SettingPreviewRequest,
    SettingPreviewResponse,
    SettingRestoreRequest,
    SettingUpdateRequest,
    SettingValueResponse,
)
from app.modules.settings.service import SettingsService, get_settings_service
from app.shared.backup_model import BackupRecord

router = APIRouter(prefix="/settings", tags=["Sistem Sazlamaları (Settings)"])


@router.get(
    "/groups",
    response_model=list[SettingGroupResponse],
    summary="Bütün parametr qrupları və təyinatları",
)
async def list_setting_groups(
    request: Request,
    service: Annotated[SettingsService, Depends(get_settings_service)],
) -> list[SettingGroupResponse]:
    """Sistemdə mövcud olan bütün parametrlərin reyestr sxemlərini qaytarır."""
    _ = getattr(request.state, "user", None)
    return service.list_groups()


@router.get(
    "/{key}",
    response_model=SettingValueResponse,
    summary="Parametrin həll olunmuş cari dəyəri",
)
async def get_setting(
    key: str,
    request: Request,
    service: Annotated[SettingsService, Depends(get_settings_service)],
    branch_id: uuid.UUID | None = Query(None),
    at: datetime | None = Query(None),
) -> SettingValueResponse:
    """Parametr dəyərini həll edir (Filial Override -> Şirkət Dəyəri -> Reyestr Standartı)."""
    actor = getattr(request.state, "user", None)
    return await service.get(key=key, branch_id=branch_id, at=at, actor=actor)


@router.put(
    "/{key}",
    response_model=SettingValueResponse,
    summary="Parametr dəyərini yenilə",
)
async def update_setting(
    key: str,
    data: SettingUpdateRequest,
    request: Request,
    service: Annotated[SettingsService, Depends(get_settings_service)],
) -> SettingValueResponse:
    """Parametr dəyərini versiyalanmış tarixçəyə yeni sətir kimi əlavə edir."""
    actor = getattr(request.state, "user", None)
    return await service.update_setting(key=key, data=data, actor=actor)


@router.post(
    "/preview",
    response_model=SettingPreviewResponse,
    summary="Parametr dəyişikliyinin fərq (diff) önizlənməsi",
)
async def preview_setting_change(
    data: SettingPreviewRequest,
    request: Request,
    service: Annotated[SettingsService, Depends(get_settings_service)],
) -> SettingPreviewResponse:
    """Yadda saxlamazdan əvvəl yeni dəyərlə cari dəyər arasındakı fərqi göstərir."""
    actor = getattr(request.state, "user", None)
    return await service.preview_setting(data=data, actor=actor)


@router.get(
    "/{key}/history",
    response_model=list[SettingHistoryResponse],
    summary="Parametrin tam dəyişiklik tarixçəsi",
)
async def get_setting_history(
    key: str,
    request: Request,
    service: Annotated[SettingsService, Depends(get_settings_service)],
    branch_id: uuid.UUID | None = Query(None),
) -> list[SettingHistoryResponse]:
    """Parametrin keçmiş bütün versiyalarını və əsaslandırmalarını gətirir."""
    actor = getattr(request.state, "user", None)
    return await service.list_history(key=key, branch_id=branch_id, actor=actor)


@router.post(
    "/{key}/restore",
    response_model=SettingValueResponse,
    summary="Parametrin əvvəlki versiyasını bərpa et",
)
async def restore_setting_version(
    key: str,
    data: SettingRestoreRequest,
    request: Request,
    service: Annotated[SettingsService, Depends(get_settings_service)],
) -> SettingValueResponse:
    """Keçmiş versiyanı bərpa edərək yeni versiya kimi arxivə daxil edir."""
    actor = getattr(request.state, "user", None)
    return await service.restore_version(key=key, data=data, actor=actor)


# --- Səbəb Kodları (Reason Codes) Endpoint-ləri ---


@router.get(
    "/reason-codes/list",
    response_model=list[ReasonCodeResponse],
    summary="Səbəb kodlarının siyahısı",
)
async def list_reason_codes(
    request: Request,
    service: Annotated[SettingsService, Depends(get_settings_service)],
    category: str | None = Query(None),
    is_active: bool | None = Query(None),
) -> list[ReasonCodeResponse]:
    """Qaytarma, silinmə, endirim və kassa səbəb kodlarını siyahılayır."""
    actor = getattr(request.state, "user", None)
    return await service.list_reason_codes(category=category, is_active=is_active, actor=actor)


@router.post(
    "/reason-codes",
    response_model=ReasonCodeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni səbəb kodu yarat",
)
async def create_reason_code(
    data: ReasonCodeCreate,
    request: Request,
    service: Annotated[SettingsService, Depends(get_settings_service)],
) -> ReasonCodeResponse:
    """Yeni əməliyyat səbəb kodu əlavə edir."""
    actor = getattr(request.state, "user", None)
    return await service.create_reason_code(data=data, actor=actor)


@router.put(
    "/reason-codes/{code_id}",
    response_model=ReasonCodeResponse,
    summary="Səbəb kodunu redaktə et",
)
async def update_reason_code(
    code_id: uuid.UUID,
    data: ReasonCodeUpdate,
    request: Request,
    service: Annotated[SettingsService, Depends(get_settings_service)],
) -> ReasonCodeResponse:
    """Səbəb kodunun adını və ya aktivlik statusunu dəyişir."""
    actor = getattr(request.state, "user", None)
    return await service.update_reason_code(code_id=code_id, data=data, actor=actor)


@router.delete(
    "/reason-codes/{code_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Səbəb kodunu sil",
)
async def delete_reason_code(
    code_id: uuid.UUID,
    request: Request,
    service: Annotated[SettingsService, Depends(get_settings_service)],
) -> Response:
    """Səbəb kodunu silir. İstifadə olunmuş kodlar silinə bilməz, yalnız deaktiv edilir."""
    actor = getattr(request.state, "user", None)
    await service.delete_reason_code(code_id=code_id, actor=actor)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Sistem Sağlamlıq və Ehtiyat Nüsxələnmə Statusu (Health & Backup Status) ---


@router.get(
    "/system/health",
    summary="Sistem sağlamlıq və komponent statusu",
)
async def get_system_health(request: Request) -> dict[str, Any]:
    """Frontend sazlamalar səhifəsi üçün sistem komponentlərinin statusunu qaytarır."""
    _ = getattr(request.state, "user", None)
    return {
        "status": "operational",
        "app_name": settings.APP_NAME,
        "environment": settings.APP_ENV,
        "database": "connected",
        "redis": "connected" if settings.REDIS_ENABLED else "disabled",
        "timestamp": utc_now().isoformat(),
        "version": "0.1.0",
    }


@router.get(
    "/system/backup-status",
    summary="Son ehtiyat nüsxələnmə (Backup) statusu",
)
async def get_system_backup_status(request: Request) -> dict[str, Any]:
    """Son ehtiyat nüsxə çıxarma əməliyyatlarının tarixçəsi və statusu."""
    _ = getattr(request.state, "user", None)
    async with UnitOfWork() as uow:
        stmt = select(BackupRecord).order_by(BackupRecord.started_at.desc()).limit(5)
        res = await uow.session.execute(stmt)
        records = res.scalars().all()

        return {
            "last_backup": {
                "started_at": records[0].started_at.isoformat() if records else None,
                "completed_at": records[0].completed_at.isoformat()
                if records and records[0].completed_at
                else None,
                "status": records[0].status if records else "NO_BACKUP_YET",
                "size_bytes": records[0].size_bytes if records else 0,
                "storage_path": records[0].storage_path if records else None,
                "checksum": records[0].checksum if records else None,
            }
            if records
            else None,
            "recent_runs": [
                {
                    "type": r.backup_type,
                    "started_at": r.started_at.isoformat(),
                    "status": r.status,
                    "size_bytes": r.size_bytes,
                }
                for r in records
            ],
        }
