
GOAL: Build modules `suppliers` and `purchasing`.

WORKFLOW: Purchase Request → Approval → Purchase Order → Goods Receipt → Supplier Invoice → Payment. Support partial deliveries and partial payments at every stage.

1) SUPPLIERS
- suppliers: id, code (unique), name, legal name, tax_id (unique when present, normalized), status (active/blocked/archived), payment terms (days, method), default currency, bank details (sensitive: masked by serializer unless suppliers.bank.view), notes, version.
- supplier_contacts (multiple, primary flag), supplier_documents (contracts, certificates; file storage abstraction from B4; type, number, valid_from/valid_to; expiry events emitted to outbox 30/14/7 days before), supplier_products (variant/product link, supplier_sku, last price, lead time days, MOQ).
- Duplicate detection endpoint (tax_id + fuzzy name via trigram), merge supplier (re-points documents, keeps audit trail, leaves alias) with permission and preview.
- Blocked suppliers cannot receive new POs; existing documents remain processable.
- Supplier balance is DERIVED (never stored as editable value): sum of posted invoices − posted payments − applied credit notes, via a ledger-style table `supplier_ledger_entries` (append-only: INVOICE, CREDIT_NOTE, PAYMENT, ADJUSTMENT, REVERSAL) written in the same transaction as the source document. Statement endpoint with running balance and aging buckets (0–30, 31–60, 61–90, 90+ by due date).
- Performance metrics endpoint with documented formulas: on-time delivery %, fill rate %, discrepancy rate, price variance vs last price, average lead time.

2) PURCHASE REQUESTS
- purchase_requests + lines (variant, requested qty, needed_by, requesting branch/warehouse, reason). Status: DRAFT → SUBMITTED → APPROVED/REJECTED/RETURNED → CONVERTED/CANCELLED.
- Approval engine (reusable generic `approvals` service in app/shared or its own module): approval rules by document type + amount thresholds + branch, multi-level, approver by role/permission, delegation support from B2, SoD (requester ≠ approver), full decision history with reasons. Reuse later for expenses, payroll, campaigns, adjustments.
- Reorder suggestion endpoint: uses min-stock levels, current availability, in-transit, open PO quantities, and 28/56-day sales velocity from the reporting read-port; returns SUGGESTIONS with explained inputs; never auto-creates documents.

3) PURCHASE ORDERS
- purchase_orders + lines: supplier, delivery warehouse, order date, expected date, currency, payment terms, line quantity/unit price/discount/tax class (rates from settings, effective-dated), totals computed server-side with Decimal and central rounding. Default line price from supplier_products/last price (suggestion only).
- Status: DRAFT → PENDING_APPROVAL → APPROVED → SENT → PARTIALLY_RECEIVED → RECEIVED → CLOSED; plus CANCELLED. Per-line received_qty, cancelled_qty, outstanding_qty derived from receipts (no manual edits).
- Edit rules after approval: only through a versioned amendment (po_revisions) that re-triggers approval when value or quantity increases beyond tolerance.
- Sending to supplier: PDF generation endpoint; email sending only if email integration status is ACTIVE, otherwise return NOT_CONFIGURED (no fake send). Closing short (supplier cannot fulfill) records reason and releases outstanding quantity.
- Discontinued products cannot be added to new POs (B4 rule).

4) GOODS RECEIPT (the ONLY way purchased stock enters inventory)
- goods_receipts + lines: PO reference (or unplanned receipt with permission), delivery note number, per-line ordered, previously received, received now, rejected, damaged (reason codes), batch/lot optional, unit cost (from PO price unless landed-cost allocation applied), receiving user, attachments.
- Confirm endpoint (Idempotency-Key required): validates received ≤ outstanding × (1 + over-receipt tolerance setting), posts RECEIPT movements via InventoryService.post (damaged quantity → damaged status location, rejected quantity not posted), updates PO line quantities and status, writes outbox events — all in ONE transaction.
- Duplicate processing prevention: unique (supplier delivery note number, supplier) option, idempotency, state machine (confirmed receipts immutable). Correction = receipt reversal document (posts REVERSAL movements; blocked if stock already consumed unless privileged override with reason).
- Landed costs: optional document allocating freight/customs across receipt lines (by value/quantity/weight), which adjusts inventory cost state through the costing service from B5 (weighted-average update with a documented effect on already-sold units: no retroactive COGS change; difference goes to a configurable variance bucket).
- Discrepancy tracking: ordered vs received vs invoiced per line, status (open/resolved/accepted), resolution notes, report endpoint.

5) SUPPLIER INVOICES & THREE-WAY MATCH
- supplier_invoices + lines: supplier invoice number (unique per supplier), invoice/due dates, currency, lines linked to PO/receipt lines, tax, attachment. Statuses: DRAFT → MATCHING → APPROVED_FOR_PAYMENT / DISPUTED / ON_HOLD → PARTIALLY_PAID → PAID; CANCELLED via reversal only.
- Match engine: compares PO price/qty, receipt qty, invoice price/qty with tolerance settings (percent and absolute); returns per-line match status and variance reasons; blocks approval on unresolved variance unless privileged with reason. Duplicate invoice detection (same supplier + number, or same supplier + date + amount).
- Posting an approved invoice writes a supplier_ledger_entry and emits `purchasing.invoice.approved` for Finance (B9) to create the payable/expense entry via the accounting boundary.
- Credit notes and PURCHASE RETURNS: purchase_returns document (from receipt/invoice, qty ≤ received − already returned), posts PURCHASE_RETURN movements out of stock (cost snapshot from original receipt), generates a supplier credit note linked to the supplier ledger.

6) SUPPLIER PAYMENTS
- payments (supplier, method, source cash/bank account via finance service interface, date, amount, reference), allocations to invoices (partial allowed; sum of allocations ≤ payment amount; unallocated remainder becomes supplier advance), approval above a limit, status POSTED/REVERSED. Idempotent creation. Reversal creates compensating ledger entries.
- Payables aging endpoint, due-soon list, overdue events to outbox.

7) PERMISSIONS (examples, add all to catalog): purchasing.request.create/approve, purchasing.order.create/approve/send/cancel, purchasing.receipt.confirm/reverse, purchasing.invoice.approve/override_match, purchasing.payment.create/approve, suppliers.manage, suppliers.bank.view, suppliers.documents.manage. Cost/price fields hidden without purchasing.cost.view.

8) REPORT PORTS (full reports in B12): purchases by supplier, purchase history, outstanding POs, receipt discrepancies, supplier balances/aging, purchase price history by variant, supplier performance.

TESTS: PO status derivation from partial receipts; over-receipt tolerance; double confirm with same idempotency key posts once; receipt reversal blocked when stock consumed; three-way match tolerance matrix; duplicate invoice detection; payment allocation math (partial, advance, reversal); supplier balance equals ledger sum under random operation sequences (property-based); approval engine (levels, SoD, delegation); branch-scope isolation; concurrency (two users receiving the same PO line simultaneously never exceed ordered quantity); audit and outbox events in the same transaction.

DELIVERABLES: modules, migrations, seeds (approval rule templates, discrepancy reason codes), tests, docs/purchasing.md (workflow diagram, status tables, tolerance rules, ledger model), updated OpenAPI. List assumptions/open questions (landed cost policy, multi-currency scope).