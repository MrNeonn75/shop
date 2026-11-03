"""ƏDV / VAT mühərriki unit testləri — dəqiqlik, yuvarlaqlaşdırma, exempt/zero."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from hypothesis import given, settings
from hypothesis import strategies as st

from app.modules.compliance.vat import (
    TaxClass,
    effective_vat_rate,
    split_gross_vat,
    split_lines,
)


def test_split_gross_vat_exact_18_percent() -> None:
    """Rate parametr kimi ötürülür (hardcode yox) — klassik 18% ssenarisi."""
    rate = Decimal("0.18")
    net, vat = split_gross_vat(Decimal("118.00"), rate)
    assert vat == Decimal("18.00")
    assert net == Decimal("100.00")
    assert net + vat == Decimal("118.00")


def test_split_gross_vat_rounding_half_up() -> None:
    # 10.00 * 0.18 / 1.18 = 1.5254... → 1.53 ROUND_HALF_UP
    net, vat = split_gross_vat(Decimal("10.00"), Decimal("0.18"), rounding=ROUND_HALF_UP)
    assert vat == Decimal("1.53")
    assert net == Decimal("8.47")
    assert net + vat == Decimal("10.00")


def test_split_gross_vat_exempt_and_zero() -> None:
    net, vat = split_gross_vat(
        Decimal("50.00"), Decimal("0.18"), tax_class=TaxClass.EXEMPT
    )
    assert vat == Decimal("0")
    assert net == Decimal("50.00")

    net_z, vat_z = split_gross_vat(
        Decimal("50.00"), Decimal("0.18"), tax_class=TaxClass.ZERO
    )
    assert vat_z == Decimal("0")
    assert net_z == Decimal("50.00")

    assert effective_vat_rate(Decimal("0.18"), TaxClass.EXEMPT) == Decimal("0")
    assert effective_vat_rate(Decimal("0.18"), TaxClass.ZERO) == Decimal("0")
    assert effective_vat_rate(Decimal("0.18"), TaxClass.STANDARD) == Decimal("0.18")


def test_split_gross_vat_zero_rate() -> None:
    net, vat = split_gross_vat(Decimal("99.99"), Decimal("0"))
    assert vat == Decimal("0")
    assert net == Decimal("99.99")


def test_simplified_tax_payer_is_regime_flag_rate_still_param() -> None:
    # Rejim bayrağıdır — dərəcə yenə parametri; 0.18 hardcode yox
    rate = Decimal("0")
    net, vat = split_gross_vat(
        Decimal("200.00"), rate, tax_class=TaxClass.SIMPLIFIED_TAX_PAYER
    )
    assert vat == Decimal("0")
    assert net == Decimal("200.00")


def test_split_lines_reconciles_to_receipt_totals() -> None:
    rate = Decimal("0.18")
    lines = [
        {"gross": Decimal("10.00"), "rate": rate},
        {"gross": Decimal("10.00"), "rate": rate},
        {"gross": Decimal("10.00"), "rate": rate},
    ]
    result = split_lines(lines, line_rounding=ROUND_HALF_UP, receipt_rounding=ROUND_HALF_UP)
    assert result.is_reconciled
    assert result.gross_total == Decimal("30.00")
    assert result.net_total + result.vat_total == result.gross_total
    assert sum(ln.net for ln in result.lines) == result.net_total
    assert sum(ln.vat for ln in result.lines) == result.vat_total


def test_split_lines_mixed_rates_and_exempt() -> None:
    lines = [
        {"gross": Decimal("118.00"), "rate": Decimal("0.18"), "tax_class": TaxClass.STANDARD},
        {"gross": Decimal("40.00"), "rate": Decimal("0.18"), "tax_class": TaxClass.EXEMPT},
        {"gross": Decimal("20.00"), "rate": Decimal("0"), "tax_class": TaxClass.ZERO},
    ]
    result = split_lines(lines)
    assert result.is_reconciled
    assert result.lines[0].vat == Decimal("18.00")
    assert result.lines[1].vat == Decimal("0")
    assert result.lines[2].vat == Decimal("0")
    assert result.gross_total == Decimal("178.00")


def test_split_lines_residual_on_last() -> None:
    # Qəpik residual son sətirə düşür
    lines = [
        {"gross": "1.00", "rate": "0.18"},
        {"gross": "1.00", "rate": "0.18"},
    ]
    result = split_lines(lines, adjust_residual_on_last=True)
    assert result.is_reconciled
    assert any(ln.residual_adjusted for ln in result.lines) or result.residual_vat == 0


@given(
    gross_cents=st.integers(min_value=0, max_value=1_000_000_00),
    rate_bps=st.integers(min_value=0, max_value=5000),  # 0% .. 50%
)
@settings(max_examples=80)
def test_property_split_gross_net_plus_vat_equals_gross(gross_cents: int, rate_bps: int) -> None:
    gross = Decimal(gross_cents) / Decimal("100")
    rate = Decimal(rate_bps) / Decimal("10000")
    net, vat = split_gross_vat(gross, rate)
    assert net + vat == net.quantize(Decimal("0.01")) + vat  # both quantized
    gq = gross.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    assert net + vat == gq


@given(
    amounts=st.lists(
        st.integers(min_value=1, max_value=100_000),
        min_size=1,
        max_size=8,
    ),
    rate_bps=st.integers(min_value=0, max_value=3000),
)
@settings(max_examples=50)
def test_property_split_lines_reconciles(amounts: list[int], rate_bps: int) -> None:
    rate = Decimal(rate_bps) / Decimal("10000")
    lines = [{"gross": Decimal(a) / Decimal("100"), "rate": rate} for a in amounts]
    result = split_lines(lines)
    assert result.is_reconciled
    assert sum(ln.gross for ln in result.lines) == result.gross_total
