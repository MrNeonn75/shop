"""Zaman və Saat Meneceri Testləri (Clock & Timezones).

Asia/Baku saat qurşağı, UTC saxlanma və biznes günü sərhədləri.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from app.core.clock import (
    BAKU_TZ,
    FrozenClock,
    SystemClock,
    get_business_day_bounds,
    now_in_baku,
    to_business_timezone,
    to_utc,
)


def test_system_clock() -> None:
    clock = SystemClock()
    t1 = clock.now()
    assert t1.tzinfo is not None
    assert t1.tzinfo == UTC


def test_frozen_clock() -> None:
    fixed_time = datetime(2026, 10, 19, 10, 0, 0, tzinfo=UTC)
    clock = FrozenClock(fixed_time)

    assert clock.now() == fixed_time

    # İrəli çəkmək
    clock.advance(timedelta(minutes=30))
    assert clock.now() == datetime(2026, 10, 19, 10, 30, 0, tzinfo=UTC)

    # Birbaşa dəyişmək
    new_time = datetime(2026, 12, 31, 23, 59, 59, tzinfo=UTC)
    clock.set_time(new_time)
    assert clock.now() == new_time


def test_timezone_conversion_baku() -> None:
    # 2026-10-19 10:00:00 UTC -> Bakıda 14:00:00 (+04:00)
    utc_dt = datetime(2026, 10, 19, 10, 0, 0, tzinfo=UTC)
    baku_dt = to_business_timezone(utc_dt)

    assert baku_dt.hour == 14
    assert baku_dt.tzinfo == BAKU_TZ

    # Geriyə UTC-yə çevirmə
    back_to_utc = to_utc(baku_dt)
    assert back_to_utc == utc_dt


def test_business_day_bounds() -> None:
    target_date = date(2026, 10, 19)
    start_utc, end_utc = get_business_day_bounds(target_date)

    # Bakıda günün başlanğıcı: 2026-10-19 00:00:00 AZT -> UTC: 2026-10-18 20:00:00
    assert start_utc.year == 2026
    assert start_utc.month == 10
    assert start_utc.day == 18
    assert start_utc.hour == 20
    assert start_utc.minute == 0

    # Bakıda günün sonu: 2026-10-19 23:59:59.999999 AZT -> UTC: 2026-10-19 19:59:59.999999
    assert end_utc.year == 2026
    assert end_utc.month == 10
    assert end_utc.day == 19
    assert end_utc.hour == 19
    assert end_utc.minute == 59


def test_clock_today_and_get_clock() -> None:
    from app.core.clock import get_clock

    sys_clock = SystemClock()
    assert isinstance(sys_clock.today(), date)

    frozen = FrozenClock("2026-10-19T10:00:00Z")
    assert frozen.today() == date(2026, 10, 19)

    clk = get_clock()
    assert clk is not None

    nb = now_in_baku()
    assert nb.tzinfo == BAKU_TZ

    # to_utc with naive dt
    naive = datetime(2026, 10, 19, 14, 0, 0)
    converted = to_utc(naive)
    assert converted.tzinfo == UTC
