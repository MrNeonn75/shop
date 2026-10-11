import { PriceHistoryEntry } from '../types/catalog';
import { Qapik } from '../../../shared/utils/money';

/**
 * Pure lookup utility to find the authoritative price in effect at a given point in time.
 * Adheres to the principle that historical price updates NEVER rewrite past document prices.
 */
export function getPriceAtTime(
  history: PriceHistoryEntry[],
  atTime?: string | Date,
  fallbackPriceQapik: Qapik = 0 as Qapik
): { priceQapik: Qapik; entry: PriceHistoryEntry | null } {
  if (!history || history.length === 0) {
    return { priceQapik: fallbackPriceQapik, entry: null };
  }

  const targetDate = atTime ? new Date(atTime) : new Date();

  // Sort ascending to evaluate timeline
  const sorted = [...history].sort(
    (a, b) => new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime()
  );

  // Find all entries that took effect on or before the target date
  const applicable = sorted.filter(
    (e) => new Date(e.effectiveFrom).getTime() <= targetDate.getTime()
  );

  if (applicable.length > 0) {
    const activeEntry = applicable[applicable.length - 1];
    return { priceQapik: activeEntry.priceQapik, entry: activeEntry };
  }

  // If target date is before the earliest effectiveFrom, return the earliest entry
  return { priceQapik: sorted[0].priceQapik, entry: sorted[0] };
}

