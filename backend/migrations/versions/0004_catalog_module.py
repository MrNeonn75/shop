"""Catalog module migration (Products, Variants, Categories, Brands, Attributes, Prices, Costs, Imports).

Revision ID: 0004_catalog_module
Revises: 0003_company_branches_warehouses_settings_numbering
Create Date: 2026-10-19 20:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0004_catalog_module"
down_revision: str | None = "0003_company_branches_warehouses_settings_numbering"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

json_type = postgresql.JSONB().with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    # 1. Categories
    op.create_table(
        "categories",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_id", sa.Uuid(as_uuid=True), sa.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("path", sa.String(length=255), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("redirect_category_id", sa.Uuid(as_uuid=True), sa.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("default_min_stock", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_categories_company_id", "categories", ["company_id"])
    op.create_index("ix_categories_parent_id", "categories", ["parent_id"])
    op.create_index("ix_categories_code", "categories", ["code"])
    op.create_index("ix_categories_path", "categories", ["path"])

    # 2. Brands
    op.create_table(
        "brands",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("logo_url", sa.String(length=500), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_brands_company_id", "brands", ["company_id"])
    op.create_index("ix_brands_code", "brands", ["code"])

    # 3. Units of Measure
    op.create_table(
        "units_of_measure",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(length=20), nullable=False, unique=True),
        sa.Column("name_az", sa.String(length=50), nullable=False),
        sa.Column("precision", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_units_of_measure_code", "units_of_measure", ["code"])

    # 4. Tax Classes
    op.create_table(
        "tax_classes",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name_az", sa.String(length=100), nullable=False),
        sa.Column("rate_ref", sa.String(length=50), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_tax_classes_company_id", "tax_classes", ["company_id"])
    op.create_index("ix_tax_classes_code", "tax_classes", ["code"])

    # 5. Product Attributes
    op.create_table(
        "product_attributes",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("attribute_type", sa.String(length=20), nullable=False, server_default="select"),
        sa.Column("is_variant_defining", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_product_attributes_company_id", "product_attributes", ["company_id"])
    op.create_index("ix_product_attributes_code", "product_attributes", ["code"])

    # 6. Product Attribute Values
    op.create_table(
        "product_attribute_values",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("attribute_id", sa.Uuid(as_uuid=True), sa.ForeignKey("product_attributes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("value", sa.String(length=100), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("color_hex", sa.String(length=20), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_product_attribute_values_attribute_id", "product_attribute_values", ["attribute_id"])

    # 7. Products
    op.create_table(
        "products",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("internal_code", sa.String(length=50), nullable=False, unique=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("normalized_name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("section", sa.String(length=50), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("category_id", sa.Uuid(as_uuid=True), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("subcategory_id", sa.Uuid(as_uuid=True), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("brand_id", sa.Uuid(as_uuid=True), sa.ForeignKey("brands.id"), nullable=True),
        sa.Column("unit_id", sa.Uuid(as_uuid=True), sa.ForeignKey("units_of_measure.id"), nullable=True),
        sa.Column("tax_class_id", sa.Uuid(as_uuid=True), sa.ForeignKey("tax_classes.id"), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("is_sell_through", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("min_stock_default", sa.Integer(), nullable=True),
        sa.Column("attributes_schema", json_type, nullable=True),
        sa.Column("created_by", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_products_company_id", "products", ["company_id"])
    op.create_index("ix_products_internal_code", "products", ["internal_code"])
    op.create_index("ix_products_name", "products", ["name"])
    op.create_index("ix_products_normalized_name", "products", ["normalized_name"])
    op.create_index("ix_products_section", "products", ["section"])
    op.create_index("ix_products_type", "products", ["type"])
    op.create_index("ix_products_category_id", "products", ["category_id"])
    op.create_index("ix_products_subcategory_id", "products", ["subcategory_id"])
    op.create_index("ix_products_brand_id", "products", ["brand_id"])
    op.create_index("ix_products_status", "products", ["status"])

    # 8. Product Variants
    op.create_table(
        "product_variants",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("product_id", sa.Uuid(as_uuid=True), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sku", sa.String(length=100), nullable=False, unique=True),
        sa.Column("barcode", sa.String(length=100), nullable=True, unique=True),
        sa.Column("size", sa.String(length=50), nullable=True),
        sa.Column("color", sa.String(length=50), nullable=True),
        sa.Column("other_attributes", json_type, nullable=True),
        sa.Column("attributes_hash", sa.String(length=64), nullable=False),
        sa.Column("price_override", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("cost_price", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("min_stock", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_product_variants_product_id", "product_variants", ["product_id"])
    op.create_index("ix_product_variants_company_id", "product_variants", ["company_id"])
    op.create_index("ix_product_variants_sku", "product_variants", ["sku"])
    op.create_index("ix_product_variants_barcode", "product_variants", ["barcode"])
    op.create_index("ix_product_variants_size", "product_variants", ["size"])
    op.create_index("ix_product_variants_color", "product_variants", ["color"])
    op.create_index("ix_product_variants_attributes_hash", "product_variants", ["attributes_hash"])
    op.create_index("ix_product_variants_status", "product_variants", ["status"])
    op.create_index("uq_product_variant_attributes", "product_variants", ["product_id", "attributes_hash"], unique=True)

    # 9. Product Images
    op.create_table(
        "product_images",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("product_id", sa.Uuid(as_uuid=True), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("variant_id", sa.Uuid(as_uuid=True), sa.ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True),
        sa.Column("url", sa.String(length=500), nullable=False),
        sa.Column("thumbnail_url", sa.String(length=500), nullable=True),
        sa.Column("file_key", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_product_images_product_id", "product_images", ["product_id"])
    op.create_index("ix_product_images_variant_id", "product_images", ["variant_id"])

    # 10. Product Suppliers
    op.create_table(
        "product_suppliers",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("product_id", sa.Uuid(as_uuid=True), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("supplier_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("supplier_sku", sa.String(length=100), nullable=True),
        sa.Column("last_price", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="AZN"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_product_suppliers_product_id", "product_suppliers", ["product_id"])
    op.create_index("ix_product_suppliers_supplier_id", "product_suppliers", ["supplier_id"])

    # 11. Price Lists
    op.create_table(
        "price_lists",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("branch_id", sa.Uuid(as_uuid=True), sa.ForeignKey("branches.id", ondelete="SET NULL"), nullable=True),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="AZN"),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_price_lists_company_id", "price_lists", ["company_id"])
    op.create_index("ix_price_lists_branch_id", "price_lists", ["branch_id"])
    op.create_index("ix_price_lists_code", "price_lists", ["code"])

    # 12. Price List Items
    op.create_table(
        "price_list_items",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("price_list_id", sa.Uuid(as_uuid=True), sa.ForeignKey("price_lists.id", ondelete="CASCADE"), nullable=False),
        sa.Column("variant_id", sa.Uuid(as_uuid=True), sa.ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("price", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_price_list_items_price_list_id", "price_list_items", ["price_list_id"])
    op.create_index("ix_price_list_items_variant_id", "price_list_items", ["variant_id"])

    # 13. Price History
    op.create_table(
        "price_history",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("variant_id", sa.Uuid(as_uuid=True), sa.ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.Uuid(as_uuid=True), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("price_list_id", sa.Uuid(as_uuid=True), sa.ForeignKey("price_lists.id", ondelete="SET NULL"), nullable=True),
        sa.Column("branch_id", sa.Uuid(as_uuid=True), sa.ForeignKey("branches.id", ondelete="SET NULL"), nullable=True),
        sa.Column("value", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="AZN"),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("changed_by", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("reason", sa.String(length=255), nullable=True),
        sa.Column("source", sa.String(length=50), nullable=False, server_default="manual"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_price_history_variant_id", "price_history", ["variant_id"])
    op.create_index("ix_price_history_product_id", "price_history", ["product_id"])
    op.create_index("ix_price_history_effective_from", "price_history", ["effective_from"])
    op.create_index("ix_price_history_effective_to", "price_history", ["effective_to"])

    # 14. Cost History
    op.create_table(
        "cost_history",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("variant_id", sa.Uuid(as_uuid=True), sa.ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.Uuid(as_uuid=True), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("value", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="AZN"),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("changed_by", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("reason", sa.String(length=255), nullable=True),
        sa.Column("source", sa.String(length=50), nullable=False, server_default="manual"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_cost_history_variant_id", "cost_history", ["variant_id"])
    op.create_index("ix_cost_history_product_id", "cost_history", ["product_id"])
    op.create_index("ix_cost_history_effective_from", "cost_history", ["effective_from"])
    op.create_index("ix_cost_history_effective_to", "cost_history", ["effective_to"])

    # 15. External Refs
    op.create_table(
        "external_refs",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("internal_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("system_name", sa.String(length=50), nullable=False, server_default="brendhouse_site"),
        sa.Column("external_id", sa.String(length=150), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="NOT_CONFIGURED"),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata_json", json_type, nullable=True),
    )
    op.create_index("ix_external_refs_entity_type", "external_refs", ["entity_type"])
    op.create_index("ix_external_refs_internal_id", "external_refs", ["internal_id"])
    op.create_index("ix_external_refs_system_name", "external_refs", ["system_name"])
    op.create_index("ix_external_refs_external_id", "external_refs", ["external_id"])

    # 16. Import Jobs
    op.create_table(
        "import_jobs",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("company_id", sa.Uuid(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("file_type", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="UPLOADED"),
        sa.Column("mode", sa.String(length=20), nullable=False, server_default="all_or_nothing"),
        sa.Column("total_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("valid_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("committed_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("errors_summary", json_type, nullable=True),
        sa.Column("created_by", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_import_jobs_company_id", "import_jobs", ["company_id"])
    op.create_index("ix_import_jobs_status", "import_jobs", ["status"])

    # 17. Import Rows
    op.create_table(
        "import_rows",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("job_id", sa.Uuid(as_uuid=True), sa.ForeignKey("import_jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("row_number", sa.Integer(), nullable=False),
        sa.Column("raw_data", json_type, nullable=False),
        sa.Column("parsed_data", json_type, nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="PENDING"),
        sa.Column("error_message", sa.Text(), nullable=True),
    )
    op.create_index("ix_import_rows_job_id", "import_rows", ["job_id"])


def downgrade() -> None:
    op.drop_table("import_rows")
    op.drop_table("import_jobs")
    op.drop_table("external_refs")
    op.drop_table("cost_history")
    op.drop_table("price_history")
    op.drop_table("price_list_items")
    op.drop_table("price_lists")
    op.drop_table("product_suppliers")
    op.drop_table("product_images")
    op.drop_table("product_variants")
    op.drop_table("products")
    op.drop_table("product_attribute_values")
    op.drop_table("product_attributes")
    op.drop_table("tax_classes")
    op.drop_table("units_of_measure")
    op.drop_table("brands")
    op.drop_table("categories")

