"""Fiskal vəziyyət maşını — success / fail / unknown / no double receipt / REQUIRED vs OPTIONAL."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest

from app.modules.compliance.fiscal.port import MODE_OPTIONAL, MODE_REQUIRED
from app.modules.compliance.fiscal.state_machine import (
    FAILURE_MATRIX,
    FAILURE_UNKNOWN,
    FiscalStateError,
    SaleFiscalState,
    assert_can_create_receipt,
    confirm_fiscal_success,
    fail_definite,
    fail_unknown,
    is_fiscal_blocking,
    mark_create_attempt,
    prepare_sale,
)
from app.modules.integrations.ports.fiscal import UnconfiguredFiscalService


@pytest.mark.asyncio
async def test_unconfigured_fiscal_returns_not_configured_for_all_ops() -> None:
    svc = UnconfiguredFiscalService()
    ops = [
        await svc.open_shift(),
        await svc.create_receipt({"total": "10"}),
        await svc.create_return_receipt({"original_fiscal_receipt_id": "x"}),
        await svc.advance_receipt({}),
        await svc.cash_in({"amount": "5"}),
        await svc.cash_out({"amount": "5"}),
        await svc.x_report(),
        await svc.z_report(),
        await svc.close_shift(),
        await svc.get_status(),
        await svc.reprint({"fiscal_receipt_id": "x"}),
        await svc.cancel({"fiscal_receipt_id": "x"}),
        await svc.print_fiscal_receipt({}),
        await svc.generate_e_receipt({}),
        await svc.get_fiscal_status(),
    ]
    for r in ops:
        assert r["status"] == "NOT_CONFIGURED"


def test_prepare_and_confirm_success() -> None:
    rec = prepare_sale("sale-1", mode=MODE_REQUIRED)
    assert rec.state == SaleFiscalState.PENDING_FISCAL
    assert rec.create_attempts == 1

    done = confirm_fiscal_success(
        rec,
        fiscal_receipt_id="fr-1",
        fiscal_number="100",
        qr_payload="QR:1",
        device_serial="DEV-1",
        issued_at=datetime.now(UTC),
        check_type="SALE",
        provider="fake",
        raw_response_redacted={"ok": True},
    )
    assert done.state == SaleFiscalState.COMPLETED
    assert done.fiscal_receipt_id == "fr-1"
    assert done.qr_payload == "QR:1"
    assert done.allows_sale_completion is True
    assert is_fiscal_blocking(done) is False


def test_fail_definite_rolls_back() -> None:
    rec = prepare_sale("sale-2", mode=MODE_REQUIRED)
    failed = fail_definite(rec, error="DEVICE_REJECTED")
    assert failed.state == SaleFiscalState.FAILED_ROLLED_BACK
    assert failed.last_error == "DEVICE_REJECTED"
    with pytest.raises(FiscalStateError):
        assert_can_create_receipt(failed)


def test_fail_unknown_never_allows_silent_retry_create() -> None:
    rec = prepare_sale("sale-3", mode=MODE_REQUIRED)
    unknown = fail_unknown(rec, error="timeout")
    assert unknown.state == SaleFiscalState.FISCAL_UNKNOWN
    assert FAILURE_MATRIX[FAILURE_UNKNOWN]["silent_retry_forbidden"] is True

    with pytest.raises(FiscalStateError, match="silent retry|QADAĞANDIR"):
        assert_can_create_receipt(unknown)

    with pytest.raises(FiscalStateError):
        mark_create_attempt(unknown)


def test_no_double_receipt_after_completed() -> None:
    rec = prepare_sale("sale-4")
    done = confirm_fiscal_success(rec, fiscal_receipt_id="fr-9")
    with pytest.raises(FiscalStateError, match="double receipt"):
        assert_can_create_receipt(done)

    # Idempotent eyni id
    again = confirm_fiscal_success(done, fiscal_receipt_id="fr-9")
    assert again.state == SaleFiscalState.COMPLETED

    # Fərqli id → xəta
    with pytest.raises(FiscalStateError, match="double receipt"):
        confirm_fiscal_success(done, fiscal_receipt_id="fr-OTHER")


def test_required_mode_blocks_until_completed() -> None:
    pending = prepare_sale("sale-5", mode=MODE_REQUIRED)
    assert is_fiscal_blocking(pending) is True
    assert pending.allows_sale_completion is False

    unknown = fail_unknown(pending)
    assert is_fiscal_blocking(unknown) is True
    assert unknown.allows_sale_completion is False

    # OPTIONAL: UNKNOWN satışın bağlanmasını bloklamır
    opt = prepare_sale("sale-6", mode=MODE_OPTIONAL)
    opt_u = fail_unknown(opt)
    assert is_fiscal_blocking(opt_u) is False
    assert opt_u.allows_sale_completion is True


def test_optional_mode_definite_fail_still_allows_erp_completion() -> None:
    rec = prepare_sale("sale-7", mode=MODE_OPTIONAL)
    failed = fail_definite(rec)
    assert failed.state == SaleFiscalState.FAILED_ROLLED_BACK
    assert failed.allows_sale_completion is True
    assert is_fiscal_blocking(failed) is False


def test_unknown_cannot_be_converted_to_definite_fail() -> None:
    rec = fail_unknown(prepare_sale("sale-8"))
    with pytest.raises(FiscalStateError, match="FISCAL_UNKNOWN"):
        fail_definite(rec)


def test_duplicate_callback_from_unknown_to_completed() -> None:
    """Timeout sonrası gecikmiş uğur callback — COMPLETED; ikinci create yox."""
    rec = fail_unknown(prepare_sale("sale-9", mode=MODE_REQUIRED))
    done = confirm_fiscal_success(rec, fiscal_receipt_id="late-1", fiscal_number="55")
    assert done.state == SaleFiscalState.COMPLETED
    with pytest.raises(FiscalStateError):
        mark_create_attempt(done)


@pytest.mark.asyncio
async def test_fake_adapter_success_and_definite_failure() -> None:
    from app.modules.compliance.fiscal.fake_adapter import FakeFiscalAdapter, FakeFiscalBehavior

    fake = FakeFiscalAdapter(behavior=FakeFiscalBehavior.SUCCESS)
    ok = await fake.create_receipt({"total": "10", "idempotency_key": "k1"})
    assert ok["status"] == "OK"
    assert ok["fiscal_receipt_id"]

    # Idempotent duplicate
    dup = await fake.create_receipt({"total": "10", "idempotency_key": "k1"})
    assert dup.get("duplicate") is True
    assert dup["fiscal_receipt_id"] == ok["fiscal_receipt_id"]

    fake.set_behavior(FakeFiscalBehavior.DEFINITE_FAILURE)
    bad = await fake.create_receipt({"total": "1"})
    assert bad["status"] == "FAILED"


@pytest.mark.asyncio
async def test_fake_adapter_timeout_behavior() -> None:
    from app.modules.compliance.fiscal.fake_adapter import FakeFiscalAdapter, FakeFiscalBehavior
    from app.modules.compliance.fiscal.port import ComplianceFiscalService, FiscalTimeoutError

    fake = FakeFiscalAdapter(behavior=FakeFiscalBehavior.TIMEOUT, timeout_after=0.2)
    svc = ComplianceFiscalService(fake, timeout_seconds=0.05, mode=MODE_REQUIRED)
    with pytest.raises(FiscalTimeoutError):
        await svc.create_receipt({"total": "1"}, idempotency_key="t1")


def test_receipt_validator_uses_rule_pack_list() -> None:
    from app.modules.compliance.fiscal.receipt_validator import validate_receipt_template

    mandatory = ["company_voen", "fiscal_number", "qr_payload"]  # rule pack DATA
    ok = validate_receipt_template(
        {"company_voen": "123", "fiscal_number": "1", "qr_payload": "QR"},
        mandatory,
    )
    assert ok.is_valid

    bad = validate_receipt_template({"company_voen": "123"}, mandatory)
    assert not bad.is_valid
    assert "fiscal_number" in bad.missing_elements
    assert "qr_payload" in bad.missing_elements


def test_fiscal_vs_erp_reconciliation_alerts() -> None:
    from app.modules.compliance.fiscal.reconciliation import (
        ALERT_FISCAL_ERP_GROSS_MISMATCH,
        FiscalErpMismatchError,
        fiscal_vs_erp_totals,
    )

    result = fiscal_vs_erp_totals(
        {"gross": "100.00", "net": "84.75", "vat": "15.25", "cash": "100", "receipt_count": 2},
        {"gross": "99.00", "net": "84.75", "vat": "15.25", "cash": "100", "receipt_count": 2},
        period_label="day",
    )
    assert not result.matched
    assert any(a.code == ALERT_FISCAL_ERP_GROSS_MISMATCH for a in result.alerts)

    with pytest.raises(FiscalErpMismatchError):
        fiscal_vs_erp_totals(
            {"gross": Decimal("10"), "net": "0", "vat": "0", "cash": "0", "receipt_count": 1},
            {"gross": Decimal("11"), "net": "0", "vat": "0", "cash": "0", "receipt_count": 1},
            raise_on_difference=True,
        )
