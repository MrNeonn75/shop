
GOAL: Release-candidate quality backend.

1) CODE & ARCHITECTURE AUDIT
- Run ruff, mypy --strict, import-linter; fix violations. Verify module boundaries: no cross-module model imports; only InventoryService touches stock tables; only the numbering service allocates numbers; only the posting service writes financial ledgers. Add architecture tests (pytest-archon or import-linter contracts) that fail on regression.
- Search for float usage on money, naive datetimes, raw SQL string concatenation, missing branch-scope filters, endpoints without permission dependencies (automated test enumerating all routes and asserting each has an explicit auth/permission declaration or an allow-listed public marker).
- Verify every mutating endpoint that creates financial/stock/sales documents requires Idempotency-Key (route-level test).
- Remove dead code, unused dependencies; update docs.

2) TEST STRATEGY & COVERAGE
- Pyramid: unit (pure logic: money, promotions, payroll rules, costing, state machines), integration (real PostgreSQL via testcontainers; no SQLite substitutes), API contract tests (schemathesis against OpenAPI for property-based fuzzing), end-to-end business scenarios, load tests (k6/locust), chaos-style failure injection.
- Coverage gates: ≥ 90% line+branch on critical packages (money, inventory, pos, returns, finance posting, payroll, promotions, loyalty, auth/rbac), ≥ 80% overall; mutation testing (mutmut/cosmic-ray) on money, inventory posting, promotion engine, and payroll calculation with a documented minimum score.
- END-TO-END BUSINESS SCENARIOS (automated, realistic data):
  S1 Procurement-to-sale: request → approval → PO → partial goods receipt → invoice three-way match → partial payment → stock visible → POS sale → stock/finance/CRM/reports updated.
  S2 Transfer: central → branch with partial receipt, damaged/missing resolution, in-transit accounting.
  S3 POS day: open shift → sales (cash/card-config states/split) → discount with manager approval → suspend/recall → cancel → close shift with variance → Z report → bank deposit → reconciliation.
  S4 Returns/exchanges: partial return, receipt-less return with approval, exchange with price difference, loyalty reversal, COGS reversal.
  S5 Promotions: campaign approval → activation at Asia/Baku boundary → quote/checkout parity → promo code limit race → campaign end.
  S6 Month-end: expenses with approvals, recurring drafts, payroll run to finalization, period close, P&L with NOT_COMPUTABLE edge cases, report reconciliation.
  S7 Security: privilege escalation attempts, cross-branch access attempts on every endpoint (generated from the route table), token theft/refresh reuse detection, session revocation, audit hash chain verification.
- Failure injection suite: DB connection drops mid-transaction, worker crash between commit and dispatch, duplicate webhook delivery, provider timeout (UNKNOWN payment), Redis down (graceful degradation), clock skew; assert invariants: ledger sums == balances, no duplicate documents, no gaps in gapless sequences, no lost outbox events.
- Invariant checker CLI (`erp verify`) runs after tests and on production schedule: balances vs ledger, sale totals vs lines vs payments, financial ledger balance (GL debit = credit when enabled), loyalty lots vs ledger, supplier/customer balances vs ledgers, orphan references, numbering gaps, audit hash chain. Output machine-readable report; failures create critical alerts.
- Test data: factories for realistic fashion retail data (Azerbaijani names/characters, sizes/colors, multi-branch); DEMO seed script refuses to run when ENV=production.

3) SECURITY HARDENING
- Threat model document (STRIDE per module, trust boundaries, abuse cases: discount abuse, fake returns, stock theft via adjustments, payroll manipulation, privilege escalation, data exfiltration via exports/report builder).
- Controls verification: OWASP ASVS L2 checklist mapped to evidence (tests/config); OWASP API Security Top 10 review (BOLA/IDOR on every object endpoint, mass assignment protection via explicit schemas, excessive data exposure, rate limits, unrestricted resource consumption, SSRF in webhook/integration URLs with allow-lists, security misconfiguration).
- Secrets: scan repo and history (gitleaks), enforce env-based config, rotation docs, separate DB roles (migration owner vs app role with least privilege; INSERT/SELECT-only on append-only tables verified by test), TLS/proxy requirements, security headers, CORS allow-list, cookie flags, CSRF for cookie endpoints, request size/time limits, file upload scanning hook (AV integration port, NOT_CONFIGURED by default) and content-type validation.
- Dependency and container security: pip-audit, SBOM generation (CycloneDX), pinned hashes, minimal non-root Docker image, read-only filesystem where possible, Trivy scan in CI, no dev tooling in production image.
- Data protection: encryption at rest verification (DB volume + app-level fields), PII/log redaction tests (including card-number and password patterns), backup encryption, data retention jobs verified, privacy docs aligned with CRM/HR modules. Personal-data legal requirements for Azerbaijan are an OPEN ITEM for legal review — list it, do not claim compliance.
- Penetration-test readiness pack: route inventory, auth matrix, test accounts per role (DEMO env only), known-limitations list.

