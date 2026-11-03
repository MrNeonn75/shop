"""Şəbəkə və ESC/POS Çap Xidməti Portu (Printer Service Port)."""

from __future__ import annotations

import abc
from typing import Any


class PrinterServicePort(abc.ABC):
    """ESC/POS və ya şəbəkə çap serveri ilə əlaqə portu."""

    @abc.abstractmethod
    async def print_raw(self, printer_ip: str, port: int, payload: bytes) -> bool:
        """Xam bayt axınını birbaşa printerə göndərir."""
        pass

    @abc.abstractmethod
    async def check_printer_status(self, printer_ip: str, port: int) -> dict[str, Any]:
        """Printerin onlayn/oflayn statusunu yoxlayır."""
        pass

