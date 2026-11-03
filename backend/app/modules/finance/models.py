"""Maliyyə Modulu ORM Modelləri (Finance Models).

1. financial_accounts: Maliyyə hesabları (Kassa, bank, klirinq, digər) - Redaktə edilən balans sütunu yoxdur!
2. account_transactions: Hesablar üzrə əlavə-olunan dəyişməz əməliyyat jurnalı (Append-only).
3. account_transfers: Hesablararası daxili köçürmələr və kassa depozitləri.
4. reconciliation_sessions & reconciliation_lines: Ödəniş metodları və bank çıxarışı üzləşmələri.
5. expense_categories & income_categories: İerarxik xərc və qeyri-satış gəlir təsnifatı.
6. expenses & expense_allocations: Xərc sənədləri və filiallararası bölgü.
7. recurring_expense_templates: Dövri xərc şablonları.
8. other_incomes: Qeyri-satış gəlirləri.
9. customer_receivable_invoices, customer_payments, customer_payment_allocations, receivable_write_offs.
10. budgets & budget_revisions: Dövri maliyyə büdcələri.
11. fiscal_periods: Maliyyə dövrünün nəzarəti (OPEN -> CLOSING -> CLOSED).
12. processed_events: İdempotent hadisə qeydiyyatı.
13. operational_postings: Əməliyyat maliyyə faktları (Operational Ledger).
14. chart_of_accounts, journal_entries, journal_lines, posting_rules, dead_letter_postings: İkitərəfli Baş Kitab (GL).
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base, utc_now
from app.shared.outbox import ProcessedEvent  # noqa: F401

JSONBType = JSONB().with_variant(JSON(), "sqlite")  # type: ignore[no-untyped-call]


# ==========================================
# 1. ACCOUNTS & TRANSACTIONS
# ==========================================


class FinancialAccountType(str, enum.Enum):
    """Maliyyə hesabı tipləri."""

    CASH = "cash"
    BANK = "bank"
    CLEARING = "clearing"
    OTHER = "other"


class TransactionDirection(str, enum.Enum):
    """Əməliyyat istiqaməti."""

    IN = "IN"
    OUT = "OUT"


class FinancialAccount(Base):
    """Maliyyə Hesabı (Financial Account).

    Qeyd: Balans birbaşa saxlanılmır (No editable balance column).
    Balans append-only account_transactions cədvəlindən törədilir (sum(IN) - sum(OUT)).
    """

    __tablename__ = "financial_accounts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False, default=FinancialAccountType.CASH.value)
    sub_type: Mapped[str] = mapped_column(String(50), nullable=False, default="general")
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="AZN")
    branch_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    account_details: Mapped[dict[str, Any]] = mapped_column(JSONBType, nullable=False, default=dict)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    transactions: Mapped[list[AccountTransaction]] = relationship(
        "AccountTransaction",
        back_populates="account",
        cascade="all, delete-orphan",
        order_by="AccountTransaction.occurred_at.desc()",
    )

    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_financial_accounts_company_code"),
    )


class AccountTransaction(Base):
    """Hesab Əməliyyatları Jurnalı (Append-Only Account Transaction)."""

    __tablename__ = "account_transactions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("financial_accounts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    direction: Mapped[str] = mapped_column(String(10), nullable=False)  # IN | OUT
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    source_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True, index=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    reversal_of: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("account_transactions.id", ondelete="RESTRICT"), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    account: Mapped[FinancialAccount] = relationship("FinancialAccount", back_populates="transactions")

    __table_args__ = (
        CheckConstraint("amount > 0", name="chk_account_tx_amount_positive"),
        CheckConstraint("direction IN ('IN', 'OUT')", name="chk_account_tx_direction"),
        Index("ix_account_tx_account_occurred", "account_id", "occurred_at"),
    )


class AccountTransfer(Base):
    """Hesablararası Daxili Köçürmə (Internal Transfer / Bank Deposit)."""

    __tablename__ = "account_transfers"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    transfer_no: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    source_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("financial_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    destination_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("financial_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    fee_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0.0000"))
    fee_category_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False, default="manual")
    source_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="COMPLETED")
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    out_tx_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    in_tx_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    __table_args__ = (
        CheckConstraint("amount > 0", name="chk_transfer_amount_positive"),
        CheckConstraint("fee_amount >= 0", name="chk_transfer_fee_non_negative"),
    )


# ==========================================
# 2. RECONCILIATION
# ==========================================


class ReconciliationSession(Base):
    """Üzləşmə Sessiyası (Payment & Bank Reconciliation Session)."""

    __tablename__ = "reconciliation_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("financial_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    session_no: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    statement_date: Mapped[date] = mapped_column(Date, nullable=False)
    tender_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")  # DRAFT | IN_PROGRESS | COMPLETED
    expected_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0.0000"))
    actual_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0.0000"))
    difference_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0.0000"))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    lines: Mapped[list[ReconciliationLine]] = relationship(
        "ReconciliationLine", back_populates="session", cascade="all, delete-orphan", lazy="selectin"
    )


class ReconciliationLine(Base):
    """Üzləşmə Sətri (Reconciliation Line)."""

    __tablename__ = "reconciliation_lines"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("reconciliation_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    line_type: Mapped[str] = mapped_column(String(30), nullable=False)  # system_expected | bank_statement
    source_ref: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    match_state: Mapped[str] = mapped_column(
        String(20), nullable=False, default="unmatched"
    )  # unmatched | matched | partial | adjusted
    matched_line_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    adjustment_type: Mapped[str | None] = mapped_column(String(30), nullable=True)  # fee | chargeback | variance
    adjustment_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    session: Mapped[ReconciliationSession] = relationship("ReconciliationSession", back_populates="lines")


# ==========================================
# 3. INCOME & EXPENSES
# ==========================================


class ExpenseCategory(Base):
    """Xərc Kateqoriyası (İerarxik)."""

    __tablename__ = "expense_categories"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("expense_categories.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    gl_account_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    children: Mapped[list[ExpenseCategory]] = relationship("ExpenseCategory", backref="parent", remote_side=[id])

    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_expense_categories_company_code"),
    )


class IncomeCategory(Base):
    """Qeyri-Satış Gəlir Kateqoriyası."""

    __tablename__ = "income_categories"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    gl_account_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_income_categories_company_code"),
    )


class Expense(Base):
    """Xərc Sənədi (Operating Expense)."""

    __tablename__ = "expenses"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    expense_no: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    branch_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    category_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("expense_categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True, index=True)
    gross_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0.0000"))
    net_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    tax_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 4), nullable=True)
    payment_account_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("financial_accounts.id", ondelete="RESTRICT"), nullable=True
    )
    expense_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    attachments: Mapped[list[dict[str, Any]]] = mapped_column(JSONBType, nullable=False, default=list)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="DRAFT", index=True
    )  # DRAFT | SUBMITTED | APPROVED | PAID | REJECTED | CANCELLED | REVERSED
    approval_request_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    account_transaction_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    reversal_of_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("expenses.id", ondelete="RESTRICT"), nullable=True
    )
    reversal_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    category: Mapped[ExpenseCategory] = relationship("ExpenseCategory")
    allocations: Mapped[list[ExpenseAllocation]] = relationship(
        "ExpenseAllocation", back_populates="expense", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        CheckConstraint("gross_amount > 0", name="chk_expense_gross_positive"),
        CheckConstraint("tax_amount >= 0", name="chk_expense_tax_non_negative"),
        CheckConstraint("net_amount > 0", name="chk_expense_net_positive"),
        CheckConstraint("gross_amount >= net_amount", name="chk_expense_gross_gte_net"),
    )


class ExpenseAllocation(Base):
    """Mərkəzi Xərcin Filiallar Arasında Bölüşdürülməsi (Cost Allocation)."""

    __tablename__ = "expense_allocations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    expense_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    ratio: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    allocated_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    allocation_method: Mapped[str] = mapped_column(String(30), nullable=False)  # equal | revenue_share | headcount | fixed_percentages

    expense: Mapped[Expense] = relationship("Expense", back_populates="allocations")


class RecurringExpenseTemplate(Base):
    """Dövri Xərc Şablonu (Recurring Expense Template).

    Qeyd: Avtomatik olaraq yalnız DRAFT statuslu xərc formalaşdırır. Heç vaxt auto-approve və ya auto-pay etmir!
    """

    __tablename__ = "recurring_expense_templates"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    template_name: Mapped[str] = mapped_column(String(100), nullable=False)
    branch_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    category_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("expense_categories.id", ondelete="RESTRICT"), nullable=False
    )
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0.0000"))
    day_of_month: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class OtherIncome(Base):
    """Qeyri-Satış Digər Gəlir Qeydi."""

    __tablename__ = "other_incomes"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    income_no: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    branch_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    category_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("income_categories.id", ondelete="RESTRICT"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    payment_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("financial_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    income_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")  # DRAFT | APPROVED | PAID | REVERSED
    account_transaction_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


# ==========================================
# 4. CUSTOMER RECEIVABLES
# ==========================================


class CustomerReceivableInvoice(Base):
    """Müştəri Nisyə Qaiməsi (Credit Sales Receivable Invoice)."""

    __tablename__ = "customer_receivable_invoices"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    invoice_no: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    branch_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    sale_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True, index=True)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0.0000"))
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="UNPAID", index=True
    )  # UNPAID | PARTIALLY_PAID | PAID | WRITTEN_OFF | CANCELLED
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    allocations: Mapped[list[CustomerPaymentAllocation]] = relationship(
        "CustomerPaymentAllocation", back_populates="invoice", lazy="selectin"
    )

    __table_args__ = (
        CheckConstraint("total_amount > 0", name="chk_receivable_invoice_total_positive"),
        CheckConstraint("paid_amount >= 0", name="chk_receivable_invoice_paid_non_neg"),
        CheckConstraint("paid_amount <= total_amount", name="chk_receivable_invoice_paid_lte_total"),
    )


class CustomerPayment(Base):
    """Müştəri Borc Ödənişi (Customer Debt Payment)."""

    __tablename__ = "customer_payments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    payment_no: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    payment_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("financial_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="COMPLETED")  # COMPLETED | REVERSED
    account_transaction_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    allocations: Mapped[list[CustomerPaymentAllocation]] = relationship(
        "CustomerPaymentAllocation", back_populates="payment", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (CheckConstraint("amount > 0", name="chk_customer_payment_amount_positive"),)


class CustomerPaymentAllocation(Base):
    """Müştəri Ödənişinin Qaimələr Üzrə Təyinatı (Payment Allocation)."""

    __tablename__ = "customer_payment_allocations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    payment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("customer_payments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("customer_receivable_invoices.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    allocated_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    payment: Mapped[CustomerPayment] = relationship("CustomerPayment", back_populates="allocations")
    invoice: Mapped[CustomerReceivableInvoice] = relationship("CustomerReceivableInvoice", back_populates="allocations")

    __table_args__ = (CheckConstraint("allocated_amount > 0", name="chk_allocation_amount_positive"),)


class ReceivableWriteOff(Base):
    """Ümidsiz Borcun Silinmə Aktı (Bad Debt Write-Off)."""

    __tablename__ = "receivable_write_offs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("customer_receivable_invoices.id", ondelete="RESTRICT"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    approved_by: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="COMPLETED")  # COMPLETED | REVERSED
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    __table_args__ = (CheckConstraint("amount > 0", name="chk_write_off_amount_positive"),)


# ==========================================
# 5. BUDGETS
# ==========================================


class Budget(Base):
    """Maliyyə Büdcəsi (Period x Branch x Category)."""

    __tablename__ = "budgets"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    period: Mapped[str] = mapped_column(String(7), nullable=False, index=True)  # YYYY-MM
    branch_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True, index=True)
    category_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("expense_categories.id", ondelete="RESTRICT"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="DRAFT"
    )  # DRAFT | SUBMITTED | APPROVED | LOCKED
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    revisions: Mapped[list[BudgetRevision]] = relationship(
        "BudgetRevision", back_populates="budget", cascade="all, delete-orphan", order_by="BudgetRevision.version.desc()", lazy="selectin"
    )

    __table_args__ = (
        CheckConstraint("amount >= 0", name="chk_budget_amount_non_negative"),
    )


class BudgetRevision(Base):
    """Büdcə Dəyişikliyi Tarixçəsi."""

    __tablename__ = "budget_revisions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    budget_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    previous_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    new_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    revised_by: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    budget: Mapped[Budget] = relationship("Budget", back_populates="revisions")


# ==========================================
# 6. FISCAL PERIODS
# ==========================================


class FiscalPeriod(Base):
    """Maliyyə Dövrü Nəzarəti (Fiscal Period)."""

    __tablename__ = "fiscal_periods"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    period: Mapped[str] = mapped_column(String(7), nullable=False, index=True)  # YYYY-MM
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN")  # OPEN | CLOSING | CLOSED
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    close_checklist: Mapped[dict[str, Any]] = mapped_column(JSONBType, nullable=False, default=dict)
    reopened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reopened_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    reopen_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("company_id", "period", name="uq_fiscal_periods_company_period"),
    )


# ==========================================
# 7. ACCOUNTING INTEGRATION & BOUNDARY
# ==========================================



class OperationalPosting(Base):
    """Əməliyyat Maliyyə Faktları (Operational Ledger Facts)."""

    __tablename__ = "operational_postings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True, index=True)
    business_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    net_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0.0000"))
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0.0000"))
    cost_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0.0000"))
    gross_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0.0000"))
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSONBType, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    __table_args__ = (
        UniqueConstraint("event_id", "event_type", name="uq_operational_postings_event_type"),
    )


# ==========================================
# 8. DOUBLE-ENTRY GENERAL LEDGER (OPTIONAL)
# ==========================================


class GLAccount(Base):
    """Mühasibat Hesablar Planı (Chart of Accounts)."""

    __tablename__ = "chart_of_accounts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    account_type: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # asset | liability | equity | revenue | expense | contra
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    children: Mapped[list[GLAccount]] = relationship("GLAccount", backref="parent", remote_side=[id])

    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_chart_of_accounts_company_code"),
    )


class JournalEntry(Base):
    """Baş Mühasibat Kitabı Jurnal Qeydi (Double-Entry Journal Entry).

    Qeyd: total_debit == total_credit sərt şəkildə verilənlər bazası CheckConstraint ilə qorunur!
    """

    __tablename__ = "journal_entries"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    entry_no: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True, index=True)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    event_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True, index=True)
    memo: Mapped[str] = mapped_column(Text, nullable=False)
    total_debit: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    total_credit: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    is_reversal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reversal_of_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("journal_entries.id", ondelete="RESTRICT"), nullable=True
    )
    period: Mapped[str] = mapped_column(String(7), nullable=False, index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    lines: Mapped[list[JournalLine]] = relationship(
        "JournalLine", back_populates="entry", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        CheckConstraint("total_debit = total_credit", name="chk_journal_entry_balanced"),
        CheckConstraint("total_debit > 0", name="chk_journal_entry_positive"),
    )


class JournalLine(Base):
    """Jurnal Qeydinin Sətri (Journal Entry Line)."""

    __tablename__ = "journal_lines"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("chart_of_accounts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    debit: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0.0000"))
    credit: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0.0000"))
    memo: Mapped[str | None] = mapped_column(String(255), nullable=True)

    entry: Mapped[JournalEntry] = relationship("JournalEntry", back_populates="lines")
    account: Mapped[GLAccount] = relationship("GLAccount")

    __table_args__ = (
        CheckConstraint("debit >= 0", name="chk_journal_line_debit_non_neg"),
        CheckConstraint("credit >= 0", name="chk_journal_line_credit_non_neg"),
        CheckConstraint("debit > 0 OR credit > 0", name="chk_journal_line_has_value"),
    )


class PostingRule(Base):
    """Maliyyə Hadisəsi -> Baş Kitab Hesabları Eşləşdirmə Qaydası (Posting Rule)."""

    __tablename__ = "posting_rules"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    debit_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("chart_of_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    credit_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("chart_of_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    amount_component: Mapped[str] = mapped_column(
        String(20), nullable=False, default="gross"
    )  # net | tax | cost | gross
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    debit_account: Mapped[GLAccount] = relationship("GLAccount", foreign_keys=[debit_account_id])
    credit_account: Mapped[GLAccount] = relationship("GLAccount", foreign_keys=[credit_account_id])


class DeadLetterPosting(Base):
    """Uğursuz Qeydlər Cədvəli (Dead-Letter Postings for Failure Recovery)."""

    __tablename__ = "dead_letter_postings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    adapter: Mapped[str] = mapped_column(String(30), nullable=False)  # operational | gl
    error_message: Mapped[str] = mapped_column(Text, nullable=False)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONBType, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

