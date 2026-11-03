"""Vergi Hesabı / E-Qaimə Portu (Tax Invoice Port).

Avtomatik təqdimat YOXDUR — yalnız mühasib üçün qaralama ixrac.
Konfiqurasiya edilmədikdə status = NOT_CONFIGURED.
"""

from __future__ import annotations

import abc
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

STATUS_NOT_CONFIGURED = "NOT_CONFIGURED"
DRAFT_LABEL = "DRAFT FOR ACCOUNTANT REVIEW"


class TaxInvoicePort(abc.ABC):
    """Elektron vergi hesabı / e-qaimə provayderi üçün mücərrəd port."""

    @abc.abstractmethod
    async def get_status(self) -> dict[str, Any]:
        """Port statusunu qaytarır (NOT_CONFIGURED və s.)."""

    @abc.abstractmethod
    async def submit_invoice(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        """Provayderə təqdimat (konfiqurasiya olunmuş adapter üçün).

        Unconfigured implementasiya heç vaxt göndərmir.
        """


class UnconfiguredTaxInvoicePort(TaxInvoicePort):
    """Defolt — heç bir avtomatik təqdimat yoxdur."""

    async def get_status(self) -> dict[str, Any]:
        return {
            "status": STATUS_NOT_CONFIGURED,
            "configured": False,
            "provider": None,
            "message": "Vergi hesabı / e-qaimə inteqrasiyası konfiqurasiya edilməyib",
        }

    async def submit_invoice(self, _payload: Mapping[str, Any]) -> dict[str, Any]:
        return {
            "status": STATUS_NOT_CONFIGURED,
            "submitted": False,
            "message": "Avtomatik təqdimat deaktivdir; mühasib qaralamasından istifadə edin",
        }


def draft_export_for_accountant(
    buyer_voen: str,
    items: Sequence[Mapping[str, Any]],
    vat: Mapping[str, Any] | Decimal | str | int | float,
    *,
    seller_voen: str | None = None,
    currency: str = "AZN",
    notes: str | None = None,
) -> dict[str, Any]:
    """Mühasib yoxlaması üçün qaralama ixrac dict.

    Avtomatik göndərilmir — label həmişə DRAFT FOR ACCOUNTANT REVIEW.
    """
    if isinstance(vat, Mapping):
        vat_block: dict[str, Any] = dict(vat)
    else:
        vat_block = {"amount": str(vat)}

    normalized_items = [
        {k: (str(v) if isinstance(v, Decimal) else v) for k, v in dict(item).items()}
        for item in items
    ]

    return {
        "label": DRAFT_LABEL,
        "status": "DRAFT",
        "auto_submit": False,
        "buyer_voen": buyer_voen,
        "seller_voen": seller_voen,
        "currency": currency,
        "items": normalized_items,
        "vat": vat_block,
        "notes": notes,
        "generated_at": datetime.now(UTC).isoformat(),
        "disclaimer_az": (
            "Bu sənəd yalnız mühasib yoxlaması üçündür. "
            "Sistem avtomatik olaraq vergi orqanına təqdimat etmir."
        ),
    }
