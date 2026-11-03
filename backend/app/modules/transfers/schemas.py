"""Transferlər Modulu Sxemləri və DTO-lar (Transfers Pydantic Schemas).

Filiallararası və anbarlararası mal transferləri, qəbul və göndərmə xətləri,
çatışmazlıq və zədə hesabatları, tranzit monitorinqi.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

# --- Sətirlər (Transfer Lines) ---


class TransferLineCreate(BaseModel):
    """Yeni transfer sətri əlavə etmə."""

    model_config = ConfigDict(extra="forbid")

    variant_id: uuid.UUID
    requested_qty: int = Field(..., gt=0, description="Tələb edilən miqdar")
    notes: str | None = Field(default=None, max_length=255)


class TransferLineResponse(BaseModel):
    """Transfer sətri cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    transfer_id: uuid.UUID
    line_no: int
    variant_id: uuid.UUID
    requested_qty: int
    picked_qty: int
    short_pick_reason: str | None = None
    dispatched_qty: int
    received_qty: int
    damaged_qty: int
    missing_qty: int
    unit_cost: Decimal
    total_cost: Decimal
    notes: str | None = None
    sku: str | None = None
    product_name: str | None = None


# --- Qəbul Hadisəsi (Receiving Event) ---


class TransferReceivingLineResponse(BaseModel):
    """Qəbul hadisəsinin detal sətri."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    receiving_event_id: uuid.UUID
    transfer_line_id: uuid.UUID
    variant_id: uuid.UUID
    received_qty: int
    damaged_qty: int
    missing_qty: int
    notes: str | None = None


class TransferReceivingEventResponse(BaseModel):
    """Qəbul hadisəsi (aktı) cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    transfer_id: uuid.UUID
    receipt_no: str
    received_by_id: uuid.UUID | None = None
    received_at: datetime
    is_final: bool
    notes: str | None = None
    lines: list[TransferReceivingLineResponse] = []


# --- Transfer Sənədi Əsas Sxemləri ---


class TransferCreate(BaseModel):
    """Yeni transfer yaratma (Draft)."""

    model_config = ConfigDict(extra="forbid")

    source_warehouse_id: uuid.UUID
    destination_warehouse_id: uuid.UUID
    shipping_method: str | None = None
    tracking_number: str | None = None
    vehicle_no: str | None = None
    driver_name: str | None = None
    notes: str | None = None
    lines: list[TransferLineCreate] = Field(..., min_length=1)


class TransferResponse(BaseModel):
    """Transfer sənədi tam cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    transfer_no: str
    source_warehouse_id: uuid.UUID
    destination_warehouse_id: uuid.UUID
    in_transit_warehouse_id: uuid.UUID
    status: str
    total_lines: int
    total_requested_qty: int
    total_picked_qty: int
    total_dispatched_qty: int
    total_received_qty: int
    total_cost: Decimal
    creator_id: uuid.UUID | None = None
    approver_id: uuid.UUID | None = None
    dispatched_by_id: uuid.UUID | None = None
    submitted_at: datetime | None = None
    approved_at: datetime | None = None
    dispatched_at: datetime | None = None
    received_at: datetime | None = None
    cancelled_at: datetime | None = None
    cancellation_reason: str | None = None
    shipping_method: str | None = None
    tracking_number: str | None = None
    vehicle_no: str | None = None
    driver_name: str | None = None
    notes: str | None = None
    version: int
    lines: list[TransferLineResponse] = []
    receiving_events: list[TransferReceivingEventResponse] = []
    created_at: datetime
    updated_at: datetime


# --- Transfer Əməliyyat Sorğuları (Workflows) ---


class TransferPickLine(BaseModel):
    """Yığım zamanı sətir üzrə sayılan faktiki miqdar."""

    model_config = ConfigDict(extra="forbid")

    line_id: uuid.UUID
    picked_qty: int = Field(..., ge=0)
    short_pick_reason: str | None = None


class TransferPickRequest(BaseModel):
    """Anbardan mal yığımı sorğusu."""

    model_config = ConfigDict(extra="forbid")

    lines: list[TransferPickLine] = Field(..., min_length=1)


class TransferDispatchLine(BaseModel):
    """Yola salma sətir miqdarı (əgər boşdursa, picked_qty istifadə edilir)."""

    model_config = ConfigDict(extra="forbid")

    line_id: uuid.UUID
    dispatched_qty: int | None = Field(default=None, ge=0)


class TransferDispatchRequest(BaseModel):
    """Transferi yola salma (TRANSFER_OUT) sorğusu."""

    model_config = ConfigDict(extra="forbid")

    shipping_method: str | None = None
    tracking_number: str | None = None
    vehicle_no: str | None = None
    driver_name: str | None = None
    notes: str | None = None
    lines: list[TransferDispatchLine] | None = None


class TransferReceiveLine(BaseModel):
    """Qəbul zamanı təhvil alınan miqdarlar."""

    model_config = ConfigDict(extra="forbid")

    line_id: uuid.UUID
    received_qty: int = Field(..., ge=0, description="Sağlam qəbul edilən miqdar")
    damaged_qty: int = Field(default=0, ge=0, description="Zədəli çıxan miqdar")
    missing_qty: int = Field(default=0, ge=0, description="Çatışmayan / itmiş miqdar")
    notes: str | None = None


class TransferReceiveRequest(BaseModel):
    """Təyinat anbarında transfer qəbulu (TRANSFER_IN) sorğusu."""

    model_config = ConfigDict(extra="forbid")

    lines: list[TransferReceiveLine] = Field(..., min_length=1)
    is_final: bool = Field(
        default=True,
        description="Bu qəbul ilə transfer bağlanmalıdırmı (tam qəbul)?",
    )
    notes: str | None = None


class TransferCancelRequest(BaseModel):
    """Transferin ləğvi sorğusu."""

    model_config = ConfigDict(extra="forbid")

    reason: str = Field(..., min_length=3, max_length=255)


# --- Tranzit İzləmə və SLA Monitorinqi (In-Transit Monitoring) ---


class InTransitTransferItem(BaseModel):
    """Yolda olan transfer qeydi."""

    transfer_id: uuid.UUID
    transfer_no: str
    source_warehouse_id: uuid.UUID
    destination_warehouse_id: uuid.UUID
    dispatched_at: datetime
    days_in_transit: int
    is_delayed: bool
    total_dispatched_qty: int


class InTransitReportResponse(BaseModel):
    """Tranzit anbarı və gecikmə hesabatı."""

    total_in_transit_transfers: int
    total_items_in_transit: int
    delayed_count: int
    transfers: list[InTransitTransferItem] = []
