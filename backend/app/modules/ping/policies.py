"""Ping Modulu Təhlükəsizlik və İcazə Siyasəti."""

from __future__ import annotations

from typing import Any


def can_read_pings(_user: Any = None) -> bool:
    """İstifadəçinin ping siyahısını oxumaq hüququnu yoxlayır."""
    return True


def can_create_ping(_user: Any = None) -> bool:
    """İstifadəçinin yeni ping yaratmaq hüququnu yoxlayır."""
    return True
