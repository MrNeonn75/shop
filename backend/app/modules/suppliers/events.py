"""Təchizatçılar Modulu Hadisələri (Outbox Events)."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from app.shared.events import DomainEvent


class SupplierCreatedEvent(DomainEvent):
    """Yeni təchizatçı yaradıldıqda baş verən hadisə."""

    def __init__(
        self,
        supplier_id: uuid.UUID,
        supplier_code: str,
        supplier_name: str,
        company_id: uuid.UUID,
    ) -> None:
        super().__init__(
            event_type="suppliers.created",
            aggregate_type="suppliers",
            aggregate_id=str(supplier_id),
            payload={
                "supplier_id": str(supplier_id),
                "supplier_code": supplier_code,
                "supplier_name": supplier_name,
                "company_id": str(company_id),
            },
        )


class SupplierMergedEvent(DomainEvent):
    """İki təchizatçı birləşdirildikdə baş verən hadisə."""

    def __init__(
        self,
        source_supplier_id: uuid.UUID,
        target_supplier_id: uuid.UUID,
        company_id: uuid.UUID,
        reason: str,
    ) -> None:
        super().__init__(
            event_type="suppliers.merged",
            aggregate_type="suppliers",
            aggregate_id=str(target_supplier_id),
            payload={
                "source_supplier_id": str(source_supplier_id),
                "target_supplier_id": str(target_supplier_id),
                "company_id": str(company_id),
                "reason": reason,
            },
        )


class SupplierDocumentExpiringEvent(DomainEvent):
    """Təchizatçı sənədinin etibarlılıq müddəti bitmək üzrə olduqda (30/14/7 gün)."""

    def __init__(
        self,
        supplier_id: uuid.UUID,
        document_id: uuid.UUID,
        doc_type: str,
        valid_to: date,
        days_remaining: int,
        doc_number: str | None = None,
    ) -> None:
        super().__init__(
            event_type="suppliers.document.expiring",
            aggregate_type="suppliers",
            aggregate_id=str(supplier_id),
            payload={
                "supplier_id": str(supplier_id),
                "document_id": str(document_id),
                "doc_type": doc_type,
                "doc_number": doc_number,
                "valid_to": valid_to.isoformat(),
                "days_remaining": days_remaining,
            },
        )


class SupplierLedgerRecordedEvent(DomainEvent):
    """Təchizatçı hesablaşma jurnalına yeni sətir yazıldıqda."""

    def __init__(
        self,
        supplier_id: uuid.UUID,
        entry_id: uuid.UUID,
        entry_type: str,
        amount: Decimal,
        balance_after: Decimal,
        reference_type: str,
        reference_id: uuid.UUID,
    ) -> None:
        super().__init__(
            event_type="suppliers.ledger.recorded",
            aggregate_type="suppliers",
            aggregate_id=str(supplier_id),
            payload={
                "supplier_id": str(supplier_id),
                "entry_id": str(entry_id),
                "entry_type": entry_type,
                "amount": str(amount),
                "balance_after": str(balance_after),
                "reference_type": reference_type,
                "reference_id": str(reference_id),
            },
        )
