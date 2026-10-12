import { Qapik, qapikToAzn } from './money';
export { toQapik, aznToQapik, qapikToAzn, type Qapik } from './money';

const TIMEZONE = 'Asia/Baku';
const LOCALE = 'az-AZ';

/**
 * Format money in AZN currency according to Brand House specification.
 * Required display format: "34.90 ₼"
 *
 * @param amount Amount in integer Qəpik (default) or decimal AZN if specified
 * @param fromQapik If true (default), amount is treated as integer Qəpik; if false, as AZN decimal
 */
export function formatMoney(amount: Qapik | number | null | undefined, fromQapik = true): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) {
    return '0.00 ₼';
  }

  const numericAzn = fromQapik ? qapikToAzn(amount) : Number(amount);

  // Use Intl.NumberFormat to guarantee exact "34.90 ₼" display format requested
  const formatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  });

  const formattedNumber = formatter.format(numericAzn);
  return `${formattedNumber} ₼`;
}

/**
 * Format date in DD.MM.YYYY format in Asia/Baku timezone.
 * Example: "10.10.2026"
 */
export function formatDate(date: Date | string | number | null | undefined): string {
  if (!date) return '-';

  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';

  const formatter = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return formatter.format(d);
}

/**
 * Format datetime in DD.MM.YYYY HH:mm format in Asia/Baku timezone with 24-hour clock.
 * Example: "10.10.2026 16:30"
 */
export function formatDateTime(
  date: Date | string | number | null | undefined,
  includeSeconds = false
): string {
  if (!date) return '-';

  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';

  const formatter = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    hour12: false,
  });

  return formatter.format(d).replace(',', '');
}

/**
 * Format quantity / item count with thousands separators.
 * Example: 1250 -> "1 250"
 */
export function formatQty(quantity: number | null | undefined): string {
  if (quantity === null || quantity === undefined || isNaN(Number(quantity))) {
    return '0';
  }

  return new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(quantity);
}

/**
 * Convert string to uppercase respecting Azerbaijani orthography rules:
 * - 'i' -> 'İ' (dotted capital I)
 * - 'ı' -> 'I' (dotless capital I)
 */
export function toAzerbaijaniUpper(text: string): string {
  if (!text) return '';
  return text.toLocaleUpperCase('az');
}

/**
 * Convert string to lowercase respecting Azerbaijani orthography rules:
 * - 'I' -> 'ı' (dotless lowercase i)
 * - 'İ' -> 'i' (dotted lowercase i)
 */
export function toAzerbaijaniLower(text: string): string {
  if (!text) return '';
  return text.toLocaleLowerCase('az');
}

