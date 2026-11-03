"""Compliance Pydantic request/response schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# ------------------------------------------
# Rules
# ------------------------------------------


class LegalRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rule_key: str
    jurisdiction: str
    domain: str
    title_az: str
    parameters: dict[str, Any]
    parameters_schema: dict[str, Any] | None = None
    effective_from: datetime
    effective_to: datetime | None = None
    legal_reference: dict[str, Any] | None = None
    source_url: str | None = None
    source_type: str
    status: str
    verified_by_name: str | None = None
    verified_by_role: str | None = None
    verified_at: datetime | None = None
    notes: str | None = None
    version: int
    pack_version_id: uuid.UUID | None = None
    created_at: datetime
    created_by: uuid.UUID | None = None
    editor_id: uuid.UUID | None = None


class LegalRuleListParams(BaseModel):
    domain: str | None = None
    rule_key: str | None = None
    status: str | None = None
    pack_version_id: uuid.UUID | None = None
    at: datetime | None = None


class RuleSnapshotItem(BaseModel):
    rule_id: uuid.UUID
    rule_key: str
    domain: str
    version: int
    status: str
    parameters: dict[str, Any]
    pack_version_id: uuid.UUID | None = None
    effective_from: datetime
    source_type: str


class RuleSnapshotResponse(BaseModel):
    rules: list[RuleSnapshotItem]
    snapshot_hash: str
    captured_at: datetime
    disclaimer: str = (
        "REFERENCE / INFORMATIONAL — hüquqi uyğunluq iddiası yoxdur; "
        "dəyərlər yoxlanmamış (UNVERIFIED) və ya yoxlanmış mənbələrə əsaslanır."
    )


# ------------------------------------------
# Packs / versions
# ------------------------------------------


class RulePackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    domain: str
    code: str
    title_az: str
    description: str | None = None
    sector: str | None = None
    status: str
    active_version_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class ProposeChangeRequest(BaseModel):
    notes: str | None = None
    rules: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Yeni/yenilənmiş qayda layihələri (rule_key, title_az, parameters, …)",
    )
    effective_from: datetime | None = None


class PackVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    pack_id: uuid.UUID
    version: int
    status: str
    effective_from: datetime | None = None
    effective_to: datetime | None = None
    banner_unverified: bool
    created_by: uuid.UUID | None = None
    created_at: datetime
    activated_at: datetime | None = None
    activated_by: uuid.UUID | None = None
    notes: str | None = None
    snapshot_hash: str | None = None


class VerifyPackRequest(BaseModel):
    verifier_name: str = Field(..., min_length=2, max_length=255)
    verifier_role: str = Field(..., pattern="^(accountant|lawyer)$")
    evidence_file_id: uuid.UUID | None = None
    evidence_notes: str = Field(..., min_length=3)


class RejectPackRequest(BaseModel):
    verifier_name: str = Field(..., min_length=2, max_length=255)
    verifier_role: str = Field(..., pattern="^(accountant|lawyer)$")
    evidence_file_id: uuid.UUID | None = None
    evidence_notes: str = Field(..., min_length=3)


class ActivatePackRequest(BaseModel):
    effective_from: datetime


class VersionDiffResponse(BaseModel):
    version_a_id: uuid.UUID
    version_b_id: uuid.UUID
    added: list[dict[str, Any]]
    removed: list[dict[str, Any]]
    changed: list[dict[str, Any]]


# ------------------------------------------
# Status / banner
# ------------------------------------------


class DomainStatusItem(BaseModel):
    domain: str
    status: str
    pack_code: str | None = None
    pack_version_id: uuid.UUID | None = None
    banner_unverified: bool = False
    disputed_rule_keys: list[str] = Field(default_factory=list)


class ComplianceStatusResponse(BaseModel):
    environment: str
    is_production: bool
    domains: list[DomainStatusItem]
    critical: bool = False
    disclaimer: str = (
        "Bu xülasə sistemin qayda paketlərinin yoxlama vəziyyətini göstərir. "
        "Hüquqi uyğunluq və ya təsdiq edilmiş qanunilik iddiası deyil."
    )


class ComplianceBannerResponse(BaseModel):
    show_banner: bool
    message_az: str
    unverified_domains: list[str] = Field(default_factory=list)
    environment: str


# ------------------------------------------
# Obligations
# ------------------------------------------


class ObligationCreate(BaseModel):
    template_code: str
    title_az: str
    owner_user_id: uuid.UUID | None = None
    cadence: str | None = None
    next_due: date | None = None
    company_id: uuid.UUID | None = None
    meta: dict[str, Any] | None = None


class ObligationUpdate(BaseModel):
    title_az: str | None = None
    owner_user_id: uuid.UUID | None = None
    cadence: str | None = None
    next_due: date | None = None
    status: str | None = None
    evidence_notes: str | None = None
    meta: dict[str, Any] | None = None


class ObligationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    template_code: str
    title_az: str
    owner_user_id: uuid.UUID | None = None
    cadence: str | None = None
    next_due: date | None = None
    status: str
    evidence_notes: str | None = None
    completed_at: datetime | None = None
    company_id: uuid.UUID | None = None
    meta: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class ObligationTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    title_az: str
    default_cadence_hint: str | None = None
    description: str | None = None


# ------------------------------------------
# Register export
# ------------------------------------------


class RegisterExportResponse(BaseModel):
    format: str
    content_type: str
    filename: str
    body: str
    disclaimer: str = (
        "DRAFT / INFORMATIONAL — accountant review required. Not a legal filing."
    )


# ------------------------------------------
# Misc helpers
# ------------------------------------------


class CompanyTaxProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    tax_regime: str
    voen: str | None = None
    effective_from: datetime
    effective_to: datetime | None = None
    status: str


class EQaimaReconciliationCreate(BaseModel):
    erp_invoice_id: uuid.UUID
    external_eqaima_number: str
    vat_amount: Decimal | None = None
    notes: str | None = None


class EQaimaReconciliationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    erp_invoice_id: uuid.UUID
    external_eqaima_number: str
    vat_amount: Decimal | None = None
    entered_by: uuid.UUID
    entered_at: datetime
    notes: str | None = None
