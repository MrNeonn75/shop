"""Feature gates tied to verified compliance rule packs.

In production: missing or UNVERIFIED mandatory packs raise
BusinessRuleViolationError(code=COMPLIANCE_RULES_NOT_VERIFIED).
Non-prod: allow with banner metadata.
DISPUTED always blocks activation / gated features.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.config import settings
from app.core.errors import BusinessRuleViolationError
from app.modules.compliance.enums import (
    ComplianceDomain,
    DomainComplianceStatus,
    RuleStatus,
)

# Feature → required compliance domains
FEATURE_DOMAIN_MAP: dict[str, tuple[ComplianceDomain, ...]] = {
    "fiscal_receipts": (ComplianceDomain.FISCAL_RECEIPT,),
    "tax_calculation": (ComplianceDomain.TAX_VAT,),
    "payroll_finalization": (
        ComplianceDomain.PAYROLL_TAX,
        ComplianceDomain.PAYROLL_SOCIAL,
    ),
    "consent_privacy_enforcement": (ComplianceDomain.PERSONAL_DATA,),
}


@dataclass
class GateResult:
    allowed: bool
    feature: str
    missing_domains: list[str] = field(default_factory=list)
    unverified_domains: list[str] = field(default_factory=list)
    disputed_domains: list[str] = field(default_factory=list)
    banner: dict[str, Any] | None = None


def evaluate_domains(
    domain_statuses: dict[str, DomainComplianceStatus],
    required: tuple[ComplianceDomain, ...],
) -> GateResult:
    """Pure evaluation used by ComplianceService.ensure_feature_allowed."""
    missing: list[str] = []
    unverified: list[str] = []
    disputed: list[str] = []

    for domain in required:
        key = domain.value
        status = domain_statuses.get(key, DomainComplianceStatus.MISSING)
        if status == DomainComplianceStatus.MISSING:
            missing.append(key)
        elif status == DomainComplianceStatus.DISPUTED:
            disputed.append(key)
        elif status == DomainComplianceStatus.ACTIVE_UNVERIFIED:
            unverified.append(key)

    return GateResult(
        allowed=True,  # refined below
        feature="",
        missing_domains=missing,
        unverified_domains=unverified,
        disputed_domains=disputed,
    )


def enforce_feature_gate(
    feature: str,
    domain_statuses: dict[str, DomainComplianceStatus],
    *,
    raise_on_block: bool = True,
) -> GateResult:
    """Check whether a gated feature may proceed given current domain statuses."""
    required = FEATURE_DOMAIN_MAP.get(feature)
    if required is None:
        raise BusinessRuleViolationError(
            message=f"Naməlum compliance feature: {feature}",
            code="COMPLIANCE_UNKNOWN_FEATURE",
            details={"feature": feature},
        )

    result = evaluate_domains(domain_statuses, required)
    result.feature = feature

    # DISPUTED always blocks
    if result.disputed_domains:
        result.allowed = False
        if raise_on_block:
            raise BusinessRuleViolationError(
                message=(
                    "Mübahisəli (DISPUTED) qayda paketləri mövcuddur; "
                    "xüsusiyyət bloklanıb. Verifier həll etməlidir."
                ),
                code="COMPLIANCE_RULES_DISPUTED",
                details={
                    "feature": feature,
                    "disputed_domains": result.disputed_domains,
                },
            )
        return result

    blocking = result.missing_domains + result.unverified_domains
    if not blocking:
        result.allowed = True
        return result

    if settings.is_production:
        result.allowed = False
        if raise_on_block:
            raise BusinessRuleViolationError(
                message=(
                    "İstehsalat mühitində tələb olunan qayda paketləri "
                    "yoxlanmayıb və ya yoxdur. Xüsusiyyət bloklanıb."
                ),
                code="COMPLIANCE_RULES_NOT_VERIFIED",
                details={
                    "feature": feature,
                    "missing_domains": result.missing_domains + result.unverified_domains,
                },
            )
        return result

    # Non-production: allow with banner
    result.allowed = True
    result.banner = {
        "show": True,
        "level": "warning",
        "message_az": (
            "QEYD: Bəzi compliance qayda paketləri UNVERIFIED və ya çatışmır. "
            "Bu mühitdə icazə verilir, lakin hüquqi uyğunluq iddiası YOXDUR."
        ),
        "missing_domains": result.missing_domains,
        "unverified_domains": result.unverified_domains,
        "environment": settings.APP_ENV,
    }
    return result


def rule_status_blocks_activation(status: str, *, is_production: bool | None = None) -> bool:
    """Whether a single rule status prevents pack activation."""
    prod = settings.is_production if is_production is None else is_production
    if status == RuleStatus.DISPUTED.value:
        return True
    return bool(status == RuleStatus.UNVERIFIED.value and prod)
