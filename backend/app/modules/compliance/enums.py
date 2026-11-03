"""Compliance domain enumerations.

Law is DATA, not code. These enums classify data rows — they do not encode legal rates.
"""

from __future__ import annotations

import enum


class ComplianceDomain(str, enum.Enum):
    TAX_VAT = "tax_vat"
    FISCAL_RECEIPT = "fiscal_receipt"
    PAYROLL_TAX = "payroll_tax"
    PAYROLL_SOCIAL = "payroll_social"
    LABOR_TIME = "labor_time"
    LABOR_LEAVE = "labor_leave"
    CONSUMER_RETURNS = "consumer_returns"
    PERSONAL_DATA = "personal_data"
    RETENTION = "retention"


class RuleStatus(str, enum.Enum):
    UNVERIFIED = "UNVERIFIED"
    VERIFIED = "VERIFIED"
    SUPERSEDED = "SUPERSEDED"
    DISPUTED = "DISPUTED"


class SourceType(str, enum.Enum):
    OFFICIAL = "OFFICIAL"
    SECONDARY = "SECONDARY"


class PackStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    SUPERSEDED = "SUPERSEDED"


class PackVersionStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PENDING_VERIFY = "PENDING_VERIFY"
    VERIFIED = "VERIFIED"
    ACTIVE = "ACTIVE"
    REJECTED = "REJECTED"
    SUPERSEDED = "SUPERSEDED"


class VerifierRole(str, enum.Enum):
    ACCOUNTANT = "accountant"
    LAWYER = "lawyer"


class VerificationAction(str, enum.Enum):
    VERIFY = "VERIFY"
    REJECT = "REJECT"


class ObligationStatus(str, enum.Enum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    OVERDUE = "OVERDUE"


class ComplianceEventType(str, enum.Enum):
    RULE_CREATED = "RULE_CREATED"
    RULE_UPDATED = "RULE_UPDATED"
    RULE_SUPERSEDED = "RULE_SUPERSEDED"
    PACK_PROPOSED = "PACK_PROPOSED"
    PACK_VERIFIED = "PACK_VERIFIED"
    PACK_REJECTED = "PACK_REJECTED"
    PACK_ACTIVATED = "PACK_ACTIVATED"
    OBLIGATION_CREATED = "OBLIGATION_CREATED"
    OBLIGATION_UPDATED = "OBLIGATION_UPDATED"
    OBLIGATION_COMPLETED = "OBLIGATION_COMPLETED"
    REGISTER_UPDATED = "REGISTER_UPDATED"
    LEGAL_HOLD_PLACED = "LEGAL_HOLD_PLACED"
    LEGAL_HOLD_RELEASED = "LEGAL_HOLD_RELEASED"
    CONSENT_FORM_CREATED = "CONSENT_FORM_CREATED"
    CACHE_INVALIDATED = "CACHE_INVALIDATED"


class FiscalMode(str, enum.Enum):
    REQUIRED = "REQUIRED"
    OPTIONAL = "OPTIONAL"


class TaxRegime(str, enum.Enum):
    VAT_PAYER = "VAT_PAYER"
    SIMPLIFIED = "SIMPLIFIED"
    OTHER = "OTHER"


class LegalReturnability(str, enum.Enum):
    RETURNABLE = "RETURNABLE"
    NON_RETURNABLE_BY_LAW = "NON_RETURNABLE_BY_LAW"
    CONDITIONAL = "CONDITIONAL"


class PersonalDataRegistrationStatus(str, enum.Enum):
    NOT_ASSESSED = "NOT_ASSESSED"
    EXEMPT_VERIFIED = "EXEMPT_VERIFIED"
    REGISTRATION_PENDING = "REGISTRATION_PENDING"
    REGISTERED = "REGISTERED"


class DomainComplianceStatus(str, enum.Enum):
    """Per-domain summary for health / status endpoints."""

    ACTIVE_VERIFIED = "ACTIVE-VERIFIED"
    ACTIVE_UNVERIFIED = "ACTIVE-UNVERIFIED"
    MISSING = "MISSING"
    DISPUTED = "DISPUTED"


class CalendarYearStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    UNVERIFIED = "UNVERIFIED"
    VERIFIED = "VERIFIED"
    ACTIVE = "ACTIVE"


class CompanyTaxProfileStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    SUPERSEDED = "SUPERSEDED"
    DRAFT = "DRAFT"


class RegisterReviewStatus(str, enum.Enum):
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    VERIFIED = "VERIFIED"
    ARCHIVED = "ARCHIVED"


class RetentionAction(str, enum.Enum):
    FLAG = "FLAG"
    ARCHIVE = "ARCHIVE"
    ANONYMIZE = "ANONYMIZE"
    DELETE_AFTER_HOLD_CHECK = "DELETE_AFTER_HOLD_CHECK"


# Domains that must be present for production feature gates (mandatory packs).
MANDATORY_DOMAINS: tuple[ComplianceDomain, ...] = (
    ComplianceDomain.TAX_VAT,
    ComplianceDomain.FISCAL_RECEIPT,
    ComplianceDomain.PAYROLL_TAX,
    ComplianceDomain.PAYROLL_SOCIAL,
    ComplianceDomain.LABOR_TIME,
    ComplianceDomain.LABOR_LEAVE,
    ComplianceDomain.CONSUMER_RETURNS,
    ComplianceDomain.PERSONAL_DATA,
    ComplianceDomain.RETENTION,
)
