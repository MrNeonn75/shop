"""Mühasibatlıq və Baş Kitabxana Portu (Accounting / GL Port)."""

from __future__ import annotations

import abc
from typing import Any


class AccountingPort(abc.ABC):
    """Xarici ERP / 1C / SAP mühasibatlıq sisteminə müxabirləşmələri göndərən port."""

    @abc.abstractmethod
    async def sync_journal_entry(self, entry_data: dict[str, Any]) -> dict[str, Any]:
        """Baş Kitab müxabirləşməsini xarici mühasibatlıq sisteminə ötürür."""
        pass

    @abc.abstractmethod
    async def verify_connection(self) -> bool:
        """Mühasibatlıq sistemi ilə əlaqəni yoxlayır."""
        pass

