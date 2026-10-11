
GOAL: Make the frontend release-candidate quality.

1) CODE QUALITY
- Run full TypeScript strict check, ESLint, Prettier; eliminate any types, unused code, duplicate components, and hardcoded colors/strings (must use tokens and az locale files). Add lint rules to prevent regressions (no-restricted-syntax for hex colors, i18n missing-key check).
- Verify the feature-folder boundaries: no cross-feature imports except through public index files.
- Remove or clearly gate all mock/demo data: production build with VITE_DATA_SOURCE=http must contain no demo seeds in the bundle and must display a visible environment badge in non-production environments.

2) TEST COVERAGE
- Unit/integration (Vitest + RTL): formatters (AZN, dates in Asia/Baku, Azerbaijani uppercase "İ"/lowercase "ı" handling), money arithmetic (no float errors), permission logic, KPI definitions, cart/refund/payroll/ledger calculations, form schemas. Set coverage thresholds for critical folders (money, permissions, pos, inventory, sales: ≥ 85%).
- End-to-end (Playwright) critical paths with role-based fixtures: login and route guards; product create with size×color matrix; opening balance import; purchase → receipt → invoice → payment; transfer with partial receipt; POS sale cash/split/discount approval/suspend/recall; return and exchange; register close with variance; expense approval; payroll finalization; campaign approval and promo simulation; role edit audited; branch-scope isolation (branch manager cannot see other branch data via UI or URL tampering); idempotency (double-click and retry create one document).
- Visual regression snapshots for key screens in light and dark themes at desktop, tablet, and POS touch sizes.
- Contract tests: validate the HttpAdapter request/response types against the backend OpenAPI schema (generate typed client from the OpenAPI spec when available); fail CI on drift.

3) ACCESSIBILITY (WCAG 2.1 AA)
- Automated axe checks in Playwright on all main pages; manual keyboard pass: tab order, focus traps in modals/drawers, visible focus, skip-to-content link, escape handling.
- Color contrast verification for all token pairs in both themes (including the brand accent once supplied); do not rely on color alone for statuses (icon + text).
- Screen-reader labels for icon buttons, table headers, chart summaries and data-table alternatives, live regions for toasts and scan feedback.
- Azerbaijani language attribute (lang="az"), correct pluralization and date/number reading.

4) PERFORMANCE
- Budgets: initial JS ≤ 250 KB gzip for the shell, route-level code splitting for every module, lazy chart/table-heavy components, virtualized tables for >200 rows, image lazy-loading with responsive sizes.
- Measure with Lighthouse and the React Profiler; POS screen must stay responsive: scan-to-cart under 100 ms on mid-range hardware (client-side), no layout shift, no blocking re-renders of the entire cart on each keystroke.
- TanStack Query tuning: sensible staleTime per data type, request deduplication, cancellation on filter change, prefetch for likely navigation; never cache POS price/stock validation responses.
- Bundle analysis report and removal of unused dependencies.

5) SECURITY (frontend side)
- No tokens in localStorage; sanitize any rendered rich text; CSP-compatible build (no inline eval); dependency audit (npm audit / OSV) with documented exceptions; no secrets in the bundle; masked PII/salary in logs and error reports; error reporting hook configurable (Sentry-compatible) without sending PII.
- Confirm all authorization-sensitive UI relies on the server for enforcement and shows proper 403 handling.
- Prevent open redirects after login, validate file uploads client-side (and note server must re-validate).

6) RESILIENCE & UX HARDENING
- Global handling for network loss, session expiry, 409 conflicts, 5xx with retry; POS offline banner blocks finalization (no offline claims).
- Unsaved-changes protection on all long forms; consistent empty/loading/error states; consistent confirmation patterns.
- Print styles verified for receipts (58/80mm), transfer notes, barcode labels, payslips, reports.

7) DOCUMENTATION & HANDOVER
- README sections: architecture, folder map, adapter switching, environment variables, permissions catalog, KPI definitions registry, how to add a module/language/report, testing guide, release checklist.
- Storybook or /dev/ui kept current. CHANGELOG. A "KNOWN LIMITATIONS" file listing honestly what is not implemented (e.g. offline POS, unconfigured integrations, GL if not enabled).
- Final report: checklist of requirements from F1–F13 with status (done/partial/not done), test results, Lighthouse/axe summaries, open risks and questions.

DELIVERABLES: fixes committed in small logical commits, CI config (lint, typecheck, unit, e2e, build, audit), coverage and audit reports, final report.