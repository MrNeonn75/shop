
GOAL: Build the HR module (src/features/hr). Personal and salary data are highly restricted: apply field-level permission gates and mask sensitive values by default (reveal on demand, logged to audit).

1) EMPLOYEES
- Directory: employee ID, name, photo, job title, department, branch, manager, status (Aktiv, Məzuniyyətdə, Müvəqqəti dayandırılıb, Ayrılıb), hire date. Filters, search, org chart view (by branch/department/manager).
- Employee profile tabs: Şəxsi məlumat (contact, address, emergency contact — minimal data only), İş məlumatları (title, department, branch assignment history, manager, employment type), Müqavilə (contract info, dates, probation), Sənədlər (upload with expiry tracking), Əməkhaqqı (salary configuration: fixed salary, hourly, commission/bonus rules — permission hr.salary.view/edit), Sistem hesabı (link to ERP user and role), Davamiyyət xülasəsi, Tarixçə (changes log).
- Create/edit with Zod validation; offboarding flow (last day, checklist, access revocation reminder, final payroll flag).

2) SCHEDULES & SHIFTS
- Shift templates (e.g. 10:00–19:00), weekly/monthly schedule planner per branch with drag-and-drop assignment, coverage indicators (minimum staff per hour), conflict detection (overlap, max hours), copy previous week, publish schedule, employee view of own schedule.

3) ATTENDANCE
- Records: check-in/out (manual entry with reason, import from device CSV; integration with devices only if configured, otherwise explicit "Konfiqurasiya olunmayıb"), computed late arrival, early departure, absence, overtime against schedule using configurable tolerance rules.
- Daily attendance board per branch, exception queue (missing punches) for manager correction with audit reason, monthly timesheet view and approval.

4) LEAVE
- Leave types and balances (configurable accrual rules), request form (dates, type, comment, attachment), approval workflow with manager and HR, calendar view showing team absences and conflicts with schedule, balance recalculation preview, holiday calendar (configurable, no hardcoded legal days).

5) PAYROLL
- Payroll periods; calculation runs by branch/all with configurable rules: fixed salary, hourly, overtime multipliers, approved bonuses, approved deductions, unpaid leave, advances. Do not assume one compensation model; each employee has a salary configuration profile.
- Run states: Draft → Calculated → Under review → Approved → Finalized (locked) → Paid. Explicit approval step required before finalization; show variance vs previous period and anomaly flags (large changes, missing attendance).
- Payslip view/PDF per employee (permission-gated, employee self-service view of own payslip only), payroll history, export (CSV/XLSX for bank), payroll cost allocation by branch (feeds Finance as expense via integration boundary — show posting preview, do not fake posting).
- Statutory deductions and taxes: configurable rule sets only; add notice that rates must be verified against applicable Azerbaijani requirements; never hardcode.
- Corrections after finalization via adjustment entries, never edits.

6) HR REPORTS (shortcuts; full in F12)
- Headcount by branch/department, attendance/absence/overtime summaries, payroll summary, staffing vs schedule.

7) PRIVACY
- Masked fields, access logging for sensitive views, export restrictions, retention-policy display, minimal data collection hints on forms.

DELIVERABLES: pages, schemas, mock repository (DEMO), unit tests (overtime calc, leave balance, payroll rule engine on varied compensation models, shift conflict detection), Playwright tests (schedule publish, leave approval, payroll run through approval to finalization, salary masking by role).