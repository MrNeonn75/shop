"""Sazlamalar Modulu Sxemləri (Settings DTOs)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class SettingGroupResponse(BaseModel):
    """Parametr qrupu və onun qeydiyyat təyinatı."""

    key: str
    group: str
    type_name: str
    default_value: Any
    scope: Literal["company", "branch", "role"]
    sensitivity: Literal["normal", "sensitive", "critical"]
    description_az: str
    requires_reason: bool


class SettingValueResponse(BaseModel):
    """Parametr dəyəri cavab sxemi."""

    key: str
    value: Any
    effective_from: datetime
    version: int
    reason: str | None = None
    branch_id: uuid.UUID | None = None
    source: Literal["branch_override", "company_value", "default_registry"]
    history_id: uuid.UUID | None = None


class SettingUpdateRequest(BaseModel):
    """Parametr dəyərinin yenilənməsi sorğusu."""

    model_config = ConfigDict(extra="forbid")

    value: Any
    branch_id: uuid.UUID | None = None
    effective_from: datetime | None = None
    reason: str | None = Field(
        default=None, description="Həssas parametrlər üçün məcburi əsaslandırma"
    )
    version: int | None = Field(default=None, description="Versiya nömrəsi")


class SettingPreviewRequest(BaseModel):
    """Dəyişiklikdən əvvəl fərqin (diff) önizlənməsi sorğusu."""

    key: str
    new_value: Any
    branch_id: uuid.UUID | None = None


class SettingPreviewResponse(BaseModel):
    """Parametr dəyişikliyinin fərq önizlənməsi."""

    key: str
    current_value: Any
    new_value: Any
    diff: dict[str, Any]
    scope: str
    is_changed: bool = True


class SettingHistoryResponse(BaseModel):
    """Parametrin keçmiş versiya qeydi."""

    id: uuid.UUID
    key: str
    value: Any
    effective_from: datetime
    version: int
    reason: str | None
    branch_id: uuid.UUID | None
    updated_by: uuid.UUID | None
    created_at: datetime


class SettingRestoreRequest(BaseModel):
    """Keçmiş versiyanın bərpası üçün sorğu."""

    history_id: uuid.UUID
    reason: str = Field(..., min_length=3, description="Bərpa səbəbi")


class ReasonCodeResponse(BaseModel):
    """Səbəb kodu cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category: str
    code: str
    name_az: str
    description: str | None = None
    is_active: bool
    is_system: bool
    usage_count: int
    version: int


class ReasonCodeCreate(BaseModel):
    """Yeni səbəb kodu yaratmaq üçün sorğu."""

    model_config = ConfigDict(extra="forbid")

    category: Literal["returns", "adjustments", "discounts", "cash_in_out", "voids"]
    code: str = Field(..., min_length=2, max_length=50, pattern=r"^[a-zA-Z0-9_\-]+$")
    name_az: str = Field(..., min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=255)


class ReasonCodeUpdate(BaseModel):
    """Səbəb kodunu redaktə etmək üçün sorğu."""

    model_config = ConfigDict(extra="forbid")

    name_az: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None
    version: int
