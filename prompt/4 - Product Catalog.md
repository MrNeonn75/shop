GOAL: Build the centralized Product Catalog module (feature folder: src/features/catalog).

1) PRODUCT LIST PAGE
- DataTable with server-side pagination, sorting, column visibility, saved filters, filters synced to URL.
- Columns: image thumbnail, name, SKU, barcode, section (Kişi/Qadın/Uşaq/Digər), type (Geyim/Ayaqqabı/Aksesuar), category, brand, current price (₼), cost (hidden unless catalog.cost.view), total stock (all accessible branches), status (Aktiv / Dayandırılıb), updated at.
- Filters: section, type, category (hierarchical), brand, supplier, status, price range, stock state (var / az qalıb / qurtarıb), has-promotion, date created.
- Search by name, SKU, or barcode in one input; a scanned barcode (keyboard-wedge input ending with Enter) jumps straight to the product.
- Bulk actions: change status, change category, export selected, print barcode labels.
- Grid/table view toggle.

2) PRODUCT CREATE/EDIT (multi-step or tabbed form with Zod validation)
- Tab "Əsas": name, description, section, type, category → subcategory, brand, unit of measure, tax class (from configurable tax settings, no hardcoded rates), status, minimum stock level.
- Tab "Qiymət": purchase cost, selling price, margin % computed live, effective-from date; price rules never rewrite history.
- Tab "Variantlar": attribute definitions (Ölçü, Rəng, Üslub, Model, custom) and a SIZE × COLOR MATRIX editor for fashion: choose sizes and colors, generate variants, each row has own SKU (auto-suggest by pattern, editable), barcode (generate EAN-13 or enter manually/scan), optional price override, status. Inline duplicate detection for SKU and barcode (async check, clear error messages). Shoes use numeric sizes (e.g. 36–46), clothing uses XS–XXL, accessories can be single-variant.
- Tab "Təchizatçılar": supplier associations with supplier SKU and last purchase price.
- Tab "Şəkillər": multi-image upload (type/size validation, drag to reorder, primary image).
- Tab "Tarixçə": price history and cost history timeline (read-only), who changed what and when; audit entries.
- Dirty-state leave warning, draft autosave locally, unique-identifier errors from the API (409) mapped to the exact field.

3) CATEGORY & BRAND MANAGEMENT
- Tree editor for section → type → category → subcategory (seed with the store's real taxonomy: Atlet, Bluz, Crop, Don, Dəst, Gödəkcə, Hırka, Jaket, Jilet, Kardiqan, Kazak, Köynək, Mayka, Palto, Polo, Şalvar, Şortik, Sweatshirt, Topik, Trençkot, Tshirt, Tulum, Tunik, Ətək, Ayaqqabı, Çanta və pulqabı, etc.), drag-and-drop reorder, merge/disable categories with safety checks.
- Brand list with logo, active status.

4) BULK IMPORT / EXPORT
- CSV/XLSX import wizard: upload → column mapping → validation preview (row-level errors/warnings: duplicate SKU/barcode, unknown category, invalid price, missing required) → dry-run summary → confirm → progress → downloadable error report. Never apply partially without explicit user choice ("yalnız düzgün sətirləri import et").
- Template download. Export with chosen columns and current filters.
- Opening-balance import is handled in the Inventory module (F5), not here.

5) BARCODE LABELS
- Label designer: choose label size presets, fields (name, size, color, SKU, price, barcode), quantity per variant, preview, print via browser print CSS and PDF export. Barcode rendering with a client-side library (EAN-13/Code128).

6) PRICE HISTORY GUARD (UI rules)
- Changing price shows an "effective from" date and a notice: "Keçmiş satışlar dəyişməyəcək".
- Display both current and historical price in sale/receipt detail screens later (expose a reusable <PriceAtTime/> component).

7) STORE-WEBSITE LINK (optional, scaffold only)
- Add "Sayt inteqrasiyası" section in product detail: status "Konfiqurasiya olunmayıb" unless the BrendHouseLegacyAdapter is configured. Do NOT invent endpoints or fake sync.

DELIVERABLES: pages, forms, schemas, mock repository with realistic demo data (clearly labeled DEMO), unit tests (matrix generation, SKU/barcode validation, EAN-13 checksum), Playwright tests (create product with matrix, duplicate barcode error, CSV import with errors).