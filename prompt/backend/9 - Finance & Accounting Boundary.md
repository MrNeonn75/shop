
GOAL: Build module `finance` for operational financial control, with an accounting integration boundary and an OPTIONAL balanced double-entry general ledger.

PRINCIPLES
- Distinguish revenue, cash received, expenses, COGS, gross profit, net profit. Cash received is NOT revenue. Each concept has its own documented definition in docs/finance-definitions.md and in the KPI registry.
- Finalized financial transactions are never deleted or edited. Corrections are linked reversal entries with reason and audit.
- Tax rates/rules come ONLY from settings (effective-dated, empty by default). Never hardcode legal rates and never claim compliance with Azerbaijani regulations without verification; docs list this as an open question requiring a local accountant review.
- Finance consumes domain events (sale.completed, return.completed, goods receipt, invoice approved, payroll finalized, shift closed) from the outbox. Consumers are idempotent (processed_events table keyed by event id + consumer name) and run in the worker.

1) ACCOUNTS & MONEY MOVEMENTS
- financial_accounts: cash (branch cash office, registers' safe), bank, card-settlement/clearing, other; currency; branch (nullable for company-level); status. Balance is DERIVED from an append-only `account_transactions` ledger (account_id, direction, amount, occurred_at, source_type/source_id, memo, reversal_of) — no editable balance column.
- Transfers between accounts (two linked transactions in one DB transaction), bank deposit of register cash (links to shift close), withdrawals, opening balances (document, once per account unless privileged override).
- Payment-method reconciliation: expected settlement per tender per day (from sales/returns) vs actual bank/provider settlement entries; reconciliation sessions with match states (matched, partial, unmatched), notes, adjustments (fees/chargebacks with categories). Bank statement CSV import (staged: parse → map → validate → dry-run → commit) with auto-match rules (amount + date window + reference) and manual match endpoints.
- Shift-close integration: cash counted at close creates a cash-office receipt; variances are posted to a configurable "cash over/short" category with approval.

2) INCOME & EXPENSES
- expense_categories (hierarchical, configurable; seeded examples: icarə, kommunal, əməkhaqqı, marketinq, nəqliyyat, təmir, vergi və rüsumlar, digər), income_categories.
- expenses: branch, category, supplier (optional, via supplier service interface), amount, tax amount (computed from settings tax class or entered with validation), payment account, date, description, attachments (receipts; MIME/size validation), status DRAFT → SUBMITTED → APPROVED → PAID (+ REJECTED, CANCELLED/REVERSED). Approval via the shared approvals engine with amount thresholds, SoD (creator ≠ approver), delegation. Payment creates account_transactions in the same transaction.
- Recurring expense templates (rent, utilities): schedule, generates DRAFT expenses for review through a scheduled job; NEVER auto-approves or auto-pays.
- Shared-cost allocation: allocate a company-level expense across branches by rule (equal, revenue share, headcount, fixed percentages) with preview; allocations stored as child records summing exactly to the total (largest-remainder rounding).
- Other income records (non-sales income) with categories and approval rules.

3) PAYABLES & RECEIVABLES
- Supplier payables: read model over `supplier_ledger_entries` (B6) plus finance payment postings; aging buckets, due-soon, overdue events.
- Customer receivables (corporate/credit sales if enabled by setting): receivable invoices, payments, allocations, aging, statements, write-offs (approval + reason, reversal-based). If credit sales are disabled, endpoints return a clear "feature disabled" state.
- Payment records: unified payments listing with allocation details, reversal flow (compensating entries).

4) BUDGETS
- budgets by period × branch × category (versioned, approval), actual vs budget computed from posted transactions, variance %, threshold alerts via outbox events, revision history, lock after period close.

5) PERIOD CONTROL
- fiscal periods (month/year) with states OPEN → CLOSING → CLOSED. Closed periods reject new postings dated inside them (409 PERIOD_CLOSED); corrections post into the current open period with a back-reference, or reopen with privileged permission, reason, and audit. Period close checklist endpoint (unreconciled items, pending approvals, unclosed shifts, unmatched bank lines).

