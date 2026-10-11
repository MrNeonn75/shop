
GOAL: Build Inventory & Warehouse and Transfer modules (src/features/inventory, src/features/transfers). The stock LEDGER is the source of truth: the UI must never offer a way to edit a balance directly; every change is a documented movement.

1) STOCK OVERVIEW
- Pages: "Cari qalıqlar": product/variant × location matrix. Filters: branch, warehouse, section, type, category, brand, stock state (normal / az / sıfır / mənfi-icazəli), search by name/SKU/barcode.
- Columns: on hand, reserved, available, in transit (incoming), min level, valuation (permission-gated), last movement date.
- Variant drill-down drawer showing the size × color grid per location.
- Low-stock and out-of-stock tabs; slow-moving and dead-stock tabs with configurable thresholds (days without sale).

2) STOCK MOVEMENT HISTORY (ledger viewer)
- Read-only table: movement ID, timestamp (Asia/Baku), type (qəbul, silinmə, transfer çıxış/giriş, satış, qaytarılma, korreksiya, inventarizasiya, zədəli, itmiş), product/variant, from → to location, quantity (±), unit cost, reference document link, user.
- Filters by all of the above, export, deep links from any document.

3) STOCK DOCUMENTS (each with draft → confirmed flow, unique document number from numbering settings, attachments, audit trail)
- Stock receipt (non-purchase, e.g. opening goods), stock issue, adjustment (requires reason code and permission; show value impact), damaged-goods and lost-goods registration, returned-goods classification (resalable / damaged / restricted).
- Negative stock is blocked by default: the form shows a clear error from the API; only users with explicit permission and system setting see an override with mandatory reason.

4) PHYSICAL INVENTORY COUNT
- Create count session (location, scope: full/category/random), freeze snapshot, counting UI optimized for barcode scanner and tablet (scan → increment, manual qty, undo, per-user counting), blind-count option, variance review screen (expected vs counted, value of variance, recount flag), approval step, then generates adjustment document. Counting can pause/resume.

5) OPENING BALANCE IMPORT
- Wizard like the product import (mapping, validation, dry run, error report), per location, produces a single auditable "opening balance" document. Cannot run twice for the same location without privileged override.

6) WAREHOUSES
- List and detail pages: type (mərkəzi / filial / tranzit), branch link, bins/zones optional, stock summary.

7) TRANSFERS
- Status flow: Draft → Submitted → Approved → Picking → Dispatched → In Transit → Partially Received → Received; plus Rejected, Cancelled. Show a stepper with timestamps and actors.
- Create transfer: source and destination (warehouse/branch), add lines by scan/search with available-qty validation, notes. Submit for approval.
- Approval screen for approvers (approve/reject with reason).
- Picking screen (scan to pick, short-pick reason).
- Dispatch: confirm quantities; show clearly "Mal mənbə anbarı tərk etdi, tranzitdədir" — stock leaves the source at dispatch and sits in the in-transit location until receiving confirmation.
- Receiving screen at destination: scan to receive, per-line received/damaged/missing quantities with reasons, partial receipt supported (remaining stays in transit), discrepancy report.
- Prevent double receipt in the UI (disable + server idempotency key), show conflict message on 409.
- Cancellation allowed only per permission and status rules; show consequences before confirming.
- Transfer list with filters (status, source, destination, date), print transfer note (PDF).

8) ALERTS
- Min-stock alert rules management (per product/category/location) feeding the Notifications module later.

TECHNICAL: optimistic updates NOT allowed for stock actions; show pending state until the server confirms. All mutating requests send Idempotency-Key. Handle concurrency conflicts (409) with a refresh-and-retry dialog.

DELIVERABLES: pages, mock repository simulating ledger logic (balances derived from movements), unit tests for ledger derivation and transfer state machine, Playwright tests (transfer end-to-end incl. partial receipt, negative stock block, count with variance).