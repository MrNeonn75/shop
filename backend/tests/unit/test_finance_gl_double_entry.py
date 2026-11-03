"""İkitərəfli Baş Mühasibat Kitabı (General Ledger) Vahid Testləri."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.errors import BusinessRuleViolationError
from app.modules.finance.models import JournalEntry
from app.modules.finance.schemas import (
    GLAccountCreate,
    JournalEntryCreate,
    JournalLineInput,
)
from app.modules.finance.service import FinanceService
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
async def test_gl_disabled_by_default_returns_not_enabled(db_session):
    """GL standart olaraq deaktivdir (finance.gl.enabled=False); bütün GL əməliyyatları NOT_ENABLED qaytarır."""
    company_id = uuid.uuid4()
    service = FinanceService()
    admin = MockActor(uuid.uuid4(), ["system_admin"], [])

    # GL deaktiv ikən jurnal qeydi yaratmaq cəhdi
    with pytest.raises(BusinessRuleViolationError) as exc:
        await service.create_journal_entry(
            company_id,
            JournalEntryCreate(
                entry_date=date.today(),
                memo="Test qeyd",
                lines=[
                    JournalLineInput(account_id=uuid.uuid4(), debit=Decimal("100.00"), credit=Decimal("0.00")),
                    JournalLineInput(account_id=uuid.uuid4(), debit=Decimal("0.00"), credit=Decimal("100.00")),
                ],
            ),
            admin,
        )
    assert exc.value.code == "NOT_ENABLED"

    # GL deaktiv ikən Trial Balance sorğusu
    with pytest.raises(BusinessRuleViolationError) as exc2:
        await service.get_trial_balance(company_id, actor=admin)
    assert exc2.value.code == "NOT_ENABLED"


@pytest.mark.asyncio
async def test_gl_enabled_balanced_journal_and_trial_balance_zero_net(db_session):
    """GL aktiv olduqda: Balanslaşdırılmış jurnal yazılır və Trial Balance xalis fərqi 0.00 AZN olur."""
    company_id = uuid.uuid4()
    settings_service = MockSettingsService(
        {
            "finance_rules": {
                "gl_enabled": True,
                "credit_sales_enabled": True,
                "costing_method": "FIFO",
            }
        }
    )
    service = FinanceService(settings_service=settings_service)
    admin = MockActor(uuid.uuid4(), ["system_admin"], [])

    # İki hesab yaradırıq: Kassa (Aktiv) və Gəlir (Gəlir)
    cash_acc = await service.create_gl_account(
        company_id,
        GLAccountCreate(code="1010", name="Filial Kassası", account_type="asset"),
        admin,
    )
    rev_acc = await service.create_gl_account(
        company_id,
        GLAccountCreate(code="4000", name="Satış Gəliri", account_type="revenue"),
        admin,
    )

    # Balanslaşdırılmış jurnal qeydi vururuq (Debet 500 AZN, Kredit 500 AZN)
    entry = await service.create_journal_entry(
        company_id,
        JournalEntryCreate(
            entry_date=date.today(),
            memo="Gündəlik kassa satışı jurnalı",
            lines=[
                JournalLineInput(account_id=cash_acc.id, debit=Decimal("500.0000"), credit=Decimal("0.0000")),
                JournalLineInput(account_id=rev_acc.id, debit=Decimal("0.0000"), credit=Decimal("500.0000")),
            ],
        ),
        admin,
    )
    assert entry.total_debit == Decimal("500.0000")
    assert entry.total_credit == Decimal("500.0000")

    # Trial Balance sorğulayırıq
    tb = await service.get_trial_balance(company_id, actor=admin)
    assert tb.is_balanced is True
    assert tb.total_debits == Decimal("500.00")
    assert tb.total_credits == Decimal("500.00")
    assert tb.difference == Decimal("0.00")


@pytest.mark.asyncio
async def test_service_unbalanced_journal_rejected(db_session):
    """Servis səviyyəsində debet != kredit olan qeydlər dərhal UNBALANCED_JOURNAL_ENTRY ilə rədd edilir."""
    company_id = uuid.uuid4()
    settings_service = MockSettingsService({"finance_rules": {"gl_enabled": True}})
    service = FinanceService(settings_service=settings_service)
    admin = MockActor(uuid.uuid4(), ["system_admin"], [])

    acc1 = await service.create_gl_account(
        company_id, GLAccountCreate(code="1020", name="Bank", account_type="asset"), admin
    )
    acc2 = await service.create_gl_account(
        company_id, GLAccountCreate(code="6000", name="İcarə", account_type="expense"), admin
    )

    # Debet: 100, Kredit: 90 (Fərq var!)
    with pytest.raises(BusinessRuleViolationError) as exc:
        await service.create_journal_entry(
            company_id,
            JournalEntryCreate(
                entry_date=date.today(),
                memo="Balanssız qeyd",
                lines=[
                    JournalLineInput(account_id=acc1.id, debit=Decimal("100.00"), credit=Decimal("0.00")),
                    JournalLineInput(account_id=acc2.id, debit=Decimal("0.00"), credit=Decimal("90.00")),
                ],
            ),
            admin,
        )
    assert exc.value.code == "UNBALANCED_JOURNAL_ENTRY"


@pytest.mark.asyncio
async def test_db_level_constraint_violates_when_unbalanced_entry_inserted(db_session):
    """Verilənlər bazası CheckConstraint səviyyəsində total_debit != total_credit olduqda IntegrityError atılır."""
    company_id = uuid.uuid4()
    unbalanced_entry = JournalEntry(
        id=uuid.uuid4(),
        company_id=company_id,
        entry_no="JE-TEST-UNBALANCED",
        entry_date=date.today(),
        source_type="manual",
        memo="Sınaq balanssız qeyd",
        total_debit=Decimal("100.0000"),
        total_credit=Decimal("80.0000"),  # FƏRQ!
        period="2026-10",
    )

    db_session.add(unbalanced_entry)
    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_gl_adapter_post_lifecycle_and_rules(db_session):
    """DoubleEntryGLAdapter: Feature flag, Period Closed, Missing Rules və Uğurlu Posting testləri."""
    from app.core.errors import ConflictError
    from app.modules.finance.gl_adapter import DoubleEntryGLAdapter
    from app.modules.finance.models import FiscalPeriod, GLAccount, PostingRule
    from app.modules.finance.port import AccountingEvent

    company_id = uuid.uuid4()
    branch_id = uuid.uuid4()
    b_date = date(2026, 10, 15)

    # 1. Feature Flag = False olduqda
    disabled_settings = MockSettingsService({"finance_rules": {"gl_enabled": False}})
    adapter = DoubleEntryGLAdapter(db_session, settings_service=disabled_settings)
    event = AccountingEvent(
        event_id=uuid.uuid4(),
        event_type="SALE_COMPLETED",
        company_id=company_id,
        branch_id=branch_id,
        business_date=b_date,
        gross_amount=Decimal("100.00"),
        net_amount=Decimal("100.00"),
    )
    with pytest.raises(BusinessRuleViolationError) as exc1:
        await adapter.post(event)
    assert exc1.value.code == "NOT_ENABLED"

    # 2. Feature Flag = True, amma Period Bağlıdır (CLOSED)
    enabled_settings = MockSettingsService({"finance_rules": {"gl_enabled": True}})
    adapter_enabled = DoubleEntryGLAdapter(db_session, settings_service=enabled_settings)
    period = FiscalPeriod(
        id=uuid.uuid4(),
        company_id=company_id,
        period="2026-10",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 31),
        status="CLOSED",
        closed_at=datetime.now(UTC),
    )
    db_session.add(period)
    await db_session.flush()

    with pytest.raises(ConflictError) as exc2:
        await adapter_enabled.post(event)
    assert exc2.value.code == "PERIOD_CLOSED"

    # 3. Period Açıqdır, amma Posting Rule yoxdur
    period.status = "OPEN"
    await db_session.flush()

    with pytest.raises(BusinessRuleViolationError) as exc3:
        await adapter_enabled.post(event)
    assert exc3.value.code == "POSTING_RULE_INCOMPLETE"

    # 4. Posting Rule əlavə olunur və uğurlu balanslaşdırılmış jurnal qeydə alınır
    acc_debit = GLAccount(
        id=uuid.uuid4(),
        company_id=company_id,
        code="1010-POST",
        name="Kassa",
        account_type="asset",
    )
    acc_credit = GLAccount(
        id=uuid.uuid4(),
        company_id=company_id,
        code="4000-POST",
        name="Gəlir",
        account_type="revenue",
    )
    db_session.add_all([acc_debit, acc_credit])
    await db_session.flush()

    rule = PostingRule(
        id=uuid.uuid4(),
        company_id=company_id,
        event_type="SALE_COMPLETED",
        amount_component="net",
        debit_account_id=acc_debit.id,
        credit_account_id=acc_credit.id,
        effective_from=date(2026, 1, 1),
        is_active=True,
    )
    db_session.add(rule)
    await db_session.flush()

    res = await adapter_enabled.post(event)
    assert res.success is True
    assert res.posting_id is not None

    # Təkrar eyni event göndəriləndə idempotent qayıtmalıdır
    res2 = await adapter_enabled.post(event)
    assert res2.success is True

