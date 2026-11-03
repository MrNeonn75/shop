"""Transferlər Modulu Domen Hadisələri (Transfers Domain Events)."""

from __future__ import annotations

import uuid

from app.shared.events import DomainEvent


class TransferDispatchedEvent(DomainEvent):
    """Transfer yola salındıqda yaranan hadisə."""

    def __init__(
        self,
        transfer_id: uuid.UUID,
        transfer_no: str,
        source_warehouse_id: uuid.UUID,
        destination_warehouse_id: uuid.UUID,
        in_transit_warehouse_id: uuid.UUID,
        total_dispatched_qty: int,
    ) -> None:
        super().__init__(
            event_type="transfer.dispatched",
            aggregate_type="transfers",
            aggregate_id=str(transfer_id),
            payload={
                "transfer_id": str(transfer_id),
                "transfer_no": transfer_no,
                "source_warehouse_id": str(source_warehouse_id),
                "destination_warehouse_id": str(destination_warehouse_id),
                "in_transit_warehouse_id": str(in_transit_warehouse_id),
                "total_dispatched_qty": total_dispatched_qty,
            },
        )


class TransferReceivedEvent(DomainEvent):
    """Transfer təyinat anbarında qəbul edildikdə yaranan hadisə."""

    def __init__(
        self,
        transfer_id: uuid.UUID,
        transfer_no: str,
        receiving_event_id: uuid.UUID,
        destination_warehouse_id: uuid.UUID,
        received_qty: int,
        damaged_qty: int,
        missing_qty: int,
        is_final: bool,
    ) -> None:
        super().__init__(
            event_type="transfer.received",
            aggregate_type="transfers",
            aggregate_id=str(transfer_id),
            payload={
                "transfer_id": str(transfer_id),
                "transfer_no": transfer_no,
                "receiving_event_id": str(receiving_event_id),
                "destination_warehouse_id": str(destination_warehouse_id),
                "received_qty": received_qty,
                "damaged_qty": damaged_qty,
                "missing_qty": missing_qty,
                "is_final": is_final,
            },
        )


class TransferDiscrepancyEvent(DomainEvent):
    """Transfer qəbulu zamanı kənarlaşma (zədəli və ya əskik mal) olduqda yaranan hadisə."""

    def __init__(
        self,
        transfer_id: uuid.UUID,
        transfer_no: str,
        total_missing: int,
        total_damaged: int,
    ) -> None:
        super().__init__(
            event_type="transfer.discrepancy",
            aggregate_type="transfers",
            aggregate_id=str(transfer_id),
            payload={
                "transfer_id": str(transfer_id),
                "transfer_no": transfer_no,
                "total_missing": total_missing,
                "total_damaged": total_damaged,
            },
        )


class TransferAgingAlertEvent(DomainEvent):
    """Tranzitdə normadan artıq qalan (gecikən) transfer üçün xəbərdarlıq hadisəsi."""

    def __init__(
        self,
        transfer_id: uuid.UUID,
        transfer_no: str,
        days_in_transit: int,
        threshold_days: int,
    ) -> None:
        super().__init__(
            event_type="transfer.aging_alert",
            aggregate_type="transfers",
            aggregate_id=str(transfer_id),
            payload={
                "transfer_id": str(transfer_id),
                "transfer_no": transfer_no,
                "days_in_transit": days_in_transit,
                "threshold_days": threshold_days,
            },
        )


class TransferCancelledEvent(DomainEvent):
    """Transfer ləğv edildikdə yaranan hadisə."""

    def __init__(
        self,
        transfer_id: uuid.UUID,
        transfer_no: str,
        reason: str | None,
    ) -> None:
        super().__init__(
            event_type="transfer.cancelled",
            aggregate_type="transfers",
            aggregate_id=str(transfer_id),
            payload={
                "transfer_id": str(transfer_id),
                "transfer_no": transfer_no,
                "reason": reason,
            },
        )
