"""Əməliyyat Mühasibat Adapteri (Operational Ledger Adapter - Default).

Bütün əməliyyat faktlarını (Gəlir tanınması, maya dəyəri, kassa hərəkətləri)
ikitərəfli mühasibat olmadan operativ hesabatlar üçün qeydə alır.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError
from app.modules.finance.models import DeadLetterPosting, OperationalPosting
from app.modules.finance.port import AccountingEvent, AccountingPort, PostingResult
from app.modules.finance.repository import FinanceRepository


class OperationalLedgerAdapter(AccountingPort):
    """Standart əməliyyat maliyyə faktları adapteri."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = FinanceRepository(session)

    async def post(self, event: AccountingEvent) -> PostingResult:
        # 1. Period Yoxlanışı: Bağlanmış dövrə qeyd vurmaq qadağandır
        period_str = event.business_date.strftime("%Y-%m")
        fiscal_period = await self.repo.get_fiscal_period(event.company_id, period_str)
        if fiscal_period and fiscal_period.status == "CLOSED":
            err = f"Bağlanmış maliyyə dövrünə ({period_str}) yeni əməliyyat qeydi aparıla bilməz."
            await self._record_dead_letter(event, err)
            raise ConflictError(message=err, code="PERIOD_CLOSED")

        # 2. İdempotentlik yoxlanışı
        consumer_name = "operational_ledger_adapter"
        if await self.repo.is_event_processed(event.event_id, consumer_name):
            return PostingResult(
                success=True,
                adapter_name="operational",
                event_id=event.event_id,
            )

        try:
            posting = OperationalPosting(
                id=uuid.uuid4(),
                company_id=event.company_id,
                event_id=event.event_id,
                event_type=event.event_type,
                branch_id=event.branch_id,
                business_date=event.business_date,
                net_amount=event.net_amount,
                tax_amount=event.tax_amount,
                cost_amount=event.cost_amount,
                gross_amount=event.gross_amount,
                source_type=event.source_type,
                source_id=event.source_id,
                details=event.details,
            )
            await self.repo.create_operational_posting(posting)
            await self.repo.mark_event_processed(event.event_id, consumer_name, "PROCESSED")

            return PostingResult(
                success=True,
                adapter_name="operational",
                event_id=event.event_id,
                posting_id=posting.id,
            )
        except Exception as exc:
            err_msg = str(exc)
            await self._record_dead_letter(event, err_msg)
            return PostingResult(
                success=False,
                adapter_name="operational",
                event_id=event.event_id,
                error_message=err_msg,
            )

    async def _record_dead_letter(self, event: AccountingEvent, error_message: str) -> None:
        dl = DeadLetterPosting(
            id=uuid.uuid4(),
            company_id=event.company_id,
            event_id=event.event_id,
            adapter="operational",
            error_message=error_message,
            payload={
                "event_type": event.event_type,
                "gross_amount": str(event.gross_amount),
                "business_date": str(event.business_date),
            },
        )
        await self.repo.record_dead_letter(dl)

