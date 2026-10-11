CONTEXT: Continue the BRAND HOUSE ERP frontend. F1 (foundation and design system) is complete. Reuse its components, tokens, adapters, i18n. Do not duplicate them.

GOAL: Build the application shell, authentication UI, role/permission system, and the Administration module.

1) AUTH
- Login page (email/username + password), Azerbaijani texts, show/hide password, rate-limit and lockout messages from API errors, "forgot password" and reset flows (request → token page → new password with strength rules).
- Session handling: access token in memory, refresh via httpOnly cookie when HttpAdapter is used; auto-logout on inactivity (configurable), session-expired modal that preserves unsaved form state where possible.
- Active sessions page: list devices/sessions, revoke session.
- Mock adapter supports 6 demo users: Sistem admini, Baş menecer, Filial meneceri, Kassir, Anbardar, Mühasib.

2) APP SHELL
- Collapsible sidebar with the 20 modules grouped: Əməliyyatlar (POS, Satış və qaytarılma, Transfer), Məhsul və anbar (Kataloq, Anbar, Satınalma, Təchizatçılar), Maliyyə (Maliyyə, Hesabatlar, BI), İnsan və müştəri (HR, CRM, Marketinq), Sistem (Admin, İstifadəçi və icazələr, Audit, Bildirişlər, Parametrlər). Items the user cannot access are hidden.
- Top bar: global search (Ctrl+K command palette: products by name/SKU/barcode, receipts, customers), BRANCH SWITCHER (affects all data filters; "Bütün filiallar" only for authorized roles), notifications bell, theme toggle, language selector (az active; en/ru disabled "tezliklə"), user menu.
- Breadcrumbs, page header pattern, responsive drawer on tablet.
- Route guards by permission; 403 page; deep links preserved after login.

3) PERMISSION MODEL (frontend)
- Permission format "module.resource.action" (e.g. inventory.stock.adjust, pos.sale.cancel, hr.salary.view, finance.expense.approve).
- usePermission(), <PermissionGate>, route meta. Branch scoping: user has allowed branch IDs; all queries receive branch context.
- Sensitive fields (salary, cost price, supplier prices) masked unless permission granted. Remember: this is UX only; the server is authoritative.

4) ADMIN MODULE PAGES
- Company profile and settings (name, tax ID field, logo upload, currency AZN, timezone Asia/Baku, default language).
- Branches: list, create/edit (unique code, name, address, contacts, manager, working hours per weekday, warehouses, cash registers, active status).
- Warehouses: list, create/edit, type (central / branch / in-transit), linked branch.
- Users: list with filters, create/edit, assign roles and branches, activate/suspend, force password reset, last login.
- Roles and permissions: role list, permission matrix editor (modules × actions, grouped, searchable), clone role, warning when editing a role that has active users, show diff before saving.
- Document numbering settings (prefix, branch code, year, sequence preview for receipt, PO, transfer, etc.).
- Tax settings (configurable rates and classes; DO NOT hardcode legal rates; show note that values must be verified against Azerbaijani requirements).
- Notification configuration, integration settings (each integration has status: "Konfiqurasiya olunmayıb / Aktiv / Xəta"; never fake a working integration), backup status and system health panel (read-only, from health-check endpoint).
- Audit log viewer (filters: user, module, action, branch, date range; detail drawer with before/after JSON diff; export).

5) UX RULES
- Every destructive or sensitive action uses ConfirmDialog (with mandatory reason when relevant).
- Forms: Zod schemas, inline errors, dirty-state leave warning, optimistic UI only where safe.
- Tables: server-side pagination, filters synced to URL query params.

DELIVERABLES: pages, routes, mock data, unit tests for permission logic, Playwright tests for login, route guard, branch switch, role matrix editing. Update README with the permission list and extension guide.