"""Dövriyyə Monitorinqi (Turnover Monitor) — limit hədləri və tender əmsalları.

Saf funksiyalar + oxuma modeli köməkçiləri.
Hədlər və əmsallar rule pack parametrlərindən gəlir (hardcode yoxdur).
Referans: nağdsız POS → qeydiyyatsız alıcıya əmsal tipik olaraq 0.5 (rule-dən).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum
from typing import Any

CENT = Decimal("0.01")
ZERO = Decimal("0")

# Hadisə kodları — hədlər indikativdir; faizlər rule params-dan gəlir
EVENT_TURNOVER_THRESHOLD_80 = "TURNOVER_THRESHOLD_80"
EVENT_TURNOVER_THRESHOLD_95 = "TURNOVER_THRESHOLD_95"
EVENT_TURNOVER_THRESHOLD_100 = "TURNOVER_THRESHOLD_100"


class TenderType(StrEnum):
    """Ödəniş / tender tipi (əmsal mapping üçün)."""

    CASH = "CASH"
    CARD = "CARD"
    CASHLESS_POS = "CASHLESS_POS"
    BANK_TRANSFER = "BANK_TRANSFER"
    OTHER = "OTHER"


@dataclass(frozen=True, slots=True)
class SaleRow:
    """Dövriyyə oxuma modeli üçün satış sətiri (data)."""

    amount: Decimal
    sold_at: date | datetime
    tender_type: str = TenderType.CASH.value
    buyer_registered: bool = True
    branch_id: str | None = None


@dataclass(frozen=True, slots=True)
class TurnoverAlert:
    """Dövriyyə hədd xəbərdarlığı (indikativ)."""

    code: str
    threshold_pct: Decimal
    utilization_pct: Decimal
    aggregate: Decimal
    limit: Decimal
    indicative: bool = True
    message: str = ""


@dataclass(frozen=True, slots=True)
class TurnoverSnapshot:
    """Aqreqat + xəbərdarlıqlar."""

    period: str  # rolling_12m | calendar_year
    gross_aggregate: Decimal
    counted_aggregate: Decimal
    limit: Decimal | None
    utilization_pct: Decimal | None
    alerts: tuple[TurnoverAlert, ...] = ()


def _as_decimal(value: Decimal | str | int | float) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _quantize(amount: Decimal, rounding: str = ROUND_HALF_UP) -> Decimal:
    return amount.quantize(CENT, rounding=rounding)


def _to_date(value: date | datetime) -> date:
    if isinstance(value, datetime):
        return value.date()
    return value


def apply_tender_coefficient(
    amount: Decimal | str | int | float,
    tender_type: str | TenderType,
    rules: Mapping[str, Any],
    *,
    buyer_registered: bool = True,
) -> Decimal:
    """Tender tipinə və qaydalara görə dövriyyəyə sayılan məbləğ.

    rules gözləntiləri (nümunə, hardcode deyil):
      {
        "coefficients": {
          "CASHLESS_POS_UNREGISTERED": "0.5",
          "CASH": "1.0",
          ...
        },
        "default_coefficient": "1.0"
      }
    """
    amt = _as_decimal(amount)
    tt = tender_type.value if isinstance(tender_type, TenderType) else str(tender_type)
    coeffs: Mapping[str, Any] = rules.get("coefficients", {}) or {}
    default = _as_decimal(rules.get("default_coefficient", "1"))

    key = tt
    if tt in ("CASHLESS_POS", "CARD") and not buyer_registered:
        unreg_key = f"{tt}_UNREGISTERED"
        if unreg_key in coeffs:
            key = unreg_key
        elif "CASHLESS_POS_UNREGISTERED" in coeffs and tt == "CASHLESS_POS":
            key = "CASHLESS_POS_UNREGISTERED"

    coef = _as_decimal(coeffs[key]) if key in coeffs else default
    return _quantize(amt * coef)


def sum_counted_sales(
    rows: Sequence[SaleRow | Mapping[str, Any]],
    rules: Mapping[str, Any],
) -> Decimal:
    """Satış sətirlərini tender əmsalı ilə toplayır."""
    total = ZERO
    for row in rows:
        if isinstance(row, SaleRow):
            counted = apply_tender_coefficient(
                row.amount,
                row.tender_type,
                rules,
                buyer_registered=row.buyer_registered,
            )
        else:
            counted = apply_tender_coefficient(
                row["amount"],
                row.get("tender_type", TenderType.CASH.value),
                rules,
                buyer_registered=bool(row.get("buyer_registered", True)),
            )
        total += counted
    return _quantize(total)


def filter_calendar_year(
    rows: Sequence[SaleRow | Mapping[str, Any]],
    year: int,
) -> list[SaleRow]:
    """Təqvim ili üzrə filtr."""
    out: list[SaleRow] = []
    for row in rows:
        sr = _normalize_row(row)
        if _to_date(sr.sold_at).year == year:
            out.append(sr)
    return out


def filter_rolling_12m(
    rows: Sequence[SaleRow | Mapping[str, Any]],
    as_of: date,
) -> list[SaleRow]:
    """Yuvarlanan 12 ay: (as_of - 1 year, as_of] (gün dəqiqliyi)."""
    start_year = as_of.year - 1
    try:
        start = as_of.replace(year=start_year)
    except ValueError:
        # 29 fevral → 28 fevral
        start = as_of.replace(year=start_year, day=28)
    out: list[SaleRow] = []
    for row in rows:
        sr = _normalize_row(row)
        d = _to_date(sr.sold_at)
        if start < d <= as_of:
            out.append(sr)
    return out


def _normalize_row(row: SaleRow | Mapping[str, Any]) -> SaleRow:
    if isinstance(row, SaleRow):
        return row
    sold = row["sold_at"]
    if isinstance(sold, str):
        sold = date.fromisoformat(sold[:10])
    return SaleRow(
        amount=_as_decimal(row["amount"]),
        sold_at=sold,
        tender_type=str(row.get("tender_type", TenderType.CASH.value)),
        buyer_registered=bool(row.get("buyer_registered", True)),
        branch_id=row.get("branch_id"),
    )


def evaluate_thresholds(
    counted_aggregate: Decimal,
    limit: Decimal | str | int | float | None,
    threshold_params: Mapping[str, Any] | None = None,
) -> list[TurnoverAlert]:
    """Limitə yaxınlaşma xəbərdarlıqları.

    threshold_params nümunə (indikativ default 80/95/100):
      {
        "thresholds": [
          {"pct": "80", "code": "TURNOVER_THRESHOLD_80"},
          {"pct": "95", "code": "TURNOVER_THRESHOLD_95"},
          {"pct": "100", "code": "TURNOVER_THRESHOLD_100"}
        ]
      }
    """
    if limit is None:
        return []
    lim = _as_decimal(limit)
    if lim <= ZERO:
        return []

    params = threshold_params or {}
    thresholds = params.get("thresholds") or [
        {"pct": "80", "code": EVENT_TURNOVER_THRESHOLD_80},
        {"pct": "95", "code": EVENT_TURNOVER_THRESHOLD_95},
        {"pct": "100", "code": EVENT_TURNOVER_THRESHOLD_100},
    ]

    utilization = _quantize((counted_aggregate / lim) * Decimal("100"))
    alerts: list[TurnoverAlert] = []
    for t in thresholds:
        pct = _as_decimal(t["pct"])
        code = str(t.get("code") or f"TURNOVER_THRESHOLD_{int(pct)}")
        if utilization >= pct:
            alerts.append(
                TurnoverAlert(
                    code=code,
                    threshold_pct=pct,
                    utilization_pct=utilization,
                    aggregate=counted_aggregate,
                    limit=lim,
                    indicative=True,
                    message=(
                        f"Dövriyyə limitinin {pct}%-nə çatılıb və ya keçilib "
                        f"(indikativ; utilization={utilization}%)."
                    ),
                )
            )
    return alerts


class TurnoverMonitorService:
    """Dövriyyə oxuma modeli xidməti — sales rows data qəbul edir."""

    def __init__(self, rules: Mapping[str, Any] | None = None) -> None:
        self.rules: dict[str, Any] = dict(rules or {})

    def calendar_year_aggregate(
        self,
        rows: Sequence[SaleRow | Mapping[str, Any]],
        year: int,
        *,
        limit: Decimal | str | int | float | None = None,
        threshold_params: Mapping[str, Any] | None = None,
    ) -> TurnoverSnapshot:
        filtered = filter_calendar_year(rows, year)
        gross = _quantize(sum((_normalize_row(r).amount for r in filtered), ZERO))
        counted = sum_counted_sales(filtered, self.rules)
        lim = _as_decimal(limit) if limit is not None else None
        util = (
            _quantize((counted / lim) * Decimal("100"))
            if lim is not None and lim > ZERO
            else None
        )
        alerts = evaluate_thresholds(counted, lim, threshold_params)
        return TurnoverSnapshot(
            period="calendar_year",
            gross_aggregate=gross,
            counted_aggregate=counted,
            limit=lim,
            utilization_pct=util,
            alerts=tuple(alerts),
        )

    def rolling_12m_aggregate(
        self,
        rows: Sequence[SaleRow | Mapping[str, Any]],
        as_of: date,
        *,
        limit: Decimal | str | int | float | None = None,
        threshold_params: Mapping[str, Any] | None = None,
    ) -> TurnoverSnapshot:
        filtered = filter_rolling_12m(rows, as_of)
        gross = _quantize(sum((_normalize_row(r).amount for r in filtered), ZERO))
        counted = sum_counted_sales(filtered, self.rules)
        lim = _as_decimal(limit) if limit is not None else None
        util = (
            _quantize((counted / lim) * Decimal("100"))
            if lim is not None and lim > ZERO
            else None
        )
        alerts = evaluate_thresholds(counted, lim, threshold_params)
        return TurnoverSnapshot(
            period="rolling_12m",
            gross_aggregate=gross,
            counted_aggregate=counted,
            limit=lim,
            utilization_pct=util,
            alerts=tuple(alerts),
        )
