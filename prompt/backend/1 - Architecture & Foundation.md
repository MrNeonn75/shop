ROLE: Act as a senior backend architect, database architect, and DevOps engineer.

PROJECT: BRAND HOUSE ERP — production-oriented multi-branch retail ERP (clothing, shoes, accessories). The React/TypeScript frontend already exists (F1–F14) and talks to this backend through a REST API using the HttpAdapter. This prompt builds ONLY the backend foundation. No business modules yet.

TECH STACK (pin stable, mutually compatible versions; document in docs/stack.md with rationale):
- Python 3.12, FastAPI, Uvicorn (dev) / Gunicorn+Uvicorn workers (prod)
- Pydantic v2 + pydantic-settings
- SQLAlchemy 2.0 (async, typed ORM) + asyncpg, Alembic migrations
- PostgreSQL 16 as the primary database
- Redis (rate limiting, short-lived cache, locks, job broker) — optional in dev, explicit config state if missing
- Background jobs: ARQ or Celery (choose one, justify), scheduler for periodic jobs
- structlog (JSON logs), OpenTelemetry-ready hooks, Sentry-compatible error reporting hook (no PII)
- pytest, pytest-asyncio, httpx, testcontainers-postgres, factory-boy/polyfactory, hypothesis for money/ledger properties
- ruff (lint+format), mypy --strict, pre-commit, uv or poetry for dependency locking
- Docker + docker-compose (api, worker, postgres, redis), Makefile

ARCHITECTURE: MODULAR MONOLITH. No microservices.
- Layout: app/modules/<module>/{router.py, schemas.py, models.py, service.py, repository.py, policies.py, events.py, tests/}; app/core (config, db, security, logging, errors, pagination, idempotency, clock, money, ids); app/shared; migrations/; docs/.
- Dependency rule: routers → services → repositories → models. Modules talk to each other only via service interfaces or domain events — never by importing another module's models/repositories directly. Enforce with import-linter contracts in CI.
- Domain events (in-process) + TRANSACTIONAL OUTBOX table for anything that must survive failures (notifications, integrations, report refresh). Handlers idempotent.

CORE CONVENTIONS (implement now, used by all later modules):
1) Config: all settings via environment variables validated at startup (pydantic-settings); .env.example; no secrets in code; explicit "NOT CONFIGURED" state objects for optional integrations (payment provider, SMS/email, printers, legacy brendhouse.az API) exposed via an /integrations/status endpoint — never pretend an integration works.
2) Database: UUIDv7 (or ULID) primary keys; created_at/updated_at (timestamptz, stored UTC; business timezone Asia/Baku applied only in presentation/reporting boundaries); created_by/updated_by; optimistic concurrency via integer `version` column returning 409 on mismatch; soft-delete only for master data (never for finalized transactions); naming convention for constraints/indexes; every migration reversible where possible, reviewed, and tested up/down in CI.
3) MONEY & QUANTITIES: money as NUMERIC(14,2) with Python Decimal and a Money value type (currency AZN default, multi-currency-ready); NEVER float. Defined rounding rules (ROUND_HALF_UP) centralized in app/core/money.py with property-based tests. Quantities are integers for retail items (configurable unit precision for future).
4) API: versioned prefix /api/v1; OpenAPI/Swagger at /docs and /openapi.json with tags per module, examples, error schemas; consistent error envelope {code, message (az), details[], correlation_id}; error codes catalog (VALIDATION_ERROR, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, CONFLICT, IDEMPOTENCY_REPLAY, RATE_LIMITED, BUSINESS_RULE_VIOLATION...); HTTP 409 for version/state conflicts, 422 for validation, 403 for permission/branch scope.
5) Pagination/filter/sort: cursor or page-based standard with total count option, whitelist-based sort/filter fields (no raw column injection), consistent query parameter names matching the frontend FilterBar (branch_id, date_from, date_to, q, status, page, page_size, sort).
6) IDEMPOTENCY: reusable dependency for POST endpoints requiring `Idempotency-Key`: stores (key, user, method, path, request hash, response, status) with TTL; same key + same payload → replay the stored response; same key + different payload → 422/409 error; in-flight duplicate → 409 with retry hint; unique constraint at DB level. Used later by sales, payments, receipts, transfers, payroll.
7) CONCURRENCY: helpers for row-level locking (SELECT … FOR UPDATE / SKIP LOCKED), advisory locks, deterministic lock ordering to avoid deadlocks, retry-on-serialization-failure wrapper; explicit transaction boundaries per use case (unit-of-work pattern). One service call = one transaction.
8) Correlation: middleware generating/propagating X-Correlation-ID, attached to logs, audit events, outbox events, and error responses.
9) Logging & errors: structured JSON logs, request/response timing, redaction of secrets/PII/card-like numbers/passwords; central exception handlers; never leak stack traces to clients.
10) Health & ops: /health/live, /health/ready (DB, Redis, migrations at head, worker heartbeat), /health/details (permission-gated: queue depth, last backup status, integration states); graceful shutdown; request size limits; CORS allow-list from config; security headers; rate limiting middleware (per IP and per user, stricter on auth endpoints).
11) Time: injectable Clock for testability; business timezone setting Asia/Baku; helpers for business-day boundaries (used by daily reports/register shifts).
12) Localization: error and validation messages via message catalog with az as default (en/ru ready); do not hardcode user-facing strings in services.
13) Seeding: idempotent seed commands (CLI via typer): reference data (units, tax classes placeholder, reason codes, default roles/permissions placeholders) and a separate DEMO seed command clearly labeled DEMO that is refused in production env.
14) Backups: scripts/docs for pg_dump/pg_basebackup + WAL archiving options, restore procedure, restore test script, backup status table updated by a scheduled job and exposed in health details.

SECURITY BASELINE: parameterized queries only (ORM/Core), input validation at schema level, output schemas never expose internal fields (password hashes, internal notes), dependency scanning (pip-audit), secrets only from env/secret manager, least-privilege DB role for the app (separate migration role), TLS expected at proxy (documented), password hashing Argon2id (used in B2).

CI (GitHub Actions or equivalent): ruff, mypy strict, import-linter, pytest with Postgres service, migration up/down check, schema drift check (alembic autogenerate must produce no diff), OpenAPI export artifact + diff vs previous (flag breaking changes), pip-audit, Docker build.

DELIVERABLES:
1) Running project: `make dev` starts api+worker+postgres+redis; /docs works; first migration creates only core tables (idempotency_keys, outbox_events, audit_events skeleton, backup_status, schema metadata).
2) Reusable core library (money, idempotency, pagination, errors, locking, clock) with unit + property-based tests.
3) docs/: architecture.md (modules, dependency rules, event/outbox design), conventions.md (naming, errors, pagination, idempotency usage), stack.md (versions + reasons), runbook.md.
4) A sample "ping" module demonstrating the module template end to end (router → service → repository → test), to be deleted or kept as template.
5) List of assumptions and open questions.