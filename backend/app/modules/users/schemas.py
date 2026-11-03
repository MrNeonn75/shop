"""İstifadəçilər Modulu Pydantic Sxemləri (Users DTOs).

API sorğu və cavab modelləri. Heç bir halda şifrə və PIN heşləri geri qaytarılmır.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

UserStatus = Literal["active", "suspended", "pending", "locked"]


class UserCreate(BaseModel):
    """Yeni istifadəçi yaratmaq üçün sorğu sxemi."""

    model_config = ConfigDict(extra="forbid")

    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_\.\-]+$")
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=100)
    password: str | None = Field(
        default=None, min_length=8, description="Boş buraxıldıqda avtomatik generasiya edilir"
    )
    employee_ref: str | None = Field(default=None, max_length=50)
    preferred_language: Literal["az", "en", "ru"] = "az"
    must_change_password: bool = True
    role_ids: list[uuid.UUID] = Field(default_factory=list)
    allowed_branch_ids: list[uuid.UUID] = Field(default_factory=list)


class UserUpdate(BaseModel):
    """İstifadəçi məlumatlarını yeniləmək üçün sorğu sxemi."""

    model_config = ConfigDict(extra="forbid")

    full_name: str | None = Field(default=None, min_length=2, max_length=100)
    email: EmailStr | None = None
    preferred_language: Literal["az", "en", "ru"] | None = None
    employee_ref: str | None = None
    version: int = Field(..., description="Optimistic locking üçün versiya nömrəsi")


class UserStatusUpdate(BaseModel):
    """İstifadəçi statusunu dəyişmək üçün sorğu (Aktivləşdir / Dayandır)."""

    model_config = ConfigDict(extra="forbid")

    status: UserStatus
    reason: str | None = Field(default=None, max_length=500)
    version: int


class UserBranchAssignment(BaseModel):
    """Filial icazələrini təyin etmək üçün sxem."""

    model_config = ConfigDict(extra="forbid")

    branch_ids: list[uuid.UUID]
    manage_branch_ids: list[uuid.UUID] = Field(default_factory=list)


class UserSetPin(BaseModel):
    """Menecer və ya POS PIN kodunu təyin etmək üçün sxem."""

    model_config = ConfigDict(extra="forbid")

    pin: str = Field(..., min_length=4, max_length=8, pattern=r"^\d+$")


class UserBranchAccessResponse(BaseModel):
    """Filial çıxış icazəsi cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    branch_id: uuid.UUID
    can_manage: bool


class UserResponse(BaseModel):
    """İstifadəçi cavab sxemi (Heşlər QƏTİ QADAĞANDIR)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_ref: str | None
    username: str
    email: str
    full_name: str
    status: UserStatus
    must_change_password: bool
    last_login_at: datetime | None
    preferred_language: str
    totp_enabled: bool
    roles: list[str] = Field(default_factory=list, description="Təyin olunmuş rol kodları")
    allowed_branches: list[uuid.UUID] = Field(
        default_factory=list, description="İcazəli filial ID-ləri"
    )
    created_at: datetime
    updated_at: datetime
    version: int


class UserAuthRecord(BaseModel):
    """Autentifikasiya üçün daxili məlumat strukturu (API-da heç vaxt qaytarılmır)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_ref: str | None
    username: str
    email: str
    full_name: str
    password_hash: str
    status: UserStatus
    must_change_password: bool
    last_login_at: datetime | None
    failed_login_count: int
    locked_until: datetime | None
    manager_pin_hash: str | None
    pos_pin_hash: str | None
    totp_secret: str | None
    totp_enabled: bool
    preferred_language: str
    version: int
    created_at: datetime
    updated_at: datetime
