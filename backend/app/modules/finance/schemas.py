"""Maliyyə Modulu Pydantic Sxemləri və DTO Modelləri (Finance Schemas)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# ==========================================
# 1. ACCOUNTS & TRANSACTIONS
# ==========================================


class FinancialAccountCreate(BaseModel):
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=255)
    type: str = Field("cash", description="cash | bank | clearing | other")
    sub_type: str = Field("general", description="cash_office | register_safe | bank_current | card_clearing | other")
    currency: str = Field("AZN", max_length=3)
    branch_id: uuid.UUID | None = None
    account_details: dict[str, Any] = Field(default_factory=dict)


class FinancialAccountUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    sub_type: str | None = None
    status: str | None = Field(None, description="active | archived")
    account_details: dict[str, Any] | None = None


class FinancialAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    code: str
    name: str
    type: str
    sub_type: str
    currency: str
    branch_id: uuid.UUID | None
    status: str
    account_details: dict[str, Any]
    current_balance: Decimal = Decimal("0.0000")
    version: int
    created_at: datetime
    updated_at: datetime


class AccountTransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    account_id: uuid.UUID
    direction: str
    amount: Decimal
    occurred_at: datetime
    source_type: str
    source_id: uuid.UUID | None
    memo: str | None
    reversal_of: uuid.UUID | None
    created_by: uuid.UUID | None
    created_at: datetime


class AccountTransferRequest(BaseModel):
    source_account_id: uuid.UUID
    destination_account_id: uuid.UUID
    amount: Decimal = Field(..., gt=0)
    fee_amount: Decimal = Field(Decimal("0.0000"), ge=0)
    fee_category_id: uuid.UUID | None = None
    occurred_at: datetime | None = None
    memo: str | None = None


class AccountTransferResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    transfer_no: str
    source_account_id: uuid.UUID
    destination_account_id: uuid.UUID
    amount: Decimal
    fee_amount: Decimal
    occurred_at: datetime
    status: str
    memo: str | None
    created_at: datetime


class DepositShiftCashRequest(BaseModel):
    shift_id: uuid.UUID
    register_cash_account_id: uuid.UUID
    destination_account_id: uuid.UUID  # Branch cash office or Bank account
    amount: Decimal = Field(..., gt=0)
    memo: str | None = None


class OpeningBalanceRequest(BaseModel):
    account_id: uuid.UUID
    amount: Decimal = Field(..., gt=0)
    occurred_at: datetime | None = None
    memo: str = "Açılış qalığı (Opening balance)"


# ==========================================
# 2. RECONCILIATION
# ==========================================


class ReconciliationSessionCreate(BaseModel):
    account_id: uuid.UUID
    statement_date: date
    tender_type: str | None = None
    expected_amount: Decimal = Decimal("0.0000")
    notes: str | None = None


class ReconciliationLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    line_type: str
    source_ref: str | None
    amount: Decimal
    occurred_at: datetime
    match_state: str
    matched_line_id: uuid.UUID | None
    adjustment_type: str | None
    adjustment_amount: Decimal | None
    notes: str | None


class ReconciliationSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    account_id: uuid.UUID
    session_no: str
    statement_date: date
    tender_type: str | None
    status: str
    expected_amount: Decimal
    actual_amount: Decimal
    difference_amount: Decimal
    notes: str | None
    created_at: datetime
    lines: list[ReconciliationLineResponse] = Field(default_factory=list)


class BankStatementParsedLine(BaseModel):
    date: date
    amount: Decimal
    source_ref: str | None = None
    description: str | None = None
    fee: Decimal = Decimal("0.0000")


class BankStatementDryRunResponse(BaseModel):
    total_parsed_lines: int
    total_statement_amount: Decimal
    candidate_matched_count: int
    unmatched_count: int
    estimated_fees: Decimal
    sample_lines: list[BankStatementParsedLine] = Field(default_factory=list)


class BankStatementCommitRequest(BaseModel):
    session_id: uuid.UUID
    lines: list[BankStatementParsedLine]


class ManualMatchRequest(BaseModel):
    system_line_id: uuid.UUID
    statement_line_id: uuid.UUID
    notes: str | None = None


class AdjustmentRequest(BaseModel):
    line_id: uuid.UUID
    adjustment_type: str = Field(..., description="fee | chargeback | variance")
    adjustment_amount: Decimal = Field(..., gt=0)
    category_id: uuid.UUID | None = None
    notes: str | None = None


# ==========================================
# 3. EXPENSES & INCOME CATEGORIES
# ==========================================


class ExpenseCategoryCreate(BaseModel):
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=100)
    parent_id: uuid.UUID | None = None
    gl_account_id: uuid.UUID | None = None


class ExpenseCategoryUpdate(BaseModel):
    name: str | None = None
    parent_id: uuid.UUID | None = None
    is_active: bool | None = None
    gl_account_id: uuid.UUID | None = None


class ExpenseCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    code: str
    name: str
    parent_id: uuid.UUID | None
    is_active: bool
    gl_account_id: uuid.UUID | None
    created_at: datetime


class IncomeCategoryCreate(BaseModel):
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=100)
    gl_account_id: uuid.UUID | None = None


class IncomeCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    code: str
    name: str
    is_active: bool
    gl_account_id: uuid.UUID | None
    created_at: datetime


# ==========================================
# 4. EXPENSES
# ==========================================


class AttachmentPayload(BaseModel):
    url: str
    filename: str
    mime_type: str
    size_bytes: int


class ExpenseCreate(BaseModel):
    branch_id: uuid.UUID
    category_id: uuid.UUID
    supplier_id: uuid.UUID | None = None
    gross_amount: Decimal = Field(..., gt=0)
    tax_amount: Decimal = Field(Decimal("0.0000"), ge=0)
    tax_rate: Decimal | None = None
    payment_account_id: uuid.UUID | None = None
    expense_date: date
    description: str
    attachments: list[AttachmentPayload] = Field(default_factory=list)


class ExpenseUpdate(BaseModel):
    category_id: uuid.UUID | None = None
    supplier_id: uuid.UUID | None = None
    gross_amount: Decimal | None = Field(None, gt=0)
    tax_amount: Decimal | None = Field(None, ge=0)
    payment_account_id: uuid.UUID | None = None
    expense_date: date | None = None
    description: str | None = None
    attachments: list[AttachmentPayload] | None = None


class ExpenseAllocationItem(BaseModel):
    branch_id: uuid.UUID
    ratio: Decimal
    allocation_method: str
    allocated_amount: Decimal


SharedCostAllocationItem = ExpenseAllocationItem


class ExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    expense_no: str
    branch_id: uuid.UUID
    category_id: uuid.UUID
    supplier_id: uuid.UUID | None
    gross_amount: Decimal
    tax_amount: Decimal
    net_amount: Decimal
    tax_rate: Decimal | None
    payment_account_id: uuid.UUID | None
    expense_date: date
    description: str
    attachments: list[dict[str, Any]]
    status: str
    approval_request_id: uuid.UUID | None
    paid_at: datetime | None
    paid_by: uuid.UUID | None
    reversal_of_id: uuid.UUID | None
    reversal_reason: str | None
    version: int
    created_at: datetime
    allocations: list[ExpenseAllocationItem] = Field(default_factory=list)


class ExpensePayRequest(BaseModel):
    payment_account_id: uuid.UUID
    paid_at: datetime | None = None


class ExpenseReverseRequest(BaseModel):
    reason: str = Field(..., min_length=3)


class SharedCostPreviewRequest(BaseModel):
    total_amount: Decimal = Field(..., gt=0)
    allocation_method: str = Field("equal", description="equal | revenue_share | headcount | fixed_percentages")
    custom_branch_weights: dict[str, Decimal] | None = None


class SharedCostAllocationPreviewResponse(BaseModel):
    total_amount: Decimal
    allocation_method: str
    allocations: list[ExpenseAllocationItem]


class RecurringTemplateCreate(BaseModel):
    template_name: str
    branch_id: uuid.UUID
    category_id: uuid.UUID
    supplier_id: uuid.UUID | None = None
    amount: Decimal = Field(..., gt=0)
    tax_amount: Decimal = Field(Decimal("0.0000"), ge=0)
    day_of_month: int = Field(1, ge=1, le=28)
    description: str


class RecurringTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    template_name: str
    branch_id: uuid.UUID
    category_id: uuid.UUID
    amount: Decimal
    tax_amount: Decimal
    day_of_month: int
    description: str
    is_active: bool
    last_generated_at: datetime | None
    created_at: datetime


class OtherIncomeCreate(BaseModel):
    branch_id: uuid.UUID
    category_id: uuid.UUID
    amount: Decimal = Field(..., gt=0)
    payment_account_id: uuid.UUID
    income_date: date
    description: str


class OtherIncomeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    income_no: str
    branch_id: uuid.UUID
    category_id: uuid.UUID
    amount: Decimal
    payment_account_id: uuid.UUID
    income_date: date
    description: str
    status: str
    created_at: datetime


# ==========================================
# 5. CUSTOMER RECEIVABLES
# ==========================================


class CustomerReceivableInvoiceCreate(BaseModel):
    customer_id: uuid.UUID
    branch_id: uuid.UUID
    sale_id: uuid.UUID | None = None
    issue_date: date
    due_date: date
    total_amount: Decimal = Field(..., gt=0)


class CustomerReceivableInvoiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    invoice_no: str
    customer_id: uuid.UUID
    branch_id: uuid.UUID
    sale_id: uuid.UUID | None
    issue_date: date
    due_date: date
    total_amount: Decimal
    paid_amount: Decimal
    outstanding_amount: Decimal = Decimal("0.0000")
    status: str
    created_at: datetime


class CustomerPaymentCreate(BaseModel):
    customer_id: uuid.UUID
    payment_account_id: uuid.UUID
    amount: Decimal = Field(..., gt=0)
    payment_date: date
    reference: str | None = None
    invoice_allocations: list[dict[str, Any]] = Field(
        default_factory=list, description="list of {invoice_id: UUID, amount: Decimal}"
    )


class CustomerPaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    payment_no: str
    customer_id: uuid.UUID
    payment_account_id: uuid.UUID
    amount: Decimal
    payment_date: date
    reference: str | None
    status: str
    created_at: datetime


class ReceivableWriteOffRequest(BaseModel):
    invoice_id: uuid.UUID
    amount: Decimal = Field(..., gt=0)
    reason: str = Field(..., min_length=5)


class AgingBucketItem(BaseModel):
    bucket_label: str  # "0-30", "31-60", "61-90", "90+"
    amount: Decimal


class AgingReportResponse(BaseModel):
    report_type: str  # "receivables" | "payables"
    as_of_date: date
    total_outstanding: Decimal
    due_soon_amount: Decimal  # due within 7 days
    overdue_amount: Decimal
    buckets: list[AgingBucketItem]
    records: list[dict[str, Any]] = Field(default_factory=list)


# ==========================================
# 6. BUDGETS
# ==========================================


class BudgetCreate(BaseModel):
    period: str = Field(..., max_length=7, description="YYYY-MM")
    branch_id: uuid.UUID | None = None
    category_id: uuid.UUID
    amount: Decimal = Field(..., ge=0)


class BudgetUpdate(BaseModel):
    amount: Decimal = Field(..., ge=0)
    reason: str = Field(..., min_length=3)


class BudgetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    period: str
    branch_id: uuid.UUID | None
    category_id: uuid.UUID
    amount: Decimal
    version: int
    status: str
    created_at: datetime
    updated_at: datetime


class BudgetVarianceItem(BaseModel):
    category_id: uuid.UUID
    category_name: str
    budgeted_amount: Decimal
    actual_amount: Decimal
    variance_amount: Decimal
    variance_percent: Decimal


class BudgetVarianceResponse(BaseModel):
    period: str
    branch_id: uuid.UUID | None
    total_budget: Decimal
    total_actual: Decimal
    total_variance: Decimal
    items: list[BudgetVarianceItem]


# ==========================================
# 7. FISCAL PERIODS
# ==========================================


class FiscalPeriodCreate(BaseModel):
    period: str = Field(..., max_length=7, description="YYYY-MM")
    start_date: date
    end_date: date


class FiscalPeriodResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    period: str
    start_date: date
    end_date: date
    status: str
    closed_at: datetime | None
    closed_by: uuid.UUID | None
    reopened_at: datetime | None
    reopen_reason: str | None


class PeriodCloseChecklistResponse(BaseModel):
    period: str
    can_close: bool
    unclosed_shifts_count: int
    pending_approvals_count: int
    unreconciled_sessions_count: int
    unmatched_bank_lines_count: int
    details: dict[str, Any] = Field(default_factory=dict)


class PeriodCloseRequest(BaseModel):
    checklist_acknowledged: bool = True


class PeriodReopenRequest(BaseModel):
    reason: str = Field(..., min_length=5)


# ==========================================
# 8. GENERAL LEDGER
# ==========================================


class GLAccountCreate(BaseModel):
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=255)
    account_type: str = Field(..., description="asset | liability | equity | revenue | expense | contra")
    parent_id: uuid.UUID | None = None


class GLAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    code: str
    name: str
    account_type: str
    parent_id: uuid.UUID | None
    is_active: bool
    created_at: datetime


class JournalLineInput(BaseModel):
    account_id: uuid.UUID
    debit: Decimal = Decimal("0.0000")
    credit: Decimal = Decimal("0.0000")
    memo: str | None = None


class JournalLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    account_id: uuid.UUID
    account_code: str | None = None
    account_name: str | None = None
    debit: Decimal
    credit: Decimal
    memo: str | None


class JournalEntryCreate(BaseModel):
    branch_id: uuid.UUID | None = None
    entry_date: date
    memo: str = Field(..., min_length=3)
    lines: list[JournalLineInput] = Field(..., min_length=2)


class JournalEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    entry_no: str
    branch_id: uuid.UUID | None
    entry_date: date
    source_type: str
    source_id: uuid.UUID | None
    event_id: uuid.UUID | None
    memo: str
    total_debit: Decimal
    total_credit: Decimal
    is_reversal: bool
    reversal_of_id: uuid.UUID | None
    period: str
    created_at: datetime
    lines: list[JournalLineResponse] = Field(default_factory=list)


class PostingRuleCreate(BaseModel):
    event_type: str
    debit_account_id: uuid.UUID
    credit_account_id: uuid.UUID
    amount_component: str = "gross"  # net | tax | cost | gross
    effective_from: date
    effective_to: date | None = None


class PostingRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    event_type: str
    debit_account_id: uuid.UUID
    credit_account_id: uuid.UUID
    amount_component: str
    version: int
    effective_from: date
    effective_to: date | None
    is_active: bool
    created_at: datetime


class TrialBalanceLine(BaseModel):
    account_id: uuid.UUID
    account_code: str
    account_name: str
    account_type: str
    debit_total: Decimal
    credit_total: Decimal
    net_balance: Decimal


class TrialBalanceResponse(BaseModel):
    period: str | None
    as_of_date: date
    total_debits: Decimal
    total_credits: Decimal
    difference: Decimal
    is_balanced: bool
    lines: list[TrialBalanceLine]


class GLCompletenessCheckResponse(BaseModel):
    is_complete: bool
    missing_events: list[str]
    active_rules_count: int
    details: dict[str, Any] = Field(default_factory=dict)


# ==========================================
# 9. FINANCIAL REPORT QUERIES
# ==========================================


class MetricValuePayload(BaseModel):
    definition_id: str
    name: str
    amount: Decimal
    drill_down_query: str


class ProfitAndLossReportResponse(BaseModel):
    period: str
    branch_id: uuid.UUID | None
    costing_method_label: str
    status: str = "COMPUTED"  # COMPUTED | NOT_COMPUTABLE
    missing_inputs: list[str] = Field(default_factory=list)
    net_revenue: MetricValuePayload
    cogs: MetricValuePayload
    gross_profit: MetricValuePayload
    gross_margin_percent: Decimal
    opex_accrual: MetricValuePayload
    opex_cash: MetricValuePayload
    other_income: MetricValuePayload
    net_profit: MetricValuePayload
    net_margin_percent: Decimal


class CashFlowReportResponse(BaseModel):
    start_date: date
    end_date: date
    branch_id: uuid.UUID | None
    inflows_by_tender: dict[str, Decimal]
    total_inflows: Decimal
    outflows_by_category: dict[str, Decimal]
    total_outflows: Decimal
    net_cash_flow: Decimal


class DailyCashReportResponse(BaseModel):
    date: date
    branch_id: uuid.UUID
    opening_cash: Decimal
    cash_sales: Decimal
    cash_returns: Decimal
    cash_in_movements: Decimal
    cash_out_movements: Decimal
    expected_closing_cash: Decimal
    counted_cash: Decimal
    variance: Decimal
    shifts_summary: list[dict[str, Any]] = Field(default_factory=list)


class BranchComparisonItem(BaseModel):
    branch_id: uuid.UUID
    branch_name: str
    net_revenue: Decimal
    cogs: Decimal
    gross_profit: Decimal
    opex: Decimal
    net_profit: Decimal


class BranchComparisonReportResponse(BaseModel):
    period: str
    branches: list[BranchComparisonItem]


class ReportDrillDownResponse(BaseModel):
    metric_id: str
    metric_name: str
    start_date: date
    end_date: date
    branch_id: uuid.UUID | None
    total_amount: Decimal
    record_count: int
    records: list[dict[str, Any]] = Field(default_factory=list)

