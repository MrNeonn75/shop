"""Maliyyə Hesabatları və Gəlir / Nağd Fərqləndirilməsi Testləri (P&L & Revenue vs Cash)."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest

from app.modules.finance.models import FinancialAccount
from app.modules.finance.reports_service import FinanceReportsService
from app.modules.finance.schemas import (
    CustomerPaymentCreate,
    CustomerReceivableInvoiceCreate,
    FinancialAccountCreate,
)
from app.modules.finance.service import FinanceService
from app.modules.sales.models import Sale, SaleLine
from app.modules.settings.schemas import SettingValueResponse


class MockSettingsService:
    def __init__(self, values: dict[str, Any] | None = None) -> None:
        self.values = values or {}

    async def get(self, key: str, *_args: Any, **_kwargs: Any) -> SettingValueResponse:
        val = self.values.get(key, {})
        return SettingValueResponse(
            key=key,
            value=val,
            effective_from=datetime.now(UTC),
            version=1,
            source="company_value",
        )


class MockActor:
    def __init__(self, user_id: uuid.UUID, roles: list[str], permissions: list[str]) -> None:
        self.id = user_id
        self.roles = roles
        self.permissions = permissions


@pytest.mark.asyncio
async def test_revenue_vs_cash_received_strict_separation(db_session):
    """Prinsip 1: Gəlir və Nağd Daxilolma qəti fərqləndirilir.

    1. Nisyə satış (Credit sale): Satış anında GƏLİR tanınır, lakin kassa/bank hesaba SIFIR nağd daxil olur.
    2. Borc ödənişi (Debt payment): Kassa/bank hesabına NAĞD DAXİL OLUR, lakin heç bir yeni GƏLİR yaranmır.
    """
    company_id = uuid.uuid4()
    branch_id = uuid.uuid4()
    customer_id = uuid.uuid4()

    settings_service = MockSettingsService({"finance_rules": {"credit_sales_enabled": True}})
    service = FinanceService(settings_service=settings_service)
    reports = FinanceReportsService(db_session, settings_service=settings_service)
    admin = MockActor(uuid.uuid4(), ["system_admin"], [])

    # Bank hesabı yaradılır (balans: 0.00)
    bank_acc = await service.create_account(
        company_id, FinancialAccountCreate(code="BANK-SEP-01", name="Ayırma Bankı", type="bank"), admin
    )

    # 1. Korporativ nisyə qaimə kəsilir (800 AZN)
    inv = await service.create_receivable_invoice(
        company_id,
        CustomerReceivableInvoiceCreate(
            customer_id=customer_id,
            branch_id=branch_id,
            issue_date=date(2026, 10, 10),
            due_date=date(2026, 10, 30),
            total_amount=Decimal("800.0000"),
        ),
        admin,
    )
    assert inv.status == "UNPAID"

    # Satış cədvəlinə tamamlanmış nisyə satış qeydi əlavə edirik (Xalis Gəlir = 800 AZN)
    sale = Sale(
        id=uuid.uuid4(),
        company_id=company_id,
        receipt_no="SL-CREDIT-001",
        branch_id=branch_id,
        register_id=uuid.uuid4(),
        shift_id=uuid.uuid4(),
        cashier_id=uuid.uuid4(),
        customer_id=customer_id,
        business_date=date(2026, 10, 10),
        subtotal=Decimal("800.0000"),
        discount_total=Decimal("0.0000"),
        tax_total=Decimal("0.0000"),
        grand_total=Decimal("800.0000"),
        paid_amount=Decimal("800.0000"),
        cost_total=Decimal("500.0000"),
        status="COMPLETED",
        version=1,
    )
    db_session.add(sale)
    line = SaleLine(
        id=uuid.uuid4(),
        sale_id=sale.id,
        variant_id=uuid.uuid4(),
        product_id=uuid.uuid4(),
        sku="TEST-SKU-01",
        product_name="Test Məhsul",
        line_no=1,
        quantity=1,
        unit_price=Decimal("800.00"),
        gross_amount=Decimal("800.00"),
        discount_amount=Decimal("0.00"),
        tax_amount=Decimal("0.00"),
        total_amount=Decimal("800.00"),
        cost_price=Decimal("500.0000"),
    )
    db_session.add(line)
    await db_session.flush()

    # P&L hesabatında GƏLİR = 800 AZN görünməlidir
    pnl = await reports.get_pnl_report(company_id, "2026-10")
    assert pnl.net_revenue.amount == Decimal("800.00")

    # Lakin Pul Vəsaitlərinin Hərəkəti (Cash Flow) hesabatında NAĞD DAXİLOLMA = 0.00 AZN olmalıdır!
    cf1 = await reports.get_cash_flow_report(company_id, date(2026, 10, 1), date(2026, 10, 31))
    assert cf1.total_inflows == Decimal("0.00")

    # 2. İndi müştəri gəlir və borcunu banka ödəyir (800 AZN)
    pmt = await service.record_customer_payment(
        company_id,
        CustomerPaymentCreate(
            customer_id=customer_id,
            payment_account_id=bank_acc.id,
            amount=Decimal("800.0000"),
            payment_date=date(2026, 10, 20),
            reference="BORC-ODENIS-01",
        ),
        admin,
    )
    assert pmt.status == "COMPLETED"

    # İndi Cash Flow hesabatında NAĞD DAXİLOLMA = 800.00 AZN görünməlidir
    cf2 = await reports.get_cash_flow_report(company_id, date(2026, 10, 1), date(2026, 10, 31))
    assert cf2.total_inflows == Decimal("800.00")

    # Amma P&L hesabatında GƏLİR yenə 800 AZN olaraq qalır (Təkrar gəlir artımı YOXDUR!)
    pnl2 = await reports.get_pnl_report(company_id, "2026-10")
    assert pnl2.net_revenue.amount == Decimal("800.00")


@pytest.mark.asyncio
async def test_incomplete_cost_returns_not_computable_status(db_session):
    """Maya dəyəri natamam olan satış olduqda P&L hesabatı NOT_COMPUTABLE statusu və missing_inputs siyahısı qaytarır."""
    company_id = uuid.uuid4()
    branch_id = uuid.uuid4()

    settings_service = MockSettingsService()
    reports = FinanceReportsService(db_session, settings_service=settings_service)

    # Satış sətri maya dəyəri snapshotu olmadan (cost_price is None)
    sale = Sale(
        id=uuid.uuid4(),
        company_id=company_id,
        receipt_no="SL-NO-COST-001",
        branch_id=branch_id,
        register_id=uuid.uuid4(),
        shift_id=uuid.uuid4(),
        cashier_id=uuid.uuid4(),
        business_date=date(2026, 10, 15),
        subtotal=Decimal("200.0000"),
        tax_total=Decimal("0.0000"),
        grand_total=Decimal("200.0000"),
        paid_amount=Decimal("200.0000"),
        status="COMPLETED",
        version=1,
    )
    db_session.add(sale)
    line = SaleLine(
        id=uuid.uuid4(),
        sale_id=sale.id,
        variant_id=uuid.uuid4(),
        product_id=uuid.uuid4(),
        sku="TEST-SKU-02",
        product_name="Test Məhsul 2",
        line_no=1,
        quantity=1,
        unit_price=Decimal("200.00"),
        gross_amount=Decimal("200.00"),
        discount_amount=Decimal("0.00"),
        tax_amount=Decimal("0.00"),
        total_amount=Decimal("200.00"),
        cost_price=Decimal("0.0000"),  # MAYA DƏYƏRİ YOXDUR!
    )
    db_session.add(line)
    await db_session.flush()

    pnl = await reports.get_pnl_report(company_id, "2026-10")
    assert pnl.status == "NOT_COMPUTABLE"
    assert len(pnl.missing_inputs) >= 1
    assert "maya dəyəri snapshotu yoxdur" in pnl.missing_inputs[0]


@pytest.mark.asyncio
async def test_daily_cash_and_receivables_aging_and_drill_down(db_session):
    """Gündəlik kassa hesabatı, Müştəri borc yaşlanması və Drill-down hesabatları."""
    from app.modules.finance.models import AccountTransaction, CustomerReceivableInvoice

    company_id = uuid.uuid4()
    branch_id = uuid.uuid4()
    today = date(2026, 10, 20)

    settings_service = MockSettingsService()
    reports = FinanceReportsService(db_session, settings_service=settings_service)

    # 1. Kassa hesabı və əməliyyatları
    cash_acc = FinancialAccount(
        id=uuid.uuid4(),
        company_id=company_id,
        code="ACC-CASH-DAILY-01",
        name="Gündəlik Kassa",
        type="cash",
        sub_type="cash_office",
        branch_id=branch_id,
        currency="AZN",
        status="active",
        account_details={},
    )
    db_session.add(cash_acc)

    tx_in = AccountTransaction(
        id=uuid.uuid4(),
        company_id=company_id,
        account_id=cash_acc.id,
        direction="IN",
        amount=Decimal("150.00"),
        occurred_at=datetime(2026, 10, 20, 10, 0, tzinfo=UTC),
        source_type="sale",
    )
    tx_out = AccountTransaction(
        id=uuid.uuid4(),
        company_id=company_id,
        account_id=cash_acc.id,
        direction="OUT",
        amount=Decimal("30.00"),
        occurred_at=datetime(2026, 10, 20, 14, 0, tzinfo=UTC),
        source_type="return",
    )
    db_session.add_all([tx_in, tx_out])

    # 2. Nisyə qaimələr (Receivables)
    inv1 = CustomerReceivableInvoice(
        id=uuid.uuid4(),
        company_id=company_id,
        invoice_no="INV-AGING-01",
        customer_id=uuid.uuid4(),
        branch_id=branch_id,
        issue_date=today - timedelta(days=20),
        due_date=today - timedelta(days=15),  # 15 gün overdue -> 0-30 bucket
        total_amount=Decimal("400.00"),
        paid_amount=Decimal("0.00"),
        status="UNPAID",
    )
    inv2 = CustomerReceivableInvoice(
        id=uuid.uuid4(),
        company_id=company_id,
        invoice_no="INV-AGING-02",
        customer_id=uuid.uuid4(),
        branch_id=branch_id,
        issue_date=today - timedelta(days=60),
        due_date=today - timedelta(days=45),  # 45 gün overdue -> 31-60 bucket
        total_amount=Decimal("600.00"),
        paid_amount=Decimal("100.00"),  # 500 rem
        status="PARTIAL",
    )
    db_session.add_all([inv1, inv2])
    await db_session.flush()

    # Test Daily Cash Report
    daily_rep = await reports.get_daily_cash_report(company_id, today, branch_id)
    assert daily_rep.cash_sales == Decimal("150.00")
    assert daily_rep.cash_returns == Decimal("30.00")

    # Test Receivables Aging Report
    rec_aging = await reports.get_receivables_aging(company_id, as_of_date=today)
    assert rec_aging.total_outstanding == Decimal("900.00")  # 400 + 500
    assert rec_aging.overdue_amount == Decimal("900.00")
    bucket_map = {b.bucket_label: b.amount for b in rec_aging.buckets}
    assert bucket_map["0-30"] == Decimal("400.00")
    assert bucket_map["31-60"] == Decimal("500.00")

    # Test Drill-down transactions
    dd_rev = await reports.get_drill_down_transactions(
        company_id, "DEF-FIN-REV-001", date(2026, 10, 1), date(2026, 10, 31)
    )
    assert dd_rev.metric_id == "DEF-FIN-REV-001"

    dd_cash = await reports.get_drill_down_transactions(
        company_id, "DEF-FIN-CSH-001", date(2026, 10, 1), date(2026, 10, 31)
    )
    assert dd_cash.metric_id == "DEF-FIN-CSH-001"

