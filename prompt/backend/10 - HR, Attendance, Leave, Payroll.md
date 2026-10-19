
GOAL: Build modules `hr` (employees, schedules, attendance, leave) and `payroll`.

1) EMPLOYEES
- employees: id, employee_no (numbering), full_name, contact details, address, emergency contact (optional, minimal), status (ACTIVE, ON_LEAVE, SUSPENDED, TERMINATED), job_title, department, branch (with assignment history table employee_assignments: branch, title, department, manager, valid_from/valid_to), manager_id, hire_date, termination_date + reason, employment type, linked user_id (optional via users service interface), photo reference, version.
- Sensitive data separated into dedicated tables with column-level encryption at rest (app-level encryption with a key from env/secret manager, key rotation support): national ID/passport-like identifiers, bank account for salary, date of birth, home address if desired. API returns masked values by default (e.g. last 3 characters); reveal via an explicit endpoint requiring hr.pii.view, writing an audit event (who, when, why); exports exclude sensitive columns unless explicitly permitted.
- employment_contracts (type, start/end, probation end, terms reference, documents), employee_documents (type, expiry, upload; expiry events 30/14/7 days), salary_profiles (see payroll), history log of changes (audit-backed timeline).
- Offboarding flow: last working day, checklist (equipment, access revocation task that emits an event for B2 to suspend the linked user at the right time, final payroll flag, leave balance payout calculation), status transitions with rules (cannot terminate with an open payroll run unless included).
- Org structure: departments (tree), positions, org chart query; branch staffing views.
- Data minimization: only fields required for HR/payroll operations; retention policy settings for terminated employees (archival/anonymization job after configured period, with legal-hold flag).

2) SCHEDULES & SHIFTS
- shift_templates (name, start, end, breaks, crosses-midnight flag), schedule_periods per branch (week/month) with states DRAFT → PUBLISHED → LOCKED, schedule_assignments (employee, date, shift template or custom times, branch).
- Validation engine: overlap detection, max daily/weekly hours, minimum rest between shifts, leave conflicts, minimum staffing coverage per hour per branch (rule settings), employee availability; returns violations as warnings or hard errors depending on settings.
- Copy previous week/month, bulk assignment, publish (emits notification events), employee self-view endpoint (own schedule only), swap requests with approval.

3) ATTENDANCE
- attendance_records: raw punches (source: manual, device_import, API; device integrations show NOT_CONFIGURED until configured), computed daily attendance (planned vs actual, late minutes, early departure minutes, overtime minutes, absence flag) using configurable rules (grace periods, rounding, overtime thresholds, break handling) — calculations are deterministic, versioned, and reproducible (store the rule version used).
- Exceptions queue (missing punch-out, duplicate punches, impossible durations): manager correction with reason; corrections are new records linked to originals (never destructive), audited.
- Monthly timesheet per employee with approval states (DRAFT → SUBMITTED → APPROVED → LOCKED); locked timesheets feed payroll; changes after lock require privileged reopen with reason.
- Device CSV import (staged with dry-run and error report).

4) LEAVE
- leave_types (paid/unpaid, accrual rule, max carry-over, requires attachment, min notice), leave_balances derived from an append-only leave ledger (ACCRUAL, USAGE, ADJUSTMENT, CARRYOVER, EXPIRY, PAYOUT, REVERSAL), accrual job (configurable rules; NO hardcoded statutory entitlements — values are settings and the docs flag them for legal verification), holiday calendar from settings.
- leave_requests: dates (half-day support), type, comment, attachment, status DRAFT → SUBMITTED → APPROVED/REJECTED/CANCELLED; approval chain (manager → HR) via the shared approvals engine; conflict detection (team coverage minimums, overlapping schedule), balance preview endpoint, cancellation of approved leave with rules; approved leave creates schedule/attendance markers.
- Team leave calendar endpoint (scoped by branch and permission).

