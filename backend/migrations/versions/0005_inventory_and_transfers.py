"""Inventory and Transfers module migration.

Stock Ledger (append-only), Balances, Reservations, Cost State, Snapshots,
Stock Documents, Physical Count Sessions, Transfers, and Receiving Events.

Revision ID: 0005_inventory_and_transfers
Revises: 0004_catalog_module
Create Date: 2026-10-19 22:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0005_inventory_and_transfers"
down_revision: str | None = "0004_catalog_module"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

json_type = postgresql.JSONB().with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    # 1. Stock Movements (Append-Only Ledger)
    op.create_table(
        "stock_movements",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("movement_no", sa.String(length=50), nullable=False, index=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP"), index=True),
        sa.Column("variant_id", sa.Uuid(as_uuid=True), sa.ForeignKey("product_variants.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("from_warehouse_id", sa.Uuid(as_uuid=True), sa.ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=True, index=True),
        sa.Column("to_warehouse_id", sa.Uuid(as_uuid=True), sa.ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=True, index=True),
        sa.Column("from_status", sa.String(length=20), nullable=True, server_default="available"),
        sa.Column("to_status", sa.String(length=20), nullable=True, server_default="available"),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("movement_type", sa.String(length=30), nullable=False, index=True),
        sa.Column("reference_type", sa.String(length=50), nullable=False, index=True),
        sa.Column("reference_id", sa.Uuid(as_uuid=True), nullable=True, index=True),
        sa.Column("reference_line_id", sa.Uuid(as_uuid=True), nullable=True, index=True),
        sa.Column("reverses_movement_id", sa.Uuid(as_uuid=True), sa.ForeignKey("stock_movements.id", ondelete="RESTRICT"), nullable=True, index=True),
        sa.Column("unit_cost", sa.Numeric(precision=15, scale=4), nullable=False, server_default="0.0000"),
        sa.Column("total_cost", sa.Numeric(precision=15, scale=4), nullable=False, server_default="0.0000"),
        sa.Column("user_id", sa.Uuid(as_uuid=True), nullable=True, index=True),
        sa.Column("reason_code_id", sa.String(length=50), nullable=True),
        sa.Column("correlation_id", sa.String(length=100), nullable=True),
        sa.Column("idempotency_key", sa.String(length=100), nullable=True, index=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.CheckConstraint("quantity > 0", name="chk_stock_movements_qty_positive"),
        sa.CheckConstraint("from_warehouse_id IS NOT NULL OR to_warehouse_id IS NOT NULL", name="chk_stock_movements_has_location"),
        sa.CheckConstraint(
            "(from_warehouse_id IS NULL OR to_warehouse_id IS NULL) OR "
            "(from_warehouse_id != to_warehouse_id OR from_status != to_status)",
            name="chk_stock_movements_locations_differ",
        ),
        sa.UniqueConstraint("company_id", "movement_no", name="uq_stock_movements_no"),
    )
    op.create_index("ix_stock_movements_variant_posted", "stock_movements", ["variant_id", "posted_at"])
    op.create_index("ix_stock_movements_from_posted", "stock_movements", ["from_warehouse_id", "posted_at"])
    op.create_index("ix_stock_movements_to_posted", "stock_movements", ["to_warehouse_id", "posted_at"])
    op.create_index("ix_stock_movements_ref", "stock_movements", ["reference_type", "reference_id"])

    # PostgreSQL Append-Only immutability rules
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE OR REPLACE RULE no_update_stock_movements AS ON UPDATE TO stock_movements DO INSTEAD NOTHING;")
        op.execute("CREATE OR REPLACE RULE no_delete_stock_movements AS ON DELETE TO stock_movements DO INSTEAD NOTHING;")

    # 2. Stock Balances
    op.create_table(
        "stock_balances",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("warehouse_id", sa.Uuid(as_uuid=True), sa.ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("variant_id", sa.Uuid(as_uuid=True), sa.ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("stock_status", sa.String(length=20), nullable=False, server_default="available"),
        sa.Column("on_hand", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("allow_negative", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("warehouse_id", "variant_id", "stock_status", name="uq_stock_balances_loc_var_status"),
        sa.CheckConstraint("on_hand >= 0 OR allow_negative IS TRUE", name="chk_stock_balances_non_negative"),
    )
    op.create_index("ix_stock_balances_warehouse_onhand", "stock_balances", ["warehouse_id", "on_hand"])
    op.create_index("ix_stock_balances_variant_onhand", "stock_balances", ["variant_id", "on_hand"])

    # 3. Stock Reservations
    op.create_table(
        "stock_reservations",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("warehouse_id", sa.Uuid(as_uuid=True), sa.ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("variant_id", sa.Uuid(as_uuid=True), sa.ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("reference_type", sa.String(length=50), nullable=False, index=True),
        sa.Column("reference_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("reference_line_id", sa.Uuid(as_uuid=True), nullable=True, index=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active", index=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.CheckConstraint("quantity > 0", name="chk_stock_reservations_qty_positive"),
    )
    op.create_index("ix_stock_reservations_active", "stock_reservations", ["warehouse_id", "variant_id", "status"])

    # 4. Inventory Cost State
    op.create_table(
        "inventory_cost_state",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("warehouse_id", sa.Uuid(as_uuid=True), sa.ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("variant_id", sa.Uuid(as_uuid=True), sa.ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("valuation_method", sa.String(length=30), nullable=False, server_default="weighted_average"),
        sa.Column("total_quantity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_value", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0.0000"),
        sa.Column("unit_cost", sa.Numeric(precision=15, scale=4), nullable=False, server_default="0.0000"),
        sa.Column("last_updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("company_id", "warehouse_id", "variant_id", name="uq_inventory_cost_state_scope"),
    )

    # 5. Stock Snapshots
    op.create_table(
        "stock_snapshots",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("warehouse_id", sa.Uuid(as_uuid=True), sa.ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("variant_id", sa.Uuid(as_uuid=True), sa.ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("stock_status", sa.String(length=20), nullable=False, server_default="available"),
        sa.Column("snapshot_date", sa.Date(), nullable=False, index=True),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unit_cost", sa.Numeric(precision=15, scale=4), nullable=False, server_default="0.0000"),
        sa.Column("total_value", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0.0000"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("warehouse_id", "variant_id", "stock_status", "snapshot_date", name="uq_stock_snapshots_day"),
    )
    op.create_index("ix_stock_snapshots_date_loc", "stock_snapshots", ["snapshot_date", "warehouse_id"])

    # 6. Stock Documents
    op.create_table(
        "stock_documents",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("document_no", sa.String(length=50), nullable=False, index=True),
        sa.Column("document_type", sa.String(length=30), nullable=False, index=True),
        sa.Column("warehouse_id", sa.Uuid(as_uuid=True), sa.ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("target_warehouse_id", sa.Uuid(as_uuid=True), sa.ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft", index=True),
        sa.Column("total_items", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_quantity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_cost", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0.0000"),
        sa.Column("creator_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("approver_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reversed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reversal_document_id", sa.Uuid(as_uuid=True), sa.ForeignKey("stock_documents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reason_code", sa.String(length=50), nullable=True),
        sa.Column("reason_text", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("attachments", json_type, nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("company_id", "document_no", name="uq_stock_documents_no"),
    )
    op.create_index("ix_stock_documents_warehouse_status", "stock_documents", ["warehouse_id", "status"])

    # 7. Stock Document Lines
    op.create_table(
        "stock_document_lines",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("document_id", sa.Uuid(as_uuid=True), sa.ForeignKey("stock_documents.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("line_no", sa.Integer(), nullable=False),
        sa.Column("variant_id", sa.Uuid(as_uuid=True), sa.ForeignKey("product_variants.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_cost", sa.Numeric(precision=15, scale=4), nullable=False, server_default="0.0000"),
        sa.Column("total_cost", sa.Numeric(precision=15, scale=4), nullable=False, server_default="0.0000"),
        sa.Column("target_status", sa.String(length=20), nullable=False, server_default="available"),
        sa.Column("notes", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.CheckConstraint("quantity > 0", name="chk_stock_doc_lines_qty_positive"),
        sa.UniqueConstraint("document_id", "line_no", name="uq_stock_doc_lines_no"),
    )

    # 8. Count Sessions
    op.create_table(
        "count_sessions",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("warehouse_id", sa.Uuid(as_uuid=True), sa.ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("session_no", sa.String(length=50), nullable=False, index=True),
        sa.Column("count_scope", sa.String(length=30), nullable=False, server_default="full"),
        sa.Column("category_id", sa.Uuid(as_uuid=True), sa.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft", index=True),
        sa.Column("blind_count", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("frozen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("watermark_movement_id", sa.Uuid(as_uuid=True), sa.ForeignKey("stock_movements.id", ondelete="SET NULL"), nullable=True),
        sa.Column("creator_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("approver_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("adjustment_document_id", sa.Uuid(as_uuid=True), sa.ForeignKey("stock_documents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("company_id", "session_no", name="uq_count_sessions_no"),
    )
    op.create_index("ix_count_sessions_warehouse_status", "count_sessions", ["warehouse_id", "status"])

    # 9. Count Session Lines
    op.create_table(
        "count_session_lines",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("session_id", sa.Uuid(as_uuid=True), sa.ForeignKey("count_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("variant_id", sa.Uuid(as_uuid=True), sa.ForeignKey("product_variants.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("snapshot_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("net_movements_since_freeze", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expected_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("counted_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("variance_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unit_cost", sa.Numeric(precision=15, scale=4), nullable=False, server_default="0.0000"),
        sa.Column("variance_value", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0.0000"),
        sa.Column("notes", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("session_id", "variant_id", name="uq_count_session_lines_variant"),
    )

    # 10. Count Entries
    op.create_table(
        "count_entries",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("session_id", sa.Uuid(as_uuid=True), sa.ForeignKey("count_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("variant_id", sa.Uuid(as_uuid=True), sa.ForeignKey("product_variants.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("counter_user_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("device_id", sa.String(length=100), nullable=True),
        sa.Column("counted_qty", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("scan_barcode", sa.String(length=100), nullable=True),
        sa.Column("is_undone", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("entered_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_count_entries_session_var", "count_entries", ["session_id", "variant_id"])

    # 11. Stock Transfers
    op.create_table(
        "stock_transfers",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("transfer_no", sa.String(length=50), nullable=False, index=True),
        sa.Column("source_warehouse_id", sa.Uuid(as_uuid=True), sa.ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("destination_warehouse_id", sa.Uuid(as_uuid=True), sa.ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("in_transit_warehouse_id", sa.Uuid(as_uuid=True), sa.ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="DRAFT", index=True),
        sa.Column("total_lines", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_requested_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_picked_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_dispatched_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_received_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_cost", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0.0000"),
        sa.Column("creator_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("approver_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("dispatched_by_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancellation_reason", sa.String(length=255), nullable=True),
        sa.Column("shipping_method", sa.String(length=100), nullable=True),
        sa.Column("tracking_number", sa.String(length=100), nullable=True),
        sa.Column("vehicle_no", sa.String(length=50), nullable=True),
        sa.Column("driver_name", sa.String(length=100), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.CheckConstraint("source_warehouse_id != destination_warehouse_id", name="chk_stock_transfers_different_warehouses"),
        sa.UniqueConstraint("company_id", "transfer_no", name="uq_stock_transfers_no"),
    )
    op.create_index("ix_stock_transfers_source_status", "stock_transfers", ["source_warehouse_id", "status"])
    op.create_index("ix_stock_transfers_dest_status", "stock_transfers", ["destination_warehouse_id", "status"])

    # 12. Stock Transfer Lines
    op.create_table(
        "stock_transfer_lines",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("transfer_id", sa.Uuid(as_uuid=True), sa.ForeignKey("stock_transfers.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("line_no", sa.Integer(), nullable=False),
        sa.Column("variant_id", sa.Uuid(as_uuid=True), sa.ForeignKey("product_variants.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("requested_qty", sa.Integer(), nullable=False),
        sa.Column("picked_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("short_pick_reason", sa.String(length=255), nullable=True),
        sa.Column("dispatched_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("received_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("damaged_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("missing_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unit_cost", sa.Numeric(precision=15, scale=4), nullable=False, server_default="0.0000"),
        sa.Column("total_cost", sa.Numeric(precision=15, scale=4), nullable=False, server_default="0.0000"),
        sa.Column("notes", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.CheckConstraint("requested_qty > 0", name="chk_stock_transfer_lines_qty_positive"),
        sa.UniqueConstraint("transfer_id", "line_no", name="uq_stock_transfer_lines_no"),
    )

    # 13. Transfer Receiving Events
    op.create_table(
        "transfer_receiving_events",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("transfer_id", sa.Uuid(as_uuid=True), sa.ForeignKey("stock_transfers.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("receipt_no", sa.String(length=50), nullable=False, index=True),
        sa.Column("received_by_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("idempotency_key", sa.String(length=100), nullable=True, index=True),
        sa.Column("is_final", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # 14. Transfer Receiving Lines
    op.create_table(
        "transfer_receiving_lines",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("receiving_event_id", sa.Uuid(as_uuid=True), sa.ForeignKey("transfer_receiving_events.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("transfer_line_id", sa.Uuid(as_uuid=True), sa.ForeignKey("stock_transfer_lines.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("variant_id", sa.Uuid(as_uuid=True), sa.ForeignKey("product_variants.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("received_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("damaged_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("missing_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP RULE IF EXISTS no_delete_stock_movements ON stock_movements;")
        op.execute("DROP RULE IF EXISTS no_update_stock_movements ON stock_movements;")

    op.drop_table("transfer_receiving_lines")
    op.drop_table("transfer_receiving_events")
    op.drop_table("stock_transfer_lines")
    op.drop_table("stock_transfers")
    op.drop_table("count_entries")
    op.drop_table("count_session_lines")
    op.drop_table("count_sessions")
    op.drop_table("stock_document_lines")
    op.drop_table("stock_documents")
    op.drop_table("stock_snapshots")
    op.drop_table("inventory_cost_state")
    op.drop_table("stock_reservations")
    op.drop_table("stock_balances")
    op.drop_table("stock_movements")

