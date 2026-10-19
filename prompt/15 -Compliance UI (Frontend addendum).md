CONTEXT: Backend now exposes the `compliance` module (B15). Extend existing screens; reuse the design system, permissions, i18n (az), adapters (mock + http). All legal values come from the API — the frontend NEVER hardcodes rates, windows, or limits. In mock mode label everything DEMO.

1) COMPLIANCE CENTER (new page under Sistem; permission compliance.rules.view)
- Status overview per domain (ƏDV, Fiskal çek, Əmək haqqı vergiləri, Sosial sığorta, İş vaxtı, Məzuniyyət, İstehlakçı hüquqları, Şəxsi məlumatlar, Saxlama): badges VERIFIED / UNVERIFIED / DISPUTED / MISSING with last-verified date and verifier.
- Rule register table with filters, detail drawer (parameters, effective dates, legal reference, source link, history, diff between versions), verification workflow UI (propose, attach evidence, verify, activate with effective date) with two-person rule messages.
- Persistent global banner in non-production for UNVERIFIED packs; in production a blocking panel for features gated by missing verification (explains which pack and who can verify).
- Obligations calendar (list + calendar view): owner, cadence, due date, status, completion with evidence upload; reminders surface in the notification center.
- Open legal questions checklist (read from docs endpoint) with assignee and resolution notes.

2) POS & RECEIPTS
- Fiscal status chip on the POS header (Aktiv / Əlçatmaz / Konfiqurasiya olunmayıb), shift fiscal state, blocking message in REQUIRED mode: "Fiskal çek alına bilmir, satış tamamlanmır". PENDING_FISCAL and FISCAL_UNKNOWN states shown clearly with a resolution screen (no blind retry button — only "Statusu yoxla" calling the reconciliation endpoint).
- Receipt preview/print uses fiscal data (QR, fiscal ID, device serial) from the API; a template editor validator lists missing mandatory elements from the active rule pack.
- VAT breakdown shown per receipt and in sale details (net, ƏDV rate and amount) from server values; tax class badges on products.
- Turnover monitor widget (Dashboard/Finance): indicative VAT-threshold progress with explanation tooltip and DRAFT label.

3) RETURNS
- Show legal eligibility: "14 gün (alış günü sayılmır) — qalan: N gün" computed from server data, legal exclusion badge for non-returnable categories, condition checklist (istifadə olunmayıb, etiket/qablaşdırma qorunub, çek var), defect flow (qüsurlu mal) with evidence photo upload, supplier-claim link. When no suitable exchange item exists, guide to refund. Refuse-denial requires choosing a documented legal exclusion reason.
- Policy settings screen validates that the configured window is not below the legal floor returned by the API.

4) HR & PAYROLL
- Schedule editor shows rule-based warnings (daily/weekly hours, six-day regime, night hours 22:00–06:00, pre-holiday shortening, overtime without consent) with warn/block severity from the API.
- Production calendar import UI (CSV/JSON preview, validation, source, verification).
- Payroll run: banner when any pack is UNVERIFIED/DISPUTED, finalize button disabled in production with explanation; payslip shows rule/version references; "DRAFT export for accountant" actions (declaration data file).
- Leave screens show statutory minimum vs granted entitlement with classification mapping and warnings.

5) PRIVACY
- Consent capture component (used in POS quick-create, CRM, HR): purposes separate, versioned az text displayed in full, capture method (checkbox + OTP when configured, e-signature pad, or scan upload), evidence stored; consent history timeline per customer/employee.
- Privacy center: data processing register, transfer register (cross-border), personal-data system registration status tracker, DSAR queue with SLA, breach/incident register, retention rules and legal holds, inspection pack generator.
- Integrations hub: activation of any provider outside Azerbaijan shows the transfer-register requirement and is blocked until VERIFIED in production.

6) UX/ACCESSIBILITY/TESTS
- All legal texts in az locale files; every compliance screen has explanatory tooltips linking to the rule register entry (not external legal advice). Disclaimers: "Bu sistem uyğunluğa dəstək verir, hüquqi məsləhət deyil; qaydalar mühasib/hüquqşünas tərəfindən təsdiqlənməlidir."
- Playwright tests: UNVERIFIED banner in non-prod and gate in prod mode, fiscal UNKNOWN resolution flow, return window boundary display, floor validation, consent capture with evidence, cross-border integration block, payroll finalize disabled with unverified pack.