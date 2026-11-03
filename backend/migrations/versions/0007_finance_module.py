"""Finance module migration.

Financial accounts, account transactions, transfers, reconciliations, expense & income categories,
expenses, expense allocations, recurring templates, other incomes, customer receivables,
budgets, fiscal periods, processed events, operational postings, chart of accounts, journal entries,
journal lines, posting rules, and dead-letter postings.

Revision ID: 0007_finance_module
Revises: 0006_returns_and_exchanges
Create Date: 2026-10-21 16:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0007_finance_module"
down_revision: str | None = "0006_returns_and_exchanges"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

json_type = postgresql.JSONB().with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    # 1. Financial Accounts
    op.create_table(
        "financial_accounts",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("code", sa.String(length=50), nullable=False, index=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False, server_default="cash"),
        sa.Column("sub_type", sa.String(length=50), nullable=False, server_default="general"),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="AZN"),
        sa.Column("branch_id", sa.Uuid(as_uuid=True), nullable=True, index=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("account_details", json_type, nullable=False, server_default="{}"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("company_id", "code", name="uq_financial_accounts_company_code"),
    )

    # 2. Account Transactions
    op.create_table(
        "account_transactions",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column(
            "account_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("financial_accounts.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        ),
        sa.Column("direction", sa.String(length=10), nullable=False),
        sa.Column("amount", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column("source_type", sa.String(length=50), nullable=False, index=True),
        sa.Column("source_id", sa.Uuid(as_uuid=True), nullable=True, index=True),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column(
            "reversal_of",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("account_transactions.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("created_by", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("amount > 0", name="chk_account_tx_amount_positive"),
        sa.CheckConstraint("direction IN ('IN', 'OUT')", name="chk_account_tx_direction"),
    )
    op.create_index("ix_account_tx_account_occurred", "account_transactions", ["account_id", "occurred_at"])

    # 3. Account Transfers
    op.create_table(
        "account_transfers",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("transfer_no", sa.String(length=50), nullable=False, unique=True, index=True),
        sa.Column(
            "source_account_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("financial_accounts.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "destination_account_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("financial_accounts.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("fee_amount", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0"),
        sa.Column("fee_category_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_type", sa.String(length=50), nullable=False, server_default="manual"),
        sa.Column("source_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="COMPLETED"),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("out_tx_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("in_tx_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("created_by", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("amount > 0", name="chk_transfer_amount_positive"),
        sa.CheckConstraint("fee_amount >= 0", name="chk_transfer_fee_non_negative"),
    )

    # 4. Reconciliation Sessions & Lines
    op.create_table(
        "reconciliation_sessions",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column(
            "account_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("financial_accounts.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("session_no", sa.String(length=50), nullable=False, unique=True, index=True),
        sa.Column("statement_date", sa.Date(), nullable=False),
        sa.Column("tender_type", sa.String(length=50), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="DRAFT"),
        sa.Column("expected_amount", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0"),
        sa.Column("actual_amount", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0"),
        sa.Column("difference_amount", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_table(
        "reconciliation_lines",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            "session_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("reconciliation_sessions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("line_type", sa.String(length=30), nullable=False),
        sa.Column("source_ref", sa.String(length=100), nullable=True, index=True),
        sa.Column("amount", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("match_state", sa.String(length=20), nullable=False, server_default="unmatched"),
        sa.Column("matched_line_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("adjustment_type", sa.String(length=30), nullable=True),
        sa.Column("adjustment_amount", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    # 5. Expense Categories & Income Categories
    op.create_table(
        "expense_categories",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("code", sa.String(length=50), nullable=False, index=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("parent_id", sa.Uuid(as_uuid=True), sa.ForeignKey("expense_categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("gl_account_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("company_id", "code", name="uq_expense_categories_company_code"),
    )
    op.create_table(
        "income_categories",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("code", sa.String(length=50), nullable=False, index=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("gl_account_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("company_id", "code", name="uq_income_categories_company_code"),
    )

    # 6. Expenses & Allocations
    op.create_table(
        "expenses",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("expense_no", sa.String(length=50), nullable=False, unique=True, index=True),
        sa.Column("branch_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("category_id", sa.Uuid(as_uuid=True), sa.ForeignKey("expense_categories.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("supplier_id", sa.Uuid(as_uuid=True), nullable=True, index=True),
        sa.Column("gross_amount", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("tax_amount", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0"),
        sa.Column("net_amount", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("tax_rate", sa.Numeric(precision=5, scale=4), nullable=True),
        sa.Column("payment_account_id", sa.Uuid(as_uuid=True), sa.ForeignKey("financial_accounts.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("expense_date", sa.Date(), nullable=False, index=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("attachments", json_type, nullable=False, server_default="[]"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="DRAFT", index=True),
        sa.Column("approval_request_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_by", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("account_transaction_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("reversal_of_id", sa.Uuid(as_uuid=True), sa.ForeignKey("expenses.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("reversal_reason", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("gross_amount > 0", name="chk_expense_gross_positive"),
        sa.CheckConstraint("tax_amount >= 0", name="chk_expense_tax_non_negative"),
        sa.CheckConstraint("net_amount > 0", name="chk_expense_net_positive"),
        sa.CheckConstraint("gross_amount >= net_amount", name="chk_expense_gross_gte_net"),
    )
    op.create_table(
        "expense_allocations",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("expense_id", sa.Uuid(as_uuid=True), sa.ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("branch_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("ratio", sa.Numeric(precision=10, scale=6), nullable=False),
        sa.Column("allocated_amount", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("allocation_method", sa.String(length=30), nullable=False),
    )
    op.create_table(
        "recurring_expense_templates",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("template_name", sa.String(length=100), nullable=False),
        sa.Column("branch_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("category_id", sa.Uuid(as_uuid=True), sa.ForeignKey("expense_categories.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("supplier_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("amount", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("tax_amount", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0"),
        sa.Column("day_of_month", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("last_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_table(
        "other_incomes",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("income_no", sa.String(length=50), nullable=False, unique=True, index=True),
        sa.Column("branch_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("category_id", sa.Uuid(as_uuid=True), sa.ForeignKey("income_categories.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("amount", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("payment_account_id", sa.Uuid(as_uuid=True), sa.ForeignKey("financial_accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("income_date", sa.Date(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="DRAFT"),
        sa.Column("account_transaction_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("created_by", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    # 7. Customer Receivables
    op.create_table(
        "customer_receivable_invoices",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("invoice_no", sa.String(length=50), nullable=False, unique=True, index=True),
        sa.Column("customer_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("branch_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("sale_id", sa.Uuid(as_uuid=True), nullable=True, index=True),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False, index=True),
        sa.Column("total_amount", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("paid_amount", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="UNPAID", index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("total_amount > 0", name="chk_receivable_invoice_total_positive"),
        sa.CheckConstraint("paid_amount >= 0", name="chk_receivable_invoice_paid_non_neg"),
        sa.CheckConstraint("paid_amount <= total_amount", name="chk_receivable_invoice_paid_lte_total"),
    )
    op.create_table(
        "customer_payments",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("payment_no", sa.String(length=50), nullable=False, unique=True, index=True),
        sa.Column("customer_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("payment_account_id", sa.Uuid(as_uuid=True), sa.ForeignKey("financial_accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("amount", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("payment_date", sa.Date(), nullable=False),
        sa.Column("reference", sa.String(length=100), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="COMPLETED"),
        sa.Column("account_transaction_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("created_by", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("amount > 0", name="chk_customer_payment_amount_positive"),
    )
    op.create_table(
        "customer_payment_allocations",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("payment_id", sa.Uuid(as_uuid=True), sa.ForeignKey("customer_payments.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("invoice_id", sa.Uuid(as_uuid=True), sa.ForeignKey("customer_receivable_invoices.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("allocated_amount", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("allocated_amount > 0", name="chk_allocation_amount_positive"),
    )
    op.create_table(
        "receivable_write_offs",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("invoice_id", sa.Uuid(as_uuid=True), sa.ForeignKey("customer_receivable_invoices.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("amount", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("approved_by", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="COMPLETED"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("amount > 0", name="chk_write_off_amount_positive"),
    )

    # 8. Budgets
    op.create_table(
        "budgets",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("period", sa.String(length=7), nullable=False, index=True),
        sa.Column("branch_id", sa.Uuid(as_uuid=True), nullable=True, index=True),
        sa.Column("category_id", sa.Uuid(as_uuid=True), sa.ForeignKey("expense_categories.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("amount", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="DRAFT"),
        sa.Column("created_by", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("approved_by", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("amount >= 0", name="chk_budget_amount_non_negative"),
    )
    op.create_table(
        "budget_revisions",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("budget_id", sa.Uuid(as_uuid=True), sa.ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("previous_amount", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("new_amount", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("revised_by", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    # 9. Fiscal Periods
    op.create_table(
        "fiscal_periods",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("period", sa.String(length=7), nullable=False, index=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="OPEN"),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_by", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("close_checklist", json_type, nullable=False, server_default="{}"),
        sa.Column("reopened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reopened_by", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("reopen_reason", sa.Text(), nullable=True),
        sa.UniqueConstraint("company_id", "period", name="uq_fiscal_periods_company_period"),
    )

    # 10. Processed Events & Operational Postings
    op.create_table(
        "processed_events",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("event_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("consumer_name", sa.String(length=100), nullable=False, index=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="PROCESSED"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("event_id", "consumer_name", name="uq_processed_events_event_consumer"),
    )
    op.create_table(
        "operational_postings",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("event_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("event_type", sa.String(length=100), nullable=False, index=True),
        sa.Column("branch_id", sa.Uuid(as_uuid=True), nullable=True, index=True),
        sa.Column("business_date", sa.Date(), nullable=False, index=True),
        sa.Column("net_amount", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0"),
        sa.Column("tax_amount", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0"),
        sa.Column("cost_amount", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0"),
        sa.Column("gross_amount", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0"),
        sa.Column("source_type", sa.String(length=50), nullable=False),
        sa.Column("source_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("details", json_type, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("event_id", "event_type", name="uq_operational_postings_event_type"),
    )

    # 11. Chart of Accounts & General Ledger
    op.create_table(
        "chart_of_accounts",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("code", sa.String(length=50), nullable=False, index=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("account_type", sa.String(length=30), nullable=False),
        sa.Column("parent_id", sa.Uuid(as_uuid=True), sa.ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("company_id", "code", name="uq_chart_of_accounts_company_code"),
    )
    op.create_table(
        "journal_entries",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("entry_no", sa.String(length=50), nullable=False, unique=True, index=True),
        sa.Column("branch_id", sa.Uuid(as_uuid=True), nullable=True, index=True),
        sa.Column("entry_date", sa.Date(), nullable=False, index=True),
        sa.Column("source_type", sa.String(length=50), nullable=False),
        sa.Column("source_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("event_id", sa.Uuid(as_uuid=True), nullable=True, index=True),
        sa.Column("memo", sa.Text(), nullable=False),
        sa.Column("total_debit", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("total_credit", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("is_reversal", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("reversal_of_id", sa.Uuid(as_uuid=True), sa.ForeignKey("journal_entries.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("period", sa.String(length=7), nullable=False, index=True),
        sa.Column("created_by", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("total_debit = total_credit", name="chk_journal_entry_balanced"),
        sa.CheckConstraint("total_debit > 0", name="chk_journal_entry_positive"),
    )
    op.create_table(
        "journal_lines",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("journal_entry_id", sa.Uuid(as_uuid=True), sa.ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("account_id", sa.Uuid(as_uuid=True), sa.ForeignKey("chart_of_accounts.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("debit", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0"),
        sa.Column("credit", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0"),
        sa.Column("memo", sa.String(length=255), nullable=True),
        sa.CheckConstraint("debit >= 0", name="chk_journal_line_debit_non_neg"),
        sa.CheckConstraint("credit >= 0", name="chk_journal_line_credit_non_neg"),
        sa.CheckConstraint("debit > 0 OR credit > 0", name="chk_journal_line_has_value"),
    )
    op.create_table(
        "posting_rules",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("event_type", sa.String(length=100), nullable=False, index=True),
        sa.Column("debit_account_id", sa.Uuid(as_uuid=True), sa.ForeignKey("chart_of_accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("credit_account_id", sa.Uuid(as_uuid=True), sa.ForeignKey("chart_of_accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("amount_component", sa.String(length=20), nullable=False, server_default="gross"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_table(
        "dead_letter_postings",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("event_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("adapter", sa.String(length=30), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=False),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("payload", json_type, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("dead_letter_postings")
    op.drop_table("posting_rules")
    op.drop_table("journal_lines")
    op.drop_table("journal_entries")
    op.drop_table("chart_of_accounts")
    op.drop_table("operational_postings")
    op.drop_table("processed_events")
    op.drop_table("fiscal_periods")
    op.drop_table("budget_revisions")
    op.drop_table("budgets")
    op.drop_table("receivable_write_offs")
    op.drop_table("customer_payment_allocations")
    op.drop_table("customer_payments")
    op.drop_table("customer_receivable_invoices")
    op.drop_table("other_incomes")
    op.drop_table("recurring_expense_templates")
    op.drop_table("expense_allocations")
    op.drop_table("expenses")
    op.drop_table("income_categories")
    op.drop_table("expense_categories")
    op.drop_table("reconciliation_lines")
    op.drop_table("reconciliation_sessions")
    op.drop_table("account_transfers")
    op.drop_table("account_transactions")
    op.drop_table("financial_accounts")

