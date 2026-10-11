import { describe, it, expect } from 'vitest';
import {
  toQapik,
  aznToQapik,
  qapikToAzn,
  qapikToAznString,
  addMoney,
  subtractMoney,
  multiplyMoney,
  divideMoney,
  calculateDiscount,
} from '../src/shared/utils/money';

describe('Integer Qəpik Money Arithmetic (No Floating-Point Errors)', () => {
  it('converts string AZN to integer Qəpik without floating-point imprecision', () => {
    // Classic IEEE 754 float failure: 34.90 * 100 in JavaScript is 3489.9999999999995
    expect(aznToQapik('34.90')).toBe(3490);
    expect(aznToQapik('0.10')).toBe(10);
    expect(aznToQapik('0.01')).toBe(1);
    expect(aznToQapik('149.99')).toBe(14999);
    expect(aznToQapik('150')).toBe(15000);
    expect(aznToQapik('150.5')).toBe(15050);
  });

  it('converts integer Qəpik back to fixed AZN string representation', () => {
    expect(qapikToAznString(toQapik(3490))).toBe('34.90');
    expect(qapikToAznString(toQapik(10))).toBe('0.10');
    expect(qapikToAznString(toQapik(5))).toBe('0.05');
    expect(qapikToAznString(toQapik(0))).toBe('0.00');
    expect(qapikToAznString(toQapik(12900))).toBe('129.00');
  });

  it('converts Qəpik to AZN decimal number accurately', () => {
    expect(qapikToAzn(toQapik(3490))).toBe(34.9);
    expect(qapikToAzn(toQapik(100))).toBe(1.0);
  });

  it('performs exact addition of monetary amounts in Qəpik', () => {
    // 0.10 AZN + 0.20 AZN = 0.30 AZN (10 qəpik + 20 qəpik = 30 qəpik)
    const a = aznToQapik('0.10');
    const b = aznToQapik('0.20');
    const sum = addMoney(a, b);
    expect(sum).toBe(30);
    expect(qapikToAznString(sum)).toBe('0.30');
  });

  it('performs exact subtraction of monetary amounts in Qəpik', () => {
    const a = aznToQapik('100.00');
    const b = aznToQapik('34.90');
    const diff = subtractMoney(a, b);
    expect(diff).toBe(6510);
    expect(qapikToAznString(diff)).toBe('65.10');
  });

  it('multiplies money by quantity with whole-qəpik rounding', () => {
    const itemPrice = aznToQapik('34.90'); // 3490 qəpik
    const total = multiplyMoney(itemPrice, 3);
    expect(total).toBe(10470);
    expect(qapikToAznString(total)).toBe('104.70');
  });

  it('divides money into installments or shares with proper rounding', () => {
    const total = aznToQapik('100.00'); // 10000 qəpik
    const share = divideMoney(total, 3); // 3333 qəpik
    expect(share).toBe(3333);
    expect(qapikToAznString(share)).toBe('33.33');
  });

  it('calculates percentage discounts accurately', () => {
    const original = aznToQapik('200.00'); // 20000 qəpik
    // 25% discount -> 150.00 AZN (15000 qəpik)
    const discounted = calculateDiscount(original, 25);
    expect(discounted).toBe(15000);
    expect(qapikToAznString(discounted)).toBe('150.00');
  });
});

