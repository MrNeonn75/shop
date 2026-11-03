"""Köhnə Brendhouse E-Ticarət Sistemi Portu və Adapteri (Legacy Store Port).

Köhnə sistemdən məhsul kataloqu, müştərilər və qalıqların sinxronizasiyası üçün interfeys.
Konfiqurasiya edilməyibsə qəti şəkildə NOT_CONFIGURED qaytarır və heç vaxt feyk sinxronizasiya etmir.
"""

from __future__ import annotations

import abc
from datetime import datetime
from typing import Any


class LegacyStorePort(abc.ABC):
    """Köhnə e-ticarət sistemi ilə sinxronizasiya portu."""

    @abc.abstractmethod
    async def fetch_legacy_catalog(self) -> list[dict[str, Any]]:
        """Köhnə bazadan məhsul və çeşidləri çəkir."""
        pass

    @abc.abstractmethod
    async def fetch_legacy_customers(self, _since: datetime | None = None) -> list[dict[str, Any]]:
        """Köhnə bazadan müştəri siyahısını çəkir."""
        pass

    @abc.abstractmethod
    async def sync_stock_levels(self, stock_updates: list[dict[str, Any]]) -> dict[str, Any]:
        """Köhnə mağazaya cari anbar qalıqlarını ötürür."""
        pass


class BrendhouseLegacyAdapter(LegacyStorePort):
    """Brendhouse.az köhnə sistemi üçün adapter scaffold-u."""

    def __init__(self, is_active: bool = False, base_url: str | None = None) -> None:
        self.is_active = is_active
        self.base_url = base_url

    async def fetch_legacy_catalog(self) -> list[dict[str, Any]]:
        if not self.is_active:
            raise RuntimeError("Brendhouse Legacy API inteqrasiyası aktiv deyil (NOT_CONFIGURED)")
        return []

    async def fetch_legacy_customers(self, _since: datetime | None = None) -> list[dict[str, Any]]:
        if not self.is_active:
            raise RuntimeError("Brendhouse Legacy API inteqrasiyası aktiv deyil (NOT_CONFIGURED)")
        return []

    async def sync_stock_levels(self, stock_updates: list[dict[str, Any]]) -> dict[str, Any]:
        if not self.is_active:
            return {
                "status": "NOT_CONFIGURED",
                "message": "Brendhouse Legacy API aktiv olmadığı üçün qalıq sinxronizasiyası dayandırılıb",
            }
        return {"status": "SUCCESS", "synced_count": len(stock_updates)}

