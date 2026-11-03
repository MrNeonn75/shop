"""Autentifikasiya Modulu Sxemləri və DTO Modelləri (Auth Schemas)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.modules.users.schemas import UserResponse


class LoginRequest(BaseModel):
    """Giriş sorğusu sxemi."""

    model_config = ConfigDict(extra="forbid")

    username: str = Field(..., min_length=1, description="İstifadəçi adı və ya e-poçt")
    password: str = Field(..., min_length=1)


class LoginResponse(BaseModel):
    """Uğurlu giriş cavabı."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse
    status: Literal["success", "2fa_required", "must_change_password"] = "success"
    temp_token: str | None = None


class RefreshTokenRequest(BaseModel):
    """Refresh token sorğusu (cookie olmadıqda body-dən oxumaq üçün)."""

    refresh_token: str | None = None


class ForgotPasswordRequest(BaseModel):
    """Şifrəmi unutdum sorğusu."""

    model_config = ConfigDict(extra="forbid")

    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Şifrəni sıfırlamaq üçün sorğu."""

    model_config = ConfigDict(extra="forbid")

    token: str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=8)


class TwoFactorEnrollResponse(BaseModel):
    """2FA quraşdırma cavabı (QR və bərpa kodları ilə)."""

    secret: str
    provisioning_uri: str
    recovery_codes: list[str]


class TwoFactorVerifyRequest(BaseModel):
    """2FA yoxlama sorğusu."""

    model_config = ConfigDict(extra="forbid")

    code: str = Field(..., min_length=6, max_length=8, pattern=r"^[a-zA-Z0-9]+$")


class TwoFactorLoginRequest(BaseModel):
    """2FA ilə girişi tamamlamaq sorğusu."""

    model_config = ConfigDict(extra="forbid")

    temp_token: str
    code: str = Field(..., min_length=6, max_length=16)


class TwoFactorDisableRequest(BaseModel):
    """2FA-nı söndürmək üçün təkrar autentifikasiya."""

    model_config = ConfigDict(extra="forbid")

    password: str


class PosLoginRequest(BaseModel):
    """POS kassaya PIN ilə sürətli giriş."""

    model_config = ConfigDict(extra="forbid")

    pin: str = Field(..., min_length=4, max_length=8, pattern=r"^\d+$")
    register_id: str | None = None
    branch_id: uuid.UUID | None = None


class ManagerApproveRequest(BaseModel):
    """Menecer təsdiq sorğusu."""

    model_config = ConfigDict(extra="forbid")

    manager_username: str
    manager_pin: str = Field(..., min_length=4, max_length=8, pattern=r"^\d+$")
    action_code: str = Field(..., min_length=3, max_length=100)
    resource_id: str | None = None
    branch_id: uuid.UUID | None = None
    reason: str = Field(..., min_length=3, max_length=500)


class ManagerApproveResponse(BaseModel):
    """Menecer təsdiq tokeni cavabı."""

    approval_token: str
    action_code: str
    expires_at: datetime
