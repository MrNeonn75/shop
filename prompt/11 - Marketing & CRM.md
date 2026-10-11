
PART A — MARKETING

1) CAMPAIGNS
- List with status (Draft, Pending approval, Approved, Scheduled, Active, Paused, Ended, Rejected), objective, dates, budget, branches, spent, sales attributed. Create/edit wizard: objective and type (seasonal, product, category, brand, branch-specific, loyalty, promo code), schedule (validate start < end, no overlap conflicts), budget, target branches, customer segments, eligible products/categories/brands (picker with exclusions), approval submission.

2) PROMOTION RULES BUILDER
- Rule types: percentage discount, fixed amount, buy-one-get-one, quantity-based tiers, bundle price, loyalty-member discount.
- Form per type with live validation and a SIMULATOR panel: enter a sample cart and see which promotions apply, the order of application, and the final price (simulation calls the server rule engine; the client never becomes the source of truth for discount calculation).
- Priority and stacking: drag-to-order priority list, stack/exclusive flags per promotion, conflict detector warning when two active rules overlap on the same products and dates.
- Validation: dates, eligible product list not empty, discount limits, margin warning if selling price falls below cost (permission-gated cost data).

3) PROMO CODES
- Generate single/bulk codes, usage limits (total, per customer), validity, branch/segment restrictions, status, redemption log.

4) APPROVALS & PERFORMANCE
- Approval inbox with approve/reject reason. Campaign performance page: sales, units, discount cost, gross margin, ROI on spend (only when cost and attribution data exist; otherwise show "Məlumat çatışmır" with reasons), before/after comparison, per-branch breakdown, redemption funnel. Marketing users cannot modify completed sales (no such actions in UI).

5) COMMUNICATIONS (scaffold)
- Message templates and audience builder respecting consent. Sending channels (SMS, email, WhatsApp) show "Konfiqurasiya olunmayıb" until a provider is configured; sending requires explicit authorization and shows recipient count and consent filtering result before confirm. Do not simulate sending.

PART B — CRM & LOYALTY

1) CUSTOMERS
- List: name, phone, email, tier, points balance, total spent, orders count, average order value, last purchase, segment tags, consent status. Filters/search by phone first. Quick-create (minimal fields only: name, phone, optional email, birth date optional) with consent checkboxes and purpose text; avoid unnecessary personal data.
- Duplicate detection by phone/email, merge customers flow with preview and audit.

2) CUSTOMER PROFILE
- Tabs: Ümumi, Alış tarixçəsi (reuse <CustomerPurchaseHistory/> from F7), Qaytarmalar (<CustomerReturnsHistory/>), Loyallıq (points ledger: earned, redeemed, expired, reversed after returns, with references), Təkliflər, Razılıqlar (consent history with timestamps and channel, opt-out toggle), Qeydlər, Audit. Metrics: lifetime value, AOV, purchase frequency, preferred categories/sizes (computed server-side).
- Data subject tools: export customer data, anonymize/delete request workflow per retention policy (permission-gated, audited). Retention policy settings shown.

3) SEGMENTS
- Rule-based segment builder (spend, recency, frequency, category, branch, tier, consent), live count preview, static vs dynamic segments, export.

4) LOYALTY PROGRAM
- Settings UI: earn rules (points per AZN, category multipliers), redemption rules (point value, minimum, max % of receipt), tiers (thresholds, benefits, downgrade rules), expiry rules, return-reversal rules, birthday/special rewards. Rewards catalog with stock and redemption flow. Versioned program changes with effective dates; simulator showing example earn/redeem scenario.
- Manual point adjustments require permission, reason, and approval above limit.

TECHNICAL: consent-aware everywhere (marketing audiences always filtered by valid consent); PII masking for roles without crm.pii.view; URL-synced filters; idempotent mutations.

DELIVERABLES: pages, schemas, mock repository (DEMO), unit tests (promotion priority/stacking display logic, segment rule serialization, points ledger derivation incl. return reversal), Playwright tests (campaign creation → approval, promo simulator, customer merge, consent opt-out excluded from audience).