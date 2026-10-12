import { describe, it, expect, beforeEach } from 'vitest';
import { toQapik } from '../src/shared/utils/money';
import {
  calculateAttendance,
  formatMinutesToHoursAndMinutes,
} from '../src/features/hr/utils/attendanceCalculator';
import {
  detectScheduleConflicts,
  checkHourlyStaffCoverage,
} from '../src/features/hr/utils/shiftConflictDetector';
import {
  calculateWorkingDaysInInterval,
  recalculateLeaveBalance,
  validateLeaveRequestOverlap,
} from '../src/features/hr/utils/leaveEngine';
import {
  calculateEmployeePayrollItem,
  calculateBranchPayrollAllocations,
  calculateStatutoryDeductions,
} from '../src/features/hr/utils/payrollEngine';
import {
  maskSalary,
  maskFinCode,
  maskPhone,
  maskIban,
  maskIdCardNumber,
  maskEmail,
} from '../src/features/hr/utils/masking';
import { MockHrAdapter } from '../src/shared/adapters/mock/mockHrAdapter';
import {
  ScheduledShift,
  PublicHoliday,
  LeaveBalance,
  LeaveRequest,
  Employee,
  PayrollItem,
} from '../src/features/hr/types';

describe('HR & Human Resources Module (Milestone F11)', () => {
  // -------------------------------------------------------------------------
  // 1. Data Masking & Privacy Tests
  // -------------------------------------------------------------------------
  describe('1. Data Masking & Privacy Controls', () => {
    it('masks sensitive salary values unless explicitly unmasked', () => {
      expect(maskSalary('1,500.00 ₼')).toBe('•••••• ₼');
      expect(maskSalary('4,500.00 ₼', true)).toBe('4,500.00 ₼');
    });

    it('masks FIN code while preserving boundary hints', () => {
      expect(maskFinCode('5ABC123')).toBe('5•••••3');
      expect(maskFinCode('5ABC123', true)).toBe('5ABC123');
    });

    it('masks phone numbers preserving country code and last digits', () => {
      expect(maskPhone('+994 50 211 44 88')).toBe('+994 50 ••• •• 88');
      expect(maskPhone('+994 50 211 44 88', true)).toBe('+994 50 211 44 88');
    });

    it('masks bank IBAN preserving bank prefix and last 4 digits', () => {
      expect(maskIban('AZ21PASHA00012938475600129991')).toBe('AZ21 •••• •••• •••• 9991');
      expect(maskIban('AZ21PASHA00012938475600129991', true)).toBe('AZ21PASHA00012938475600129991');
    });

    it('masks ID card and email addresses properly', () => {
      expect(maskIdCardNumber('AZE14253678')).toBe('AZE••••••78');
      expect(maskEmail('leyla.m@brandhouse.az')).toBe('l•••••m@brandhouse.az');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Attendance & Punch Calculations
  // -------------------------------------------------------------------------
  describe('2. Attendance Engine & Punch Calculations', () => {
    it('marks attendance on_time if punch is within grace tolerance (15 mins)', () => {
      const result = calculateAttendance('09:00', '18:00', '09:12', '18:05', 15);
      expect(result.status).toBe('on_time');
      expect(result.lateMinutes).toBe(0);
      expect(result.workedMinutes).toBe(533);
      expect(result.isException).toBe(false);
    });

    it('flags late arrival when check-in exceeds grace tolerance', () => {
      const result = calculateAttendance('09:00', '18:00', '09:25', '18:00', 15);
      expect(result.status).toBe('late');
      expect(result.lateMinutes).toBe(25);
      expect(result.isException).toBe(false);
    });

    it('flags early departure when leaving before scheduled end time', () => {
      const result = calculateAttendance('09:00', '18:00', '08:58', '17:30', 15);
      expect(result.status).toBe('early_leave');
      expect(result.earlyDepartureMinutes).toBe(30);
    });

    it('accurately computes overtime minutes beyond scheduled end time', () => {
      const result = calculateAttendance('09:00', '18:00', '09:00', '19:45', 15);
      expect(result.status).toBe('overtime');
      expect(result.overtimeMinutes).toBe(105); // 1h 45m
      expect(formatMinutesToHoursAndMinutes(result.overtimeMinutes)).toBe('1s 45d');
    });

    it('identifies missing punches as severe exceptions', () => {
      const missingCheckOut = calculateAttendance('09:00', '18:00', '09:00', undefined);
      expect(missingCheckOut.status).toBe('incomplete');
      expect(missingCheckOut.isException).toBe(true);
      expect(missingCheckOut.exceptionReason).toContain('Çıxış qeydi çatışmır');

      const missingCheckIn = calculateAttendance('09:00', '18:00', undefined, '18:00');
      expect(missingCheckIn.status).toBe('incomplete');
      expect(missingCheckIn.isException).toBe(true);
      expect(missingCheckIn.exceptionReason).toContain('Giriş qeydi çatışmır');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Shift Conflict & Coverage Detection
  // -------------------------------------------------------------------------
  describe('3. Shift Conflict Detection', () => {
    it('detects overlapping shifts assigned to the same employee on the same date', () => {
      const shifts: ScheduledShift[] = [
        {
          id: 's1',
          employeeId: 'emp-1',
          employeeName: 'Leyla',
          date: '2026-04-13',
          templateId: 'tmpl-1',
          templateName: 'Səhər',
          startTime: '09:00',
          endTime: '15:00',
          hours: 6,
        },
        {
          id: 's2',
          employeeId: 'emp-1',
          employeeName: 'Leyla',
          date: '2026-04-13',
          templateId: 'tmpl-2',
          templateName: 'Günorta',
          startTime: '14:00',
          endTime: '20:00',
          hours: 6,
        },
      ];

      const conflicts = detectScheduleConflicts(shifts);
      const overlap = conflicts.find((c) => c.type === 'overlap');
      expect(overlap).toBeDefined();
      expect(overlap?.severity).toBe('error');
      expect(overlap?.message).toContain('eyni gündə üst-üstə düşən');
    });

    it('detects weekly maximum 40 hours violation', () => {
      const shifts: ScheduledShift[] = [
        { id: 's1', employeeId: 'emp-1', employeeName: 'Leyla', date: '2026-04-13', templateId: 't1', templateName: 'T', startTime: '09:00', endTime: '19:00', hours: 10 },
        { id: 's2', employeeId: 'emp-1', employeeName: 'Leyla', date: '2026-04-14', templateId: 't1', templateName: 'T', startTime: '09:00', endTime: '19:00', hours: 10 },
        { id: 's3', employeeId: 'emp-1', employeeName: 'Leyla', date: '2026-04-15', templateId: 't1', templateName: 'T', startTime: '09:00', endTime: '19:00', hours: 10 },
        { id: 's4', employeeId: 'emp-1', employeeName: 'Leyla', date: '2026-04-16', templateId: 't1', templateName: 'T', startTime: '09:00', endTime: '19:00', hours: 10 },
        { id: 's5', employeeId: 'emp-1', employeeName: 'Leyla', date: '2026-04-17', templateId: 't1', templateName: 'T', startTime: '09:00', endTime: '19:00', hours: 10 },
      ]; // Total 50h > 40h

      const conflicts = detectScheduleConflicts(shifts);
      const maxHours = conflicts.find((c) => c.type === 'max_weekly_hours');
      expect(maxHours).toBeDefined();
      expect(maxHours?.message).toContain('50 saat');
    });

    it('detects insufficient rest interval between consecutive shifts (< 11 hours)', () => {
      const shifts: ScheduledShift[] = [
        {
          id: 's1',
          employeeId: 'emp-1',
          employeeName: 'Leyla',
          date: '2026-04-13',
          templateId: 't1',
          templateName: 'Gecə',
          startTime: '14:00',
          endTime: '23:00', // Ends at 23:00
          hours: 9,
        },
        {
          id: 's2',
          employeeId: 'emp-1',
          employeeName: 'Leyla',
          date: '2026-04-14',
          templateId: 't2',
          templateName: 'Səhər',
          startTime: '08:00', // Starts at 08:00 -> Rest is 9 hours < 11h
          endTime: '17:00',
          hours: 9,
        },
      ];

      const conflicts = detectScheduleConflicts(shifts);
      const restConflict = conflicts.find((c) => c.type === 'insufficient_rest');
      expect(restConflict).toBeDefined();
      expect(restConflict?.message).toContain('istirahət intervalı (9 saat)');
    });

    it('alerts on understaffed hourly coverage', () => {
      const shifts: ScheduledShift[] = [
        { id: 's1', employeeId: 'e1', employeeName: 'A', date: '2026-04-13', templateId: 't', templateName: 'T', startTime: '10:00', endTime: '18:00', hours: 8 },
      ];
      const required = { '12:00': 3 }; // Needs 3, but only 1 present

      const warnings = checkHourlyStaffCoverage(shifts, required, '2026-04-13');
      expect(warnings.length).toBe(1);
      expect(warnings[0].type).toBe('understaffed');
      expect(warnings[0].message).toContain('Çatışmazlıq: 2 nəfər');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Leave Engine & Working Days
  // -------------------------------------------------------------------------
  describe('4. Leave Engine & Balance Accrual', () => {
    const holidays: PublicHoliday[] = [
      { id: 'h1', date: '2026-05-09', nameAz: 'Qələbə Günü', isWorkingDay: false },
      { id: 'h2', date: '2026-05-28', nameAz: 'Müstəqillik Günü', isWorkingDay: false },
    ];

    it('calculates working days in interval excluding weekends and public holidays', () => {
      // 2026-05-04 (Mon) to 2026-05-15 (Fri): 10 weekdays total
      // May 9 is Saturday (weekend), so working days = 10
      const days = calculateWorkingDaysInInterval('2026-05-04', '2026-05-15', holidays);
      expect(days).toBe(10);
    });

    it('correctly recalculates leave balance upon approval of requests', () => {
      const currentBalance: LeaveBalance = {
        employeeId: 'emp-1',
        employeeName: 'Leyla',
        annualEntitledDays: 30,
        annualUsedDays: 6,
        annualRemainingDays: 24,
        unpaidUsedDays: 0,
        sickDaysUsed: 0,
        lastRecalculatedAt: '2026-01-01',
      };

      const requests: LeaveRequest[] = [
        {
          id: 'r1',
          employeeId: 'emp-1',
          employeeName: 'Leyla',
          department: 'Rəhbərlik',
          branchId: 'b1',
          branchName: '28 May',
          leaveType: 'annual',
          startDate: '2026-05-04',
          endDate: '2026-05-08',
          totalDays: 5,
          reason: 'İstirahət',
          status: 'approved',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'r2',
          employeeId: 'emp-1',
          employeeName: 'Leyla',
          department: 'Rəhbərlik',
          branchId: 'b1',
          branchName: '28 May',
          leaveType: 'sick',
          startDate: '2026-06-01',
          endDate: '2026-06-03',
          totalDays: 3,
          reason: 'Xəstəlik',
          status: 'approved',
          createdAt: '',
          updatedAt: '',
        },
      ];

      const recalculated = recalculateLeaveBalance(currentBalance, requests);
      expect(recalculated.annualUsedDays).toBe(5);
      expect(recalculated.annualRemainingDays).toBe(25);
      expect(recalculated.sickDaysUsed).toBe(3);
    });

    it('validates and rejects overlapping leave requests for the same employee', () => {
      const existing: LeaveRequest[] = [
        {
          id: 'r1',
          employeeId: 'emp-1',
          employeeName: 'Leyla',
          department: 'Rəhbərlik',
          branchId: 'b1',
          branchName: '28 May',
          leaveType: 'annual',
          startDate: '2026-05-10',
          endDate: '2026-05-20',
          totalDays: 8,
          reason: 'Test',
          status: 'approved',
          createdAt: '',
          updatedAt: '',
        },
      ];

      const checkOverlap = validateLeaveRequestOverlap('emp-1', '2026-05-15', '2026-05-25', existing);
      expect(checkOverlap.hasOverlap).toBe(true);
      expect(checkOverlap.conflictingRequest?.id).toBe('r1');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Payroll Engine & Statutory Rules
  // -------------------------------------------------------------------------
  describe('5. Multi-Model Payroll & Statutory Deductions', () => {
    it('computes statutory employee and employer deductions according to Azerbaijani rules', () => {
      // For 1,000.00 AZN Gross Salary:
      // DSMF Employee: 200 * 3% (6 AZN) + 800 * 10% (80 AZN) = 86 AZN (8,600 Qəpik)
      // İTS Employee: 1000 * 2% = 20 AZN (2,000 Qəpik)
      // Unemployment Employee: 1000 * 0.5% = 5 AZN (500 Qəpik)
      // Total Employee Deductions = 111 AZN (11,100 Qəpik)
      const gross = toQapik(100000); // 1,000.00 AZN
      const deductions = calculateStatutoryDeductions(gross);

      expect(deductions.dsmfEmployeeQapik).toBe(toQapik(8600));
      expect(deductions.itsEmployeeQapik).toBe(toQapik(2000));
      expect(deductions.unemploymentEmployeeQapik).toBe(toQapik(500));
      expect(deductions.incomeTaxQapik).toBe(toQapik(0)); // Exempt under 8,000 AZN tier
      expect(deductions.totalEmployeeDeductionsQapik).toBe(toQapik(11100));

      // Employer Costs:
      // DSMF Employer: 200 * 22% (44 AZN) + 800 * 15% (120 AZN) = 164 AZN (16,400 Qəpik)
      // İTS Employer: 1000 * 2% = 20 AZN (2,000 Qəpik)
      // Unemployment Employer: 1000 * 0.5% = 5 AZN (500 Qəpik)
      // Total Employer Cost = 164 + 20 + 5 = 189 AZN (18,900 Qəpik)
      expect(deductions.dsmfEmployerQapik).toBe(toQapik(16400));
      expect(deductions.itsEmployerQapik).toBe(toQapik(2000));
      expect(deductions.unemploymentEmployerQapik).toBe(toQapik(500));
      expect(deductions.totalEmployerAddonQapik).toBe(toQapik(18900));
    });

    it('calculates fixed monthly compensation model with overtime', () => {
      const emp: Employee = {
        id: 'emp-cashier',
        employeeCode: 'EMP-003',
        firstName: 'Nərgiz',
        lastName: 'Əliyeva',
        fullName: 'Nərgiz Əliyeva',
        jobTitle: 'Baş Xəzinədar',
        department: 'Satış',
        branchId: 'b1',
        branchName: '28 May',
        status: 'active',
        hireDate: '2023-05-15',
        finCode: '6DEF456',
        idCardNumber: 'AZE23456789',
        birthDate: '1995-08-20',
        gender: 'female',
        phone: '+994 50 444 33 22',
        email: 'nargiz@brandhouse.az',
        address: 'Bakı',
        emergencyContactName: 'Ana',
        emergencyContactPhone: '+994 50 111 22 33',
        employmentType: 'full_time',
        contractType: 'unlimited',
        contractNumber: 'M-1',
        contractStartDate: '2023-05-15',
        workingHoursPerWeek: 40,
        salaryConfig: {
          compensationModel: 'fixed_monthly',
          baseSalaryQapik: toQapik(95000), // 950.00 ₼
          hourlyRateQapik: toQapik(0),
          overtimeAllowed: true,
          bankName: 'Kapital Bank',
          bankIban: 'AZ1234',
        },
        documents: [],
        createdAt: '',
        updatedAt: '',
      };

      const item = calculateEmployeePayrollItem(
        emp,
        'period-2026-04',
        168, // scheduled
        168, // actual
        6,   // overtime
        0,   // sales volume
        toQapik(85000) // previous net
      );

      expect(item.earnedBaseSalaryQapik).toBe(toQapik(95000));
      expect(Number(item.overtimePayQapik)).toBeGreaterThan(0);
      expect(Number(item.netSalaryQapik)).toBeGreaterThan(0);
      expect(item.isAnomalous).toBe(false);
    });

    it('calculates hourly compensation model correctly', () => {
      const emp: Employee = {
        id: 'emp-hourly',
        employeeCode: 'EMP-007',
        firstName: 'Orxan',
        lastName: 'Məlikov',
        fullName: 'Orxan Məlikov',
        jobTitle: 'Köməkçi Quraşdırıcı',
        department: 'Logistika',
        branchId: 'b1',
        branchName: '28 May',
        status: 'active',
        hireDate: '2024-02-01',
        finCode: '8GHI789',
        idCardNumber: 'AZE99887766',
        birthDate: '1999-01-10',
        gender: 'male',
        phone: '+994 55 555 55 55',
        email: 'orxan@brandhouse.az',
        address: 'Bakı',
        emergencyContactName: 'Ata',
        emergencyContactPhone: '+994 50 222 33 44',
        employmentType: 'shift',
        contractType: 'unlimited',
        contractNumber: 'M-2',
        contractStartDate: '2024-02-01',
        workingHoursPerWeek: 40,
        salaryConfig: {
          compensationModel: 'hourly',
          baseSalaryQapik: toQapik(0),
          hourlyRateQapik: toQapik(600), // 6.00 AZN / hour
          overtimeAllowed: true,
          bankName: 'PAŞA Bank',
          bankIban: 'AZ5678',
        },
        documents: [],
        createdAt: '',
        updatedAt: '',
      };

      // 100 hours worked at 6.00 AZN = 600.00 AZN base
      const item = calculateEmployeePayrollItem(emp, 'period-2026-04', 160, 100, 0, 0);
      expect(item.earnedBaseSalaryQapik).toBe(toQapik(60000));
      expect(item.grossSalaryQapik).toBe(toQapik(60000));
    });

    it('calculates hybrid model (base + commission + KPI)', () => {
      const emp: Employee = {
        id: 'emp-hybrid',
        employeeCode: 'EMP-004',
        firstName: 'Kamran',
        lastName: 'Həsənov',
        fullName: 'Kamran Həsənov',
        jobTitle: 'Baş Satış Məsləhətçisi',
        department: 'Satış',
        branchId: 'b1',
        branchName: '28 May',
        status: 'active',
        hireDate: '2023-08-01',
        finCode: '7JKL012',
        idCardNumber: 'AZE33445566',
        birthDate: '1997-03-12',
        gender: 'male',
        phone: '+994 51 123 45 67',
        email: 'kamran@brandhouse.az',
        address: 'Bakı',
        emergencyContactName: 'Qardaş',
        emergencyContactPhone: '+994 50 999 88 77',
        employmentType: 'full_time',
        contractType: 'unlimited',
        contractNumber: 'M-3',
        contractStartDate: '2023-08-01',
        workingHoursPerWeek: 40,
        salaryConfig: {
          compensationModel: 'hybrid',
          baseSalaryQapik: toQapik(65000), // 650.00 ₼
          hourlyRateQapik: toQapik(0),
          commissionRatePercent: 1.5,      // 1.5%
          monthlyBonusTargetQapik: toQapik(15000), // 150.00 ₼
          overtimeAllowed: false,
          bankName: 'Kapital Bank',
          bankIban: 'AZ9999',
        },
        documents: [],
        createdAt: '',
        updatedAt: '',
      };

      // 20,000 AZN sales * 1.5% = 300 AZN commission
      // Gross = 650 + 300 + 150 = 1,100 AZN (110,000 Qəpik)
      const item = calculateEmployeePayrollItem(
        emp,
        'period-2026-04',
        168,
        168,
        0,
        toQapik(2000000)
      );

      expect(item.earnedBaseSalaryQapik).toBe(toQapik(65000));
      expect(item.commissionBonusQapik).toBe(toQapik(30000));
      expect(item.kpiBonusQapik).toBe(toQapik(15000));
      expect(item.grossSalaryQapik).toBe(toQapik(110000));
    });

    it('flags variance anomalies when net salary jumps >= 30%', () => {
      const emp: Employee = {
        id: 'emp-anomaly',
        employeeCode: 'EMP-005',
        firstName: 'Test',
        lastName: 'İşçi',
        fullName: 'Test İşçi',
        jobTitle: 'Mütəxəssis',
        department: 'Satış',
        branchId: 'b1',
        branchName: '28 May',
        status: 'active',
        hireDate: '2023-01-01',
        finCode: '1AAA111',
        idCardNumber: 'AZE11111111',
        birthDate: '1990-01-01',
        gender: 'male',
        phone: '+994 50 111 11 11',
        email: 'test@brandhouse.az',
        address: 'Bakı',
        emergencyContactName: 'Ata',
        emergencyContactPhone: '+994 50 222 22 22',
        employmentType: 'full_time',
        contractType: 'unlimited',
        contractNumber: 'M-4',
        contractStartDate: '2023-01-01',
        workingHoursPerWeek: 40,
        salaryConfig: {
          compensationModel: 'fixed_monthly',
          baseSalaryQapik: toQapik(200000), // 2,000 AZN
          hourlyRateQapik: toQapik(0),
          overtimeAllowed: false,
          bankName: 'PAŞA Bank',
          bankIban: 'AZ1111',
        },
        documents: [],
        createdAt: '',
        updatedAt: '',
      };

      // Previous net: 1,000 AZN -> Now net will be ~1,700 AZN (+70% jump!)
      const item = calculateEmployeePayrollItem(
        emp,
        'period-2026-04',
        168,
        168,
        0,
        0,
        toQapik(100000)
      );

      expect(item.isAnomalous).toBe(true);
      expect(item.anomalyReason).toContain('kəskin fərqlənir');
    });

    it('correctly calculates branch OPEX payroll allocations', () => {
      const items = [
        {
          id: 'p1',
          branchId: 'b1',
          branchName: '28 May',
          grossSalaryQapik: toQapik(100000),
          totalEmployerCostQapik: toQapik(118900),
        },
        {
          id: 'p2',
          branchId: 'b1',
          branchName: '28 May',
          grossSalaryQapik: toQapik(150000),
          totalEmployerCostQapik: toQapik(178350),
        },
        {
          id: 'p3',
          branchId: 'b2',
          branchName: 'Gənclik Mall',
          grossSalaryQapik: toQapik(120000),
          totalEmployerCostQapik: toQapik(142680),
        },
      ] as unknown as PayrollItem[];

      const allocs = calculateBranchPayrollAllocations(items);
      expect(allocs.length).toBe(2);

      const b1 = allocs.find((a) => a.branchId === 'b1');
      expect(b1?.employeeCount).toBe(2);
      expect(b1?.grossSalaryQapik).toBe(toQapik(250000));
      expect(b1?.totalExpenseQapik).toBe(toQapik(297250));
    });
  });

  // -------------------------------------------------------------------------
  // 6. Mock Adapter Integration Tests
  // -------------------------------------------------------------------------
  describe('6. Mock Adapter Integration & Audit Logging', () => {
    let adapter: MockHrAdapter;

    beforeEach(() => {
      adapter = new MockHrAdapter();
    });

    it('loads seeded employees and filters by branch and status', async () => {
      const all = await adapter.getEmployees();
      expect(all.length).toBeGreaterThanOrEqual(8);

      const branchEmployees = await adapter.getEmployees({ branchId: 'branch-1' });
      expect(branchEmployees.every((e) => e.branchId === 'branch-1')).toBe(true);

      const activeEmployees = await adapter.getEmployees({ status: 'active' });
      expect(activeEmployees.every((e) => e.status === 'active')).toBe(true);
    });

    it('offboards employee: sets terminated status, revokes access, and logs audit', async () => {
      const offboarded = await adapter.offboardEmployee(
        'emp-4',
        '2026-04-30',
        'Öz arzusu ilə işdən ayrılma',
        {
          assetsReturned: true,
          keysReturned: true,
          uniformReturned: true,
          accessRevoked: true,
          finalSettlementCalculated: true,
          notes: 'Bütün təhvil-təslim tamamlanıb',
        }
      );

      expect(offboarded.status).toBe('terminated');
      expect(offboarded.isSystemAccessActive).toBe(false);
      expect(offboarded.isOffboarded).toBe(true);

      const logs = await adapter.getAuditLogs();
      const offboardLog = logs.find((l) => l.action === 'offboard_employee');
      expect(offboardLog).toBeDefined();
      expect(offboardLog?.targetEmployeeName).toBe(offboarded.fullName);
    });

    it('approves monthly timesheets', async () => {
      await adapter.approveMonthlyTimesheet('2026-04', 'branch-1', 'Baş Menecer');
      const ts = await adapter.getMonthlyTimesheets('2026-04', 'branch-1');
      expect(ts.every((t) => t.status === 'approved')).toBe(true);
    });

    it('executes full payroll run lifecycle: calculate -> approve -> finalize (lock) -> adjustment', async () => {
      const periods = await adapter.getPayrollPeriods();
      const periodId = periods[0].id;

      // 1. Calculate
      const calculated = await adapter.calculatePayrollRun(periodId, 'Mühasib');
      expect(calculated.period.status).toBe('calculated');
      expect(calculated.items.length).toBeGreaterThan(0);

      // 2. Approve
      const approved = await adapter.approvePayrollRun(periodId, 'Maliyyə Direktoru');
      expect(approved.status).toBe('approved');

      // 3. Finalize & Lock
      const finalized = await adapter.finalizePayrollRun(periodId, 'Baş İcraçı');
      expect(finalized.status).toBe('finalized');

      // 4. Cannot re-finalize without approval
      const firstItem = calculated.items[0];
      const initialNet = Number(firstItem.netSalaryQapik);

      // 5. Apply adjustment entry
      const adjAmount = toQapik(5000); // 50.00 ₼
      const adjusted = await adapter.applyPayrollAdjustment(
        firstItem.id,
        adjAmount,
        'Gecə növbəsi mükafatı əlavəsi',
        'Mühasib'
      );

      expect(Number(adjusted.netSalaryQapik)).toBe(initialNet + 5000);
      expect(adjusted.adjustments.length).toBe(1);

      // 6. Verify audit entry
      const logs = await adapter.getAuditLogs();
      const adjLog = logs.find((l) => l.details.includes('Gecə növbəsi'));
      expect(adjLog).toBeDefined();
    });
  });
});

