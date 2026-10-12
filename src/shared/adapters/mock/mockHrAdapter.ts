import { toQapik, Qapik } from '../../utils/money';
import { HrRepository } from '../types';
import {
  Employee,
  ShiftTemplate,
  ShiftScheduleWeek,
  ScheduledShift,
  AttendanceRecord,
  MonthlyTimesheetItem,
  LeaveBalance,
  LeaveRequest,
  PublicHoliday,
  PayrollPeriod,
  PayrollItem,
  HrAuditLogEntry,
} from '../../../features/hr/types';
import { calculateEmployeePayrollItem, calculateBranchPayrollAllocations } from '../../../features/hr/utils/payrollEngine';
import { recalculateLeaveBalance } from '../../../features/hr/utils/leaveEngine';
import { calculateAttendance } from '../../../features/hr/utils/attendanceCalculator';

export class MockHrAdapter implements HrRepository {
  private employees: Employee[] = [];
  private shiftTemplates: ShiftTemplate[] = [];
  private schedules: ShiftScheduleWeek[] = [];
  private attendanceRecords: AttendanceRecord[] = [];
  private leaveBalances: LeaveBalance[] = [];
  private leaveRequests: LeaveRequest[] = [];
  private publicHolidays: PublicHoliday[] = [];
  private payrollPeriods: PayrollPeriod[] = [];
  private payrollItemsMap = new Map<string, PayrollItem[]>();
  private auditLogs: HrAuditLogEntry[] = [];

  constructor() {
    this.seedData();
  }

