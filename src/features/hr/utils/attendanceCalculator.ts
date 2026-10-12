import { AttendanceStatus } from '../types';

export interface AttendanceCalculationParams {
  scheduledStartTime?: string; // "09:00"
  scheduledEndTime?: string; // "18:00"
  checkInTime?: string; // "09:14"
  checkOutTime?: string; // "18:30"
  toleranceMinutes?: number; // default 15 mins
  breakMinutes?: number; // default 0 mins if not provided
}

export interface AttendanceCalculationResult {
  lateMinutes: number;
  earlyDepartureMinutes: number;
  overtimeMinutes: number;
  workedMinutes: number;
  workedHours: number;
  status: AttendanceStatus;
  isException: boolean;
  exceptionReason?: string;
}

export function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

export function formatMinutesToHoursAndMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}s ${m}d`;
}

export const minutesToHoursFormatted = formatMinutesToHoursAndMinutes;

/**
 * Calculates late arrival, early departure, overtime, and worked duration
 * comparing actual punches against scheduled shift with tolerance.
 * Supports both object params and positional params.
 */
export function calculateAttendance(
  params: AttendanceCalculationParams
): AttendanceCalculationResult;
export function calculateAttendance(
  scheduledStartTime?: string,
  scheduledEndTime?: string,
  checkInTime?: string,
  checkOutTime?: string,
  toleranceMinutes?: number,
  breakMinutes?: number
): AttendanceCalculationResult;
export function calculateAttendance(
  paramOrStart?: AttendanceCalculationParams | string,
  argScheduledEndTime?: string,
  argCheckInTime?: string,
  argCheckOutTime?: string,
  argToleranceMinutes?: number,
  argBreakMinutes?: number
): AttendanceCalculationResult {
  let scheduledStartTime: string | undefined;
  let scheduledEndTime: string | undefined;
  let checkInTime: string | undefined;
  let checkOutTime: string | undefined;
  let toleranceMinutes = 15;
  let breakMinutes = 0;

  if (typeof paramOrStart === 'object' && paramOrStart !== null) {
    scheduledStartTime = paramOrStart.scheduledStartTime;
    scheduledEndTime = paramOrStart.scheduledEndTime;
    checkInTime = paramOrStart.checkInTime;
    checkOutTime = paramOrStart.checkOutTime;
    toleranceMinutes = paramOrStart.toleranceMinutes ?? 15;
    breakMinutes = paramOrStart.breakMinutes ?? 0;
  } else {
    scheduledStartTime = paramOrStart;
    scheduledEndTime = argScheduledEndTime;
    checkInTime = argCheckInTime;
    checkOutTime = argCheckOutTime;
    toleranceMinutes = argToleranceMinutes ?? 15;
    breakMinutes = argBreakMinutes ?? 0;
  }

  // 1. Missing Punches / Absence
  if (!checkInTime && !checkOutTime) {
    return {
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
      overtimeMinutes: 0,
      workedMinutes: 0,
      workedHours: 0,
      status: 'absent',
      isException: true,
      exceptionReason: 'İşçi işə gəlməyib (Qayıb)',
    };
  }

  if (!checkInTime || !checkOutTime) {
    return {
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
      overtimeMinutes: 0,
      workedMinutes: 0,
      workedHours: 0,
      status: 'incomplete',
      isException: true,
      exceptionReason: !checkInTime
        ? 'Giriş qeydi çatışmır (Check-in)'
        : 'Çıxış qeydi çatışmır (Check-out)',
    };
  }

  const checkInMin = parseTimeToMinutes(checkInTime);
  const checkOutMin = parseTimeToMinutes(checkOutTime);

  let rawDuration = checkOutMin - checkInMin;
  if (rawDuration < 0) {
    // Overnight shift: add 24 hours (1440 mins)
    rawDuration += 1440;
  }

  const netWorkedMinutes = Math.max(0, rawDuration - breakMinutes);
  const workedHours = Number((netWorkedMinutes / 60).toFixed(2));

  let lateMinutes = 0;
  let earlyDepartureMinutes = 0;
  let overtimeMinutes = 0;

  if (scheduledStartTime && scheduledEndTime) {
    const schedStartMin = parseTimeToMinutes(scheduledStartTime);
    const schedEndMin = parseTimeToMinutes(scheduledEndTime);

    // Late arrival check (beyond tolerance)
    if (checkInMin > schedStartMin + toleranceMinutes) {
      lateMinutes = checkInMin - schedStartMin;
    }

    // Early departure check (leaving before scheduled end - tolerance)
    if (checkOutMin < schedEndMin - toleranceMinutes) {
      earlyDepartureMinutes = schedEndMin - checkOutMin;
    }

    // Overtime check (beyond scheduled end time)
    if (checkOutMin > schedEndMin) {
      overtimeMinutes = checkOutMin - schedEndMin;
    }
  }

  // Determine attendance status
  let status: AttendanceStatus = 'on_time';
  if (lateMinutes > 0) {
    status = 'late';
  } else if (earlyDepartureMinutes > 0) {
    status = 'early_leave';
  } else if (overtimeMinutes >= 30) {
    status = 'overtime';
  }

  const isException = lateMinutes >= 60 || earlyDepartureMinutes >= 60;
  const exceptionReason = isException
    ? `Ciddi kənarlaşma: ${lateMinutes >= 60 ? `${lateMinutes} dəqiqə gecikmə` : `${earlyDepartureMinutes} dəqiqə tez çıxış`}`
    : undefined;

  return {
    lateMinutes,
    earlyDepartureMinutes,
    overtimeMinutes,
    workedMinutes: netWorkedMinutes,
    workedHours,
    status,
    isException,
    exceptionReason,
  };
}
