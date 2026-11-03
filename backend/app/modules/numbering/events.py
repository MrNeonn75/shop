"""Sənəd Nömrələnməsi Hadisələri (Numbering Domain Events)."""

from __future__ import annotations

import uuid
from typing import Any

from app.shared.events import DomainEvent


class NumberingSequenceCreatedEvent(DomainEvent):
    """Yeni nömrələnmə ardıcıllığı yaradıldıqda baş verir."""

    def __init__(self, sequence_id: uuid.UUID, document_type: str, pattern: str) -> None:
        super().__init__(
            event_type="numbering.sequence_created",
            aggregate_type="numbering_sequence",
            aggregate_id=str(sequence_id),
            payload={
                "sequence_id": str(sequence_id),
                "document_type": document_type,
                "pattern": pattern,
            },
        )


class NumberingSequenceUpdatedEvent(DomainEvent):
    """Nömrələnmə şablonu və ya qaydası yeniləndikdə baş verir."""

    def __init__(
        self, sequence_id: uuid.UUID, document_type: str, diff: dict[str, Any] | None = None
    ) -> None:
        super().__init__(
            event_type="numbering.sequence_updated",
            aggregate_type="numbering_sequence",
            aggregate_id=str(sequence_id),
            payload={
                "sequence_id": str(sequence_id),
                "document_type": document_type,
                "diff": diff or {},
            },
        )


class NumberAllocatedEvent(DomainEvent):
    """Yeni sənəd nömrəsi ayrıldıqda baş verir."""

    def __init__(
        self,
        document_type: str,
        number: str,
        sequence_id: uuid.UUID,
        branch_id: uuid.UUID | None = None,
        register_id: uuid.UUID | None = None,
    ) -> None:
        super().__init__(
            event_type="numbering.number_allocated",
            aggregate_type="allocated_number",
            aggregate_id=f"{document_type}:{number}",
            payload={
                "document_type": document_type,
                "number": number,
                "sequence_id": str(sequence_id),
                "branch_id": str(branch_id) if branch_id else None,
                "register_id": str(register_id) if register_id else None,
            },
        )