  private seedData() {
    // 1. Shift Templates
    this.shiftTemplates = [
      {
        id: 'tmpl-morning',
        name: 'Səhər Növbəsi',
        startTime: '09:00',
        endTime: '18:00',
        durationHours: 8,
        breakDurationMinutes: 60,
        colorHex: '#3b82f6',
      },
      {
        id: 'tmpl-evening',
        name: 'Günorta / Axşam Növbəsi',
        startTime: '13:00',
        endTime: '22:00',
        durationHours: 8,
        breakDurationMinutes: 60,
        colorHex: '#8b5cf6',
      },
      {
        id: 'tmpl-full',
        name: 'Tam Gün Növbəsi',
        startTime: '10:00',
        endTime: '21:00',
        durationHours: 10,
        breakDurationMinutes: 60,
        colorHex: '#10b981',
      },
      {
        id: 'tmpl-office',
        name: 'Ofis Standart (09:00-18:00)',
        startTime: '09:00',
        endTime: '18:00',
        durationHours: 8,
        breakDurationMinutes: 60,
        colorHex: '#64748b',
      },
    ];

    // 2. Employees (Realistic Azerbaijani Team across 3 branches & HQ)
    this.employees = [
      {
        id: 'emp-1',
        employeeCode: 'EMP-001',
        firstName: 'Leyla',
        lastName: 'Məmmədova',
        fullName: 'Leyla Məmmədova',
        photoUrl: '',
        jobTitle: 'Baş İcraçı Menecer',
        department: 'Rəhbərlik',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        status: 'active',
        hireDate: '2023-01-10',
        finCode: '5ABC123',
        idCardNumber: 'AZE14253678',
        birthDate: '1988-04-12',
        gender: 'female',
        phone: '+994 50 211 44 88',
        email: 'leyla.m@brandhouse.az',
        address: 'Bakı ş., Nəsimi r., Nizami küç. 45',
        emergencyContactName: 'Kamran Məmmədov (Həyat yoldaşı)',
        emergencyContactPhone: '+994 50 322 11 00',
        employmentType: 'full_time',
        contractType: 'unlimited',
        contractNumber: 'MÜQ-2023-001',
        contractStartDate: '2023-01-10',
        workingHoursPerWeek: 40,
        salaryConfig: {
          compensationModel: 'fixed_monthly',
          baseSalaryQapik: toQapik(450000), // 4,500.00 ₼
          hourlyRateQapik: toQapik(0),
          overtimeAllowed: false,
          bankName: 'PAŞA Bank ASC',
          bankIban: 'AZ21PASHA00012938475600129991',
          taxReliefEligible: true,
        },
        systemUserId: 'user-gm',
        systemUserRole: 'general_manager',
        isSystemAccessActive: true,
        documents: [
          {
            id: 'doc-1',
            title: 'Şəxsiyyət Vəsiqəsi',
            type: 'id_card',
            fileName: 'leyla_id_card.pdf',
            fileUrl: '#',
            uploadedAt: '2023-01-10',
            expiryDate: '2028-04-12',
            isExpired: false,
            daysUntilExpiry: 730,
          },
        ],
        createdAt: '2023-01-10T09:00:00Z',
        updatedAt: '2026-04-01T10:00:00Z',
      },
      {
        id: 'emp-2',
        employeeCode: 'EMP-002',
        firstName: 'Rəşad',
        lastName: 'Qasımov',
        fullName: 'Rəşad Qasımov',
        photoUrl: '',
        jobTitle: 'Filial Meneceri',
        department: 'Satış',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        managerId: 'emp-1',
        managerName: 'Leyla Məmmədova',
        status: 'active',
        hireDate: '2023-05-15',
        finCode: '6DEF456',
        idCardNumber: 'AZE25364758',
        birthDate: '1992-08-20',
        gender: 'male',
        phone: '+994 55 344 55 66',
        email: 'reshad.q@brandhouse.az',
        address: 'Bakı ş., Nərimanov r., Təbriz küç. 18',
        emergencyContactName: 'Aytən Qasımova (Bacı)',
        emergencyContactPhone: '+994 50 788 99 11',
        employmentType: 'full_time',
        contractType: 'unlimited',
        contractNumber: 'MÜQ-2023-042',
        contractStartDate: '2023-05-15',
        workingHoursPerWeek: 40,
        salaryConfig: {
          compensationModel: 'fixed_monthly',
          baseSalaryQapik: toQapik(180000), // 1,800.00 ₼
          hourlyRateQapik: toQapik(0),
          monthlyBonusTargetQapik: toQapik(20000),
          overtimeAllowed: true,
          bankName: 'ABB ASC',
          bankIban: 'AZ21IBAZ380100194400012345670002',
          taxReliefEligible: true,
        },
        systemUserId: 'user-bm',
        systemUserRole: 'branch_manager',
        isSystemAccessActive: true,
        documents: [],
        createdAt: '2023-05-15T09:00:00Z',
        updatedAt: '2026-04-01T10:00:00Z',
      },
      {
        id: 'emp-3',
        employeeCode: 'EMP-003',
        firstName: 'Aygün',
        lastName: 'Əliyeva',
        fullName: 'Aygün Əliyeva',
        photoUrl: '',
        jobTitle: 'Baş Kassir',
        department: 'Kassa',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        managerId: 'emp-2',
        managerName: 'Rəşad Qasımov',
        status: 'active',
        hireDate: '2024-02-01',
        finCode: '7GHI789',
        idCardNumber: 'AZE99887766',
        birthDate: '1995-11-05',
        gender: 'female',
        phone: '+994 70 888 22 33',
        email: 'aygun.a@brandhouse.az',
        address: 'Bakı ş., Yasamal r., Şərifzadə küç. 12',
        emergencyContactName: 'Elmir Əliyev (Qardaş)',
        emergencyContactPhone: '+994 51 444 33 22',
        employmentType: 'shift',
        contractType: 'unlimited',
        contractNumber: 'MÜQ-2024-088',
        contractStartDate: '2024-02-01',
        workingHoursPerWeek: 40,
        salaryConfig: {
          compensationModel: 'hourly',
          baseSalaryQapik: toQapik(0),
          hourlyRateQapik: toQapik(650), // 6.50 ₼ / saat
          overtimeAllowed: true,
          bankName: 'Kapital Bank ASC',
          bankIban: 'AZ44AIIB380100194400012345670003',
          taxReliefEligible: true,
        },
        systemUserId: 'user-cashier',
        systemUserRole: 'cashier',
        isSystemAccessActive: true,
        documents: [],
        createdAt: '2024-02-01T09:00:00Z',
        updatedAt: '2026-04-01T10:00:00Z',
      },
      {
        id: 'emp-4',
        employeeCode: 'EMP-004',
        firstName: 'Nurlan',
        lastName: 'Hüseynov',
        fullName: 'Nurlan Hüseynov',
        photoUrl: '',
        jobTitle: 'Moda Məsləhətçisi (Stilist)',
        department: 'Satış',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        managerId: 'emp-2',
        managerName: 'Rəşad Qasımov',
        status: 'active',
        hireDate: '2024-06-10',
        finCode: '8JKL012',
        idCardNumber: 'AZE33445566',
        birthDate: '1998-03-15',
        gender: 'male',
        phone: '+994 50 677 88 99',
        email: 'nurlan.h@brandhouse.az',
        address: 'Bakı ş., Xətai r., Gəncə pr. 24',
        emergencyContactName: 'Gülnar Hüseynova (Ana)',
        emergencyContactPhone: '+994 50 333 99 88',
        employmentType: 'full_time',
        contractType: 'unlimited',
        contractNumber: 'MÜQ-2024-112',
        contractStartDate: '2024-06-10',
        workingHoursPerWeek: 40,
        salaryConfig: {
          compensationModel: 'commission_based',
          baseSalaryQapik: toQapik(80000), // 800.00 ₼ baza zəmanəti
          hourlyRateQapik: toQapik(0),
          commissionRatePercent: 2.5, // 2.5% şəxsi satış dövriyyəsindən
          monthlyBonusTargetQapik: toQapik(15000),
          overtimeAllowed: true,
          bankName: 'Unibank ASC',
          bankIban: 'AZ99UBIB380100194400012345670004',
          taxReliefEligible: true,
        },
        documents: [],
        createdAt: '2024-06-10T09:00:00Z',
        updatedAt: '2026-04-01T10:00:00Z',
      },
      {
        id: 'emp-5',
        employeeCode: 'EMP-005',
        firstName: 'Tural',
        lastName: 'Kərimov',
        fullName: 'Tural Kərimov',
        photoUrl: '',
        jobTitle: 'Filial Meneceri',
        department: 'Satış',
        branchId: 'branch-2',
        branchName: 'Gənclik Mall Filialı',
        managerId: 'emp-1',
        managerName: 'Leyla Məmmədova',
        status: 'active',
        hireDate: '2023-09-01',
        finCode: '9MNO345',
        idCardNumber: 'AZE77889900',
        birthDate: '1990-12-04',
        gender: 'male',
        phone: '+994 55 455 66 77',
        email: 'tural.k@brandhouse.az',
        address: 'Bakı ş., Səbail r., Badamdar qəs. 3',
        emergencyContactName: 'Fərid Kərimov (Qardaş)',
        emergencyContactPhone: '+994 50 600 77 88',
        employmentType: 'full_time',
        contractType: 'unlimited',
        contractNumber: 'MÜQ-2023-095',
        contractStartDate: '2023-09-01',
        workingHoursPerWeek: 40,
        salaryConfig: {
          compensationModel: 'fixed_monthly',
          baseSalaryQapik: toQapik(175000), // 1,750.00 ₼
          hourlyRateQapik: toQapik(0),
          overtimeAllowed: true,
          bankName: 'PAŞA Bank ASC',
          bankIban: 'AZ21PASHA00012938475600120005',
          taxReliefEligible: true,
        },
        documents: [],
        createdAt: '2023-09-01T09:00:00Z',
        updatedAt: '2026-04-01T10:00:00Z',
      },
      {
        id: 'emp-6',
        employeeCode: 'EMP-006',
        firstName: 'Günel',
        lastName: 'Məhərrəmova',
        fullName: 'Günel Məhərrəmova',
        photoUrl: '',
        jobTitle: 'Kassir-Satıcı',
        department: 'Kassa',
        branchId: 'branch-2',
        branchName: 'Gənclik Mall Filialı',
        managerId: 'emp-5',
        managerName: 'Tural Kərimov',
        status: 'active',
        hireDate: '2024-04-15',
        finCode: '1PQR678',
        idCardNumber: 'AZE55667788',
        birthDate: '1997-07-22',
        gender: 'female',
        phone: '+994 77 333 44 55',
        email: 'gunel.m@brandhouse.az',
        address: 'Bakı ş., Binəqədi r., 8-ci mkr 15',
        emergencyContactName: 'Səkinə Məhərrəmova (Ana)',
        emergencyContactPhone: '+994 50 222 33 44',
        employmentType: 'shift',
        contractType: 'unlimited',
        contractNumber: 'MÜQ-2024-044',
        contractStartDate: '2024-04-15',
        workingHoursPerWeek: 40,
        salaryConfig: {
          compensationModel: 'hourly',
          baseSalaryQapik: toQapik(0),
          hourlyRateQapik: toQapik(580), // 5.80 ₼ / saat
          overtimeAllowed: true,
          bankName: 'Kapital Bank ASC',
          bankIban: 'AZ44AIIB380100194400012345670006',
          taxReliefEligible: true,
        },
        documents: [],
        createdAt: '2024-04-15T09:00:00Z',
        updatedAt: '2026-04-01T10:00:00Z',
      },
      {
        id: 'emp-7',
        employeeCode: 'EMP-007',
        firstName: 'Murad',
        lastName: 'Babayev',
        fullName: 'Murad Babayev',
        photoUrl: '',
        jobTitle: 'Baş Anbardar',
        department: 'Logistika və Anbar',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        managerId: 'emp-1',
        managerName: 'Leyla Məmmədova',
        status: 'active',
        hireDate: '2023-03-01',
        finCode: '2STU901',
        idCardNumber: 'AZE11223344',
        birthDate: '1989-05-18',
        gender: 'male',
        phone: '+994 50 555 12 34',
        email: 'murad.b@brandhouse.az',
        address: 'Bakı ş., Suraxanı r., Yeni Günəşli qəs. V massivi',
        emergencyContactName: 'Vüsal Babayev (Qardaş)',
        emergencyContactPhone: '+994 50 444 77 11',
        employmentType: 'full_time',
        contractType: 'unlimited',
        contractNumber: 'MÜQ-2023-019',
        contractStartDate: '2023-03-01',
        workingHoursPerWeek: 40,
        salaryConfig: {
          compensationModel: 'fixed_monthly',
          baseSalaryQapik: toQapik(140000), // 1,400.00 ₼
          hourlyRateQapik: toQapik(0),
          overtimeAllowed: true,
          bankName: 'ABB ASC',
          bankIban: 'AZ21IBAZ380100194400012345670007',
          taxReliefEligible: true,
        },
        systemUserId: 'user-wh',
        systemUserRole: 'warehouse_keeper',
        isSystemAccessActive: true,
        documents: [],
        createdAt: '2023-03-01T09:00:00Z',
        updatedAt: '2026-04-01T10:00:00Z',
      },
      {
        id: 'emp-8',
        employeeCode: 'EMP-008',
        firstName: 'Sevinc',
        lastName: 'İsmayılova',
        fullName: 'Sevinc İsmayılova',
        photoUrl: '',
        jobTitle: 'Filial Meneceri',
        department: 'Satış',
        branchId: 'branch-3',
        branchName: 'Dəniz Mall Filialı',
        managerId: 'emp-1',
        managerName: 'Leyla Məmmədova',
        status: 'active',
        hireDate: '2024-01-10',
        finCode: '3VWX234',
        idCardNumber: 'AZE88990011',
        birthDate: '1993-09-14',
        gender: 'female',
        phone: '+994 55 999 88 77',
        email: 'sevinc.i@brandhouse.az',
        address: 'Bakı ş., Xətai r., Nobel pr. 10',
        emergencyContactName: 'Nigar İsmayılova (Bacı)',
        emergencyContactPhone: '+994 50 111 22 33',
        employmentType: 'full_time',
        contractType: 'unlimited',
        contractNumber: 'MÜQ-2024-008',
        contractStartDate: '2024-01-10',
        workingHoursPerWeek: 40,
        salaryConfig: {
          compensationModel: 'fixed_monthly',
          baseSalaryQapik: toQapik(180000), // 1,800.00 ₼
          hourlyRateQapik: toQapik(0),
          overtimeAllowed: true,
          bankName: 'PAŞA Bank ASC',
          bankIban: 'AZ21PASHA00012938475600120008',
          taxReliefEligible: true,
        },
        documents: [],
        createdAt: '2024-01-10T09:00:00Z',
        updatedAt: '2026-04-01T10:00:00Z',
      },
    ];

    // 3. Leave Balances
    this.leaveBalances = this.employees.map((emp) => ({
      employeeId: emp.id,
      employeeName: emp.fullName,
      annualEntitledDays: 21,
      annualUsedDays: emp.id === 'emp-4' ? 5 : 0,
      annualRemainingDays: emp.id === 'emp-4' ? 16 : 21,
      unpaidUsedDays: emp.id === 'emp-3' ? 2 : 0,
      sickDaysUsed: 0,
      lastRecalculatedAt: '2026-04-01T10:00:00Z',
    }));

    // 4. Leave Requests
    this.leaveRequests = [
      {
        id: 'leave-1',
        employeeId: 'emp-4',
        employeeName: 'Nurlan Hüseynov',
        department: 'Satış',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        leaveType: 'annual',
        startDate: '2026-04-20',
        endDate: '2026-04-24',
        totalDays: 5,
        reason: 'Şəxsi ailəvi məzuniyyət',
        status: 'approved',
        managerApproverName: 'Rəşad Qasımov',
        managerDecisionDate: '2026-04-02',
        hrApproverName: 'Leyla Məmmədova',
        hrDecisionDate: '2026-04-03',
        createdAt: '2026-04-01T11:00:00Z',
        updatedAt: '2026-04-03T14:00:00Z',
      },
      {
        id: 'leave-2',
        employeeId: 'emp-3',
        employeeName: 'Aygün Əliyeva',
        department: 'Kassa',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        leaveType: 'study',
        startDate: '2026-04-28',
        endDate: '2026-04-30',
        totalDays: 3,
        reason: 'Universitet imtahan sessiyası üzrə arayış əlavə olunub',
        status: 'pending_manager',
        createdAt: '2026-04-08T09:30:00Z',
        updatedAt: '2026-04-08T09:30:00Z',
      },
      {
        id: 'leave-3',
        employeeId: 'emp-6',
        employeeName: 'Günel Məhərrəmova',
        department: 'Kassa',
        branchId: 'branch-2',
        branchName: 'Gənclik Mall Filialı',
        leaveType: 'annual',
        startDate: '2026-05-04',
        endDate: '2026-05-08',
        totalDays: 5,
        reason: 'Yaz istirahəti',
        status: 'pending_hr',
        managerApproverName: 'Tural Kərimov',
        managerDecisionDate: '2026-04-09',
        createdAt: '2026-04-07T12:00:00Z',
        updatedAt: '2026-04-09T16:00:00Z',
      },
    ];

    // 5. Public Holidays
    this.publicHolidays = [
      { id: 'hol-1', date: '2026-01-01', nameAz: 'Yeni İl Bayramı', isWorkingDay: false },
      { id: 'hol-2', date: '2026-01-20', nameAz: 'Ümumxalq Hüzn Günü', isWorkingDay: false },
      { id: 'hol-3', date: '2026-03-08', nameAz: 'Qadınlar Günü', isWorkingDay: false },
      { id: 'hol-4', date: '2026-03-20', nameAz: 'Novruz Bayramı', isWorkingDay: false },
      { id: 'hol-5', date: '2026-03-21', nameAz: 'Novruz Bayramı', isWorkingDay: false },
      { id: 'hol-6', date: '2026-05-09', nameAz: 'Faşizm üzərində Qələbə Günü', isWorkingDay: false },
      { id: 'hol-7', date: '2026-05-28', nameAz: 'Müstəqillik Günü', isWorkingDay: false },
      { id: 'hol-8', date: '2026-06-15', nameAz: 'Milli Qurtuluş Günü', isWorkingDay: false },
      { id: 'hol-9', date: '2026-11-08', nameAz: 'Zəfər Günü', isWorkingDay: false },
      { id: 'hol-10', date: '2026-11-09', nameAz: 'Dövlət Bayrağı Günü', isWorkingDay: false },
      { id: 'hol-11', date: '2026-12-31', nameAz: 'Dünya Azərbaycanlılarının Həmrəyliyi Günü', isWorkingDay: false },
    ];

    // 6. Shift Schedules
    const weekStart = '2026-04-06';
    const weekEnd = '2026-04-12';
    this.schedules = [
      {
        id: 'sched-b1-w15',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        weekStartDate: weekStart,
        weekEndDate: weekEnd,
        isPublished: true,
        publishedAt: '2026-04-05T18:00:00Z',
        publishedBy: 'Leyla Məmmədova',
        requiredStaffPerHour: {
          '10:00': 2,
          '14:00': 3,
          '18:00': 3,
        },
        shifts: [
          {
            id: 's-1',
            employeeId: 'emp-2',
            employeeName: 'Rəşad Qasımov',
            date: '2026-04-06',
            templateId: 'tmpl-morning',
            templateName: 'Səhər Növbəsi',
            startTime: '09:00',
            endTime: '18:00',
            hours: 8,
          },
          {
            id: 's-2',
            employeeId: 'emp-3',
            employeeName: 'Aygün Əliyeva',
            date: '2026-04-06',
            templateId: 'tmpl-morning',
            templateName: 'Səhər Növbəsi',
            startTime: '09:00',
            endTime: '18:00',
            hours: 8,
          },
          {
            id: 's-3',
            employeeId: 'emp-4',
            employeeName: 'Nurlan Hüseynov',
            date: '2026-04-06',
            templateId: 'tmpl-evening',
            templateName: 'Günorta / Axşam Növbəsi',
            startTime: '13:00',
            endTime: '22:00',
            hours: 8,
          },
          {
            id: 's-4',
            employeeId: 'emp-7',
            employeeName: 'Murad Babayev',
            date: '2026-04-06',
            templateId: 'tmpl-morning',
            templateName: 'Səhər Növbəsi',
            startTime: '09:00',
            endTime: '18:00',
            hours: 8,
          },
          // Tuesday
          {
            id: 's-5',
            employeeId: 'emp-2',
            employeeName: 'Rəşad Qasımov',
            date: '2026-04-07',
            templateId: 'tmpl-morning',
            templateName: 'Səhər Növbəsi',
            startTime: '09:00',
            endTime: '18:00',
            hours: 8,
          },
          {
            id: 's-6',
            employeeId: 'emp-3',
            employeeName: 'Aygün Əliyeva',
            date: '2026-04-07',
            templateId: 'tmpl-morning',
            templateName: 'Səhər Növbəsi',
            startTime: '09:00',
            endTime: '18:00',
            hours: 8,
          },
        ],
      },
    ];

    // 7. Attendance Records (Recent days)
    this.attendanceRecords = [
      {
        id: 'att-1',
        employeeId: 'emp-2',
        employeeName: 'Rəşad Qasımov',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        date: '2026-04-10',
        scheduledStartTime: '09:00',
        scheduledEndTime: '18:00',
        checkInTime: '08:55',
        checkOutTime: '18:10',
        checkInSource: 'device',
        checkOutSource: 'device',
        lateMinutes: 0,
        earlyDepartureMinutes: 0,
        overtimeMinutes: 0,
        workedMinutes: 480,
        status: 'on_time',
        isException: false,
      },
      {
        id: 'att-2',
        employeeId: 'emp-3',
        employeeName: 'Aygün Əliyeva',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        date: '2026-04-10',
        scheduledStartTime: '09:00',
        scheduledEndTime: '18:00',
        checkInTime: '09:28',
        checkOutTime: '18:05',
        checkInSource: 'device',
        checkOutSource: 'device',
        lateMinutes: 28,
        earlyDepartureMinutes: 0,
        overtimeMinutes: 0,
        workedMinutes: 457,
        status: 'late',
        isException: false,
      },
      {
        id: 'att-3',
        employeeId: 'emp-4',
        employeeName: 'Nurlan Hüseynov',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        date: '2026-04-10',
        scheduledStartTime: '13:00',
        scheduledEndTime: '22:00',
        checkInTime: '12:55',
        checkOutTime: '23:15',
        checkInSource: 'device',
        checkOutSource: 'device',
        lateMinutes: 0,
        earlyDepartureMinutes: 0,
        overtimeMinutes: 75,
        workedMinutes: 560,
        status: 'overtime',
        isException: false,
      },
      {
        id: 'att-4',
        employeeId: 'emp-7',
        employeeName: 'Murad Babayev',
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        date: '2026-04-10',
        scheduledStartTime: '09:00',
        scheduledEndTime: '18:00',
        checkInTime: '09:02',
        checkOutTime: undefined, // Missing punch exception!
        checkInSource: 'device',
        lateMinutes: 0,
        earlyDepartureMinutes: 0,
        overtimeMinutes: 0,
        workedMinutes: 0,
        status: 'incomplete',
        isException: true,
        exceptionReason: 'Çıxış zərbəsi (Check-out) çatışmır',
      },
    ];

    // 8. Payroll Periods & Runs
    // March 2026 (Finalized)
    const marchPeriod: PayrollPeriod = {
      id: 'pay-2026-03',
      code: '2026-03',
      name: 'Mart 2026',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      status: 'finalized',
      totalEmployees: this.employees.length,
      totalGrossQapik: toQapik(1450000), // 14,500.00 ₼
      totalDeductionsQapik: toQapik(79750), // 797.50 ₼
      totalNetQapik: toQapik(1370250), // 13,702.50 ₼
      totalEmployerCostQapik: toQapik(1703750), // 17,037.50 ₼
      anomaliesCount: 0,
      calculatedAt: '2026-04-01T10:00:00Z',
      calculatedBy: 'Leyla Məmmədova',
      approvedAt: '2026-04-02T11:00:00Z',
      approvedBy: 'Leyla Məmmədova',
      finalizedAt: '2026-04-03T12:00:00Z',
      finalizedBy: 'Leyla Məmmədova',
      branchAllocations: [
        {
          branchId: 'branch-1',
          branchName: '28 May Flaman Filialı',
          employeeCount: 5,
          grossSalaryQapik: toQapik(980000),
          employerCostQapik: toQapik(171500),
          totalExpenseQapik: toQapik(1151500),
        },
        {
          branchId: 'branch-2',
          branchName: 'Gənclik Mall Filialı',
          employeeCount: 2,
          grossSalaryQapik: toQapik(290000),
          employerCostQapik: toQapik(50750),
          totalExpenseQapik: toQapik(340750),
        },
        {
          branchId: 'branch-3',
          branchName: 'Dəniz Mall Filialı',
          employeeCount: 1,
          grossSalaryQapik: toQapik(180000),
          employerCostQapik: toQapik(31500),
          totalExpenseQapik: toQapik(211500),
        },
      ],
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-04-03T12:00:00Z',
    };

    // April 2026 (Under Review / Calculated)
    const aprilItems = this.employees.map((emp) => {
      let workData = {
        normalScheduledHours: 160,
        actualWorkedHours: 160,
        overtimeHours: 0,
        overtimeMultiplier: 1.5,
        salesRevenueQapik: toQapik(0),
        performanceBonusQapik: toQapik(0),
        previousNetSalaryQapik: toQapik(150000),
      };

      if (emp.id === 'emp-3') {
        // Hourly worker
        workData = {
          normalScheduledHours: 160,
          actualWorkedHours: 168,
          overtimeHours: 8,
          overtimeMultiplier: 1.5,
          salesRevenueQapik: toQapik(0),
          performanceBonusQapik: toQapik(5000),
          previousNetSalaryQapik: toQapik(102000),
        };
      } else if (emp.id === 'emp-4') {
        // Commission worker with high sales
        workData = {
          normalScheduledHours: 160,
          actualWorkedHours: 160,
          overtimeHours: 0,
          overtimeMultiplier: 1.5,
          salesRevenueQapik: toQapik(4500000), // 45,000 AZN store sales
          performanceBonusQapik: toQapik(10000),
          previousNetSalaryQapik: toQapik(165000),
        };
      } else if (emp.id === 'emp-7') {
        // Warehouse lead
        workData = {
          normalScheduledHours: 160,
          actualWorkedHours: 160,
          overtimeHours: 12,
          overtimeMultiplier: 1.5,
          salesRevenueQapik: toQapik(0),
          performanceBonusQapik: toQapik(0),
          previousNetSalaryQapik: toQapik(132000),
        };
      }

      return calculateEmployeePayrollItem('pay-2026-04', emp, workData);
    });

    const totalGrossQapik = toQapik(aprilItems.reduce((s, i) => s + Number(i.grossSalaryQapik), 0));
    const totalDeductionsQapik = toQapik(aprilItems.reduce((s, i) => s + Number(i.totalDeductionsQapik), 0));
    const totalNetQapik = toQapik(aprilItems.reduce((s, i) => s + Number(i.netSalaryQapik), 0));
    const totalEmployerCostQapik = toQapik(aprilItems.reduce((s, i) => s + Number(i.totalEmployerCostQapik), 0));
    const branchAllocations = calculateBranchPayrollAllocations(aprilItems);
    const anomaliesCount = aprilItems.filter((i) => i.isAnomalous).length;

    const aprilPeriod: PayrollPeriod = {
      id: 'pay-2026-04',
      code: '2026-04',
      name: 'Aprel 2026',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      status: 'under_review',
      totalEmployees: this.employees.length,
      totalGrossQapik,
      totalDeductionsQapik,
      totalNetQapik,
      totalEmployerCostQapik,
      branchAllocations,
      anomaliesCount,
      calculatedAt: '2026-04-10T14:00:00Z',
      calculatedBy: 'Leyla Məmmədova',
      createdAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-10T14:00:00Z',
    };

    this.payrollPeriods = [aprilPeriod, marchPeriod];
    this.payrollItemsMap.set('pay-2026-04', aprilItems);

    // 9. Initial Audit Logs
    this.auditLogs = [
      {
        id: 'aud-1',
        timestamp: '2026-04-03T12:00:00Z',
        userId: 'user-gm',
        userName: 'Leyla Məmmədova',
        action: 'payroll_finalize',
        details: 'Mart 2026 əməkhaqqı yekunlaşdırıldı və kilidləndi.',
      },
      {
        id: 'aud-2',
        timestamp: '2026-04-05T18:00:00Z',
        userId: 'user-gm',
        userName: 'Leyla Məmmədova',
        action: 'schedule_publish',
        details: '28 May filialı üçün 15-ci həftə qrafiki dərc edildi.',
      },
    ];
  }

