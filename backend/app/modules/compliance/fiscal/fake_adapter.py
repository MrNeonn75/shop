"""Test Fake Fiskal Adapter — real provayder YOXDUR.

Simulyasiya: success, definite failure, timeout/UNKNOWN, duplicate callback.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

from app.modules.integrations.ports.fiscal import FiscalServicePort


class FakeFiscalBehavior(StrEnum):
    SUCCESS = "SUCCESS"
    DEFINITE_FAILURE = "DEFINITE_FAILURE"
    TIMEOUT = "TIMEOUT"
    DUPLICATE_CALLBACK = "DUPLICATE_CALLBACK"


@dataclass
class FakeFiscalAdapter(FiscalServicePort):
    """Kontrol edilən test fake."""

    behavior: FakeFiscalBehavior = FakeFiscalBehavior.SUCCESS
    delay_seconds: float = 0.0
    timeout_after: float = 0.05
    shift_open: bool = False
    receipts: dict[str, dict[str, Any]] = field(default_factory=dict)
    call_log: list[str] = field(default_factory=list)
    _idempotency_index: dict[str, dict[str, Any]] = field(default_factory=dict)

    def set_behavior(self, behavior: FakeFiscalBehavior | str) -> None:
        self.behavior = FakeFiscalBehavior(behavior)

    async def _maybe_delay(self) -> None:
        if self.delay_seconds > 0:
            await asyncio.sleep(self.delay_seconds)

    async def _apply_behavior(self, operation: str, payload: dict[str, Any]) -> dict[str, Any]:
        self.call_log.append(operation)
        await self._maybe_delay()

        if self.behavior == FakeFiscalBehavior.TIMEOUT:
            await asyncio.sleep(self.timeout_after)
            # Caller-side wait_for should fire; if not wrapped, signal unknown
            raise TimeoutError(f"Fake fiscal timeout on {operation}")

        if self.behavior == FakeFiscalBehavior.DEFINITE_FAILURE:
            return {
                "status": "FAILED",
                "operation": operation,
                "error_code": "DEVICE_REJECTED",
                "message": "Fake definite failure",
            }

        idem = payload.get("idempotency_key")
        if idem and idem in self._idempotency_index:
            # Duplicate / idempotent replay
            prior = dict(self._idempotency_index[idem])
            prior["duplicate"] = True
            return prior

        receipt_id = f"fake-{uuid4()}"
        result = {
            "status": "OK",
            "operation": operation,
            "fiscal_receipt_id": receipt_id,
            "fiscal_number": f"FN-{len(self.receipts) + 1:06d}",
            "qr_payload": f"QR:{receipt_id}",
            "device_serial": "FAKE-DEVICE-001",
            "issued_at": datetime.now(UTC).isoformat(),
            "check_type": payload.get("check_type", "SALE"),
            "provider": "fake",
            "raw_response_redacted": {"ok": True},
        }

        if self.behavior == FakeFiscalBehavior.DUPLICATE_CALLBACK:
            # First call succeeds; store so next identical idempotency returns same
            result["duplicate_callback_ready"] = True

        if idem:
            self._idempotency_index[idem] = dict(result)
        self.receipts[receipt_id] = dict(result)
        return result

    async def print_fiscal_receipt(self, receipt_data: dict[str, Any]) -> dict[str, Any]:
        return await self._apply_behavior("print_fiscal_receipt", receipt_data)

    async def generate_e_receipt(self, receipt_data: dict[str, Any]) -> dict[str, Any]:
        return await self._apply_behavior("generate_e_receipt", receipt_data)

    async def get_fiscal_status(self) -> dict[str, Any]:
        self.call_log.append("get_fiscal_status")
        return {
            "status": "OK",
            "configured": True,
            "provider": "fake",
            "shift_open": self.shift_open,
        }

    async def open_shift(self, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        self.shift_open = True
        return await self._apply_behavior("open_shift", dict(payload or {}))

    async def create_receipt(self, receipt_data: dict[str, Any]) -> dict[str, Any]:
        return await self._apply_behavior("create_receipt", receipt_data)

    async def create_return_receipt(self, receipt_data: dict[str, Any]) -> dict[str, Any]:
        data = dict(receipt_data)
        data.setdefault("check_type", "RETURN")
        if "original_fiscal_receipt_id" not in data:
            return {
                "status": "FAILED",
                "operation": "create_return_receipt",
                "error_code": "MISSING_ORIGINAL",
                "message": "original_fiscal_receipt_id tələb olunur",
            }
        return await self._apply_behavior("create_return_receipt", data)

    async def advance_receipt(self, receipt_data: dict[str, Any]) -> dict[str, Any]:
        data = dict(receipt_data)
        data.setdefault("check_type", "ADVANCE")
        return await self._apply_behavior("advance_receipt", data)

    async def cash_in(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._apply_behavior("cash_in", payload)

    async def cash_out(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._apply_behavior("cash_out", payload)

    async def x_report(self, _payload: dict[str, Any] | None = None) -> dict[str, Any]:
        self.call_log.append("x_report")
        return {"status": "OK", "operation": "x_report", "provider": "fake", "shift_open": self.shift_open}

    async def z_report(self, _payload: dict[str, Any] | None = None) -> dict[str, Any]:
        self.call_log.append("z_report")
        return {"status": "OK", "operation": "z_report", "provider": "fake", "shift_open": self.shift_open}

    async def close_shift(self, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        self.shift_open = False
        return await self._apply_behavior("close_shift", dict(payload or {}))

    async def get_status(self) -> dict[str, Any]:
        return await self.get_fiscal_status()

    async def reprint(self, payload: dict[str, Any]) -> dict[str, Any]:
        rid = payload.get("fiscal_receipt_id")
        if rid and rid in self.receipts:
            return {**self.receipts[rid], "operation": "reprint", "status": "OK"}
        return {
            "status": "FAILED",
            "operation": "reprint",
            "error_code": "NOT_FOUND",
            "message": "Çek tapılmadı",
        }

    async def cancel(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._apply_behavior("cancel", payload)
