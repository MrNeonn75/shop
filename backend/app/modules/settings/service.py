"""Sazlamalar Modulu Xidmət Qatı (Settings Service)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

import app.core.database as db_module
from app.core.database import utc_now
from app.core.errors import (
    BusinessRuleViolationError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
)
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.company.service import get_company_service
from app.modules.settings.events import SettingChangedEvent
from app.modules.settings.models import ReasonCode, SettingValue
from app.modules.settings.policies import (
    can_manage_branch_settings,
    can_manage_settings,
    can_view_settings,
)
from app.modules.settings.registry import SETTINGS_REGISTRY
from app.modules.settings.repository import SettingsRepository
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
from app.shared.audit import record_audit_event
from app.shared.outbox import record_outbox_event


class SettingsService:
    """Parametrlər çərçivəsi və səbəb kodları idarəetmə xidməti."""

    def __init__(self, repository: SettingsRepository | None = None) -> None:
        self.repo = repository or SettingsRepository()
        self._cache: dict[tuple[str, uuid.UUID | None], SettingValueResponse] = {}

    def list_groups(self) -> list[SettingGroupResponse]:
        """Reyestrdə olan bütün parametr qruplarını və təyinatlarını qaytarır."""
        return [
            SettingGroupResponse(
                key=defn.key,
                group=defn.group,
                type_name=defn.type_name,
                default_value=defn.default_value,
                scope=defn.scope,
                sensitivity=defn.sensitivity,
                description_az=defn.description_az,
                requires_reason=defn.requires_reason,
            )
            for defn in SETTINGS_REGISTRY.values()
        ]

    async def _resolve_setting(
        self,
        session: AsyncSession,
        key: str,
        defn: Any,
        branch_id: uuid.UUID | None,
        at: datetime | None,
        cache_key: tuple[str, uuid.UUID | None],
    ) -> SettingValueResponse:
        # 1. Filial override yoxlanışı
        if branch_id is not None:
            branch_val = await self.repo.get_effective_value(
                session, key, branch_id=branch_id, at=at
            )
            if branch_val:
                resp = SettingValueResponse(
                    key=key,
                    value=branch_val.value,
                    effective_from=branch_val.effective_from,
                    version=branch_val.version,
                    reason=branch_val.reason,
                    branch_id=branch_id,
                    source="branch_override",
                    history_id=branch_val.id,
                )
                if at is None:
                    self._cache[cache_key] = resp
                return resp

        # 2. Şirkət səviyyəli dəyər yoxlanışı
        comp_val = await self.repo.get_effective_value(session, key, branch_id=None, at=at)
        if comp_val:
            resp = SettingValueResponse(
                key=key,
                value=comp_val.value,
                effective_from=comp_val.effective_from,
                version=comp_val.version,
                reason=comp_val.reason,
                branch_id=None,
                source="company_value",
                history_id=comp_val.id,
            )
            if at is None:
                self._cache[cache_key] = resp
            return resp

        # 3. Reyestr standart dəyəri (Default)
        resp = SettingValueResponse(
            key=key,
            value=defn.default_value,
            effective_from=utc_now(),
            version=1,
            reason="Sistem ilkin standart dəyəri",
            branch_id=None,
            source="default_registry",
            history_id=None,
        )
        if at is None:
            self._cache[cache_key] = resp
        return resp

    async def get(
        self,
        key: str,
        branch_id: uuid.UUID | None = None,
        at: datetime | None = None,
        actor: Any = None,
        session: AsyncSession | None = None,
    ) -> SettingValueResponse:
        """Parametr dəyərini həll edir (Resolution: Branch Override -> Company Value -> Default)."""
        if not can_view_settings(actor):
            raise ForbiddenError("Parametrlərə baxış hüququnuz yoxdur.")

        defn = SETTINGS_REGISTRY.get(key)
        if not defn:
            raise NotFoundError(f"'{key}' adlı parametr reyestrdə mövcud deyil.")

        # Keş yoxlanışı (Yalnız cari zaman sorğuları üçün)
        cache_key = (key, branch_id)
        if at is None and cache_key in self._cache:
            return self._cache[cache_key]

        if session is not None:
            return await self._resolve_setting(session, key, defn, branch_id, at, cache_key)

        async with db_module.AsyncSessionLocal() as db_session:
            return await self._resolve_setting(db_session, key, defn, branch_id, at, cache_key)

    async def update_setting(
        self,
        key: str,
        data: SettingUpdateRequest,
        actor: Any = None,
    ) -> SettingValueResponse:
        """Parametr dəyərini yeniləyir (Versiyalanmış tarixçəyə yeni sətir əlavə edir)."""
        defn = SETTINGS_REGISTRY.get(key)
        if not defn:
            raise NotFoundError(f"'{key}' adlı parametr reyestrdə mövcud deyil.")

        # İcazə yoxlanışı
        if data.branch_id is not None:
            if not can_manage_branch_settings(actor, data.branch_id):
                raise ForbiddenError("Bu filialın parametrlərini redaktə etmək hüququnuz yoxdur.")
        else:
            if not can_manage_settings(actor):
                raise ForbiddenError("Şirkət parametrlərini redaktə etmək hüququnuz yoxdur.")

        # Əsaslandırma tələbi yoxlanışı
        if (defn.requires_reason or defn.sensitivity in ("sensitive", "critical")) and (
            not data.reason or len(data.reason.strip()) < 3
        ):
            raise BusinessRuleViolationError(
                f"'{key}' həssas parametr olduğu üçün dəyişikliyin biznes əsaslandırması (reason) mütləq qeyd edilməlidir."
            )

        company_svc = get_company_service()
        company_id = await company_svc.get_company_id()

        current_val_resp = await self.get(key, branch_id=data.branch_id, actor=actor)

        effective_from = data.effective_from or utc_now()
        actor_id = getattr(actor, "id", None)

        async with UnitOfWork() as uow:
            latest_version = await self.repo.get_latest_version(
                uow.session, key, branch_id=data.branch_id
            )
            new_version = latest_version + 1

            setting_row = SettingValue(
                id=generate_uuid7(),
                company_id=company_id,
                branch_id=data.branch_id,
                key=key,
                value=data.value,
                effective_from=effective_from,
                version=new_version,
                reason=data.reason.strip() if data.reason else None,
                updated_by=actor_id,
                created_at=utc_now(),
            )
            created = await self.repo.create_value(uow.session, setting_row)

            # Audit
            await record_audit_event(
                session=uow.session,
                action="SETTING_UPDATED",
                resource_type="settings",
                resource_id=key,
                actor_id=actor_id,
                branch_id=data.branch_id,
                diff={
                    "key": key,
                    "before": current_val_resp.value,
                    "after": data.value,
                    "reason": data.reason,
                    "version": new_version,
                },
                severity="warning" if defn.sensitivity in ("sensitive", "critical") else "info",
            )

            # Outbox Hadisəsi (Keşin təmizlənməsi üçün)
            event = SettingChangedEvent(
                key=key,
                branch_id=data.branch_id,
                version=new_version,
                diff={"before": current_val_resp.value, "after": data.value},
            )
            await record_outbox_event(uow.session, event)
            await uow.commit()

        # Lokal keşi təmizləyirik
        if data.branch_id is None:
            keys_to_pop = [k for k in self._cache if k[0] == key]
            for k in keys_to_pop:
                self._cache.pop(k, None)
        else:
            self._cache.pop((key, data.branch_id), None)

        return SettingValueResponse(
            key=key,
            value=created.value,
            effective_from=created.effective_from,
            version=created.version,
            reason=created.reason,
            branch_id=created.branch_id,
            source="branch_override" if created.branch_id else "company_value",
            history_id=created.id,
        )

    async def preview_setting(
        self, data: SettingPreviewRequest, actor: Any = None
    ) -> SettingPreviewResponse:
        """Dəyişiklikdən əvvəl fərqi (diff) təhlil edir."""
        current = await self.get(data.key, branch_id=data.branch_id, actor=actor)
        diff = {"before": current.value, "after": data.new_value}
        return SettingPreviewResponse(
            key=data.key,
            current_value=current.value,
            new_value=data.new_value,
            diff=diff,
            scope="branch" if data.branch_id else "company",
            is_changed=(current.value != data.new_value),
        )

    async def list_history(
        self, key: str, branch_id: uuid.UUID | None = None, actor: Any = None
    ) -> list[SettingHistoryResponse]:
        """Parametrin keçmiş versiyalarının siyahısını qaytarır."""
        if not can_view_settings(actor):
            raise ForbiddenError("Parametr tarixçəsinə baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            rows = await self.repo.list_history(uow.session, key, branch_id=branch_id)
            return [
                SettingHistoryResponse(
                    id=r.id,
                    key=r.key,
                    value=r.value,
                    effective_from=r.effective_from,
                    version=r.version,
                    reason=r.reason,
                    branch_id=r.branch_id,
                    updated_by=r.updated_by,
                    created_at=r.created_at,
                )
                for r in rows
            ]

    async def restore_version(
        self, key: str, data: SettingRestoreRequest, actor: Any = None
    ) -> SettingValueResponse:
        """Keçmiş versiyanı bərpa edərək yeni versiya kimi yazır."""
        async with UnitOfWork() as uow:
            target_history = await self.repo.get_value_by_id(uow.session, data.history_id)
            if not target_history or target_history.key != key:
                raise NotFoundError("Bərpa ediləcək tarixçə qeydi tapılmadı.")

        update_dto = SettingUpdateRequest(
            value=target_history.value,
            branch_id=target_history.branch_id,
            reason=f"Bərpa: {data.reason} (v{target_history.version} əsasında)",
        )
        return await self.update_setting(key, update_dto, actor=actor)

    # --- Səbəb Kodları (Reason Codes) İdarəsi ---

    async def list_reason_codes(
        self,
        category: str | None = None,
        is_active: bool | None = None,
        actor: Any = None,
    ) -> list[ReasonCodeResponse]:
        """Səbəb kodlarını siyahılayır."""
        if not can_view_settings(actor):
            raise ForbiddenError("Səbəb kodlarına baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            codes = await self.repo.list_reason_codes(
                uow.session, category=category, is_active=is_active
            )
            return [ReasonCodeResponse.model_validate(c) for c in codes]

    async def create_reason_code(
        self, data: ReasonCodeCreate, actor: Any = None
    ) -> ReasonCodeResponse:
        """Yeni səbəb kodu yaradır."""
        if not can_manage_settings(actor):
            raise ForbiddenError("Səbəb kodu yaratmaq hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            existing = await self.repo.get_reason_code_by_category_and_code(
                uow.session, data.category, data.code
            )
            if existing:
                raise ConflictError(
                    f"'{data.category}' kateqoriyasında '{data.code}' səbəb kodu artıq mövcuddur."
                )

            rc = ReasonCode(
                id=generate_uuid7(),
                category=data.category,
                code=data.code.strip().upper(),
                name_az=data.name_az.strip(),
                description=data.description.strip() if data.description else None,
                is_active=True,
                is_system=False,
                usage_count=0,
                version=1,
            )
            created = await self.repo.create_reason_code(uow.session, rc)
            await uow.commit()
            return ReasonCodeResponse.model_validate(created)

    async def update_reason_code(
        self, code_id: uuid.UUID, data: ReasonCodeUpdate, actor: Any = None
    ) -> ReasonCodeResponse:
        """Səbəb kodunu redaktə edir."""
        if not can_manage_settings(actor):
            raise ForbiddenError("Səbəb kodunu redaktə etmək hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            rc = await self.repo.get_reason_code_by_id(uow.session, code_id)
            if not rc:
                raise NotFoundError("Səbəb kodu tapılmadı.")

            if data.name_az is not None:
                rc.name_az = data.name_az.strip()
            if data.description is not None:
                rc.description = data.description.strip()
            if data.is_active is not None:
                rc.is_active = data.is_active

            updated = await self.repo.update_reason_code(
                uow.session, rc, expected_version=data.version
            )
            await uow.commit()
            return ReasonCodeResponse.model_validate(updated)

    async def delete_reason_code(self, code_id: uuid.UUID, actor: Any = None) -> None:
        """Səbəb kodunu silir (İstifadə olunmuş kodlar silinə bilməz!)."""
        if not can_manage_settings(actor):
            raise ForbiddenError("Səbəb kodunu silmək hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            rc = await self.repo.get_reason_code_by_id(uow.session, code_id)
            if not rc:
                raise NotFoundError("Səbəb kodu tapılmadı.")

            if rc.is_system:
                raise BusinessRuleViolationError("Sistem səbəb kodu silinə bilməz.")

            if rc.usage_count > 0:
                raise BusinessRuleViolationError(
                    f"Bu səbəb kodu artıq əməliyyatlarda ({rc.usage_count} dəfə) istifadə olunub. "
                    "Məlumat bütövlüyü naminə silinə bilməz, yalnız deaktiv edilə bilər."
                )

            await self.repo.delete_reason_code(uow.session, rc)
            await uow.commit()


_settings_service: SettingsService | None = None


def get_settings_service() -> SettingsService:
    global _settings_service
    if _settings_service is None:
        _settings_service = SettingsService()
    return _settings_service