5) PAYROLL
- salary_profiles (effective-dated, versioned): compensation model per employee — FIXED monthly, HOURLY, MIXED, COMMISSION/BONUS-BASED, with components (base, allowances, recurring deductions, overtime multipliers, commission rules referencing sales attribution if enabled). Do NOT assume one model for all employees. Salary fields are sensitive and masked without hr.salary.view.
- payroll_rule_sets (effective-dated): calculation rules for overtime, unpaid leave, lateness deductions (optional), statutory deductions/contributions and taxes as CONFIGURABLE RULE DEFINITIONS (type, base, rate/bracket tables, caps, effective dates). NO legal rates or brackets are hardcoded or pre-filled; docs state they must be defined and verified against current Azerbaijani requirements by a qualified professional.
- Adjustments: bonuses, deductions, advances, loans/repayment schedules — each requires approval, reason, and period assignment; recurring ones generate period entries.
- payroll_runs: period, scope (company/branch/employee subset), status DRAFT → CALCULATED → UNDER_REVIEW → APPROVED → FINALIZED (LOCKED) → PAID (+ CANCELLED before finalization). Calculation endpoint is deterministic and reproducible (stores inputs snapshot: salary profile versions, rule set version, timesheet versions, adjustments). Re-calculation allowed until APPROVED.
- Explicit approval step before finalization with SoD (preparer ≠ approver); approval screen data: totals, variance vs previous period per employee, anomaly flags (large changes, missing timesheets, new hires/terminations mid-period, negative net pay), unresolved exceptions blocking finalization.
- payslips: per employee line items (earnings, deductions, employer costs, net), immutable after finalization; PDF generation; employee self-service endpoint returns ONLY own payslips; distribution status.
- Corrections after finalization are ADJUSTMENT entries in a later run (never edits); reversal of a finalized run requires a privileged flow with reason and creates compensating entries.
- Payment export: bank file export (CSV/XLSX; format templates configurable; no bank API integration claimed), payment confirmation recording (mark PAID with reference).
- Payroll cost allocation by branch (by assignment days/hours); on finalization emits `payroll.finalized` with allocation breakdown; Finance (B9) posts via the accounting boundary (accrual of payroll expense and later cash payment). Include a preview of postings; no fake posting.
- Payroll history, comparison between periods, headcount/cost per branch.

6) PERMISSIONS: hr.employee.view/manage, hr.pii.view, hr.salary.view/manage, hr.schedule.manage/publish, hr.attendance.view/correct/approve, hr.leave.request/approve, hr.leave.policy.manage, payroll.run.create/calculate/review/approve/finalize/pay/reverse, payroll.payslip.view_own/view_all, payroll.rules.manage, hr.export. Employee self-service endpoints (own schedule, attendance, leave, payslips) require only authentication plus ownership checks.

7) PRIVACY & SECURITY
- Access logging for every sensitive read/reveal; export audit; masking by default in logs and error reports; field-level encryption tests; retention/anonymization job tests; branch-scope: branch managers see only their branch employees (salary only with explicit permission).

TESTS (mandatory):
- Payroll engine: parametrized cases for each compensation model; overtime; unpaid leave; mid-period hire/termination proration; rounding with exact totals; determinism (same inputs → identical output hash); rule set effective dating; negative-net protection.
- Approval workflow: SoD enforcement; cannot finalize with blocking anomalies; locked run immutability; adjustments in later run; reversal flow.
- Attendance: grace/rounding rules, midnight-crossing shifts, correction audit trail, timesheet lock.
- Leave: ledger-derived balances under random sequences (property-based); conflict detection; cancellation reversing ledger; accrual job idempotency.
- Schedule validation: overlap/rest/coverage rules.
- Privacy: masked responses, reveal audit, own-payslip-only access, encryption at rest verified at DB level, export exclusions, branch-scope isolation.
- Concurrency: two approvers on the same run, parallel leave approvals against the same balance.

DELIVERABLES: modules, migrations, jobs (accrual, expiry alerts, anonymization), tests, docs/hr-payroll.md (compensation models, rule-set examples with FAKE demo numbers clearly marked as non-legal), docs/privacy-hr.md, updated OpenAPI. List assumptions/open questions (statutory contributions/taxes, leave entitlements, overtime legal rules, bank file formats).