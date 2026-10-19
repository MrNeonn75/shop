
GOAL: Extend `sales` with module `returns` (returns, refunds, exchanges) with strict quantity, money, stock, and loyalty consistency.

PRINCIPLES
- A return references the original sale whenever possible; returned quantity can never exceed (sold − already returned − cancelled).
- Finalized sales, refunds, and financial records are never deleted or edited; everything is additive and linked.
- Stock, cash, finance, and loyalty effects of a return commit atomically with the return document.

1) DATA MODEL
- sale_returns: id, return_no (numbering, gapless per register), original_sale_id (nullable only for no-receipt returns), branch, register, shift, processed_by, customer_id, status (DRAFT, PENDING_APPROVAL, COMPLETED, REJECTED, CANCELLED), return_type (REFUND, EXCHANGE, STORE_CREDIT), totals, refund method breakdown, reason summary, approval reference, correlation_id, version.
- sale_return_lines: original_sale_line_id (nullable for no-receipt), variant_id, quantity, reason_code, condition (RESALABLE, DAMAGED, RESTRICTED), unit price snapshot (from the ORIGINAL sale line — never today's price), discount allocation, tax reversal, refund amount, destination warehouse/status, notes.
- refunds: tender, amount, provider reference (masked), status, linked payment_attempt for provider refunds.
- store_credit ledger (append-only: ISSUE, REDEEM, EXPIRE, REVERSE) if store credit is enabled by setting.
- exchange links: exchange_group_id tying one return document to one new sale document created in the same transaction.

2) VALIDATION RULES (server-authoritative)
- returnable_qty(line) = sold_qty − SUM(completed returns qty) − (pending-return reserved qty) computed with row locks on the original sale line aggregate (FOR UPDATE on a per-line counter row `sale_line_return_state` to make parallel returns safe).
- Return window (days, from settings; per category override optional): outside the window requires returns.override_window permission + manager approval + reason.
- Receipt-less returns: separate permission, mandatory manager approval, price taken from the lowest of current/last known price (policy in settings), limited quantity per customer/period, mandatory customer identification if setting requires; flagged in fraud indicators.
- Approval limits: refund value per role (settings); above limit requires approval token (B2) bound to {return, amount}.
- Refund method rules: original tender by default (card refunds only via provider integration; otherwise NOT_CONFIGURED, or allowed as cash/store credit if settings permit); cash refund requires an OPEN shift with sufficient expected cash (or drawer-drop rules); refund total can never exceed amount actually paid for the returned lines.
- Discount allocation: proportional allocation of receipt-level discounts and promotions across lines; promotions with conditions (e.g. BOGO, bundles) re-evaluated: if returning an item invalidates a promotion, the system recomputes the refund as price paid minus value of lost promotion benefits per documented policy (default: refund exactly what was paid for the returned units under proportional allocation; configurable strictness). Document and test the policy; show preview via POST /returns/quote.
- Tax reversal uses the tax rate/class snapshot on the original line.
- Loyalty: points earned on returned lines are reversed proportionally (negative balances allowed per setting with recovery on future earnings); redeemed points on the original sale are restored proportionally per policy; tier recalculation event emitted; implemented through CRM service interface (stub until B11) inside the same transaction.

3) COMPLETION — POST /returns (Idempotency-Key REQUIRED), one transaction:
  1. Lock original sale lines' return-state rows; validate returnable quantities, window, approvals, shift/register state.
  2. Compute refund via returns quote service (same code as preview).
  3. Allocate return number (gapless).
  4. Insert return, lines, refund records.
  5. Post stock movements through InventoryService: RESALABLE → SALE_RETURN into the branch available warehouse; DAMAGED → damaged status location (or write-off per setting); RESTRICTED → quarantine. Cost snapshot = the ORIGINAL sale line cost (so COGS reversal matches), not current average cost.
  6. Record cash/tender movements (cash refund reduces expected shift cash; provider refund initiated via payment-provider state machine with UNKNOWN handling and reconciliation job).
  7. Reverse loyalty effects.
  8. Update sale status (PARTIALLY_RETURNED/RETURNED) and sale_events timeline.
  9. Outbox: return.completed (Finance reverses revenue and COGS and records refund; CRM updates metrics; Reporting; Notifications for large refunds; fraud indicator updates).
- All-or-nothing: any failure rolls back everything including the return number.

4) EXCHANGES — POST /returns/exchange (Idempotency-Key REQUIRED)
- Single transaction: return part (above flow) + new sale part (B7 checkout engine, called as an internal service, not HTTP) + settlement of the price difference (customer pays additional via normal payment validation, or receives refund/store credit). Neutral exchanges (size swap, same price) require no payment movement. Size/color swaps check live availability of the new variant at the branch. The two documents are linked by exchange_group_id; cancellation of either is blocked individually (reverse the pair via a privileged flow).
- If the new items' price changed since the original sale, the new part uses CURRENT prices; the returned part uses ORIGINAL prices; the difference is explicit in the quote.

5) PENDING APPROVAL FLOW
- Returns requiring approval can be saved as PENDING_APPROVAL (no stock/cash effect yet), reserving returnable quantity; approver completes or rejects; expiry job releases reservations.

6) ENDPOINTS
- POST /returns/quote, POST /returns, POST /returns/exchange, GET /returns (filters: date, branch, cashier, customer, reason, condition, status, amount, original receipt), GET /returns/{id}, GET /sales/{id}/returnable (per-line returnable qty, window status, prior returns), POST /returns/{id}/approve|reject, GET /returns/reasons (reason codes), reprint return receipt (audited), customer returns history for CRM (permission-gated).
- Fraud indicators endpoint and events: high return frequency per customer/cashier/device, no-receipt rate, returns shortly before shift close, high-value returns, repeated damaged claims, mismatch between condition claims and stock outcomes; thresholds from settings; every indicator shows its criteria (explainable).

7) PERMISSIONS: returns.create, returns.approve, returns.override_window, returns.no_receipt, returns.refund.cash, returns.refund.provider, returns.exchange, returns.view, returns.export.

TESTS (mandatory):
- Quantity safety: property-based sequences of partial returns never exceed sold quantity; 50 parallel return attempts on the same line → total returned ≤ sold.
- Money: proportional discount allocation sums exactly to total (no lost/extra qəpik: largest-remainder allocation test); tax reversal from snapshot; refund ≤ paid; promotion-invalidation policy cases (BOGO, bundle, receipt-level discount).
- Historical price integrity: price change after sale does not alter return value.
- Stock: condition → destination mapping; COGS reversal uses original cost snapshot; ledger sums match balances.
- Loyalty: earned points reversed proportionally; redeemed points restored; negative balance policy.
- Exchange: atomicity (failure in new-sale stock check rolls back the return part), price difference both directions, neutral swap, linked documents.
- Approvals: limits, window override, receipt-less return rules, token binding.
- Cash: refund blocked without open shift or insufficient cash; provider refund UNKNOWN → reconciliation path.
- Idempotency: replay, mismatch, concurrent duplicates.
- Immutability: no UPDATE/DELETE paths for completed returns/refunds; branch-scope isolation; audit and outbox in same transaction.

DELIVERABLES: module, migrations (per-line return-state counter table, constraints), tests, docs/returns.md (policy tables: window, discount allocation, promotion invalidation, loyalty reversal; sequence diagrams for refund and exchange), updated OpenAPI. List assumptions/open questions (promotion-invalidation strictness, receipt-less price policy, store-credit scope).