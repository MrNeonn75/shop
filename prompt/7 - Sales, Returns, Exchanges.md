
GOAL: Build the Sales History and Returns/Exchanges module (src/features/sales).

1) SALES HISTORY
- Table: receipt number, date-time (Asia/Baku), branch, register, cashier, customer, items count, subtotal, discount, tax, total, payment methods, status (Tamamlanıb, Qismən qaytarılıb, Tam qaytarılıb, Ləğv edilib).
- Filters: date range, branch, cashier, customer, payment method, status, product/SKU/barcode, amount range, promotion/campaign. Server-side pagination, export (CSV/XLSX), URL-synced filters.
- Receipt lookup by number or scanning the receipt barcode/QR.

2) SALE DETAIL PAGE
- Header with status and timeline (created, payments, returns, cancellations, reprints).
- Lines with the price actually charged at the time (use <PriceAtTime/>), discounts applied with campaign names, tax breakdown, payments (tender type, amount, reference — masked), customer and loyalty points earned/redeemed, linked stock movements, linked journal/cash entries (permission-gated).
- Actions by permission: reprint (audit reason), start return, start exchange, cancel/void (only allowed states; manager approval and reason), view audit trail.
- Finalized sales/refunds/financial transactions are never deletable in the UI; reversals create new linked documents.

3) RETURN FLOW (wizard)
- Step 1: locate original receipt (search/scan). If the product was sold without a receipt, "qəbzsiz qaytarma" requires a special permission and manager approval, with reason.
- Step 2: select lines and quantities. The UI computes "returnable quantity" = sold − previously returned (from the server) and blocks exceeding it. Per line: reason code (configurable list), condition classification: Satışa yararlı / Zədəli / Məhdud (determines destination location and stock treatment).
- Step 3: refund calculation: proportional discount allocation, tax reversal, loyalty points reversal preview (points earned on returned items are reversed; redeemed points handling per settings), refund method (original tender, cash, store credit — as allowed by rules), approval limits: above the user's limit require manager approval.
- Step 4: confirm and complete with Idempotency-Key; print return receipt; show linked documents created (stock movement, refund record, cash movement).
- Fraud indicators panel (read-only flags from the server): frequent returns by cashier/customer, returns without receipt, returns shortly before shift close, high-value returns.

4) EXCHANGE FLOW
- Return part + add new items in one transaction; show price difference (customer pays or receives refund), handle size/color swap quickly (variant picker with live stock at the current branch), single document pair (return + sale) linked together.

5) CUSTOMER VIEW INTEGRATION
- Reusable <CustomerPurchaseHistory/> and <CustomerReturnsHistory/> components for CRM.

6) REPORT SHORTCUTS
- Returns and refunds summary (by reason, product, cashier, branch), cancellation log.

TECHNICAL: all money via shared formatters; server is authoritative for returnable quantities and refund amounts — the client only displays and requests; handle 409 conflicts (e.g. already returned elsewhere) with refresh dialog.

DELIVERABLES: pages and components, mock data, unit tests (returnable quantity, proportional refund, loyalty reversal preview), Playwright tests (partial return, exceed-quantity block, return without receipt needing approval, exchange with price difference).