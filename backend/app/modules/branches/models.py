"""Filiallar Modulu ORM Modelləri (Branches Models)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Integer, String, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base, BaseMixin

JSONBType = JSONB().with_variant(JSON(), "sqlite")  # type: ignore[no-untyped-call]


class Branch(Base, BaseMixin):
    """Filial / Satış nöqtəsi cədvəli."""

    __tablename__ = "branches"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="Bağlı olduğu şirkət ID-si",
    )
    code: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        index=True,
        nullable=False,
        doc="Filialın unikal qısa kodu (məs: 28MAY, NIZAMI)",
    )
    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
        doc="Filialın adı (məs: 28 May Filialı)",
    )
    address: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        doc="Filialın fiziki ünvanı",
    )
    phone: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        doc="Filialın əlaqə telefonu",
    )
    email: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        doc="Filialın e-poçt ünvanı",
    )
    manager_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        doc="Filial müdiri (istifadəçi ID-si)",
    )
    operating_hours: Mapped[dict[str, Any]] = mapped_column(
        JSONBType,
        nullable=False,
        default=dict,
        doc="Həftənin günləri üzrə iş saatları",
    )
    exceptions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONBType,
        nullable=False,
        default=list,
        doc="İstisna qrafik və bayram günləri",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="active",
        index=True,
        doc="'active' və ya 'inactive'",
    )
    settings: Mapped[dict[str, Any]] = mapped_column(
        JSONBType,
        nullable=False,
        default=dict,
        doc="Filiala məxsus xüsusi parametrlər",
    )
    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        doc="Optimistik kilidləmə versiya nömrəsi",
    )

    __table_args__ = (Index("ix_branches_company_status", "company_id", "status"),)
