"""Paralellik və Kilidləmə Köməkçiləri (Concurrency & Locking).

Row-level locking (SELECT FOR UPDATE / SKIP LOCKED),
deterministik kilidləmə ardıcıllığı (deadlock-dan qorunma),
advisory locks və serialization xətalarında avtomatik təkrar cəhd (retry).
"""

from __future__ import annotations

import asyncio
import functools
import random
import uuid
from collections.abc import Callable, Sequence
from typing import Any, TypeVar

from sqlalchemy import Select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import VersionConflictError
from app.core.logging import logger

T = TypeVar("T")


def for_update(
    query: Select[Any],
    nowait: bool = False,
    skip_locked: bool = False,
    of: Any = None,
) -> Select[Any]:
    """SQLAlchemy sorğusuna SELECT ... FOR UPDATE tətbiq edir."""
    return query.with_for_update(nowait=nowait, skip_locked=skip_locked, of=of)


def sort_keys_for_locking(keys: Sequence[uuid.UUID | str | int]) -> list[Any]:
    """Çoxsaylı sətirləri kilidləyərkən Deadlock baş verməməsi üçün açarları sıralayır."""
    return sorted(keys)


def verify_version(entity_or_version: Any, expected_version: int) -> None:
    """Optimistic locking yoxlanışı: Versiya uyğunsuzluğunda 409 Conflict atır."""
    current_version = getattr(entity_or_version, "version", entity_or_version)
    if current_version != expected_version:
        raise VersionConflictError(
            f"Məlumat versiyası uyğun gəlmir (Gözlənilən: {expected_version}, Cari: {current_version}). Səhifəni yeniləyin."
        )


async def try_advisory_xact_lock(session: AsyncSession, lock_id: int) -> bool:
    """PostgreSQL tranzaksion advisory lock cəhdi edir."""
    res = await session.execute(
        text("SELECT pg_try_advisory_xact_lock(:lock_id)"), {"lock_id": lock_id}
    )
    return bool(res.scalar())


def retry_on_serialization_failure(
    max_retries: int = 3,
    initial_delay: float = 0.05,
    max_delay: float = 0.5,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """PostgreSQL 40001 (serialization failure) və 40P01 (deadlock) hallarında eksponensial təkrar cəhd."""

    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            retries = 0
            delay = initial_delay

            while True:
                try:
                    return await func(*args, **kwargs)
                except DBAPIError as exc:
                    # PostgreSQL Serialization Failure: 40001, Deadlock: 40P01
                    orig = getattr(exc, "orig", None)
                    pgcode = getattr(orig, "pgcode", None) or getattr(orig, "sqlstate", None)

                    if pgcode in ("40001", "40P01") and retries < max_retries:
                        retries += 1
                        jitter = random.uniform(0.8, 1.2)
                        sleep_time = min(delay * jitter, max_delay)
                        logger.warning(
                            "Serialization/Deadlock toqquşması baş verdi, təkrar cəhd edilir",
                            pgcode=pgcode,
                            retry=retries,
                            max_retries=max_retries,
                            sleep_time=sleep_time,
                        )
                        await asyncio.sleep(sleep_time)
                        delay *= 2
                        continue
                    raise

        return wrapper

    return decorator
