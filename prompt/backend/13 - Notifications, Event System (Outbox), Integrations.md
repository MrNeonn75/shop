
GOAL: Harden the event backbone and build modules `notifications` and `integrations`.

PRINCIPLES
- No integration is ever reported ACTIVE without a successful verification. If a provider is not configured, the system says NOT_CONFIGURED explicitly. Never simulate sending or syncing.
- Business transactions never wait on notifications or external calls. Everything external runs asynchronously from the outbox with retries.
- Secrets are write-only through the API and never logged.

1) EVENT BACKBONE (outbox hardening)
- outbox_events: id, type, version, aggregate_type/id, payload (jsonb, schema-validated per event type), occurred_at, correlation_id, causation_id, status (PENDING, PROCESSING, DONE, FAILED, DEAD), attempts, next_attempt_at, locked_by/locked_until.
- Dispatcher worker: claims batches with SELECT … FOR UPDATE SKIP LOCKED, per-consumer delivery tracking (event_deliveries: event_id × consumer, status, attempts, last_error), exponential backoff with jitter, max attempts → dead-letter with alert, ordered processing per aggregate where required (partition key), graceful shutdown, metrics (lag, throughput, failure rates).
- Consumers are idempotent (processed_events keyed by event_id + consumer). Event schema registry with versioning and compatibility tests (adding fields OK, removing/renaming breaks the build). Documented event catalog (docs/events.md) listing producers/consumers for all modules (sale.completed, return.completed, stock.changed/low/out, transfer.*, purchase.*, payroll.*, campaign.*, shift.closed, security.*, integration.status_changed, backup.*, etc.).
- Admin tooling: dead-letter inspection, replay single event/consumer, bulk replay by type and time window (permission + audit), retention/archival of processed events (partitioned by month).
- Real-time channel: SSE (and/or WebSocket) endpoint /notifications/stream authenticated per session, fan-out via Redis pub/sub when available (graceful fallback to polling endpoint), heartbeat, resume with Last-Event-ID, per-user branch scope filtering, connection limits, no duplicate delivery to the same session.

2) NOTIFICATIONS
- notifications: id, recipient user, category (STOCK, PAYMENT, ORDER, TRANSFER, REGISTER, APPROVAL, SECURITY, SYSTEM), severity (info/warning/critical), title/body (az, from templates with variables), deep link (route + params), source event id, dedupe key, group key, created_at, read_at, snoozed_until, archived_at, branch_id.
- Rule engine: alert_rules (type, parameters, recipients by role/branch/user, channels, escalation policy, active, schedule/quiet-hours override for critical) — rule types: low stock threshold, out of stock, overdue supplier payment, PO delayed, transfer in transit > N days, register cash variance > X, large refund/discount/void, failed integration, backup failure/stale backup, document expiry (supplier/employee), budget threshold exceeded, approval waiting > N hours, suspicious security events, payroll deadlines. Rules validated by schema; test-evaluate endpoint (dry-run showing who would be notified).
- Dedupe and grouping: repeated events collapse into a grouped notification with count; rate limits per rule/recipient to prevent storms; escalation after N minutes unacknowledged (to manager role) with audit.
- Recipient resolution at delivery time (current role holders, branch managers, delegates when absent), always filtered by the recipient's CURRENT permissions and branch scope (never leak data a user can no longer see).
- Approvals inbox aggregation endpoint: counts and items waiting per approval type for the caller (feeds sidebar badges).
- User preferences: per category channel toggles (in-app always on for critical), quiet hours, digest option (daily summary job), language. Admin defaults in settings.
- Endpoints: list/filter/paginate, unread counts, mark read/unread/all, snooze, archive, preferences CRUD, admin rule CRUD, delivery log (per notification per channel with status).

3) CHANNELS
- Channel adapters behind a common interface: IN_APP (always available), EMAIL, SMS, WHATSAPP/MESSENGER, PUSH. External ones are NOT_CONFIGURED until the integration is verified ACTIVE; send attempts when not configured are recorded as SKIPPED_NOT_CONFIGURED (not failed, not faked). Templates per channel/language with variable validation and safe rendering (no template injection, HTML escaping). Delivery status webhooks where providers support them (signature verification mandatory). Bounce/complaint handling feeds consent/opt-out (B11).
- Throttling and provider rate-limit handling; retry policy per channel; PII minimization in external messages (no sensitive financial/HR data in SMS/email bodies; use links).

