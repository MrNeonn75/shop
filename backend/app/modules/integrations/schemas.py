"""Kənar İnteqrasiyalar Pydantic Sxemləri (Integrations Schemas)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class IntegrationResponse(BaseModel):
    """İnteqrasiyanın açıq status və məlumat modeli (Məxfi açarlar heç vaxt qaytarılmır)."""

    model_config = ConfigDict(from_attributes=True)

    key: str
    name: str
    integration_type: str
    status: str
    last_success_at: datetime | None = None
    last_error: str | None = None
    config_ref: str | None = None
    masked_display: str | None = None
    is_enabled: bool
    circuit_breaker_state: str | None = "CLOSED"
    version: int
    created_at: datetime
    updated_at: datetime


class IntegrationUpdateRequest(BaseModel):
    """İnteqrasiyanın konfiqurasiyasını yeniləmə sorğusu (Açarlar write-only qəbul edilir)."""

    name: str | None = Field(None, min_length=2, max_length=100)
    config_ref: str | None = Field(None, max_length=150)
    secrets: dict[str, Any] | None = Field(
        None,
        description="Məxfi konfiqurasiya dəyərləri (Write-only, bazada şifrələnir və ya .env-ə istinad edir)",
    )
    is_enabled: bool | None = None
    version: int = Field(..., ge=1, description="Optimistik kilidləmə versiya nömrəsi")


class IntegrationTestConnectionResponse(BaseModel):
    """Əlaqə yoxlanışı (test-connection) nəticəsi."""

    key: str
    status: str
    success: bool
    message: str
    response_time_ms: int | None = None


class IntegrationCallLogResponse(BaseModel):
    """İnteqrasiya çağırış jurnalı qeydi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    integration_key: str
    action: str
    status: str
    response_time_ms: int | None = None
    request_payload: dict[str, Any] | None = None
    response_payload: dict[str, Any] | None = None
    error_message: str | None = None
    created_at: datetime


class SyncTriggerRequest(BaseModel):
    """Sinxronizasiya başladılması sorğusu."""

    direction: str = Field(default="IMPORT", description="IMPORT | EXPORT | BIDIRECTIONAL")
    is_dry_run: bool = Field(default=False, description="Bazada dəyişiklik etmədən yoxlama rejimi")


class SyncRunResponse(BaseModel):
    """Sinxronizasiya sessiyasının status hesabatı."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    integration_key: str
    direction: str
    status: str
    is_dry_run: bool
    items_processed: int
    items_failed: int
    error_summary: str | None = None
    started_at: datetime
    completed_at: datetime | None = None


class SecretsRotateResponse(BaseModel):
    """Rekvizitlərin rotasiyası cavabı."""

    key: str
    rotated: bool
    message: str


class DeadLetterEventResponse(BaseModel):
    """Dead-letter hadisəsinin təsvir modeli."""

    id: uuid.UUID
    event_type: str
    aggregate_type: str
    aggregate_id: str
    payload: dict[str, Any]
    correlation_id: str
    attempts: int
    last_error: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BulkReplayRequest(BaseModel):
    """Toplu hadisə təkrar icrası sorğusu."""

    event_type: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
