"""Anbarlar Modulu ORM Modelləri (Warehouses Models)."""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, BaseMixin


class Warehouse(Base, BaseMixin):
    """Anbar və saxlama məkanı cədvəli."""

    __tablename__ = "warehouses"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="Bağlı olduğu şirkət ID-si",
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        doc="Bağlı olduğu filial ID-si (Mərkəzi anbar üçün boş ola bilər)",
    )
    code: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        index=True,
        nullable=False,
        doc="Anbarın unikal kodu (məs: WH-CENTRAL, WH-28MAY-01)",
    )
    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
        doc="Anbarın adı (məs: 28 May Əsas Anbarı)",
    )
    warehouse_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="branch",
        index=True,
        doc="Anbar növü: central, branch, in_transit, quarantine",
    )
    address: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        doc="Anbarın fiziki yerləşmə ünvanı",
    )
    is_system: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        doc="Sistem tərəfindən idarə olunan (məs: in_transit) anbardırmı? Silinə bilməz.",
    )
    is_default_for_sales: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        doc="Filial üzrə kassa satışları üçün standart təyin olunmuş anbardırmı?",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="active",
        index=True,
        doc="'active' və ya 'inactive'",
    )
    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        doc="Optimistik kilidləmə versiya nömrəsi",
    )

    zones: Mapped[list[WarehouseZone]] = relationship(
        "WarehouseZone",
        back_populates="warehouse",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        Index("ix_warehouses_branch_type", "branch_id", "warehouse_type"),
        Index("ix_warehouses_company_status", "company_id", "status"),
    )


class WarehouseZone(Base, BaseMixin):
    """Anbar daxili zonalar / stellajlar / bölmələr (Bin / Zone)."""

    __tablename__ = "warehouse_zones"

    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warehouses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="Bağlı olduğu anbar ID-si",
    )
    code: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        doc="Zonanın qısa kodu (məs: ZONE-A, RACK-01)",
    )
    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
        doc="Zonanın adı (məs: Kişi geyimləri zonası)",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        doc="Zonanın aktivlik vəziyyəti",
    )

    warehouse: Mapped[Warehouse] = relationship("Warehouse", back_populates="zones")

    __table_args__ = (Index("ix_warehouse_zones_code", "warehouse_id", "code", unique=True),)
