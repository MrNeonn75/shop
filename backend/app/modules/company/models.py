"""Şirkət Modulu ORM Modelləri (Company Models).

Tək şirkət profilini təmsil edir, lakin gələcəkdə çoxlu şirkət (multi-company)
dəstəyi üçün ilkin gündən `companies` cədvəli və `company_id` arxitekturası ilə qurulur.
"""

from __future__ import annotations

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, BaseMixin


class Company(Base, BaseMixin):
    """Müəssisə (Şirkət) hüquqi və əməliyyat profili cədvəli."""

    __tablename__ = "companies"

    code: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        index=True,
        nullable=False,
        doc="Şirkətin daxili unikal kodu (məs: BH_MAIN)",
    )
    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
        doc="Brend / Ticarət adı (məs: BRAND HOUSE)",
    )
    legal_name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        doc="Rəsmi hüquqi adı (məs: BRAND HOUSE MMC)",
    )
    tax_id: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        doc="VÖEN (Vergi Ödəyicisinin Eyniləşdirmə Nömrəsi)",
    )
    address: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        doc="Rəsmi hüquqi ünvan",
    )
    phone: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        doc="Əsas əlaqə telefonu",
    )
    email: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        doc="Rəsmi əlaqə e-poçtu",
    )
    website: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        doc="Rəsmi veb-sayt ünvanı",
    )
    logo_url: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        doc="Loqotip faylının referansı və ya URL-i",
    )
    default_currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        default="AZN",
        doc="Əsas valyuta kodu (AZN)",
    )
    timezone: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="Asia/Baku",
        doc="Əsas saat qurşağı",
    )
    default_language: Mapped[str] = mapped_column(
        String(5),
        nullable=False,
        default="az",
        doc="İlkin sistem dili",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        doc="Şirkətin aktivlik vəziyyəti",
    )
    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        doc="Optimistik kilidləmə versiya nömrəsi",
    )
