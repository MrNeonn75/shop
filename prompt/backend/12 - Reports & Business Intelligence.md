
GOAL: Build modules `reporting` and `analytics`.

PRINCIPLES
- Reports run on real data through documented queries. Never return fabricated or placeholder figures. When data is missing return an explicit state: NO_DATA, NOT_COMPUTABLE (with the list of missing inputs), or NOT_CONFIGURED.
- Every KPI has a documented definition (id, az label, formula text, unit, source tables, caveats) in a single KPI registry (code + docs). The API returns `definition_id` with each figure. Money = Decimal; business-day boundaries use Asia/Baku.
- Reporting must never slow down or block transactional paths (POS, stock posting).

1) DATA ARCHITECTURE
- Read models: start with SQL views / materialized views and summary tables fed by outbox events (idempotent consumers): daily_sales_summary (by date, branch, cashier, register, tender), daily_sales_by_variant (units, net revenue, discount, tax, COGS from stored cost snapshots), returns_summary, stock_snapshots (daily on-hand + valuation per warehouse/variant from the ledger), inventory_velocity (7/28/56-day), purchasing_summary, expense_summary, payroll_summary, campaign_attribution_summary, loyalty_activity_summary, customer_metrics.
- Refresh strategy: incremental updates on events + nightly full reconciliation job that recomputes from source and flags drift (alert event on mismatch). Documented freshness (`data_as_of` timestamp returned with every report).
- Optional read-replica routing via config (reports use the replica if configured; otherwise primary with statement timeout and low priority).
- Late-arriving data (period reopen, reversals) handled by re-aggregating affected dates; summary tables include `source_version` to prove consistency.
- Indexes/partitioning plan for large tables; query budget: p95 < 500 ms for standard reports on 12 months × 10 branches × 500k variants-sold dataset (include data generator and benchmark script, DEMO labeled).

2) REPORT FRAMEWORK
- report_definitions registry in code: id, az title, module, permissions required (cost/profit reports need finance/cost permissions), filter schema (date range, branch(es), product, category, section/type, brand, cashier, supplier, payment method, customer segment where relevant), columns (key, az label, type, format, sortable, masked-by-permission), default sort, export config, drill-down links (target report + filter mapping).
- Generic execution endpoint: POST /reports/{id}/run with validated filters → rows (cursor/page), summary KPIs, chart series, `data_as_of`, applied-filter echo, branch-scope enforced automatically. Whitelist-only filter/sort fields; no raw SQL from clients.
- Async path for heavy reports: job id, progress, result stored (expiring), notification event when ready, download history. Result caching keyed by (report, filters, user branch scope, data_as_of) with explicit invalidation by summary refresh.
- Export: streaming CSV, XLSX (openpyxl/xlsxwriter, constant memory), PDF for printable reports; column-level masking and cost/salary exclusions by permission; every export audited (who, report, filters, row count); export size/row limits from settings; sensitive exports require a reason.
- Saved presets (personal/shared), favorites, recents, shareable filter links (filters only, never data), scheduled report delivery definitions (email/messenger only if integration ACTIVE; else NOT_CONFIGURED; delivery runs under the creator's permissions at run time, re-checked each run).

3) REQUIRED REPORTS (implement all, each with definition docs and tests)
Sales: daily/weekly/monthly sales; by branch, cashier, product/variant, category, section/type, brand, payment method; returns and refunds; average transaction value; units sold; hourly weekday×hour heatmap; discount impact; sales by customer segment.
Inventory: current stock; valuation (method label from settings; point-in-time via snapshots); movement history; low stock; out of stock; slow-moving; fast-moving; dead stock (thresholds from settings displayed in output); adjustments (by reason/user); discrepancies (count variances); stock aging; size/color sell-through matrix; in-transit stock.
Purchasing: by supplier; purchase history; outstanding POs; goods-receipt discrepancies; supplier balances and aging; price variance; supplier performance (formulas from B6).
Finance: income and expenses; cash-flow summary; supplier payables; receivables (if enabled); payment reconciliation; gross profit; operating expenses; net profit (NOT_COMPUTABLE with reasons when inputs incomplete); branch P&L comparison; budget vs actual; daily cash report.
HR: headcount; attendance; absence; overtime; payroll summaries (hr/payroll permission, aggregates only unless individual access granted); branch staffing vs schedule.
Marketing/CRM: campaign performance; discounts granted; campaign profitability (only with cost + defined attribution; else INSUFFICIENT_DATA); loyalty activity (earned/redeemed/expired/reversed); customer retention and repeat rate; new vs returning.
Operations/Audit: cashier control indicators (void/discount/return rates, cash variances), register shift summaries.

