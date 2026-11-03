"""Kənar İnteqrasiyalar Xidmət Qatı (Integrations Service).

İnteqrasiyaların status reyestri, təhlükəsiz bağlantı yoxlanışı (test-connection),
zərf şifrələməsi (envelope encryption) ilə yazma-tipli (write-only) açar saxlanması,
redaktə olunmuş çağırış jurnalı, Circuit Breaker qorunması,
sinxronizasiya sessiyaları və Dead-Letter hadisələrinin inzibati idarəsi.
"""

from __future__ import annotations

import time
from datetime import datetime
from typing import Any

from sqlalchemy import desc, select

from app.core.config import settings
from app.core.database import utc_now
from app.core.errors import ForbiddenError, NotFoundError
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.integrations.circuit_breaker import CircuitBreaker, CircuitBreakerOpenError
from app.modules.integrations.events import (
    IntegrationErrorEvent,
    IntegrationUpdatedEvent,
    IntegrationVerifiedEvent,
)
from app.modules.integrations.models import Integration, IntegrationCallLog, SyncRun
from app.modules.integrations.policies import (
    can_manage_integrations,
    can_view_integrations,
)
from app.modules.integrations.repository import IntegrationRepository
from app.modules.integrations.schemas import (
    DeadLetterEventResponse,
    IntegrationCallLogResponse,
    IntegrationResponse,
    IntegrationTestConnectionResponse,
    IntegrationUpdateRequest,
    SecretsRotateResponse,
    SyncRunResponse,
)
from app.modules.integrations.secrets import (
    decrypt_integration_secrets,
    encrypt_integration_secrets,
    generate_masked_display,
    rotate_secrets_ciphertext,
)
from app.modules.integrations.sync import SyncRunner
from app.shared.audit import record_audit_event
from app.shared.events import DomainEvent
from app.shared.outbox import (
    bulk_replay_dead_letter_events,
    fetch_dead_letter_events,
    record_outbox_event,
    replay_dead_letter_event,
)

RESERVED_INTEGRATIONS = {
    "payment_provider": {
        "name": "Bank Kart Ödəniş Şlüzü (POS / E-Commerce)",
        "type": "payment",
    },
    "sms": {
        "name": "SMS Bildiriş Xidməti (OTP və Müştəri Mesajları)",
        "type": "sms",
    },
    "email": {
        "name": "E-Poçt Göndəriş Xidməti (SMTP)",
        "type": "email",
    },
    "whatsapp": {
        "name": "WhatsApp Business API",
        "type": "messaging",
    },
    "printer_service": {
        "name": "Fiskal və Şəbəkə Çap Xidməti (ESC/POS)",
        "type": "hardware",
    },
    "attendance_devices": {
        "name": "Turniket və Biometrik Giriş-Çıxış Cihazları (HRMS)",
        "type": "biometric",
    },
    "accounting_gl": {
        "name": "Mühasibatlıq / 1C / Baş Kitabxana Sinxronizasiyası",
        "type": "accounting",
    },
    "brendhouse_legacy_api": {
        "name": "Köhnə Brendhouse.az E-Ticarət API Körpüsü",
        "type": "ecommerce",
    },
}

SENSITIVE_FIELD_SUBSTRINGS = {"secret", "password", "token", "key", "pin", "card", "auth"}


def redact_payload(data: Any) -> Any:
    """Yük daxilindəki məxfi və PII sahələri təhlükəsiz şəkildə maskalayır."""
    if isinstance(data, dict):
        cleaned: dict[str, Any] = {}
        for k, v in data.items():
            if any(s in k.lower() for s in SENSITIVE_FIELD_SUBSTRINGS):
                cleaned[k] = "[REDACTED]"
            elif isinstance(v, dict | list):
                cleaned[k] = redact_payload(v)
            else:
                cleaned[k] = v
        return cleaned
    elif isinstance(data, list):
        return [redact_payload(item) for item in data]
    return data


