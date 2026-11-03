"""Verilənlər Bazası Təməli (SQLAlchemy 2.0 Async).

Mərkəzi Base model, BaseMixin, UUIDv7 əsas açar, zaman damğaları,
optimistic concurrency version sütunu və sessiya meneceri.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Integer, MetaData, Uuid
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.core.config import settings
from app.core.ids import generate_uuid7

POSTGRES_NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

metadata = MetaData(naming_convention=POSTGRES_NAMING_CONVENTION)


def utc_now() -> datetime:
    """Həmişə timezone-aware UTC zaman qaytarır."""
    return datetime.now(UTC)


def ensure_utc(dt: datetime) -> datetime:
    """Zaman damğasını UTC ilə uyğunlaşdırır (SQLite naive datetime üçün müdafiə)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


class Base(DeclarativeBase):
    metadata = metadata


class BaseMixin:
    """Bütün cədvəllər üçün ümumi təməl sahələr mixin-i."""

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=generate_uuid7,
        doc="UUIDv7 formatlı zaman sıralamalı unikal identifikator",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
        doc="Sətrin yaradılma zamanı (UTC)",
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
        doc="Sətrin son yenilənmə zamanı (UTC)",
    )

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        default=None,
        doc="Yaradan istifadəçinin identifikatoru",
    )

    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        default=None,
        doc="Son redaktə edən istifadəçinin identifikatoru",
    )

    version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
        doc="Optimistic concurrency üçün versiya nömrəsi",
    )

    is_deleted: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        doc="Master data üçün soft-delete bayrağı (maliyyə sənədlərində tətbiq olunmur)",
    )

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
        doc="Soft-delete vaxtı (UTC)",
    )


# Async Engine və Session Factory
engine_kwargs: dict[str, Any] = {
    "echo": settings.DATABASE_ECHO,
}
if "sqlite" in settings.DATABASE_URL:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs.update(
        {
            "pool_size": settings.DATABASE_POOL_SIZE,
            "max_overflow": settings.DATABASE_MAX_OVERFLOW,
            "pool_timeout": settings.DATABASE_POOL_TIMEOUT,
            "pool_pre_ping": True,
        }
    )

engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI üçün verilənlər bazası sessiyası asılılığı."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
