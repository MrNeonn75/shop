
GOAL: Build modules `pos` (registers shifts, carts, cash operations) and `sales` (finalized sale records).

PRINCIPLES
- Never finalize a sale if payment validation or stock validation fails.
- Never delete finalized sales or payments. Cancellation/return = linked reversal documents.
- Never store or log raw card numbers or CVV. Never simulate a successful real payment: card tenders are accepted only through a verified payment-provider integration (or an explicitly configured "external terminal confirmation" method requiring an approval reference). If none is configured, card tender endpoints return NOT_CONFIGURED.
- Prices are always taken from the server at checkout time; the client price is never trusted. Each sale line stores an immutable snapshot (price, cost, tax rate/class, promotion applied).
- No offline mode is claimed or implemented. (A separate offline design would be required.)

1) REGISTER SHIFTS
- shifts: register_id, branch_id, cashier_id, opened_at, closed_at, opening_cash (with denomination breakdown), status (OPEN, CLOSING, CLOSED), expected cash by tender (derived), counted cash by tender, variance, closing approver, notes, version. One OPEN shift per register (partial unique index) and per cashier at a time (configurable).
- Open shift: validates register active, user has pos.shift.open and branch access, opening float vs expected float setting; mismatch needs reason.
- cash_movements (CASH_IN, CASH_OUT, DROP/SAFE, FLOAT_ADJUST): amount, reason code, attachment, approval above limit (manager approval token from B2), linked to shift; append-only.
- Close shift: counts per denomination and tender; expected = opening + cash sales − cash refunds + cash in − cash out − drops; variance beyond tolerance requires explanation + manager confirmation; generates X (interim) and Z (final) report data; closed shift locked (no new sales, edits only via audited reopen by privileged role with reason). Daily register report endpoint.

2) CATALOG LOOKUP FOR POS
- Reuse GET /catalog/lookup (B4); add a POS-optimized endpoint returning variant, effective price for this branch/time, tax class, applicable promotions preview, and availability at the register's default warehouse. Target p95 < 30 ms.

3) CARTS (server-side, optional but required for suspend/recall)
- Suspended sales: pos_carts (id, shift_id, label, lines snapshot without price authority, customer_id, status SUSPENDED/RECALLED/EXPIRED), branch-scoped; recalling re-prices and re-validates everything. Auto-expire per setting.
- Live carts need not be stored; checkout accepts the full cart payload.

4) PRICING & PROMOTION INTEGRATION
- Checkout calls `PricingService.quote(cart, customer, branch, at)`: base price from catalog price_at, then promotion engine (B11 interface; until B11 exists, a no-op implementation with the same interface), then manual discounts (validated against role limits from settings; above-limit requires a valid manager approval token bound to this action/amount), then tax computation using effective-dated tax classes from settings, then rounding policy (central money module).
- Returns a full breakdown (per line: unit price, discounts with sources, tax, line total; receipt-level discounts; subtotal, discount total, tax total, grand total). The same service is used for preview (POST /pos/quote) and for finalization, guaranteeing identical results; finalization recomputes server-side and rejects if the client's expected total differs beyond zero tolerance (returns PRICE_CHANGED with the new quote).

5) CHECKOUT — POST /pos/sales (Idempotency-Key REQUIRED)
Single database transaction, in this order:
  1. Validate shift OPEN and belongs to the caller's register/branch; validate permissions and discount limits/approvals.
  2. Recompute the quote; compare with client expectation; reject on mismatch.
  3. Validate payments: sum(payments) == grand_total exactly (cash may exceed with change computed; change only against cash tender); allowed tender types from settings; per-tender rules (card requires verified provider confirmation id, masked last-4 and auth code only; external-terminal method requires approval reference). Reject over/under payment.
  4. Validate loyalty redemption (points available, max % of receipt, minimum) via CRM service interface and RESERVE/DEBIT points within the same transaction (B11 interface; no-op stub until then).
  5. Allocate receipt number via numbering (gapless per register) inside the transaction.
  6. Insert sale + lines (with snapshots) + payments.
  7. Post SALE movements via InventoryService.post (default warehouse, FOR UPDATE ordering, fails whole sale with per-line shortage details if stock insufficient and negative policy forbids).
  8. Record cost snapshot (COGS unit cost from inventory costing) on each line.
  9. Write outbox events in the same transaction: sale.completed (consumed by Finance to record cash/receivables and revenue, CRM to update purchase history/points earned, Reporting, Notifications, Marketing attribution). Consumers are idempotent.
  10. Commit; return receipt payload (receipt number, totals, payments, change, QR/barcode data, fiscal fields placeholder).
