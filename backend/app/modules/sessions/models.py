"""Sessiyalar Modulu ORM Modelləri (Sessions Models).

İstifadəçi sessiyaları, refresh token rotasiyası və token family idarəetməsi.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, BaseMixin, utc_now


class Session(Base, BaseMixin):
    """Aktiv istifadəçi sessiyaları cədvəli."""

    __tablename__ = "sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
        index=True,
        doc="Token Family ID: təkrar istifadə (reuse) aşkarlandıqda bütün qrup ləğv edilir",
    )
    refresh_token_hash: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        index=True,
        doc="SHA-256 ilə heşlənmiş Refresh Token",
    )
    device_info: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        doc="Cihaz məlumatı (Brauzer, OS, POS terminal adı)",
    )
    ip_address: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        doc="Müştəri IP ünvanı",
    )
    user_agent: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        doc="HTTP User-Agent başlığı",
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
        doc="Sessiya üzrə son fəaliyyət vaxtı (Idle timeout üçün)",
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
        doc="Sessiyanın mütləq bitmə vaxtı (Absolute timeout)",
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
        doc="Sessiyanın vaxtından əvvəl ləğv edilmə tarixi",
    )

    __table_args__ = (Index("ix_sessions_active", "user_id", "expires_at", "revoked_at"),)
