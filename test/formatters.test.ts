import { describe, it, expect } from 'vitest';
import { formatMoney, formatDate, formatDateTime, formatQty } from '../src/shared/utils/formatters';
import { toQapik } from '../src/shared/utils/money';

describe('Shared Formatters (Intl & Azerbaijani Locale)', () => {
  describe('formatMoney', () => {
    it('formats integer Qəpik to "34.90 ₼" standard display format', () => {
      const qapik = toQapik(3490);
      const formatted = formatMoney(qapik);
      // Ensure it contains 34.90 and the Azerbaijani manat symbol ₼
      expect(formatted).toContain('34.90');
      expect(formatted).toContain('₼');
    });

    it('formats zero correctly as "0.00 ₼"', () => {
      expect(formatMoney(0)).toContain('0.00');
      expect(formatMoney(0)).toContain('₼');
    });

    it('handles null and undefined gracefully', () => {
      expect(formatMoney(null)).toBe('0.00 ₼');
      expect(formatMoney(undefined)).toBe('0.00 ₼');
    });

    it('formats large monetary amounts with proper grouping', () => {
      const largeQapik = toQapik(1250000); // 12,500.00 ₼
      const formatted = formatMoney(largeQapik);
      expect(formatted).toContain('12');
      expect(formatted).toContain('500.00');
      expect(formatted).toContain('₼');
    });
  });

  describe('formatDate', () => {
    it('formats date in DD.MM.YYYY format', () => {
      // 2026-10-10
      const date = new Date(Date.UTC(2026, 9, 10, 12, 0, 0));
      const result = formatDate(date);
      expect(result).toBe('10.10.2026');
    });

    it('handles invalid dates gracefully', () => {
      expect(formatDate('invalid-date')).toBe('-');
      expect(formatDate(null)).toBe('-');
    });
  });

  describe('formatDateTime', () => {
    it('formats datetime in DD.MM.YYYY HH:mm format in Asia/Baku timezone (24h time)', () => {
      // 2026-10-10 12:00:00 UTC is 16:00 in Asia/Baku (UTC+4)
      const date = new Date(Date.UTC(2026, 9, 10, 12, 0, 0));
      const result = formatDateTime(date);
      expect(result).toContain('10.10.2026');
      expect(result).toContain('16:00');
    });
  });

  describe('formatQty', () => {
    it('formats quantities with grouping separators', () => {
      expect(formatQty(1250)).toMatch(/1.*250/);
      expect(formatQty(5)).toBe('5');
      expect(formatQty(0)).toBe('0');
      expect(formatQty(null)).toBe('0');
    });
  });
});

