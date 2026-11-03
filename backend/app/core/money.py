"""Maliyyə və Kəmiyyət Dəyər Tipləri (Money & Quantities).

Maliyyə hesablamalarında heç vaxt float istifadə olunmur!
Bütün pul məbləğləri Python Decimal tipi və ROUND_HALF_UP yuvarlaqlaşdırması ilə idarə olunur.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Any


class CurrencyMismatchError(ValueError):
    """Müxtəlif valyutalar arasında birbaşa riyazi əməliyyat aparılarkən atılır."""

    def __init__(self, cur1: str, cur2: str) -> None:
        super().__init__(
            f"Valyuta uyğunsuzluğu: '{cur1}' və '{cur2}' valyutaları birbaşa toplana/çıxıla bilməz."
        )
        self.cur1 = cur1
        self.cur2 = cur2


CENT = Decimal("0.01")


def round_money(amount: Decimal | str | int) -> Decimal:
    """Məbləği ROUND_HALF_UP qaydası ilə 2 onluq işarəyə (qəpik) yuvarlaqlaşdırır."""
    if not isinstance(amount, Decimal):
        amount = Decimal(str(amount))
    return amount.quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True, slots=True)
class Money:
    """Dəyişməz (immutable) Pul dəyər tipi.

    Məbləği Decimal olaraq saxlayır və valyuta təhlükəsizliyini təmin edir.
    """

    amount: Decimal
    currency: str = "AZN"

    def __init__(self, amount: Decimal | str | int | float, currency: str = "AZN") -> None:
        if isinstance(amount, float):
            # Float qadağandır, lakin səhvən daxil edilərsə string vasitəsilə çevirib xəbərdarlıq edirik
            amount = Decimal(str(amount))
        elif not isinstance(amount, Decimal):
            amount = Decimal(str(amount))

        object.__setattr__(self, "amount", round_money(amount))
        object.__setattr__(self, "currency", currency.upper().strip())

    @classmethod
    def zero(cls, currency: str = "AZN") -> Money:
        return cls(Decimal("0.00"), currency=currency)

    def is_zero(self) -> bool:
        return self.amount == Decimal("0.00")

    def is_positive(self) -> bool:
        return self.amount > Decimal("0.00")

    def is_negative(self) -> bool:
        return self.amount < Decimal("0.00")

    def __add__(self, other: Any) -> Money:
        if isinstance(other, int | str) and other == 0:
            return self
        if not isinstance(other, Money):
            return NotImplemented
        if self.currency != other.currency:
            raise CurrencyMismatchError(self.currency, other.currency)
        return Money(self.amount + other.amount, currency=self.currency)

    def __sub__(self, other: Any) -> Money:
        if not isinstance(other, Money):
            return NotImplemented
        if self.currency != other.currency:
            raise CurrencyMismatchError(self.currency, other.currency)
        return Money(self.amount - other.amount, currency=self.currency)

    def __mul__(self, other: Any) -> Money:
        if isinstance(other, Quantity):
            factor = Decimal(str(other.value))
            return Money(round_money(self.amount * factor), currency=self.currency)
        if isinstance(other, int | Decimal):
            factor = Decimal(str(other))
            return Money(round_money(self.amount * factor), currency=self.currency)
        return NotImplemented

    def __rmul__(self, other: Any) -> Money:
        return self.__mul__(other)

    def __truediv__(self, other: Any) -> Money:
        if isinstance(other, int | Decimal):
            divisor = Decimal(str(other))
            if divisor == Decimal("0"):
                raise ZeroDivisionError("Pul məbləği sıfıra bölünə bilməz.")
            return Money(round_money(self.amount / divisor), currency=self.currency)
        return NotImplemented

    def split(self, n: int) -> list[Money]:
        """Məbləği bərabər n hissəyə bölür (qəpik itkisi olmadan)."""
        if n <= 0:
            raise ValueError("Bölgü sayı müsbət olmalıdır.")
        return self.allocate([1] * n)

    def __neg__(self) -> Money:
        return Money(-self.amount, currency=self.currency)

    def __abs__(self) -> Money:
        return Money(abs(self.amount), currency=self.currency)

    def __eq__(self, other: Any) -> bool:
        if not isinstance(other, Money):
            return False
        return self.amount == other.amount and self.currency == other.currency

    def __lt__(self, other: Any) -> bool:
        if not isinstance(other, Money):
            return NotImplemented
        if self.currency != other.currency:
            raise CurrencyMismatchError(self.currency, other.currency)
        return self.amount < other.amount

    def __le__(self, other: Any) -> bool:
        if not isinstance(other, Money):
            return NotImplemented
        if self.currency != other.currency:
            raise CurrencyMismatchError(self.currency, other.currency)
        return self.amount <= other.amount

    def __gt__(self, other: Any) -> bool:
        if not isinstance(other, Money):
            return NotImplemented
        if self.currency != other.currency:
            raise CurrencyMismatchError(self.currency, other.currency)
        return self.amount > other.amount

    def __ge__(self, other: Any) -> bool:
        if not isinstance(other, Money):
            return NotImplemented
        if self.currency != other.currency:
            raise CurrencyMismatchError(self.currency, other.currency)
        return self.amount >= other.amount

    def __repr__(self) -> str:
        return f"Money({self.amount}, '{self.currency}')"

    def __str__(self) -> str:
        return f"{self.amount:.2f} {self.currency}"

    def allocate(self, ratios: list[int | Decimal]) -> list[Money]:
        """Məbləği nisbətlərə görə qəpik itkisi olmadan bölür (Largest Remainder Method).

        Məsələn: 100 AZN məbləği 3 bərabər hissəyə bölünəndə [33.34, 33.33, 33.33] qaytarır.
        Cəm həmişə ilkin məbləğə bərabər olur (100.00 AZN).
        """
        if not ratios:
            return []

        total_weight = sum(Decimal(str(r)) for r in ratios)
        if total_weight <= Decimal("0"):
            raise ValueError("Bölgü nisbətlərinin cəmi müsbət olmalıdır.")

        total_cents = int((self.amount * 100).to_integral_value(rounding=ROUND_HALF_UP))
        remainder = total_cents
        results: list[int] = []

        # 1. Tam hissələri bölürük
        share_floats: list[tuple[int, Decimal]] = []
        for i, r in enumerate(ratios):
            ratio_dec = Decimal(str(r))
            exact_cents = (Decimal(total_cents) * ratio_dec) / total_weight
            cents = int(exact_cents)
            frac = exact_cents - Decimal(cents)
            results.append(cents)
            remainder -= cents
            share_floats.append((i, frac))

        # 2. Qalıq qəpikləri ən böyük kəsr hissəsinə malik paylara 1 qəpik əlavə edirik
        share_floats.sort(key=lambda x: x[1], reverse=True)
        for i in range(remainder):
            target_idx = share_floats[i][0]
            results[target_idx] += 1

        return [Money(Decimal(c) / Decimal(100), currency=self.currency) for c in results]


@dataclass(frozen=True, slots=True)
class Quantity:
    """Pərakəndə mallar üçün kəmiyyət tipi (ədəd, cüt, metr və s.)."""

    value: Decimal
    unit: str = "pcs"  # pcs (ədəd), pair (cüt), set (dəst), m (metr)

    def __init__(self, value: int | Decimal | str | float, unit: str = "pcs") -> None:
        if isinstance(value, float | int | str):
            val = Decimal(str(value))
        elif isinstance(value, Decimal):
            val = value
        else:
            raise TypeError("Pərakəndə mallar üçün kəmiyyət rəqəm olmalıdır.")
        object.__setattr__(self, "value", val)
        object.__setattr__(self, "unit", unit.lower().strip())

    def __add__(self, other: Quantity) -> Quantity:
        if not isinstance(other, Quantity) or self.unit != other.unit:
            raise ValueError("Eyni vahidə malik olmayan kəmiyyətlər toplana bilməz.")
        return Quantity(self.value + other.value, unit=self.unit)

    def __sub__(self, other: Quantity) -> Quantity:
        if not isinstance(other, Quantity) or self.unit != other.unit:
            raise ValueError("Eyni vahidə malik olmayan kəmiyyətlər çıxıla bilməz.")
        return Quantity(self.value - other.value, unit=self.unit)

    def __repr__(self) -> str:
        return f"Quantity({self.value}, '{self.unit}')"
