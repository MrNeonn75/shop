import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfYear } from 'date-fns';
import { DatePreset } from '../types';

export interface PresetDateRange {
  preset: DatePreset;
  labelAz: string;
  startDate: string;
  endDate: string;
}

export function getDateRangeForPreset(preset: DatePreset, referenceDate = new Date()): { startDate: string; endDate: string } {
  const today = referenceDate;
  const formatDateStr = (d: Date) => format(d, 'yyyy-MM-dd');

  switch (preset) {
    case 'today':
      return {
        startDate: formatDateStr(today),
        endDate: formatDateStr(today),
      };

    case 'yesterday': {
      const yesterday = subDays(today, 1);
      return {
        startDate: formatDateStr(yesterday),
        endDate: formatDateStr(yesterday),
      };
    }

    case 'last_7_days': {
      const start = subDays(today, 6);
      return {
        startDate: formatDateStr(start),
        endDate: formatDateStr(today),
      };
    }

    case 'this_month': {
      const start = startOfMonth(today);
      return {
        startDate: formatDateStr(start),
        endDate: formatDateStr(today),
      };
    }

    case 'last_month': {
      const prevMonth = subMonths(today, 1);
      const start = startOfMonth(prevMonth);
      const end = endOfMonth(prevMonth);
      return {
        startDate: formatDateStr(start),
        endDate: formatDateStr(end),
      };
    }

    case 'this_year': {
      const start = startOfYear(today);
      return {
        startDate: formatDateStr(start),
        endDate: formatDateStr(today),
      };
    }

    case 'custom':
    default:
      return {
        startDate: formatDateStr(startOfMonth(today)),
        endDate: formatDateStr(today),
      };
  }
}

export const DATE_PRESETS: { preset: DatePreset; labelAz: string }[] = [
  { preset: 'today', labelAz: 'Bu gün' },
  { preset: 'yesterday', labelAz: 'Dünən' },
  { preset: 'last_7_days', labelAz: '7 gün' },
  { preset: 'this_month', labelAz: 'Bu ay' },
  { preset: 'last_month', labelAz: 'Keçən ay' },
  { preset: 'this_year', labelAz: 'Bu il' },
  { preset: 'custom', labelAz: 'Xüsusi' },
];

