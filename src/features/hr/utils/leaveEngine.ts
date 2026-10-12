import { LeaveBalance, LeaveRequest, PublicHoliday } from '../types';

export interface LeaveDurationResult {
  calendarDays: number;
  workingDays: number;
}

/**
 * Calculates calendar days and working days between startDate and endDate (inclusive).
 * Excludes weekends and configurable public holidays.
 */
export function calculateLeaveDays(
  startDateStr: string,
  endDateStr: string,
  publicHolidays: PublicHoliday[] = []
): LeaveDurationResult {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  if (start > end) {
    throw new Error('Məzuniyyətin başlama tarixi bitmə tarixindən sonra ola bilməz.');
  }

  const holidayDateSet = new Set(
    publicHolidays.filter((h) => !h.isWorkingDay).map((h) => h.date)
  );

  let calendarDays = 0;
  let workingDays = 0;

  const current = new Date(start);
  while (current <= end) {
    calendarDays++;

    const dateStr = current.toISOString().slice(0, 10);
    const dayOfWeek = current.getDay(); // 0 is Sunday, 6 is Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = holidayDateSet.has(dateStr);

    if (!isWeekend && !isHoliday) {
      workingDays++;
    }

    current.setDate(current.getDate() + 1);
  }

  return {
    calendarDays,
    workingDays,
  };
}

/**
 * Calculates working days in interval excluding weekends and public holidays.
 */
export function calculateWorkingDaysInInterval(
  startDateStr: string,
  endDateStr: string,
  publicHolidays: PublicHoliday[] = []
): number {
  return calculateLeaveDays(startDateStr, endDateStr, publicHolidays).workingDays;
}

/**
 * Validates whether a leave request overlaps with any existing request for the same employee.
 */
export function validateLeaveRequestOverlap(
  employeeId: string,
  startDate: string,
  endDate: string,
  existingRequests: LeaveRequest[] = []
): { hasOverlap: boolean; conflictingRequest?: LeaveRequest } {
  const conflicting = existingRequests.find((ex) => {
    if (ex.employeeId !== employeeId) return false;
    if (ex.status === 'rejected' || ex.status === 'cancelled') return false;

    return startDate <= ex.endDate && endDate >= ex.startDate;
  });

  return {
    hasOverlap: !!conflicting,
    conflictingRequest: conflicting,
  };
}

/**
 * Validates whether a leave request can be submitted based on current balance
 * and checks for overlapping existing leave requests.
 */
export function validateLeaveRequest(
  request: {
    employeeId: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    totalDays: number;
  },
  currentBalance: LeaveBalance,
  existingRequests: LeaveRequest[] = []
): { isValid: boolean; error?: string } {
  if (request.startDate > request.endDate) {
    return { isValid: false, error: 'Başlama tarixi bitmə tarixindən sonra ola bilməz.' };
  }

  if (request.totalDays <= 0) {
    return { isValid: false, error: 'Məzuniyyət müddəti ən azı 1 gün olmalıdır.' };
  }

  // Check overlap with existing approved or pending requests
  const overlapCheck = validateLeaveRequestOverlap(
    request.employeeId,
    request.startDate,
    request.endDate,
    existingRequests
  );

  if (overlapCheck.hasOverlap) {
    return {
      isValid: false,
      error: 'Seçilmiş tarix aralığında əməkdaşın artıq mövcud məzuniyyət müraciəti var.',
    };
  }

  // Check balance for annual leave
  if (request.leaveType === 'annual') {
    if (request.totalDays > currentBalance.annualRemainingDays) {
      return {
        isValid: false,
        error: `Kifayət qədər əsas məzuniyyət balansı yoxdur. Qalıq: ${currentBalance.annualRemainingDays} gün, Tələb olunan: ${request.totalDays} gün.`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Recalculates leave balance. Supports either list of requests or individual deduction.
 */
export function recalculateLeaveBalance(
  balance: LeaveBalance,
  requests: LeaveRequest[]
): LeaveBalance;
export function recalculateLeaveBalance(
  balance: LeaveBalance,
  approvedDays: number,
  leaveType: string
): LeaveBalance;
export function recalculateLeaveBalance(
  balance: LeaveBalance,
  arg2: number | LeaveRequest[],
  arg3?: string
): LeaveBalance {
  if (Array.isArray(arg2)) {
    let annualUsed = 0;
    let unpaidUsed = 0;
    let sickUsed = 0;

    for (const req of arg2) {
      if (req.status === 'approved' || req.status === 'pending_hr') {
        if (req.leaveType === 'annual') annualUsed += req.totalDays;
        else if (req.leaveType === 'unpaid') unpaidUsed += req.totalDays;
        else if (req.leaveType === 'sick') sickUsed += req.totalDays;
      }
    }

    const annualRemaining = Math.max(0, balance.annualEntitledDays - annualUsed);
    return {
      ...balance,
      annualUsedDays: annualUsed,
      annualRemainingDays: annualRemaining,
      unpaidUsedDays: unpaidUsed,
      sickDaysUsed: sickUsed,
      lastRecalculatedAt: new Date().toISOString(),
    };
  } else {
    const approvedDays = arg2;
    const leaveType = arg3 || 'annual';
    if (leaveType === 'annual') {
      const newUsed = balance.annualUsedDays + approvedDays;
      const newRemaining = Math.max(0, balance.annualEntitledDays - newUsed);
      return {
        ...balance,
        annualUsedDays: newUsed,
        annualRemainingDays: newRemaining,
        lastRecalculatedAt: new Date().toISOString(),
      };
    }

    if (leaveType === 'unpaid') {
      return {
        ...balance,
        unpaidUsedDays: balance.unpaidUsedDays + approvedDays,
        lastRecalculatedAt: new Date().toISOString(),
      };
    }

    if (leaveType === 'sick') {
      return {
        ...balance,
        sickDaysUsed: balance.sickDaysUsed + approvedDays,
        lastRecalculatedAt: new Date().toISOString(),
      };
    }

    return balance;
  }
}
