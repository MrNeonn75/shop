
GOAL: Build modules `inventory` (ledger, balances, documents, counts) and `transfers`.

NON-NEGOTIABLE PRINCIPLES
- The STOCK LEDGER is the single source of truth. Balances never change without an underlying movement row written in the SAME transaction.
- Ledger rows are APPEND-ONLY (DB trigger + revoked privileges block UPDATE/DELETE). Corrections are new compensating movements.
- Negative stock is forbidden by default (setting inventory.negative_stock_policy). An override requires an explicit setting, an authorized permission, and a mandatory reason, and is audited.
- Concurrency-safe: simultaneous sales, transfers, and adjustments on the same variant/location can never oversell or corrupt balances.

1) DATA MODEL
- locations: reuse warehouses from B3 (central, branch, in_transit, quarantine/damaged). Every stock quantity lives at exactly one (warehouse, variant, stock_status) — stock_status ∈ {available, reserved? (separate table), damaged, quarantine}. Document the final model.
- stock_movements (ledger): id (UUIDv7), movement_no (unique human id via numbering), occurred_at (business time), posted_at, variant_id, from_warehouse_id (nullable), to_warehouse_id (nullable), quantity (positive integer; direction implied by from/to), movement_type enum (RECEIPT, ISSUE, TRANSFER_OUT, TRANSFER_IN, SALE, SALE_RETURN, PURCHASE_RETURN, ADJUSTMENT_PLUS, ADJUSTMENT_MINUS, COUNT_VARIANCE, DAMAGED, LOST, OPENING_BALANCE, REVERSAL), reference_type + reference_id (source document), reverses_movement_id (for REVERSAL), unit_cost (snapshot), total_cost, user_id, reason_code_id, correlation_id, idempotency_key reference, notes. CHECK constraints: quantity > 0; at least one of from/to; from ≠ to; reversal links valid.
- stock_balances (derived, maintained transactionally): (warehouse_id, variant_id, stock_status) → on_hand, updated_at, version; CHECK (on_hand >= 0) unless negative policy allows via a separate guarded path (e.g. a flag column `allow_negative` set only by privileged flow — design carefully, document trade-offs). Plus stock_reservations table (reservation_id, warehouse, variant, qty, reference, expires_at) and available = on_hand − active reservations.
- cost layers / valuation: implement weighted-average cost per (warehouse? or company-wide — decide, document) updated on RECEIPT-type movements; table inventory_cost_state; every outbound movement records the unit_cost used (COGS snapshot). Interface for FIFO later via a CostingStrategy protocol selected by setting. Valuation reports derive from ledger × cost state.
- Rebuild tool: CLI + job `inventory.rebuild_balances` recomputes balances purely from the ledger and reports differences (reconciliation). A scheduled reconciliation job compares stored balances to ledger sums and raises alerts/events on any drift.

2) POSTING ENGINE (single entry point)
- `InventoryService.post(movements: list[MovementDraft], *, session, idempotency)`:
  - Runs inside the caller's transaction (unit of work). Locks affected balance rows in a deterministic order (sorted by warehouse_id, variant_id) using SELECT … FOR UPDATE to avoid deadlocks; creates missing balance rows with INSERT … ON CONFLICT DO NOTHING then locks.
  - Validates availability (on_hand − reservations ≥ qty) per policy; fails the WHOLE batch atomically with a structured error listing every short line (variant, requested, available) so POS/UI can show exact messages.
  - Writes ledger rows then applies balance deltas; verifies post-conditions; emits outbox events (stock.changed, stock.low, stock.out).
  - Idempotent: replaying the same idempotency key + document reference returns the original movements without double posting; unique (reference_type, reference_id, line_no, movement_type) guards at DB level.
  - Retry wrapper for serialization failures/deadlocks (bounded, with jitter).
- No other module may touch balances or ledger tables — only this service (enforced by import-linter and DB privileges where possible).
- Read port for other modules: `get_availability(warehouse_ids, variant_ids)`, `get_stock_summary(...)` used by catalog, POS, purchasing.

3) STOCK DOCUMENTS (each: draft → confirmed (posts movements) → [reversed]; numbered; attachments; audit; SoD rule creator ≠ approver where configured)
- Stock receipt (non-purchase), stock issue, adjustment (reason code mandatory; shows value impact; approval above value threshold), damaged-goods and lost-goods registration (moves to damaged status location or writes off per rule), returned-goods classification (resalable → available; damaged → damaged status; restricted → quarantine) as a service used by B8, opening balance document.
- Confirm endpoints require Idempotency-Key. Confirmed documents are immutable; cancellation = creating a reversal document that posts REVERSAL movements (never deleting), allowed only per permission and if reversal does not drive stock negative (or with privileged override).
- Opening balance import: staged import job (dry-run, error report), produces ONE opening-balance document per warehouse; refuses a second opening balance for the same warehouse unless privileged override with reason; cost per line required.

