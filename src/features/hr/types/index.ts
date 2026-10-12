import { Qapik } from '../../../shared/utils/money';

// ---------------------------------------------------------------------------
// 1. Employee Core & Profile Types
// ---------------------------------------------------------------------------

export type EmployeeStatus = 'active' | 'on_leave' | 'suspended' | 'terminated';

export type EmploymentType = 'full_time' | 'part_time' | 'shift' | 'contract';

export type ContractType = 'unlimited' | 'fixed_term' | 'probation';

export type CompensationModel = 'fixed_monthly' | 'hourly' | 'commission_based' | 'hybrid';

export interface EmployeeDocument {
  id: string;
  title: string;
  type: 'id_card' | 'contract' | 'medical_cert' | 'diploma' | 'nda' | 'other';
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
  expiryDate?: string; // YYYY-MM-DD
  isExpired?: boolean;
  daysUntilExpiry?: number;
}

export interface SalaryConfiguration {
  compensationModel: CompensationModel;
  baseSalaryQapik: Qapik; // Fixed monthly base or guarantee
  hourlyRateQapik: Qapik; // Hourly rate for shift/hourly workers
  commissionRatePercent?: number; // % from retail sales
  monthlyBonusTargetQapik?: Qapik; // Target KPI bonus
  performanceBonusQapik?: Qapik;
  overtimeAllowed: boolean;
  bankName: string;
  bankIban: string;
  taxReliefEligible?: boolean; // AR vergi güzəşti (məs: 200 AZN güzəşt)
}

export interface Employee {
  id: string;
  employeeCode: string; // e.g. "EMP-001"
  firstName: string;
  lastName: string;
  fullName: string;
  photoUrl?: string;
  jobTitle: string;
  department: string;
  branchId: string;
  branchName: string;
  managerId?: string;
  managerName?: string;
  status: EmployeeStatus;
  hireDate: string; // YYYY-MM-DD
  probationEndDate?: string;
  terminationDate?: string;
  terminationReason?: string;

  // Personal (Minimal Data Collection & Privacy Protected)
  finCode: string; // 7 chars, e.g. "5ABC123"
  idCardNumber: string; // e.g. "AZE12345678"
  birthDate: string;
  gender: 'male' | 'female';
  phone: string;
  email: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;

  // Employment & Contract Details
  employmentType: EmploymentType;
  contractType: ContractType;
  contractNumber: string;
  contractStartDate: string;
  contractEndDate?: string;
  workingHoursPerWeek: number; // typically 40

  // Salary Profile (Strict Permission hr.salary.view/edit)
  salaryConfig: SalaryConfiguration;

  // System Account Link
  systemUserId?: string;
  systemUserRole?: string;
  isSystemAccessActive?: boolean;

  // Documents & Offboarding
  documents: EmployeeDocument[];
  isOffboarded?: boolean;
  offboardingChecklist?: {
    assetsReturned: boolean;
    keysReturned: boolean;
    uniformReturned: boolean;
    accessRevoked: boolean;
    finalSettlementCalculated: boolean;
    notes?: string;
  };

  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 2. Schedules & Shifts Types
// ---------------------------------------------------------------------------

export interface ShiftTemplate {
  id: string;
  name: string; // e.g. "Səhər Növbəsi", "Axşam Növbəsi"
  startTime: string; // "09:00"
  endTime: string; // "18:00"
  durationHours: number; // 8 or 9
  breakDurationMinutes: number; // 60
  colorHex: string;
}

export interface ScheduledShift {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  templateId: string;
  templateName: string;
  startTime: string;
  endTime: string;
  hours: number;
}

export interface ShiftScheduleWeek {
  id: string;
  branchId: string;
  branchName: string;
  weekStartDate: string; // Monday, YYYY-MM-DD
  weekEndDate: string; // Sunday, YYYY-MM-DD
  isPublished: boolean;
  publishedAt?: string;
  publishedBy?: string;
  shifts: ScheduledShift[];
  requiredStaffPerHour?: Record<string, number>; // e.g. "10:00": 3, "14:00": 5
}

export interface ShiftConflict {
  type: 'overlap' | 'max_weekly_hours' | 'insufficient_rest' | 'understaffed';
  severity: 'error' | 'warning';
  employeeId?: string;
  employeeName?: string;
  date?: string;
  message: string;
}

// ---------------------------------------------------------------------------
// 3. Attendance & Timesheet Types
// ---------------------------------------------------------------------------

export type AttendancePunchSource = 'device' | 'manual';

export type AttendanceStatus =
  | 'on_time'
  | 'late'
  | 'early_leave'
  | 'absent'
  | 'overtime'
  | 'incomplete';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  date: string; // YYYY-MM-DD
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  checkInTime?: string; // "09:04"
  checkOutTime?: string; // "18:12"
  checkInSource: AttendancePunchSource;
  checkOutSource?: AttendancePunchSource;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  overtimeMinutes: number;
  workedMinutes: number;
  status: AttendanceStatus;
  isException: boolean; // true if missing punch or severe discrepancy
  exceptionReason?: string;
  correctionReason?: string;
  correctedBy?: string;
  correctedAt?: string;
}

export interface MonthlyTimesheetItem {
  employeeId: string;
  employeeName: string;
  branchName: string;
  jobTitle: string;
  totalScheduledHours: number;
  totalWorkedHours: number;
  totalLateMinutes: number;
  totalOvertimeHours: number;
  absenceDays: number;
  approvedLeaveDays: number;
  status: 'draft' | 'approved';
}

