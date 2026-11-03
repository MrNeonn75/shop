"""İnventar Modulu Domen Hadisələri (Inventory Domain Events).

Bu hadisələr outbox cədvəli vasitəsilə asinxron emalçılara (bildirişlər,
kassa xəbərdarlıqları, BI yenilənmələri) çatdırılır.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from app.shared.events import DomainEvent


class StockChangedEvent(DomainEvent):
    """Anbar qalığı dəyişdikdə yaranan hadisə."""

    def __init__(
        self,
        warehouse_id: uuid.UUID,
        variant_id: uuid.UUID,
        old_on_hand: int,
        new_on_hand: int,
        delta: int,
        movement_type: str,
        reference_type: str,
        reference_id: uuid.UUID | None,
    ) -> None:
        super().__init__(
            event_type="stock.changed",
            aggregate_type="inventory",
            aggregate_id=f"{warehouse_id}:{variant_id}",
            payload={
                "warehouse_id": str(warehouse_id),
                "variant_id": str(variant_id),
                "old_on_hand": old_on_hand,
                "new_on_hand": new_on_hand,
                "delta": delta,
                "movement_type": movement_type,
                "reference_type": reference_type,
                "reference_id": str(reference_id) if reference_id else None,
            },
        )


class StockLowEvent(DomainEvent):
    """Məhsulun qalığı kritik minimum həddə çatdıqda yaranan hadisə."""

    def __init__(
        self,
        warehouse_id: uuid.UUID,
        variant_id: uuid.UUID,
        available: int,
        min_stock: int,
    ) -> None:
        super().__init__(
            event_type="stock.low",
            aggregate_type="inventory",
            aggregate_id=f"{warehouse_id}:{variant_id}",
            payload={
                "warehouse_id": str(warehouse_id),
                "variant_id": str(variant_id),
                "available": available,
                "min_stock": min_stock,
            },
        )


class StockOutEvent(DomainEvent):
    """Məhsulun qalığı tam tükəndikdə (0 və ya mənfi) yaranan hadisə."""

    def __init__(self, warehouse_id: uuid.UUID, variant_id: uuid.UUID) -> None:
        super().__init__(
            event_type="stock.out",
            aggregate_type="inventory",
            aggregate_id=f"{warehouse_id}:{variant_id}",
            payload={
                "warehouse_id": str(warehouse_id),
                "variant_id": str(variant_id),
            },
        )


class DocumentConfirmedEvent(DomainEvent):
    """Anbar sənədi təsdiqləndikdə yaranan hadisə."""

    def __init__(
        self,
        document_id: uuid.UUID,
        document_no: str,
        document_type: str,
        warehouse_id: uuid.UUID,
        total_quantity: int,
        total_cost: Decimal,
    ) -> None:
        super().__init__(
            event_type="stock_document.confirmed",
            aggregate_type="stock_documents",
            aggregate_id=str(document_id),
            payload={
                "document_id": str(document_id),
                "document_no": document_no,
                "document_type": document_type,
                "warehouse_id": str(warehouse_id),
                "total_quantity": total_quantity,
                "total_cost": str(total_cost),
            },
        )


class CountApprovedEvent(DomainEvent):
    """Sayım kənarlaşması təsdiqləndikdə yaranan hadisə."""

    def __init__(
        self,
        session_id: uuid.UUID,
        session_no: str,
        warehouse_id: uuid.UUID,
        total_variance_qty: int = 0,
        total_variance_value: Decimal = Decimal("0.00"),
        adjustment_doc_id: uuid.UUID | None = None,
        total_lines: int = 0,
    ) -> None:
        super().__init__(
            event_type="stock_count.approved",
            aggregate_type="count_sessions",
            aggregate_id=str(session_id),
            payload={
                "session_id": str(session_id),
                "session_no": session_no,
                "warehouse_id": str(warehouse_id),
                "total_variance_qty": total_variance_qty,
                "total_variance_value": str(total_variance_value),
                "adjustment_doc_id": str(adjustment_doc_id) if adjustment_doc_id else None,
                "total_lines": total_lines,
            },
        )


class BalanceDriftDetectedEvent(DomainEvent):
    """Ledger ilə saxlanılan qalıq arasında kənarlaşma (drift) aşkar edildikdə yaranan hadisə."""

    def __init__(
        self,
        company_id: uuid.UUID | None = None,
        drifts_count: int = 0,
        sample_drifts: list[dict[str, Any]] | None = None,
        warehouse_id: uuid.UUID | None = None,
        variant_id: uuid.UUID | None = None,
        stock_status: str | None = None,
        stored_on_hand: int = 0,
        ledger_on_hand: int = 0,
        drift: int = 0,
    ) -> None:
        super().__init__(
            event_type="inventory.balance_drift",
            aggregate_type="inventory_reconciliation",
            aggregate_id=str(company_id or warehouse_id or "global"),
            payload={
                "company_id": str(company_id) if company_id else None,
                "drifts_count": drifts_count,
                "sample_drifts": sample_drifts or [],
                "warehouse_id": str(warehouse_id) if warehouse_id else None,
                "variant_id": str(variant_id) if variant_id else None,
                "stock_status": stock_status,
                "stored_on_hand": stored_on_hand,
                "ledger_on_hand": ledger_on_hand,
                "drift": drift,
            },
        )
