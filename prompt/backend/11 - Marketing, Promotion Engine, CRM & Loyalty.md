
GOAL: Build modules `marketing` (campaigns, promotions engine, promo codes), `crm` (customers, consent, segments), and `loyalty` (points, tiers, rewards).

PRINCIPLES
- The SERVER promotion engine is the only source of truth for discounts. The same engine powers preview (/pos/quote, simulator) and checkout finalization.
- Marketing can never modify historical sales. Campaign changes affect only future quotes.
- Minimal personal data; explicit, auditable consent; no real message is sent unless a provider is configured, the action is authorized, and recipients are consent-filtered.

PART A — MARKETING

1) CAMPAIGNS
- campaigns: name, objective, type (seasonal, product, category, brand, branch, loyalty, promo_code), status (DRAFT → PENDING_APPROVAL → APPROVED → SCHEDULED → ACTIVE → PAUSED → ENDED / REJECTED / CANCELLED), start/end (timezone Asia/Baku, validated start < end), budget, target branches, target segments, eligibility definitions (include/exclude products, variants, categories, brands, price range), created/approved by, version.
- Status transitions driven by a scheduler job on effective times (not by manual flags); ACTIVE evaluation is time-based at quote time too (the engine checks dates itself — never rely on a cron having flipped a flag).
- Approval via shared approvals engine with SoD; editing an ACTIVE campaign creates a new version effective from a future timestamp (past quotes unaffected); validation of eligible products (non-empty, not discontinued unless allowed), date conflicts, margin warnings when the resulting price falls below cost (requires cost permission to see details).

2) PROMOTION RULES (promotions belong to a campaign or stand alone)
- Types: PERCENT_OFF, FIXED_OFF, FIXED_PRICE, BOGO (buy X get Y free/discounted, with cheapest-item or specified-item rule), QUANTITY_TIER (buy N get tier discount), BUNDLE (set of items for a bundle price), LOYALTY_MEMBER (tier-based), RECEIPT_THRESHOLD (spend X get Y off), PROMO_CODE-gated variants.
- Rule definition as validated JSON schema (typed, versioned, no arbitrary code execution), stored with effective dating.
- PRIORITY & STACKING: each promotion has priority, stacking mode (EXCLUSIVE, STACKABLE_WITH_GROUPS, ALWAYS_STACK), exclusion groups, per-line maximum discount cap, per-receipt cap, never below cost unless explicit override flag. Conflict detector endpoint lists overlapping active promotions on the same variants/dates and predicts the resolution.
- Engine algorithm (deterministic, documented in docs/promotion-engine.md): 1) collect eligible promotions for (cart, customer, branch, time, code) 2) sort by priority then stable tie-breaker 3) apply per-line promotions, then bundle/BOGO groupings with optimal-allocation rules, then receipt-level promotions 4) enforce stacking/exclusions/caps 5) allocate receipt-level discounts to lines with largest-remainder rounding so line totals sum EXACTLY 6) return a full explanation per line (which promotion, how much, why others were not applied).
- Performance: quote with 20 lines and 200 active promotions p95 < 40 ms (in-memory compiled rule cache invalidated through outbox events on promotion changes; cache never serves stale rules past a configured TTL).
- Simulator endpoint POST /marketing/simulate (sample cart → explanation) and promotion-attribution data stored on each sale line (promotion id/version, discount amount) for reporting.

3) PROMO CODES
- Single and bulk generation (length, charset avoiding ambiguous characters, collision-safe), limits (total uses, per customer, per day), validity, branch/segment restrictions, status. Redemption table with unique constraints to prevent double redemption races (row lock/atomic counter; test with parallel redemptions at the limit). Redemption is recorded inside the sale transaction; reversal on cancellation/return per policy (code usage restored or not, configurable).

4) COMMUNICATIONS (scaffold, safe by default)
- message_templates (channel, language, variables with validation), audiences (segment + channel + consent filter), send_requests with dry-run summary (recipient count, excluded for no consent, excluded for missing contact). Actual sending only if the channel integration status is ACTIVE; otherwise NOT_CONFIGURED. Sending requires marketing.message.send plus approval for large audiences; unsubscribe link/keyword handling and opt-out processing endpoint; delivery logs. Never simulate sending.

5) PERFORMANCE & ATTRIBUTION (data layer; full reports in B12)
- Metrics per campaign with documented formulas: sales, units, discount cost, gross margin (requires cost snapshots), average basket, redemption count, new vs returning customers, ROI = (incremental gross margin − campaign spend) / campaign spend only when baseline/attribution method is defined; otherwise return INSUFFICIENT_DATA with reasons. Provide before/after and holdout-free comparisons labeled as such (no causal claims).

PART B — CRM & CUSTOMERS

