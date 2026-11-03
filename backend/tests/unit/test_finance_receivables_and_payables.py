"""Müştəri və Təchizatçı Borcları (Receivables & Payables Aging) Vahid Testləri."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest

from app.core.errors import BusinessRuleViolationError
from app.modules.finance.reports_service import FinanceReportsService
from app.modules.finance.schemas import (
    CustomerReceivableInvoiceCreate,
)
from app.modules.finance.service import FinanceService
from app.modules.settings.schemas import SettingValueResponse
from app.modules.suppliers.models import (
    Supplier,
    SupplierLedgerDirection,
    SupplierLedgerEntry,
    SupplierLedgerEntryType,
)


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
async def test_credit_sales_disabled_returns_feature_disabled_state(db_session):
    """finance.credit_sales_enabled = False olduqda bütün nisyə satış endpointləri FEATURE_DISABLED qaytarır."""
    company_id = uuid.uuid4()
    settings_service = MockSettingsService({"finance_rules": {"credit_sales_enabled": False}})
    service = FinanceService(settings_service=settings_service)
    admin = MockActor(uuid.uuid4(), ["system_admin"], [])

    with pytest.raises(BusinessRuleViolationError) as exc:
        await service.create_receivable_invoice(
            company_id,
            CustomerReceivableInvoiceCreate(
                customer_id=uuid.uuid4(),
                branch_id=uuid.uuid4(),
                issue_date=date.today(),
                due_date=date.today(),
                total_amount=Decimal("500.00"),
            ),
            admin,
        )
    assert exc.value.code == "FEATURE_DISABLED"


@pytest.mark.asyncio
async def test_supplier_payables_aging_read_model(db_session):
    """Təchizatçı borclarının yaşlanma analizi supplier_ledger_entries cədvəlindən dəqiq hesablanır."""
    company_id = uuid.uuid4()
    reports = FinanceReportsService(db_session)
    today = date(2026, 10, 20)

    sup = Supplier(
        id=uuid.uuid4(),
        company_id=company_id,
        code="SUP-TEST-01",
        name="Test Təchizatçı MMC",
        payment_terms_days=30,
        default_currency="AZN",
        status="active",
    )
    db_session.add(sup)

    # 1. Vaxtı 10 gün keçmiş qaimə (0-30 bucket): 1000 AZN
    e1 = SupplierLedgerEntry(
        id=uuid.uuid4(),
        company_id=company_id,
        supplier_id=sup.id,
        entry_type=SupplierLedgerEntryType.INVOICE.value,
        direction=SupplierLedgerDirection.CREDIT.value,
        amount=Decimal("1000.0000"),
        currency="AZN",
        reference_type="INVOICE",
        reference_id=uuid.uuid4(),
        occurred_at=datetime.now(UTC),
        due_date=today - timedelta(days=10),
    )
    db_session.add(e1)

    # 2. Vaxtı 45 gün keçmiş qaimə (31-60 bucket): 2000 AZN
    e2 = SupplierLedgerEntry(
        id=uuid.uuid4(),
        company_id=company_id,
        supplier_id=sup.id,
        entry_type=SupplierLedgerEntryType.INVOICE.value,
        direction=SupplierLedgerDirection.CREDIT.value,
        amount=Decimal("2000.0000"),
        currency="AZN",
        reference_type="INVOICE",
        reference_id=uuid.uuid4(),
        occurred_at=datetime.now(UTC),
        due_date=today - timedelta(days=45),
    )
    db_session.add(e2)

    await db_session.flush()

    aging = await reports.get_payables_aging(company_id, as_of_date=today)
    assert aging.total_outstanding == Decimal("3000.00")
    assert aging.overdue_amount == Decimal("3000.00")

    bucket_map = {b.bucket_label: b.amount for b in aging.buckets}
    assert bucket_map["0-30"] == Decimal("1000.00")
    assert bucket_map["31-60"] == Decimal("2000.00")
    assert bucket_map["61-90"] == Decimal("0.00")
    assert bucket_map["90+"] == Decimal("0.00")

