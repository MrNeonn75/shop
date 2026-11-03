"""Filiallar Modulu Sxemləri (Branches DTOs)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class BranchResponse(BaseModel):
    """Filial cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    code: str
    name: str
    address: str
    phone: str
    email: str | None = None
    manager_user_id: uuid.UUID | None = None
    operating_hours: dict[str, Any] = Field(default_factory=dict)
    exceptions: list[dict[str, Any]] = Field(default_factory=list)
    status: Literal["active", "inactive"]
    is_active: bool = Field(default=True)
    settings: dict[str, Any] = Field(default_factory=dict)
    version: int
    created_at: datetime
    updated_at: datetime


class BranchCreate(BaseModel):
    """Yeni filial yaratmaq üçün sorğu sxemi."""

    model_config = ConfigDict(extra="forbid")

    code: str = Field(..., min_length=2, max_length=50, pattern=r"^[a-zA-Z0-9_\-]+$")
    name: str = Field(..., min_length=2, max_length=150)
    address: str = Field(..., min_length=3, max_length=255)
    phone: str = Field(..., min_length=7, max_length=50)
    email: EmailStr | None = None
    manager_user_id: uuid.UUID | None = None
    operating_hours: dict[str, Any] = Field(default_factory=dict)
    exceptions: list[dict[str, Any]] = Field(default_factory=list)
    settings: dict[str, Any] = Field(default_factory=dict)


class BranchUpdate(BaseModel):
    """Filial məlumatlarını yeniləmək üçün sorğu sxemi."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=2, max_length=150)
    address: str | None = Field(default=None, min_length=3, max_length=255)
    phone: str | None = Field(default=None, min_length=7, max_length=50)
    email: EmailStr | None = None
    manager_user_id: uuid.UUID | None = None
    operating_hours: dict[str, Any] | None = None
    exceptions: list[dict[str, Any]] | None = None
    settings: dict[str, Any] | None = None
    version: int = Field(..., description="Optimistik kilidləmə versiya nömrəsi")


class BranchSummaryResponse(BaseModel):
    """Filial üzrə icmal statistikası (anbarlar, kassalar, işçilər)."""

    branch_id: uuid.UUID
    branch_code: str
    branch_name: str
    status: str
    warehouses_count: int
    registers_count: int
    employees_count: int
    open_documents_count: int
