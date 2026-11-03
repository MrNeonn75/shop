"""Ping Modulu Pydantic DTO Modelləri."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(..., min_length=1, max_length=255, description="Ping mətni")
    branch_id: uuid.UUID | None = Field(default=None, description="Əlaqəli filial ID-si")


class PingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    message: str
    client_ip: str | None = None
    status: str
    branch_id: uuid.UUID | None = None
    created_at: datetime
    version: int
