"""Satınalma Modulu Biznes Qaydaları və Siyasətləri (Purchasing Policies)."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from app.core.errors import BusinessRuleViolationError, ForbiddenError


def round_money(val: Decimal) -> Decimal:
    """Mərkəzi maliyyə yuvarlaqlaşdırması (qəpik dəqiqliyi, 4 onluq xana saxlanılmaqla)."""
    return val.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def calculate_po_line_amounts(
    quantity: int,
    unit_price: Decimal,
    discount_percent: Decimal = Decimal("0.00"),
    tax_rate: Decimal = Decimal("0.00"),
) -> tuple[Decimal, Decimal, Decimal]:
    """Sifariş sətrinin məbləğ, endirim və ƏDV hesablamasını aparır.

    Qaytarır: (line_subtotal, line_tax, line_total)
    """
    base = round_money(Decimal(quantity) * unit_price)
    discount_mult = Decimal("1.0") - (discount_percent / Decimal("100.0"))
    discounted_base = round_money(base * discount_mult)

    tax_amount = round_money(discounted_base * (tax_rate / Decimal("100.0")))
    total_amount = round_money(discounted_base + tax_amount)
    return discounted_base, tax_amount, total_amount


def validate_over_receipt_tolerance(
    ordered_qty: int,
    previously_received_qty: int,
    received_qty: int,
    tolerance_percent: float = 5.0,
) -> None:
    """Malların qəbulu zamanı sifarişdən artıq daxilolma həddini yoxlayır."""
    outstanding = max(0, ordered_qty - previously_received_qty)
    allowed_max = int(
        Decimal(str(outstanding))
        * (Decimal("1.0") + Decimal(str(tolerance_percent)) / Decimal("100.0"))
    )
    # Əgər heç olmasa 1 ədəd dözümlülük verilsin (məsələn, 10 ədəddən 11 ədəd qəbulu)
    if allowed_max == outstanding and tolerance_percent > 0:
        allowed_max = outstanding + int(
            Decimal(str(outstanding * tolerance_percent / 100)).quantize(
                Decimal("1"), rounding=ROUND_HALF_UP
            )
        )

    if received_qty > allowed_max:
        raise BusinessRuleViolationError(
            f"Qəbul miqdarı ({received_qty}) qalan sifariş miqdarından ({outstanding}) və "
            f"icazə verilən dözümlülük həddindən ({allowed_max}) artıqdır."
        )


def check_three_way_match_line(
    po_qty: int,
    po_price: Decimal,
    receipt_qty: int,
    invoice_qty: int,
    invoice_price: Decimal,
    price_tolerance_percent: float = 2.0,
    price_tolerance_abs: float = 5.0,
) -> tuple[str, str | None]:
    """Tək bir qaimə sətrinin PO və Qəbul aktı ilə 3-tərəfli uyğunluğunu qiymətləndirir.

    Qaytarır: (status: "MATCHED" | "TOLERATED" | "DISCREPANCY", reason: str | None)
    """
    # 1. Miqdar yoxlanışı: Qaimə miqdarı qəbul edilmiş miqdardan çox ola bilməz
    _ = po_qty
    if invoice_qty > receipt_qty:
        return (
            "DISCREPANCY",
            f"Qaimə miqdarı ({invoice_qty}) qəbul edilmiş miqdarı ({receipt_qty}) aşır.",
        )

    # 2. Qiymət yoxlanışı
    price_diff = invoice_price - po_price
    if price_diff <= Decimal("0.0000"):
        # Təchizatçı daha ucuz yazıbsa və ya eynidirsə, uyğundur
        return "MATCHED", None

    # Əgər bahadırsa, dözümlülük hədlərini yoxlayırıq
    percent_diff = (price_diff / po_price) * Decimal("100.0") if po_price > 0 else Decimal("100.0")
    if percent_diff <= Decimal(str(price_tolerance_percent)) or price_diff <= Decimal(
        str(price_tolerance_abs)
    ):
        return (
            "TOLERATED",
            f"Qiymət fərqi (+{price_diff} AZN, {percent_diff:.1f}%) icazə verilən dözümlülük daxilindədir.",
        )

    return (
        "DISCREPANCY",
        f"Qiymət fərqi dözümlülük həddini aşır (PO: {po_price}, Faktura: {invoice_price}).",
    )


def check_purchasing_permission(permission: str, actor: Any | None) -> None:
    """Satınalma modulu üçün istifadəçi icazəsini yoxlayır."""
    if actor is None:
        raise ForbiddenError("Autentifikasiya tələb olunur.")
    is_superuser = getattr(actor, "is_superuser", False) or getattr(actor, "is_admin", False)
    if is_superuser:
        return
    roles = set(getattr(actor, "roles", []) or [])
    if "system_admin" in roles or "general_manager" in roles:
        return
    perms = set(getattr(actor, "permissions", []) or [])
    if permission not in perms:
        raise ForbiddenError(f"Bu əməliyyat üçün '{permission}' icazəsi tələb olunur.")


def has_cost_view_permission(actor: Any | None) -> bool:
    """İstifadəçinin qiymət və maya dəyərinə baxış hüququnu yoxlayır."""
    if actor is None:
        return False
    if getattr(actor, "is_superuser", False) or getattr(actor, "is_admin", False):
        return True
    roles = set(getattr(actor, "roles", []) or [])
    if "system_admin" in roles or "general_manager" in roles or "accountant" in roles:
        return True
    perms = set(getattr(actor, "permissions", []) or [])
    return "purchasing.cost.view" in perms
