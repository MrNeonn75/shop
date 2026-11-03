"""Company, Branches, Warehouses, Cash Registers, Settings, Numbering, and Integrations migration.

Revision ID: 0003_company_branches_warehouses_settings_numbering
Revises: 0002_auth_users_rbac_sessions_audit
Create Date: 2026-10-19 18:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0003_company_branches_warehouses_settings_numbering"
down_revision: str | None = "0002_auth_users_rbac_sessions_audit"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

json_type = postgresql.JSONB().with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    # 1. Companies
    op.create_table(
        "companies",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("legal_name", sa.String(length=200), nullable=False),
        sa.Column("tax_id", sa.String(length=20), nullable=False),
        sa.Column("address", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=50), nullable=False),
        sa.Column("email", sa.String(length=100), nullable=False),
        sa.Column("website", sa.String(length=100), nullable=True),
        sa.Column("logo_url", sa.String(length=255), nullable=True),
        sa.Column("default_currency", sa.String(length=3), nullable=False, server_default="AZN"),
        sa.Column("timezone", sa.String(length=50), nullable=False, server_default="Asia/Baku"),
        sa.Column("default_language", sa.String(length=5), nullable=False, server_default="az"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_companies_code", "companies", ["code"], unique=True)

    # 2. Branches
    op.create_table(
        "branches",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("address", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=50), nullable=False),
        sa.Column("email", sa.String(length=100), nullable=True),
        sa.Column("manager_user_id", sa.Uuid(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("operating_hours", json_type, nullable=True),
        sa.Column("exceptions", json_type, nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("settings", json_type, nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_branches_code", "branches", ["code"], unique=True)
    op.create_index("ix_branches_company_status", "branches", ["company_id", "status"])

    # 3. Warehouses
    op.create_table(
        "warehouses",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("branch_id", sa.Uuid(as_uuid=True), sa.ForeignKey("branches.id", ondelete="CASCADE"), nullable=True),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("warehouse_type", sa.String(length=30), nullable=False, server_default="branch"),
        sa.Column("address", sa.String(length=255), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_default_for_sales", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_warehouses_code", "warehouses", ["code"], unique=True)
    op.create_index("ix_warehouses_branch_type", "warehouses", ["branch_id", "warehouse_type"])
    op.create_index("ix_warehouses_company_status", "warehouses", ["company_id", "status"])

    # 4. Warehouse Zones
    op.create_table(
        "warehouse_zones",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("warehouse_id", sa.Uuid(as_uuid=True), sa.ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_warehouse_zones_code", "warehouse_zones", ["warehouse_id", "code"], unique=True)

    # 5. Cash Registers
    op.create_table(
        "cash_registers",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("branch_id", sa.Uuid(as_uuid=True), sa.ForeignKey("branches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("default_warehouse_id", sa.Uuid(as_uuid=True), sa.ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("device_binding_info", json_type, nullable=True),
        sa.Column("receipt_printer_profile_ref", sa.String(length=100), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_cash_registers_branch_code", "cash_registers", ["branch_id", "code"], unique=True)

    # 6. Setting Values (Versioned, never overwritten)
    op.create_table(
        "setting_values",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("branch_id", sa.Uuid(as_uuid=True), sa.ForeignKey("branches.id", ondelete="CASCADE"), nullable=True),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("value", json_type, nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("updated_by", sa.Uuid(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_setting_values_lookup", "setting_values", ["key", "branch_id", "effective_from"])

    # 7. Reason Codes
    op.create_table(
        "reason_codes",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name_az", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("usage_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_reason_codes_cat_code", "reason_codes", ["category", "code"], unique=True)

    # 8. Numbering Sequences
    op.create_table(
        "numbering_sequences",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("branch_id", sa.Uuid(as_uuid=True), sa.ForeignKey("branches.id", ondelete="CASCADE"), nullable=True),
        sa.Column("register_id", sa.Uuid(as_uuid=True), sa.ForeignKey("cash_registers.id", ondelete="CASCADE"), nullable=True),
        sa.Column("document_type", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("prefix", sa.String(length=20), nullable=False, server_default=""),
        sa.Column("pattern", sa.String(length=100), nullable=False, server_default="{PREFIX}-{YYYY}-{SEQ:6}"),
        sa.Column("reset_rule", sa.String(length=20), nullable=False, server_default="never"),
        sa.Column("scope", sa.String(length=20), nullable=False, server_default="company"),
        sa.Column("current_sequence", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_reset_date", sa.Date(), nullable=True),
        sa.Column("is_gapless", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_numbering_sequences_lookup", "numbering_sequences", ["company_id", "document_type", "branch_id", "register_id"])

    # 9. Allocated Numbers
    op.create_table(
        "allocated_numbers",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_type", sa.String(length=50), nullable=False),
        sa.Column("number", sa.String(length=100), nullable=False),
        sa.Column("sequence_id", sa.Uuid(as_uuid=True), sa.ForeignKey("numbering_sequences.id", ondelete="CASCADE"), nullable=False),
        sa.Column("branch_id", sa.Uuid(as_uuid=True), sa.ForeignKey("branches.id", ondelete="SET NULL"), nullable=True),
        sa.Column("register_id", sa.Uuid(as_uuid=True), sa.ForeignKey("cash_registers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("allocated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("allocated_by", sa.Uuid(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("uq_allocated_numbers_doc_num", "allocated_numbers", ["document_type", "number"], unique=True)

    # 10. Integrations
    op.create_table(
        "integrations",
        sa.Column("key", sa.String(length=50), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("integration_type", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="NOT_CONFIGURED"),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("config_ref", sa.String(length=150), nullable=True),
        sa.Column("masked_display", sa.String(length=200), nullable=True),
        sa.Column("encrypted_secrets", sa.Text(), nullable=True),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # 11. Integration Call Logs
    op.create_table(
        "integration_call_logs",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("integration_key", sa.String(length=50), sa.ForeignKey("integrations.key", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("response_time_ms", sa.Integer(), nullable=True),
        sa.Column("request_payload", json_type, nullable=True),
        sa.Column("response_payload", json_type, nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_call_logs_key_time", "integration_call_logs", ["integration_key", "created_at"])


def downgrade() -> None:
    op.drop_table("integration_call_logs")
    op.drop_table("integrations")
    op.drop_table("allocated_numbers")
    op.drop_table("numbering_sequences")
    op.drop_table("reason_codes")
    op.drop_table("setting_values")
    op.drop_table("cash_registers")
    op.drop_table("warehouse_zones")
    op.drop_table("warehouses")
    op.drop_table("branches")
    op.drop_table("companies")

