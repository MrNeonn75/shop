"""Compliance module — versioned, effective-dated, source-referenced rule packs.

Law is DATA, not code. Seeded values are UNVERIFIED secondary references.
The system never claims legal compliance.
"""

from app.modules.compliance.service import ComplianceService, get_compliance_service

__all__ = ["ComplianceService", "get_compliance_service"]
