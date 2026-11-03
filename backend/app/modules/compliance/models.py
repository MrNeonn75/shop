"""Compliance ORM modelləri.

Hüquqi dərəcələr və hədlər KODDA YOXDUR — yalnız verilənlər bazası sətirləridir.
Seed dəyərləri SECONDARY mənbələrdən UNVERIFIED referansdır; hüquqi uyğunluq iddiası yoxdur.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base, utc_now
from app.core.ids import generate_uuid7
from app.modules.compliance.enums import (
    CalendarYearStatus,
    CompanyTaxProfileStatus,
    ComplianceDomain,
    ObligationStatus,
    PackStatus,
    PackVersionStatus,
    PersonalDataRegistrationStatus,
    RegisterReviewStatus,
    RuleStatus,
    SourceType,
    TaxRegime,
    VerificationAction,
    VerifierRole,
)

JSONBType = JSONB().with_variant(JSON(), "sqlite")  # type: ignore[no-untyped-call]


# ==========================================
# RULE PACKS & VERSIONS
# ==========================================


class RulePack(Base):
    """Domain üzrə qayda paketi (tax_vat, fiscal_receipt, …)."""

    __tablename__ = "rule_packs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=generate_uuid7
    )
    domain: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    title_az: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sector: Mapped[str | None] = mapped_column(
        String(50), nullable=True, doc="məs: private_non_oil"
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default=PackStatus.DRAFT.value, index=True
    )
    active_version_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("rule_pack_versions.id", ondelete="SET NULL", use_alter=True, name="fk_rule_packs_active_version"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    versions: Mapped[list[RulePackVersion]] = relationship(
        "RulePackVersion",
        back_populates="pack",
        foreign_keys="RulePackVersion.pack_id",
        lazy="selectin",
    )


class RulePackVersion(Base):
    """Paket versiyası — DRAFT → verify → ACTIVE həyat dövrü."""

    __tablename__ = "rule_pack_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=generate_uuid7
    )
    pack_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("rule_packs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default=PackVersionStatus.DRAFT.value, index=True
    )
    effective_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    effective_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    banner_unverified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    activated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    snapshot_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)

    pack: Mapped[RulePack] = relationship(
        "RulePack",
        back_populates="versions",
        foreign_keys=[pack_id],
    )
    rules: Mapped[list[LegalRule]] = relationship(
        "LegalRule",
        back_populates="pack_version",
        lazy="selectin",
    )
    verifications: Mapped[list[RuleVerification]] = relationship(
        "RuleVerification",
        back_populates="pack_version",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint("pack_id", "version", name="uq_rule_pack_versions_pack_version"),
        Index("ix_rule_pack_versions_status_effective", "status", "effective_from"),
    )


class LegalRule(Base):
    """Tək hüquqi qayda — parametrlər JSONB, mənbə və yoxlama statusu ilə."""

    __tablename__ = "legal_rules"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=generate_uuid7
    )
    rule_key: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    jurisdiction: Mapped[str] = mapped_column(String(10), nullable=False, default="AZ")
    domain: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title_az: Mapped[str] = mapped_column(String(255), nullable=False)
    parameters: Mapped[dict[str, Any]] = mapped_column(JSONBType, nullable=False, default=dict)
    parameters_schema: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)
    effective_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    effective_to: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    legal_reference: Mapped[dict[str, Any] | None] = mapped_column(
        JSONBType,
        nullable=True,
        doc="{act_name, number, article}",
    )
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    source_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SourceType.SECONDARY.value
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default=RuleStatus.UNVERIFIED.value, index=True
    )
    verified_by_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verified_by_role: Mapped[str | None] = mapped_column(String(30), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    pack_version_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("rule_pack_versions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    editor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True, index=True
    )

    pack_version: Mapped[RulePackVersion | None] = relationship(
        "RulePackVersion",
        back_populates="rules",
        foreign_keys=[pack_version_id],
    )

    __table_args__ = (
        Index(
            "ix_legal_rules_domain_key_effective",
            "domain",
            "rule_key",
            "effective_from",
        ),
        Index("ix_legal_rules_jurisdiction_domain", "jurisdiction", "domain"),
    )


class RuleVerification(Base):
    """İki nəfərli yoxlama / rədd — verifier ≠ editor."""

    __tablename__ = "rule_verifications"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=generate_uuid7
    )
    pack_version_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("rule_pack_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    verifier_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    verifier_name: Mapped[str] = mapped_column(String(255), nullable=False)
    verifier_role: Mapped[str] = mapped_column(
        String(30), nullable=False, default=VerifierRole.ACCOUNTANT.value
    )
    evidence_file_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    evidence_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    pack_version: Mapped[RulePackVersion] = relationship(
        "RulePackVersion",
        back_populates="verifications",
        foreign_keys=[pack_version_id],
    )


# ==========================================
# OBLIGATIONS
# ==========================================


class ObligationTemplate(Base):
    """Öhdəlik şablonu — NO hardcoded due dates."""

    __tablename__ = "obligation_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=generate_uuid7
    )
    code: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    title_az: Mapped[str] = mapped_column(String(255), nullable=False)
    default_cadence_hint: Mapped[str | None] = mapped_column(
        String(100), nullable=True, doc="məs: monthly, quarterly — hint only"
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )


class Obligation(Base):
    """Təkrarlanan öhdəlik — cadence/due accountant tərəfindən doldurulur."""

    __tablename__ = "obligations"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=generate_uuid7
    )
    template_code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    title_az: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True, index=True
    )
    cadence: Mapped[str | None] = mapped_column(String(100), nullable=True)
    next_due: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default=ObligationStatus.OPEN.value, index=True
    )
    evidence_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True, index=True
    )
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)


# ==========================================
# APPEND-ONLY EVENTS
# ==========================================


class ComplianceEvent(Base):
    """Append-only compliance audit/event log."""

    __tablename__ = "compliance_events"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=generate_uuid7
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    domain: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    before: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False, index=True
    )

    __table_args__ = (
        Index("ix_compliance_events_entity", "entity_type", "entity_id"),
    )


# ==========================================
# PERSONAL DATA REGISTERS
# ==========================================


class DataProcessingRegister(Base):
    """Emal jurnali (record of processing activities)."""

    __tablename__ = "data_processing_register"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=generate_uuid7
    )
    system_module: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    data_categories: Mapped[Any] = mapped_column(
        JSONBType, nullable=False, default=list
    )
    purpose: Mapped[str] = mapped_column(String(500), nullable=False)
    legal_basis: Mapped[str] = mapped_column(String(100), nullable=False)
    subjects: Mapped[Any] = mapped_column(
        JSONBType, nullable=False, default=list
    )
    retention: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recipients: Mapped[Any] = mapped_column(JSONBType, nullable=True)
    storage_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cross_border: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    security_measures: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner: Mapped[str | None] = mapped_column(String(255), nullable=True)
    review_status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default=RegisterReviewStatus.REVIEW_REQUIRED.value,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class TransferRegister(Base):
    """Cross-border / processor transfer register."""

    __tablename__ = "transfer_register"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=generate_uuid7
    )
    processor_name: Mapped[str] = mapped_column(String(255), nullable=False)
    purpose: Mapped[str | None] = mapped_column(String(500), nullable=True)
    country: Mapped[str] = mapped_column(String(100), nullable=False)
    safeguards: Mapped[str | None] = mapped_column(Text, nullable=True)
    consent_coverage: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default=RegisterReviewStatus.REVIEW_REQUIRED.value,
        index=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class PersonalDataSystemRegistration(Base):
    """Şəxsi məlumat IS qeydiyyat izləyicisi — manual, no auto-submit."""

    __tablename__ = "personal_data_system_registration"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=generate_uuid7
    )
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default=PersonalDataRegistrationStatus.NOT_ASSESSED.value,
        index=True,
    )
    reference_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    registered_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    authority: Mapped[str | None] = mapped_column(String(255), nullable=True)
    evidence_file_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


# ==========================================
# CALENDAR, RETENTION, HOLDS
# ==========================================


class CalendarYear(Base):
    """İstehsalat təqvimi — bayram/qısaldılmış/köçürülmüş günlər JSONB."""

    __tablename__ = "calendar_years"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=generate_uuid7
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False, unique=True, index=True)
    working_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    working_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_ref: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default=CalendarYearStatus.UNVERIFIED.value
    )
    days: Mapped[dict[str, Any]] = mapped_column(
        JSONBType,
        nullable=False,
        default=dict,
        doc="{holidays: [], shortened: [], transferred: []}",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class RetentionRule(Base):
    """Saxlama müddəti qaydaları — UNVERIFIED seed mümkün."""

    __tablename__ = "retention_rules"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=generate_uuid7
    )
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    retention_years: Mapped[int | None] = mapped_column(Integer, nullable=True)
    action: Mapped[str] = mapped_column(String(40), nullable=False, default="FLAG")
    legal_reference: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    source_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SourceType.SECONDARY.value
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default=RuleStatus.UNVERIFIED.value, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    __table_args__ = (
        UniqueConstraint("entity_type", name="uq_retention_rules_entity_type"),
    )


class LegalHold(Base):
    """Hüquqi saxlama — silinməni bloklayır."""

    __tablename__ = "legal_holds"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=generate_uuid7
    )
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    held_by: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    held_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    released_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)

    __table_args__ = (
        Index("ix_legal_holds_entity_active", "entity_type", "entity_id", "released_at"),
    )


# ==========================================
# TAX PROFILE, E-QAIMA, TURNOVER, CONSENT
# ==========================================


class CompanyTaxProfile(Base):
    """Şirkət vergi rejimi — effective-dated."""

    __tablename__ = "company_tax_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=generate_uuid7
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), nullable=False, index=True
    )
    tax_regime: Mapped[str] = mapped_column(
        String(30), nullable=False, default=TaxRegime.OTHER.value
    )
    voen: Mapped[str | None] = mapped_column(String(20), nullable=True)
    effective_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    effective_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default=CompanyTaxProfileStatus.ACTIVE.value, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    __table_args__ = (
        Index("ix_company_tax_profiles_company_effective", "company_id", "effective_from"),
    )


class EQaimaReconciliation(Base):
    """ERP invoice ↔ xarici e-qaimə əl ilə uzlaşdırma."""

    __tablename__ = "e_qaima_reconciliations"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=generate_uuid7
    )
    erp_invoice_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), nullable=False, index=True
    )
    external_eqaima_number: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    vat_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    entered_by: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    entered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class TurnoverMonitorSnapshot(Base):
    """Dövriyyə monitoru read-model keşi (indikativ, filing deyil)."""

    __tablename__ = "turnover_monitor_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=generate_uuid7
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), nullable=False, index=True
    )
    as_of: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    calendar_year_turnover: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0")
    )
    rolling_12m_turnover: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0")
    )
    threshold: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    coefficient_applied: Mapped[Decimal | None] = mapped_column(Numeric(8, 4), nullable=True)
    percent_of_threshold: Mapped[Decimal | None] = mapped_column(Numeric(8, 4), nullable=True)
    breakdown: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "company_id", "as_of", name="uq_turnover_monitor_company_as_of"
        ),
    )


class ConsentFormVersion(Base):
    """Razılıq forması versiyası — mətn hash ilə."""

    __tablename__ = "consent_form_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=generate_uuid7
    )
    purpose: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="az")
    text_az: Mapped[str] = mapped_column(Text, nullable=False)
    text_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    effective_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "purpose", "language", "version", name="uq_consent_form_purpose_lang_version"
        ),
    )


# Forward refs for type checkers
ComplianceDomain  # noqa: B018 — re-export hint
VerificationAction  # noqa: B018
