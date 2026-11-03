"""Maliyyə Dövrü Nəzarəti Vahid Testləri (Fiscal Period Control Unit Tests)."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.core.errors import ConflictError
from app.modules.finance.operational_adapter import OperationalLedgerAdapter
from app.modules.finance.port import AccountingEvent
from app.modules.finance.schemas import (
    AccountTransferRequest,
    ExpenseCreate,
    FinancialAccountCreate,
    PeriodReopenRequest,
)
from app.modules.finance.service import FinanceService


class MockActor:
    def __init__(self, user_id: uuid.UUID, roles: list[str], permissions: list[str]) -> None:
        self.id = user_id
        self.roles = roles
        self.permissions = permissions


@pytest.mark.asyncio
async def test_period_lifecycle_and_posting_rejection_when_closed(db_session):
    """Maliyyə dövrü bağlanır və bağlanmış dövrə düşən bütün yeni əməliyyatlar 409 PERIOD_CLOSED ilə rədd edilir."""
    company_id = uuid.uuid4()
    branch_id = uuid.uuid4()
    service = FinanceService()
    admin = MockActor(uuid.uuid4(), ["system_admin"], [])

    # 1. 2026-10 dövrü açılır
    fp = await service.create_fiscal_period(
        company_id, "2026-10", date(2026, 10, 1), date(2026, 10, 31), admin
    )
    assert fp.status == "OPEN"

    # Hesab və kateqoriya yaradırıq
    acc1 = await service.create_account(
        company_id, FinancialAccountCreate(code="PERIOD-ACC-01", name="Kassa", type="cash"), admin
    )
    acc2 = await service.create_account(
        company_id, FinancialAccountCreate(code="PERIOD-ACC-02", name="Bank", type="bank"), admin
    )
    await service.record_opening_balance(company_id, acc1.id, Decimal("1000.0000"), admin)

    cat = await service.create_expense_category(company_id, "PERIOD-EXP", "Xərc", actor=admin)

    # 2. Dövr bağlanır (CLOSED)
    closed_fp = await service.close_fiscal_period(company_id, "2026-10", admin)
    assert closed_fp.status == "CLOSED"
    assert closed_fp.closed_at is not None

    # 3. Bağlanmış dövr tarixinə köçürmə cəhdi rədd edilməlidir (PERIOD_CLOSED)
    with pytest.raises(ConflictError) as exc1:
        await service.execute_transfer(
            company_id,
            AccountTransferRequest(
                source_account_id=acc1.id,
                destination_account_id=acc2.id,
                amount=Decimal("100.0000"),
                occurred_at=date(2026, 10, 15),
            ),
            admin,
        )
    assert "Bağlanmış dövrə" in str(exc1.value)

    # 4. Bağlanmış dövr tarixinə yeni xərc sənədi vurmaq cəhdi rədd edilməlidir
    with pytest.raises(ConflictError) as exc2:
        await service.create_expense(
            company_id,
            ExpenseCreate(
                branch_id=branch_id,
                category_id=cat.id,
                gross_amount=Decimal("50.0000"),
                expense_date=date(2026, 10, 20),
                description="Köhnə xərc",
            ),
            admin,
        )
    assert "Bağlanmış maliyyə dövrünə" in str(exc2.value)

    # 5. Səlahiyyətli şəxs tərəfindən dövr yenidən açılır (Reopen)
    reopened_fp = await service.reopen_fiscal_period(
        company_id,
        "2026-10",
        PeriodReopenRequest(reason="Dövr sonu düzəliş sənədlərinin daxil edilməsi"),
        admin,
    )
    assert reopened_fp.status == "OPEN"
    assert reopened_fp.reopened_at is not None
    assert "düzəliş sənədlərinin daxil edilməsi" in reopened_fp.reopen_reason

    # 6. OperationalLedgerAdapter: Bağlanmış dövrə düşən hadisə DeadLetter-ə yazılır və rədd edilir
    await service.close_fiscal_period(company_id, "2026-10", admin)
    adapter = OperationalLedgerAdapter(db_session)
    event_id = uuid.uuid4()
    ev = AccountingEvent(
        event_id=event_id,
        company_id=company_id,
        branch_id=branch_id,
        event_type="SALE_RECOGNIZED",
        source_type="sale",
        source_id=uuid.uuid4(),
        business_date=date(2026, 10, 10),
        net_amount=Decimal("100.0000"),
        tax_amount=Decimal("18.0000"),
        gross_amount=Decimal("118.0000"),
    )
    with pytest.raises(ConflictError):
        await adapter.post(ev)

    # 7. Dövr açılanda hadisə uğurla qeydə alınır və təkrar çağırış idempotent işləyir
    await service.reopen_fiscal_period(
        company_id,
        "2026-10",
        PeriodReopenRequest(reason="Hadisə inteqrasiyası"),
        admin,
    )
    res1 = await adapter.post(ev)
    assert res1.success is True
    res2 = await adapter.post(ev)
    assert res2.success is True

