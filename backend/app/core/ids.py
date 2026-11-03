"""UUIDv7 Identifikator Generatoru və Köməkçiləri (RFC 9562).

UUIDv7 zaman sıralamalı (time-ordered) 128-bitlik qlobal unikal identifikatordur.
İlk 48 biti millisaniyə dəqiqlikli zaman damğasını saxlayır, bu da verilənlər bazasının
B-Tree indekslərində diskin parçalanmasının qarşısını alır və performansı artırır.
"""

from __future__ import annotations

import os
import threading
import time
import uuid
from datetime import UTC, datetime

_lock = threading.Lock()
_last_ms = 0
_sub_ms_counter = 0


def generate_uuid7() -> uuid.UUID:
    """RFC 9562 standartına uyğun ciddi monoton UUIDv7 obyekti generasiya edir."""
    global _last_ms, _sub_ms_counter

    with _lock:
        ms = int(time.time() * 1000) & 0xFFFFFFFFFFFF

        if ms > _last_ms:
            _last_ms = ms
            _sub_ms_counter = int.from_bytes(os.urandom(2), byteorder="big") & 0x03FF
        else:
            _sub_ms_counter = (_sub_ms_counter + 1) & 0x0FFF
            ms = _last_ms

        rand_a = _sub_ms_counter & 0x0FFF

    rand_b = int.from_bytes(os.urandom(8), byteorder="big") & 0x3FFFFFFFFFFFFFFF

    time_high = (ms >> 16) & 0xFFFFFFFF
    time_mid = ms & 0xFFFF
    time_hi_and_ver = (0x7 << 12) | rand_a
    clk_seq_hi_res = (0x2 << 14) | ((rand_b >> 48) & 0x3FFF)
    clk_seq_low = rand_b & 0xFFFFFFFFFFFF

    val = (
        (time_high << 96)
        | (time_mid << 80)
        | (time_hi_and_ver << 64)
        | (clk_seq_hi_res << 48)
        | clk_seq_low
    )
    return uuid.UUID(int=val)


def extract_timestamp_from_uuid7(u: uuid.UUID | str) -> datetime:
    """UUIDv7-dən UTC datetime zaman damğasını çıxarır."""
    if isinstance(u, str):
        u = uuid.UUID(u)
    ms = u.int >> 80
    return datetime.fromtimestamp(ms / 1000.0, tz=UTC)


def extract_unix_timestamp_from_uuid7(u: uuid.UUID | str) -> float:
    """UUIDv7-dən millisaniyə dəqiqlikli Unix zaman damğasını (saniyələrlə) çıxarır."""
    if isinstance(u, str):
        u = uuid.UUID(u)
    ms = u.int >> 80
    return ms / 1000.0


def is_valid_uuid(val: str) -> bool:
    """Daxil edilən sətrin etibarlı UUID formatında olduğunu yoxlayır."""
    try:
        uuid.UUID(val)
        return True
    except (ValueError, AttributeError, TypeError):
        return False
