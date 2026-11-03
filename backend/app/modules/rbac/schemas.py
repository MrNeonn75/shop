"""RBAC Sxemləri və DTO Modelləri (RBAC Schemas)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PermissionResponse(BaseModel):
    """İcazə kataloqu elementi cavabı."""

    model_config = ConfigDict(from_attributes=True)

    key: str
    module: str
    description: str
    risk_level: str


class RoleCreate(BaseModel):
    """Yeni rol yaratmaq üçün sorğu."""

    model_config = ConfigDict(extra="forbid")

    code: str = Field(..., min_length=2, max_length=50, pattern=r"^[a-z0-9_]+$")
    name: str = Field(..., min_length=2, max_length=100)
    description: str | None = None
    permission_keys: list[str] = Field(default_factory=list)


class RoleUpdate(BaseModel):
    """Rol məlumatlarını və icazələrini yeniləmək üçün sorğu."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=2, max_length=100)
    description: str | None = None
    permission_keys: list[str] = Field(default_factory=list)
    version: int


class RoleResponse(BaseModel):
    """Rol cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    description: str | None
    is_system: bool
    is_protected: bool
    permissions: list[str] = Field(default_factory=list)
    active_users_count: int = 0
    version: int


class RoleImpactSummary(BaseModel):
    """Rol dəyişikliyinin cari istifadəçilərə təsir xülasəsi."""

    role_id: uuid.UUID
    code: str
    affected_users_count: int
    warnings: list[str] = Field(default_factory=list)


class TemporaryGrantCreate(BaseModel):
    """Müvəqqəti icazə (grant) yaratmaq üçün sorğu."""

    model_config = ConfigDict(extra="forbid")

    user_id: uuid.UUID
    permission_key: str | None = None
    role_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    expires_at: datetime
    reason: str = Field(..., min_length=5, max_length=500)


class TemporaryGrantResponse(BaseModel):
    """Müvəqqəti icazə cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    permission_key: str | None
    role_id: uuid.UUID | None
    branch_id: uuid.UUID | None
    expires_at: datetime
    reason: str
    approver_id: uuid.UUID
    revoked_at: datetime | None
    is_active: bool


class UserPermissionOverrideRequest(BaseModel):
    """Fərdi istifadəçi icazə istisnası yaratmaq."""

    model_config = ConfigDict(extra="forbid")

    permission_key: str
    granted: bool


class EffectivePermissionsResponse(BaseModel):
    """İstifadəçinin yekun effektiv səlahiyyətləri (Frontend üçün)."""

    user_id: uuid.UUID
    roles: list[str]
    permissions: list[str]
    allowed_branches: list[uuid.UUID]
    is_all_branches: bool
    permission_set_version: str


class SegregationOfDutiesWarning(BaseModel):
    """Vəzifələrin bölünməsi (SoD) ziddiyyət xəbərdarlığı."""

    pair: list[str]
    explanation: str
