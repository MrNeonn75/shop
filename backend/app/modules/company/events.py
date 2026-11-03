"""Şirkət Modulu Hadisələri (Company Domain Events)."""

from __future__ import annotations

import uuid
from typing import Any

from app.shared.events import DomainEvent


class CompanyUpdatedEvent(DomainEvent):
    """Şirkət profili yeniləndikdə yayımlanan hadisə."""

    def __init__(
        self, company_id: uuid.UUID, name: str, diff: dict[str, Any] | None = None
    ) -> None:
        super().__init__(
            event_type="company.updated",
            aggregate_type="company",
            aggregate_id=str(company_id),
            payload={
                "company_id": str(company_id),
                "name": name,
                "diff": diff or {},
            },
        )
