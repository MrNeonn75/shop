
GOAL: Complete modules 17–20: Users & Permissions (advanced), Audit & Security, Notifications, System Parameters.

1) USERS & PERMISSIONS (advanced)
- Permission catalog browser (module → resource → action) with descriptions in Azerbaijani, which roles hold each permission, and risk level tags (sensitive: salary, cost, price override, stock adjust, refund, void, payroll finalize, role edit).
- User access review page: per user effective permissions (union of roles + overrides), branch scope, last login, inactive users flag, export for periodic access review.
- Temporary access grants (permission/role, scope, expiry, reason, approver) and delegation (approver substitute during leave).
- Segregation-of-duties warnings in the role editor (e.g. same role creates and approves payments, adjusts stock and approves counts) shown as warnings with explanation.
- Manager-PIN management for POS approvals (set/reset, lockout state; PIN never displayed).

2) AUDIT & SECURITY
- Audit log (extend F2): global search, saved views, entity timeline (open any product/sale/user and see its full history), before/after diff with field-level highlighting, correlation ID linking related events (e.g. one sale → stock, cash, loyalty events), export with access logged. Immutable display: no edit/delete actions anywhere.
- Security events: failed logins, lockouts, password resets, role changes, permission overrides, session revocations, sensitive-data reveals (salary, PII), exports, reprints, voids, large refunds, manual stock adjustments, price overrides, after-hours activity. Severity levels, filters, assignment/acknowledge with notes.
- Security settings page: password policy (length, complexity, expiry, history), 2FA policy (required roles; UI for TOTP enrollment with QR and recovery codes when backend supports; otherwise explicit "Dəstəklənmir" state), session timeout, concurrent session limits, IP allow-list (optional), login attempt limits.
- Suspicious-activity dashboard: cashiers with high void/discount/return ratios, cash variance trends, repeated manual adjustments; show criteria and thresholds, link to evidence.
- Data protection tools: retention policy settings, PII access report, data export/anonymization request queue (links with CRM F11).

3) NOTIFICATIONS
- Notification center (bell dropdown + full page): categories (Stok, Ödəniş, Sifariş, Transfer, Kassa, Təsdiq, Təhlükəsizlik, Sistem), severity, read/unread, mark all, filters, deep links to the relevant document, snooze, grouping of repeated events.
- Real-time delivery through WebSocket/SSE with graceful fallback to polling; reconnect handling; no duplicate toasts.
- Preference center per user: which categories, channels (in-app always; email/SMS/push show "Konfiqurasiya olunmayıb" unless provider configured), quiet hours, digest option.
- Admin rules: alert rule builder (low stock threshold, overdue supplier payment, PO delay, transfer in transit > N days, register variance > X, large refund, failed integration, backup failure, document expiry), recipients by role/branch, escalation after N minutes, test-send only when a channel is configured.
- Approvals inbox integration (expenses, POs, transfers, payroll, campaigns) showing counts in the sidebar.

4) SYSTEM PARAMETERS
- Sections: Ümumi, Valyuta və yuvarlaqlaşdırma (AZN default, rounding rule, decimal places), Vergi (configurable classes/rates with effective dates and history; note about verifying against Azerbaijani regulations; no hardcoded rates), Sənəd nömrələmə (extend F2 with reset rules and preview), Çek və çap (receipt template editor: header, logo, footer text, paper width 58/80mm, fields toggle, live preview), Ödəniş üsulları (configurable tender types and rules), Endirim limitləri (per role), Qaytarma qaydaları (return window days, approval limits, reason codes), Anbar qaydaları (negative stock policy, COGS method, costing display), Loyallıq defoltları, İş saatları və bayram təqvimi, Dil və lokalizasiya (az active; en/ru visible as "tezliklə" with a translation-completeness view), Brend (logo, color tokens preview).
- Integrations hub: cards for payment provider, SMS/email/WhatsApp provider, barcode/receipt printer service, attendance devices, accounting/GL, and the existing brendhouse.az store API (BrendHouseLegacyAdapter). Each card shows status (Konfiqurasiya olunmayıb / Aktiv / Xəta), last successful sync, test-connection button that performs a real check or is disabled when not configured, masked credential fields (write-only), and a log of recent calls. NEVER show a fake "connected" state.
- Settings changes: versioned with effective dates where relevant, diff before save, reason required for sensitive settings, audit event on every change, "restore previous version".
- System health and backup: health checks (API, DB, queue, storage, integrations), last backup time/size/status, restore-test status, recent errors summary; read-only displays from health endpoints.

5) CROSS-CUTTING
- All sensitive actions show ConfirmDialog with reason. All settings pages use dirty-state warnings and Zod validation. Strings in az locale files.

DELIVERABLES: pages, schemas, mock repository (DEMO), unit tests (effective-permission computation, SoD rule detection, alert rule validation, settings diff), Playwright tests (role change appears in audit with diff, alert rule fires notification in mock, integration card shows "not configured" state, receipt template preview).