// ---------------------------------------------------------------------------
// 4. Leave Management Types
// ---------------------------------------------------------------------------

export type LeaveType = 'annual' | 'unpaid' | 'sick' | 'maternity' | 'study';

export type LeaveRequestStatus =
  | 'draft'
  | 'pending_manager'
  | 'pending_hr'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export interface LeaveBalance {
  employeeId: string;
  employeeName: string;
  annualEntitledDays: number;
  annualUsedDays: number;
  annualRemainingDays: number;
  unpaidUsedDays: number;
  sickDaysUsed: number;
  lastRecalculatedAt: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  branchId: string;
  branchName: string;
  leaveType: LeaveType;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalDays: number;
  reason: string;
  attachmentFileName?: string;
  attachmentUrl?: string;
  status: LeaveRequestStatus;

  managerApproverName?: string;
  managerDecisionDate?: string;
  managerDecisionNote?: string;

  hrApproverName?: string;
  hrDecisionDate?: string;
  hrDecisionNote?: string;

  createdAt: string;
  updatedAt: string;
}

export interface PublicHoliday {
  id: string;
  date: string; // YYYY-MM-DD
  nameAz: string;
  isWorkingDay: boolean;
}

// ---------------------------------------------------------------------------
// 5. Payroll Types
// ---------------------------------------------------------------------------

export type PayrollRunStatus =
  | 'draft'
  | 'calculated'
  | 'under_review'
  | 'approved'
  | 'finalized'
  | 'paid';

export interface PayrollAdjustment {
  id: string;
  payrollItemId: string;
  amountQapik: Qapik; // can be positive or negative
  reason: string;
  appliedBy: string;
  appliedAt: string;
}

export interface PayrollItem {
  id: string;
  payrollPeriodId: string;
  employeeId: string;
  employeeName: string;
  jobTitle: string;
  department: string;
  branchId: string;
  branchName: string;
  compensationModel: CompensationModel;

  // Base setup
  baseSalaryQapik: Qapik;
  hourlyRateQapik: Qapik;
  commissionRatePercent?: number;

  // Work telemetry
  normalScheduledHours: number;
  actualWorkedHours: number;
  overtimeHours: number;

  // Earnings
  earnedBaseSalaryQapik: Qapik;
  overtimePayQapik: Qapik; // 1.5x / 2.0x
  commissionBonusQapik: Qapik;
  kpiBonusQapik: Qapik;
  grossSalaryQapik: Qapik; // earnedBase + overtime + commission + kpi

  // Deductions
  unpaidLeaveDeductionQapik: Qapik;
  advanceDeductionQapik: Qapik;
  dsmfEmployeeQapik: Qapik; // Statutory Social Insurance
  itsEmployeeQapik: Qapik; // Mandatory Health Insurance (İTS)
  unemploymentEmployeeQapik: Qapik; // Unemployment Insurance
  incomeTaxQapik: Qapik; // Personal Income Tax
  otherDeductionsQapik: Qapik;
  totalDeductionsQapik: Qapik;

  // Net Pay
  netSalaryQapik: Qapik; // grossSalaryQapik - totalDeductionsQapik

  // Employer Costs
  dsmfEmployerQapik: Qapik;
  itsEmployerQapik: Qapik;
  unemploymentEmployerQapik: Qapik;
  totalEmployerCostQapik: Qapik; // gross + employer statutory

  // Anomaly & Variance Tracking
  isAnomalous: boolean;
  anomalyReason?: string;
  previousNetSalaryQapik?: Qapik;
  variancePercent?: number;

  // Bank transfer info
  bankName: string;
  bankIban: string;

  // Post-finalization adjustments
  adjustments: PayrollAdjustment[];
}

export interface BranchPayrollAllocation {
  branchId: string;
  branchName: string;
  employeeCount: number;
  grossSalaryQapik: Qapik;
  employerCostQapik: Qapik;
  totalExpenseQapik: Qapik; // Feeds Finance module OPEX allocation
}

export interface PayrollPeriod {
  id: string;
  code: string; // e.g. "2026-04"
  name: string; // e.g. "Aprel 2026"
  startDate: string;
  endDate: string;
  status: PayrollRunStatus;
  totalEmployees: number;
  totalGrossQapik: Qapik;
  totalDeductionsQapik: Qapik;
  totalNetQapik: Qapik;
  totalEmployerCostQapik: Qapik;
  branchAllocations: BranchPayrollAllocation[];
  anomaliesCount: number;

  calculatedAt?: string;
  calculatedBy?: string;
  approvedAt?: string;
  approvedBy?: string;
  finalizedAt?: string;
  finalizedBy?: string;
  paidAt?: string;
  paidBy?: string;

  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 6. Privacy & Audit Types
// ---------------------------------------------------------------------------

export type HrAuditAction =
  | 'reveal_salary'
  | 'reveal_personal'
  | 'export_payroll'
  | 'export_employees'
  | 'offboard_employee'
  | 'manual_attendance'
  | 'schedule_publish'
  | 'payroll_finalize';

export interface HrAuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: HrAuditAction;
  targetEmployeeId?: string;
  targetEmployeeName?: string;
  details: string;
}