  // --- Employees ---
  async getEmployees(params?: { search?: string; branchId?: string; department?: string; status?: string }): Promise<Employee[]> {
    let list = [...this.employees];

    if (params?.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (e) =>
          e.fullName.toLowerCase().includes(q) ||
          e.employeeCode.toLowerCase().includes(q) ||
          e.jobTitle.toLowerCase().includes(q) ||
          e.phone.toLowerCase().includes(q)
      );
    }

    if (params?.branchId && params.branchId !== 'all') {
      list = list.filter((e) => e.branchId === params.branchId);
    }

    if (params?.department && params.department !== 'all') {
      list = list.filter((e) => e.department === params.department);
    }

    if (params?.status && params.status !== 'all') {
      list = list.filter((e) => e.status === params.status);
    }

    return list;
  }

  async getEmployeeById(id: string): Promise<Employee | null> {
    return this.employees.find((e) => e.id === id) || null;
  }

  async createEmployee(data: Partial<Employee>): Promise<Employee> {
    const nextCode = `EMP-00${this.employees.length + 1}`;
    const newEmp: Employee = {
      id: `emp-${Date.now()}`,
      employeeCode: data.employeeCode || nextCode,
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      fullName: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
      photoUrl: data.photoUrl || '',
      jobTitle: data.jobTitle || 'Satıcı',
      department: data.department || 'Satış',
      branchId: data.branchId || 'branch-1',
      branchName: data.branchName || '28 May Flaman Filialı',
      managerId: data.managerId,
      status: data.status || 'active',
      hireDate: data.hireDate || new Date().toISOString().slice(0, 10),
      finCode: data.finCode || '7ABC123',
      idCardNumber: data.idCardNumber || 'AZE00000000',
      birthDate: data.birthDate || '1995-01-01',
      gender: data.gender || 'female',
      phone: data.phone || '+994 50 000 00 00',
      email: data.email || 'employee@brandhouse.az',
      address: data.address || 'Bakı şəhəri',
      emergencyContactName: data.emergencyContactName || 'Təcili Əlaqə',
      emergencyContactPhone: data.emergencyContactPhone || '+994 50 000 00 00',
      employmentType: data.employmentType || 'full_time',
      contractType: data.contractType || 'unlimited',
      contractNumber: data.contractNumber || `MÜQ-${Date.now().toString().slice(-4)}`,
      contractStartDate: data.contractStartDate || new Date().toISOString().slice(0, 10),
      workingHoursPerWeek: data.workingHoursPerWeek || 40,
      salaryConfig: data.salaryConfig || {
        compensationModel: 'fixed_monthly',
        baseSalaryQapik: toQapik(100000),
        hourlyRateQapik: toQapik(0),
        overtimeAllowed: true,
        bankName: 'Kapital Bank ASC',
        bankIban: 'AZ44AIIB000000000000000000000000',
      },
      documents: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.employees.unshift(newEmp);

    // Create leave balance for new employee
    this.leaveBalances.push({
      employeeId: newEmp.id,
      employeeName: newEmp.fullName,
      annualEntitledDays: 21,
      annualUsedDays: 0,
      annualRemainingDays: 21,
      unpaidUsedDays: 0,
      sickDaysUsed: 0,
      lastRecalculatedAt: new Date().toISOString(),
    });

    return newEmp;
  }

  async updateEmployee(id: string, data: Partial<Employee>): Promise<Employee> {
    const idx = this.employees.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error('Əməkdaş tapılmadı');

    const updated: Employee = {
      ...this.employees[idx],
      ...data,
      fullName: data.firstName || data.lastName
        ? `${data.firstName || this.employees[idx].firstName} ${data.lastName || this.employees[idx].lastName}`.trim()
        : this.employees[idx].fullName,
      updatedAt: new Date().toISOString(),
    };

    this.employees[idx] = updated;
    return updated;
  }

  async offboardEmployee(
    id: string,
    terminationDate: string,
    reason: string,
    checklist: {
      assetsReturned: boolean;
      keysReturned: boolean;
      uniformReturned: boolean;
      accessRevoked: boolean;
      finalSettlementCalculated: boolean;
      notes?: string;
    }
  ): Promise<Employee> {
    const idx = this.employees.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error('Əməkdaş tapılmadı');

    const updated: Employee = {
      ...this.employees[idx],
      status: 'terminated',
      terminationDate,
      terminationReason: reason,
      isOffboarded: true,
      offboardingChecklist: checklist,
      isSystemAccessActive: false, // Access revoked!
      updatedAt: new Date().toISOString(),
    };

    this.employees[idx] = updated;

    await this.logAuditEntry({
      userId: 'system',
      userName: 'HR Menecer',
      action: 'offboard_employee',
      targetEmployeeId: updated.id,
      targetEmployeeName: updated.fullName,
      details: `${updated.fullName} işdən azad edildi (${terminationDate}). Səbəb: ${reason}. Girişlər ləğv edildi.`,
    });

    return updated;
  }

  // --- Schedules ---
  async getShiftTemplates(): Promise<ShiftTemplate[]> {
    return [...this.shiftTemplates];
  }

  async getShiftSchedule(branchId: string, weekStartDate: string): Promise<ShiftScheduleWeek> {
    const found = this.schedules.find(
      (s) => s.branchId === branchId && s.weekStartDate === weekStartDate
    );

    if (found) return found;

    // Return empty draft week if none exists
    const dStart = new Date(weekStartDate);
    const dEnd = new Date(dStart);
    dEnd.setDate(dEnd.getDate() + 6);

    const emptySchedule: ShiftScheduleWeek = {
      id: `sched-${branchId}-${weekStartDate}`,
      branchId,
      branchName: branchId === 'branch-1' ? '28 May Flaman Filialı' : branchId === 'branch-2' ? 'Gənclik Mall Filialı' : 'Dəniz Mall Filialı',
      weekStartDate,
      weekEndDate: dEnd.toISOString().slice(0, 10),
      isPublished: false,
      shifts: [],
      requiredStaffPerHour: {
        '10:00': 2,
        '14:00': 3,
        '18:00': 3,
      },
    };

    this.schedules.push(emptySchedule);
    return emptySchedule;
  }

  async saveShiftSchedule(schedule: ShiftScheduleWeek): Promise<ShiftScheduleWeek> {
    const idx = this.schedules.findIndex((s) => s.id === schedule.id);
    if (idx !== -1) {
      this.schedules[idx] = schedule;
    } else {
      this.schedules.push(schedule);
    }
    return schedule;
  }

  async publishShiftSchedule(id: string, publishedBy: string): Promise<ShiftScheduleWeek> {
    const idx = this.schedules.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error('Qrafik tapılmadı');

    const published: ShiftScheduleWeek = {
      ...this.schedules[idx],
      isPublished: true,
      publishedAt: new Date().toISOString(),
      publishedBy,
    };

    this.schedules[idx] = published;

    await this.logAuditEntry({
      userId: 'user',
      userName: publishedBy,
      action: 'schedule_publish',
      details: `${published.branchName} üçün qrafik (${published.weekStartDate}) dərc edildi.`,
    });

    return published;
  }

  async copyPreviousWeekSchedule(branchId: string, currentWeekStart: string): Promise<ShiftScheduleWeek> {
    const currDate = new Date(currentWeekStart);
    const prevDate = new Date(currDate);
    prevDate.setDate(prevDate.getDate() - 7);
    const prevStartStr = prevDate.toISOString().slice(0, 10);

    const prevSchedule = await this.getShiftSchedule(branchId, prevStartStr);

    const currentSchedule = await this.getShiftSchedule(branchId, currentWeekStart);

    // Map shifts by advancing 7 days
    const copiedShifts: ScheduledShift[] = prevSchedule.shifts.map((s) => {
      const sDate = new Date(s.date);
      sDate.setDate(sDate.getDate() + 7);
      return {
        ...s,
        id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: sDate.toISOString().slice(0, 10),
      };
    });

    currentSchedule.shifts = copiedShifts;
    currentSchedule.isPublished = false;
    return this.saveShiftSchedule(currentSchedule);
  }

  // --- Attendance ---
  async getAttendanceRecords(params?: { branchId?: string; date?: string; employeeId?: string }): Promise<AttendanceRecord[]> {
    let list = [...this.attendanceRecords];

    if (params?.branchId && params.branchId !== 'all') {
      list = list.filter((r) => r.branchId === params.branchId);
    }
    if (params?.date) {
      list = list.filter((r) => r.date === params.date);
    }
    if (params?.employeeId) {
      list = list.filter((r) => r.employeeId === params.employeeId);
    }

    return list;
  }

  async recordAttendancePunch(
    employeeId: string,
    type: 'in' | 'out',
    source: 'device' | 'manual',
    time?: string,
    reason?: string
  ): Promise<AttendanceRecord> {
    const emp = await this.getEmployeeById(employeeId);
    if (!emp) throw new Error('Əməkdaş tapılmadı');

    const todayStr = new Date().toISOString().slice(0, 10);
    const timeStr = time || new Date().toTimeString().slice(0, 5);

    let record = this.attendanceRecords.find(
      (r) => r.employeeId === employeeId && r.date === todayStr
    );

    if (!record) {
      record = {
        id: `att-${Date.now()}`,
        employeeId: emp.id,
        employeeName: emp.fullName,
        branchId: emp.branchId,
        branchName: emp.branchName,
        date: todayStr,
        scheduledStartTime: '09:00',
        scheduledEndTime: '18:00',
        checkInTime: type === 'in' ? timeStr : undefined,
        checkInSource: source,
        lateMinutes: 0,
        earlyDepartureMinutes: 0,
        overtimeMinutes: 0,
        workedMinutes: 0,
        status: 'incomplete',
        isException: type === 'out',
      };
      this.attendanceRecords.push(record);
    } else {
      if (type === 'in') {
        record.checkInTime = timeStr;
        record.checkInSource = source;
      } else {
        record.checkOutTime = timeStr;
        record.checkOutSource = source;
      }
    }

    // Recompute
    const calc = calculateAttendance({
      scheduledStartTime: record.scheduledStartTime,
      scheduledEndTime: record.scheduledEndTime,
      checkInTime: record.checkInTime,
      checkOutTime: record.checkOutTime,
    });

    record.lateMinutes = calc.lateMinutes;
    record.earlyDepartureMinutes = calc.earlyDepartureMinutes;
    record.overtimeMinutes = calc.overtimeMinutes;
    record.workedMinutes = calc.workedMinutes;
    record.status = calc.status;
    record.isException = calc.isException;
    if (calc.exceptionReason) record.exceptionReason = calc.exceptionReason;

    if (source === 'manual' && reason) {
      record.correctionReason = reason;
      await this.logAuditEntry({
        userId: 'system',
        userName: 'Menecer',
        action: 'manual_attendance',
        targetEmployeeId: emp.id,
        targetEmployeeName: emp.fullName,
        details: `Manual zərbə: ${type} = ${timeStr}. Səbəb: ${reason}`,
      });
    }

    return record;
  }

  async correctAttendanceException(
    id: string,
    checkInTime: string,
    checkOutTime: string,
    reason: string,
    correctedBy: string
  ): Promise<AttendanceRecord> {
    const idx = this.attendanceRecords.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error('Davamiyyət qeydi tapılmadı');

    const record = this.attendanceRecords[idx];
    const calc = calculateAttendance({
      scheduledStartTime: record.scheduledStartTime,
      scheduledEndTime: record.scheduledEndTime,
      checkInTime,
      checkOutTime,
    });

    const updated: AttendanceRecord = {
      ...record,
      checkInTime,
      checkOutTime,
      lateMinutes: calc.lateMinutes,
      earlyDepartureMinutes: calc.earlyDepartureMinutes,
      overtimeMinutes: calc.overtimeMinutes,
      workedMinutes: calc.workedMinutes,
      status: calc.status,
      isException: false,
      exceptionReason: undefined,
      correctionReason: reason,
      correctedBy,
      correctedAt: new Date().toISOString(),
    };

    this.attendanceRecords[idx] = updated;

    await this.logAuditEntry({
      userId: 'user',
      userName: correctedBy,
      action: 'manual_attendance',
      targetEmployeeId: updated.employeeId,
      targetEmployeeName: updated.employeeName,
      details: `${updated.employeeName} üçün davamiyyət düzəlişi (${checkInTime}–${checkOutTime}). Səbəb: ${reason}`,
    });

    return updated;
  }

  async getMonthlyTimesheets(_monthCode: string, branchId?: string): Promise<MonthlyTimesheetItem[]> {
    let emps = [...this.employees];
    if (branchId && branchId !== 'all') {
      emps = emps.filter((e) => e.branchId === branchId);
    }

    return emps.map((emp) => ({
      employeeId: emp.id,
      employeeName: emp.fullName,
      branchName: emp.branchName,
      jobTitle: emp.jobTitle,
      totalScheduledHours: 160,
      totalWorkedHours: emp.id === 'emp-3' ? 168 : emp.id === 'emp-7' ? 172 : 160,
      totalLateMinutes: emp.id === 'emp-3' ? 28 : 0,
      totalOvertimeHours: emp.id === 'emp-3' ? 8 : emp.id === 'emp-7' ? 12 : 0,
      absenceDays: 0,
      approvedLeaveDays: emp.id === 'emp-4' ? 5 : 0,
      status: 'approved',
    }));
  }

  async approveMonthlyTimesheet(_monthCode: string, _branchId: string, _approvedBy: string): Promise<void> {
    // Timesheet approved
  }

  async importAttendanceCsv(
    branchId: string,
    date: string,
    lines: Array<{ employeeCode: string; checkIn: string; checkOut: string }>
  ): Promise<{ importedCount: number }> {
    let count = 0;
    for (const line of lines) {
      const emp = this.employees.find((e) => e.employeeCode === line.employeeCode);
      if (emp) {
        const calc = calculateAttendance({
          scheduledStartTime: '09:00',
          scheduledEndTime: '18:00',
          checkInTime: line.checkIn,
          checkOutTime: line.checkOut,
        });

        const newRec: AttendanceRecord = {
          id: `att-csv-${Date.now()}-${count}`,
          employeeId: emp.id,
          employeeName: emp.fullName,
          branchId,
          branchName: emp.branchName,
          date,
          scheduledStartTime: '09:00',
          scheduledEndTime: '18:00',
          checkInTime: line.checkIn,
          checkOutTime: line.checkOut,
          checkInSource: 'device',
          checkOutSource: 'device',
          lateMinutes: calc.lateMinutes,
          earlyDepartureMinutes: calc.earlyDepartureMinutes,
          overtimeMinutes: calc.overtimeMinutes,
          workedMinutes: calc.workedMinutes,
          status: calc.status,
          isException: calc.isException,
        };

        this.attendanceRecords.unshift(newRec);
        count++;
      }
    }
    return { importedCount: count };
  }

  // --- Leaves ---
  async getLeaveBalances(employeeId?: string): Promise<LeaveBalance[]> {
    if (employeeId) {
      return this.leaveBalances.filter((b) => b.employeeId === employeeId);
    }
    return [...this.leaveBalances];
  }

  async getLeaveRequests(params?: { branchId?: string; status?: string; employeeId?: string }): Promise<LeaveRequest[]> {
    let list = [...this.leaveRequests];
    if (params?.branchId && params.branchId !== 'all') {
      list = list.filter((r) => r.branchId === params.branchId);
    }
    if (params?.status && params.status !== 'all') {
      list = list.filter((r) => r.status === params.status);
    }
    if (params?.employeeId) {
      list = list.filter((r) => r.employeeId === params.employeeId);
    }
    return list;
  }

  async submitLeaveRequest(data: Partial<LeaveRequest>): Promise<LeaveRequest> {
    const emp = await this.getEmployeeById(data.employeeId || '');
    if (!emp) throw new Error('Əməkdaş tapılmadı');

    const newReq: LeaveRequest = {
      id: `leave-${Date.now()}`,
      employeeId: emp.id,
      employeeName: emp.fullName,
      department: emp.department,
      branchId: emp.branchId,
      branchName: emp.branchName,
      leaveType: data.leaveType || 'annual',
      startDate: data.startDate || '',
      endDate: data.endDate || '',
      totalDays: data.totalDays || 1,
      reason: data.reason || '',
      status: 'pending_manager',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.leaveRequests.unshift(newReq);
    return newReq;
  }

  async decideLeaveRequest(
    id: string,
    decision: 'approved' | 'rejected',
    level: 'manager' | 'hr',
    deciderName: string,
    note?: string
  ): Promise<LeaveRequest> {
    const idx = this.leaveRequests.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error('Məzuniyyət müraciəti tapılmadı');

    const req = this.leaveRequests[idx];

    if (decision === 'rejected') {
      req.status = 'rejected';
      if (level === 'manager') {
        req.managerApproverName = deciderName;
        req.managerDecisionDate = new Date().toISOString().slice(0, 10);
        req.managerDecisionNote = note;
      } else {
        req.hrApproverName = deciderName;
        req.hrDecisionDate = new Date().toISOString().slice(0, 10);
        req.hrDecisionNote = note;
      }
    } else {
      if (level === 'manager') {
        req.status = 'pending_hr'; // Advances to HR
        req.managerApproverName = deciderName;
        req.managerDecisionDate = new Date().toISOString().slice(0, 10);
        req.managerDecisionNote = note;
      } else {
        req.status = 'approved'; // Final approval!
        req.hrApproverName = deciderName;
        req.hrDecisionDate = new Date().toISOString().slice(0, 10);
        req.hrDecisionNote = note;

        // Recalculate employee leave balance
        const balIdx = this.leaveBalances.findIndex((b) => b.employeeId === req.employeeId);
        if (balIdx !== -1) {
          this.leaveBalances[balIdx] = recalculateLeaveBalance(
            this.leaveBalances[balIdx],
            req.totalDays,
            req.leaveType
          );
        }
      }
    }

    req.updatedAt = new Date().toISOString();
    this.leaveRequests[idx] = req;
    return req;
  }

  async getPublicHolidays(_year?: number): Promise<PublicHoliday[]> {
    return [...this.publicHolidays];
  }

  // --- Payroll ---
  async getPayrollPeriods(): Promise<PayrollPeriod[]> {
    return [...this.payrollPeriods];
  }

  async getPayrollPeriodById(id: string): Promise<{ period: PayrollPeriod; items: PayrollItem[] } | null> {
    const period = this.payrollPeriods.find((p) => p.id === id);
    if (!period) return null;
    const items = this.payrollItemsMap.get(id) || [];
    return { period, items };
  }

  async calculatePayrollRun(periodId: string, calculatedBy: string): Promise<{ period: PayrollPeriod; items: PayrollItem[] }> {
    const idx = this.payrollPeriods.findIndex((p) => p.id === periodId);
    if (idx === -1) throw new Error('Dövr tapılmadı');

    const period = this.payrollPeriods[idx];
    if (period.status === 'finalized' || period.status === 'paid') {
      throw new Error('Yekunlaşdırılmış əməkhaqqı dövrü yenidən hesablana bilməz.');
    }

    const items = this.employees.map((emp) =>
      calculateEmployeePayrollItem(period.id, emp, {
        normalScheduledHours: 160,
        actualWorkedHours: emp.id === 'emp-3' ? 168 : 160,
        overtimeHours: emp.id === 'emp-3' ? 8 : emp.id === 'emp-7' ? 10 : 0,
        salesRevenueQapik: emp.id === 'emp-4' ? toQapik(4500000) : toQapik(0),
        performanceBonusQapik: emp.id === 'emp-2' ? toQapik(20000) : toQapik(0),
      })
    );

    const totalGross = toQapik(items.reduce((s, i) => s + Number(i.grossSalaryQapik), 0));
    const totalDeductions = toQapik(items.reduce((s, i) => s + Number(i.totalDeductionsQapik), 0));
    const totalNet = toQapik(items.reduce((s, i) => s + Number(i.netSalaryQapik), 0));
    const totalEmployerCost = toQapik(items.reduce((s, i) => s + Number(i.totalEmployerCostQapik), 0));
    const branchAllocations = calculateBranchPayrollAllocations(items);
    const anomaliesCount = items.filter((i) => i.isAnomalous).length;

    const updatedPeriod: PayrollPeriod = {
      ...period,
      status: 'calculated',
      totalEmployees: items.length,
      totalGrossQapik: totalGross,
      totalDeductionsQapik: totalDeductions,
      totalNetQapik: totalNet,
      totalEmployerCostQapik: totalEmployerCost,
      branchAllocations,
      anomaliesCount,
      calculatedAt: new Date().toISOString(),
      calculatedBy,
      updatedAt: new Date().toISOString(),
    };

    this.payrollPeriods[idx] = updatedPeriod;
    this.payrollItemsMap.set(periodId, items);

    return { period: updatedPeriod, items };
  }

  async approvePayrollRun(periodId: string, approvedBy: string): Promise<PayrollPeriod> {
    const idx = this.payrollPeriods.findIndex((p) => p.id === periodId);
    if (idx === -1) throw new Error('Dövr tapılmadı');

    const period = this.payrollPeriods[idx];
    const updated: PayrollPeriod = {
      ...period,
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy,
      updatedAt: new Date().toISOString(),
    };

    this.payrollPeriods[idx] = updated;

    await this.logAuditEntry({
      userId: 'user',
      userName: approvedBy,
      action: 'payroll_finalize',
      details: `${period.name} əməkhaqqı cədvəli təsdiq edildi.`,
    });

    return updated;
  }

  async finalizePayrollRun(periodId: string, finalizedBy: string): Promise<PayrollPeriod> {
    const idx = this.payrollPeriods.findIndex((p) => p.id === periodId);
    if (idx === -1) throw new Error('Dövr tapılmadı');

    const period = this.payrollPeriods[idx];
    if (period.status !== 'approved') {
      throw new Error('Yekunlaşdırma üçün əvvəlcə rəhbərlik təsdiqi tələb olunur.');
    }

    const updated: PayrollPeriod = {
      ...period,
      status: 'finalized',
      finalizedAt: new Date().toISOString(),
      finalizedBy,
      updatedAt: new Date().toISOString(),
    };

    this.payrollPeriods[idx] = updated;

    await this.logAuditEntry({
      userId: 'user',
      userName: finalizedBy,
      action: 'payroll_finalize',
      details: `${period.name} əməkhaqqı yekunlaşdırıldı və kilidləndi. Düzəlişlər yalnız gələcək dövrə qeyd kimi aparıla bilər.`,
    });

    return updated;
  }

  async applyPayrollAdjustment(
    payrollItemId: string,
    amountQapik: Qapik,
    reason: string,
    appliedBy: string
  ): Promise<PayrollItem> {
    for (const items of this.payrollItemsMap.values()) {
      const idx = items.findIndex((i) => i.id === payrollItemId);
      if (idx !== -1) {
        const item = items[idx];
        const adjustment = {
          id: `adj-${Date.now()}`,
          payrollItemId,
          amountQapik,
          reason,
          appliedBy,
          appliedAt: new Date().toISOString(),
        };

        item.adjustments.push(adjustment);
        item.netSalaryQapik = toQapik(Number(item.netSalaryQapik) + Number(amountQapik));

        await this.logAuditEntry({
          userId: 'user',
          userName: appliedBy,
          action: 'payroll_finalize',
          targetEmployeeId: item.employeeId,
          targetEmployeeName: item.employeeName,
          details: `${item.employeeName} üçün maaş düzəlişi (${amountQapik} Qəpik). Səbəb: ${reason}`,
        });

        return item;
      }
    }
    throw new Error('Əməkhaqqı sətri tapılmadı');
  }

  // --- Audit ---
  async logAuditEntry(entry: Omit<HrAuditLogEntry, 'id' | 'timestamp'>): Promise<HrAuditLogEntry> {
    const log: HrAuditLogEntry = {
      ...entry,
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    this.auditLogs.unshift(log);
    return log;
  }

  async getAuditLogs(): Promise<HrAuditLogEntry[]> {
    return [...this.auditLogs];
  }
}

