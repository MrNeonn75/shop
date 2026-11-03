"""İkitərəfli Baş Mühasibat Kitabı Adapteri (Double-Entry General Ledger Adapter).

Yalnız `finance.gl.enabled` parametri True olduqda işə düşür.
Hər bir hadisə üzrə balanslaşdırılmış (Debit == Credit) jurnal qeydləri generasiya edir.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import BusinessRuleViolationError, ConflictError
from app.modules.finance.models import (
    DeadLetterPosting,
    JournalEntry,
    JournalLine,
)
from app.modules.finance.port import AccountingEvent, AccountingPort, PostingResult
from app.modules.finance.repository import FinanceRepository
from app.modules.settings.service import SettingsService


class DoubleEntryGLAdapter(AccountingPort):
    """İkitərəfli Baş Kitab mühasibat adapteri."""

    def __init__(self, session: AsyncSession, settings_service: SettingsService | None = None) -> None:
        self.session = session
        self.repo = FinanceRepository(session)
        self.settings = settings_service or SettingsService()

    async def is_gl_enabled(self, _company_id: uuid.UUID) -> bool:
        """GL funksionallığının aktiv olub-olmadığını yoxlayır."""
        setting = await self.settings.get("finance_rules", session=self.session)
        if setting and isinstance(setting.value, dict):
            return bool(setting.value.get("gl_enabled", False))
        return False

    async def post(self, event: AccountingEvent) -> PostingResult:
        # 1. Feature Flag yoxlanışı
        if not await self.is_gl_enabled(event.company_id):
            raise BusinessRuleViolationError(
                code="NOT_ENABLED",
                message="Baş Mühasibat Kitabı (General Ledger) sistemi sazlamalarda deaktivdir (finance.gl.enabled=False).",
            )

        # 2. Period yoxlanışı: Bağlanmış dövrə qeyd vurula bilməz
        period_str = event.business_date.strftime("%Y-%m")
        fiscal_period = await self.repo.get_fiscal_period(event.company_id, period_str)
        if fiscal_period and fiscal_period.status == "CLOSED":
            err = f"Bağlanmış maliyyə dövrünə ({period_str}) yeni Baş Kitab jurnalı yazıla bilməz."
            await self._record_dead_letter(event, err)
            raise ConflictError(message=err, code="PERIOD_CLOSED")

        # 3. İdempotentlik yoxlanışı
        consumer_name = "double_entry_gl_adapter"
        if await self.repo.is_event_processed(event.event_id, consumer_name):
            return PostingResult(
                success=True,
                adapter_name="gl",
                event_id=event.event_id,
            )

        # 4. Posting Rules axtarışı
        rules = await self.repo.get_posting_rules_for_event(
            event.company_id, event.event_type, event.business_date
        )
        if not rules:
            err = f"'{event.event_type}' hadisəsi üçün aktiv mühasibat qaydası (Posting Rule) tapılmadı."
            await self._record_dead_letter(event, err)
            raise BusinessRuleViolationError(code="POSTING_RULE_INCOMPLETE", message=err)

        # 5. Jurnal sətirlərinin qurulması
        lines: list[JournalLine] = []
        total_debit = Decimal("0.0000")
        total_credit = Decimal("0.0000")

        for rule in rules:
            amt = Decimal("0.0000")
            if rule.amount_component == "net":
                amt = event.net_amount
            elif rule.amount_component == "tax":
                amt = event.tax_amount
            elif rule.amount_component == "cost":
                amt = event.cost_amount
            elif rule.amount_component == "gross":
                amt = event.gross_amount

            if amt > Decimal("0.0000"):
                debit_line = JournalLine(
                    id=uuid.uuid4(),
                    account_id=rule.debit_account_id,
                    debit=amt,
                    credit=Decimal("0.0000"),
                    memo=f"{event.event_type} - {rule.amount_component}",
                )
                credit_line = JournalLine(
                    id=uuid.uuid4(),
                    account_id=rule.credit_account_id,
                    debit=Decimal("0.0000"),
                    credit=amt,
                    memo=f"{event.event_type} - {rule.amount_component}",
                )
                lines.extend([debit_line, credit_line])
                total_debit += amt
                total_credit += amt

        if not lines or total_debit <= Decimal("0.0000"):
            # Məbləğ sıfırdırsa, qeyd aparılmır
            return PostingResult(success=True, adapter_name="gl", event_id=event.event_id)

        # 6. Balans yoxlanışı: Total Debit == Total Credit
        if total_debit != total_credit:
            err = f"Balanslaşdırılmamış jurnal qeydi! Debit: {total_debit}, Kredit: {total_credit}"
            await self._record_dead_letter(event, err)
            raise BusinessRuleViolationError(code="UNBALANCED_JOURNAL_ENTRY", message=err)

        try:
            entry_no = f"JE-{event.business_date.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"
            entry = JournalEntry(
                id=uuid.uuid4(),
                company_id=event.company_id,
                entry_no=entry_no,
                branch_id=event.branch_id,
                entry_date=event.business_date,
                source_type=event.source_type,
                source_id=event.source_id,
                event_id=event.event_id,
                memo=f"{event.event_type} avtomatik mühasibat qeydi",
                total_debit=total_debit,
                total_credit=total_credit,
                is_reversal=False,
                period=period_str,
            )
            await self.repo.create_journal_entry(entry, lines)
            await self.repo.mark_event_processed(event.event_id, consumer_name, "PROCESSED")

            return PostingResult(
                success=True,
                adapter_name="gl",
                event_id=event.event_id,
                posting_id=entry.id,
            )
        except Exception as exc:
            err_msg = str(exc)
            await self._record_dead_letter(event, err_msg)
            return PostingResult(
                success=False,
                adapter_name="gl",
                event_id=event.event_id,
                error_message=err_msg,
            )

    async def _record_dead_letter(self, event: AccountingEvent, error_message: str) -> None:
        dl = DeadLetterPosting(
            id=uuid.uuid4(),
            company_id=event.company_id,
            event_id=event.event_id,
            adapter="gl",
            error_message=error_message,
            payload={
                "event_type": event.event_type,
                "gross_amount": str(event.gross_amount),
                "business_date": str(event.business_date),
            },
        )
        await self.repo.record_dead_letter(dl)

