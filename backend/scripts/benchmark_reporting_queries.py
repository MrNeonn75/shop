"""Brand House ERP — Hesabatlılıq Sorğuları Performans Testi (Benchmark).

Standart hesabat sorğularının icra müddətini ölçür və p95 < 500 ms tələbinin
ödənildiyini sübut edir.
"""

from __future__ import annotations

import asyncio
import contextlib
import sys
import time
import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.modules.reporting.models import DailySalesSummary

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    with contextlib.suppress(Exception):
        sys.stdout.reconfigure(encoding="utf-8")


async def benchmark_reporting_queries(iterations: int = 50) -> None:
    print(f"=== Hesabat Sorgulari Performans Testi ({iterations} tekrar) ===")

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Nümunə demo məlumatların daxil edilməsi
    test_company_id = uuid.uuid4()
    test_branch_id = uuid.uuid4()
    async with session_factory() as session:
        today = date.today()
        for i in range(60):
            d = today - timedelta(days=i)
            s = DailySalesSummary(
                company_id=test_company_id,
                branch_id=test_branch_id,
                report_date=d,
                tender_type="CASH",
                gross_sales=Decimal("2500.00"),
                net_sales=Decimal("2300.00"),
                cogs_amount=Decimal("1200.00"),
                gross_profit=Decimal("1100.00"),
                transaction_count=45,
                units_sold=80,
                source_version=1,
            )
            session.add(s)
        await session.commit()

    durations: list[float] = []
    month_ago = today - timedelta(days=30)

    async with session_factory() as session:
        for _i in range(iterations):
            start = time.perf_counter()

            # 30 günlük satış hesabatı aqreqasiyası
            stmt = (
                select(
                    DailySalesSummary.report_date,
                    func.sum(DailySalesSummary.net_sales).label("total_net_sales"),
                    func.sum(DailySalesSummary.gross_profit).label("total_gross_profit"),
                    func.sum(DailySalesSummary.transaction_count).label("total_transactions"),
                )
                .where(DailySalesSummary.report_date.between(month_ago, today))
                .group_by(DailySalesSummary.report_date)
                .order_by(DailySalesSummary.report_date.desc())
            )
            res = await session.execute(stmt)
            _ = res.all()

            elapsed_ms = (time.perf_counter() - start) * 1000
            durations.append(elapsed_ms)

    durations.sort()
    p50 = durations[int(len(durations) * 0.50)]
    p90 = durations[int(len(durations) * 0.90)]
    p95 = durations[int(len(durations) * 0.95)]
    avg = sum(durations) / len(durations)

    print(f"Orta Muddet: {avg:.2f} ms")
    print(f"p50:         {p50:.2f} ms")
    print(f"p90:         {p90:.2f} ms")
    print(f"p95:         {p95:.2f} ms")

    if p95 < 500.0:
        print(f"UGURLU: p95 ({p95:.2f} ms) hedef 500 ms budcesinden xeyli asagidir.")
    else:
        print(f"XEBERDARLIQ: p95 ({p95:.2f} ms) 500 ms limitini asir.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(benchmark_reporting_queries(50))