4) PHYSICAL INVENTORY COUNTS
- count_sessions (scope: full/category/random sample, warehouse, status: draft → frozen(snapshot) → counting → review → approved → posted/cancelled), snapshot of expected quantities taken at freeze time with the movement watermark; sales/transfers during the count are tracked as "movements since snapshot" and the variance calculation adjusts expected = snapshot + net movements since freeze (document this rule, test it).
- Count entries: per user/device, scan-based increments, manual quantity, undo, blind-count option (expected hidden from counters via serializer rules), recount requests, per-line variance and value; review screen data endpoints; approval (SoD: approver ≠ counter lead) → generates a COUNT_VARIANCE adjustment document and posts movements atomically. Pause/resume supported; sessions auditable.

5) TRANSFERS (module `transfers`)
- Statuses: DRAFT, SUBMITTED, APPROVED, PICKING, DISPATCHED, IN_TRANSIT, PARTIALLY_RECEIVED, RECEIVED, REJECTED, CANCELLED with an explicit state machine (allowed transitions table, guard functions, permissions per transition, audit per transition).
- Inventory timing (implement exactly):
  • DRAFT/SUBMITTED/APPROVED: optional RESERVATION of source stock (setting) — no ledger movement.
  • DISPATCHED: posts TRANSFER_OUT from source warehouse → IN-TRANSIT warehouse for dispatched quantities (stock leaves source and is NOT available anywhere for sale).
  • RECEIVING: posts TRANSFER_IN from IN-TRANSIT → destination for received quantities (damaged quantity → destination damaged status; missing quantity stays in transit until resolved by a documented resolution: write-off LOST movement from in-transit, or found/redelivered).
  • Partial receipt: remaining quantity stays in transit; status PARTIALLY_RECEIVED until resolved or fully received; each receiving event is its own receipt record (receiving_events) with idempotency; over-receipt blocked.
- A transfer can NEVER be received twice: enforced by state machine + unique receiving_event idempotency + per-line received ≤ dispatched constraints at DB level.
- Cancellation rules by state: before DISPATCHED releases reservations; after DISPATCHED requires a return-to-source flow (reverse transit movements) with permission and reason.
- Transfer lines at variant level; picking confirms picked quantity (short-pick reasons); dispatch confirms; discrepancy report endpoint (dispatched vs received vs resolved).
- Aging alerts: transfers in transit longer than N days (setting) raise outbox events.
- Branch scope: source/destination branch managers see only their transfers; approvals by permission.

6) QUERIES & REPORT ENDPOINTS
- Stock overview (location × variant matrix with filters, availability, in-transit incoming, min level, valuation permission-gated), variant drill-down grid, movement history (cursor pagination, filters on every ledger dimension, deep links by reference), low-stock/out-of-stock, slow-moving/dead-stock (days-since-last-sale thresholds from settings), stock valuation at a point in time (ledger replay up to timestamp; efficient via periodic snapshots table `stock_snapshots` generated by job), discrepancies report.
- Min-stock alert rules (variant/category/location) evaluated on stock.changed events → outbox notifications (delivery in B13).

7) PERFORMANCE & RELIABILITY
- Hot path (posting 1–50 lines) p95 < 50 ms on reference hardware; index plan documented (balances PK, ledger by (variant, warehouse, posted_at), by reference). Partition ledger by month if needed (design now, enable by migration when volume demands).
- Advisory documentation on isolation level choice (READ COMMITTED + row locks vs SERIALIZABLE) with the decision recorded.

TESTS (mandatory, heavy):
- Property-based: random sequences of movements → balances always equal ledger sums; never negative under default policy.
- Concurrency (real Postgres): 100 parallel sales of the last 5 units → exactly 5 succeed, no negative stock; parallel opposite-direction transfers don't deadlock; double confirm with the same idempotency key posts once; double receive of a transfer is rejected.
- Append-only: UPDATE/DELETE on ledger fails at DB level.
- Atomicity: failure in the last line of a batch leaves zero movements and unchanged balances; audit/outbox rolled back too.
- Transfer state machine: every illegal transition rejected; partial receipt + resolution flows; in-transit stock excluded from availability everywhere.
- Count: variance with movements during counting; blind-count serializer hides expected quantity.
- Costing: weighted-average correctness across receipts/issues/reversals; COGS snapshot on outbound.
- Rebuild/reconciliation detects an artificially corrupted balance.
- Branch scope isolation on all endpoints; permission matrix tests (adjust, override negative, reverse).

DELIVERABLES: modules, migrations (with triggers/constraints), CLI tools (rebuild, reconcile), jobs, tests, docs/inventory.md (ledger model diagram, posting engine contract, transfer timing table, costing rules, isolation/locking decisions), updated OpenAPI. List assumptions/open questions (e.g. reservation policy, weighted-average scope, partitioning threshold).