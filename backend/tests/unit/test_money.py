"""Maliyyə və Hesablama Dəqiqliyi Testləri (Money & Largest Remainder).

Qəpik itkisi olmadan bölüşdürmə, valyuta fərqliliyi qadağası və Hypothesis property testləri.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.core.money import CurrencyMismatchError, Money, Quantity


def test_money_creation_and_rounding() -> None:
    m = Money(Decimal("10.555"), "AZN")
    # ROUND_HALF_UP 10.555 -> 10.56
    assert m.amount == Decimal("10.56")
    assert str(m) == "10.56 AZN"

    m_str = Money("45.20")
    assert m_str.amount == Decimal("45.20")
    assert m_str.currency == "AZN"


def test_money_addition_and_subtraction() -> None:
    m1 = Money("50.25", "AZN")
    m2 = Money("25.10", "AZN")

    assert (m1 + m2) == Money("75.35", "AZN")
    assert (m1 - m2) == Money("25.15", "AZN")


def test_money_currency_mismatch_raises_error() -> None:
    azn = Money("100.00", "AZN")
    usd = Money("100.00", "USD")

    with pytest.raises(CurrencyMismatchError):
        _ = azn + usd

    with pytest.raises(CurrencyMismatchError):
        _ = azn - usd


def test_money_multiplication_with_quantities() -> None:
    price = Money("12.50", "AZN")
    qty = Quantity("3.5")

    total = price * qty
    # 12.50 * 3.5 = 43.75
    assert total == Money("43.75", "AZN")


def test_money_largest_remainder_allocation_no_penny_loss() -> None:
    # 100 AZN məbləğin 3 bərabər hissəyə bölünməsi
    total = Money("100.00", "AZN")
    parts = total.allocate([1, 1, 1])

    assert len(parts) == 3
    assert parts[0] == Money("33.34", "AZN")
    assert parts[1] == Money("33.33", "AZN")
    assert parts[2] == Money("33.33", "AZN")
    assert sum(p.amount for p in parts) == total.amount


def test_money_split_evenly() -> None:
    total = Money("10.00", "AZN")
    splits = total.split(3)

    assert len(splits) == 3
    assert sum(s.amount for s in splits) == total.amount
    assert splits[0] == Money("3.34", "AZN")
    assert splits[1] == Money("3.33", "AZN")
    assert splits[2] == Money("3.33", "AZN")


@given(
    amount_cents=st.integers(min_value=1, max_value=1_000_000_00),
    ratios=st.lists(st.integers(min_value=1, max_value=100), min_size=2, max_size=10),
)
def test_hypothesis_money_allocation_preserves_total(amount_cents: int, ratios: list[int]) -> None:
    """Hypothesis: İstənilən məbləğ və çəkilər üçün hissələrin cəmi həmişə ilkin məbləğə bərabərdir."""
    amount_decimal = Decimal(amount_cents) / Decimal("100")
    total = Money(amount_decimal, "AZN")

    parts = total.allocate(ratios)

    sum_parts = sum((p.amount for p in parts), Decimal("0.00"))
    assert (
        sum_parts == total.amount
    ), f"Qəpik itkisi baş verdi! Total: {total.amount}, Sum: {sum_parts}"


def test_money_predicates_and_zero() -> None:
    zero_m = Money.zero("AZN")
    assert zero_m.is_zero() is True
    assert zero_m.is_positive() is False
    assert zero_m.is_negative() is False

    pos_m = Money("15.00")
    assert pos_m.is_positive() is True
    assert pos_m.is_negative() is False

    neg_m = Money("-15.00")
    assert neg_m.is_negative() is True
    assert neg_m.is_positive() is False
    assert abs(neg_m) == pos_m
    assert -neg_m == pos_m


def test_money_comparisons() -> None:
    m1 = Money("10.00", "AZN")
    m2 = Money("20.00", "AZN")
    m3 = Money("10.00", "AZN")

    assert m1 < m2
    assert m1 <= m2
    assert m1 <= m3
    assert m2 > m1
    assert m2 >= m1
    assert m1 == m3
    assert m1 != m2
    assert m1 != "not_money"


def test_money_division_and_multiplication() -> None:
    m = Money("50.00", "AZN")
    assert m / 2 == Money("25.00", "AZN")
    assert 2 * m == Money("100.00", "AZN")

    with pytest.raises(ZeroDivisionError):
        _ = m / 0


def test_quantity_operations() -> None:
    q1 = Quantity(5, "pcs")
    q2 = Quantity(3, "pcs")
    assert (q1 + q2) == Quantity(8, "pcs")
    assert (q1 - q2) == Quantity(2, "pcs")
    assert "Quantity(5" in repr(q1)

    q_other_unit = Quantity(2, "pair")
    with pytest.raises(ValueError):
        _ = q1 + q_other_unit


def test_money_allocate_empty_or_negative_ratios() -> None:
    m = Money("100.00")
    assert m.allocate([]) == []

    with pytest.raises(ValueError):
        m.allocate([0, 0])
