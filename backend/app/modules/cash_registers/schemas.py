"""Kassa Aparatları Modulu Sxemləri (Cash Registers DTOs)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class CashRegisterResponse(BaseModel):
    """Kassa aparatı cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    branch_id: uuid.UUID
    default_warehouse_id: uuid.UUID
    code: str
    name: str
    status: Literal["active", "inactive"]
    is_active: bool = Field(default=True)
    device_binding_info: dict[str, Any] | None = None
    receipt_printer_profile_ref: str | None = None
    version: int
    created_at: datetime
    updated_at: datetime


class CashRegisterCreate(BaseModel):
    """Yeni kassa qeydiyyatı üçün sorğu sxemi."""

    model_config = ConfigDict(extra="forbid")

    branch_id: uuid.UUID
    default_warehouse_id: uuid.UUID
    code: str = Field(..., min_length=2, max_length=50, pattern=r"^[a-zA-Z0-9_\-]+$")
    name: str = Field(..., min_length=2, max_length=100)
    device_binding_info: dict[str, Any] | None = None
    receipt_printer_profile_ref: str | None = Field(default=None, max_length=100)


class CashRegisterUpdate(BaseModel):
    """Kassa məlumatlarını redaktə etmək üçün sorğu sxemi."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=2, max_length=100)
    default_warehouse_id: uuid.UUID | None = None
    device_binding_info: dict[str, Any] | None = None
    receipt_printer_profile_ref: str | None = Field(default=None, max_length=100)
    version: int = Field(..., description="Optimistik kilidləmə versiya nömrəsi")
