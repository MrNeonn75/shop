"""Anbarlar Modulu Sxemləri (Warehouses DTOs)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

WarehouseType = Literal["central", "branch", "in_transit", "quarantine"]


class WarehouseZoneResponse(BaseModel):
    """Anbar zonası cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    warehouse_id: uuid.UUID
    code: str
    name: str
    is_active: bool


class WarehouseZoneCreate(BaseModel):
    """Yeni zona yaratmaq üçün sorğu sxemi."""

    model_config = ConfigDict(extra="forbid")

    code: str = Field(..., min_length=1, max_length=50, pattern=r"^[a-zA-Z0-9_\-]+$")
    name: str = Field(..., min_length=2, max_length=150)


class WarehouseResponse(BaseModel):
    """Anbar cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    branch_id: uuid.UUID | None = None
    code: str
    name: str
    warehouse_type: str
    address: str | None = None
    is_system: bool
    is_default_for_sales: bool
    status: Literal["active", "inactive"]
    is_active: bool = Field(default=True)
    version: int
    zones: list[WarehouseZoneResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class WarehouseCreate(BaseModel):
    """Yeni anbar yaratmaq üçün sorğu sxemi."""

    model_config = ConfigDict(extra="forbid")

    code: str = Field(..., min_length=2, max_length=50, pattern=r"^[a-zA-Z0-9_\-]+$")
    name: str = Field(..., min_length=2, max_length=150)
    warehouse_type: WarehouseType = "branch"
    branch_id: uuid.UUID | None = None
    address: str | None = Field(default=None, max_length=255)
    is_system: bool = Field(default=False, description="Sistem anbarı (Yalnız in_transit üçün)")
    is_default_for_sales: bool = False


class WarehouseUpdate(BaseModel):
    """Anbar məlumatlarını redaktə etmək üçün sorğu sxemi."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=2, max_length=150)
    address: str | None = Field(default=None, max_length=255)
    is_default_for_sales: bool | None = None
    version: int = Field(..., description="Optimistik kilidləmə versiya nömrəsi")
