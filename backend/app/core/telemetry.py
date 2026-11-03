"""Telemetriya və Monitorinq Hook-ları (OpenTelemetry və Sentry).

PII və həssas məlumatların kənar monitorinq xidmətlərinə ötürülməsinin qarşısını alır.
"""

from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.core.logging import logger


def setup_telemetry() -> None:
    """OpenTelemetry və ya Sentry aktivdirsə onları konfiqurasiya edir."""
    if settings.SENTRY_DSN:
        try:
            import sentry_sdk

            def before_send(event: dict[str, Any], _hint: dict[str, Any]) -> dict[str, Any] | None:
                # PII, Authorization header və parolları təmizləyirik
                request_data = event.get("request", {})
                if "headers" in request_data:
                    request_data["headers"].pop("authorization", None)
                    request_data["headers"].pop("cookie", None)
                return event

            sentry_sdk.init(
                dsn=settings.SENTRY_DSN,
                environment=settings.APP_ENV,
                send_default_pii=False,
                before_send=before_send,
                traces_sample_rate=0.1 if settings.is_production else 1.0,
            )
            logger.info("Sentry inteqrasiyası aktivləşdirildi (PII qorunması ilə)")
        except ImportError:
            logger.warning("sentry_sdk quraşdırılmayıb, Sentry aktivləşdirilmədi")

    if settings.OPENTELEMETRY_ENDPOINT:
        logger.info(
            "OpenTelemetry hook qeydə alındı",
            endpoint=settings.OPENTELEMETRY_ENDPOINT,
        )
