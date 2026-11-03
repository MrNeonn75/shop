"""Brand House ERP — Hesabatlılıq və Analitika Nümunə Məlumat Generatoru.

DİQQƏT: Bu skript YALNIZ test və nümayiş məqsədlidir [DEMO].
Məlumat bazasına nümayiş xülasə qeydləri (DailySalesSummary, DailySalesByVariant,
və s.) əlavə edir.
"""

from __future__ import annotations

import asyncio
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.modules.branches.models import Branch
from app.modules.reporting.models import (
    DailyReturnsSummary,
    DailySalesSummary,
)


async def generate_demo_reporting_data(days_back: int = 30) -> None:
    """Nümayiş məqsədilə son N günün xülasə məlumatlarını bazaya yazır [DEMO]."""
    print(f"[DEMO] Son {days_back} gün üçün hesabat xülasə məlumatlarının generasiyası başladı...")

    async with AsyncSessionLocal() as session:
        # Filialları tapırıq
        res = await session.execute(select(Branch))
        branches = res.scalars().all()
        if not branches:
            print("[DEMO] Sistemdə aktiv filial tapılmadı. Zəhmət olmasa ilkin seed icra edin.")
            return

        company_id = branches[0].company_id
        today = date.today()
        count = 0

        for b in branches:
            for day_offset in range(days_back):
                cur_date = today - timedelta(days=day_offset)
                # Nağd satış xülasəsi
                summary = DailySalesSummary(
                    company_id=company_id,
                    report_date=cur_date,
                    branch_id=b.id,
                    tender_type="CASH",
                    gross_sales=Decimal("1250.00"),
                    return_amount=Decimal("50.00"),
                    discount_amount=Decimal("100.00"),
                    net_sales=Decimal("1100.00"),
                    tax_amount=Decimal("198.00"),
                    cogs_amount=Decimal("600.00"),
                    gross_profit=Decimal("500.00"),
                    transaction_count=25,
                    units_sold=45,
                    units_returned=2,
                    source_version=1,
                )
                session.add(summary)

                # Kart satışı xülasəsi
                card_summary = DailySalesSummary(
                    company_id=company_id,
                    report_date=cur_date,
                    branch_id=b.id,
                    tender_type="CARD",
                    gross_sales=Decimal("2100.00"),
                    return_amount=Decimal("0.00"),
                    discount_amount=Decimal("150.00"),
                    net_sales=Decimal("1950.00"),
                    tax_amount=Decimal("351.00"),
                    cogs_amount=Decimal("1000.00"),
                    gross_profit=Decimal("950.00"),
                    transaction_count=35,
                    units_sold=60,
                    units_returned=0,
                    source_version=1,
                )
                session.add(card_summary)

                # Qaytarma xülasəsi
                return_summary = DailyReturnsSummary(
                    company_id=company_id,
                    report_date=cur_date,
                    branch_id=b.id,
                    return_reason="DEFECT",
                    refund_tender="CASH",
                    return_count=1,
                    units_returned=2,
                    refund_amount=Decimal("50.00"),
                    source_version=1,
                )
                session.add(return_summary)
                count += 3

        await session.commit()
        print(f"[DEMO] Uğurla {count} sayda hesabat xülasə qeydi generasiya edildi.")


if __name__ == "__main__":
    asyncio.run(generate_demo_reporting_data(30))
