import { toQapik } from '../../../shared/utils/money';
import { CustomerReceivable, AgingBucketSummary } from '../types';

/**
 * Calculates customer receivables aging buckets (0–30, 31–60, 61–90, 90+ days)
 * against a reference date.
 */
export function calculateReceivablesAging(
  receivables: CustomerReceivable[],
  referenceDate: string | Date = new Date()
): AgingBucketSummary {
  const ref = typeof referenceDate === 'string' ? new Date(referenceDate) : referenceDate;
  const refTime = ref.getTime();

  let d0to30 = 0;
  let d31to60 = 0;
  let d61to90 = 0;
  let d90plus = 0;

  for (const item of receivables) {
    if (item.status === 'paid' || item.remainingAmountQapik <= 0) {
      continue;
    }

    const dueDate = new Date(item.dueDate);
    const diffMs = refTime - dueDate.getTime();
    const daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    const remaining = Number(item.remainingAmountQapik);

    if (daysOverdue <= 30) {
      d0to30 += remaining;
    } else if (daysOverdue <= 60) {
      d31to60 += remaining;
    } else if (daysOverdue <= 90) {
      d61to90 += remaining;
    } else {
      d90plus += remaining;
    }
  }

  const total = d0to30 + d31to60 + d61to90 + d90plus;

  return {
    days0To30Qapik: toQapik(d0to30),
    days31To60Qapik: toQapik(d31to60),
    days61To90Qapik: toQapik(d61to90),
    days90PlusQapik: toQapik(d90plus),
    totalQapik: toQapik(total),
  };
}
