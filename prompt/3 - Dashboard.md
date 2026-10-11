CONTEXT: Continue BRAND HOUSE ERP frontend (F1, F2 done).

GOAL: Executive and branch Dashboard driven by REAL query endpoints (via adapters). With the mock adapter use clearly labeled DEMO data. Never show invented figures as production data; when data is missing or an integration is not configured, show an explicit empty/"data unavailable" state.

FILTERS (sticky bar, synced to URL): branch (single/multi/all by permission), date range with presets (Bu gün, Dünən, 7 gün, Bu ay, Keçən ay, Bu il, Xüsusi), comparison toggle (previous period / same period last year).

KPI CARDS (each with an info tooltip showing its documented formula, delta vs comparison period, sparkline):
Total sales (net of returns), Gross profit (formula: net revenue − COGS, COGS method configurable e.g. weighted average), Net profit (shown only when all required cost data exists, otherwise "Hesablanmayıb" + reason), Sales growth %, Average order value, Units sold, Return rate, Inventory value, Inventory turnover, Outstanding supplier liabilities, Discount cost.
Create a KPI definitions registry (src/features/dashboard/kpiDefinitions.ts) with id, Azerbaijani label, formula text, unit, data source — the UI reads tooltips from it. Distinguish revenue, cash received, expenses, COGS, gross profit, net profit clearly.

WIDGETS:
- Sales trend (line/area, hourly for a single day, daily/weekly/monthly otherwise)
- Sales by branch (bar, ranking table with share %)
- Sales by section (Kişi/Qadın/Uşaq/Digər) and by type (Geyim/Ayaqqabı/Aksesuar)
- Top 10 best-selling products and categories
- Payment method breakdown (cash, card, others, split)
- Low-stock and out-of-stock alerts (link to filtered inventory page)
- Slow-moving / dead stock summary
- Expense trend by category
- Open purchase orders and transfers in transit
- Open registers and cash discrepancies today
- Recent activity feed (large returns, cancellations, manual adjustments, discounts above limit)

ROLE-BASED VARIANTS: Admin/Baş menecer (company-wide), Filial meneceri (own branches), Kassir (shift summary only), Anbardar (stock-focused), Mühasib (finance-focused). Widgets rendered by permission.

TECHNICAL:
- Each widget is its own component with its own query, skeleton, error state with retry, and empty state; failures must not break the page.
- Auto-refresh every 60s (configurable) plus manual refresh and "last updated" timestamp (Asia/Baku).
- Widgets can be exported (CSV/PNG); drill-down links open the relevant report with filters pre-applied.
- Charts: accessible colors in black/white/accent palette, tooltips with formatted AZN values, responsive; table fallback for screen readers.
- Performance: lazy-load charts, memoization, no layout shift.

DELIVERABLES: Dashboard page, widgets, KPI registry, mock data generator (seeded, deterministic), unit tests for formatters and KPI calculations on mock data, Playwright test for filters and role variants.