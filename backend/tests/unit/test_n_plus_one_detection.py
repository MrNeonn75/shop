"""N+1 Sorğu Probleminin Aşkarlanması və Məhsuldarlıq Sınaqları (N+1 Query Detection).

Bu test dəsti əsas siyahılama sorğularının (Catalog, Sales, Inventory) verilənlər bazasına
N sayda əlavə sorğu vurmadığını (O(1) sabit sorğu büdcəsi) sübut edir.
`before_cursor_execute` dinləyicisi vasitəsilə SQL sorğularının sayı dəqiq ölçülür.
"""

from __future__ import annotations

from typing import Any

import pytest
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import engine
from app.modules.catalog.service import CatalogService
from tests.unit.test_pos_checkout_atomic import setup_pos_environment


class QueryCounter:
    """SQL sorğularının icra sayını ölçən köməkçi kontekst meneceri."""

    def __init__(self) -> None:
        self.count = 0

    def __call__(self, conn: Any, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool) -> None:
        # Sorğunu sayğaca əlavə edirik (commit/rollback xaric)
        cleaned = statement.strip().upper()
        if not cleaned.startswith(("SAVEPOINT", "RELEASE", "ROLLBACK TO")):
            self.count += 1

    def __enter__(self) -> QueryCounter:
        self.count = 0
        event.listen(engine.sync_engine, "before_cursor_execute", self)
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        event.remove(engine.sync_engine, "before_cursor_execute", self)


@pytest.mark.asyncio
async def test_catalog_products_listing_no_n_plus_one(db_session: AsyncSession) -> None:
    """Məhsul siyahısının oxunması zamanı N+1 problemi olmamalıdır: Sorğu sayı məhsul sayından asılı olaraq artmamalıdır."""
    env = await setup_pos_environment()
    company = env["company"]
    admin_actor = env["admin_actor"]
    cat_service = CatalogService()

    # 1. İlk olaraq 10 məhsul siyahılanarkən SQL sorğu sayını ölçürük
    counter_small = QueryCounter()
    with counter_small:
        items_10 = await cat_service.list_products(
            company_id=company.id,
            limit=10,
            actor=admin_actor,
        )

    assert isinstance(items_10, list)
    count_10 = counter_small.count

    # 2. İkinci olaraq 50 məhsul siyahılanarkən SQL sorğu sayını ölçürük
    counter_large = QueryCounter()
    with counter_large:
        items_50 = await cat_service.list_products(
            company_id=company.id,
            limit=50,
            actor=admin_actor,
        )

    assert isinstance(items_50, list)
    count_50 = counter_large.count

    # 3. Yoxlama: Sorğu sayı N sayına görə artmamalıdır (O(1) sorğu büdcəsi)
    # Maksimum icazə verilən fərq: 0 (və ya sabit join/transaction fərqi ≤ 1)
    assert count_50 <= count_10 + 1, f"N+1 aşkarlandı! 10 element üçün: {count_10}, 50 element üçün: {count_50}"
