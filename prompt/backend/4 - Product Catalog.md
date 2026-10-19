
GOAL: Build module `catalog` matching frontend F4 (product list/detail, variant matrix, categories, brands, import/export, labels, price/cost history).

1) DATA MODEL
- categories: tree (section → type → category → subcategory); sections Kişi/Qadın/Uşaq/Digər and types Geyim/Ayaqqabı/Aksesuar seeded; category names seeded from the store taxonomy (Atlet, Bluz, Crop, Don, Dəst, Gödəkcə, Hırka, Jaket, Jilet, Kalqotka və lasin, Kardiqan, Kazak, Köynək, Küləklik, Mayka, Palto, Papaq və əlcək, Pencək, Polo, Şalvar, Şortik, Sweatshirt, Topik, Trençkot, Tshirt, Tulum, Tunik, Ətək, Ayaqqabı, Çanta və pulqabı, Oyuncaq). Use closure table or ltree for efficient subtree queries; cycle prevention; disabling a category with active products requires a reassignment plan.
- brands (name unique case-insensitive, logo, active).
- units_of_measure; tax_class_id referencing settings tax classes (no hardcoded rates).
- products (parent/style level): id, internal_code (unique), name, description, section, type, category_id, subcategory_id, brand_id, unit_id, tax_class_id, status (active/discontinued/draft), min_stock_default, attributes schema, created/updated metadata, version, search vector (PostgreSQL full-text + trigram for Azerbaijani names, accent-insensitive search that handles ə, ı, ö, ü, ç, ş, ğ, İ properly).
- product_attributes (Ölçü, Rəng, Üslub, Model + custom) and attribute_values; variants (SELLABLE units): id, product_id, sku (unique globally, case-insensitive, normalized), barcode (unique globally when present, EAN-13 checksum validated, support Code128 for internal codes), size, color, other attribute values (jsonb validated), price override (nullable), min_stock, status, version. Unique constraint on (product_id, size, color, other-attrs hash) to prevent duplicate variants.
- Single-variant products (accessories) supported by one default variant.
- product_images (variant or product level, ordering, primary flag; file storage abstraction: local/S3-compatible with signed URLs; validate MIME by content, size limit, strip metadata, generate thumbnails in a background job).
- product_suppliers (supplier_id via suppliers service interface, supplier_sku, last_price) — table created here, populated by B6.
- price_history and cost_history: APPEND-ONLY tables (variant_id or product_id, value, effective_from, effective_to, changed_by, reason, source). Price lookup function `price_at(variant, branch, datetime)` honoring branch-specific price lists later (design price_lists with price_list_items now: default list + optional branch lists, effective dating).
- Changing price/cost never mutates old rows; closes the previous period and inserts a new one in one transaction. Historical transactions store their own price snapshot (enforced in B7/B8; provide the service contract here).

2) BUSINESS RULES
- SKU/barcode uniqueness errors return field-level 409 with the conflicting variant reference (permission-gated detail).
- Generating variants from a size × color matrix: endpoint POST /products/{id}/variants/generate (dry-run mode returns what would be created and conflicts; commit mode idempotent via Idempotency-Key).
- SKU auto-suggestion service with configurable pattern (e.g. {BRAND3}-{CODE}-{SIZE}-{COLOR}); barcode generator for internal EAN-13 (company prefix from settings, sequential, checksum) allocated via numbering-style gapless-safe counter.
- Discontinuing a product: allowed with stock (flag "sell-through only" option); blocks new purchase orders but permits sales and returns; reactivation allowed.
- Cost data is sensitive: serializers hide cost/margin unless catalog.cost.view; price changes beyond configured % require approval (approval workflow hook) and reason.
- Minimum stock level precedence: variant → product → category default → setting default.

3) ENDPOINTS
- Products: list (filters: section, type, category subtree, brand, supplier, status, price range, stock state, has_promotion, created range, q across name/SKU/barcode; stock aggregates come from inventory service interface via a read-only query port — define the port now, implemented in B5), create, get, update (optimistic version), bulk status/category change, discontinue/reactivate.
- Variants: CRUD, lookup by barcode/SKU (fast path indexed endpoint for POS: GET /catalog/lookup?code=… returns variant with current effective price for the requester's branch, tax class, stock availability port result), uniqueness pre-check endpoints for async form validation.
- Categories/brands/attributes CRUD with reorder and merge (merge moves products, records audit, leaves redirect alias).
- Price/cost: POST price change (effective_from, reason), GET history, scheduled future prices (applied by effective time, not by a cron mutation), bulk price update with preview/dry-run and approval.
- Images: upload, reorder, set primary, delete (soft), signed URL retrieval.
- Barcode labels: POST /catalog/labels/render (variants + quantities + template) returning a PDF (server-side rendering, barcode via python-barcode/reportlab or similar) — streamed, size-limited, async job when large.

4) IMPORT / EXPORT
- CSV/XLSX import pipeline as a staged job: upload → parse (encoding detection, UTF-8/BOM, Azerbaijani characters preserved) → column mapping config → row-level validation (duplicate SKU/barcode within file and against DB, unknown category/brand with "create missing" option, invalid price/EAN, missing required) → persisted dry-run report → user confirms mode (all-or-nothing OR valid-rows-only) → commit in chunked transactions with idempotent row keys → downloadable error report. Imports are resumable and auditable (import_jobs, import_rows). Max file size/rows from settings.
- Export: streaming CSV/XLSX with chosen columns and current filters, cost columns only with permission, export action audited.
- Template download endpoint.

5) SEARCH & PERFORMANCE
- Indexes: trigram on name, btree on sku/barcode (lower), composite for common filters; barcode lookup p95 target < 20 ms at 500k variants (include a load-test script and EXPLAIN notes); keyset pagination for large lists.

6) EVENTS (outbox): product.created/updated, variant.created, price.changed, product.discontinued — consumed later by inventory alerts, marketing, reporting, and the optional legacy-site sync (scaffold only, behind integration status NOT_CONFIGURED).

7) LEGACY SITE LINK (scaffold only)
- Table external_refs (entity, internal_id, system='brendhouse_site', external_id, last_synced_at, status). No sync logic and no invented endpoints; endpoints return NOT_CONFIGURED until the integration is verified.

TESTS: uniqueness (concurrent creation of same SKU/barcode → exactly one wins), EAN-13 checksum, matrix generation dry-run vs commit, price history immutability and `price_at` correctness around effective boundaries, category tree cycle prevention/merge, import validation matrix (bad rows, BOM files, Azerbaijani characters, duplicates), permission masking of cost, branch-scoped price list resolution, search accent-insensitivity (İ/i, I/ı, ə/e), barcode lookup performance test, audit entries.

DELIVERABLES: module, migrations, seeds (sections, types, categories, units), tests, docs/catalog.md (data model diagram, price/cost history rules, import format spec), updated OpenAPI. List assumptions/open questions.