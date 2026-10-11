
GOAL: Build the Reports module and the BI/Analytics module (src/features/reports, src/features/bi).

GLOBAL RULES:
- Every report runs on real queries through the adapter layer. With the mock adapter all data is labeled DEMO. Never display fabricated or placeholder figures as production data; show explicit empty/"Məlumat yoxdur"/"Hesablanmayıb" states with reasons.
- Every financial or KPI figure has a documented definition (tooltip + "Hesablama qaydası" drawer) read from the KPI registry. Extend the registry; do not duplicate definitions.
- Gross profit uses the COGS method configured in settings; label which method is active on the report.
- Distinguish revenue, cash received, expenses, COGS, gross profit, net profit. Net profit appears only when all required costs exist.

1) REPORT CENTER
- Catalog page grouping reports: Satış, Anbar, Satınalma, Maliyyə, HR, Marketinq. Search, favorites, recently used, permission-based visibility (e.g. cost/profit reports need finance permissions).
- Shared report layout: FilterBar (date range with presets, branch multi-select limited by user's branches, product, category, section, brand, cashier, supplier where relevant), summary KPI strip, chart + table, drill-down links, export (CSV, XLSX, PDF), print view, "last generated" timestamp (Asia/Baku), saved filter presets, share link with filters in URL.
- Large reports: async generation with progress, notification when ready, download history.

2) REQUIRED REPORTS
Sales: daily, weekly, monthly; by branch, cashier, product, category, section/type, payment method; returns and refunds; average transaction value; units sold; hourly heatmap (weekday × hour); discount impact.
Inventory: current stock, stock valuation, movement history, low stock, out of stock, slow-moving, fast-moving, dead stock (thresholds configurable and displayed), adjustments, discrepancies (count variances), stock aging, size/color sell-through matrix.
Purchasing: purchases by supplier, purchase history, outstanding POs, goods-receipt discrepancies, supplier balances and aging, price variance.
Finance: income and expenses, cash-flow summary, supplier payables, payment reconciliation, gross profit, operating expenses, net profit (when computable), branch P&L comparison.
HR: headcount, attendance, absence, overtime, payroll summaries (permission-gated), branch staffing vs schedule.
Marketing and loyalty: campaign performance, discounts granted, campaign profitability (only with cost/attribution data), loyalty activity (earned, redeemed, expired, reversed), customer retention and repeat-rate.

3) REPORT BUILDER (lightweight)
- Choose dataset (sales lines, stock movements, purchases, expenses), pick dimensions/measures from a server-provided whitelist, filters, grouping, sorting; save as personal or shared report; permission checks for sensitive fields (cost, salary). No raw SQL input in the UI.

4) BUSINESS INTELLIGENCE
- Executive analytics pages (richer than the F3 dashboard):
  a) Performance: sales growth, branch ranking, section/type mix, cohort of best products, target vs actual (targets configurable per branch/month).
  b) Inventory intelligence: inventory turnover, days of inventory, sell-through by season/collection, markdown candidates, reorder suggestions (clearly marked as suggestions with explanation of inputs).
  c) Customer analytics: new vs returning, RFM segments, lifetime value distribution, basket analysis (frequently bought together), churn-risk list.
  d) Profitability: margin by product/category/brand/branch, discount leakage, return cost.
  e) Anomaly highlights: unusual discounts, returns spikes, cash variances, stock adjustments by user — each with a link to evidence; display detection criteria, no black-box scoring without explanation.
- Period comparison, drill-down from any chart to the underlying report, annotations on charts (manager notes, campaign markers).
- Scheduled report delivery settings (email/messenger channels show "Konfiqurasiya olunmayıb" until a provider exists; never pretend to send).

5) PERFORMANCE & ACCESSIBILITY
- Lazy-load charts, virtualized large tables, cancel in-flight queries when filters change, chart color-safe palette within the brand tokens, table alternative for every chart, keyboard-accessible controls.

DELIVERABLES: pages, report definitions registry (id, az title, permissions, filters schema, columns, export config), mock repository (DEMO, deterministic seed), unit tests (KPI formulas on fixture data, filter serialization to URL, export column mapping), Playwright tests (apply filters → export, drill-down from chart to table, permission hides profit reports for Kassir).