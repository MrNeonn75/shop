"""Fiskal ↔ ERP Yekun Uzlaşdırılması (Shift / Day).

Fərqlər alert kodları ilə qaytarılır (exception atmaq əvəzinə strukturlaşdırılmış nəticə;
kritik fərq üçün ``raise_on_difference`` opsionaldır).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

CENT = Decimal("0.01")
ZERO = Decimal("0")

ALERT_FISCAL_ERP_GROSS_MISMATCH = "FISCAL_ERP_GROSS_MISMATCH"
ALERT_FISCAL_ERP_NET_MISMATCH = "FISCAL_ERP_NET_MISMATCH"
ALERT_FISCAL_ERP_VAT_MISMATCH = "FISCAL_ERP_VAT_MISMATCH"
ALERT_FISCAL_ERP_RECEIPT_COUNT_MISMATCH = "FISCAL_ERP_RECEIPT_COUNT_MISMATCH"
ALERT_FISCAL_ERP_CASH_MISMATCH = "FISCAL_ERP_CASH_MISMATCH"


class FiscalErpMismatchError(Exception):
    """Kritik fiskal/ERP fərqi."""

    def __init__(self, alerts: Sequence[ReconciliationAlert]) -> None:
        self.alerts = list(alerts)
        codes = ", ".join(a.code for a in alerts)
        super().__init__(f"Fiskal ↔ ERP uyğunsuzluğu: {codes}")


@dataclass(frozen=True, slots=True)
class ReconciliationAlert:
    code: str
    field: str
    fiscal_value: Decimal | int
    erp_value: Decimal | int
    difference: Decimal | int
    message: str = ""


@dataclass(frozen=True, slots=True)
class TotalsBucket:
    """Shift/gün yekunları."""

    gross: Decimal = ZERO
    net: Decimal = ZERO
    vat: Decimal = ZERO
    cash: Decimal = ZERO
    receipt_count: int = 0

    @classmethod
    def from_mapping(cls, data: Mapping[str, Any]) -> TotalsBucket:
        def d(key: str, default: str = "0") -> Decimal:
            raw = data.get(key, default)
            if isinstance(raw, Decimal):
                return raw
            return Decimal(str(raw))

        return cls(
            gross=d("gross"),
            net=d("net"),
            vat=d("vat"),
            cash=d("cash"),
            receipt_count=int(data.get("receipt_count", 0)),
        )


@dataclass(frozen=True, slots=True)
class ReconciliationResult:
    period_label: str
    fiscal: TotalsBucket
    erp: TotalsBucket
    alerts: tuple[ReconciliationAlert, ...] = ()
    matched: bool = True


def _q(amount: Decimal) -> Decimal:
    return amount.quantize(CENT, rounding=ROUND_HALF_UP)


def fiscal_vs_erp_totals(
    fiscal_totals: TotalsBucket | Mapping[str, Any],
    erp_totals: TotalsBucket | Mapping[str, Any],
    *,
    period_label: str = "shift",
    tolerance: Decimal | str | int | float = ZERO,
    raise_on_difference: bool = False,
) -> ReconciliationResult:
    """Fiskal və ERP yekunlarını müqayisə edir; fərqlər alert kodlarıdır.

    Parameters
    ----------
    fiscal_totals / erp_totals:
        ``{gross, net, vat, cash, receipt_count}`` və ya TotalsBucket.
    tolerance:
        Pul sahələri üçün icazə verilən |fərq| (default 0.00).
    raise_on_difference:
        True olduqda uyğunsuzluqda ``FiscalErpMismatchError``.
    """
    fiscal = (
        fiscal_totals
        if isinstance(fiscal_totals, TotalsBucket)
        else TotalsBucket.from_mapping(fiscal_totals)
    )
    erp = (
        erp_totals if isinstance(erp_totals, TotalsBucket) else TotalsBucket.from_mapping(erp_totals)
    )
    tol = (
        tolerance if isinstance(tolerance, Decimal) else Decimal(str(tolerance))
    ).quantize(CENT, rounding=ROUND_HALF_UP)

    alerts: list[ReconciliationAlert] = []

    def check_money(field: str, code: str, fv: Decimal, ev: Decimal) -> None:
        diff = _q(fv - ev)
        if abs(diff) > tol:
            alerts.append(
                ReconciliationAlert(
                    code=code,
                    field=field,
                    fiscal_value=_q(fv),
                    erp_value=_q(ev),
                    difference=diff,
                    message=f"{period_label}: {field} fərqi {diff}",
                )
            )

    check_money("gross", ALERT_FISCAL_ERP_GROSS_MISMATCH, fiscal.gross, erp.gross)
    check_money("net", ALERT_FISCAL_ERP_NET_MISMATCH, fiscal.net, erp.net)
    check_money("vat", ALERT_FISCAL_ERP_VAT_MISMATCH, fiscal.vat, erp.vat)
    check_money("cash", ALERT_FISCAL_ERP_CASH_MISMATCH, fiscal.cash, erp.cash)

    if fiscal.receipt_count != erp.receipt_count:
        alerts.append(
            ReconciliationAlert(
                code=ALERT_FISCAL_ERP_RECEIPT_COUNT_MISMATCH,
                field="receipt_count",
                fiscal_value=fiscal.receipt_count,
                erp_value=erp.receipt_count,
                difference=fiscal.receipt_count - erp.receipt_count,
                message=f"{period_label}: çek sayı fərqi",
            )
        )

    result = ReconciliationResult(
        period_label=period_label,
        fiscal=fiscal,
        erp=erp,
        alerts=tuple(alerts),
        matched=len(alerts) == 0,
    )
    if raise_on_difference and alerts:
        raise FiscalErpMismatchError(alerts)
    return result