4) KPI REGISTRY & DASHBOARD API (frontend F3)
- GET /dashboard?branch_ids&date_from&date_to&compare=prev_period|prev_year: returns each KPI with value, comparison value, delta, sparkline series, definition_id, state. KPIs: total sales (net of returns), gross profit, net profit (when computable), sales growth %, average order value, units sold, return rate, inventory value, inventory turnover, outstanding supplier liabilities, discount cost, plus widget datasets (sales trend, by branch/section/type, top products/categories, payment mix, low-stock alerts, slow-moving summary, expense trend, open POs, transfers in transit, open registers and cash discrepancies, recent notable activity feed).
- Role variants are driven by permissions (server omits widgets/figures the caller cannot see; never just hide client-side).
- Each widget has its own endpoint so one failure doesn't break the page; caching with short TTL; `data_as_of` included.
- Formulas (document and test): net sales = gross sales − returns − discounts as defined (state exactly which are included, tax excluded); gross profit = net revenue − COGS (cost snapshots); inventory turnover = COGS / average inventory value over period (average from snapshots; state method); return rate = returned units (or value) / sold units (or value) — choose one, document, expose both if useful; AOV = net sales / number of completed transactions; sales growth = (current − comparison) / comparison with divide-by-zero handled as NOT_COMPUTABLE.

5) REPORT BUILDER (lightweight, safe)
- Datasets exposed by server-defined semantic layer (sales lines, stock movements, purchase lines, expenses, customers aggregates): each dataset lists whitelisted dimensions and measures with permissions (cost, margin, salary excluded unless allowed). Query compiled server-side from a validated JSON spec (dimensions, measures, filters, grouping, sorting, limit) into parameterized SQL through SQLAlchemy Core — NO user-provided SQL fragments. Enforce branch scope, max rows, statement timeout, and complexity limits (joins, group-bys). Save as personal/shared report; sharing re-checks the viewer's permissions per run.

6) BUSINESS INTELLIGENCE
- Performance analytics: growth, branch ranking, mix, targets vs actuals (sales_targets table: branch × month, versioned, approval).
- Inventory intelligence: days of inventory, sell-through by collection/season attribute, markdown candidates (criteria shown), reorder suggestions (inputs and formula returned with each suggestion; labeled SUGGESTION).
- Customer analytics: new vs returning, RFM segmentation (thresholds from settings), lifetime value distribution, basket analysis (co-purchase support/confidence with minimum-support settings), churn-risk list (criteria explicit: days since last purchase vs personal average interval).
- Profitability: margin by product/category/brand/branch, discount leakage, return cost, shrinkage (adjustments/lost/damaged value).
- Anomaly highlights: rule-based detections only (documented thresholds, z-score or fixed rules) for discounts, returns spikes, cash variances, manual adjustments, after-hours activity; each links to evidence (source transaction list); no opaque scoring.
- Chart annotations (manager notes, campaign markers) stored and returned with series.
- No predictive claims without a documented method; any forecasting (simple seasonal/moving average) is labeled with method, window, and error metrics on backtest.

7) PERMISSIONS: reports.view.{sales,inventory,purchasing,finance,hr,marketing}, reports.cost.view, reports.profit.view, reports.export, reports.schedule.manage, reports.builder.use, reports.builder.share, bi.view, bi.targets.manage, dashboard.view.{executive,branch,cashier,inventory,finance}.

TESTS (mandatory):
- Golden-data tests: a fixture dataset with hand-computed expected values for every KPI and report (net sales, gross profit, turnover, return rate, AOV, valuation, aging buckets); exact decimal equality.
- Consistency: summary tables == recomputation from source (reconciliation job parity test); reversals/returns/period-reopen re-aggregation; idempotent event consumption (replay → no change).
- Timezone: sales at 23:59/00:00 Asia/Baku land on the correct business day; DST not applicable but test UTC offset handling.
- NOT_COMPUTABLE logic: missing costs → net profit state with the missing-input list; divide-by-zero cases.
- Permissions: cost/profit/salary masked or omitted; branch scope isolation on every report; export audit and masking; report builder rejects non-whitelisted fields and injection attempts (fuzz tests), enforces limits/timeouts.
- Performance: benchmark suite with thresholds in CI (informational on PR, enforced nightly).
- Async jobs: progress, expiry, notification event; scheduled delivery uses current permissions.

DELIVERABLES: modules, migrations (views/materialized views/summary tables), consumers/jobs, data generator + benchmark scripts, tests, docs/kpi-definitions.md (generated from registry), docs/reporting-architecture.md (read models, refresh/reconciliation, freshness), updated OpenAPI. List assumptions/open questions (COGS method for historical restatement, return-rate definition, replica availability).