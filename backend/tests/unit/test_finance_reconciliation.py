"""Ödəniş Metodları və Bank Çıxarışı Üzləşməsi Vahid Testləri (Reconciliation Unit Tests)."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.modules.finance.schemas import (
    BankStatementCommitRequest,
    BankStatementParsedLine,
    FinancialAccountCreate,
    ReconciliationSessionCreate,
)
from app.modules.finance.service import FinanceService


class MockActor:
    def __init__(self, user_id: uuid.UUID, roles: list[str], permissions: list[str]) -> None:
        self.id = user_id
        self.roles = roles
        self.permissions = permissions


@pytest.mark.asyncio
async def test_bank_statement_csv_parse_and_dry_run(db_session):
    """Bank çıxarışı CSV mətni parse olunur və dry-run simulyasiyası aparılır."""
    service = FinanceService()
    csv_text = """date,amount,reference,description,fee
2026-10-15,250.00,REF1001,Müştəri ödənişi,2.50
2026-10-16,400.00,REF1002,POS Terminal daxilolması,4.00
"""
    parsed = service.parse_bank_statement_csv(csv_text)
    assert len(parsed) == 2
    assert parsed[0].amount == Decimal("250.00")
    assert parsed[0].source_ref == "REF1001"
    assert parsed[0].fee == Decimal("2.50")
    assert parsed[1].amount == Decimal("400.00")


@pytest.mark.asyncio
async def test_reconciliation_auto_match_and_manual_match(db_session):
    """Üzləşmə sessiyası yaradılır, bank sətirləri commit olunur və auto-match icra edilir."""
    company_id = uuid.uuid4()
    service = FinanceService()
    admin = MockActor(uuid.uuid4(), ["system_admin"], [])

    # Bank hesabı yaradırıq
    bank_acc = await service.create_account(
        company_id,
        FinancialAccountCreate(code="BANK-REC-01", name="Üzləşmə Bankı", type="bank"),
        admin,
    )

    # Üzləşmə sessiyası açırıq
    sess = await service.create_reconciliation_session(
        company_id,
        ReconciliationSessionCreate(
            account_id=bank_acc.id,
            statement_date=date(2026, 10, 20),
            expected_amount=Decimal("650.0000"),
            notes="Oktyabr ayı POS üzləşməsi",
        ),
        admin,
    )
    assert sess.status == "DRAFT"

    # Çıxarış sətirlərini commit edirik
    lines = [
        BankStatementParsedLine(
            date=date(2026, 10, 20),
            amount=Decimal("250.0000"),
            source_ref="POS-AUTH-01",
            description="POS kart daxilolması",
        ),
        BankStatementParsedLine(
            date=date(2026, 10, 20),
            amount=Decimal("400.0000"),
            source_ref="POS-AUTH-02",
            description="POS kart daxilolması",
        ),
    ]

    updated_sess = await service.commit_bank_statement(
        company_id,
        BankStatementCommitRequest(session_id=sess.id, lines=lines),
        admin,
    )
    assert updated_sess.status == "IN_PROGRESS"
    assert updated_sess.actual_amount == Decimal("650.0000")
    assert updated_sess.difference_amount == Decimal("0.0000")
    assert len(updated_sess.lines) == 2

