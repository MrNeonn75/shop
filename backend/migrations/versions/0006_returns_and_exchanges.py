"""Returns, refunds, exchanges, and store credit ledger migration.

Per-line return-state counter table, sale_returns, sale_return_lines, refunds,
store_credit_ledger, and exchange_group_id column on sales.

Revision ID: 0006_returns_and_exchanges
Revises: 0005_inventory_and_transfers
Create Date: 2026-10-21 11:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0006_returns_and_exchanges"
down_revision: str | None = "0005_inventory_and_transfers"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

json_type = postgresql.JSONB().with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    # 1. Add exchange_group_id to sales table
    op.add_column(
        "sales",
        sa.Column("exchange_group_id", sa.Uuid(as_uuid=True), nullable=True),
    )
    op.create_index("ix_sales_exchange_group_id", "sales", ["exchange_group_id"])

    # 2. Sale Line Return State (Row-level concurrency guard for partial returns)
    op.create_table(
        "sale_line_return_states",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            "sale_line_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("sale_lines.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
        ),
        sa.Column("sold_qty", sa.Integer(), nullable=False),
        sa.Column("returned_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reserved_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint("sold_qty > 0", name="chk_return_state_sold_qty_positive"),
        sa.CheckConstraint("returned_qty >= 0", name="chk_return_state_returned_qty_non_negative"),
        sa.CheckConstraint("reserved_qty >= 0", name="chk_return_state_reserved_qty_non_negative"),
        sa.CheckConstraint(
            "returned_qty + reserved_qty <= sold_qty", name="chk_return_state_sum_lte_sold"
        ),
    )

    # 3. Sale Returns (Main Return / Exchange document)
    op.create_table(
        "sale_returns",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("return_no", sa.String(length=50), nullable=False, unique=True, index=True),
        sa.Column(
            "original_sale_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("sales.id", ondelete="RESTRICT"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "company_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "branch_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("branches.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "register_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("cash_registers.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "shift_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("pos_shifts.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "processed_by_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        ),
        sa.Column("customer_id", sa.Uuid(as_uuid=True), nullable=True, index=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="COMPLETED", index=True),
        sa.Column("return_type", sa.String(length=30), nullable=False, server_default="REFUND", index=True),
        sa.Column("subtotal", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("discount_reversal_total", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("tax_reversal_total", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("refund_total", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("cost_total", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="AZN"),
        sa.Column("refund_method_breakdown", json_type, nullable=True),
        sa.Column("reason_summary", sa.String(length=500), nullable=True),
        sa.Column("approval_reference", sa.String(length=255), nullable=True),
        sa.Column("approved_by_id", sa.Uuid(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("exchange_group_id", sa.Uuid(as_uuid=True), nullable=True, index=True),
        sa.Column("reprint_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("business_date", sa.Date(), nullable=False, index=True),
        sa.Column("correlation_id", sa.String(length=100), nullable=True, index=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
            index=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint("refund_total >= 0", name="chk_sale_return_refund_total_non_negative"),
    )
    op.create_index(
        "ix_sale_returns_branch_business_date", "sale_returns", ["branch_id", "business_date"]
    )
    op.create_index(
        "ix_sale_returns_register_created_at", "sale_returns", ["register_id", "created_at"]
    )

    # 4. Sale Return Lines
    op.create_table(
        "sale_return_lines",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            "sale_return_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("sale_returns.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("line_no", sa.Integer(), nullable=False),
        sa.Column(
            "original_sale_line_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("sale_lines.id", ondelete="RESTRICT"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "variant_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("product_variants.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "product_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("sku", sa.String(length=100), nullable=False),
        sa.Column("product_name", sa.String(length=255), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("reason_code", sa.String(length=50), nullable=False),
        sa.Column("condition", sa.String(length=30), nullable=False),
        sa.Column("unit_price", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("cost_price", sa.Numeric(precision=14, scale=4), nullable=False, server_default="0.0000"),
        sa.Column("gross_amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("discount_amount", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("tax_rate", sa.Numeric(precision=5, scale=2), nullable=False, server_default="0.00"),
        sa.Column("tax_amount", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("refund_amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("destination_warehouse_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("destination_status", sa.String(length=30), nullable=False, server_default="available"),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint("quantity > 0", name="chk_sale_return_line_qty_positive"),
        sa.CheckConstraint("refund_amount >= 0", name="chk_sale_return_line_refund_non_negative"),
        sa.UniqueConstraint("sale_return_id", "line_no", name="uq_sale_return_line_return_no"),
    )

    # 5. Refunds (Financial settlement)
    op.create_table(
        "refunds",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            "sale_return_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("sale_returns.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("tender_type", sa.String(length=50), nullable=False, index=True),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("provider_reference", sa.String(length=100), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="COMPLETED", index=True),
        sa.Column("payment_attempt_id", sa.Uuid(as_uuid=True), nullable=True, index=True),
        sa.Column("approval_code", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint("amount > 0", name="chk_refund_amount_positive"),
    )

    # 6. Store Credit Ledger (Append-only)
    op.create_table(
        "store_credit_ledger",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("customer_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column(
            "company_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("entry_type", sa.String(length=30), nullable=False, index=True),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("reference_type", sa.String(length=50), nullable=False, index=True),
        sa.Column("reference_id", sa.Uuid(as_uuid=True), nullable=True, index=True),
        sa.Column("balance_after", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
            index=True,
        ),
        sa.CheckConstraint("amount > 0", name="chk_store_credit_amount_positive"),
        sa.CheckConstraint("balance_after >= 0", name="chk_store_credit_balance_after_non_negative"),
    )
    op.create_index(
        "ix_store_credit_customer_created", "store_credit_ledger", ["customer_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_table("store_credit_ledger")
    op.drop_table("refunds")
    op.drop_table("sale_return_lines")
    op.drop_table("sale_returns")
    op.drop_table("sale_line_return_states")
    op.drop_index("ix_sales_exchange_group_id", table_name="sales")
    op.drop_column("sales", "exchange_group_id")

