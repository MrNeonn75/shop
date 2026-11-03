"""İnyeksiya Edilə Bilən Saat İnterfeysi və Biznes Saat Qurşağı Köməkçiləri.

Tətbiqdaxili bütün zaman hesablamaları bu interfeys üzərindən aparılır.
Testlərdə FrozenClock ilə zaman dondurula və ya dəyişdirilə bilər.
Bütün daxili qeydlər UTC ilə saxlanılır; Asia/Baku (UTC+4) yalnız biznes sərhədlərində tətbiq olunur.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from typing import Protocol
from zoneinfo import ZoneInfo

from app.core.config import settings

BAKU_TZ = ZoneInfo(settings.TIMEZONE)
UTC_TZ = UTC


class Clock(Protocol):
    """Zaman əməliyyatları üçün abstrakt protokol."""

    def now(self) -> datetime:
        """Həmişə timezone-aware UTC datetime qaytarır."""
        ...

    def today(self) -> date:
        """Biznes saat qurşağında (Asia/Baku) cari tarixi qaytarır."""
        ...


class SystemClock:
    """İstehsalat və real mühit üçün sistem saatı."""

    def now(self) -> datetime:
        return datetime.now(UTC_TZ)

    def today(self) -> date:
        return datetime.now(BAKU_TZ).date()


class FrozenClock:
    """Testlər üçün müəyyən edilmiş sabit və ya hərəkət etdirilə bilən saat."""

    def __init__(self, frozen_time: datetime | str) -> None:
        dt = datetime.fromisoformat(frozen_time) if isinstance(frozen_time, str) else frozen_time
        dt = dt.replace(tzinfo=UTC_TZ) if dt.tzinfo is None else dt.astimezone(UTC_TZ)
        self._current_time = dt

    def now(self) -> datetime:
        return self._current_time

    def today(self) -> date:
        return self._current_time.astimezone(BAKU_TZ).date()

    def advance(self, td: timedelta) -> None:
        """Zamanı irəli çəkir."""
        self._current_time += td

    def set(self, new_time: datetime) -> None:
        """Saatın göstəricisini dəyişir."""
        if new_time.tzinfo is None:
            new_time = new_time.replace(tzinfo=UTC_TZ)
        self._current_time = new_time.astimezone(UTC_TZ)

    def set_time(self, new_time: datetime) -> None:
        """set metodunun alternativi."""
        self.set(new_time)


def now_in_baku() -> datetime:
    """Asia/Baku saat qurşağında cari zamanı qaytarır."""
    return datetime.now(BAKU_TZ)


def to_baku_time(dt: datetime) -> datetime:
    """UTC zamanını Asia/Baku yerli zamanına çevirir."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC_TZ)
    return dt.astimezone(BAKU_TZ)


# Alternativ ad
to_business_timezone = to_baku_time


def to_utc(dt: datetime) -> datetime:
    """Hər hansı saat qurşaqlı zamanı UTC-yə çevirir."""
    if dt.tzinfo is None:
        # Saat qurşağı göstərilməyibsə, Asia/Baku fərz edilir
        dt = dt.replace(tzinfo=BAKU_TZ)
    return dt.astimezone(UTC_TZ)


def get_business_day_bounds(target_date: date) -> tuple[datetime, datetime]:
    """Verilmiş biznes tarixi (Asia/Baku) üçün UTC zaman sərhədlərini hesablayır.

    Məsələn, 2026-10-19 tarixi üçün:
    Asia/Baku-da gün 00:00:00-da başlayır (UTC: 2026-10-18 20:00:00)
    və 23:59:59.999999-da bitir (UTC: 2026-10-19 19:59:59.999999).
    """
    baku_start = datetime.combine(target_date, time.min, tzinfo=BAKU_TZ)
    baku_end = datetime.combine(target_date, time.max, tzinfo=BAKU_TZ)

    utc_start = baku_start.astimezone(UTC_TZ)
    utc_end = baku_end.astimezone(UTC_TZ)
    return utc_start, utc_end


# Defolt qlobal saat
_system_clock = SystemClock()


def get_clock() -> Clock:
    """FastAPI üçün injectable Clock asılılığı."""
    return _system_clock
