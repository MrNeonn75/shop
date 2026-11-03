"""Maliyyə Modulu Repozitori Qatı (Finance Repository)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import utc_now
from app.modules.finance.models import (
    AccountTransaction,
    AccountTransfer,
    Budget,
    BudgetRevision,
    CustomerPayment,
    CustomerPaymentAllocation,
    CustomerReceivableInvoice,
    DeadLetterPosting,
    Expense,
    ExpenseAllocation,
    ExpenseCategory,
    FinancialAccount,
    FiscalPeriod,
    GLAccount,
    IncomeCategory,
    JournalEntry,
    JournalLine,
    OperationalPosting,
    OtherIncome,
    PostingRule,
    ReceivableWriteOff,
    ReconciliationLine,
    ReconciliationSession,
    RecurringExpenseTemplate,
)
from app.shared.outbox import ProcessedEvent


class FinanceRepository:
    """Maliyyə modulu verilənlər bazası əməliyyatları."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ==========================================
    # 1. ACCOUNTS & BALANCES
    # ==========================================

    async def get_account(self, account_id: uuid.UUID) -> FinancialAccount | None:
        stmt = select(FinancialAccount).where(FinancialAccount.id == account_id)
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def get_account_by_code(self, company_id: uuid.UUID, code: str) -> FinancialAccount | None:
        stmt = select(FinancialAccount).where(
            and_(FinancialAccount.company_id == company_id, FinancialAccount.code == code)
        )
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def list_accounts(
        self,
        company_id: uuid.UUID,
        branch_id: uuid.UUID | None = None,
        type_: str | None = None,
        status: str | None = "active",
    ) -> list[FinancialAccount]:
        stmt = select(FinancialAccount).where(FinancialAccount.company_id == company_id)
        if branch_id is not None:
            stmt = stmt.where(FinancialAccount.branch_id == branch_id)
        if type_ is not None:
            stmt = stmt.where(FinancialAccount.type == type_)
        if status is not None:
            stmt = stmt.where(FinancialAccount.status == status)
        stmt = stmt.order_by(FinancialAccount.code.asc())
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def create_account(self, account: FinancialAccount) -> FinancialAccount:
        self.session.add(account)
        await self.session.flush()
        return account

    async def get_derived_balance(
        self, account_id: uuid.UUID, as_of: datetime | None = None
    ) -> Decimal:
        """Append-only jurnaldan cari və ya tarixi balansı hesablayır: sum(IN) - sum(OUT)."""
        expr = case(
            (AccountTransaction.direction == "IN", AccountTransaction.amount),
            (AccountTransaction.direction == "OUT", -AccountTransaction.amount),
            else_=Decimal("0.0000"),
        )
        stmt = select(func.coalesce(func.sum(expr), Decimal("0.0000"))).where(
            AccountTransaction.account_id == account_id
        )
        if as_of is not None:
            stmt = stmt.where(AccountTransaction.occurred_at <= as_of)
        res = await self.session.execute(stmt)
        val = res.scalar_one_or_none()
        return Decimal(str(val or "0.0000"))

    # ==========================================
    # 2. TRANSACTIONS & TRANSFERS
    # ==========================================

    async def create_transaction(self, tx: AccountTransaction) -> AccountTransaction:
        self.session.add(tx)
        await self.session.flush()
        return tx

    async def list_transactions(
        self,
        account_id: uuid.UUID,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[AccountTransaction]:
        stmt = select(AccountTransaction).where(AccountTransaction.account_id == account_id)
        if start_date is not None:
            stmt = stmt.where(AccountTransaction.occurred_at >= start_date)
        if end_date is not None:
            stmt = stmt.where(AccountTransaction.occurred_at <= end_date)
        stmt = stmt.order_by(AccountTransaction.occurred_at.desc()).limit(limit).offset(offset)
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def create_transfer(self, transfer: AccountTransfer) -> AccountTransfer:
        self.session.add(transfer)
        await self.session.flush()
        return transfer

    async def get_transfer_by_no(self, company_id: uuid.UUID, transfer_no: str) -> AccountTransfer | None:
        stmt = select(AccountTransfer).where(
            and_(AccountTransfer.company_id == company_id, AccountTransfer.transfer_no == transfer_no)
        )
        res = await self.session.execute(stmt)
        return res.scalars().first()

    # ==========================================
    # 3. RECONCILIATIONS
    # ==========================================

    async def create_reconciliation_session(self, sess: ReconciliationSession) -> ReconciliationSession:
        self.session.add(sess)
        await self.session.flush()
        return sess

    async def get_reconciliation_session(self, session_id: uuid.UUID) -> ReconciliationSession | None:
        stmt = (
            select(ReconciliationSession)
            .where(ReconciliationSession.id == session_id)
            .options(selectinload(ReconciliationSession.lines))
        )
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def list_reconciliation_sessions(
        self, company_id: uuid.UUID, account_id: uuid.UUID | None = None, status: str | None = None
    ) -> list[ReconciliationSession]:
        stmt = select(ReconciliationSession).where(ReconciliationSession.company_id == company_id)
        if account_id is not None:
            stmt = stmt.where(ReconciliationSession.account_id == account_id)
        if status is not None:
            stmt = stmt.where(ReconciliationSession.status == status)
        stmt = stmt.order_by(ReconciliationSession.statement_date.desc())
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def add_reconciliation_lines(self, lines: list[ReconciliationLine]) -> None:
        self.session.add_all(lines)
        await self.session.flush()

    async def get_reconciliation_line(self, line_id: uuid.UUID) -> ReconciliationLine | None:
        stmt = select(ReconciliationLine).where(ReconciliationLine.id == line_id)
        res = await self.session.execute(stmt)
        return res.scalars().first()

    # ==========================================
    # 4. CATEGORIES
    # ==========================================

    async def create_expense_category(self, cat: ExpenseCategory) -> ExpenseCategory:
        self.session.add(cat)
        await self.session.flush()
        return cat

    async def get_expense_category(self, cat_id: uuid.UUID) -> ExpenseCategory | None:
        stmt = select(ExpenseCategory).where(ExpenseCategory.id == cat_id)
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def get_expense_category_by_code(self, company_id: uuid.UUID, code: str) -> ExpenseCategory | None:
        stmt = select(ExpenseCategory).where(
            and_(ExpenseCategory.company_id == company_id, ExpenseCategory.code == code)
        )
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def list_expense_categories(self, company_id: uuid.UUID) -> list[ExpenseCategory]:
        stmt = (
            select(ExpenseCategory)
            .where(ExpenseCategory.company_id == company_id)
            .order_by(ExpenseCategory.code.asc())
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def create_income_category(self, cat: IncomeCategory) -> IncomeCategory:
        self.session.add(cat)
        await self.session.flush()
        return cat

    async def get_income_category(self, cat_id: uuid.UUID) -> IncomeCategory | None:
        stmt = select(IncomeCategory).where(IncomeCategory.id == cat_id)
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def list_income_categories(self, company_id: uuid.UUID) -> list[IncomeCategory]:
        stmt = (
            select(IncomeCategory)
            .where(IncomeCategory.company_id == company_id)
            .order_by(IncomeCategory.code.asc())
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    # ==========================================
    # 5. EXPENSES & ALLOCATIONS
    # ==========================================

    async def create_expense(self, expense: Expense) -> Expense:
        self.session.add(expense)
        await self.session.flush()
        return expense

    async def get_expense(self, expense_id: uuid.UUID) -> Expense | None:
        stmt = (
            select(Expense)
            .where(Expense.id == expense_id)
            .options(selectinload(Expense.category), selectinload(Expense.allocations))
        )
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def get_expense_by_no(self, company_id: uuid.UUID, expense_no: str) -> Expense | None:
        stmt = (
            select(Expense)
            .where(and_(Expense.company_id == company_id, Expense.expense_no == expense_no))
            .options(selectinload(Expense.category), selectinload(Expense.allocations))
        )
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def list_expenses(
        self,
        company_id: uuid.UUID,
        branch_id: uuid.UUID | None = None,
        category_id: uuid.UUID | None = None,
        status: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[Expense]:
        stmt = select(Expense).where(Expense.company_id == company_id)
        if branch_id is not None:
            stmt = stmt.where(Expense.branch_id == branch_id)
        if category_id is not None:
            stmt = stmt.where(Expense.category_id == category_id)
        if status is not None:
            stmt = stmt.where(Expense.status == status)
        if start_date is not None:
            stmt = stmt.where(Expense.expense_date >= start_date)
        if end_date is not None:
            stmt = stmt.where(Expense.expense_date <= end_date)
        stmt = stmt.options(selectinload(Expense.category), selectinload(Expense.allocations))
        stmt = stmt.order_by(Expense.expense_date.desc(), Expense.created_at.desc())
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def add_expense_allocations(self, allocations: list[ExpenseAllocation]) -> None:
        self.session.add_all(allocations)
        await self.session.flush()

    async def create_recurring_template(
        self, template: RecurringExpenseTemplate
    ) -> RecurringExpenseTemplate:
        self.session.add(template)
        await self.session.flush()
        return template

    async def list_recurring_templates(
        self, company_id: uuid.UUID, is_active: bool = True
    ) -> list[RecurringExpenseTemplate]:
        stmt = select(RecurringExpenseTemplate).where(
            and_(
                RecurringExpenseTemplate.company_id == company_id,
                RecurringExpenseTemplate.is_active == is_active,
            )
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def create_other_income(self, income: OtherIncome) -> OtherIncome:
        self.session.add(income)
        await self.session.flush()
        return income

    async def list_other_incomes(
        self,
        company_id: uuid.UUID,
        branch_id: uuid.UUID | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[OtherIncome]:
        stmt = select(OtherIncome).where(OtherIncome.company_id == company_id)
        if branch_id is not None:
            stmt = stmt.where(OtherIncome.branch_id == branch_id)
        if start_date is not None:
            stmt = stmt.where(OtherIncome.income_date >= start_date)
        if end_date is not None:
            stmt = stmt.where(OtherIncome.income_date <= end_date)
        stmt = stmt.order_by(OtherIncome.income_date.desc())
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    # ==========================================
    # 6. CUSTOMER RECEIVABLES
    # ==========================================

    async def create_receivable_invoice(
        self, invoice: CustomerReceivableInvoice
    ) -> CustomerReceivableInvoice:
        self.session.add(invoice)
        await self.session.flush()
        return invoice

    async def get_receivable_invoice(self, invoice_id: uuid.UUID) -> CustomerReceivableInvoice | None:
        stmt = (
            select(CustomerReceivableInvoice)
            .where(CustomerReceivableInvoice.id == invoice_id)
            .options(selectinload(CustomerReceivableInvoice.allocations))
        )
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def list_receivable_invoices(
        self,
        company_id: uuid.UUID,
        customer_id: uuid.UUID | None = None,
        branch_id: uuid.UUID | None = None,
        status: str | None = None,
    ) -> list[CustomerReceivableInvoice]:
        stmt = select(CustomerReceivableInvoice).where(CustomerReceivableInvoice.company_id == company_id)
        if customer_id is not None:
            stmt = stmt.where(CustomerReceivableInvoice.customer_id == customer_id)
        if branch_id is not None:
            stmt = stmt.where(CustomerReceivableInvoice.branch_id == branch_id)
        if status is not None:
            stmt = stmt.where(CustomerReceivableInvoice.status == status)
        stmt = stmt.order_by(CustomerReceivableInvoice.due_date.asc())
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def create_customer_payment(self, payment: CustomerPayment) -> CustomerPayment:
        self.session.add(payment)
        await self.session.flush()
        return payment

    async def add_payment_allocations(self, allocs: list[CustomerPaymentAllocation]) -> None:
        self.session.add_all(allocs)
        await self.session.flush()

    async def create_write_off(self, write_off: ReceivableWriteOff) -> ReceivableWriteOff:
        self.session.add(write_off)
        await self.session.flush()
        return write_off

    # ==========================================
    # 7. BUDGETS
    # ==========================================

    async def create_budget(self, budget: Budget) -> Budget:
        self.session.add(budget)
        await self.session.flush()
        return budget

    async def get_budget(self, budget_id: uuid.UUID) -> Budget | None:
        stmt = (
            select(Budget)
            .where(Budget.id == budget_id)
            .options(selectinload(Budget.revisions))
        )
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def get_budget_by_period_category(
        self, company_id: uuid.UUID, period: str, category_id: uuid.UUID, branch_id: uuid.UUID | None
    ) -> Budget | None:
        stmt = select(Budget).where(
            and_(
                Budget.company_id == company_id,
                Budget.period == period,
                Budget.category_id == category_id,
                Budget.branch_id == branch_id,
            )
        )
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def list_budgets(
        self, company_id: uuid.UUID, period: str | None = None, branch_id: uuid.UUID | None = None
    ) -> list[Budget]:
        stmt = select(Budget).where(Budget.company_id == company_id)
        if period is not None:
            stmt = stmt.where(Budget.period == period)
        if branch_id is not None:
            stmt = stmt.where(Budget.branch_id == branch_id)
        stmt = stmt.options(selectinload(Budget.revisions))
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def add_budget_revision(self, rev: BudgetRevision) -> None:
        self.session.add(rev)
        await self.session.flush()

    # ==========================================
    # 8. FISCAL PERIODS
    # ==========================================

    async def create_fiscal_period(self, fp: FiscalPeriod) -> FiscalPeriod:
        self.session.add(fp)
        await self.session.flush()
        return fp

    async def get_fiscal_period(self, company_id: uuid.UUID, period: str) -> FiscalPeriod | None:
        stmt = select(FiscalPeriod).where(
            and_(FiscalPeriod.company_id == company_id, FiscalPeriod.period == period)
        )
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def get_period_for_date(self, company_id: uuid.UUID, target_date: date) -> FiscalPeriod | None:
        stmt = select(FiscalPeriod).where(
            and_(
                FiscalPeriod.company_id == company_id,
                FiscalPeriod.start_date <= target_date,
                FiscalPeriod.end_date >= target_date,
            )
        )
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def list_fiscal_periods(self, company_id: uuid.UUID) -> list[FiscalPeriod]:
        stmt = select(FiscalPeriod).where(FiscalPeriod.company_id == company_id).order_by(FiscalPeriod.period.desc())
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    # ==========================================
    # 9. IDEMPOTENT EVENTS & OPERATIONAL POSTING
    # ==========================================

    async def is_event_processed(self, event_id: uuid.UUID, consumer_name: str) -> bool:
        stmt = select(ProcessedEvent.id).where(
            and_(ProcessedEvent.event_id == event_id, ProcessedEvent.consumer_name == consumer_name)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none() is not None

    async def mark_event_processed(
        self,
        event_id: uuid.UUID,
        consumer_name: str,
        status: str = "PROCESSED",
        error_message: str | None = None,
    ) -> ProcessedEvent:
        pe = ProcessedEvent(
            id=uuid.uuid4(),
            event_id=event_id,
            consumer_name=consumer_name,
            status=status,
            error_message=error_message,
            processed_at=utc_now(),
        )
        self.session.add(pe)
        await self.session.flush()
        return pe

    async def create_operational_posting(self, posting: OperationalPosting) -> OperationalPosting:
        self.session.add(posting)
        await self.session.flush()
        return posting

    async def get_operational_postings(
        self,
        company_id: uuid.UUID,
        start_date: date | None = None,
        end_date: date | None = None,
        branch_id: uuid.UUID | None = None,
        event_type: str | None = None,
    ) -> list[OperationalPosting]:
        stmt = select(OperationalPosting).where(OperationalPosting.company_id == company_id)
        if start_date is not None:
            stmt = stmt.where(OperationalPosting.business_date >= start_date)
        if end_date is not None:
            stmt = stmt.where(OperationalPosting.business_date <= end_date)
        if branch_id is not None:
            stmt = stmt.where(OperationalPosting.branch_id == branch_id)
        if event_type is not None:
            stmt = stmt.where(OperationalPosting.event_type == event_type)
        stmt = stmt.order_by(OperationalPosting.business_date.asc())
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    # ==========================================
    # 10. GENERAL LEDGER
    # ==========================================

    async def create_gl_account(self, acc: GLAccount) -> GLAccount:
        self.session.add(acc)
        await self.session.flush()
        return acc

    async def get_gl_account(self, acc_id: uuid.UUID) -> GLAccount | None:
        stmt = select(GLAccount).where(GLAccount.id == acc_id)
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def get_gl_account_by_code(self, company_id: uuid.UUID, code: str) -> GLAccount | None:
        stmt = select(GLAccount).where(and_(GLAccount.company_id == company_id, GLAccount.code == code))
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def list_gl_accounts(self, company_id: uuid.UUID) -> list[GLAccount]:
        stmt = select(GLAccount).where(GLAccount.company_id == company_id).order_by(GLAccount.code.asc())
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def create_journal_entry(
        self, entry: JournalEntry, lines: list[JournalLine]
    ) -> JournalEntry:
        self.session.add(entry)
        await self.session.flush()
        for ln in lines:
            ln.journal_entry_id = entry.id
            self.session.add(ln)
        await self.session.flush()
        return entry

    async def get_journal_entry(self, entry_id: uuid.UUID) -> JournalEntry | None:
        stmt = (
            select(JournalEntry)
            .where(JournalEntry.id == entry_id)
            .options(selectinload(JournalEntry.lines).selectinload(JournalLine.account))
        )
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def list_journal_entries(
        self, company_id: uuid.UUID, period: str | None = None, branch_id: uuid.UUID | None = None
    ) -> list[JournalEntry]:
        stmt = select(JournalEntry).where(JournalEntry.company_id == company_id)
        if period is not None:
            stmt = stmt.where(JournalEntry.period == period)
        if branch_id is not None:
            stmt = stmt.where(JournalEntry.branch_id == branch_id)
        stmt = stmt.options(selectinload(JournalEntry.lines).selectinload(JournalLine.account))
        stmt = stmt.order_by(JournalEntry.entry_date.desc(), JournalEntry.created_at.desc())
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def create_posting_rule(self, rule: PostingRule) -> PostingRule:
        self.session.add(rule)
        await self.session.flush()
        return rule

    async def get_posting_rules_for_event(
        self, company_id: uuid.UUID, event_type: str, on_date: date
    ) -> list[PostingRule]:
        stmt = select(PostingRule).where(
            and_(
                PostingRule.company_id == company_id,
                PostingRule.event_type == event_type,
                PostingRule.is_active == True,  # noqa: E712
                PostingRule.effective_from <= on_date,
                (PostingRule.effective_to == None) | (PostingRule.effective_to >= on_date),  # noqa: E711
            )
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def list_all_active_posting_rules(self, company_id: uuid.UUID) -> list[PostingRule]:
        stmt = select(PostingRule).where(
            and_(PostingRule.company_id == company_id, PostingRule.is_active == True)  # noqa: E712
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def get_trial_balance(
        self, company_id: uuid.UUID, as_of_date: date, period: str | None = None
    ) -> list[dict[str, Any]]:
        """Bütün hesablar üzrə debet və kredit cəmlərini və xalis qalığı qaytarır."""
        stmt = (
            select(
                GLAccount.id.label("account_id"),
                GLAccount.code.label("account_code"),
                GLAccount.name.label("account_name"),
                GLAccount.account_type.label("account_type"),
                func.coalesce(func.sum(JournalLine.debit), Decimal("0.0000")).label("debit_total"),
                func.coalesce(func.sum(JournalLine.credit), Decimal("0.0000")).label("credit_total"),
            )
            .select_from(GLAccount)
            .outerjoin(JournalLine, JournalLine.account_id == GLAccount.id)
            .outerjoin(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .where(GLAccount.company_id == company_id)
        )
        if period is not None:
            stmt = stmt.where(JournalEntry.period == period)
        else:
            stmt = stmt.where(JournalEntry.entry_date <= as_of_date)
        stmt = stmt.group_by(GLAccount.id, GLAccount.code, GLAccount.name, GLAccount.account_type)
        stmt = stmt.order_by(GLAccount.code.asc())
        res = await self.session.execute(stmt)
        rows = []
        for r in res.all():
            deb = Decimal(str(r.debit_total or "0.0000"))
            cred = Decimal(str(r.credit_total or "0.0000"))
            # Asset & Expense: net = deb - cred; Liability, Equity, Revenue: net = cred - deb
            net = deb - cred if r.account_type in ("asset", "expense") else cred - deb
            rows.append(
                {
                    "account_id": r.account_id,
                    "account_code": r.account_code,
                    "account_name": r.account_name,
                    "account_type": r.account_type,
                    "debit_total": deb,
                    "credit_total": cred,
                    "net_balance": net,
                }
            )
        return rows

    async def record_dead_letter(self, dl: DeadLetterPosting) -> DeadLetterPosting:
        self.session.add(dl)
        await self.session.flush()
        return dl