4) INTEGRATIONS FRAMEWORK
- Extends the B3 integration registry: integration definitions in code (key, type, required config fields, verification procedure, capabilities), instances with status (NOT_CONFIGURED, CONFIGURING, ACTIVE, DEGRADED, ERROR), last_verified_at, last_success_at, last_error (redacted), call log (redacted payloads, durations, outcomes, correlation ids), circuit breaker state, rate-limit config.
- Secret handling: credentials stored encrypted (envelope encryption with key from env/secret manager, rotation support) or referenced from an external secret manager; write-only API; masked previews; rotation endpoint; access to secrets only inside the integration runtime. Test-connection performs a REAL call or returns NOT_CONFIGURED without side effects.
- Resilience: timeouts, retries with backoff for idempotent calls, circuit breaker, bulkhead (separate worker pool per integration), webhook receiver with signature verification, replay protection (timestamp + nonce), idempotent handlers, and raw payload retention (redacted) for debugging.
- Reserved integrations with provider-agnostic ports (implementations only when a provider is chosen and credentials exist):
  • payment_provider: create intent, authorize/capture/void/refund, webhook, reconciliation fetch (ties to B7 payment_attempts state machine and UNKNOWN resolution job)
  • fiscal/e-receipt: FiscalService port (NOT_CONFIGURED; compliance requirements are an OPEN QUESTION — do not claim compliance)
  • sms, email, whatsapp: notification channels above
  • printer_service: receipt/label print jobs (ESC/POS payloads) with device registry and status
  • attendance_devices: punch ingestion (pull/push) into B10
  • accounting_gl: external accounting export/sync (ties to B9 AccountingPort)
  • brendhouse_legacy_api: existing store website/app API for product, price, stock, and order synchronization — SCAFFOLD ONLY: define the port (`LegacyStorePort`: list_products, upsert_product, push_stock, push_price, pull_orders) with a clearly marked unimplemented adapter. Do NOT invent endpoints or authentication. Implementation starts only after the real API documentation and credentials are supplied; conflict-resolution rules (which system owns price/stock/catalog) must be agreed first and recorded in docs/legacy-integration.md as an open decision.
- Sync engine skeleton for the legacy integration (used later): external_refs mapping (B4), sync_runs, sync_items with per-item status, retry, conflict records requiring manual resolution, dry-run mode, rate limiting, idempotent upserts, full audit. No background syncing starts while status ≠ ACTIVE.

5) HEALTH & OPERATIONS ENDPOINTS
- /health/details additions: outbox lag, dead-letter count, notification queue depth, integration states, last successful dispatcher heartbeat, SSE connection counts. Alert rules for these feed back into notifications (system category).

6) PERMISSIONS: notifications.view_own, notifications.rules.manage, notifications.templates.manage, notifications.channels.manage, integrations.view, integrations.configure, integrations.test, integrations.logs.view, events.deadletter.manage, events.replay.

TESTS (mandatory):
- Outbox: crash between business commit and dispatch never loses events; duplicate delivery tolerated (idempotent consumers); SKIP LOCKED multi-worker claim without double processing (parallel workers test); backoff/dead-letter behavior; ordered processing per aggregate; replay tooling.
- Schema compatibility: removing a required event field fails the compatibility test.
- Notifications: dedupe/grouping, rate limiting, escalation timing (fake clock), recipient resolution with delegation/absence, permission re-check (revoked user doesn't receive), quiet hours (critical bypass), SSE resume with Last-Event-ID and no duplicates, polling fallback.
- Channels: NOT_CONFIGURED → SKIPPED_NOT_CONFIGURED (never "sent"), template injection attempts, webhook signature verification and replay protection.
- Integrations: never ACTIVE without verified test-connection; secrets never appear in API responses, logs, or error messages (automated scan); circuit breaker opens/closes; legacy adapter raises NOT_IMPLEMENTED/NOT_CONFIGURED and starts nothing in background.
- Branch-scope isolation for notifications and logs; audit entries for rule/integration/secret changes.

DELIVERABLES: modules, migrations, workers, docs/events.md (catalog), docs/notifications.md, docs/integrations.md, docs/legacy-integration.md (open decisions: data ownership, conflict rules, auth, rate limits), updated OpenAPI. List assumptions/open questions (provider selection for payment/SMS/email, real-time transport choice, fiscal requirements).