4) PERFORMANCE & CAPACITY
- Load-test scenarios with documented targets: checkout (p95 < 150 ms @ 50 RPS across 10 branches), POS lookup (< 30 ms), stock posting (< 50 ms), dashboard (< 800 ms cached/< 2 s cold), standard reports (< 500 ms on summary tables), import jobs (100k rows without memory growth).
- Database tuning guide: indexes validated with EXPLAIN (ANALYZE, BUFFERS) saved in docs, connection pooling (pgbouncer transaction mode compatibility checks for advisory locks/prepared statements), autovacuum settings for hot tables, partition plans (ledger, audit, outbox, snapshots) with migration scripts ready but disabled until thresholds.
- Capacity model: expected volumes (transactions/day/branch, SKUs, ledger growth per year), storage projections, retention.
- Slow-query logging, N+1 detection in tests (assert query counts on key endpoints).

5) DEVOPS & OPERATIONS
- Environments: dev, staging, production with config parity; infrastructure as code or documented compose/k8s manifests; zero-downtime deployment strategy (expand/contract migrations, backwards-compatible API, rolling restart, readiness gates); migration safety checks in CI (no long locks: lock_timeout/statement_timeout, CREATE INDEX CONCURRENTLY rules, backfills in batches).
- CI/CD: lint, type check, architecture tests, unit/integration tests with Postgres+Redis services, schemathesis, migration up/down + drift check, OpenAPI export + breaking-change detection against the previous release + generated TypeScript client check for the frontend (fail if frontend types drift), security scans, Docker build/scan, SBOM, release tagging, changelog generation.
- Observability: structured logs → aggregator, metrics (Prometheus: request latency, error rate, DB pool, outbox lag, queue depth, checkout success/failure by reason, stock posting conflicts, payment UNKNOWN count, integration states), tracing (OpenTelemetry), dashboards and alert rules (SLO-based: availability, checkout latency, error budget), on-call runbook.
- BACKUP & RECOVERY: automated base backups + WAL archiving (PITR), encryption, offsite copy, retention schedule, backup status recorded in backup_status (feeds /health/details and notifications), documented RTO/RPO targets, and a scripted RESTORE TEST executed regularly in a scratch environment which then runs `erp verify`; evidence stored. Disaster-recovery runbook (DB loss, region loss, corrupted data, credential compromise, ransomware scenario), key-rotation procedure.
- Operational runbooks: deploy/rollback, migration failure, dead-letter handling, stuck payment UNKNOWN resolution, period close, stock reconciliation drift, user lockout, emergency access (break-glass account with strict audit and expiry).
- Data migration tooling for go-live: importers for opening balances (stock, supplier balances, customer balances, loyalty balances, employees), cut-over checklist, dry-run in staging with reconciliation reports, rollback plan, parallel-run guidance.

6) DOCUMENTATION & HANDOVER
- docs/: architecture overview with diagrams, module catalog (responsibilities, owned tables, events produced/consumed, permissions), data dictionary (generated from models), API guide + auth flows, event catalog, KPI definitions, finance definitions, security docs (threat model, controls), runbooks, ADRs (architecture decision records for key choices: modular monolith, ledger model, locking/isolation, costing method, outbox, GL feature flag), onboarding guide for developers, CONTRIBUTING and coding standards.
- KNOWN LIMITATIONS and OPEN QUESTIONS file, honest and specific: no offline POS, fiscal integration status, payment provider not selected, legacy store API not integrated, tax/payroll/leave legal rules not verified, personal-data compliance not reviewed by counsel, GL optional/not enabled, etc.

7) FINAL ACCEPTANCE REPORT (deliverable)
- Requirement-by-requirement checklist against the original specification (modules 1–20 and all cross-cutting rules): status DONE / PARTIAL / NOT DONE with evidence (test names, docs, endpoints).
- Test, coverage, mutation, load, security-scan results; invariant checker results; restore-test evidence.
- Risk register ranked by severity with recommended mitigations and owners.
- Go-live readiness checklist (technical, data, operational, legal) clearly marking items that require business or legal decisions.

DELIVERABLES: fixes in small logical commits, CI/CD config, test suites and reports, runbooks, docs, final acceptance report.