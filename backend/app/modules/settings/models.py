"""Sazlamalar və Səbəb Kodları ORM Modelləri (Settings Models)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base, BaseMixin, utc_now

JSONBType = JSONB().with_variant(JSON(), "sqlite")  # type: ignore[no-untyped-call]


class SettingValue(Base):
    """Versiyalanmış parametr dəyərləri (Tarixçə saxlanılır, heç vaxt üzərinə yazılmır)."""

    __tablename__ = "setting_values"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        doc="Boşdursa şirkət səviyyəli ümumi parametrdir, doludursa filial override-dır",
    )
    key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    value: Mapped[Any] = mapped_column(JSONBType, nullable=False)
    effective_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        index=True,
        doc="Parametrin qüvvəyə mindiyi tarix",
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        doc="Həssas parametrin dəyişdirilməsi üçün tələb olunan biznes əsaslandırma",
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    __table_args__ = (Index("ix_setting_values_lookup", "key", "branch_id", "effective_from"),)


class ReasonCode(Base, BaseMixin):
    """Əməliyyat səbəb kodları (Qaytarma, silinmə, endirim, kassa məxaric/mədaxil)."""

    __tablename__ = "reason_codes"

    category: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        doc="Kateqoriya: returns, adjustments, discounts, cash_in_out, voids",
    )
    code: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        doc="Qısa unikal səbəb kodu (məs: DEFECT, WRONG_SIZE)",
    )
    name_az: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
        doc="Səbəbin Azərbaycan dilində rəsmi adı",
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_system: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        doc="Sistem tərəfindən ilkin yaradılmış şablon səbəb kodu",
    )
    usage_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="İstifadə sayı (İstifadə olunmuş səbəb kodu bazadan silinə bilməz, yalnız deaktiv edilə bilər)",
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    __table_args__ = (Index("ix_reason_codes_cat_code", "category", "code", unique=True),)
