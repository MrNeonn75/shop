"""Sazlamalar Modulu Hadisələri (Settings Events)."""

from __future__ import annotations

import uuid
from typing import Any

from app.shared.events import DomainEvent


class SettingChangedEvent(DomainEvent):
    """Parametr dəyəri yeniləndikdə yayımlanan hadisə (Keşin təmizlənməsi üçün)."""

    def __init__(
        self,
        key: str,
        version: int,
        branch_id: uuid.UUID | None = None,
        diff: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            event_type="setting.changed",
            aggregate_type="setting",
            aggregate_id=f"{key}:{branch_id or 'company'}",
            payload={
                "key": key,
                "version": version,
                "branch_id": str(branch_id) if branch_id else None,
                "diff": diff or {},
            },
        )
