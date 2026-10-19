
GOAL: Build modules `company`, `branches`, `warehouses`, `settings`, `numbering`, plus cash registers master data.

1) COMPANY
- Single-company profile (name, legal name, tax ID, address, contacts, logo reference, default currency AZN, timezone Asia/Baku, default language az). Versioned changes with audit. Design tables with company_id from day one to keep multi-company possible later, but expose single-company behavior now.

2) BRANCHES
- Fields: unique code, name, address, phone/email, manager_user_id, operating hours per weekday + exceptions (holidays), status (active/inactive), branch-specific settings (jsonb validated by schema), timestamps, version.
- Rules: unique code (case-insensitive), cannot deactivate a branch that has open registers, in-transit transfers, or open documents (return a detailed BUSINESS_RULE_VIOLATION listing blockers), manager must be an active user with branch access.
- Endpoints: CRUD, activate/deactivate, list filtered by user's branch scope, GET /branches/{id}/summary (counts of warehouses, registers, employees via service interfaces — no cross-module model imports).

3) WAREHOUSES
- Types: central, branch, in_transit (system-managed, one per company or per route as chosen — document the decision), quarantine/damaged (optional). Linked to branch (nullable for central). Optional bin/zone table (zone code, name) for future use.
- Rules: unique code; exactly the required system locations exist (in-transit created by seed/migration, not user-deletable); deactivation blocked when stock balance ≠ 0 or open documents exist; a branch may have multiple warehouses, one marked default for sales.

4) CASH REGISTERS (master data only; shifts come in B7)
- Register: code, name, branch, default warehouse, status, device binding info (optional), receipt printer profile ref. Unique per branch.

5) SETTINGS FRAMEWORK
- Typed settings registry in code (key, type schema, default, scope: company/branch/role, sensitivity, description az, requires_reason flag). Table setting_values with effective_from, versioned history (never overwrite; new row), who/why. Resolution order: branch override → company value → default. `settings.get(key, branch_id=None, at=datetime)` with caching + invalidation via outbox event.
- Initial setting groups with sensible defaults (all values editable, none hardcoded as legal facts):
  currency/rounding rules; tax classes and rates (empty by default — admin must define; include an effective-date model and a clear note that rates must be verified against Azerbaijani requirements; NO legal rates pre-filled); payment methods (cash, card, configurable others, each with settlement account mapping later); discount limits by role; return rules (window days, approval limits, reason codes); inventory rules (negative stock policy default FORBIDDEN, COGS method choice: weighted average default, valuation display); loyalty defaults placeholder; security policy values (from B2); notification defaults; receipt template config (paper width 58/80mm, header/footer text, field toggles); business calendar and holidays (configurable, none hardcoded); retention policies for PII.
- Endpoints: list groups, get/update values with validation, reason required for sensitive settings, diff preview endpoint (POST /settings/preview), history, restore previous version (creates a new version). Every change audited and emitted as an outbox event.
- Reason codes registry (returns, adjustments, discounts, cash in/out, voids): CRUD with active flag and usage guard (cannot delete a used code, only deactivate).

6) DOCUMENT NUMBERING
- Numbering sequences: per document type (receipt, return, PO, goods receipt, transfer, adjustment, stock count, expense, payroll run, invoice, payment…), pattern tokens (prefix, {BRANCH}, {REGISTER}, {YYYY}, {YY}, {MM}, {SEQ:6}), reset rule (never/yearly/monthly/daily), scope (company/branch/register).
- Allocation must be GAPLESS-SAFE and CONCURRENCY-SAFE: allocate inside the caller's transaction using a locked counter row (SELECT … FOR UPDATE) or a dedicated sequence table; a rolled-back transaction must not leave a gap for legally sequential documents (document which types allow gaps, default: receipts must be gapless per register). Unique constraint on (document_type, number).
- Preview endpoint, pattern validation, change of pattern affects only future documents (versioned).
- Service interface: numbering.next(doc_type, branch_id, register_id=None) used by other modules.

7) INTEGRATION STATUS REGISTRY
- Table integrations (key, type, status: NOT_CONFIGURED / ACTIVE / ERROR, last_success_at, last_error, config_ref pointing to secret manager/env, masked display). Endpoints: list, test-connection (performs a real check when configured, otherwise returns NOT_CONFIGURED without side effects), call log (last N calls with redacted payloads). Keys reserved now: payment_provider, sms, email, whatsapp, printer_service, attendance_devices, accounting_gl, brendhouse_legacy_api. No integration is ever reported ACTIVE without a successful verification.
- Secrets are write-only through the API (never returned); stored via env/secret manager reference or encrypted at rest with a key from environment.

8) HEALTH/BACKUP STATUS ENDPOINTS for the frontend settings page (read-only; data from B1 tables).

TESTS: branch/warehouse rule violations, deactivation blockers, setting resolution order + effective dating, history/restore, sensitive setting requires reason, numbering concurrency (hammer 200 parallel allocations → no duplicates, no gaps for gapless types), rollback leaves no gap, integration registry never reports ACTIVE without verification, branch-scope isolation for branch-scoped settings, audit entries for each change.

DELIVERABLES: modules, migrations, seeds (system warehouses, reason code defaults, empty tax config), tests, docs/settings.md (registry list with keys/defaults), docs/numbering.md, updated OpenAPI. List assumptions/open questions (e.g. in-transit location model, gapless policy per document type).