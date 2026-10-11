/**
 * BRAND HOUSE ERP — Integer Qəpik Financial Handling
 *
 * CRITICAL RULE:
 * Money is NEVER stored or calculated using floating-point numbers in business logic.
 * All monetary amounts are represented as integer "Qəpik" (1 AZN = 100 Qəpik).
 * For example: 34.90 ₼ is represented internally as 3490 integer qəpiks.
 */

declare const __brand: unique symbol;

/**
 * Branded nominal type ensuring integer qəpik safety at compile time.
 */
export type Qapik = number & { readonly [__brand]: 'Qapik' };

/**
 * Creates a validated Qapik integer from an integer number.
 */
export function toQapik(amount: number): Qapik {
  if (!Number.isFinite(amount)) {
    throw new TypeError(`Invalid money amount: ${amount}`);
  }
  return Math.round(amount) as Qapik;
}

/**
 * Converts an AZN floating-point number or decimal string (e.g. 34.90 or "34.90") to integer Qəpik.
 * Safely parses string parts to eliminate IEEE-754 floating point inaccuracies.
 */
export function aznToQapik(azn: number | string): Qapik {
  if (typeof azn === 'string') {
    const clean = azn.trim().replace(/,/g, '.').replace(/[^\d.-]/g, '');
    if (!clean || isNaN(Number(clean))) return 0 as Qapik;

    const parts = clean.split('.');
    const integerPart = parseInt(parts[0] || '0', 10);
    const decimalPart = (parts[1] || '').padEnd(2, '0').slice(0, 2);
    const sign = integerPart < 0 || clean.startsWith('-') ? -1 : 1;
    const absInteger = Math.abs(integerPart);
    const cents = parseInt(decimalPart, 10);

    return (sign * (absInteger * 100 + cents)) as Qapik;
  }

  if (typeof azn === 'number') {
    if (!Number.isFinite(azn)) return 0 as Qapik;
    return Math.round(azn * 100) as Qapik;
  }

  return 0 as Qapik;
}

/**
 * Converts integer Qəpik to AZN decimal number (for display or chart calculations).
 */
export function qapikToAzn(qapik: Qapik | number): number {
  return Number(qapik) / 100;
}

/**
 * Converts integer Qəpik to fixed two-decimal string, e.g. 3490 -> "34.90"
 */
export function qapikToAznString(qapik: Qapik | number): string {
  const isNegative = qapik < 0;
  const abs = Math.abs(Math.round(qapik));
  const manat = Math.floor(abs / 100);
  const cents = (abs % 100).toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${manat}.${cents}`;
}

/**
 * Safe addition of monetary amounts in Qəpik.
 */
export function addMoney(a: Qapik | number, b: Qapik | number): Qapik {
  return toQapik(Math.round(a) + Math.round(b));
}

/**
 * Safe subtraction of monetary amounts in Qəpik.
 */
export function subtractMoney(a: Qapik | number, b: Qapik | number): Qapik {
  return toQapik(Math.round(a) - Math.round(b));
}

/**
 * Safe multiplication of monetary amount by a scalar multiplier (e.g. quantity or factor).
 * Always rounds to the nearest whole integer qəpik.
 */
export function multiplyMoney(amount: Qapik | number, multiplier: number): Qapik {
  return toQapik(Math.round(amount * multiplier));
}

/**
 * Safe division of monetary amount with whole qəpik rounding.
 */
export function divideMoney(amount: Qapik | number, divisor: number): Qapik {
  if (divisor === 0) {
    throw new Error('Division by zero in money calculation');
  }
  return toQapik(Math.round(amount / divisor));
}

/**
 * Calculates a percentage discount returning discounted amount in Qəpik.
 */
export function calculateDiscount(amount: Qapik | number, percent: number): Qapik {
  const discountQapik = Math.round((amount * percent) / 100);
  return toQapik(Math.max(0, amount - discountQapik));
}