- If ANY step fails the transaction rolls back completely (no receipt number consumed — gapless guarantee, no stock movement, no points debited).
- Idempotency: same key + same payload → replay original response; same key + different payload → error; concurrent duplicate → 409 IN_PROGRESS. DB unique constraint on (idempotency key scope) as the last line of defense.
- Card/provider flow: if the provider integration is active, authorization happens BEFORE the commit through an explicit two-phase pattern: create payment intent → provider confirmation (webhook or synchronous response) → finalize sale only after confirmed; handle timeouts with a reconciliation job that resolves unknown outcomes (never silently marking paid); void/refund paths via provider API only. Document and test this state machine (payment_attempts table: PENDING, AUTHORIZED, CAPTURED, FAILED, VOIDED, UNKNOWN).
- Fiscal/e-receipt: scaffold interface `FiscalService` (NOT_CONFIGURED by default); do not claim compliance with Azerbaijani fiscal regulations without verified integration and requirements review — mark as open question in docs.

6) SALE RECORDS
- sales: id, receipt_no (unique), branch, register, shift, cashier, customer, status (COMPLETED, PARTIALLY_RETURNED, RETURNED, CANCELLED), totals, discount/tax breakdown json snapshot, payment summary, created_at (UTC) + business date (Asia/Baku, derived at write time and stored), correlation_id, version. sale_lines (immutable snapshots), sale_payments (tender, amount, masked reference, provider ids), sale_events (timeline: created, reprinted, cancelled, return linked).
- Endpoints: list/search (filters from F7: date range, branch, cashier, customer, payment method, status, product/SKU/barcode, amount range, campaign), get detail (cost/margin fields permission-gated), lookup by receipt number/barcode.
- REPRINT: POST /sales/{id}/reprint (reason, audit event, increments reprint counter; output marked as copy). Receipt rendering: ESC/POS payload and PDF/HTML templates from settings (58/80mm); printer service integration status-aware.
- CANCELLATION (void): only same-shift, unreturned sales, with pos.sale.cancel + manager approval token + reason; implemented as a reversal document that posts SALE reversal movements (back into stock), reverses payments records (cash movement adjustment/provider void), reverses loyalty effects, emits sale.cancelled; the original sale row remains with status CANCELLED and full history. After shift close, cancellation is replaced by the return flow (B8).

7) FRAUD / CONTROL INDICATORS (data only; rules documented)
- Per-cashier and per-shift metrics: void rate, discount rate, no-sale drawer opens, returns shortly before close, repeated manual price overrides, cash variances — exposed via an endpoint and emitted as outbox events when thresholds (settings) are exceeded.

8) PERMISSIONS: pos.shift.open/close/reopen, pos.sale.create, pos.sale.cancel, pos.sale.reprint, pos.discount.apply (with max % via settings per role), pos.discount.override, pos.cash.in/out, pos.cart.suspend, sales.view, sales.cost.view, sales.export.

PERFORMANCE TARGETS: checkout p95 < 150 ms for 10 lines on reference hardware (excluding external provider latency); quote p95 < 50 ms. Load test script (locust/k6) included.

TESTS (mandatory, heavy):
- Atomicity: induced failure at each of the 10 steps → zero residue (no sale, no stock, no receipt number gap, no points debit, no outbox event).
- Idempotency: replay, payload mismatch, concurrent duplicates (50 parallel identical requests → exactly one sale).
- Concurrency: 100 parallel checkouts of the last 5 units → exactly 5 succeed.
- Price integrity: client-sent price ignored; PRICE_CHANGED on stale quote; historical sale unchanged after price change.
- Payment validation: under/over payment, split payments, change only on cash, card without confirmation rejected, NOT_CONFIGURED states.
- Shift: single open shift constraint, close math (expected cash derivation), variance handling, locked after close.
- Cancellation: reversal correctness for stock, cash, loyalty; blocked after shift close or after return.
- Receipt numbering gapless under rollbacks and concurrency.
- Discount limits and manager approval token binding (token reuse/wrong action rejected).
- Security: no card data in logs/db (automated log/db scan test), branch-scope isolation, cashier cannot see other cashiers' shifts without permission.

DELIVERABLES: modules, migrations (constraints, indexes, partial unique indexes), receipt templates, load-test scripts, tests, docs/pos-checkout.md (sequence diagram, transaction boundary, failure matrix, payment state machine), updated OpenAPI. List assumptions/open questions (fiscal integration, provider choice, tax calc specifics, rounding rules).