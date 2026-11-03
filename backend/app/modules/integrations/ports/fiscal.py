"""Fiskal Aparat və Elektron Çek Portu (Fiscal / E-Receipt Port).

Provayder-agnostik növbə / çek / kassa əməliyyatları.
Defolt UnconfiguredFiscalService bütün çağırışlarda NOT_CONFIGURED qaytarır.
"""

from __future__ import annotations

import abc
from typing import Any


def _not_configured(operation: str, **extra: Any) -> dict[str, Any]:
    return {
        "status": "NOT_CONFIGURED",
        "operation": operation,
        "message": f"Fiskal inteqrasiya konfiqurasiya edilməyib ({operation})",
        **extra,
    }


class FiscalServicePort(abc.ABC):
    """AR Dövlət Vergi Xidməti fiskal reyestri və aparatları ilə əlaqə portu."""

    # --- Legacy / e-receipt helpers (backward compatible) ---

    @abc.abstractmethod
    async def print_fiscal_receipt(self, receipt_data: dict[str, Any]) -> dict[str, Any]:
        """Fiskal kassa aparatında çek çapı."""

    @abc.abstractmethod
    async def generate_e_receipt(self, receipt_data: dict[str, Any]) -> dict[str, Any]:
        """Elektron fiskal sənəd və QR-kod generasiyası."""

    @abc.abstractmethod
    async def get_fiscal_status(self) -> dict[str, Any]:
        """Fiskal modulun statusunu qaytarır."""

    # --- Provider-agnostic shift / receipt ops ---

    @abc.abstractmethod
    async def open_shift(self, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        """Növbəni açır."""

    @abc.abstractmethod
    async def create_receipt(self, receipt_data: dict[str, Any]) -> dict[str, Any]:
        """Satış fiskal çeki (sale)."""

    @abc.abstractmethod
    async def create_return_receipt(self, receipt_data: dict[str, Any]) -> dict[str, Any]:
        """Orijinal çekə bağlı qaytarma çeki."""

    @abc.abstractmethod
    async def advance_receipt(self, receipt_data: dict[str, Any]) -> dict[str, Any]:
        """Avans / ilkin ödəniş çeki."""

    @abc.abstractmethod
    async def cash_in(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Kassaya mədaxil (cash-in)."""

    @abc.abstractmethod
    async def cash_out(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Kassadan məxaric (cash-out)."""

    @abc.abstractmethod
    async def x_report(self, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        """X-hesabat (növbəni bağlamır)."""

    @abc.abstractmethod
    async def z_report(self, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        """Z-hesabat (növbə bağlama hesabatı)."""

    @abc.abstractmethod
    async def close_shift(self, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        """Növbəni bağlayır."""

    @abc.abstractmethod
    async def get_status(self) -> dict[str, Any]:
        """Aparat / növbə statusu."""

    @abc.abstractmethod
    async def reprint(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Çekin təkrar çapı."""

    @abc.abstractmethod
    async def cancel(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Əməliyyatın ləğvi (provayder dəstəyi varsa)."""


class UnconfiguredFiscalService(FiscalServicePort):
    """Defolt quraşdırılmamış fiskal xidmət adapteri (Həmişə NOT_CONFIGURED qaytarır)."""

    async def print_fiscal_receipt(self, _receipt_data: dict[str, Any]) -> dict[str, Any]:
        return _not_configured(
            "print_fiscal_receipt",
            message="Fiskal kassa aparatı inteqrasiyası konfiqurasiya edilməyib",
        )

    async def generate_e_receipt(self, _receipt_data: dict[str, Any]) -> dict[str, Any]:
        return _not_configured(
            "generate_e_receipt",
            message="Elektron çek servisi aktiv deyil",
        )

    async def get_fiscal_status(self) -> dict[str, Any]:
        return {
            "status": "NOT_CONFIGURED",
            "configured": False,
            "provider": None,
            "operation": "get_fiscal_status",
        }

    async def open_shift(self, _payload: dict[str, Any] | None = None) -> dict[str, Any]:
        return _not_configured("open_shift")

    async def create_receipt(self, _receipt_data: dict[str, Any]) -> dict[str, Any]:
        return _not_configured("create_receipt")

    async def create_return_receipt(self, _receipt_data: dict[str, Any]) -> dict[str, Any]:
        return _not_configured("create_return_receipt")

    async def advance_receipt(self, _receipt_data: dict[str, Any]) -> dict[str, Any]:
        return _not_configured("advance_receipt")

    async def cash_in(self, _payload: dict[str, Any]) -> dict[str, Any]:
        return _not_configured("cash_in")

    async def cash_out(self, _payload: dict[str, Any]) -> dict[str, Any]:
        return _not_configured("cash_out")

    async def x_report(self, _payload: dict[str, Any] | None = None) -> dict[str, Any]:
        return _not_configured("x_report")

    async def z_report(self, _payload: dict[str, Any] | None = None) -> dict[str, Any]:
        return _not_configured("z_report")

    async def close_shift(self, _payload: dict[str, Any] | None = None) -> dict[str, Any]:
        return _not_configured("close_shift")

    async def get_status(self) -> dict[str, Any]:
        return {
            "status": "NOT_CONFIGURED",
            "configured": False,
            "provider": None,
            "operation": "get_status",
        }

    async def reprint(self, _payload: dict[str, Any]) -> dict[str, Any]:
        return _not_configured("reprint")

    async def cancel(self, _payload: dict[str, Any]) -> dict[str, Any]:
        return _not_configured("cancel")
