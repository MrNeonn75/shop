"""Transferlər Modulu ORM Modelləri (Transfers Models).

Filiallararası və anbarlararası mal transferləri, qismən qəbul,
tranzit anbarı idarəetməsi və çatışmazlıq/xarab mal hadisələri.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, BaseMixin, utc_now


class TransferStatus(str, enum.Enum):
    """Transfer statuslarının sonlu vəziyyət maşını (State Machine)."""

    DRAFT = "DRAFT"  # Qaralama
    SUBMITTED = "SUBMITTED"  # Təsdiq üçün göndərilib
    APPROVED = "APPROVED"  # Təsdiqlənib (mənbə anbarda rezervasiya aktivləşir)
    PICKING = "PICKING"  # Malların anbardan yığılması
    DISPATCHED = "DISPATCHED"  # Yola salınıb (mənbə -> tranzit ledger hərəkəti)
    IN_TRANSIT = "IN_TRANSIT"  # Yoldadır
    PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED"  # Qismən qəbul edilib
    RECEIVED = "RECEIVED"  # Tam qəbul edilib (tranzit -> təyinat ledger hərəkəti)
    REJECTED = "REJECTED"  # İmtina edilib
    CANCELLED = "CANCELLED"  # Ləğv edilib


class StockTransfer(Base, BaseMixin):
    """Anbarlararası və filiallararası transfer sənədi."""

    __tablename__ = "stock_transfers"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    transfer_no: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        doc="Fasiləsiz transfer nömrəsi (məs: TRF-2026-000001)",
    )
    source_warehouse_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warehouses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        doc="Göndərən anbar",
    )
    destination_warehouse_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warehouses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        doc="Qəbul edən anbar",
    )
    in_transit_warehouse_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("warehouses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        doc="Malların yolda olduğu müddətdə saxlanıldığı sistem tranzit anbarı",
    )
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default=TransferStatus.DRAFT.value,
        index=True,
    )
    total_lines: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    total_requested_qty: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    total_picked_qty: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    total_dispatched_qty: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    total_received_qty: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    total_cost: Mapped[Decimal] = mapped_column(
        Numeric(18, 4),
        nullable=False,
        default=Decimal("0.0000"),
    )
    creator_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
    )
    approver_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
    )
    dispatched_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
    )
    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    dispatched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    received_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    cancellation_reason: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    shipping_method: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )
    tracking_number: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )
    vehicle_no: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )
    driver_name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )
    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )

    lines: Mapped[list[StockTransferLine]] = relationship(
        "StockTransferLine",
        back_populates="transfer",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="StockTransferLine.line_no.asc()",
    )
    receiving_events: Mapped[list[TransferReceivingEvent]] = relationship(
        "TransferReceivingEvent",
        back_populates="transfer",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="TransferReceivingEvent.received_at.asc()",
    )

    __table_args__ = (
        CheckConstraint(
            "source_warehouse_id != destination_warehouse_id",
            name="chk_stock_transfers_different_warehouses",
        ),
        UniqueConstraint("company_id", "transfer_no", name="uq_stock_transfers_no"),
        Index("ix_stock_transfers_source_status", "source_warehouse_id", "status"),
        Index("ix_stock_transfers_dest_status", "destination_warehouse_id", "status"),
    )


class StockTransferLine(Base, BaseMixin):
    """Transferin variant üzrə sətri."""

    __tablename__ = "stock_transfer_lines"

    transfer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("stock_transfers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    line_no: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("product_variants.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    requested_qty: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        doc="Tələb edilən miqdar",
    )
    picked_qty: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Faktiki yığılmış miqdar",
    )
    short_pick_reason: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        doc="Əskik yığılma səbəbi",
    )
    dispatched_qty: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Yola salınmış miqdar",
    )
    received_qty: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Təyinat anbarında sağlam qəbul edilmiş miqdar",
    )
    damaged_qty: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Yolda zədələnmiş miqdar (təyinat anbarının zədəli statusuna daxil olur)",
    )
    missing_qty: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Çatışmayan / itmiş miqdar (yazılana qədər tranzitdə qalır)",
    )
    unit_cost: Mapped[Decimal] = mapped_column(
        Numeric(15, 4),
        nullable=False,
        default=Decimal("0.0000"),
    )
    total_cost: Mapped[Decimal] = mapped_column(
        Numeric(15, 4),
        nullable=False,
        default=Decimal("0.0000"),
    )
    notes: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    transfer: Mapped[StockTransfer] = relationship("StockTransfer", back_populates="lines")

    __table_args__ = (
        CheckConstraint("requested_qty > 0", name="chk_stock_transfer_lines_qty_positive"),
        UniqueConstraint("transfer_id", "line_no", name="uq_stock_transfer_lines_no"),
    )


class TransferReceivingEvent(Base, BaseMixin):
    """Hər bir qəbul aktı (qismən və ya tam qəbul hadisəsi).

    Hər bir qəbul hadisəsi müstəqil tranzaksiya və idempotency açarı ilə qorunur.
    """

    __tablename__ = "transfer_receiving_events"

    transfer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("stock_transfers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    receipt_no: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        doc="Qəbul qəbzi nömrəsi (məs: REC-TRF-2026-0001-1)",
    )
    received_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    idempotency_key: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        index=True,
    )
    is_final: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        doc="Bu qəbul ilə transfer tam başa çatdımı?",
    )
    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    transfer: Mapped[StockTransfer] = relationship(
        "StockTransfer", back_populates="receiving_events"
    )
    lines: Mapped[list[TransferReceivingLine]] = relationship(
        "TransferReceivingLine",
        back_populates="receiving_event",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class TransferReceivingLine(Base, BaseMixin):
    """Qəbul hadisəsinin detallı sətri."""

    __tablename__ = "transfer_receiving_lines"

    receiving_event_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("transfer_receiving_events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    transfer_line_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("stock_transfer_lines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("product_variants.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    received_qty: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Sağlam qəbul edilən ədəd (destination warehouse available)",
    )
    damaged_qty: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Zədəli qəbul edilən ədəd (destination warehouse damaged)",
    )
    missing_qty: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Əskik çıxan ədəd (tranzitdə qalır)",
    )
    notes: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    receiving_event: Mapped[TransferReceivingEvent] = relationship(
        "TransferReceivingEvent", back_populates="lines"
    )
