import { ScheduledShift, ShiftConflict } from '../types';
import { parseTimeToMinutes } from './attendanceCalculator';

export interface ConflictDetectionOptions {
  maxWeeklyHours?: number; // default 40 hours per week (AR Əmək Məcəlləsi)
  minRestIntervalHours?: number; // default 11 hours minimum rest between shifts
  requiredStaffPerHour?: Record<string, number>;
}

export function detectShiftConflicts(
  shifts: ScheduledShift[],
  options: ConflictDetectionOptions = {}
): ShiftConflict[] {
  const { maxWeeklyHours = 40, minRestIntervalHours = 11 } = options;
  const conflicts: ShiftConflict[] = [];

  // Group shifts by employee
  const employeeShiftsMap = new Map<string, ScheduledShift[]>();
  for (const shift of shifts) {
    const list = employeeShiftsMap.get(shift.employeeId) || [];
    list.push(shift);
    employeeShiftsMap.set(shift.employeeId, list);
  }

  // 1. Check per employee
  for (const [employeeId, empShifts] of employeeShiftsMap.entries()) {
    const employeeName = empShifts[0]?.employeeName || employeeId;

    // A. Weekly hours check
    const totalWeeklyHours = empShifts.reduce((sum, s) => sum + s.hours, 0);
    if (totalWeeklyHours > maxWeeklyHours) {
      conflicts.push({
        type: 'max_weekly_hours',
        severity: 'warning',
        employeeId,
        employeeName,
        message: `${employeeName}: Həftəlik planlaşdırılmış iş norması (${maxWeeklyHours} saat) aşıldı — cəmi ${totalWeeklyHours} saat.`,
      });
    }

    // Sort employee shifts chronologically
    const sorted = [...empShifts].sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      return a.startTime.localeCompare(b.startTime);
    });

    // B. Overlap check on same day
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const s1 = sorted[i];
        const s2 = sorted[j];

        if (s1.date === s2.date) {
          const s1Start = parseTimeToMinutes(s1.startTime);
          const s1End = parseTimeToMinutes(s1.endTime);
          const s2Start = parseTimeToMinutes(s2.startTime);
          const s2End = parseTimeToMinutes(s2.endTime);

          // Overlap condition
          if (s1Start < s2End && s2Start < s1End) {
            conflicts.push({
              type: 'overlap',
              severity: 'error',
              employeeId,
              employeeName,
              date: s1.date,
              message: `${employeeName} üçün ${s1.date} tarixində eyni gündə üst-üstə düşən növbələr aşkarlandı (${s1.startTime}–${s1.endTime} və ${s2.startTime}–${s2.endTime}).`,
            });
          }
        }
      }
    }

    // C. Insufficient rest interval between consecutive days
    for (let i = 0; i < sorted.length - 1; i++) {
      const s1 = sorted[i];
      const s2 = sorted[i + 1];

      // Check if dates are consecutive calendar days
      const d1 = new Date(s1.date);
      const d2 = new Date(s2.date);
      const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        const s1EndMin = parseTimeToMinutes(s1.endTime);
        const s2StartMin = parseTimeToMinutes(s2.startTime);
        // Interval: remaining mins from d1 end (1440 - s1EndMin) + d2 start mins (s2StartMin)
        const restMinutes = 1440 - s1EndMin + s2StartMin;
        const restHours = restMinutes / 60;

        if (restHours < minRestIntervalHours) {
          conflicts.push({
            type: 'insufficient_rest',
            severity: 'error',
            employeeId,
            employeeName,
            date: s2.date,
            message: `${employeeName}: Növbələrarası minimal istirahət intervalı (${restHours} saat) pozuldu (tələb: ${minRestIntervalHours} saat, ${s1.date} bitmə ${s1.endTime} -> ${s2.date} başlama ${s2.startTime}).`,
          });
        }
      }
    }
  }

  // 2. Branch coverage requirement check
  if (options.requiredStaffPerHour) {
    const dates = Array.from(new Set(shifts.map((s) => s.date)));
    for (const date of dates) {
      const coverageConflicts = checkHourlyStaffCoverage(shifts, options.requiredStaffPerHour, date);
      conflicts.push(...coverageConflicts);
    }
  }

  return conflicts;
}

export const detectScheduleConflicts = detectShiftConflicts;

export function checkHourlyStaffCoverage(
  shifts: ScheduledShift[],
  requiredStaffPerHour: Record<string, number>,
  date: string
): ShiftConflict[] {
  const warnings: ShiftConflict[] = [];
  const dayShifts = shifts.filter((s) => s.date === date);

  for (const [hourStr, requiredCount] of Object.entries(requiredStaffPerHour)) {
    const targetMin = parseTimeToMinutes(hourStr);
    const activeCount = dayShifts.filter((s) => {
      const startMin = parseTimeToMinutes(s.startTime);
      const endMin = parseTimeToMinutes(s.endTime);
      return startMin <= targetMin && targetMin < endMin;
    }).length;

    if (activeCount < requiredCount) {
      const deficit = requiredCount - activeCount;
      warnings.push({
        type: 'understaffed',
        severity: 'warning',
        date,
        message: `${date} saat ${hourStr} üçün tələb olunan minimum işçi sayı çatışmır (Tələb: ${requiredCount}, Mövcud: ${activeCount}). Çatışmazlıq: ${deficit} nəfər.`,
      });
    }
  }

  return warnings;
}
