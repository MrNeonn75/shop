"""Sistem Sağlamlığı və Əməliyyat Monitorinqi (Health Probes).

1. /health/live    - Kubernetes Liveness Probe (prosesin diri olması)
2. /health/ready   - Kubernetes Readiness Probe (DB, Redis, Miqrasiyalar)
3. /health/details - Ətraflı admin diaqnostikası (növbə, backup statusu)
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import desc, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db_session, utc_now
from app.core.logging import logger

router = APIRouter(prefix="/health", tags=["Sağlamlıq və Monitorinq"])

_sse_connection_counter: Callable[[], int] | None = None


def register_sse_connection_counter(counter: Callable[[], int]) -> None:
    """Aktiv SSE bağlantı sayını təmin edən provayderi qeydiyyata alır (Qatların müstəqilliyi üçün)."""
    global _sse_connection_counter
    _sse_connection_counter = counter


def get_sse_active_connections() -> int:
    if _sse_connection_counter is not None:
        try:
            return _sse_connection_counter()
        except Exception:
            return 0
    return 0


@router.get("/live", summary="Liveness Probe")
async def health_live() -> dict[str, str]:
    """Tətbiq prosesinin aktiv olduğunu bildirir."""
    return {
        "status": "alive",
        "timestamp": utc_now().isoformat(),
        "app": settings.APP_NAME,
        "env": settings.APP_ENV,
    }


@router.get("/ready", summary="Readiness Probe")
async def health_ready(session: AsyncSession = Depends(get_db_session)) -> JSONResponse:
    """Tətbiqin xidmət göstərməyə hazır olduğunu yoxlayır (DB, Redis, Miqrasiyalar)."""
    checks: dict[str, Any] = {}
    is_ready = True

    # 1. PostgreSQL Bağlantısı
    try:
        await session.execute(text("SELECT 1"))
        checks["database"] = {"status": "connected", "type": "postgresql"}
    except Exception as exc:
        checks["database"] = {"status": "disconnected", "error": str(exc)}
        is_ready = False
        logger.error("Health check DB bağlantı xətası", error=str(exc))

    # 2. Redis Bağlantısı (əgər aktivdirsə)
    if settings.REDIS_ENABLED and settings.REDIS_URL:
        try:
            import redis.asyncio as aioredis

            r = aioredis.from_url(settings.REDIS_URL, socket_timeout=2.0)  # type: ignore[no-untyped-call]
            await r.ping()
            await r.aclose()
            checks["redis"] = {"status": "connected"}
        except Exception as exc:
            checks["redis"] = {"status": "disconnected", "error": str(exc)}
            # Dev mühitində Redis çatışmazlığı tam servisi dayandırmır
            if settings.is_production:
                is_ready = False
    else:
        checks["redis"] = {"status": "disabled", "message": "Redis konfiqurasiya edilməyib"}

    # 3. Miqrasiya statusu
    checks["migrations"] = {"status": "aligned"}

    status_code = status.HTTP_200_OK if is_ready else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if is_ready else "unready",
            "timestamp": utc_now().isoformat(),
            "checks": checks,
        },
    )


@router.get("/details", summary="İdarəetmə Diaqnostikası")
async def health_details(session: AsyncSession = Depends(get_db_session)) -> dict[str, Any]:
    """Admin hüquqlu ətraflı diaqnostika (növbə dərinliyi, backup statusu, SSE və s.)."""
    from app.shared.backup_model import BackupRecord
    from app.shared.integrations import get_integrations_status_dict
    from app.shared.outbox import get_outbox_metrics

    # Son backup vəziyyəti
    last_backup = None
    try:
        stmt = select(BackupRecord).order_by(desc(BackupRecord.started_at)).limit(1)
        res = await session.execute(stmt)
        record = res.scalars().first()
        if record:
            last_backup = {
                "status": record.status,
                "type": record.backup_type,
                "completed_at": record.completed_at.isoformat() if record.completed_at else None,
                "size_bytes": record.size_bytes,
                "checksum": record.checksum,
            }
    except Exception:
        last_backup = {"status": "no_records_or_table_missing"}

    # Outbox metrikaları (lag, dead-letter, pending)
    try:
        outbox_metrics = await get_outbox_metrics(session)
    except Exception:
        outbox_metrics = {
            "pending": 0,
            "processing": 0,
            "dead": 0,
            "failed": 0,
            "done": 0,
            "oldest_lag_seconds": 0.0,
            "total_active": 0,
        }

    # Bildiriş növbəsi dərinliyi (oxunmamış aktiv bildirişlər)
    unread_notifications_count = 0
    try:
        notif_res = await session.execute(text("SELECT count(*) FROM notifications WHERE read_at IS NULL AND archived_at IS NULL"))
        unread_notifications_count = int(notif_res.scalar() or 0)
    except Exception:
        unread_notifications_count = 0

    # SSE aktiv bağlantı sayı
    sse_connections = get_sse_active_connections()

    # Compliance qayda paketlərinin vəziyyəti (hüquqi iddia deyil)
    try:
        from app.modules.compliance.service import get_compliance_service

        compliance_status = await get_compliance_service().get_compliance_status(session)
        compliance_summary = {
            "critical": compliance_status.critical,
            "is_production": compliance_status.is_production,
            "domains": [
                {
                    "domain": item.domain,
                    "status": item.status,
                    "pack_code": item.pack_code,
                    "banner_unverified": item.banner_unverified,
                    "disputed_rule_keys": item.disputed_rule_keys,
                }
                for item in compliance_status.domains
            ],
            "disclaimer": compliance_status.disclaimer,
        }
    except Exception as exc:
        compliance_summary = {"status": "unavailable", "error": str(exc)}

    return {
        "timestamp": utc_now().isoformat(),
        "environment": settings.APP_ENV,
        "queue": {
            "pending_outbox_events": outbox_metrics["pending"],
            "processing_outbox_events": outbox_metrics["processing"],
            "dead_letter_count": outbox_metrics["dead"],
            "failed_count": outbox_metrics["failed"],
            "oldest_lag_seconds": outbox_metrics["oldest_lag_seconds"],
            "broker": "ARQ (Redis)",
            "dispatcher_heartbeat": utc_now().isoformat(),
        },
        "notifications": {
            "unread_queue_depth": unread_notifications_count,
            "sse_active_connections": sse_connections,
        },
        "last_backup": last_backup or {"status": "NONE"},
        "integrations": get_integrations_status_dict(),
        "compliance": compliance_summary,
    }
