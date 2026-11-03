"""Mərkəzi Konfiqurasiya Modulu (Pydantic Settings).

Bütün ətraf mühit dəyişənləri tətbiq başladılan anda validasiya olunur.
Kod daxilində heç bir gizli məlumat (secret) saxlanılmır.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Literal

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # Əsas Tətbiq Parametrləri
    APP_NAME: str = "BRAND HOUSE ERP API"
    APP_ENV: Literal["development", "staging", "production", "testing"] = "development"
    DEBUG: bool = False
    PORT: int = 8000
    HOST: str = "0.0.0.0"

    # Təhlükəsizlik və JWT
    SECRET_KEY: SecretStr = SecretStr("insecure-dev-secret-key-change-in-production-min-32-chars")
    PII_ENCRYPTION_KEY: SecretStr = SecretStr("7c8zR_P6P7rO8B32qW4c6_9dD2jB1jL0mK7yU5xV3wE=")
    PII_ROTATION_KEYS: list[str] = []
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    JWT_ALGORITHM: str = "HS256"
    JWT_CURRENT_KID: str = "v1"
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"

    # Təhlükəsizlik Siyasətləri (Security Policies)
    SECURITY_PASSWORD_MIN_LENGTH: int = 8
    SECURITY_PASSWORD_REQUIRE_UPPERCASE: bool = True
    SECURITY_PASSWORD_REQUIRE_LOWERCASE: bool = True
    SECURITY_PASSWORD_REQUIRE_DIGITS: bool = True
    SECURITY_PASSWORD_REQUIRE_SYMBOLS: bool = True
    SECURITY_PASSWORD_HISTORY_COUNT: int = 5
    SECURITY_PASSWORD_EXPIRY_DAYS: int = 0
    SECURITY_MAX_LOGIN_ATTEMPTS: int = 5
    SECURITY_LOCKOUT_DURATION_MINUTES: int = 15
    SECURITY_SESSION_IDLE_TIMEOUT_MINUTES: int = 30
    SECURITY_SESSION_ABSOLUTE_TIMEOUT_HOURS: int = 24
    SECURITY_2FA_ENABLED: bool = True
    SECURITY_2FA_REQUIRED_ROLES: list[str] = ["system_admin", "general_manager"]
    SECURITY_IP_ALLOWLIST: list[str] = []

    # Saat Qurşağı və Lokalizasiya
    TIMEZONE: str = "Asia/Baku"
    DEFAULT_LOCALE: Literal["az", "en", "ru"] = "az"

    # PostgreSQL Verilənlər Bazası (PostgreSQL 16, asyncpg)
    DATABASE_URL: str = (
        "postgresql+asyncpg://postgres:postgrespassword@localhost:5432/brand_house_erp"
    )
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    DATABASE_POOL_TIMEOUT: int = 30
    DATABASE_ECHO: bool = False

    # Redis (Keş, Kilid və İş Növbəsi)
    REDIS_URL: str | None = "redis://localhost:6379/0"
    REDIS_ENABLED: bool = True

    # Idempotency
    IDEMPOTENCY_TTL_SECONDS: int = 86400  # 24 saat

    # Rate Limiting
    RATE_LIMIT_DEFAULT_PER_MINUTE: int = 120
    RATE_LIMIT_AUTH_PER_MINUTE: int = 10

    # Kənar İnteqrasiyalar (Könüllü - Boş qaldıqda /integrations/status "NOT CONFIGURED" verir)
    PAYMENT_PROVIDER: str | None = None
    PAYMENT_PROVIDER_API_KEY: SecretStr | None = None
    PAYMENT_PROVIDER_MERCHANT_ID: str | None = None
    PAYMENT_PROVIDER_BASE_URL: str | None = None

    SMS_PROVIDER: str | None = None
    SMS_API_KEY: SecretStr | None = None
    SMS_SENDER_NAME: str | None = None

    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: SecretStr | None = None
    SMTP_FROM_EMAIL: str | None = None

    PRINT_SERVER_URL: str | None = None
    PRINT_SERVER_API_KEY: SecretStr | None = None

    LEGACY_BRENDHOUSE_API_URL: str | None = None
    LEGACY_BRENDHOUSE_API_KEY: SecretStr | None = None

    # Telemetriya
    SENTRY_DSN: str | None = None
    OPENTELEMETRY_ENDPOINT: str | None = None

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            if v.startswith("[") and v.endswith("]"):
                try:
                    loaded = json.loads(v)
                    if isinstance(loaded, list):
                        return [str(item) for item in loaded]
                except Exception:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def is_development(self) -> bool:
        return self.APP_ENV == "development"

    @property
    def is_testing(self) -> bool:
        return self.APP_ENV == "testing"


@lru_cache
def get_settings() -> Settings:
    """Konfiqurasiya obyektinin keşlənmiş singleton nüsxəsini qaytarır."""
    return Settings()


settings = get_settings()
