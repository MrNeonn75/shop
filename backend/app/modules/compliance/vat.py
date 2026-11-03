"""ƏDV / VAT Bölünmə Mühərriki (Gross → Net + VAT).

Saf funksiyalar — Hypothesis property-test uyğunluqlu.
Dərəcə həmişə rule pack / settings parametri kimi ötürülür; 0.18 hardcode YOXDUR.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum
from typing import Any

CENT = Decimal("0.01")
ZERO = Decimal("0")


class TaxClass(StrEnum):
    """Vergi təsnifatı / rejim bayrağı (faiz hardcode edilmir)."""

    STANDARD = "STANDARD"
    EXEMPT = "EXEMPT"
    ZERO = "ZERO"
    SIMPLIFIED_TAX_PAYER = "SIMPLIFIED_TAX_PAYER"  # sadələşdirilmiş vergi ödəyicisi rejim bayrağı


@dataclass(frozen=True, slots=True)
class LineVatBreakdown:
    """Sətir üzrə ƏDV parçalanması."""

    gross: Decimal
    rate: Decimal
    net: Decimal
    vat: Decimal
    tax_class: TaxClass = TaxClass.STANDARD
    residual_adjusted: bool = False


@dataclass(frozen=True, slots=True)
class ReceiptVatBreakdown:
    """Qəbz səviyyəsində ƏDV yekunu və sətir parçalanmaları."""

    lines: tuple[LineVatBreakdown, ...]
    gross_total: Decimal
    net_total: Decimal
    vat_total: Decimal
    residual_net: Decimal = ZERO
    residual_vat: Decimal = ZERO

    @property
    def is_reconciled(self) -> bool:
        """sum(line nets) + sum(line vats) == gross_total və net+vat == gross."""
        line_nets = sum((ln.net for ln in self.lines), ZERO)
        line_vats = sum((ln.vat for ln in self.lines), ZERO)
        return (
            line_nets == self.net_total
            and line_vats == self.vat_total
            and (self.net_total + self.vat_total) == self.gross_total
        )


def _as_decimal(value: Decimal | str | int | float) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _quantize(amount: Decimal, rounding: str = ROUND_HALF_UP, quant: Decimal = CENT) -> Decimal:
    return amount.quantize(quant, rounding=rounding)


def effective_vat_rate(
    rate: Decimal | str | int | float,
    tax_class: TaxClass = TaxClass.STANDARD,
) -> Decimal:
    """TaxClass-a görə tətbiq olunan ƏDV dərəcəsi.

    EXEMPT / ZERO → 0.
    STANDARD → ötürülən rate.
    SIMPLIFIED_TAX_PAYER → rejim bayrağıdır; dərəcə yenə rule pack-dən gəlir
    (sadələşdirilmiş rejimdə ƏDV adətən 0 ola bilər, amma hardcode edilmir).
    """
    r = _as_decimal(rate)
    if tax_class in (TaxClass.EXEMPT, TaxClass.ZERO):
        return ZERO
    return r


def split_gross_vat(
    gross: Decimal | str | int | float,
    rate: Decimal | str | int | float,
    rounding: str = ROUND_HALF_UP,
    *,
    tax_class: TaxClass = TaxClass.STANDARD,
) -> tuple[Decimal, Decimal]:
    """Brüt məbləği net + ƏDV-yə ayırır.

    Formula: vat = gross * rate / (1 + rate); net = gross - vat.
    rate == 0 və ya EXEMPT/ZERO → vat = 0, net = gross.
    """
    g = _as_decimal(gross)
    r = effective_vat_rate(rate, tax_class)

    if g == ZERO or r == ZERO:
        qg = _quantize(g, rounding=rounding)
        return qg, ZERO

    # vat = gross * rate / (1 + rate)
    vat = _quantize(g * r / (Decimal("1") + r), rounding=rounding)
    net = _quantize(g - vat, rounding=rounding)
    # Qəpik uyğunsuzluğunu gross-a bağlamaq: net = gross_q - vat
    gq = _quantize(g, rounding=rounding)
    if net + vat != gq:
        net = gq - vat
    return net, vat


def _line_payload(item: Mapping[str, Any] | LineVatBreakdown) -> dict[str, Any]:
    if isinstance(item, LineVatBreakdown):
        return {
            "gross": item.gross,
            "rate": item.rate,
            "tax_class": item.tax_class,
        }
    tc = item.get("tax_class", TaxClass.STANDARD)
    if not isinstance(tc, TaxClass):
        tc = TaxClass(str(tc))
    return {
        "gross": item["gross"],
        "rate": item.get("rate", ZERO),
        "tax_class": tc,
    }


def split_lines(
    lines: Sequence[Mapping[str, Any] | LineVatBreakdown],
    line_rounding: str = ROUND_HALF_UP,
    receipt_rounding: str = ROUND_HALF_UP,
    *,
    adjust_residual_on_last: bool = True,
) -> ReceiptVatBreakdown:
    """Sətirləri parçalayır və qəbz yekunları ilə uyğunlaşdırır.

    Hər sətirdə line_rounding tətbiq olunur.
    Qəbz səviyyəsində ümumi brüt üzərindən receipt_rounding ilə net/vat hesablanır.
    Fərq (residual) son sətirə əlavə olunur (adjust_residual_on_last=True).
    """
    if not lines:
        return ReceiptVatBreakdown(
            lines=(),
            gross_total=ZERO,
            net_total=ZERO,
            vat_total=ZERO,
        )

    payloads = [_line_payload(ln) for ln in lines]
    raw_lines: list[LineVatBreakdown] = []
    for p in payloads:
        gross = _as_decimal(p["gross"])
        rate = _as_decimal(p["rate"])
        tax_class: TaxClass = p["tax_class"]
        net, vat = split_gross_vat(gross, rate, rounding=line_rounding, tax_class=tax_class)
        gq = _quantize(gross, rounding=line_rounding)
        raw_lines.append(
            LineVatBreakdown(
                gross=gq,
                rate=effective_vat_rate(rate, tax_class),
                net=net,
                vat=vat,
                tax_class=tax_class,
            )
        )

    gross_total = _quantize(
        sum((ln.gross for ln in raw_lines), ZERO),
        rounding=receipt_rounding,
    )

    # Qəbz səviyyəli ƏDV: hər sətir fərqli dərəcədə ola bilər —
    # receipt target = sətir net/vat cəmi, sonra qəpik residual son sətirə.
    sum_net = sum((ln.net for ln in raw_lines), ZERO)
    sum_vat = sum((ln.vat for ln in raw_lines), ZERO)
    target_net = _quantize(sum_net, rounding=receipt_rounding)
    target_vat = _quantize(sum_vat, rounding=receipt_rounding)

    # Brüt ilə uyğunlaşdırma: net + vat == gross_total
    if target_net + target_vat != gross_total:
        # Residual-ı ƏDV tərəfinə yönəlt (klassik kassa davranışı)
        target_vat = gross_total - target_net

    residual_net = target_net - sum_net
    residual_vat = target_vat - sum_vat

    final_lines = list(raw_lines)
    if adjust_residual_on_last and (residual_net != ZERO or residual_vat != ZERO):
        last = final_lines[-1]
        adjusted = LineVatBreakdown(
            gross=last.gross,
            rate=last.rate,
            net=_quantize(last.net + residual_net, rounding=line_rounding),
            vat=_quantize(last.vat + residual_vat, rounding=line_rounding),
            tax_class=last.tax_class,
            residual_adjusted=True,
        )
        # gross sabit qalır; net+vat son yoxlama
        if adjusted.net + adjusted.vat != adjusted.gross:
            adjusted = LineVatBreakdown(
                gross=last.gross,
                rate=last.rate,
                net=last.gross - _quantize(last.vat + residual_vat, rounding=line_rounding),
                vat=_quantize(last.vat + residual_vat, rounding=line_rounding),
                tax_class=last.tax_class,
                residual_adjusted=True,
            )
        final_lines[-1] = adjusted
        residual_net = ZERO
        residual_vat = ZERO

    net_total = sum((ln.net for ln in final_lines), ZERO)
    vat_total = sum((ln.vat for ln in final_lines), ZERO)

    return ReceiptVatBreakdown(
        lines=tuple(final_lines),
        gross_total=gross_total,
        net_total=net_total,
        vat_total=vat_total,
        residual_net=residual_net,
        residual_vat=residual_vat,
    )
