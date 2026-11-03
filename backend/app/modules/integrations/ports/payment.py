"""Bank Ödəniş Şlüzü Portu (Payment Gateway Port)."""

from __future__ import annotations

import abc
from decimal import Decimal
from typing import Any


class PaymentGatewayPort(abc.ABC):
    """Bank POS və onlayn ödəniş şlüzü üçün mücərrəd port."""

    @abc.abstractmethod
    async def authorize(
        self,
        amount: Decimal,
        currency: str,
        order_id: str,
        card_token: str | None = None,
    ) -> dict[str, Any]:
        """Vəsaiti bloklayır (avtorizasiya)."""
        pass

    @abc.abstractmethod
    async def capture(self, transaction_id: str, amount: Decimal) -> dict[str, Any]:
        """Bloklanmış vəsaiti yekun silir (capture)."""
        pass

    @abc.abstractmethod
    async def refund(
        self,
        transaction_id: str,
        amount: Decimal,
        reason: str | None = None,
    ) -> dict[str, Any]:
        """Vəsaitin geri qaytarılması (refund)."""
        pass

    @abc.abstractmethod
    async def void(self, transaction_id: str) -> dict[str, Any]:
        """Avtorizasiyanın ləğv edilməsi (void)."""
        pass

    @abc.abstractmethod
    async def verify_credentials(self) -> bool:
        """Şlüz rekvizitlərinin etibarlılığını yoxlayır."""
        pass

