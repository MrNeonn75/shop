
GOAL: Build modules `auth`, `users`, `rbac`, `sessions`, `audit` (core).

1) USERS
- Table users: id, employee_ref (nullable, links to HR later via service interface), username, email, full_name, password_hash (Argon2id with tuned params), status (active, suspended, pending, locked), must_change_password, last_login_at, failed_login_count, locked_until, manager_pin_hash (nullable, for POS approvals), preferred_language (default 'az'), version.
- CRUD with permission checks; activate/suspend; force password reset; assign roles and allowed branches. Suspending a user revokes all their sessions immediately.
- Never return hashes; never allow users to escalate their own permissions.

2) AUTHENTICATION
- POST /auth/login (username/email + password): constant-time checks, generic error messages, progressive lockout + rate limit per IP and per account, audit every attempt (success/failure with reason code, IP, user agent).
- Access token: short-lived JWT (e.g. 10–15 min; claims: sub, session_id, roles hash, branch scope version, iat/exp, jti) signed with a rotating key set (kid), keys from env/secret manager. Refresh token: opaque random value, stored hashed, rotating on every use with REUSE DETECTION (reuse of an old token revokes the whole token family and logs a security event), delivered as httpOnly + Secure + SameSite cookie; CSRF protection for cookie-based refresh endpoint.
- POST /auth/refresh, POST /auth/logout, POST /auth/logout-all.
- Password flows: forgot password (always returns the same response; one-time token hashed, expiry, single use; email sending only if a provider is configured, otherwise the endpoint returns a configuration-state error to admins and logs it), reset password, change password (policy: min length, complexity, history of last N, optional expiry), policy values come from security settings.
- TOTP 2FA (enroll with secret + recovery codes, verify, disable with re-auth; enforce per role by policy). If disabled in settings, endpoints respond with a clear "not enabled" state.
- POS quick login: PIN+register binding option; PIN stored hashed, lockout after N failures, only valid from registered devices/branches when configured. Manager-approval endpoint: POST /auth/approve (manager PIN or credentials + action_code + reason) returns a short-lived single-use approval token bound to {action, resource_id, branch, requester}, audited.
- Sessions: table sessions (device, IP, user agent, created, last_seen, revoked_at, family_id); GET /me/sessions, DELETE /me/sessions/{id}; admin can revoke any user's sessions; idle and absolute timeouts from settings.

3) RBAC
- Permission catalog table seeded from code: key format "module.resource.action" (e.g. inventory.stock.adjust, pos.sale.cancel, hr.salary.view, finance.expense.approve), description (az), risk_level (normal / sensitive / critical), module. A decorator/dependency `require_permission("pos.sale.cancel")` and a policy layer for object-level rules (ownership, branch scope, amount limits, status rules).
- Roles: system roles (Sistem admini, Baş menecer, Filial meneceri, Kassir, Anbardar, Mühasib, İR meneceri, Marketinq meneceri) as editable-but-protected seeds, custom roles, clone role. Role–permission matrix with change history (before/after stored in audit); editing a role with active users returns an impact summary; last-admin protection (cannot remove the final system admin).
- User overrides and TEMPORARY GRANTS: permission/role grant with scope, expiry, reason, approver; expired grants automatically ineffective (enforced at query time, cleaned by job).
- Branch scope: user_branch_access (allowed branches, "all branches" flag only via explicit permission). A central `BranchScope` dependency injects allowed branch IDs into every query; repositories MUST filter by it. Add a test suite that attempts cross-branch access on every endpoint added later (provide a reusable test helper/fixture).
- Effective-permissions endpoint GET /me/permissions (role union + overrides + active grants + branch scope) used by the frontend; permission-set version included so the frontend can refresh when it changes.
- Segregation-of-duties checks: configurable conflicting permission pairs; role editor endpoint returns warnings (not silent blocking unless configured as hard rule); service-level enforcement for the "same person cannot create and approve" rule on documents (helper used by later modules).
- Sensitive field masking: response serializers accept a `can_view` context and mask salary/cost/PII fields; reveals of masked values go through an explicit endpoint that writes an audit event.

4) AUDIT CORE (append-only)
- Table audit_events: id, occurred_at, actor_user_id, actor_session_id, branch_id, module, entity_type, entity_id, action, before (jsonb), after (jsonb), diff summary, reason, ip, user_agent, correlation_id, severity, hash chain fields (prev_hash, hash) for tamper evidence.
- DB-level protection: trigger or revoked privileges so UPDATE/DELETE on audit_events fail; app DB role has INSERT/SELECT only.
- A reusable `audit.record(...)` service plus SQLAlchemy event integration so every create/update/delete on audited models is recorded with before/after in the SAME transaction as the change (if the audit insert fails, the change fails). Redact sensitive fields (password hashes, PIN hashes, tokens, salary unless permitted, PII per policy).
- Security events view (failed logins, lockouts, role changes, grants, session revocations, sensitive reveals, exports) via severity filter; GET /audit/events with filters (user, module, entity, action, branch, date range, correlation_id, severity), cursor pagination, export (logged itself); GET /audit/entities/{type}/{id}/timeline.
- Integrity verification command + endpoint (verify hash chain for a date range).

5) SECURITY SETTINGS (stored in settings module later; here define interface + defaults): password policy, lockout thresholds, session timeouts, 2FA requirement by role, IP allow-list option.

6) SEED DATA: permission catalog, system roles with sensible default permission sets, one bootstrap admin created via CLI command with a one-time password (printed once, must change on first login). DEMO users for the 6 frontend demo roles only through the DEMO seed command.

TESTS (mandatory):
- Auth: login success/failure paths, lockout, refresh rotation + reuse detection, logout-all, password reset token single use, 2FA flow, PIN lockout, approval token single use and binding.
- RBAC: every permission decorator has a test; branch-scope isolation; temporary grant expiry; last-admin protection; SoD helper; masking.
- Audit: same-transaction guarantee (force failure → no change and no event), immutability (UPDATE/DELETE blocked), hash chain verification detects tampering.
- Security: timing-safe comparison used, no user enumeration, rate limit behavior, cookie flags.
- OpenAPI snapshot test to catch contract drift with the frontend.

DELIVERABLES: modules, migrations, seeds, CLI commands, tests, docs/auth.md (token model, flows, threat notes), docs/permissions.md (generated catalog), updated OpenAPI. List assumptions/open questions.