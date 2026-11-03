"""Kassa Aparatları ORM Modelləri (Cash Registers Models)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Integer, String, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base, BaseMixin

JSONBType = JSONB().with_variant(JSON(), "sqlite")  # type: ignore[no-untyped-call]


class CashRegister(Base, BaseMixin):
    """POS Kassa Aparatı Əsas Məlumatları (Master Data)."""

    __tablename__ = "cash_registers"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="Bağlı olduğu şirkət ID-si",
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="Yerləşdiyi filial ID-si",
    )
    default_warehouse_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warehouses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        doc="Satış üçün standart silinmə anbarı ID-si",
    )
    code: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        doc="Filial daxili unikal kassa kodu (məs: REG-01, POS-28MAY-1)",
    )
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        doc="Kassanın təsviri adı (məs: Əsas Giriş Kassası)",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="active",
        index=True,
        doc="'active' və ya 'inactive'",
    )
    device_binding_info: Mapped[dict[str, Any] | None] = mapped_column(
        JSONBType,
        nullable=True,
        doc="Cihaz fiziki bağlama məlumatları (MAC, IP, serial nömrəsi)",
    )
    receipt_printer_profile_ref: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        doc="Çap profili referansı (məs: EPSON-TM20-USB)",
    )
    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        doc="Optimistik kilidləmə versiya nömrəsi",
    )

    __table_args__ = (Index("ix_cash_registers_branch_code", "branch_id", "code", unique=True),)
