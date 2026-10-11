
GOAL: Build the POS module (src/features/pos) as a separate full-screen layout optimized for barcode scanner, keyboard, and touchscreen (tablet/monitor). Fast, reliable, minimal clutter, high contrast black-and-white style, large touch targets (min 48px).

1) CASHIER FLOW
- Cashier login (PIN or username+password), branch and register auto-detected or selected.
- Open register: opening cash count (denomination counter, expected float), confirm. Cannot sell without an open shift.
- Shift header always visible: cashier, branch, register, shift start, connection status, current receipt number preview.

2) SALE SCREEN (two-pane layout)
- Left: scan/search input always focused (barcode scanner = fast keystrokes ending with Enter), product search results (name, SKU, size/color variant picker as chips with per-variant stock), recent items, quick category buttons for touch.
- Right: cart — line items with variant, qty stepper, unit price, line discount, line total; remove line; subtotal, discounts, tax (from configured rules), grand total in large type.
- Keyboard shortcuts (documented in a help overlay): F2 customer, F4 discount, F8 suspend, F9 recall, F10 pay, Esc cancel dialog, +/- qty, Del remove line.
- Price and availability validated against the server on add and again before payment; show clear messages if price changed or stock unavailable. Negative stock policy comes from the server.
- Authorized discounts: percent/fixed at line or receipt level, limited by the cashier's permission; above the limit → manager PIN approval dialog; reason code required. Show applicable active campaigns/promo codes automatically with transparent breakdown and stacking rules from the server (do not compute promotion logic only in the client).
- Customer selection: search by phone/card/name, quick-create customer with minimal fields and consent checkbox for marketing; show loyalty tier and points available, option to redeem points.
- Suspended sales: park cart with a label, list of suspended carts, recall later (server-stored, branch-scoped).

3) PAYMENT
- Payment dialog: cash, card, and configurable extra methods; SPLIT PAYMENTS (add multiple tenders until balance is zero); cash tendered and change calculation; quick-cash buttons.
- Card payments: only through a configured payment-provider integration. If no terminal/provider is configured show "Ödəniş terminalı konfiqurasiya olunmayıb" and block card tender (or allow only an explicitly configured "manual card entry/external terminal confirmation" method with required approval reference number). NEVER simulate a successful card payment. NEVER store or display raw card numbers or CVV.
- Finalize button disabled until payments exactly cover the total; send one request with Idempotency-Key (generated once per sale attempt, reused on retry) so repeated clicks or network retries never create duplicate sales.
- On success: show receipt number, print receipt (thermal 80mm/58mm print CSS, browser print or configured printer service), optional e-receipt/email only if provider configured, "Yeni satış" button. On failure: keep cart intact, show precise reason (stock, payment mismatch, price change, session expired).
- If the network is down: show a clear offline banner and BLOCK finalizing sales. Do NOT claim offline support (a separate offline design is out of scope).

4) OTHER REGISTER FUNCTIONS
- Cash in / cash out with reason and optional attachment, requires permission above limits.
- Receipt lookup and REPRINT (marked "SURƏT", audit-logged with reason).
- Sale cancellation (void) of current-shift receipts with manager authorization and reason; completed sales are never deleted, only reversed.
- Quick return/exchange entry point linking to F7 flows (lookup original receipt by number or barcode).
- Shift history and daily register report (X report mid-shift, Z report at close).
- Close register: denomination count, expected vs counted cash by payment method, variance with required explanation above tolerance, manager confirmation, print Z report. After closing the register is locked.

5) UX/ROBUSTNESS
- Never lose cart on page refresh (persist locally, reconcile with server).
- Session timeout does not clear an open cart; re-authenticate with PIN.
- Sound/visual feedback on scan success and failure (accessible, toggleable).
- Error boundary specific to POS; no dev-only UI.
- All strings in az locale files; money formatting via shared formatters; amounts handled as integers/decimals, never floats.

DELIVERABLES: POS layout and pages, mock adapter (with simulated promotions, stock, tender validation), unit tests (cart totals, rounding, split payment validation, idempotency key lifecycle), Playwright tests (scan → pay cash, split payment, discount needing manager approval, suspend/recall, close register with variance, double-click does not create two sales).