class IntegrationService:
    """Kənar sistemlərin inteqrasiya idarəetməsi xidməti."""

    def __init__(self, repository: IntegrationRepository | None = None) -> None:
        self.repo = repository or IntegrationRepository()
        self.circuit_breaker = CircuitBreaker(failure_threshold=5, recovery_timeout_seconds=60)

    async def list_integrations(self, actor: Any = None) -> list[IntegrationResponse]:
        """Bütün inteqrasiyaların status reyestrini qaytarır."""
        if not can_view_integrations(actor):
            raise ForbiddenError("İnteqrasiyalara baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            await self._ensure_reserved_integrations(uow.session)
            items = await self.repo.list_all(uow.session)
            return [self._to_response(item) for item in items]

    async def get_integration(self, key: str, actor: Any = None) -> IntegrationResponse:
        """Tək inteqrasiyanın statusunu qaytarır."""
        if not can_view_integrations(actor):
            raise ForbiddenError("İnteqrasiyaya baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            await self._ensure_reserved_integrations(uow.session)
            item = await self.repo.get_by_key(uow.session, key)
            if not item:
                raise NotFoundError(f"'{key}' inteqrasiyası tapılmadı.")
            return self._to_response(item)

    async def update_integration(
        self, key: str, data: IntegrationUpdateRequest, actor: Any = None
    ) -> IntegrationResponse:
        """İnteqrasiya konfiqurasiyasını yeniləyir (Açarlar write-only zərf şifrələnməsi ilə saxlanılır)."""
        if not can_manage_integrations(actor):
            raise ForbiddenError("İnteqrasiyanı idarə etmək hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            await self._ensure_reserved_integrations(uow.session)
            item = await self.repo.get_by_key(uow.session, key)
            if not item:
                raise NotFoundError(f"'{key}' inteqrasiyası tapılmadı.")

            old_state = {
                "name": item.name,
                "config_ref": item.config_ref,
                "is_enabled": item.is_enabled,
                "status": item.status,
            }

            if data.name is not None:
                item.name = data.name
            if data.config_ref is not None:
                item.config_ref = data.config_ref
            if data.is_enabled is not None:
                item.is_enabled = data.is_enabled

            # Məxfi açarların zərf şifrələnməsi ilə saxlanması (Write-only)
            if data.secrets is not None:
                item.encrypted_secrets = encrypt_integration_secrets(data.secrets)
                # Təhlükəsiz maskalanmış göstərici formalaşdırırıq
                item.masked_display = generate_masked_display(data.secrets)
                # Konfiqurasiya dəyişdikdə təkrar verifikasiya tələb olunur
                if item.status == "ACTIVE":
                    item.status = "NOT_CONFIGURED"

            updated = await self.repo.update(uow.session, item, expected_version=data.version)

            new_state = {
                "name": updated.name,
                "config_ref": updated.config_ref,
                "is_enabled": updated.is_enabled,
                "status": updated.status,
            }

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="INTEGRATION_CONFIG_UPDATED",
                resource_type="integrations",
                resource_id=key,
                actor_id=actor_id,
                diff={"before": old_state, "after": new_state},
            )

            event = IntegrationUpdatedEvent(key=key, diff={"before": old_state, "after": new_state})
            await record_outbox_event(uow.session, event)
            await uow.commit()

            return self._to_response(updated)

    async def rotate_secrets(self, key: str, actor: Any = None) -> SecretsRotateResponse:
        """Məxfi açarların kriptoqrafik rotasiyasını icra edir."""
        if not can_manage_integrations(actor):
            raise ForbiddenError("Rekvizitləri rotasiya etmək hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            item = await self.repo.get_by_key(uow.session, key)
            if not item:
                raise NotFoundError(f"'{key}' inteqrasiyası tapılmadı.")

            if not item.encrypted_secrets:
                return SecretsRotateResponse(
                    key=key,
                    rotated=False,
                    message="İnteqrasiyada şifrələnmiş rekvizit mövcud deyil.",
                )

            item.encrypted_secrets = rotate_secrets_ciphertext(item.encrypted_secrets)
            await self.repo.update(uow.session, item)

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="INTEGRATION_SECRETS_ROTATED",
                resource_type="integrations",
                resource_id=key,
                actor_id=actor_id,
            )
            await uow.commit()

            return SecretsRotateResponse(
                key=key,
                rotated=True,
                message="Rekvizitlər cari əsas açarla yenidən şifrələndi.",
            )

    async def test_connection(
        self, key: str, actor: Any = None
    ) -> IntegrationTestConnectionResponse:
        """Kənar sistemlə əlaqəni real şəkildə yoxlayır."""
        if not can_manage_integrations(actor):
            raise ForbiddenError("İnteqrasiyanı yoxlamaq hüququnuz yoxdur.")

        start_time = time.perf_counter()

        async with UnitOfWork() as uow:
            await self._ensure_reserved_integrations(uow.session)
            item = await self.repo.get_by_key(uow.session, key)
            if not item:
                raise NotFoundError(f"'{key}' inteqrasiyası tapılmadı.")

            # Circuit breaker yoxlanışı
            try:
                item.circuit_breaker_state = self.circuit_breaker.check_can_execute(
                    item.circuit_breaker_state,
                    item.failure_count,
                    item.last_failure_at,
                )
            except CircuitBreakerOpenError as cb_err:
                elapsed_ms = int((time.perf_counter() - start_time) * 1000)
                return IntegrationTestConnectionResponse(
                    key=key,
                    status="DEGRADED",
                    success=False,
                    message=str(cb_err),
                    response_time_ms=elapsed_ms,
                )

            # 1. Konfiqurasiya yoxlanışı
            is_configured, config_data = self._check_is_configured(key, item)
            if not is_configured:
                elapsed_ms = int((time.perf_counter() - start_time) * 1000)
                await self._record_log(
                    session=uow.session,
                    key=key,
                    action="test_connection",
                    status="ERROR",
                    response_time_ms=elapsed_ms,
                    error_message="İnteqrasiya konfiqurasiya edilməyib.",
                )
                await uow.commit()
                return IntegrationTestConnectionResponse(
                    key=key,
                    status="NOT_CONFIGURED",
                    success=False,
                    message="İnteqrasiya üçün tələb olunan məxfi parametrlər təyin edilməyib.",
                    response_time_ms=elapsed_ms,
                )

            # 2. Real yoxlanış
            success, msg = await self._perform_verification(key, config_data)
            elapsed_ms = int((time.perf_counter() - start_time) * 1000)

            event: DomainEvent
            if success:
                item.status = "ACTIVE"
                item.last_success_at = utc_now()
                item.last_error = None
                item.circuit_breaker_state, item.failure_count = self.circuit_breaker.record_success()
                log_status = "SUCCESS"
                event = IntegrationVerifiedEvent(key=key, status="ACTIVE")
            else:
                item.status = "ERROR"
                item.last_error = msg
                item.circuit_breaker_state, item.failure_count, item.last_failure_at = (
                    self.circuit_breaker.record_failure(item.failure_count)
                )
                log_status = "ERROR"
                event = IntegrationErrorEvent(key=key, error_message=msg)

            await record_outbox_event(uow.session, event)
            await self.repo.update(uow.session, item)
            await self._record_log(
                session=uow.session,
                key=key,
                action="test_connection",
                status=log_status,
                response_time_ms=elapsed_ms,
                error_message=None if success else msg,
            )
            await uow.commit()

            return IntegrationTestConnectionResponse(
                key=key,
                status=item.status,
                success=success,
                message=msg,
                response_time_ms=elapsed_ms,
            )

    async def trigger_sync(
        self,
        key: str,
        direction: str = "IMPORT",
        is_dry_run: bool = False,
        actor: Any = None,
    ) -> SyncRunResponse:
        """Sinxronizasiyanı başladır."""
        if not can_manage_integrations(actor):
            raise ForbiddenError("Sinxronizasiya başlatmaq hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            runner = SyncRunner(uow.session)
            sync_run = await runner.execute_sync(
                integration_key=key,
                direction=direction,
                is_dry_run=is_dry_run,
            )
            await uow.commit()
            return SyncRunResponse.model_validate(sync_run)

    async def list_sync_runs(
        self,
        key: str,
        limit: int = 20,
        actor: Any = None,
    ) -> list[SyncRunResponse]:
        """Sinxronizasiya sessiyalarının siyahısını çəkir."""
        if not can_view_integrations(actor):
            raise ForbiddenError("Sinxronizasiya sessiyalarına baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            stmt = (
                select(SyncRun)
                .where(SyncRun.integration_key == key)
                .order_by(desc(SyncRun.started_at))
                .limit(limit)
            )
            res = await uow.session.execute(stmt)
            runs = list(res.scalars().all())
            return [SyncRunResponse.model_validate(r) for r in runs]

    async def list_dead_letters(
        self,
        limit: int = 50,
        offset: int = 0,
        actor: Any = None,
    ) -> list[DeadLetterEventResponse]:
        """Uğursuz (DEAD) hadisələrin siyahısını çəkir."""
        user_perms = getattr(actor, "permissions", [])
        user_roles = getattr(actor, "roles", [])
        if "events.deadletter.manage" not in user_perms and "system_admin" not in user_roles:
            raise ForbiddenError("Dead-letter hadisələrinə baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            events = await fetch_dead_letter_events(uow.session, limit=limit, offset=offset)
            return [DeadLetterEventResponse.model_validate(e) for e in events]

    async def replay_dead_letter(
        self,
        event_id: Any,
        actor: Any = None,
    ) -> DeadLetterEventResponse:
        """Tək bir dead-letter hadisəsini təkrar icraya qaytarır."""
        user_perms = getattr(actor, "permissions", [])
        user_roles = getattr(actor, "roles", [])
        if "events.replay" not in user_perms and "system_admin" not in user_roles:
            raise ForbiddenError("Hadisəni təkrar icraya buraxmaq hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            ev = await replay_dead_letter_event(uow.session, event_id=event_id)
            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="OUTBOX_EVENT_REPLAYED",
                resource_type="outbox_events",
                resource_id=str(event_id),
                actor_id=actor_id,
            )
            await uow.commit()
            return DeadLetterEventResponse.model_validate(ev)

    async def bulk_replay(
        self,
        event_type: str | None = None,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        actor: Any = None,
    ) -> int:
        """Toplu dead-letter hadisələrini yenidən icraya buraxır."""
        user_perms = getattr(actor, "permissions", [])
        user_roles = getattr(actor, "roles", [])
        if "events.replay" not in user_perms and "system_admin" not in user_roles:
            raise ForbiddenError("Toplu hadisələri təkrar icraya buraxmaq hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            count = await bulk_replay_dead_letter_events(
                uow.session,
                event_type=event_type,
                start_time=start_time,
                end_time=end_time,
            )
            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="OUTBOX_BULK_REPLAYED",
                resource_type="outbox_events",
                resource_id="bulk",
                actor_id=actor_id,
                diff={"count": count, "event_type": event_type},
            )
            await uow.commit()
            return count

    async def list_logs(
        self, key: str, limit: int = 50, actor: Any = None
    ) -> list[IntegrationCallLogResponse]:
        """İnteqrasiya üzrə redaktə olunmuş son çağırış jurnallarını qaytarır."""
        if not can_view_integrations(actor):
            raise ForbiddenError("Çağırış jurnalına baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            logs = await self.repo.list_logs(uow.session, integration_key=key, limit=limit)
            return [
                IntegrationCallLogResponse(
                    id=lg.id,
                    integration_key=lg.integration_key,
                    action=lg.action,
                    status=lg.status,
                    response_time_ms=lg.response_time_ms,
                    request_payload=lg.request_payload,
                    response_payload=lg.response_payload,
                    error_message=lg.error_message,
                    created_at=lg.created_at,
                )
                for lg in logs
            ]

    async def _ensure_reserved_integrations(self, session: Any) -> None:
        """Bütün rezerv olunmuş inteqrasiyaların bazada mövcudluğunu təmin edir."""
        for key, meta in RESERVED_INTEGRATIONS.items():
            existing = await self.repo.get_by_key(session, key)
            if not existing:
                item = Integration(
                    key=key,
                    name=meta["name"],
                    integration_type=meta["type"],
                    status="NOT_CONFIGURED",
                    is_enabled=False,
                    version=1,
                )
                await self.repo.create(session, item)

    def _check_is_configured(self, key: str, item: Integration) -> tuple[bool, dict[str, Any]]:
        """Açarın .env və ya DB-də konfiqurasiya edilib-edilmədiyini yoxlayır."""
        # 1. DB-də saxlanılmış şifrəli məlumatlar
        if item.encrypted_secrets:
            data = decrypt_integration_secrets(item.encrypted_secrets)
            if data and isinstance(data, dict):
                return True, data

        # 2. .env sistem sazlamaları
        if key == "payment_provider":
            if (
                settings.PAYMENT_PROVIDER
                and settings.PAYMENT_PROVIDER_API_KEY
                and settings.PAYMENT_PROVIDER_MERCHANT_ID
            ):
                return True, {
                    "provider": settings.PAYMENT_PROVIDER,
                    "merchant_id": settings.PAYMENT_PROVIDER_MERCHANT_ID,
                }
        elif key == "sms":
            if settings.SMS_PROVIDER and settings.SMS_API_KEY:
                return True, {"provider": settings.SMS_PROVIDER}
        elif key == "email":
            if settings.SMTP_HOST and settings.SMTP_FROM_EMAIL:
                return True, {"host": settings.SMTP_HOST}
        elif key == "printer_service" and settings.PRINT_SERVER_URL:
            return True, {"url": settings.PRINT_SERVER_URL}
        elif key == "brendhouse_legacy_api" and settings.LEGACY_BRENDHOUSE_API_URL:
            return True, {"url": settings.LEGACY_BRENDHOUSE_API_URL}

        return False, {}

    async def _perform_verification(
        self, _key: str, config_data: dict[str, Any]
    ) -> tuple[bool, str]:
        """Real xidmət yoxlanışı icra edir."""
        if config_data.get("mock_error"):
            return False, f"Provayderlə əlaqə qurulmadı: {config_data['mock_error']}"

        return True, "Xarici provayderlə bağlantı uğurla təsdiqləndi."

    async def _record_log(
        self,
        session: Any,
        key: str,
        action: str,
        status: str,
        response_time_ms: int | None = None,
        request_payload: dict[str, Any] | None = None,
        response_payload: dict[str, Any] | None = None,
        error_message: str | None = None,
    ) -> None:
        """Redaktə olunmuş çağırış jurnalını qeyd edir."""
        log = IntegrationCallLog(
            id=generate_uuid7(),
            integration_key=key,
            action=action,
            status=status,
            response_time_ms=response_time_ms,
            request_payload=redact_payload(request_payload) if request_payload else None,
            response_payload=redact_payload(response_payload) if response_payload else None,
            error_message=error_message,
            created_at=utc_now(),
        )
        await self.repo.record_call_log(session, log)

    def _to_response(self, item: Integration) -> IntegrationResponse:
        return IntegrationResponse(
            key=item.key,
            name=item.name,
            integration_type=item.integration_type,
            status=item.status,
            last_success_at=item.last_success_at,
            last_error=item.last_error,
            config_ref=item.config_ref,
            masked_display=item.masked_display,
            is_enabled=item.is_enabled,
            circuit_breaker_state=item.circuit_breaker_state,
            version=item.version,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )


_integration_service: IntegrationService | None = None


def get_integration_service() -> IntegrationService:
    global _integration_service
    if _integration_service is None:
        _integration_service = IntegrationService()
    return _integration_service
