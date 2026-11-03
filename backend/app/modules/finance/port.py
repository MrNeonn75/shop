"""Mühasibat İnteqrasiya Sərhədi (Accounting Integration Boundary Port).

Bütün biznes modulları (Satış, Qaytarma, Anbar, Satınalma, Kassa, Əmək haqqı) maliyyə
təsirlərini bu standart port vasitəsilə göndərir.
İcraçı adapterlər:
1. OperationalLedgerAdapter (Default): Əməliyyat faktlarını qeyd edir.
2. DoubleEntryGLAdapter (Opsional, finance.gl.enabled): İkitərəfli balanslaşdırılmış Baş Kitab qeydləri.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any, Protocol


@dataclass(frozen=True)
class AccountingEvent:
    """Mühasibatlığa ötürülən standart maliyyə hadisəsi."""

    event_id: uuid.UUID
    event_type: str  # SALE_RECOGNIZED | RETURN_RECOGNIZED | COGS_RECOGNIZED | INVENTORY_RECEIVED | SUPPLIER_INVOICE_APPROVED | SUPPLIER_PAYMENT | EXPENSE_PAID | PAYROLL_POSTED | CASH_VARIANCE | BANK_FEE | ADJUSTMENT
    company_id: uuid.UUID
    branch_id: uuid.UUID | None
    business_date: date
    gross_amount: Decimal = Decimal("0.0000")
    net_amount: Decimal = Decimal("0.0000")
    tax_amount: Decimal = Decimal("0.0000")
    cost_amount: Decimal = Decimal("0.0000")
    source_type: str = "general"
    source_id: uuid.UUID | None = None
    details: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class PostingResult:
    """Mühasibat qeydinin nəticəsi."""

    success: bool
    adapter_name: str
    event_id: uuid.UUID
    posting_id: uuid.UUID | None = None
    error_message: str | None = None


class AccountingPort(Protocol):
    """Mühasibat port protokolu."""

    async def post(self, event: AccountingEvent) -> PostingResult:
        """Maliyyə hadisəsini qəbul edir və mühasibat qeydlərini aparır."""
        ...

