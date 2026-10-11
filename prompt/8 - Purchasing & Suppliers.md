
GOAL: Build Purchasing and Supplier Management (src/features/purchasing, src/features/suppliers).

WORKFLOW (show as a stepper on every document, with linked documents):
Purchase Request → Approval → Purchase Order → Goods Receipt → Supplier Invoice → Payment.

1) SUPPLIERS
- Directory: name, tax ID, status, contact person, phone, email, payment terms, currency, balance (payable), last purchase date. Filters, search, export.
- Supplier detail tabs: Ümumi, Əlaqələr (multiple contacts), Müqavilələr və sənədlər (upload with type/size validation, expiry date with reminder badge), Məhsullar (supplier SKU, last price, price history chart), Satınalma tarixçəsi, Hesab-faktura və ödənişlər, Borc balansı (statement view), Performans (on-time delivery %, fill rate %, discrepancy rate, price variance — each with documented formula tooltip), Audit.
- Duplicate supplier detection by tax ID and name.

2) PURCHASE REQUESTS
- Create by branch/warehouse: lines by product/variant (size × color quantity grid for fashion), needed-by date, reason. Suggested-reorder helper that reads min-stock levels and sales velocity from the server (display only; clearly labeled as suggestion).
- Submit → approval queue with approve/reject/return-for-edit and reason; approval levels by amount thresholds (configurable, read from settings).

3) PURCHASE ORDERS
- Create from approved requests or from scratch, supplier selection, delivery warehouse, expected date, payment terms, currency, line prices (default from last supplier price), discounts, tax from configured rules, attachments, notes.
- Statuses: Draft, Pending approval, Approved, Sent, Partially received, Received, Closed, Cancelled. Print/PDF and email-send only if an email provider is configured (otherwise show "Konfiqurasiya olunmayıb").
- Show received/outstanding quantities per line and per variant.

4) GOODS RECEIPT
- Receive against PO with scan or manual entry; partial deliveries supported; per-line ordered / previously received / received now / rejected / damaged with reasons; over-receipt blocked unless tolerance setting allows. Stock is updated only by confirming a valid goods-receipt document (UI never edits stock directly).
- Duplicate processing prevention: Idempotency-Key, disabled button after submit, clear 409 handling.
- Discrepancy report: ordered vs received vs invoiced quantities, flagged lines, resolution notes.

5) SUPPLIER INVOICES
- Register invoice (number, date, due date, lines, tax, attachment). Three-way match panel: PO vs receipt vs invoice (qty and price) with tolerance rules, mismatch highlighting, approve for payment / dispute / hold.
- Credit notes and purchase returns: return goods to supplier from stock (reduces inventory via document), linked to receipt/invoice, status flow, supplier credit tracking.

6) SUPPLIER PAYMENTS
- Record payment (full/partial, method, cash/bank account, date, reference), allocate across invoices, unallocated advance handling, approval for amounts above limit. Payables aging view (0–30, 31–60, 61–90, 90+).

7) REPORTS (embedded shortcuts, full versions in F12)
- Purchases by supplier, outstanding POs, receipt discrepancies, supplier balances, purchase price history by product.

TECHNICAL: money via shared formatters (no floats); all mutating calls idempotent; permission gates for cost/price visibility; tables server-paginated and URL-synced.

DELIVERABLES: pages, forms and schemas, mock repository (DEMO labeled), unit tests (three-way match, partial receipt math, aging buckets), Playwright tests (request → PO → partial receipt → invoice → partial payment; duplicate receipt blocked).