6) ACCOUNTING INTEGRATION BOUNDARY
- Define the port: `AccountingPort.post(event: AccountingEvent)` with events: SALE_RECOGNIZED, RETURN_RECOGNIZED, COGS_RECOGNIZED, INVENTORY_RECEIVED, SUPPLIER_INVOICE_APPROVED, SUPPLIER_PAYMENT, EXPENSE_PAID, PAYROLL_POSTED, CASH_VARIANCE, BANK_FEE, ADJUSTMENT, etc. Each event carries amounts split into net, tax, and cost, source references, branch, business date.
- Implementation A (default): `OperationalLedgerAdapter` — records operational financial facts (revenue recognition records, cost records, cash movements) without full double-entry.
- Implementation B (feature flag `finance.gl.enabled`, OFF by default): full double-entry GL: chart_of_accounts (editable tree, account types asset/liability/equity/revenue/expense/contra, no seeded legal chart — provide a neutral template file only and mark it as requiring accountant review), journal_entries + journal_lines (append-only), enforced DEBIT = CREDIT balance per entry via a DB constraint trigger and service validation, posting_rules table mapping events → accounts (versioned, effective-dated, validated for completeness before enabling), reversal entries (never edits), period locks, trial balance and general ledger queries. Enabling GL requires a completeness check and, if enabled mid-life, an opening-balances import with a cut-over date. If disabled, all GL endpoints return NOT_ENABLED. Never show fake journals.
- Idempotent posting: unique (event_id, adapter) so retries never double-post; failed postings go to a dead-letter table with retry tooling and alerts.

7) FINANCIAL REPORT QUERIES (consumed by B12; implement the definitions now)
- Revenue (net of returns, excluding tax, recognized at sale/return completion), cash received by tender/account, COGS (from stored per-line cost snapshots; method label from settings), gross profit = net revenue − COGS, operating expenses by category (accrual by expense date, cash by payment date — both views, labeled), net profit = gross profit − operating expenses (− other costs defined in docs); returned as NOT_COMPUTABLE with an explicit list of missing inputs when costs are incomplete (e.g. variants without cost, unposted payroll, unapproved expenses).
- Daily cash report, branch financial summary, cash-flow summary (direct method from account_transactions), payables/receivables aging, budget variance, payment reconciliation summary, branch P&L comparison.
- Every figure exposes `definition_id` and a drill-down query reference (source transactions list endpoint with identical filters).

8) PERMISSIONS: finance.account.view/manage, finance.cash.transfer, finance.expense.create/approve/pay/reverse, finance.income.create, finance.budget.manage/approve, finance.reconciliation.run, finance.period.close/reopen, finance.gl.view/post/configure, finance.report.view, finance.export. Sensitive (profit, cost) endpoints separately gated.

TESTS (mandatory):
- Idempotent event consumption: replay events 10× → one effect; out-of-order events handled.
- Revenue vs cash separation: credit sale → revenue without cash; refund → negative revenue + cash out; verify definitions with fixtures.
- Ledger integrity: balances equal sum of transactions under random sequences (property-based); transfers always net to zero.
- GL (flag on): every journal entry balances (DB-level violation test), reversal correctness, posting-rule completeness check, trial balance equals zero net; flag off → NOT_ENABLED.
- Period close: postings into a closed period rejected; reopen audited.
- Allocation: shared-cost splits sum exactly; budget variance math.
- Reconciliation: auto-match rules, partial match, fee adjustments.
- Approval/SoD, branch-scope isolation, immutability (no UPDATE/DELETE), attachments validation, audit + outbox same-transaction guarantee.

DELIVERABLES: module, migrations (triggers/constraints), consumers/jobs, tests, docs/finance-definitions.md, docs/accounting-boundary.md (events table, posting-rule examples, cut-over procedure), updated OpenAPI. List assumptions/open questions (tax/fiscal reporting requirements in Azerbaijan, chart of accounts standard, GL cut-over timing).