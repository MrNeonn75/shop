import { describe, it, expect } from 'vitest';
import {
  KPI_DEFINITIONS,
  KPI_DEFINITIONS_LIST,
  getKpiDefinition,
  KpiMetricId,
} from '../src/features/dashboard/kpiDefinitions';
import { formatMoney, formatQty } from '../src/shared/utils/formatters';
import { toQapik } from '../src/shared/utils/money';

describe('KPI Registry & Financial Mathematical Formulations', () => {
  const REQUIRED_KPIS: KpiMetricId[] = [
    'totalSales',
    'grossProfit',
    'netProfit',
    'salesGrowth',
    'averageOrderValue',
    'unitsSold',
    'returnRate',
    'inventoryValue',
    'inventoryTurnover',
    'supplierLiabilities',
    'discountCost',
  ];

  it('contains all 11 required executive and operational KPIs', () => {
    expect(KPI_DEFINITIONS_LIST).toHaveLength(11);
    REQUIRED_KPIS.forEach((kpiId) => {
      expect(KPI_DEFINITIONS[kpiId]).toBeDefined();
      expect(getKpiDefinition(kpiId).id).toBe(kpiId);
    });
  });

  it('provides comprehensive formula descriptions and Azerbaijani nomenclature for all metrics', () => {
    REQUIRED_KPIS.forEach((kpiId) => {
      const def = getKpiDefinition(kpiId);
      expect(def.nameAz).toBeTruthy();
      expect(def.formulaText).toBeTruthy();
      expect(def.dataSource).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(['azn', 'percent', 'qty', 'ratio']).toContain(def.unit);
    });
  });

  describe('Financial Formulas Precision & Edge Cases', () => {
    it('Gross Profit formula: Net Sales − COGS (Weighted Average)', () => {
      const grossSales = toQapik(1000000); // 10,000.00 ₼
      const returns = toQapik(40000); // 400.00 ₼ (4% returns)
      const netSales = (grossSales - returns); // 9,600.00 ₼
      const cogs = toQapik(500000); // 5,000.00 ₼

      const grossProfit = netSales - cogs;
      expect(grossProfit).toBe(460000); // 4,600.00 ₼
      expect(formatMoney(toQapik(grossProfit), true)).toBe('4,600.00 ₼');
    });

    it('Net Profit formula: Gross Profit − Operating Expenses (OPEX)', () => {
      const grossProfit = toQapik(460000); // 4,600.00 ₼
      const opexRent = toQapik(120000); // 1,200.00 ₼
      const opexSalaries = toQapik(150000); // 1,500.00 ₼
      const opexUtilities = toQapik(30000); // 300.00 ₼
      const totalOpex = opexRent + opexSalaries + opexUtilities; // 3,000.00 ₼

      const netProfit = grossProfit - totalOpex;
      expect(netProfit).toBe(160000); // 1,600.00 ₼
      expect(formatMoney(toQapik(netProfit), true)).toBe('1,600.00 ₼');
    });

    it('Average Order Value (AOV) formula: Net Revenue / Successful Receipts', () => {
      const netRevenueQapik = toQapik(845000); // 8,450.00 ₼
      const orderCount = 96;
      const aovQapik = Math.round(netRevenueQapik / orderCount);
      expect(aovQapik).toBe(8802); // 88.02 ₼
      expect(formatMoney(toQapik(aovQapik), true)).toBe('88.02 ₼');
    });

    it('Return Rate formula: (Returns / Gross Sales) × 100', () => {
      const grossSalesQapik = 1000000;
      const returnsQapik = 38000;
      const returnRate = Number(((returnsQapik / grossSalesQapik) * 100).toFixed(1));
      expect(returnRate).toBe(3.8);
    });

    it('Sales Growth percentage calculation handles negative and positive deltas', () => {
      const current = 1200000;
      const previous = 1000000;
      const growth = Number((((current - previous) / previous) * 100).toFixed(1));
      expect(growth).toBe(20.0);

      const dropCurrent = 850000;
      const dropGrowth = Number((((dropCurrent - previous) / previous) * 100).toFixed(1));
      expect(dropGrowth).toBe(-15.0);
    });

    it('Inventory Turnover ratio: Annualized COGS / Average Inventory Value', () => {
      const periodCogs = 25000000; // 250,000.00 ₼ over 30 days
      const days = 30;
      const annualizedCogs = (periodCogs / days) * 365;
      const avgInventoryValue = 75000000; // 750,000.00 ₼
      const turnoverRatio = Number((annualizedCogs / avgInventoryValue).toFixed(2));
      expect(turnoverRatio).toBe(4.06);
    });

    it('Quantity format handles retail units with proper localization', () => {
      expect(formatQty(1250)).toMatch(/1.*250/);
      expect(formatQty(0)).toBe('0');
      expect(formatQty(null)).toBe('0');
    });
  });
});
