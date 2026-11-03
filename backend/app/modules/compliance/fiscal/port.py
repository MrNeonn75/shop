"""Compliance Fiskal Servis — inteqrasiya portunu timeout və idempotency ilə sarır."""

from __future__ import annotations

import asyncio
from typing import Any

from app.modules.integrations.ports.fiscal import FiscalServicePort, UnconfiguredFiscalService

SETTING_FISCAL_MODE = "compliance.fiscal.mode"
MODE_REQUIRED = "REQUIRED"
MODE_OPTIONAL = "OPTIONAL"


class FiscalTimeoutError(TimeoutError):
    """Fiskal provayder cavabı vaxt aşımı — FISCAL_UNKNOWN üçün siqnal."""


class ComplianceFiscalService:
    """İnteqrasiya ``FiscalServicePort`` üzərində zənginləşdirilmiş wrapper.

    - ``timeout_seconds``: asyncio.wait_for
    - ``idempotency_key``: payload-a əlavə olunur (provayder dedupe üçün)
    """

    def __init__(
        self,
        port: FiscalServicePort | None = None,
        *,
        timeout_seconds: float = 30.0,
        mode: str = MODE_OPTIONAL,
    ) -> None:
        self._port = port or UnconfiguredFiscalService()
        self.timeout_seconds = timeout_seconds
        self.mode = mode  # REQUIRED | OPTIONAL (settings: compliance.fiscal.mode)

    @property
    def is_required(self) -> bool:
        return self.mode.upper() == MODE_REQUIRED

    @property
    def underlying(self) -> FiscalServicePort:
        return self._port

    async def _call(
        self,
        coro_factory: Any,
        *,
        idempotency_key: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        data = dict(payload or {})
        if idempotency_key:
            data.setdefault("idempotency_key", idempotency_key)
        try:
            return await asyncio.wait_for(coro_factory(data), timeout=self.timeout_seconds)
        except TimeoutError as exc:
            raise FiscalTimeoutError(
                f"Fiskal əməliyyat {self.timeout_seconds}s ərzində cavab vermədi"
            ) from exc

    async def open_shift(
        self,
        payload: dict[str, Any] | None = None,
        *,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return await self._call(
            lambda d: self._port.open_shift(d or None),
            idempotency_key=idempotency_key,
            payload=payload,
        )

    async def create_receipt(
        self,
        receipt_data: dict[str, Any],
        *,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return await self._call(
            lambda d: self._port.create_receipt(d),
            idempotency_key=idempotency_key,
            payload=receipt_data,
        )

    async def create_return_receipt(
        self,
        receipt_data: dict[str, Any],
        *,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return await self._call(
            lambda d: self._port.create_return_receipt(d),
            idempotency_key=idempotency_key,
            payload=receipt_data,
        )

    async def advance_receipt(
        self,
        receipt_data: dict[str, Any],
        *,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return await self._call(
            lambda d: self._port.advance_receipt(d),
            idempotency_key=idempotency_key,
            payload=receipt_data,
        )

    async def cash_in(
        self,
        payload: dict[str, Any],
        *,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return await self._call(
            lambda d: self._port.cash_in(d),
            idempotency_key=idempotency_key,
            payload=payload,
        )

    async def cash_out(
        self,
        payload: dict[str, Any],
        *,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return await self._call(
            lambda d: self._port.cash_out(d),
            idempotency_key=idempotency_key,
            payload=payload,
        )

    async def x_report(self, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        return await self._call(lambda d: self._port.x_report(d or None), payload=payload)

    async def z_report(self, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        return await self._call(lambda d: self._port.z_report(d or None), payload=payload)

    async def close_shift(
        self,
        payload: dict[str, Any] | None = None,
        *,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return await self._call(
            lambda d: self._port.close_shift(d or None),
            idempotency_key=idempotency_key,
            payload=payload,
        )

    async def get_status(self) -> dict[str, Any]:
        try:
            return await asyncio.wait_for(self._port.get_status(), timeout=self.timeout_seconds)
        except TimeoutError as exc:
            raise FiscalTimeoutError("get_status timeout") from exc

    async def reprint(
        self,
        payload: dict[str, Any],
        *,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return await self._call(
            lambda d: self._port.reprint(d),
            idempotency_key=idempotency_key,
            payload=payload,
        )

    async def cancel(
        self,
        payload: dict[str, Any],
        *,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return await self._call(
            lambda d: self._port.cancel(d),
            idempotency_key=idempotency_key,
            payload=payload,
        )


# Re-export inteqrasiya portu
__all__ = [
    "ComplianceFiscalService",
    "FiscalTimeoutError",
    "FiscalServicePort",
    "UnconfiguredFiscalService",
    "SETTING_FISCAL_MODE",
    "MODE_REQUIRED",
    "MODE_OPTIONAL",
]
