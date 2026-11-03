"""Biometrik və Turniket Giriş-Çıxış Cihazları Portu (Attendance Device Port)."""

from __future__ import annotations

import abc
from datetime import datetime
from typing import Any


class AttendanceDevicePort(abc.ABC):
    """ZKTeco və digər biometrik cihazlarla qarşılıqlı əlaqə portu."""

    @abc.abstractmethod
    async def fetch_punch_logs(
        self,
        device_ip: str,
        since: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """Cihazın daxili yaddaşından giriş-çıxış qeydlərini oxuyur."""
        pass

    @abc.abstractmethod
    async def ping_device(self, device_ip: str) -> bool:
        """Cihazın şəbəkədə əlçatan olduğunu yoxlayır."""
        pass

