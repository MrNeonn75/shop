"""Maliyyə Hesabları və Dəyişməz Jurnal Vahid Testləri (Accounts & Ledger Unit Tests)."""

from __future__ import annotations

import random
import uuid
from datetime import UTC, datetime
from decimal import Decimal

import pytest

from app.core.errors import BusinessRuleViolationError, ConflictError
from app.modules.finance.models import AccountTransaction, FinancialAccount
from app.modules.finance.repository import FinanceRepository
from app.modules.finance.schemas import AccountTransferRequest, FinancialAccountCreate
from app.modules.finance.service import FinanceService


class MockActor:
    def __init__(self, user_id: uuid.UUID, roles: list[str], permissions: list[str]) -> None:
        self.id = user_id
        self.roles = roles
        self.permissions = permissions


@pytest.mark.asyncio
async def test_account_creation_and_balance_derivation(db_session):
    """Maliyyə hesabı yaranır və balansı append-only jurnaldan hesablanır (no editable balance column)."""
    company_id = uuid.uuid4()
    service = FinanceService()
    admin = MockActor(uuid.uuid4(), ["system_admin"], [])

    data = FinancialAccountCreate(
        code="ACC-CASH-01",
        name="Baş Kassa",
        type="cash",
        sub_type="cash_office",
        currency="AZN",
    )
    acc = await service.create_account(company_id, data, admin)
    assert acc.code == "ACC-CASH-01"

    # Təkrar eyni kodla yaratmaq xəta verməlidir
    with pytest.raises(ConflictError):
        await service.create_account(company_id, data, admin)

    # İlkin balans 0 olmalıdır
    bal = await service.get_account_balance(acc.id, admin)
    assert bal == Decimal("0.0000")

    # Açılış qalığı əlavə edirik (IN 500 AZN)
    tx = await service.record_opening_balance(company_id, acc.id, Decimal("500.0000"), admin)
    assert tx.amount == Decimal("500.0000")

    bal_after = await service.get_account_balance(acc.id, admin)
    assert bal_after == Decimal("500.0000")


@pytest.mark.asyncio
async def test_property_based_ledger_integrity_under_random_sequences(db_session):
    """Jurnal dürüstlüyü: Təsadüfi ardıcıllıqla vurulan IN/OUT əməliyyatların cəmi derived balansa bərabərdir."""
    company_id = uuid.uuid4()
    repo = FinanceRepository(db_session)

    acc = FinancialAccount(
        id=uuid.uuid4(),
        company_id=company_id,
        code="ACC-RANDOM-01",
        name="Təsadüfi Test Hesabı",
        type="bank",
        sub_type="bank_current",
        currency="AZN",
        status="active",
        account_details={},
    )
    await repo.create_account(acc)

    expected_sum = Decimal("0.0000")
    now = datetime.now(UTC)

    # 30 təsadüfi əməliyyat icra edirik
    for _ in range(30):
        direction = random.choice(["IN", "OUT"])
        amount = Decimal(str(random.randint(10, 500))) + Decimal("0.5000")
        tx = AccountTransaction(
            id=uuid.uuid4(),
            company_id=company_id,
            account_id=acc.id,
            direction=direction,
            amount=amount,
            occurred_at=now,
            source_type="random_test",
        )
        await repo.create_transaction(tx)
        if direction == "IN":
            expected_sum += amount
        else:
            expected_sum -= amount

    derived_balance = await repo.get_derived_balance(acc.id)
    assert derived_balance == expected_sum


@pytest.mark.asyncio
async def test_account_transfers_always_net_to_zero(db_session):
    """Hesablararası köçürmələrdə sistem üzrə xalis fərq hər zaman sıfır olur (Transfers net to zero)."""
    company_id = uuid.uuid4()
    service = FinanceService()
    admin = MockActor(uuid.uuid4(), ["system_admin"], ["finance.cash.transfer"])

    # İki hesab yaradırıq: Kassa və Bank
    acc1 = await service.create_account(
        company_id,
        FinancialAccountCreate(code="CASH-BRANCH-01", name="Filial Kassası", type="cash"),
        admin,
    )
    acc2 = await service.create_account(
        company_id,
        FinancialAccountCreate(code="BANK-MAIN-01", name="Əsas Bank Hesabı", type="bank"),
        admin,
    )

    # Kassaya 1000 AZN mədaxil
    await service.record_opening_balance(company_id, acc1.id, Decimal("1000.0000"), admin)

    # 400 AZN köçürmə (Kassa -> Bank)
    trf_req = AccountTransferRequest(
        source_account_id=acc1.id,
        destination_account_id=acc2.id,
        amount=Decimal("400.0000"),
        fee_amount=Decimal("0.0000"),
        memo="Kassadan banka depozit",
    )
    trf = await service.execute_transfer(company_id, trf_req, admin)
    assert trf.status == "COMPLETED"

    bal1 = await service.get_account_balance(acc1.id, admin)
    bal2 = await service.get_account_balance(acc2.id, admin)

    assert bal1 == Decimal("600.0000")
    assert bal2 == Decimal("400.0000")

    # İki hesabın cəmi ilkin məbləğə tam bərabərdir (1000.0000 AZN)
    assert (bal1 + bal2) == Decimal("1000.0000")


@pytest.mark.asyncio
async def test_transfer_insufficient_cash_fails(db_session):
    """Kassada kifayət qədər vəsait olmadıqda köçürmə rədd edilir."""
    company_id = uuid.uuid4()
    service = FinanceService()
    admin = MockActor(uuid.uuid4(), ["system_admin"], ["finance.cash.transfer"])

    acc1 = await service.create_account(
        company_id,
        FinancialAccountCreate(code="CASH-LOW-01", name="Boş Kassa", type="cash"),
        admin,
    )
    acc2 = await service.create_account(
        company_id,
        FinancialAccountCreate(code="BANK-TARGET-01", name="Hədəf Bank", type="bank"),
        admin,
    )

    # Balans 0 olduğu halda 100 AZN köçürmə cəhdi
    trf_req = AccountTransferRequest(
        source_account_id=acc1.id,
        destination_account_id=acc2.id,
        amount=Decimal("100.0000"),
    )
    with pytest.raises(BusinessRuleViolationError) as exc_info:
        await service.execute_transfer(company_id, trf_req, admin)
    assert "kifayət qədər vəsait yoxdur" in str(exc_info.value)

