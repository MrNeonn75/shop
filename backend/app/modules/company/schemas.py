"""Şirkət Modulu Sxemləri (Company DTOs)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class CompanyResponse(BaseModel):
    """Şirkət profilinin xarici cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    legal_name: str
    tax_id: str
    address: str
    phone: str
    email: str
    website: str | None = None
    logo_url: str | None = None
    default_currency: str
    timezone: str
    default_language: str
    is_active: bool
    version: int
    created_at: datetime
    updated_at: datetime


class CompanyUpdate(BaseModel):
    """Şirkət profilinin yenilənməsi üçün sorğu sxemi."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=2, max_length=150)
    legal_name: str | None = Field(default=None, min_length=2, max_length=200)
    tax_id: str | None = Field(
        default=None,
        min_length=10,
        max_length=10,
        pattern=r"^\d{10}$",
        description="Azərbaycan Respublikası 10 rəqəmli VÖEN",
    )
    address: str | None = Field(default=None, min_length=3, max_length=255)
    phone: str | None = Field(default=None, min_length=7, max_length=50)
    email: EmailStr | None = None
    website: str | None = Field(default=None, max_length=100)
    logo_url: str | None = Field(default=None, max_length=255)
    default_currency: str | None = Field(default=None, min_length=3, max_length=3)
    timezone: str | None = Field(default=None, max_length=50)
    default_language: Literal["az", "en", "ru"] | None = None
    version: int = Field(..., description="Optimistik kilidləmə üçün cari versiya nömrəsi")
