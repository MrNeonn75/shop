"""İdentifikatorlar Testləri (UUIDv7 & RFC 9562).

Zaman sıralılığı, unikallıq və zaman damğasının bərpası.
"""

from __future__ import annotations

import time
import uuid

from app.core.database import utc_now
from app.core.ids import (
    extract_timestamp_from_uuid7,
    generate_uuid7,
    is_valid_uuid,
)


def test_uuid7_generation_and_validity() -> None:
    u = generate_uuid7()
    assert isinstance(u, uuid.UUID)
    assert u.version == 7
    assert is_valid_uuid(str(u)) is True
    assert is_valid_uuid("not-a-uuid") is False


def test_uuid7_monotonicity() -> None:
    ids = []
    for _ in range(100):
        ids.append(generate_uuid7())
        time.sleep(0.0001)

    # Bütün ID-lər unikal olmalıdır
    assert len(set(ids)) == 100

    # Bütün ID-lər leksikoqrafik/zaman baxımından artan sırada olmalıdır
    sorted_ids = sorted(ids)
    assert ids == sorted_ids


def test_uuid7_timestamp_extraction() -> None:
    before = utc_now()
    u = generate_uuid7()
    after = utc_now()

    extracted = extract_timestamp_from_uuid7(u)

    # Çıxarılan zaman damğası generate anına çox yaxın olmalıdır (1 saniyədən az fərq)
    diff_before = abs((extracted - before).total_seconds())
    diff_after = abs((after - extracted).total_seconds())

    assert diff_before < 2.0
    assert diff_after < 2.0
