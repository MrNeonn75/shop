"""Sənəd Nömrələnməsi Pydantic Sxemləri (Numbering Schemas)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class NumberingSequenceResponse(BaseModel):
    """Sənəd nömrələnmə ardıcıllığının cavab sxemi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    branch_id: uuid.UUID | None = None
    register_id: uuid.UUID | None = None
    document_type: str
    name: str
    prefix: str
    pattern: str
    reset_rule: str
    scope: str
    current_sequence: int
    last_reset_date: date | None = None
    is_gapless: bool
    is_active: bool
    version: int
    created_at: datetime
    updated_at: datetime


class NumberingSequenceCreate(BaseModel):
    """Yeni nömrələnmə ardıcıllığı yaratma sorğusu."""

    document_type: str = Field(
        ..., min_length=2, max_length=50, description="Sənəd növü (məs: receipt, return, po)"
    )
    name: str = Field(..., min_length=2, max_length=100, description="Ardıcıllığın adı")
    prefix: str = Field(default="", max_length=20, description="Prefiks (məs: RCP)")
    pattern: str = Field(
        default="{PREFIX}-{YYYY}-{SEQ:6}",
        min_length=3,
        max_length=100,
        description="Nömrə şablonu",
    )
    reset_rule: str = Field(
        default="never",
        description="Sıfırlanma qaydası: never, yearly, monthly, daily",
    )
    scope: str = Field(
        default="company",
        description="Əhatə dairəsi: company, branch, register",
    )
    branch_id: uuid.UUID | None = None
    register_id: uuid.UUID | None = None
    is_gapless: bool = Field(default=False, description="Fasiləsizlik tələb edilirmi?")

    @field_validator("reset_rule")
    @classmethod
    def validate_reset_rule(cls, v: str) -> str:
        clean = v.strip().lower()
        if clean not in ("never", "yearly", "monthly", "daily"):
            raise ValueError(
                "reset_rule yalnız 'never', 'yearly', 'monthly' və ya 'daily' ola bilər."
            )
        return clean

    @field_validator("scope")
    @classmethod
    def validate_scope(cls, v: str) -> str:
        clean = v.strip().lower()
        if clean not in ("company", "branch", "register"):
            raise ValueError("scope yalnız 'company', 'branch' və ya 'register' ola bilər.")
        return clean

    @field_validator("pattern")
    @classmethod
    def validate_pattern(cls, v: str) -> str:
        clean = v.strip()
        if "{SEQ" not in clean:
            raise ValueError(
                "Şablonda mütləq ardıcıl nömrə tokeni olmalıdır (məs: {SEQ:6} və ya {SEQ})."
            )
        return clean


class NumberingSequenceUpdate(BaseModel):
    """Nömrələnmə ardıcıllığını yeniləmə sorğusu (yalnız gələcək nömrələrə təsir edir)."""

    name: str | None = Field(None, min_length=2, max_length=100)
    prefix: str | None = Field(None, max_length=20)
    pattern: str | None = Field(None, min_length=3, max_length=100)
    reset_rule: str | None = None
    is_gapless: bool | None = None
    is_active: bool | None = None
    version: int = Field(..., ge=1, description="Optimistik kilidləmə versiya nömrəsi")

    @field_validator("reset_rule")
    @classmethod
    def validate_reset_rule(cls, v: str | None) -> str | None:
        if v is None:
            return None
        clean = v.strip().lower()
        if clean not in ("never", "yearly", "monthly", "daily"):
            raise ValueError(
                "reset_rule yalnız 'never', 'yearly', 'monthly' və ya 'daily' ola bilər."
            )
        return clean

    @field_validator("pattern")
    @classmethod
    def validate_pattern(cls, v: str | None) -> str | None:
        if v is None:
            return None
        clean = v.strip()
        if "{SEQ" not in clean:
            raise ValueError(
                "Şablonda mütləq ardıcıl nömrə tokeni olmalıdır (məs: {SEQ:6} və ya {SEQ})."
            )
        return clean


class NumberingPreviewRequest(BaseModel):
    """Nömrə şablonunun önizlənməsi sorğusu."""

    pattern: str = Field(
        default="{PREFIX}-{BRANCH}-{YYYY}{MM}-{SEQ:6}", description="Yoxlanılacaq şablon"
    )
    prefix: str = Field(default="RCP", description="Nümunə prefiks")
    branch_code: str = Field(default="28MAY", description="Nümunə filial kodu")
    register_code: str = Field(default="REG01", description="Nümunə kassa kodu")
    sequence_number: int = Field(default=1, ge=1, description="Nümunə sıra nömrəsi")
    sample_date: datetime | None = Field(None, description="Nümunə tarixi (boşdursa cari tarix)")


class NumberingPreviewResponse(BaseModel):
    """Nömrə şablonunun önizlənməsi nəticəsi."""

    pattern: str
    preview_number: str
    tokens_used: list[str]


class NextNumberRequest(BaseModel):
    """Növbəti nömrəni tələb etmə sorğusu."""

    document_type: str = Field(..., description="Sənəd növü")
    branch_id: uuid.UUID | None = None
    register_id: uuid.UUID | None = None


class NextNumberResponse(BaseModel):
    """Verilmiş sənəd nömrəsi cavabı."""

    document_type: str
    number: str
    sequence_id: uuid.UUID
