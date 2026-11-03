"""Satış Fiskal Vəziyyət Maşını (SaleFiscalState).

Vəziyyətlər:
  PREPARE → PENDING_FISCAL → COMPLETED
                         ↘ FAILED_ROLLED_BACK
                         ↘ FISCAL_UNKNOWN

Failure matrix
--------------
| Outcome              | Next state            | Retry create_receipt? | Notes |
|----------------------|-----------------------|------------------------|-------|
| Success              | COMPLETED             | N/A                    | Store fiscal ids |
| Definite failure     | FAILED_ROLLED_BACK    | After full rollback    | Sale rolled back |
| Timeout / unknown    | FISCAL_UNKNOWN        | NEVER silent retry     | Manual reconcile |
| Duplicate callback   | COMPLETED (idempotent)| No                     | Same fiscal ids |

REQUIRED vs OPTIONAL (setting ``compliance.fiscal.mode``):
- REQUIRED: satış COMPLETED ola bilməz fiskal uğur olmadan; UNKNOWN satışın bağlanmasını bloklayır.
- OPTIONAL: fiskal uğursuz/UNKNOWN olsa belə ERP satışı qeyd oluna bilər (best-effort).

VACIB: FISCAL_UNKNOWN zamanı ikinci çek yaradılması QADAĞANDIR (double receipt risk).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from datetime import datetime
from enum import StrEnum
from typing import Any

from app.modules.compliance.fiscal.port import MODE_OPTIONAL, MODE_REQUIRED


class SaleFiscalState(StrEnum):
    PREPARE = "PREPARE"
    PENDING_FISCAL = "PENDING_FISCAL"
    COMPLETED = "COMPLETED"
    FAILED_ROLLED_BACK = "FAILED_ROLLED_BACK"
    FISCAL_UNKNOWN = "FISCAL_UNKNOWN"


# Failure matrix constants (docs + programmatic)
FAILURE_DEFINITE = "DEFINITE"
FAILURE_UNKNOWN = "UNKNOWN"

FAILURE_MATRIX: dict[str, dict[str, Any]] = {
    FAILURE_DEFINITE: {
        "next_state": SaleFiscalState.FAILED_ROLLED_BACK.value,
        "allow_retry_create": True,  # yalnız tam rollback-dən sonra yeni sale
        "silent_retry_forbidden": False,
        "action": "rollback",
    },
    FAILURE_UNKNOWN: {
        "next_state": SaleFiscalState.FISCAL_UNKNOWN.value,
        "allow_retry_create": False,
        "silent_retry_forbidden": True,
        "action": "manual_reconcile",
    },
}


class FiscalStateError(ValueError):
    """Yanlış vəziyyət keçidi və ya double-receipt cəhdi."""


@dataclass
class SaleFiscalRecord:
    """Satışın fiskal izi (in-memory / domain record)."""

    sale_id: str
    state: SaleFiscalState = SaleFiscalState.PREPARE
    mode: str = MODE_OPTIONAL
    fiscal_receipt_id: str | None = None
    fiscal_number: str | None = None
    qr_payload: str | None = None
    device_serial: str | None = None
    issued_at: datetime | None = None
    check_type: str | None = None
    provider: str | None = None
    raw_response_redacted: dict[str, Any] = field(default_factory=dict)
    create_attempts: int = 0
    last_error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def is_terminal(self) -> bool:
        return self.state in (
            SaleFiscalState.COMPLETED,
            SaleFiscalState.FAILED_ROLLED_BACK,
            SaleFiscalState.FISCAL_UNKNOWN,
        )

    @property
    def allows_sale_completion(self) -> bool:
        """ERP satışının tamamlanmasına icazə."""
        if self.state == SaleFiscalState.COMPLETED:
            return True
        return bool(
            self.mode.upper() == MODE_OPTIONAL
            and self.state
            in (
                SaleFiscalState.FAILED_ROLLED_BACK,
                SaleFiscalState.FISCAL_UNKNOWN,
                SaleFiscalState.PREPARE,
            )
        )


def prepare_sale(
    sale_id: str,
    *,
    mode: str = MODE_OPTIONAL,
    metadata: Mapping[str, Any] | None = None,
) -> SaleFiscalRecord:
    """PREPARE → PENDING_FISCAL; create cəhdi sayğacı artırılır."""
    return SaleFiscalRecord(
        sale_id=sale_id,
        state=SaleFiscalState.PENDING_FISCAL,
        mode=mode,
        create_attempts=1,
        metadata=dict(metadata or {}),
    )


def confirm_fiscal_success(
    record: SaleFiscalRecord,
    *,
    fiscal_receipt_id: str,
    fiscal_number: str | None = None,
    qr_payload: str | None = None,
    device_serial: str | None = None,
    issued_at: datetime | None = None,
    check_type: str | None = None,
    provider: str | None = None,
    raw_response_redacted: Mapping[str, Any] | None = None,
) -> SaleFiscalRecord:
    """PENDING_FISCAL (və ya UNKNOWN duplicate callback) → COMPLETED."""
    if record.state == SaleFiscalState.COMPLETED:
        # Idempotent: eyni fiscal_receipt_id ilə təkrar callback
        if record.fiscal_receipt_id and record.fiscal_receipt_id != fiscal_receipt_id:
            raise FiscalStateError(
                "COMPLETED satış üçün fərqli fiscal_receipt_id qəbul edilə bilməz (double receipt)."
            )
        return record

    if record.state not in (SaleFiscalState.PENDING_FISCAL, SaleFiscalState.FISCAL_UNKNOWN):
        raise FiscalStateError(
            f"confirm_fiscal_success yalnız PENDING_FISCAL/FISCAL_UNKNOWN-dan icazəlidir "
            f"(cari: {record.state})."
        )

    return replace(
        record,
        state=SaleFiscalState.COMPLETED,
        fiscal_receipt_id=fiscal_receipt_id,
        fiscal_number=fiscal_number,
        qr_payload=qr_payload,
        device_serial=device_serial,
        issued_at=issued_at,
        check_type=check_type,
        provider=provider,
        raw_response_redacted=dict(raw_response_redacted or {}),
        last_error=None,
    )


def fail_definite(record: SaleFiscalRecord, *, error: str | None = None) -> SaleFiscalRecord:
    """Müəyyən uğursuzluq → rollback."""
    if record.state == SaleFiscalState.COMPLETED:
        raise FiscalStateError("COMPLETED satış definite fail edilə bilməz.")
    if record.state == SaleFiscalState.FISCAL_UNKNOWN:
        raise FiscalStateError(
            "FISCAL_UNKNOWN definite fail deyil — əl ilə uzlaşdırma tələb olunur; "
            "silent retry create qadağandır."
        )
    if record.state not in (SaleFiscalState.PENDING_FISCAL, SaleFiscalState.PREPARE):
        raise FiscalStateError(f"fail_definite üçün uyğunsuz vəziyyət: {record.state}")

    return replace(
        record,
        state=SaleFiscalState.FAILED_ROLLED_BACK,
        last_error=error or FAILURE_MATRIX[FAILURE_DEFINITE]["action"],
    )


def fail_unknown(record: SaleFiscalRecord, *, error: str | None = None) -> SaleFiscalRecord:
    """Timeout / naməlum → FISCAL_UNKNOWN. İkinci create_receipt QADAĞANDIR."""
    if record.state == SaleFiscalState.COMPLETED:
        raise FiscalStateError("COMPLETED satış UNKNOWN edilə bilməz.")
    if record.state == SaleFiscalState.FAILED_ROLLED_BACK:
        raise FiscalStateError("Artıq rollback olunmuş satış UNKNOWN edilə bilməz.")
    if record.state not in (SaleFiscalState.PENDING_FISCAL, SaleFiscalState.PREPARE):
        raise FiscalStateError(f"fail_unknown üçün uyğunsuz vəziyyət: {record.state}")

    return replace(
        record,
        state=SaleFiscalState.FISCAL_UNKNOWN,
        last_error=error or "timeout_or_unknown",
    )


def assert_can_create_receipt(record: SaleFiscalRecord) -> None:
    """Double-receipt qorunması — FISCAL_UNKNOWN / COMPLETED-də create qadağandır."""
    if record.state == SaleFiscalState.COMPLETED:
        raise FiscalStateError(
            "COMPLETED: ikinci fiskal çek yaradılması qadağandır (double receipt)."
        )
    if record.state == SaleFiscalState.FISCAL_UNKNOWN:
        raise FiscalStateError(
            "FISCAL_UNKNOWN: silent retry create_receipt QADAĞANDIR — "
            "əl ilə uzlaşdırma / reprint istifadə edin."
        )
    if record.state == SaleFiscalState.FAILED_ROLLED_BACK:
        raise FiscalStateError(
            "FAILED_ROLLED_BACK: eyni sale_id ilə create qadağandır; yeni satış hazırlayın."
        )


def mark_create_attempt(record: SaleFiscalRecord) -> SaleFiscalRecord:
    """İcazəli create cəhdi — assert_can_create_receipt sonrası."""
    assert_can_create_receipt(record)
    if record.state == SaleFiscalState.PREPARE:
        return replace(
            record,
            state=SaleFiscalState.PENDING_FISCAL,
            create_attempts=record.create_attempts + 1,
        )
    return replace(record, create_attempts=record.create_attempts + 1)


def is_fiscal_blocking(record: SaleFiscalRecord) -> bool:
    """REQUIRED rejimdə satışın bağlanmasını bloklayan vəziyyətlər."""
    if record.mode.upper() != MODE_REQUIRED:
        return False
    return record.state != SaleFiscalState.COMPLETED
