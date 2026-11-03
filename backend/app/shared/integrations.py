"""Kənar İnteqrasiyaların Vəziyyəti və Şəffaflıq Modulu (Integrations Status).

Konfiqurasiya edilməmiş xidmətlər üçün heç vaxt yalandan "işləyir" görüntüsü yaradılmır;
həmişə açıq və şəffaf şəkildə "NOT CONFIGURED" vəziyyəti qaytarılır.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.config import settings

router = APIRouter(prefix="/integrations", tags=["Kənar İnteqrasiyalar"])


class IntegrationStatus(BaseModel):
    """Tək bir inteqrasiyanın vəziyyət obyekti."""

    status: str = Field(..., description="'CONFIGURED' və ya 'NOT CONFIGURED'")
    configured: bool = Field(..., description="İnteqrasiya aktivdirmi?")
    provider: str | None = Field(
        default=None, description="Provayder adı (məs: Pasha Bank, Azercell)"
    )
    missing_keys: list[str] = Field(default_factory=list, description="Çatışmayan .env dəyişənləri")
    description: str = Field(..., description="İnteqrasiyanın təyinatı")


class AllIntegrationsStatusResponse(BaseModel):
    """Bütün kənar inteqrasiyaların status hesabatı."""

    payment_gateway: IntegrationStatus
    sms_service: IntegrationStatus
    email_service: IntegrationStatus
    fiscal_printer: IntegrationStatus
    legacy_brendhouse_api: IntegrationStatus
    redis_cache: IntegrationStatus


def get_integrations_status_dict() -> dict[str, Any]:
    """Bütün inteqrasiyaların cari status lüğətini formalaşdırır."""
    # 1. Ödəniş Sistemi
    missing_payment: list[str] = []
    if not settings.PAYMENT_PROVIDER:
        missing_payment.append("PAYMENT_PROVIDER")
    if not settings.PAYMENT_PROVIDER_API_KEY:
        missing_payment.append("PAYMENT_PROVIDER_API_KEY")
    if not settings.PAYMENT_PROVIDER_MERCHANT_ID:
        missing_payment.append("PAYMENT_PROVIDER_MERCHANT_ID")

    is_payment_ready = len(missing_payment) == 0
    payment_status = {
        "status": "CONFIGURED" if is_payment_ready else "NOT CONFIGURED",
        "configured": is_payment_ready,
        "provider": settings.PAYMENT_PROVIDER if is_payment_ready else None,
        "missing_keys": missing_payment,
        "description": "Onlayn və POS kart ödənişlərinin emalı (Bank şlüzü)",
    }

    # 2. SMS Bildiriş Provayderi
    missing_sms: list[str] = []
    if not settings.SMS_PROVIDER:
        missing_sms.append("SMS_PROVIDER")
    if not settings.SMS_API_KEY:
        missing_sms.append("SMS_API_KEY")

    is_sms_ready = len(missing_sms) == 0
    sms_status = {
        "status": "CONFIGURED" if is_sms_ready else "NOT CONFIGURED",
        "configured": is_sms_ready,
        "provider": settings.SMS_PROVIDER if is_sms_ready else None,
        "missing_keys": missing_sms,
        "description": "Müştəri OTP və bildiriş SMS göndərişi",
    }

    # 3. E-Poçt (SMTP)
    missing_email: list[str] = []
    if not settings.SMTP_HOST:
        missing_email.append("SMTP_HOST")
    if not settings.SMTP_FROM_EMAIL:
        missing_email.append("SMTP_FROM_EMAIL")

    is_email_ready = len(missing_email) == 0
    email_status = {
        "status": "CONFIGURED" if is_email_ready else "NOT CONFIGURED",
        "configured": is_email_ready,
        "provider": settings.SMTP_HOST if is_email_ready else None,
        "missing_keys": missing_email,
        "description": "Sistem xəbərdarlıqları və hesabat e-poçtları",
    }

    # 4. Fiskal / Şəbəkə Printeri
    missing_printer: list[str] = []
    if not settings.PRINT_SERVER_URL:
        missing_printer.append("PRINT_SERVER_URL")

    is_printer_ready = len(missing_printer) == 0
    printer_status = {
        "status": "CONFIGURED" if is_printer_ready else "NOT CONFIGURED",
        "configured": is_printer_ready,
        "provider": "Network Print Server" if is_printer_ready else None,
        "missing_keys": missing_printer,
        "description": "POS kassa və anbar barkod çap xidməti",
    }

    # 5. Köhnə Brendhouse.az API
    missing_legacy: list[str] = []
    if not settings.LEGACY_BRENDHOUSE_API_URL:
        missing_legacy.append("LEGACY_BRENDHOUSE_API_URL")

    is_legacy_ready = len(missing_legacy) == 0
    legacy_status = {
        "status": "CONFIGURED" if is_legacy_ready else "NOT CONFIGURED",
        "configured": is_legacy_ready,
        "provider": "Brendhouse Legacy E-commerce API" if is_legacy_ready else None,
        "missing_keys": missing_legacy,
        "description": "Köhnə brendhouse.az e-ticarət sistemi ilə sinxronizasiya",
    }

    # 6. Redis Keş
    is_redis_ready = bool(settings.REDIS_ENABLED and settings.REDIS_URL)
    redis_status = {
        "status": "CONFIGURED" if is_redis_ready else "NOT CONFIGURED",
        "configured": is_redis_ready,
        "provider": "Redis 7" if is_redis_ready else None,
        "missing_keys": ["REDIS_URL"] if not is_redis_ready else [],
        "description": "Rate limiting, paylanmış kilidlər və iş növbəsi",
    }

    return {
        "payment_gateway": payment_status,
        "sms_service": sms_status,
        "email_service": email_status,
        "fiscal_printer": printer_status,
        "legacy_brendhouse_api": legacy_status,
        "redis_cache": redis_status,
    }


@router.get(
    "/status",
    response_model=AllIntegrationsStatusResponse,
    summary="Bütün Kənar İnteqrasiyaların Vəziyyəti",
)
async def get_all_integrations_status() -> AllIntegrationsStatusResponse:
    """Kənar sistemlərin (ödəniş, SMS, e-poçt, printer) konfiqurasiya vəziyyətini qaytarır.

    Heç vaxt konfiqurasiya edilməmiş xidmət 'işləyir' kimi göstərilmir.
    """
    data = get_integrations_status_dict()
    return AllIntegrationsStatusResponse(**data)
