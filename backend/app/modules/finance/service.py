"""Maliyyə Modulu Mərkəzi Xidməti (Finance Service).

Maliyyə hesabları, pul köçürmələri, xərclər, xərc bölgüsü, dövri xərclər,
nisyə satışlar, büdcələr, dövr nəzarəti və Baş Kitab (GL) əməliyyatlarını orkestrləşdirir.
"""

from __future__ import annotations

import csv
import io
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from app.core.database import utc_now
from app.core.errors import (
    BusinessRuleViolationError,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.core.money import Money
from app.core.uow import UnitOfWork
from app.modules.finance.models import (
    AccountTransaction,
    AccountTransfer,
    Budget,
    BudgetRevision,
    CustomerPayment,
    CustomerPaymentAllocation,
    CustomerReceivableInvoice,
    Expense,
    ExpenseCategory,
    FinancialAccount,
    FiscalPeriod,
    GLAccount,
    JournalEntry,
    JournalLine,
    ReconciliationLine,
    ReconciliationSession,
    RecurringExpenseTemplate,
)
from app.modules.finance.operational_adapter import OperationalLedgerAdapter
from app.modules.finance.policies import FinancePolicy
from app.modules.finance.port import AccountingEvent
from app.modules.finance.repository import FinanceRepository
from app.modules.finance.schemas import (
    AccountTransferRequest,
    BankStatementCommitRequest,
    BankStatementDryRunResponse,
    BankStatementParsedLine,
    BudgetCreate,
    BudgetUpdate,
    BudgetVarianceItem,
    BudgetVarianceResponse,
    CustomerPaymentCreate,
    CustomerReceivableInvoiceCreate,
    ExpenseAllocationItem,
    ExpenseCreate,
    ExpensePayRequest,
    ExpenseReverseRequest,
    FinancialAccountCreate,
    GLAccountCreate,
    JournalEntryCreate,
    ManualMatchRequest,
    PeriodCloseChecklistResponse,
    PeriodReopenRequest,
    ReconciliationSessionCreate,
    RecurringTemplateCreate,
    SharedCostAllocationPreviewResponse,
    SharedCostPreviewRequest,
    TrialBalanceLine,
    TrialBalanceResponse,
)
from app.modules.numbering.service import NumberingService
from app.modules.settings.service import SettingsService


class FinanceService:
    """Maliyyə əməliyyatları üzrə mərkəzi biznes xidməti."""

    def __init__(
        self,
        settings_service: SettingsService | None = None,
        numbering_service: NumberingService | None = None,
    ) -> None:
        self.settings = settings_service or SettingsService()
        self.numbering = numbering_service or NumberingService()

    # ==========================================
    # 1. ACCOUNTS & BALANCES
    # ==========================================

    async def create_account(
        self, company_id: uuid.UUID, data: FinancialAccountCreate, actor: Any = None
    ) -> FinancialAccount:
        FinancePolicy.check_can_manage_account(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            existing = await repo.get_account_by_code(company_id, data.code)
            if existing:
                raise ConflictError(f"'{data.code}' kodlu maliyyə hesabı artıq mövcuddur.")

            acc = FinancialAccount(
                id=uuid.uuid4(),
                company_id=company_id,
                code=data.code,
                name=data.name,
                type=data.type,
                sub_type=data.sub_type,
                currency=data.currency,
                branch_id=data.branch_id,
                status="active",
                account_details=data.account_details,
            )
            await repo.create_account(acc)
            await uow.commit()
            return acc

    async def get_account(self, account_id: uuid.UUID, actor: Any = None) -> FinancialAccount:
        FinancePolicy.check_can_view_account(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            acc = await repo.get_account(account_id)
            if not acc:
                raise NotFoundError("Maliyyə hesabı tapılmadı.")
            return acc

    async def list_accounts(
        self,
        company_id: uuid.UUID,
        branch_id: uuid.UUID | None = None,
        type_: str | None = None,
        status: str | None = "active",
        actor: Any = None,
    ) -> list[FinancialAccount]:
        FinancePolicy.check_can_view_account(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            return await repo.list_accounts(company_id, branch_id, type_, status)

    async def get_account_balance(self, account_id: uuid.UUID, actor: Any = None) -> Decimal:
        FinancePolicy.check_can_view_account(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            return await repo.get_derived_balance(account_id)

    async def list_account_transactions(
        self,
        account_id: uuid.UUID,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        limit: int = 100,
        offset: int = 0,
        actor: Any = None,
    ) -> list[AccountTransaction]:
        FinancePolicy.check_can_view_account(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            acc = await repo.get_account(account_id)
            if not acc:
                raise NotFoundError("Maliyyə hesabı tapılmadı.")
            return await repo.list_transactions(account_id, start_date, end_date, limit, offset)

    async def execute_transfer(
        self, company_id: uuid.UUID, data: AccountTransferRequest, actor: Any = None
    ) -> AccountTransfer:
        FinancePolicy.check_can_transfer(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            source_acc = await repo.get_account(data.source_account_id)
            dest_acc = await repo.get_account(data.destination_account_id)
            if not source_acc or not dest_acc:
                raise NotFoundError("Mənbə və ya təyinat maliyyə hesabı tapılmadı.")
            if source_acc.status != "active" or dest_acc.status != "active":
                raise BusinessRuleViolationError("Deaktiv hesablar üzrə köçürmə aparıla bilməz.")
            if source_acc.id == dest_acc.id:
                raise BusinessRuleViolationError("Eyni hesab daxilində köçürmə aparıla bilməz.")

            occurred = data.occurred_at or utc_now()

            # Period yoxlanışı
            period_str = occurred.strftime("%Y-%m")
            fp = await repo.get_fiscal_period(company_id, period_str)
            if fp and fp.status == "CLOSED":
                raise ConflictError(f"Bağlanmış dövrə ({period_str}) pul köçürməsi qeydə alına bilməz.", code="PERIOD_CLOSED")

            # Mənbə hesabda kifayət qədər qalıq olmalıdır
            bal = await repo.get_derived_balance(source_acc.id)
            total_required = data.amount + data.fee_amount
            if bal < total_required and source_acc.type == "cash":
                raise BusinessRuleViolationError(
                    f"Kassada kifayət qədər vəsait yoxdur. Cari qalıq: {bal}, Tələb olunan: {total_required}"
                )

            transfer_no = f"TRF-{occurred.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"

            # 1. OUT əməliyyatı (Mənbə hesabdan çıxış)
            out_tx = AccountTransaction(
                id=uuid.uuid4(),
                company_id=company_id,
                account_id=source_acc.id,
                direction="OUT",
                amount=data.amount,
                occurred_at=occurred,
                source_type="transfer",
                memo=f"Köçürmə {dest_acc.name} hesabına ({transfer_no})",
                created_by=getattr(actor, "id", None),
            )
            await repo.create_transaction(out_tx)

            # 2. IN əməliyyatı (Təyinat hesaba mədaxil)
            in_tx = AccountTransaction(
                id=uuid.uuid4(),
                company_id=company_id,
                account_id=dest_acc.id,
                direction="IN",
                amount=data.amount,
                occurred_at=occurred,
                source_type="transfer",
                memo=f"Mədaxil {source_acc.name} hesabından ({transfer_no})",
                created_by=getattr(actor, "id", None),
            )
            await repo.create_transaction(in_tx)

            # 3. Komissiya haqqı varsa
            if data.fee_amount > Decimal("0.0000"):
                fee_tx = AccountTransaction(
                    id=uuid.uuid4(),
                    company_id=company_id,
                    account_id=source_acc.id,
                    direction="OUT",
                    amount=data.fee_amount,
                    occurred_at=occurred,
                    source_type="bank_fee",
                    memo=f"Köçürmə komissiyası ({transfer_no})",
                    created_by=getattr(actor, "id", None),
                )
                await repo.create_transaction(fee_tx)

            transfer = AccountTransfer(
                id=uuid.uuid4(),
                company_id=company_id,
                transfer_no=transfer_no,
                source_account_id=source_acc.id,
                destination_account_id=dest_acc.id,
                amount=data.amount,
                fee_amount=data.fee_amount,
                fee_category_id=data.fee_category_id,
                occurred_at=occurred,
                source_type="manual",
                status="COMPLETED",
                memo=data.memo,
                out_tx_id=out_tx.id,
                in_tx_id=in_tx.id,
                created_by=getattr(actor, "id", uuid.uuid4()),
            )
            await repo.create_transfer(transfer)
            await uow.commit()
            return transfer

    async def record_opening_balance(
        self,
        company_id: uuid.UUID,
        account_id: uuid.UUID,
        amount: Decimal,
        actor: Any = None,
        memo: str = "Açılış qalığı",
    ) -> AccountTransaction:
        FinancePolicy.check_can_manage_account(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            acc = await repo.get_account(account_id)
            if not acc:
                raise NotFoundError("Maliyyə hesabı tapılmadı.")

            tx = AccountTransaction(
                id=uuid.uuid4(),
                company_id=company_id,
                account_id=acc.id,
                direction="IN",
                amount=amount,
                occurred_at=utc_now(),
                source_type="opening_balance",
                memo=memo,
                created_by=getattr(actor, "id", None),
            )
            await repo.create_transaction(tx)
            await uow.commit()
            return tx

    # ==========================================
    # 2. RECONCILIATIONS
    # ==========================================

    async def create_reconciliation_session(
        self, company_id: uuid.UUID, data: ReconciliationSessionCreate, actor: Any = None
    ) -> ReconciliationSession:
        FinancePolicy.check_can_run_reconciliation(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            session_no = f"REC-{data.statement_date.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"
            sess = ReconciliationSession(
                id=uuid.uuid4(),
                company_id=company_id,
                account_id=data.account_id,
                session_no=session_no,
                statement_date=data.statement_date,
                tender_type=data.tender_type,
                status="DRAFT",
                expected_amount=data.expected_amount,
                actual_amount=Decimal("0.0000"),
                difference_amount=-data.expected_amount,
                notes=data.notes,
                created_by=getattr(actor, "id", uuid.uuid4()),
                lines=[],
            )
            await repo.create_reconciliation_session(sess)
            await uow.commit()
            return sess

    def parse_bank_statement_csv(self, csv_content: str) -> list[BankStatementParsedLine]:
        """Bank çıxarışı CSV mətnini parse edir."""
        reader = csv.DictReader(io.StringIO(csv_content))
        lines: list[BankStatementParsedLine] = []
        for row in reader:
            try:
                dt_str = row.get("date") or row.get("Date") or row.get("tarix") or ""
                amt_str = row.get("amount") or row.get("Amount") or row.get("mebleg") or "0"
                ref_str = row.get("reference") or row.get("Reference") or row.get("ref") or None
                desc_str = row.get("description") or row.get("Description") or None
                fee_str = row.get("fee") or row.get("Fee") or "0"

                d = date.fromisoformat(dt_str.strip())
                amt = Decimal(amt_str.strip())
                fee = Decimal(fee_str.strip())

                lines.append(
                    BankStatementParsedLine(
                        date=d,
                        amount=amt,
                        source_ref=ref_str,
                        description=desc_str,
                        fee=fee,
                    )
                )
            except Exception as e:
                raise ValidationError(f"CSV formatında səhv sətir: {e}") from e
        return lines

    async def dry_run_bank_statement(
        self, session_id: uuid.UUID, lines: list[BankStatementParsedLine], actor: Any = None
    ) -> BankStatementDryRunResponse:
        FinancePolicy.check_can_run_reconciliation(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            sess = await repo.get_reconciliation_session(session_id)
            if not sess:
                raise NotFoundError("Üzləşmə sessiyası tapılmadı.")

            total_statement = sum(ln.amount for ln in lines)
            total_fees = sum(ln.fee for ln in lines)
            candidate_matched = 0

            # Sistem sətirləri ilə müqayisə simulyasiyası
            for sln in lines:
                for sys_ln in sess.lines:
                    if (
                        sys_ln.line_type == "system_expected"
                        and sys_ln.match_state == "unmatched"
                        and sys_ln.amount == sln.amount
                    ):
                        candidate_matched += 1
                        break

            return BankStatementDryRunResponse(
                total_parsed_lines=len(lines),
                total_statement_amount=total_statement,
                candidate_matched_count=candidate_matched,
                unmatched_count=len(lines) - candidate_matched,
                estimated_fees=total_fees,
                sample_lines=lines[:5],
            )

    async def commit_bank_statement(
        self, _company_id: uuid.UUID, data: BankStatementCommitRequest, actor: Any = None
    ) -> ReconciliationSession:
        FinancePolicy.check_can_run_reconciliation(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            sess = await repo.get_reconciliation_session(data.session_id)
            if not sess:
                raise NotFoundError("Üzləşmə sessiyası tapılmadı.")
            if sess.status == "COMPLETED":
                raise BusinessRuleViolationError("Bağlanmış üzləşmə sessiyasına yeni sətirlər əlavə edilə bilməz.")

            db_lines: list[ReconciliationLine] = []
            actual_sum = sess.actual_amount

            for sln in data.lines:
                rec_ln = ReconciliationLine(
                    id=uuid.uuid4(),
                    session_id=sess.id,
                    line_type="bank_statement",
                    source_ref=sln.source_ref,
                    amount=sln.amount,
                    occurred_at=datetime(sln.date.year, sln.date.month, sln.date.day),
                    match_state="unmatched",
                    notes=sln.description,
                )
                db_lines.append(rec_ln)
                actual_sum += sln.amount

            await repo.add_reconciliation_lines(db_lines)
            sess.lines.extend(db_lines)

            # Auto-Match alqoritmi: Məbləğ və ya Reference üzrə avtomatik bağlama
            for st_ln in db_lines:
                for sys_ln in sess.lines:
                    if (
                        sys_ln.line_type == "system_expected"
                        and sys_ln.match_state == "unmatched"
                        and sys_ln.amount == st_ln.amount
                    ):
                        st_ln.match_state = "matched"
                        st_ln.matched_line_id = sys_ln.id
                        sys_ln.match_state = "matched"
                        sys_ln.matched_line_id = st_ln.id
                        break

            sess.actual_amount = actual_sum
            sess.difference_amount = actual_sum - sess.expected_amount
            sess.status = "IN_PROGRESS"
            await uow.commit()
            return sess

    async def manual_match(
        self, session_id: uuid.UUID, data: ManualMatchRequest, actor: Any = None
    ) -> ReconciliationSession:
        FinancePolicy.check_can_run_reconciliation(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            sess = await repo.get_reconciliation_session(session_id)
            if not sess:
                raise NotFoundError("Üzləşmə sessiyası tapılmadı.")

            sys_ln = await repo.get_reconciliation_line(data.system_line_id)
            st_ln = await repo.get_reconciliation_line(data.statement_line_id)
            if not sys_ln or not st_ln:
                raise NotFoundError("Üzləşmə sətirləri tapılmadı.")

            sys_ln.match_state = "matched"
            sys_ln.matched_line_id = st_ln.id
            st_ln.match_state = "matched"
            st_ln.matched_line_id = sys_ln.id

            await uow.commit()
            return sess

    # ==========================================
    # 3. EXPENSES & ALLOCATIONS
    # ==========================================

    async def create_expense_category(
        self, company_id: uuid.UUID, code: str, name: str, parent_id: uuid.UUID | None = None, actor: Any = None
    ) -> ExpenseCategory:
        FinancePolicy.check_can_manage_budget(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            cat = ExpenseCategory(
                id=uuid.uuid4(),
                company_id=company_id,
                code=code,
                name=name,
                parent_id=parent_id,
            )
            await repo.create_expense_category(cat)
            await uow.commit()
            return cat

    async def list_expense_categories(self, company_id: uuid.UUID, _actor: Any = None) -> list[ExpenseCategory]:
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            return await repo.list_expense_categories(company_id)

    async def create_expense(
        self, company_id: uuid.UUID, data: ExpenseCreate, actor: Any = None
    ) -> Expense:
        FinancePolicy.check_can_create_expense(actor)
        FinancePolicy.validate_attachments([a.model_dump() for a in data.attachments])

        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            # Period yoxlanışı
            period_str = data.expense_date.strftime("%Y-%m")
            fp = await repo.get_fiscal_period(company_id, period_str)
            if fp and fp.status == "CLOSED":
                raise ConflictError(f"Bağlanmış maliyyə dövrünə ({period_str}) xərc sənədi əlavə edilə bilməz.", code="PERIOD_CLOSED")

            cat = await repo.get_expense_category(data.category_id)
            if not cat:
                raise NotFoundError("Xərc kateqoriyası tapılmadı.")

            net = data.gross_amount - data.tax_amount
            expense_no = f"EXP-{data.expense_date.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"

            expense = Expense(
                id=uuid.uuid4(),
                company_id=company_id,
                expense_no=expense_no,
                branch_id=data.branch_id,
                category_id=data.category_id,
                supplier_id=data.supplier_id,
                gross_amount=data.gross_amount,
                tax_amount=data.tax_amount,
                net_amount=net,
                tax_rate=data.tax_rate,
                payment_account_id=data.payment_account_id,
                expense_date=data.expense_date,
                description=data.description,
                attachments=[a.model_dump() for a in data.attachments],
                status="DRAFT",
                created_by=getattr(actor, "id", uuid.uuid4()),
                allocations=[],
            )
            await repo.create_expense(expense)
            await uow.commit()
            return expense

    async def approve_expense(self, expense_id: uuid.UUID, actor: Any = None) -> Expense:
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            expense = await repo.get_expense(expense_id)
            if not expense:
                raise NotFoundError("Xərc sənədi tapılmadı.")
            if expense.status != "SUBMITTED" and expense.status != "DRAFT":
                raise BusinessRuleViolationError(f"'{expense.status}' statuslu xərc təsdiqlənə bilməz.")

            # SoD yoxlanışı
            FinancePolicy.check_can_approve_expense(actor, expense.created_by)

            expense.status = "APPROVED"
            await uow.commit()
            return expense

    async def pay_expense(
        self, expense_id: uuid.UUID, data: ExpensePayRequest, actor: Any = None
    ) -> Expense:
        FinancePolicy.check_can_pay_expense(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            expense = await repo.get_expense(expense_id)
            if not expense:
                raise NotFoundError("Xərc sənədi tapılmadı.")
            if expense.status != "APPROVED":
                raise BusinessRuleViolationError("Yalnız təsdiqlənmiş (APPROVED) xərclər ödənilə bilər.")

            acc = await repo.get_account(data.payment_account_id)
            if not acc or acc.status != "active":
                raise NotFoundError("Ödəniş maliyyə hesabı tapılmadı və ya aktiv deyil.")

            paid_dt = data.paid_at or utc_now()

            # Period yoxlanışı
            period_str = paid_dt.strftime("%Y-%m")
            fp = await repo.get_fiscal_period(expense.company_id, period_str)
            if fp and fp.status == "CLOSED":
                raise ConflictError(f"Bağlanmış dövrə ({period_str}) xərc ödənişi vurula bilməz.", code="PERIOD_CLOSED")

            # 1. Hesabdan çıxış əməliyyatı (OUT)
            tx = AccountTransaction(
                id=uuid.uuid4(),
                company_id=expense.company_id,
                account_id=acc.id,
                direction="OUT",
                amount=expense.gross_amount,
                occurred_at=paid_dt,
                source_type="expense_payment",
                source_id=expense.id,
                memo=f"Xərc ödənişi: {expense.expense_no} ({expense.description[:50]})",
                created_by=getattr(actor, "id", None),
            )
            await repo.create_transaction(tx)

            expense.status = "PAID"
            expense.paid_at = paid_dt
            expense.paid_by = getattr(actor, "id", None)
            expense.payment_account_id = acc.id
            expense.account_transaction_id = tx.id

            # 2. Əməliyyat mühasibatlığına post edirik
            adapter = OperationalLedgerAdapter(uow.session)
            await adapter.post(
                AccountingEvent(
                    event_id=expense.id,
                    event_type="EXPENSE_PAID",
                    company_id=expense.company_id,
                    branch_id=expense.branch_id,
                    business_date=paid_dt.date(),
                    gross_amount=expense.gross_amount,
                    net_amount=expense.net_amount,
                    tax_amount=expense.tax_amount,
                    source_type="expense",
                    source_id=expense.id,
                )
            )

            await uow.commit()
            return expense

    async def reverse_expense(
        self, expense_id: uuid.UUID, data: ExpenseReverseRequest, actor: Any = None
    ) -> Expense:
        FinancePolicy.check_can_reverse_expense(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            orig_expense = await repo.get_expense(expense_id)
            if not orig_expense:
                raise NotFoundError("Xərc sənədi tapılmadı.")
            if orig_expense.status != "PAID":
                raise BusinessRuleViolationError("Yalnız ödənilmiş (PAID) xərclər kompensasiya ilə ləğv edilə bilər.")

            now = utc_now()

            # 1. Hesaba pulun geri qaytarılması (IN)
            rev_tx = AccountTransaction(
                id=uuid.uuid4(),
                company_id=orig_expense.company_id,
                account_id=orig_expense.payment_account_id,
                direction="IN",
                amount=orig_expense.gross_amount,
                occurred_at=now,
                source_type="expense_reversal",
                source_id=orig_expense.id,
                memo=f"Ləğv kompensasiyası: {orig_expense.expense_no}. Səbəb: {data.reason}",
                created_by=getattr(actor, "id", None),
            )
            await repo.create_transaction(rev_tx)

            # 2. Kompensasiya xərc sənədi
            rev_expense_no = f"REV-{orig_expense.expense_no}"
            rev_expense = Expense(
                id=uuid.uuid4(),
                company_id=orig_expense.company_id,
                expense_no=rev_expense_no,
                branch_id=orig_expense.branch_id,
                category_id=orig_expense.category_id,
                supplier_id=orig_expense.supplier_id,
                gross_amount=orig_expense.gross_amount,
                tax_amount=orig_expense.tax_amount,
                net_amount=orig_expense.net_amount,
                payment_account_id=orig_expense.payment_account_id,
                expense_date=now.date(),
                description=f"LƏĞV: {orig_expense.expense_no}. Səbəb: {data.reason}",
                status="REVERSED",
                reversal_of_id=orig_expense.id,
                reversal_reason=data.reason,
                paid_at=now,
                paid_by=getattr(actor, "id", None),
                account_transaction_id=rev_tx.id,
                created_by=getattr(actor, "id", uuid.uuid4()),
                allocations=[],
            )
            await repo.create_expense(rev_expense)

            orig_expense.status = "REVERSED"
            orig_expense.reversal_reason = data.reason
            await uow.commit()
            return rev_expense

    def preview_shared_cost_allocation(
        self, branches: list[uuid.UUID], data: SharedCostPreviewRequest
    ) -> SharedCostAllocationPreviewResponse:
        """Mərkəzi xərcin filiallar arasında Largest-Remainder bölgüsü."""
        if not branches:
            raise ValidationError("Bölgü üçün ən azı bir filial mövcud olmalıdır.")

        money = Money(data.total_amount)
        n = len(branches)

        ratios: list[int | Decimal]
        if data.allocation_method == "equal":
            ratios = [Decimal("1")] * n
        elif data.allocation_method == "fixed_percentages" and data.custom_branch_weights:
            ratios = [data.custom_branch_weights.get(str(b), Decimal("0")) for b in branches]
        else:
            ratios = [Decimal("1")] * n

        allocated_moneys = money.allocate(ratios)
        allocations = []
        for b_id, m, r in zip(branches, allocated_moneys, ratios, strict=False):
            allocations.append(
                ExpenseAllocationItem(
                    branch_id=b_id,
                    ratio=r,
                    allocated_amount=m.amount,
                    allocation_method=data.allocation_method,
                )
            )

        return SharedCostAllocationPreviewResponse(
            total_amount=data.total_amount,
            allocation_method=data.allocation_method,
            allocations=allocations,
        )

    async def create_recurring_template(
        self, company_id: uuid.UUID, data: RecurringTemplateCreate, actor: Any = None
    ) -> RecurringExpenseTemplate:
        FinancePolicy.check_can_create_expense(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            tmpl = RecurringExpenseTemplate(
                id=uuid.uuid4(),
                company_id=company_id,
                template_name=data.template_name,
                branch_id=data.branch_id,
                category_id=data.category_id,
                supplier_id=data.supplier_id,
                amount=data.amount,
                tax_amount=data.tax_amount,
                day_of_month=data.day_of_month,
                description=data.description,
                is_active=True,
            )
            await repo.create_recurring_template(tmpl)
            await uow.commit()
            return tmpl

    async def generate_recurring_expenses(self, company_id: uuid.UUID | None = None) -> int:
        """Dövri xərclərdən DRAFT xərclər formalaşdırır (HEÇ VAXT auto-pay etmir)."""
        count = 0
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            templates = await repo.list_recurring_templates(company_id=company_id or uuid.uuid4())
            today = utc_now().date()

            for t in templates:
                net = t.amount - t.tax_amount
                expense_no = f"EXP-REC-{today.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"
                exp = Expense(
                    id=uuid.uuid4(),
                    company_id=t.company_id,
                    expense_no=expense_no,
                    branch_id=t.branch_id,
                    category_id=t.category_id,
                    supplier_id=t.supplier_id,
                    gross_amount=t.amount,
                    tax_amount=t.tax_amount,
                    net_amount=net,
                    expense_date=today,
                    description=f"[Dövrü] {t.template_name}: {t.description}",
                    status="DRAFT",
                    created_by=uuid.UUID("00000000-0000-0000-0000-000000000001"),  # system actor
                )
                await repo.create_expense(exp)
                t.last_generated_at = utc_now()
                count += 1

            await uow.commit()
        return count

    # ==========================================
    # 4. CUSTOMER RECEIVABLES
    # ==========================================

    async def is_credit_sales_enabled(self, _company_id: uuid.UUID) -> bool:
        setting = await self.settings.get("finance_rules")
        if setting and isinstance(setting.value, dict):
            return bool(setting.value.get("credit_sales_enabled", False))
        return False

    async def create_receivable_invoice(
        self, company_id: uuid.UUID, data: CustomerReceivableInvoiceCreate, _actor: Any = None
    ) -> CustomerReceivableInvoice:
        if not await self.is_credit_sales_enabled(company_id):
            raise BusinessRuleViolationError(
                code="FEATURE_DISABLED",
                message="Korporativ nisyə satışlar və müştəri borcları sistemi sazlamalarda deaktivdir.",
            )

        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            invoice_no = f"REC-INV-{data.issue_date.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"
            inv = CustomerReceivableInvoice(
                id=uuid.uuid4(),
                company_id=company_id,
                invoice_no=invoice_no,
                customer_id=data.customer_id,
                branch_id=data.branch_id,
                sale_id=data.sale_id,
                issue_date=data.issue_date,
                due_date=data.due_date,
                total_amount=data.total_amount,
                paid_amount=Decimal("0.0000"),
                status="UNPAID",
            )
            await repo.create_receivable_invoice(inv)
            await uow.commit()
            return inv

    async def record_customer_payment(
        self, company_id: uuid.UUID, data: CustomerPaymentCreate, actor: Any = None
    ) -> CustomerPayment:
        if not await self.is_credit_sales_enabled(company_id):
            raise BusinessRuleViolationError(
                code="FEATURE_DISABLED",
                message="Korporativ nisyə satışlar və müştəri borcları sistemi sazlamalarda deaktivdir.",
            )

        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            acc = await repo.get_account(data.payment_account_id)
            if not acc or acc.status != "active":
                raise NotFoundError("Ödəniş maliyyə hesabı tapılmadı.")

            now = utc_now()
            payment_no = f"CPMT-{data.payment_date.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"

            # 1. Pulun hesaba daxil olması (IN)
            tx = AccountTransaction(
                id=uuid.uuid4(),
                company_id=company_id,
                account_id=acc.id,
                direction="IN",
                amount=data.amount,
                occurred_at=now,
                source_type="customer_payment",
                memo=f"Müştəri borc ödənişi: {payment_no}",
                created_by=getattr(actor, "id", None),
            )
            await repo.create_transaction(tx)

            payment = CustomerPayment(
                id=uuid.uuid4(),
                company_id=company_id,
                payment_no=payment_no,
                customer_id=data.customer_id,
                payment_account_id=acc.id,
                amount=data.amount,
                payment_date=data.payment_date,
                reference=data.reference,
                status="COMPLETED",
                account_transaction_id=tx.id,
                created_by=getattr(actor, "id", uuid.uuid4()),
            )
            await repo.create_customer_payment(payment)

            # 2. Qaimələr üzrə təyinat (allocation)
            remaining_payment = data.amount
            if data.invoice_allocations:
                for alloc_req in data.invoice_allocations:
                    inv_id = uuid.UUID(str(alloc_req["invoice_id"]))
                    inv = await repo.get_receivable_invoice(inv_id)
                    if inv:
                        alloc_amt = Decimal(str(alloc_req["amount"]))
                        inv.paid_amount += alloc_amt
                        if inv.paid_amount >= inv.total_amount:
                            inv.status = "PAID"
                        else:
                            inv.status = "PARTIALLY_PAID"

                        alloc = CustomerPaymentAllocation(
                            id=uuid.uuid4(),
                            payment_id=payment.id,
                            invoice_id=inv.id,
                            allocated_amount=alloc_amt,
                        )
                        await repo.add_payment_allocations([alloc])
            else:
                # Avtomatik FIFO ardıcıllığı ilə ən köhnə qaimələrə bölüşdürülür
                unpaid_invoices = await repo.list_receivable_invoices(
                    company_id=company_id, customer_id=data.customer_id, status="UNPAID"
                )
                for inv in unpaid_invoices:
                    if remaining_payment <= Decimal("0.0000"):
                        break
                    outstanding = inv.total_amount - inv.paid_amount
                    alloc_amt = min(remaining_payment, outstanding)
                    inv.paid_amount += alloc_amt
                    if inv.paid_amount >= inv.total_amount:
                        inv.status = "PAID"
                    else:
                        inv.status = "PARTIALLY_PAID"

                    alloc = CustomerPaymentAllocation(
                        id=uuid.uuid4(),
                        payment_id=payment.id,
                        invoice_id=inv.id,
                        allocated_amount=alloc_amt,
                    )
                    await repo.add_payment_allocations([alloc])
                    remaining_payment -= alloc_amt

            await uow.commit()
            return payment

    # ==========================================
    # 5. BUDGETS
    # ==========================================

    async def create_budget(
        self, company_id: uuid.UUID, data: BudgetCreate, actor: Any = None
    ) -> Budget:
        FinancePolicy.check_can_manage_budget(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            existing = await repo.get_budget_by_period_category(
                company_id, data.period, data.category_id, data.branch_id
            )
            if existing:
                raise ConflictError("Bu kateqoriya və dövr üçün büdcə artıq mövcuddur.")

            b = Budget(
                id=uuid.uuid4(),
                company_id=company_id,
                period=data.period,
                branch_id=data.branch_id,
                category_id=data.category_id,
                amount=data.amount,
                status="DRAFT",
                created_by=getattr(actor, "id", uuid.uuid4()),
            )
            await repo.create_budget(b)
            await uow.commit()
            return b

    async def update_budget(
        self, budget_id: uuid.UUID, data: BudgetUpdate, actor: Any = None
    ) -> Budget:
        FinancePolicy.check_can_manage_budget(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            b = await repo.get_budget(budget_id)
            if not b:
                raise NotFoundError("Büdcə tapılmadı.")
            if b.status == "LOCKED":
                raise BusinessRuleViolationError("Bağlanmış dövrün büdcəsi dəyişdirilə bilməz.")

            prev_amt = b.amount
            b.amount = data.amount
            b.version += 1

            rev = BudgetRevision(
                id=uuid.uuid4(),
                budget_id=b.id,
                version=b.version,
                previous_amount=prev_amt,
                new_amount=data.amount,
                reason=data.reason,
                revised_by=getattr(actor, "id", uuid.uuid4()),
            )
            await repo.add_budget_revision(rev)
            await uow.commit()
            return b

    async def approve_budget(self, budget_id: uuid.UUID, actor: Any = None) -> Budget:
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            b = await repo.get_budget(budget_id)
            if not b:
                raise NotFoundError("Büdcə tapılmadı.")

            # SoD yoxlanışı
            FinancePolicy.check_can_approve_budget(actor, b.created_by)

            b.status = "APPROVED"
            b.approved_by = getattr(actor, "id", None)
            await uow.commit()
            return b

    async def list_budgets(
        self,
        company_id: uuid.UUID,
        period: str | None = None,
        branch_id: uuid.UUID | None = None,
        actor: Any = None,
    ) -> list[Budget]:
        FinancePolicy.check_can_manage_budget(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            return await repo.list_budgets(company_id, period=period, branch_id=branch_id)

    async def get_budget_variance(
        self, company_id: uuid.UUID, period: str, branch_id: uuid.UUID | None = None
    ) -> BudgetVarianceResponse:
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            budgets = await repo.list_budgets(company_id, period=period, branch_id=branch_id)
            categories = await repo.list_expense_categories(company_id)
            cat_map = {c.id: c.name for c in categories}

            # Faktiki xərclər
            try:
                parts = period.split("-")
                year = int(parts[0])
                month = int(parts[1])
                if not (1 <= month <= 12):
                    raise ValueError
                start_date = date(year, month, 1)
                end_date = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
            except (ValueError, IndexError):
                raise ValidationError("Dövr formatı YYYY-MM olmalıdır (məsələn: 2026-05).") from None

            expenses = await repo.list_expenses(
                company_id=company_id,
                branch_id=branch_id,
                status="PAID",
                start_date=start_date,
                end_date=end_date,
            )

            actual_by_cat: dict[uuid.UUID, Decimal] = {}
            for e in expenses:
                actual_by_cat[e.category_id] = actual_by_cat.get(e.category_id, Decimal("0.0000")) + e.net_amount

            items: list[BudgetVarianceItem] = []
            tot_budget = Decimal("0.0000")
            tot_actual = Decimal("0.0000")

            for b in budgets:
                act = actual_by_cat.get(b.category_id, Decimal("0.0000"))
                var_amt = b.amount - act
                var_pct = (
                    ((act - b.amount) / b.amount * Decimal("100.00"))
                    if b.amount > Decimal("0.0000")
                    else Decimal("0.0000")
                )
                items.append(
                    BudgetVarianceItem(
                        category_id=b.category_id,
                        category_name=cat_map.get(b.category_id, "Digər"),
                        budgeted_amount=b.amount,
                        actual_amount=act,
                        variance_amount=var_amt,
                        variance_percent=var_pct.quantize(Decimal("0.01")),
                    )
                )
                tot_budget += b.amount
                tot_actual += act

            return BudgetVarianceResponse(
                period=period,
                branch_id=branch_id,
                total_budget=tot_budget,
                total_actual=tot_actual,
                total_variance=tot_budget - tot_actual,
                items=items,
            )

    # ==========================================
    # 6. FISCAL PERIOD CONTROL
    # ==========================================

    async def create_fiscal_period(
        self, company_id: uuid.UUID, period_str: str, start_date: date, end_date: date, actor: Any = None
    ) -> FiscalPeriod:
        FinancePolicy.check_can_close_period(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            existing = await repo.get_fiscal_period(company_id, period_str)
            if existing:
                raise ConflictError(f"'{period_str}' maliyyə dövrü artıq mövcuddur.")

            fp = FiscalPeriod(
                id=uuid.uuid4(),
                company_id=company_id,
                period=period_str,
                start_date=start_date,
                end_date=end_date,
                status="OPEN",
            )
            await repo.create_fiscal_period(fp)
            await uow.commit()
            return fp

    async def get_period_close_checklist(
        self, company_id: uuid.UUID, period_str: str
    ) -> PeriodCloseChecklistResponse:
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            # Pending xərclər
            expenses = await repo.list_expenses(company_id=company_id)
            pending_exp = [e for e in expenses if e.status in ("DRAFT", "SUBMITTED")]

            # Üzləşməsi bitməmiş sessiyalar
            sessions = await repo.list_reconciliation_sessions(company_id=company_id)
            unreconciled = [s for s in sessions if s.status != "COMPLETED"]

            can_close = len(pending_exp) == 0 and len(unreconciled) == 0

            return PeriodCloseChecklistResponse(
                period=period_str,
                can_close=can_close,
                unclosed_shifts_count=0,
                pending_approvals_count=len(pending_exp),
                unreconciled_sessions_count=len(unreconciled),
                unmatched_bank_lines_count=0,
                details={
                    "pending_expenses": [e.expense_no for e in pending_exp[:5]],
                    "unreconciled_sessions": [s.session_no for s in unreconciled[:5]],
                },
            )

    async def close_fiscal_period(
        self, company_id: uuid.UUID, period_str: str, actor: Any = None
    ) -> FiscalPeriod:
        FinancePolicy.check_can_close_period(actor)
        checklist = await self.get_period_close_checklist(company_id, period_str)

        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            fp = await repo.get_fiscal_period(company_id, period_str)
            if not fp:
                raise NotFoundError(f"'{period_str}' maliyyə dövrü tapılmadı.")
            if fp.status == "CLOSED":
                raise ConflictError("Maliyyə dövrü artıq bağlanıb.")

            fp.status = "CLOSED"
            fp.closed_at = utc_now()
            fp.closed_by = getattr(actor, "id", None)
            fp.close_checklist = checklist.model_dump()

            # Həmin dövrün büdcələrini də bağlayırıq (LOCKED)
            budgets = await repo.list_budgets(company_id, period=period_str)
            for b in budgets:
                b.status = "LOCKED"

            await uow.commit()
            return fp

    async def reopen_fiscal_period(
        self, company_id: uuid.UUID, period_str: str, data: PeriodReopenRequest, actor: Any = None
    ) -> FiscalPeriod:
        FinancePolicy.check_can_reopen_period(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            fp = await repo.get_fiscal_period(company_id, period_str)
            if not fp:
                raise NotFoundError(f"'{period_str}' maliyyə dövrü tapılmadı.")
            if fp.status != "CLOSED":
                raise BusinessRuleViolationError("Yalnız bağlanmış dövr yenidən açıla bilər.")

            fp.status = "OPEN"
            fp.reopened_at = utc_now()
            fp.reopened_by = getattr(actor, "id", None)
            fp.reopen_reason = data.reason
            await uow.commit()
            return fp

    # ==========================================
    # 7. GENERAL LEDGER
    # ==========================================

    async def is_gl_enabled(self, _company_id: uuid.UUID) -> bool:
        setting = await self.settings.get("finance_rules")
        if setting and isinstance(setting.value, dict):
            return bool(setting.value.get("gl_enabled", False))
        return False

    async def create_gl_account(
        self, company_id: uuid.UUID, data: GLAccountCreate, actor: Any = None
    ) -> GLAccount:
        FinancePolicy.check_can_configure_gl(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            existing = await repo.get_gl_account_by_code(company_id, data.code)
            if existing:
                raise ConflictError(f"'{data.code}' kodlu GL hesabı artıq mövcuddur.")

            acc = GLAccount(
                id=uuid.uuid4(),
                company_id=company_id,
                code=data.code,
                name=data.name,
                account_type=data.account_type,
                parent_id=data.parent_id,
            )
            await repo.create_gl_account(acc)
            await uow.commit()
            return acc

    async def list_gl_accounts(self, company_id: uuid.UUID, actor: Any = None) -> list[GLAccount]:
        FinancePolicy.check_can_view_gl(actor)
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            return await repo.list_gl_accounts(company_id)

    async def create_journal_entry(
        self, company_id: uuid.UUID, data: JournalEntryCreate, actor: Any = None
    ) -> JournalEntry:
        FinancePolicy.check_can_post_gl(actor)
        if not await self.is_gl_enabled(company_id):
            raise BusinessRuleViolationError(
                code="NOT_ENABLED",
                message="Baş Mühasibat Kitabı (General Ledger) sistemi sazlamalarda deaktivdir (finance.gl.enabled=False).",
            )

        total_deb = sum(ln.debit for ln in data.lines)
        total_cred = sum(ln.credit for ln in data.lines)

        # 1. Balans yoxlanışı (Debit == Credit)
        if total_deb != total_cred or total_deb <= Decimal("0.0000"):
            raise BusinessRuleViolationError(
                code="UNBALANCED_JOURNAL_ENTRY",
                message=f"Jurnal qeydi balanslaşdırılmayıb! Debet: {total_deb}, Kredit: {total_cred}",
            )

        period_str = data.entry_date.strftime("%Y-%m")

        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            # 2. Period yoxlanışı
            fp = await repo.get_fiscal_period(company_id, period_str)
            if fp and fp.status == "CLOSED":
                raise ConflictError(f"Bağlanmış dövrə ({period_str}) jurnal qeydi vurula bilməz.", code="PERIOD_CLOSED")

            entry_no = f"JE-{data.entry_date.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"
            entry = JournalEntry(
                id=uuid.uuid4(),
                company_id=company_id,
                entry_no=entry_no,
                branch_id=data.branch_id,
                entry_date=data.entry_date,
                source_type="manual",
                memo=data.memo,
                total_debit=total_deb,
                total_credit=total_cred,
                is_reversal=False,
                period=period_str,
                created_by=getattr(actor, "id", None),
            )

            db_lines = [
                JournalLine(
                    id=uuid.uuid4(),
                    account_id=ln.account_id,
                    debit=ln.debit,
                    credit=ln.credit,
                    memo=ln.memo,
                )
                for ln in data.lines
            ]

            await repo.create_journal_entry(entry, db_lines)
            await uow.commit()
            return entry

    async def get_trial_balance(
        self,
        company_id: uuid.UUID,
        as_of_date: date | None = None,
        period: str | None = None,
        actor: Any = None,
    ) -> TrialBalanceResponse:
        FinancePolicy.check_can_view_gl(actor)
        if not await self.is_gl_enabled(company_id):
            raise BusinessRuleViolationError(
                code="NOT_ENABLED",
                message="Baş Mühasibat Kitabı (General Ledger) sistemi sazlamalarda deaktivdir (finance.gl.enabled=False).",
            )

        as_of = as_of_date or utc_now().date()
        async with UnitOfWork() as uow:
            repo = FinanceRepository(uow.session)
            rows = await repo.get_trial_balance(company_id, as_of_date=as_of, period=period)

            tot_deb = Decimal("0.0000")
            tot_cred = Decimal("0.0000")
            lines: list[TrialBalanceLine] = []

            for r in rows:
                tot_deb += r["debit_total"]
                tot_cred += r["credit_total"]
                lines.append(TrialBalanceLine(**r))

            diff = tot_deb - tot_cred
            is_balanced = diff == Decimal("0.0000")

            return TrialBalanceResponse(
                period=period,
                as_of_date=as_of,
                total_debits=tot_deb.quantize(Decimal("0.01")),
                total_credits=tot_cred.quantize(Decimal("0.01")),
                difference=diff.quantize(Decimal("0.01")),
                is_balanced=is_balanced,
                lines=lines,
            )

