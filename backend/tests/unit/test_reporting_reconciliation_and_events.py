"""Brand House ERP — Hesabat Xülasə Yenilənməsi və Uzlaşdırma Testləri (Reconciliation)."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.reporting.models import DailySalesSummary
from app.modules.reporting.repository import ReportingRepository
from app.modules.sales.models import Sale
from app.worker import reconcile_reporting_summaries_job


@pytest.mark.asyncio
async def test_consume_sale_completed_incremental_update(session: AsyncSession) -> None:
    """sale.completed hadisəsinin xülasə cədvəlinə inkremental əlavə olunması."""
    repo = ReportingRepository(session)
    branch_id = uuid.uuid4()
    cashier_id = uuid.uuid4()
    company_id = uuid.uuid4()

    payload_1 = {
        "company_id": str(company_id),
        "branch_id": str(branch_id),
        "cashier_id": str(cashier_id),
        "grand_total": "150.00",
        "items_count": 3,
        "payment_tenders": ["CASH"],
    }

    # 1. İlk satış -> Yeni sətir yaradılır
    await repo.consume_sale_completed(payload_1)

    # 2. İkinci satış -> Mövcud sətir artırılır
    payload_2 = {
        "company_id": str(company_id),
        "branch_id": str(branch_id),
        "cashier_id": str(cashier_id),
        "grand_total": "200.00",
        "items_count": 2,
        "payment_tenders": ["CASH"],
    }
    await repo.consume_sale_completed(payload_2)

    # Yoxlayırıq
    from sqlalchemy import select
    stmt = select(DailySalesSummary).where(
        DailySalesSummary.branch_id == branch_id,
        DailySalesSummary.report_date == date.today(),
        DailySalesSummary.cashier_id == cashier_id,
    )
    res = await session.execute(stmt)
    summary = res.scalars().one()

    assert summary.gross_sales == Decimal("350.00")
    assert summary.net_sales == Decimal("350.00")
    assert summary.transaction_count == 2
    assert summary.units_sold == 5
    assert summary.source_version == 2


@pytest.mark.asyncio
async def test_reconcile_sales_summary_drift_detection(session: AsyncSession) -> None:
    """İlkin Sale mənbəsi ilə DailySalesSummary arasında fərq (drift) aşkarlanması."""
    repo = ReportingRepository(session)
    branch_id = uuid.uuid4()
    company_id = uuid.uuid4()
    today = date.today()

    # 1. Summary cədvəlində qeyd (məsələn 500 AZN)
    sum_row = DailySalesSummary(
        company_id=company_id,
        report_date=today,
        branch_id=branch_id,
        tender_type="CASH",
        gross_sales=Decimal("500.00"),
        net_sales=Decimal("500.00"),
        transaction_count=5,
        source_version=1,
    )
    await repo.add_daily_sales_summary(sum_row)

    # 2. Əgər Sale cədvəlində heç bir satış yoxdursa -> Drift olmalıdır!
    source_sales, summary_sales, is_drift = await repo.reconcile_sales_summary_for_date(
        target_date=today, branch_id=branch_id
    )
    assert source_sales == Decimal("0.00")
    assert summary_sales == Decimal("500.00")
    assert is_drift is True

    # 3. İndi Sale cədvəlinə tam uyğun satış əlavə edək (500 AZN)
    sale = Sale(
        id=uuid.uuid4(),
        company_id=company_id,
        branch_id=branch_id,
        register_id=uuid.uuid4(),
        shift_id=uuid.uuid4(),
        cashier_id=uuid.uuid4(),
        receipt_no=f"REC-{uuid.uuid4().hex[:6]}",
        subtotal=Decimal("500.00"),
        grand_total=Decimal("500.00"),
        paid_amount=Decimal("500.00"),
        change_amount=Decimal("0.00"),
        status="COMPLETED",
        business_date=today,
    )
    session.add(sale)
    await session.flush()

    source_sales2, summary_sales2, is_drift2 = await repo.reconcile_sales_summary_for_date(
        target_date=today, branch_id=branch_id
    )
    assert source_sales2 == Decimal("500.00")
    assert summary_sales2 == Decimal("500.00")
    assert is_drift2 is False


@pytest.mark.asyncio
async def test_reconcile_reporting_summaries_job_execution() -> None:
    """Worker cron tapşırığının uğurla icra olunması."""
    # Tapşırığı çağırırıq (aktiv filiallar yoxdursa və ya drift yoxdursa 0 qaytarır)
    drift_count = await reconcile_reporting_summaries_job()
    assert isinstance(drift_count, int)
    assert drift_count >= 0