6) CUSTOMERS
- customers: id, customer_no, full_name, phone (normalized E.164, unique when present), email (optional, unique when present), birth date (optional), gender (optional, not required), preferred language, status, source branch, created_by, notes, version. Collect only what is necessary: phone + name suffice; everything else optional.
- Quick-create endpoint (name, phone, optional email) with consent capture in the same request.
- Duplicate detection (phone/email/fuzzy name) and merge: preview of what moves (sales links, points, consents, history), irreversible merge requires permission and audit; losing record kept as tombstone alias.
- PII masking by role (crm.pii.view); search by phone first-class (indexed, normalized).
- Aggregates updated by consuming sale.completed/return.completed events (idempotent): total spent, order count, average order value, last purchase date, first purchase date, return counts/amounts, preferred categories/sizes (computed). Rebuild command to recompute from sales for verification.

7) CONSENT & PRIVACY
- consent_records (append-only): customer, purpose (marketing_sms, marketing_email, marketing_whatsapp, profiling, loyalty_terms), status (GRANTED/WITHDRAWN), channel/source (POS, web form, import, admin), timestamp, policy text version, actor. Current consent derived from the latest record per purpose. Opt-out endpoints and STOP-keyword processing hook. Imports of customers require declared consent source; records without consent are excluded from marketing audiences automatically.
- Data subject tooling: export customer data (JSON/PDF), anonymize/erase workflow with legal-hold checks and retention rules from settings (sales keep anonymized references for accounting integrity), request queue with SLA tracking and audit.
- Retention job: configurable inactivity period → review queue/anonymization (never silent destruction without approval policy).

8) SEGMENTS
- segment definitions as validated rule trees (spend, recency, frequency, category affinity, branch, tier, birthday month, consent flags), static and dynamic, count preview endpoint, scheduled refresh job, membership snapshot tables, export (PII permission + audit).

PART C — LOYALTY

9) PROGRAM & TIERS
- loyalty_programs (versioned, effective-dated): earn rules (points per AZN, category/brand multipliers, exclusions e.g. discounted items or gift cards), redemption rules (point value in AZN, min points, max % of receipt, non-stackable categories), tiers (thresholds by spend or points over rolling window, benefits, downgrade/grace rules), expiry rules (fixed/rolling, notice events), return reversal rules, birthday/special rewards.
- loyalty_ledger (APPEND-ONLY): customer, entry_type (EARN, REDEEM, EXPIRE, REVERSE_EARN, RESTORE_REDEEM, ADJUST, BONUS), points, source (sale_id/return_id/adjustment_id), program version, expires_at per earn lot (FIFO lots for expiry and redemption), balance derived from lots. Never edit rows; corrections are compensating entries.
- Service interface (replacing B7/B8 stubs): `LoyaltyService.preview_redeem`, `redeem(sale_tx)`, `earn(sale_tx)`, `reverse_for_return(return_tx)` — all executed INSIDE the caller's transaction; earn is computed from final paid amounts per eligible line after discounts per program rules; redemption validated and locked (row lock on the customer's points summary) to prevent double spend by parallel checkouts.
- Tier recalculation on events with history table (tier changes audited, notification events emitted).
- Manual adjustments require permission, reason, and approval above a threshold.
- Rewards catalog (reward, points cost, stock/limits, validity), redemption flow creating discount vouchers or free-item benefits consumed by the pricing engine; expiry handling.
- Fraud guards: velocity limits on redemptions, same-customer multi-branch checks, alerts on unusual earning (events to outbox).

10) PERMISSIONS: marketing.campaign.view/create/approve/pause, marketing.promotion.manage, marketing.promocode.manage, marketing.message.send, marketing.simulate, crm.customer.view/manage/merge, crm.pii.view, crm.consent.manage, crm.segment.manage, crm.export, crm.privacy.process, loyalty.program.manage, loyalty.points.adjust, loyalty.reward.manage.

TESTS (mandatory):
- Promotion engine: golden-file test suite (≥ 60 scenarios) covering each type, priority, stacking/exclusions, caps, never-below-cost, BOGO/bundle allocation, receipt-level allocation with exact rounding (sum of lines == total), timezone boundaries (Asia/Baku campaign start/end), determinism (same input → identical output).
- Quote/finalization parity: for random carts, /pos/quote result == checkout recomputation.
- Promo codes: parallel redemption at the limit → exactly limit succeed; reversal policy.
- Historical integrity: editing/ending a campaign never alters completed sales or their snapshots.
- Loyalty: property-based ledger/lot invariants (balance never negative under default policy, FIFO expiry correctness); redeem concurrency (parallel checkouts cannot double-spend); return reversal proportionality; tier transitions; program version effective dating.
- CRM: aggregates equal recomputation from sales (rebuild command parity), duplicate detection/merge integrity, phone normalization (+994 formats), consent derivation and audience filtering (no consent → excluded, always), data-subject export/anonymization flow, PII masking.
- Communications: NOT_CONFIGURED behavior, dry-run counts, opt-out processing.
- Approvals/SoD, branch-scope isolation, audit and outbox in same transaction.

DELIVERABLES: modules, migrations, caches/jobs, tests (including golden promotion fixtures), docs/promotion-engine.md (algorithm, stacking examples, rounding rules), docs/loyalty.md (earn/redeem/expire/reverse rules and lot model), docs/privacy-crm.md (consent model, retention, data-subject process), updated OpenAPI. List assumptions/open questions (BOGO/bundle allocation preference, points expiry policy, personal-data law requirements in Azerbaijan to be verified by counsel).