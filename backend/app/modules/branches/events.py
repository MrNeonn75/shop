"""Filiallar Modulu Hadisələri (Branches Events)."""

from __future__ import annotations

import uuid
from typing import Any

from app.shared.events import DomainEvent


class BranchCreatedEvent(DomainEvent):
    """Yeni filial yaradıldıqda yayımlanan hadisə."""

    def __init__(self, branch_id: uuid.UUID, code: str, name: str) -> None:
        super().__init__(
            event_type="branch.created",
            aggregate_type="branch",
            aggregate_id=str(branch_id),
            payload={
                "branch_id": str(branch_id),
                "code": code,
                "name": name,
            },
        )


class BranchUpdatedEvent(DomainEvent):
    """Filial parametrləri yeniləndikdə yayımlanan hadisə."""

    def __init__(self, branch_id: uuid.UUID, code: str, diff: dict[str, Any] | None = None) -> None:
        super().__init__(
            event_type="branch.updated",
            aggregate_type="branch",
            aggregate_id=str(branch_id),
            payload={
                "branch_id": str(branch_id),
                "code": code,
                "diff": diff or {},
            },
        )


class BranchStatusChangedEvent(DomainEvent):
    """Filialın aktivlik vəziyyəti dəyişdikdə yayımlanan hadisə."""

    def __init__(self, branch_id: uuid.UUID, old_status: str, new_status: str) -> None:
        super().__init__(
            event_type="branch.status_changed",
            aggregate_type="branch",
            aggregate_id=str(branch_id),
            payload={
                "branch_id": str(branch_id),
                "old_status": old_status,
                "new_status": new_status,
            },
        )
