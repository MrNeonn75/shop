"""Fiskal Compliance Paketi — port, vəziyyət maşını, validasiya, uzlaşdırma."""

from __future__ import annotations

from app.modules.compliance.fiscal.fake_adapter import FakeFiscalAdapter, FakeFiscalBehavior
from app.modules.compliance.fiscal.port import (
    MODE_OPTIONAL,
    MODE_REQUIRED,
    SETTING_FISCAL_MODE,
    ComplianceFiscalService,
    FiscalTimeoutError,
)
from app.modules.compliance.fiscal.receipt_validator import (
    ValidationIssue,
    ValidationResult,
    validate_receipt_template,
)
from app.modules.compliance.fiscal.reconciliation import (
    ALERT_FISCAL_ERP_CASH_MISMATCH,
    ALERT_FISCAL_ERP_GROSS_MISMATCH,
    ALERT_FISCAL_ERP_NET_MISMATCH,
    ALERT_FISCAL_ERP_RECEIPT_COUNT_MISMATCH,
    ALERT_FISCAL_ERP_VAT_MISMATCH,
    FiscalErpMismatchError,
    ReconciliationAlert,
    ReconciliationResult,
    TotalsBucket,
    fiscal_vs_erp_totals,
)
from app.modules.compliance.fiscal.state_machine import (
    FAILURE_DEFINITE,
    FAILURE_MATRIX,
    FAILURE_UNKNOWN,
    FiscalStateError,
    SaleFiscalRecord,
    SaleFiscalState,
    assert_can_create_receipt,
    confirm_fiscal_success,
    fail_definite,
    fail_unknown,
    is_fiscal_blocking,
    mark_create_attempt,
    prepare_sale,
)
from app.modules.integrations.ports.fiscal import FiscalServicePort, UnconfiguredFiscalService

__all__ = [
    "ComplianceFiscalService",
    "FiscalTimeoutError",
    "FiscalServicePort",
    "UnconfiguredFiscalService",
    "SETTING_FISCAL_MODE",
    "MODE_REQUIRED",
    "MODE_OPTIONAL",
    "FakeFiscalAdapter",
    "FakeFiscalBehavior",
    "SaleFiscalState",
    "SaleFiscalRecord",
    "FiscalStateError",
    "FAILURE_MATRIX",
    "FAILURE_DEFINITE",
    "FAILURE_UNKNOWN",
    "prepare_sale",
    "confirm_fiscal_success",
    "fail_definite",
    "fail_unknown",
    "assert_can_create_receipt",
    "mark_create_attempt",
    "is_fiscal_blocking",
    "validate_receipt_template",
    "ValidationResult",
    "ValidationIssue",
    "fiscal_vs_erp_totals",
    "TotalsBucket",
    "ReconciliationResult",
    "ReconciliationAlert",
    "FiscalErpMismatchError",
    "ALERT_FISCAL_ERP_GROSS_MISMATCH",
    "ALERT_FISCAL_ERP_NET_MISMATCH",
    "ALERT_FISCAL_ERP_VAT_MISMATCH",
    "ALERT_FISCAL_ERP_RECEIPT_COUNT_MISMATCH",
    "ALERT_FISCAL_ERP_CASH_MISMATCH",
]
