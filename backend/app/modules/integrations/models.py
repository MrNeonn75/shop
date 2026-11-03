"""Kənar İnteqrasiyalar Reyestri ORM Modelləri (Integrations Models)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base, BaseMixin, utc_now

JSONBType = JSONB().with_variant(JSON(), "sqlite")  # type: ignore[no-untyped-call]


class Integration(Base):
    """Kənar xidmətlər və inteqrasiyalar status reyestri cədvəli."""

    __tablename__ = "integrations"

    key: Mapped[str] = mapped_column(
        String(50),
        primary_key=True,
        doc="İnteqrasiyanın unikal açarı (məs: payment_provider, sms, email)",
    )
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        doc="İnteqrasiyanın təsviri adı",
    )
    integration_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        doc="Növü: payment, sms, email, messaging, hardware, biometric, accounting, ecommerce",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="NOT_CONFIGURED",
        index=True,
        doc="Status: NOT_CONFIGURED, CONFIGURING, ACTIVE, DEGRADED, ERROR. Real verifikasiya olmadan heç vaxt ACTIVE ola bilməz.",
    )
    last_success_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        doc="Son uğurlu əlaqə və ya çağırış vaxtı",
    )
    last_error: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        doc="Son xəta mesajı",
    )
    config_ref: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
        doc="Secret manager və ya .env referansı (məs: env:PAYMENT_PROVIDER)",
    )
    masked_display: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
        doc="Maskalanmış təhlükəsiz göstərici (məs: Merchant: *****1234)",
    )
    encrypted_secrets: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        doc="Şifrələnmiş konfiqurasiya/açarlar (Write-only, API-də heç vaxt qaytarılmır)",
    )
    is_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        doc="İnteqrasiya administrator tərəfindən aktivləşdirilibmi?",
    )
    circuit_breaker_state: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="CLOSED",
        doc="CLOSED | OPEN | HALF_OPEN",
    )
    failure_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    last_failure_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    rate_limit_per_minute: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        default=60,
    )
    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        doc="Versiya nömrəsi",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    call_logs: Mapped[list[IntegrationCallLog]] = relationship(
        "IntegrationCallLog",
        back_populates="integration",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    sync_runs: Mapped[list[SyncRun]] = relationship(
        "SyncRun",
        back_populates="integration",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class IntegrationCallLog(Base, BaseMixin):
    """Kənar sistemlərə edilən çağırışların redaktə olunmuş jurnalı."""

    __tablename__ = "integration_call_logs"

    integration_key: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("integrations.key", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        doc="Əməliyyat növü (test_connection, send_sms, charge_card və s.)",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        doc="'SUCCESS' və ya 'ERROR'",
    )
    response_time_ms: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        doc="Cavab müddəti (millisaniyə)",
    )
    request_payload: Mapped[dict[str, Any] | None] = mapped_column(
        JSONBType,
        nullable=True,
        doc="Redaktə olunmuş (maskalanmış, PII və parolsüz) sorğu yükü",
    )
    response_payload: Mapped[dict[str, Any] | None] = mapped_column(
        JSONBType,
        nullable=True,
        doc="Redaktə olunmuş cavab yükü",
    )
    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    integration: Mapped[Integration] = relationship("Integration", back_populates="call_logs")

    __table_args__ = (Index("ix_call_logs_key_time", "integration_key", "created_at"),)


class ExternalRefMapping(Base, BaseMixin):
    """Kənar sistemlərlə daxili obyektlərin unikal ID xəritələndirilməsi."""

    __tablename__ = "external_ref_mappings"

    system: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        doc="Mənbə sistem adı (məs: brendhouse_legacy, 1c_accounting)",
    )
    entity_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        doc="Obyekt növü: product | customer | order | variant | barcode",
    )
    internal_id: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )
    external_id: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

    __table_args__ = (
        Index("ix_external_refs_lookup", "system", "entity_type", "internal_id", unique=True),
        Index("ix_external_refs_reverse", "system", "entity_type", "external_id", unique=True),
    )


class SyncRun(Base, BaseMixin):
    """Məlumat sinxronizasiyası sessiyası (Batch Sync Session)."""

    __tablename__ = "sync_runs"

    integration_key: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("integrations.key", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    direction: Mapped[str] = mapped_column(
        String(20),
        default="IMPORT",
        nullable=False,
        doc="IMPORT | EXPORT | BIDIRECTIONAL",
    )
    status: Mapped[str] = mapped_column(
        String(30),
        default="PENDING",
        nullable=False,
        index=True,
        doc="PENDING | RUNNING | SUCCESS | PARTIAL_SUCCESS | FAILED",
    )
    is_dry_run: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        doc="Sınaq rejimi - bazada dəyişiklik etmədən potensial fərqləri aşkarlayır",
    )
    items_processed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    items_failed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    integration: Mapped[Integration] = relationship("Integration", back_populates="sync_runs")
    items: Mapped[list[SyncItem]] = relationship(
        "SyncItem",
        back_populates="sync_run",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class SyncItem(Base, BaseMixin):
    """Sinxronizasiya sessiyasındakı fərdi elementin nəticəsi."""

    __tablename__ = "sync_items"

    sync_run_id: Mapped[uuid.UUID] = mapped_column(
        String(36).with_variant(String(36), "sqlite"),
        ForeignKey("sync_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    internal_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    external_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        doc="SUCCESS | CONFLICT | SKIPPED | ERROR",
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    diff: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)

    sync_run: Mapped[SyncRun] = relationship("SyncRun", back_populates="items")
