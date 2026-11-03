"""Sessiyalar Modulu Sxemləri (Sessions DTOs)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SessionResponse(BaseModel):
    """Sessiya cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    device_info: str | None
    ip_address: str | None
    user_agent: str | None
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    is_current: bool = False
