"""Maliyyə Modulu REST API Marşrutları (Finance API Endpoints)."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, File, Header, Query, Request, UploadFile, status

from app.core.uow import UnitOfWork
from app.modules.finance.policies import FinancePolicy
from app.modules.finance.reports_service import FinanceReportsService
from app.modules.finance.schemas import (
    AccountTransactionResponse,
    AccountTransferRequest,
    AccountTransferResponse,
    AgingReportResponse,
    BankStatementCommitRequest,
    BankStatementDryRunResponse,
    BankStatementParsedLine,
    BudgetCreate,
    BudgetResponse,
    BudgetUpdate,
    BudgetVarianceResponse,
    CashFlowReportResponse,
    CustomerPaymentCreate,
    CustomerPaymentResponse,
    CustomerReceivableInvoiceCreate,
    CustomerReceivableInvoiceResponse,
    DailyCashReportResponse,
    ExpenseCategoryCreate,
    ExpenseCategoryResponse,
    ExpenseCreate,
    ExpensePayRequest,
    ExpenseResponse,
    ExpenseReverseRequest,
    FinancialAccountCreate,
    FinancialAccountResponse,
    FiscalPeriodCreate,
    FiscalPeriodResponse,
    GLAccountCreate,
    GLAccountResponse,
    IncomeCategoryCreate,
    IncomeCategoryResponse,
    JournalEntryCreate,
    JournalEntryResponse,
    ManualMatchRequest,
    OpeningBalanceRequest,
    OtherIncomeCreate,
    OtherIncomeResponse,
    PeriodCloseChecklistResponse,
    PeriodReopenRequest,
    ProfitAndLossReportResponse,
    ReconciliationSessionCreate,
    ReconciliationSessionResponse,
    RecurringTemplateCreate,
    RecurringTemplateResponse,
    ReportDrillDownResponse,
    SharedCostAllocationPreviewResponse,
    SharedCostPreviewRequest,
    TrialBalanceResponse,
)
from app.modules.finance.service import FinanceService

router = APIRouter(prefix="/finance", tags=["Maliyyə (Finance)"])


def get_actor(request: Request) -> Any:
    return getattr(request.state, "user", None)


def get_company_id(request: Request) -> uuid.UUID:
    actor = get_actor(request)
    if actor and getattr(actor, "company_id", None):
        return uuid.UUID(str(actor.company_id))
    return uuid.UUID("00000000-0000-0000-0000-000000000001")


# ==========================================
# 1. ACCOUNTS & TRANSFERS
# ==========================================


@router.get("/accounts", response_model=list[FinancialAccountResponse], summary="Maliyyə Hesablarının Siyahısı")
async def list_accounts(
    request: Request,
    branch_id: uuid.UUID | None = None,
    type_: str | None = Query(None, alias="type"),
    status_: str | None = Query("active", alias="status"),
) -> list[FinancialAccountResponse]:
    actor = get_actor(request)
    company_id = get_company_id(request)
    service = FinanceService()
    accounts = await service.list_accounts(company_id, branch_id, type_, status_, actor)
    res = []
    for acc in accounts:
        bal = await service.get_account_balance(acc.id, actor)
        resp = FinancialAccountResponse.model_validate(acc)
        resp.current_balance = bal
        res.append(resp)
    return res


@router.post("/accounts", response_model=FinancialAccountResponse, status_code=status.HTTP_201_CREATED, summary="Yeni Maliyyə Hesabı Yarat")
async def create_account(
    request: Request,
    data: FinancialAccountCreate,
) -> FinancialAccountResponse:
    actor = get_actor(request)
    company_id = get_company_id(request)
    service = FinanceService()
    acc = await service.create_account(company_id, data, actor)
    resp = FinancialAccountResponse.model_validate(acc)
    resp.current_balance = Decimal("0.0000")
    return resp


@router.get("/accounts/{account_id}", response_model=FinancialAccountResponse, summary="Maliyyə Hesabı Təfərrüatları")
async def get_account(
    request: Request,
    account_id: uuid.UUID,
) -> FinancialAccountResponse:
    actor = get_actor(request)
    service = FinanceService()
    acc = await service.get_account(account_id, actor)
    bal = await service.get_account_balance(account_id, actor)
    resp = FinancialAccountResponse.model_validate(acc)
    resp.current_balance = bal
    return resp


@router.get("/accounts/{account_id}/transactions", response_model=list[AccountTransactionResponse], summary="Hesabın Tranzaksiyaları Tarixçəsi")
async def list_account_transactions(
    request: Request,
    account_id: uuid.UUID,
    limit: int = 100,
    offset: int = 0,
) -> list[AccountTransactionResponse]:
    actor = get_actor(request)
    service = FinanceService()
    txs = await service.list_account_transactions(account_id, limit=limit, offset=offset, actor=actor)
    return [AccountTransactionResponse.model_validate(tx) for tx in txs]


@router.post("/transfers", response_model=AccountTransferResponse, status_code=status.HTTP_201_CREATED, summary="Hesablararası Pul Köçürməsi")
async def execute_transfer(
    request: Request,
    data: AccountTransferRequest,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> AccountTransferResponse:
    _ = idempotency_key
    actor = get_actor(request)
    company_id = get_company_id(request)
    service = FinanceService()
    trf = await service.execute_transfer(company_id, data, actor)
    return AccountTransferResponse.model_validate(trf)


@router.post("/accounts/opening-balance", response_model=AccountTransactionResponse, summary="Açılış Qalığının Təyini")
async def record_opening_balance(
    request: Request,
    data: OpeningBalanceRequest,
) -> AccountTransactionResponse:
    actor = get_actor(request)
    company_id = get_company_id(request)
    service = FinanceService()
    tx = await service.record_opening_balance(company_id, data.account_id, data.amount, actor, data.memo)
    return AccountTransactionResponse.model_validate(tx)


# ==========================================
# 2. RECONCILIATIONS
# ==========================================


@router.post("/reconciliations", response_model=ReconciliationSessionResponse, status_code=status.HTTP_201_CREATED, summary="Yeni Üzləşmə Sessiyası")
async def create_reconciliation_session(
    request: Request,
    data: ReconciliationSessionCreate,
) -> ReconciliationSessionResponse:
    actor = get_actor(request)
    company_id = get_company_id(request)
    service = FinanceService()
    sess = await service.create_reconciliation_session(company_id, data, actor)
    return ReconciliationSessionResponse.model_validate(sess)


@router.post("/reconciliations/parse-csv", response_model=list[BankStatementParsedLine], summary="Bank Çıxarışı CSV Mətnini Parse Et")
async def parse_csv_statement(
    request: Request,
    file: UploadFile = File(...),
) -> list[BankStatementParsedLine]:
    _ = get_actor(request)
    content = (await file.read()).decode("utf-8")
    service = FinanceService()
    return service.parse_bank_statement_csv(content)


@router.post("/reconciliations/{session_id}/dry-run", response_model=BankStatementDryRunResponse, summary="Bank Çıxarışı Simulyasiyası (Dry-Run)")
async def dry_run_reconciliation(
    request: Request,
    session_id: uuid.UUID,
    lines: list[BankStatementParsedLine],
) -> BankStatementDryRunResponse:
    actor = get_actor(request)
    service = FinanceService()
    return await service.dry_run_bank_statement(session_id, lines, actor)


@router.post("/reconciliations/commit", response_model=ReconciliationSessionResponse, summary="Bank Çıxarışı Sətirlərinin Təsdiqi və Auto-Match")
async def commit_reconciliation(
    request: Request,
    data: BankStatementCommitRequest,
) -> ReconciliationSessionResponse:
    actor = get_actor(request)
    company_id = get_company_id(request)
    service = FinanceService()
    sess = await service.commit_bank_statement(company_id, data, actor)
    return ReconciliationSessionResponse.model_validate(sess)


@router.post("/reconciliations/{session_id}/manual-match", response_model=ReconciliationSessionResponse, summary="Manual Sətir Eşləşdirməsi")
async def manual_match(
    request: Request,
    session_id: uuid.UUID,
    data: ManualMatchRequest,
) -> ReconciliationSessionResponse:
    actor = get_actor(request)
    service = FinanceService()
    sess = await service.manual_match(session_id, data, actor)
    return ReconciliationSessionResponse.model_validate(sess)


# ==========================================
# 3. CATEGORIES
# ==========================================


@router.get("/categories/expenses", response_model=list[ExpenseCategoryResponse], summary="Xərc Kateqoriyaları")
async def list_expense_categories(request: Request) -> list[ExpenseCategoryResponse]:
    actor = get_actor(request)
    company_id = get_company_id(request)
    service = FinanceService()
    cats = await service.list_expense_categories(company_id, actor)
    return [ExpenseCategoryResponse.model_validate(c) for c in cats]


@router.post("/categories/expenses", response_model=ExpenseCategoryResponse, status_code=status.HTTP_201_CREATED, summary="Yeni Xərc Kateqoriyası")
async def create_expense_category(
    request: Request,
    data: ExpenseCategoryCreate,
) -> ExpenseCategoryResponse:
    actor = get_actor(request)
    company_id = get_company_id(request)
    service = FinanceService()
    cat = await service.create_expense_category(company_id, data.code, data.name, data.parent_id, actor)
    return ExpenseCategoryResponse.model_validate(cat)


@router.get("/categories/incomes", response_model=list[IncomeCategoryResponse], summary="Gəlir Kateqoriyaları")
async def list_income_categories(request: Request) -> list[IncomeCategoryResponse]:
    company_id = get_company_id(request)
    async with UnitOfWork() as uow:
        from app.modules.finance.repository import FinanceRepository
        repo = FinanceRepository(uow.session)
        cats = await repo.list_income_categories(company_id)
        return [IncomeCategoryResponse.model_validate(c) for c in cats]


@router.post("/categories/incomes", response_model=IncomeCategoryResponse, status_code=status.HTTP_201_CREATED, summary="Yeni Gəlir Kateqoriyası")
async def create_income_category(
    request: Request,
    data: IncomeCategoryCreate,
) -> IncomeCategoryResponse:
    actor = get_actor(request)
    FinancePolicy.check_can_create_income(actor)
    company_id = get_company_id(request)
    async with UnitOfWork() as uow:
        from app.modules.finance.models import IncomeCategory
        from app.modules.finance.repository import FinanceRepository
        repo = FinanceRepository(uow.session)
        cat = IncomeCategory(
            id=uuid.uuid4(),
            company_id=company_id,
            code=data.code,
            name=data.name,
            gl_account_id=data.gl_account_id,
        )
        await repo.create_income_category(cat)
        await uow.commit()
        return IncomeCategoryResponse.model_validate(cat)


# ==========================================
# 4. EXPENSES
# ==========================================


@router.post("/expenses", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED, summary="Yeni Xərc Sənədi Tərtib Et")
async def create_expense(
    request: Request,
    data: ExpenseCreate,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> ExpenseResponse:
    _ = idempotency_key
    actor = get_actor(request)
    company_id = get_company_id(request)
    service = FinanceService()
    exp = await service.create_expense(company_id, data, actor)
    return ExpenseResponse.model_validate(exp)


@router.get("/expenses", response_model=list[ExpenseResponse], summary="Xərc Sənədlərinin Siyahısı")
async def list_expenses(
    request: Request,
    branch_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    status_: str | None = Query(None, alias="status"),
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[ExpenseResponse]:
    company_id = get_company_id(request)
    async with UnitOfWork() as uow:
        from app.modules.finance.repository import FinanceRepository
        repo = FinanceRepository(uow.session)
        expenses = await repo.list_expenses(
            company_id=company_id,
            branch_id=branch_id,
            category_id=category_id,
            status=status_,
            start_date=start_date,
            end_date=end_date,
        )
        return [ExpenseResponse.model_validate(e) for e in expenses]


@router.post("/expenses/{expense_id}/approve", response_model=ExpenseResponse, summary="Xərc Sənədinin Təsdiqi (SoD)")
async def approve_expense(
    request: Request,
    expense_id: uuid.UUID,
) -> ExpenseResponse:
    actor = get_actor(request)
    service = FinanceService()
    exp = await service.approve_expense(expense_id, actor)
    return ExpenseResponse.model_validate(exp)


@router.post("/expenses/{expense_id}/pay", response_model=ExpenseResponse, summary="Xərcin Hesabdan Ödənilməsi")
async def pay_expense(
    request: Request,
    expense_id: uuid.UUID,
    data: ExpensePayRequest,
) -> ExpenseResponse:
    actor = get_actor(request)
    service = FinanceService()
    exp = await service.pay_expense(expense_id, data, actor)
    return ExpenseResponse.model_validate(exp)


@router.post("/expenses/{expense_id}/reverse", response_model=ExpenseResponse, summary="Ödənilmiş Xərcin Ləğvi (Kompensasiya)")
async def reverse_expense(
    request: Request,
    expense_id: uuid.UUID,
    data: ExpenseReverseRequest,
) -> ExpenseResponse:
    actor = get_actor(request)
    service = FinanceService()
    rev = await service.reverse_expense(expense_id, data, actor)
    return ExpenseResponse.model_validate(rev)


@router.post("/expenses/allocation-preview", response_model=SharedCostAllocationPreviewResponse, summary="Xərc Bölgüsü Simulyasiyası (Largest Remainder)")
async def preview_shared_cost_allocation(
    request: Request,
    data: SharedCostPreviewRequest,
    branch_ids: list[uuid.UUID] = Query(...),
) -> SharedCostAllocationPreviewResponse:
    _ = get_actor(request)
    service = FinanceService()
    return service.preview_shared_cost_allocation(branch_ids, data)


@router.post("/recurring-templates", response_model=RecurringTemplateResponse, status_code=status.HTTP_201_CREATED, summary="Yeni Dövri Xərc Şablonu")
async def create_recurring_template(
    request: Request,
    data: RecurringTemplateCreate,
) -> RecurringTemplateResponse:
    actor = get_actor(request)
    company_id = get_company_id(request)
    service = FinanceService()
    tmpl = await service.create_recurring_template(company_id, data, actor)
    return RecurringTemplateResponse.model_validate(tmpl)


@router.post("/recurring-templates/generate", summary="Dövri Xərclərdən DRAFT Qeydlərin Yaradılması")
async def generate_recurring_expenses(request: Request) -> dict[str, Any]:
    company_id = get_company_id(request)
    service = FinanceService()
    count = await service.generate_recurring_expenses(company_id)
    return {"status": "ok", "generated_drafts_count": count}


@router.post("/other-income", response_model=OtherIncomeResponse, status_code=status.HTTP_201_CREATED, summary="Qeyri-Satış Gəliri Qeydə Al")
async def create_other_income(
    request: Request,
    data: OtherIncomeCreate,
) -> OtherIncomeResponse:
    actor = get_actor(request)
    FinancePolicy.check_can_create_income(actor)
    company_id = get_company_id(request)
    async with UnitOfWork() as uow:
        from app.modules.finance.models import OtherIncome
        from app.modules.finance.repository import FinanceRepository
        repo = FinanceRepository(uow.session)
        inc_no = f"INC-{data.income_date.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"
        inc = OtherIncome(
            id=uuid.uuid4(),
            company_id=company_id,
            income_no=inc_no,
            branch_id=data.branch_id,
            category_id=data.category_id,
            amount=data.amount,
            payment_account_id=data.payment_account_id,
            income_date=data.income_date,
            description=data.description,
            status="PAID",
            created_by=getattr(actor, "id", uuid.uuid4()),
        )
        await repo.create_other_income(inc)
        await uow.commit()
        return OtherIncomeResponse.model_validate(inc)


# ==========================================
# 5. CUSTOMER RECEIVABLES & PAYABLES
# ==========================================


@router.post("/receivables/invoices", response_model=CustomerReceivableInvoiceResponse, status_code=status.HTTP_201_CREATED, summary="Müştəri Nisyə Qaiməsi Yarat")
async def create_receivable_invoice(
    request: Request,
    data: CustomerReceivableInvoiceCreate,
) -> CustomerReceivableInvoiceResponse:
    actor = get_actor(request)
    company_id = get_company_id(request)
    service = FinanceService()
    inv = await service.create_receivable_invoice(company_id, data, actor)
    resp = CustomerReceivableInvoiceResponse.model_validate(inv)
    resp.outstanding_amount = inv.total_amount - inv.paid_amount
    return resp


@router.post("/receivables/payments", response_model=CustomerPaymentResponse, status_code=status.HTTP_201_CREATED, summary="Müştəri Borc Ödənişi və Təyinatı")
async def record_customer_payment(
    request: Request,
    data: CustomerPaymentCreate,
) -> CustomerPaymentResponse:
    actor = get_actor(request)
    company_id = get_company_id(request)
    service = FinanceService()
    pmt = await service.record_customer_payment(company_id, data, actor)
    return CustomerPaymentResponse.model_validate(pmt)


@router.get("/receivables/aging", response_model=AgingReportResponse, summary="Müştəri Borclarının Yaşlanma Analizi (Aging)")
async def get_receivables_aging(
    request: Request,
    as_of_date: date | None = None,
) -> AgingReportResponse:
    actor = get_actor(request)
    FinancePolicy.check_can_view_report(actor)
    company_id = get_company_id(request)
    async with UnitOfWork() as uow:
        reports = FinanceReportsService(uow.session)
        return await reports.get_receivables_aging(company_id, as_of_date)


@router.get("/payables/aging", response_model=AgingReportResponse, summary="Təchizatçı Borclarının Yaşlanma Analizi (Payables Aging)")
async def get_payables_aging(
    request: Request,
    as_of_date: date | None = None,
) -> AgingReportResponse:
    actor = get_actor(request)
    FinancePolicy.check_can_view_report(actor)
    company_id = get_company_id(request)
    async with UnitOfWork() as uow:
        reports = FinanceReportsService(uow.session)
        return await reports.get_payables_aging(company_id, as_of_date)


# ==========================================
# 6. BUDGETS
# ==========================================


@router.post("/budgets", response_model=BudgetResponse, status_code=status.HTTP_201_CREATED, summary="Yeni Maliyyə Büdcəsi Tərtib Et")
async def create_budget(
    request: Request,
    data: BudgetCreate,
) -> BudgetResponse:
    actor = get_actor(request)
    company_id = get_company_id(request)
    service = FinanceService()
    b = await service.create_budget(company_id, data, actor)
    return BudgetResponse.model_validate(b)


@router.get("/budgets", response_model=list[BudgetResponse], summary="Büdcələrin Siyahısı")
async def list_budgets(
    request: Request,
    period: str | None = None,
    branch_id: uuid.UUID | None = None,
) -> list[BudgetResponse]:
    actor = get_actor(request)
    company_id = get_company_id(request)
    service = FinanceService()
    budgets = await service.list_budgets(company_id, period=period, branch_id=branch_id, actor=actor)
    return [BudgetResponse.model_validate(b) for b in budgets]


@router.put("/budgets/{budget_id}", response_model=BudgetResponse, summary="Büdcə Məbləğinin Dəyişdirilməsi (Reviziya)")
async def update_budget(
    request: Request,
    budget_id: uuid.UUID,
    data: BudgetUpdate,
) -> BudgetResponse:
    actor = get_actor(request)
    service = FinanceService()
    b = await service.update_budget(budget_id, data, actor)
    return BudgetResponse.model_validate(b)


@router.post("/budgets/{budget_id}/approve", response_model=BudgetResponse, summary="Büdcənin Təsdiqi (SoD)")
async def approve_budget(
    request: Request,
    budget_id: uuid.UUID,
) -> BudgetResponse:
    actor = get_actor(request)
    service = FinanceService()
    b = await service.approve_budget(budget_id, actor)
    return BudgetResponse.model_validate(b)


@router.get("/budgets/variance", response_model=BudgetVarianceResponse, summary="Büdcə və Faktiki Xərclərin Fərqi (Variance)")
async def get_budget_variance(
    request: Request,
    period: str = Query(..., description="YYYY-MM"),
    branch_id: uuid.UUID | None = None,
) -> BudgetVarianceResponse:
    company_id = get_company_id(request)
    service = FinanceService()
    return await service.get_budget_variance(company_id, period, branch_id)


# ==========================================
# 7. FISCAL PERIODS
# ==========================================


@router.post("/periods", response_model=FiscalPeriodResponse, status_code=status.HTTP_201_CREATED, summary="Yeni Maliyyə Dövrü Aç")
async def create_fiscal_period(
    request: Request,
    data: FiscalPeriodCreate,
) -> FiscalPeriodResponse:
    actor = get_actor(request)
    company_id = get_company_id(request)
    service = FinanceService()
    fp = await service.create_fiscal_period(company_id, data.period, data.start_date, data.end_date, actor)
    return FiscalPeriodResponse.model_validate(fp)


@router.get("/periods/{period}/checklist", response_model=PeriodCloseChecklistResponse, summary="Dövrü Bağlamaq Üçün Yoxlama Siyahısı")
async def get_period_close_checklist(
    request: Request,
    period: str,
) -> PeriodCloseChecklistResponse:
    company_id = get_company_id(request)
    service = FinanceService()
    return await service.get_period_close_checklist(company_id, period)


@router.post("/periods/{period}/close", response_model=FiscalPeriodResponse, summary="Maliyyə Dövrünü Bağla")
async def close_fiscal_period(
    request: Request,
    period: str,
) -> FiscalPeriodResponse:
    actor = get_actor(request)
    company_id = get_company_id(request)
    service = FinanceService()
    fp = await service.close_fiscal_period(company_id, period, actor)
    return FiscalPeriodResponse.model_validate(fp)


@router.post("/periods/{period}/reopen", response_model=FiscalPeriodResponse, summary="Bağlanmış Dövrü Yenidən Aç (Privileged)")
async def reopen_fiscal_period(
    request: Request,
    period: str,
    data: PeriodReopenRequest,
) -> FiscalPeriodResponse:
    actor = get_actor(request)
    company_id = get_company_id(request)
    service = FinanceService()
    fp = await service.reopen_fiscal_period(company_id, period, data, actor)
    return FiscalPeriodResponse.model_validate(fp)


# ==========================================
# 8. GENERAL LEDGER (GL)
# ==========================================


@router.post("/gl/accounts", response_model=GLAccountResponse, status_code=status.HTTP_201_CREATED, summary="Yeni GL Hesabı Yarat")
async def create_gl_account(
    request: Request,
    data: GLAccountCreate,
) -> GLAccountResponse:
    actor = get_actor(request)
    company_id = get_company_id(request)
    service = FinanceService()
    acc = await service.create_gl_account(company_id, data, actor)
    return GLAccountResponse.model_validate(acc)


@router.get("/gl/accounts", response_model=list[GLAccountResponse], summary="GL Hesablar Planı")
async def list_gl_accounts(request: Request) -> list[GLAccountResponse]:
    actor = get_actor(request)
    company_id = get_company_id(request)
    service = FinanceService()
    accs = await service.list_gl_accounts(company_id, actor)
    return [GLAccountResponse.model_validate(a) for a in accs]


@router.post("/gl/journal-entries", response_model=JournalEntryResponse, status_code=status.HTTP_201_CREATED, summary="Manual Jurnal Qeydi Vur (Debit == Credit)")
async def create_journal_entry(
    request: Request,
    data: JournalEntryCreate,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> JournalEntryResponse:
    _ = idempotency_key
    actor = get_actor(request)
    company_id = get_company_id(request)
    service = FinanceService()
    entry = await service.create_journal_entry(company_id, data, actor)
    return JournalEntryResponse.model_validate(entry)


@router.get("/gl/trial-balance", response_model=TrialBalanceResponse, summary="Baş Kitab Üzləşmə Cədvəli (Trial Balance)")
async def get_trial_balance(
    request: Request,
    as_of_date: date | None = None,
    period: str | None = None,
) -> TrialBalanceResponse:
    actor = get_actor(request)
    company_id = get_company_id(request)
    service = FinanceService()
    return await service.get_trial_balance(company_id, as_of_date, period, actor)


# ==========================================
# 9. FINANCIAL REPORT QUERIES
# ==========================================


@router.get("/reports/pnl", response_model=ProfitAndLossReportResponse, summary="Mənfəət və Zərər Hesabatı (P&L)")
async def get_pnl_report(
    request: Request,
    period: str = Query(..., description="YYYY-MM"),
    branch_id: uuid.UUID | None = None,
) -> ProfitAndLossReportResponse:
    actor = get_actor(request)
    FinancePolicy.check_can_view_report(actor)
    FinancePolicy.check_can_view_profit(actor)
    company_id = get_company_id(request)
    async with UnitOfWork() as uow:
        reports = FinanceReportsService(uow.session)
        return await reports.get_pnl_report(company_id, period, branch_id)


@router.get("/reports/cash-flow", response_model=CashFlowReportResponse, summary="Pul Vəsaitlərinin Hərəkəti (Direct Cash Flow)")
async def get_cash_flow_report(
    request: Request,
    start_date: date = Query(...),
    end_date: date = Query(...),
    branch_id: uuid.UUID | None = None,
) -> CashFlowReportResponse:
    actor = get_actor(request)
    FinancePolicy.check_can_view_report(actor)
    company_id = get_company_id(request)
    async with UnitOfWork() as uow:
        reports = FinanceReportsService(uow.session)
        return await reports.get_cash_flow_report(company_id, start_date, end_date, branch_id)


@router.get("/reports/daily-cash", response_model=DailyCashReportResponse, summary="Gündəlik Kassa Hesabatı")
async def get_daily_cash_report(
    request: Request,
    branch_id: uuid.UUID = Query(...),
    report_date: date = Query(default_factory=date.today),
) -> DailyCashReportResponse:
    actor = get_actor(request)
    FinancePolicy.check_can_view_report(actor)
    company_id = get_company_id(request)
    async with UnitOfWork() as uow:
        reports = FinanceReportsService(uow.session)
        return await reports.get_daily_cash_report(company_id, report_date, branch_id)


@router.get("/reports/drill-down", response_model=ReportDrillDownResponse, summary="Göstəricinin İlkin Sənədlərə Açılışı (Drill-down)")
async def get_report_drill_down(
    request: Request,
    metric_id: str = Query(..., description="e.g. DEF-FIN-REV-001"),
    start_date: date = Query(...),
    end_date: date = Query(...),
    branch_id: uuid.UUID | None = None,
) -> ReportDrillDownResponse:
    actor = get_actor(request)
    FinancePolicy.check_can_view_report(actor)
    company_id = get_company_id(request)
    async with UnitOfWork() as uow:
        reports = FinanceReportsService(uow.session)
        return await reports.get_drill_down_transactions(company_id, metric_id, start_date, end_date, branch_id)

