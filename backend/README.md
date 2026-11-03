# Brand House ERP — Backend Foundation

Multi-branch retail ERP (clothing, shoes, accessories) backend built with **Python 3.12**, **FastAPI**, **SQLAlchemy 2.0 (async)**, and **PostgreSQL 16**.

This repository contains the production-grade foundation architecture for Brand House ERP. The React/TypeScript frontend (F1–F14) communicates with this backend via REST API (`HttpAdapter`).

---

## 🏗️ Architecture: Modular Monolith

- **Pattern**: Modular Monolith. Zero microservices complexity.
- **Directory Structure**:
  - `app/modules/<module>`: Business modules (`models.py`, `schemas.py`, `repository.py`, `service.py`, `router.py`, `policies.py`, `events.py`).
  - `app/core`: Shared architectural foundation (config, database, errors, ids, clock, money, pagination, concurrency, idempotency, security, middleware, logging, telemetry).
  - `app/shared`: Common cross-cutting models and services (`events.py`, `outbox.py`, `audit.py`, `backup_model.py`, `integrations.py`).
  - `migrations/`: Alembic database schema migrations.
  - `docs/`: Comprehensive technical documentation (`stack.md`, `architecture.md`, `conventions.md`, `runbook.md`).
- **Boundary Enforcement**:
  - `routers -> services -> repositories -> models`.
  - Modules talk to each other **only** via service interfaces or domain events — never by importing another module's models/repositories directly.
  - Enforced by `import-linter` contracts (`.importlinter`).

---

## 🚀 Key Architectural Capabilities

1. **RFC 9562 UUIDv7 Primary Keys**: Time-ordered UUIDs providing chronological indexing without sequential ID security vulnerabilities.
2. **Fixed-Point Money Math**: `Decimal` only with `ROUND_HALF_UP`, currency mismatch protection, and Largest Remainder allocation (Hamilton-Hare method) ensuring **zero penny loss**.
3. **Transactional Outbox Pattern**: Resilient domain events committed in the same database transaction as business entities and dispatched by the background worker.
4. **Idempotency Protection**: `Idempotency-Key` header with request body SHA-256 validation, cached replays, and `IDEMPOTENCY_IN_FLIGHT` 409 conflict handling.
5. **Optimistic Concurrency**: `version` column tracking on all mutable entities, raising 409 `CONCURRENCY_CONFLICT` on stale writes. Row locking with deterministic ID ordering (`sort_keys_for_locking`).
6. **Timezone Discipline**: UTC storage in database; presentation and business day boundaries anchored in `Asia/Baku` (UTC+4).
7. **Transparent Integrations**: Unconfigured external integrations (payment gateway, SMS, fiscal printers, email) report explicit `"NOT CONFIGURED"` status objects via `/api/v1/integrations/status` — never fake working status.
8. **Structured JSON Logging**: `structlog` with automated credit card and secret token redaction (`[REDACTED]`).

---

## 🛠️ Quick Start

### 1. Requirements
- Python 3.12+
- `uv` (recommended) or `pip`
- Docker & Docker Compose (optional, for local Postgres/Redis)

### 2. Environment Setup
```bash
cp .env.example .env
uv sync
```

### 3. Database Migrations
```bash
uv run alembic upgrade head
```

### 4. Running the Development Server
```bash
uv run uvicorn app.main:app --reload --port 8000
```
Interactive API documentation: `http://localhost:8000/docs`

### 5. Running the Background Worker
```bash
# ARQ worker (with Redis)
uv run arq app.worker.WorkerSettings

# Standalone loop (without Redis)
uv run python -m app.worker loop
```

### 6. Seeding Data
```bash
# Reference data (Currencies, system baseline) - safe in all environments
uv run python scripts/seed.py reference

# Demo data (POS terminals, test branches) - strictly forbidden in production
uv run python scripts/seed.py demo
```

### 7. Backup and Restore
```bash
# Create full backup with SHA-256 verification
uv run python scripts/backup.py create

# Restore backup with integrity check
uv run python scripts/restore.py run backups/brendhouse_backup_YYYYMMDD_HHMMSS.dump --checksum <SHA256>
```

---

## 🧪 Testing

```bash
# Run full test suite with coverage
uv run pytest

# Run linting and formatting checks
uv run ruff check .
uv run ruff format --check .

# Run strict type checking
uv run mypy app

# Verify architectural layer boundaries
uv run lint-imports
```

---

## 📖 Documentation
- [docs/stack.md](docs/stack.md): Technology stack rationale and pinned dependencies.
- [docs/architecture.md](docs/architecture.md): Modular monolith blueprint, domain events, and UoW pattern.
- [docs/conventions.md](docs/conventions.md): Error envelopes, naming conventions, pagination, and money math rules.
- [docs/runbook.md](docs/runbook.md): Deployment, Docker compose, backup/restore, and incident management.

