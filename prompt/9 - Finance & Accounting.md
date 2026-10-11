
GOAL: Build the Finance module (src/features/finance) for operational financial control, with a clear integration boundary for a future double-entry general ledger.

PRINCIPLES (enforce in UI wording and structure):
- Distinguish revenue, cash received, expenses, cost of goods sold (COGS), gross profit, net profit. Cash received is NOT revenue.
- Tax rates/rules come from configuration only; never hardcode legal rates or state regulatory compliance. Show a note: "Vergi qaydaları Azərbaycan tələblərinə uyğun yoxlanılmalıdır."
- Finalized financial transactions are never deleted; use reversal entries with reason and audit trail.

1) FINANCE OVERVIEW
- Filters: branch, date range. Cards: cash and bank balances, receivables, payables, expenses (period), pending approvals. Each KPI has a definition tooltip (from the KPI registry created in F3).

2) CASH & BANK ACCOUNTS
- Accounts list (cash, bank, card-settlement), balances derived from movements, statement view per account, cash movements (transfer between accounts, deposit to bank, withdrawal), branch cash-office view linked with POS register closings.
- Payment-method reconciliation: expected from sales by tender vs actually settled/deposited; mismatch review with notes. Bank statement import (CSV) with matching UI (auto-match by amount/date/reference, manual match, unmatched list).

3) INCOME & EXPENSES
- Expense records: category (hierarchical, configurable: icarə, kommunal, maaş, marketinq, nəqliyyat, təmir, vergi, digər), branch, supplier optional, amount, tax, payment method/account, date, attachments (receipt scans), status flow Draft → Submitted → Approved → Paid, with approval thresholds and reasons for rejection.
- Recurring expenses (rent, utilities): schedule, generates drafts for review (never auto-pays).
- Other income records with categories.
- Branch expense allocation for shared costs (percentage/rule-based) with preview.

4) PAYABLES & RECEIVABLES
- Supplier payables (links to F8 invoices/payments) with aging; customer receivables where applicable (corporate/credit sales) with aging, statements, payment recording.
- Payment records page with allocation details.

5) BUDGETS
- Budget by branch/category/period, actual vs budget variance table and chart, alerts when thresholds are exceeded, revision history, approval.

6) FINANCIAL REPORTS
- Daily cash report, branch financial summary, cash-flow summary (direct method from cash movements), expense trend, P&L (management view) with explicit lines: Net revenue, COGS (method from settings: weighted average / FIFO label as configured by backend), Gross profit, Operating expenses by category, Net profit — net profit only shown when all required cost data exists, otherwise show "Hesablanmayıb" with the missing-data reason list.
- Every figure has a drill-down to underlying transactions. Export XLSX/PDF.

7) ACCOUNTING INTEGRATION BOUNDARY
- Define TypeScript interfaces and a "Mühasibat inteqrasiyası" settings page: posting rules mapping (event → accounts), chart-of-accounts viewer (read-only if an external/GL module is connected), journal entries viewer with balanced debit/credit display, reversal entries. If the GL is not enabled show explicit "Aktiv deyil" state; do not fake journals.

8) APPROVALS & AUDIT
- Unified approvals inbox for expenses, payments, budget revisions. Every transaction shows its history and who approved.

TECHNICAL: decimals/integers only for money; idempotent mutations; permission gates (finance.expense.approve, finance.cash.view, finance.report.view); URL-synced filters.

DELIVERABLES: pages, schemas, mock repository (DEMO), unit tests (aging, budget variance, P&L line math, cash-flow derivation), Playwright tests (expense approval flow, bank statement matching, reversal instead of delete).